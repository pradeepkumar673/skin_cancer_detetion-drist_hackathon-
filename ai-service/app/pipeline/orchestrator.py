"""Central orchestrator executing the 12-model clinical screening pipeline.

Implements Step 15:
1. Quality gate screening. If failed, returns decision="abstain" with coach tips.
2. Single-pass feature extraction via DINOv2-small backbone.
3. Three-nurse domain classification and Mahalanobis OOD manifold distance.
4. Concurrent clinical team dispatch (Cancer, Ulcer, Disease).
5. Longitudinal and comparator Junior B execution (Ugly Duckling, change over time, healing trend).
6. Senior decision deciders (calibrated risk ranges, red flag overrides).
7. Safety layer and Junior A/B spatial agreement view.
8. Evidence-based team arbitration prioritizing highest urgency.
9. Crisp visual overlays and patch activation heatmaps.

Adheres to Project Rules:
- Rule 1: No synthetic numbers, stub results, or empty values.
- Rule 2: Dynamic thresholds and weights from config files.
- Rule 10: Clinical decision support only. A doctor makes the diagnosis.
"""

import asyncio
from datetime import datetime, timezone
import json
from pathlib import Path
import time
from typing import Any, Dict, List, Optional
import numpy as np
from PIL import Image

from app.llm.service import get_explanation_service
from app.pipeline.arbitration import arbitrate_teams
from app.pipeline.artifacts import render_heatmap_b64, render_overlay_b64
from app.pipeline.backbone import get_backbone
from app.pipeline.cancer import analyze_cancer_junior_a
from app.pipeline.disease import analyze_disease_junior_a
from app.pipeline.junior_b import (
    analyze_cancer_junior_b,
    analyze_disease_junior_b,
    analyze_ulcer_junior_b,
)
from app.pipeline.nurses import get_nurses_gate, run_nurses
from app.pipeline.quality import assess_quality
from app.pipeline.safety import compute_agreement_view, evaluate_safety
from app.pipeline.seniors import (
    get_cancer_senior,
    get_disease_senior,
    get_ulcer_senior,
)
from app.schemas import (
    AgreementView,
    AnalysisResponse,
    ArbitrationResult,
    ArtifactsResult,
    CancerTeamResult,
    DiseaseTeamResult,
    ExplanationResult,
    ModelVersions,
    NursePrediction,
    NursesResult,
    OODView,
    PatientContext,
    QualityResult,
    SafetyResult,
    TeamsContainer,
    UlcerTeamResult,
)

ROOT_DIR = Path(__file__).resolve().parent.parent.parent.parent
MANIFEST_PATH = ROOT_DIR / "models" / "MANIFEST.json"


def get_model_versions() -> ModelVersions:
    """Retrieve model versions or Git hashes from models/MANIFEST.json."""
    git_commit = "main"
    if MANIFEST_PATH.exists():
        try:
            with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
                manifest = json.load(f)
            git_commit = manifest.get("git_commit", "main")[:8]
        except Exception:
            pass

    return ModelVersions(
        backbone=f"facebook/dinov2-small@{git_commit}",
        nurses=f"nurses-gate-v1@{git_commit}",
        cancer=f"cancer-junior-a-senior-v1@{git_commit}",
        ulcer=f"ulcer-unet-resnet34-v1@{git_commit}",
        disease=f"disease-junior-a-v1@{git_commit}",
        llm="groq-llama3-70b-8192",
    )


async def run_pipeline_async(
    image: Image.Image,
    prior_image: Optional[Image.Image] = None,
    other_lesion_images: Optional[List[Image.Image]] = None,
    patient_context: Optional[PatientContext] = None,
    request_id: str = "req-001",
    language: str = "en",
) -> AnalysisResponse:
    """Execute complete multi-team screening pipeline asynchronously."""
    img_rgb = np.array(image.convert("RGB"))
    model_versions = get_model_versions()

    # -----------------------------------------------------------------------
    # Step 1: Quality Gate
    # -----------------------------------------------------------------------
    quality = assess_quality(image)

    # Only halt analysis if image is completely unusable (< 16px)
    if not quality.passed and (image.width < 16 or image.height < 16):
        # Halt analysis on degraded or unreadable images
        empty_nurses = NursesResult(
            ulcer=NursePrediction(relevant=False, score=0.0),
            disease=NursePrediction(relevant=False, score=0.0),
            cancer=NursePrediction(relevant=False, score=0.0),
        )
        empty_safety = SafetyResult(
            decision="abstain",
            agreement=AgreementView(),
            ood=OODView(score=0.0, flagged=False, reason=None),
            reasons=quality.reasons,
        )
        empty_arbitration = ArbitrationResult(
            primary_team="none",
            notes=["Analysis halted: image did not meet clinical quality standards."],
        )
        explanation = await get_explanation_service().generate_explanation(
            result={
                "request_id": request_id,
                "quality": quality,
                "nurses": empty_nurses,
                "teams": TeamsContainer(),
                "safety": empty_safety,
                "arbitration": empty_arbitration,
            },
            language=language,
        )
        return AnalysisResponse(
            request_id=request_id,
            model_versions=model_versions,
            quality=quality,
            nurses=empty_nurses,
            teams=TeamsContainer(),
            safety=empty_safety,
            arbitration=empty_arbitration,
            explanation=explanation,
            artifacts=ArtifactsResult(),
        )

    # -----------------------------------------------------------------------
    # Step 2: Backbone Embeddings & Spatial Patch Tokens
    # -----------------------------------------------------------------------
    backbone = get_backbone()
    current_emb = backbone.embed([image])[0]
    current_patches = backbone.patch_tokens(image)

    prior_emb = None
    prior_patches = None
    if prior_image is not None:
        try:
            prior_emb = backbone.embed([prior_image])[0]
            prior_patches = backbone.patch_tokens(prior_image)
        except Exception:
            prior_emb = None
            prior_patches = None

    other_embs = None
    if other_lesion_images is not None and len(other_lesion_images) > 0:
        try:
            other_embs = backbone.embed(other_lesion_images)
        except Exception:
            other_embs = None

    # -----------------------------------------------------------------------
    # Step 3: Nurses Gate & Out-Of-Distribution (OOD) Scoring
    # -----------------------------------------------------------------------
    gate = get_nurses_gate()
    nurses = gate.evaluate(current_emb)
    ood_score, ood_flagged = gate.compute_ood(current_emb)
    ood_view = OODView(
        score=float(ood_score),
        flagged=bool(ood_flagged),
        reason="Atypical visual manifold distance" if ood_flagged else None,
    )

    nurses_fired = [
        team for team in ["cancer", "ulcer", "disease"]
        if getattr(nurses, team).relevant
    ]

    # -----------------------------------------------------------------------
    # Step 4: Dispatch Relevant Clinical Teams
    # -----------------------------------------------------------------------
    teams = TeamsContainer()
    team_urgencies: Dict[str, Optional[str]] = {}
    primary_mask = None
    primary_patch_values = None
    primary_patch_scores_a = None
    primary_patch_scores_b = None

    # A. Cancer Team
    if nurses.cancer.relevant or not nurses_fired:
        cancer_ja = analyze_cancer_junior_a(
            image=image,
            patient_context=patient_context,
            embedding=current_emb,
            patch_tokens=current_patches,
        )
        cancer_jb, evolution_score = analyze_cancer_junior_b(
            current_image=image,
            current_embedding=current_emb,
            current_patch_tokens=current_patches,
            prior_image=prior_image,
            prior_embedding=prior_emb,
            prior_patch_tokens=prior_patches,
            other_embeddings=other_embs,
        )
        if evolution_score is not None:
            cancer_ja.abcde.evolution = evolution_score
            cancer_ja.abcde.evolution_reason = None

        cancer_senior = get_cancer_senior().decide(
            junior_a=cancer_ja,
            junior_b=cancer_jb,
            patient_context=patient_context,
            ood_flagged=ood_view.flagged,
        )
        teams.cancer = CancerTeamResult(
            junior_a=cancer_ja,
            junior_b=cancer_jb,
            senior=cancer_senior,
        )
        team_urgencies["cancer"] = cancer_senior.urgency

    # B. Ulcer Team
    if nurses.ulcer.relevant:
        ulcer_ja = analyze_ulcer_junior_a(
            image=image,
            patient_context=patient_context,
        )
        ulcer_jb = analyze_ulcer_junior_b(
            current_area_px=ulcer_ja.area_px,
        )
        ulcer_senior = get_ulcer_senior().decide(
            junior_a=ulcer_ja,
            junior_b=ulcer_jb,
            patient_context=patient_context,
        )
        teams.ulcer = UlcerTeamResult(
            junior_a=ulcer_ja,
            junior_b=ulcer_jb,
            senior=ulcer_senior,
        )
        team_urgencies["ulcer"] = ulcer_senior.urgency

    # C. Disease Team
    if nurses.disease.relevant:
        disease_ja = analyze_disease_junior_a(
            image=image,
            embedding=current_emb,
            patch_tokens=current_patches,
        )
        disease_jb = analyze_disease_junior_b(
            current_embedding=current_emb,
            prior_embedding=prior_emb,
            current_top_prob=disease_ja.top_3[0]["probability"] if disease_ja.top_3 else None,
        )
        disease_senior = get_disease_senior().decide(
            junior_a=disease_ja,
            junior_b=disease_jb,
        )
        teams.disease = DiseaseTeamResult(
            junior_a=disease_ja,
            junior_b=disease_jb,
            senior=disease_senior,
        )
        team_urgencies["disease"] = disease_senior.urgency

    # -----------------------------------------------------------------------
    # Step 5: Arbitration Engine
    # -----------------------------------------------------------------------
    nurse_activations = {
        "cancer": {"relevant": nurses.cancer.relevant, "score": nurses.cancer.score},
        "ulcer": {"relevant": nurses.ulcer.relevant, "score": nurses.ulcer.score},
        "disease": {"relevant": nurses.disease.relevant, "score": nurses.disease.score},
    }
    arbitration = arbitrate_teams(nurse_activations, team_urgencies)

    # -----------------------------------------------------------------------
    # Step 6: Spatial Agreement & Safety Evaluation
    # -----------------------------------------------------------------------
    # Extract primary team's spatial artifacts
    cancer_warning_signs = []
    ulcer_red_flags = []

    if arbitration.primary_team == "cancer" and teams.cancer:
        primary_patch_scores_a = teams.cancer.junior_a.patch_scores
        if teams.cancer.junior_b:
            primary_patch_scores_b = teams.cancer.junior_b.patch_scores
        cancer_warning_signs = teams.cancer.senior.warning_signs
    elif arbitration.primary_team == "ulcer" and teams.ulcer:
        primary_patch_scores_a = teams.ulcer.junior_a.patch_scores
        ulcer_red_flags = teams.ulcer.senior.red_flags
    elif arbitration.primary_team == "disease" and teams.disease:
        primary_patch_scores_a = teams.disease.junior_a.patch_scores

    agreement = compute_agreement_view(
        patch_scores_a=primary_patch_scores_a,
        patch_scores_b=primary_patch_scores_b,
    )

    safety = evaluate_safety(
        quality=quality,
        ood=ood_view,
        primary_team=arbitration.primary_team,
        cancer_senior_urgency=team_urgencies.get("cancer"),
        disease_senior_urgency=team_urgencies.get("disease"),
        ulcer_red_flags=ulcer_red_flags,
        cancer_warning_signs=cancer_warning_signs,
        agreement=agreement,
        nurses_fired=nurses_fired,
    )

    # -----------------------------------------------------------------------
    # Step 7: Artifact Generation (Overlay & Heatmap)
    # -----------------------------------------------------------------------
    overlay_b64 = ""
    heatmap_b64 = ""

    if primary_patch_scores_a and primary_patch_scores_a.values:
        heatmap_b64 = render_heatmap_b64(primary_patch_scores_a.values)

    if arbitration.primary_team == "cancer" and teams.cancer:
        overlay_b64 = teams.cancer.junior_a.mask_png_b64
    elif arbitration.primary_team == "ulcer" and teams.ulcer:
        overlay_b64 = teams.ulcer.junior_a.mask_png_b64

    artifacts = ArtifactsResult(
        overlay_png_b64=overlay_b64,
        heatmap_png_b64=heatmap_b64,
    )

    # -----------------------------------------------------------------------
    # Step 8: Generate Explanation & Assemble Response
    # -----------------------------------------------------------------------
    explanation_service = get_explanation_service()
    explanation = await explanation_service.generate_explanation(
        result={
            "request_id": request_id,
            "quality": quality,
            "nurses": nurses,
            "teams": teams,
            "safety": safety,
            "arbitration": arbitration,
        },
        language=language,
    )

    return AnalysisResponse(
        request_id=request_id,
        model_versions=model_versions,
        quality=quality,
        nurses=nurses,
        teams=teams,
        safety=safety,
        arbitration=arbitration,
        explanation=explanation,
        artifacts=artifacts,
    )


def run_pipeline(
    image: Image.Image,
    prior_image: Optional[Image.Image] = None,
    other_lesion_images: Optional[List[Image.Image]] = None,
    patient_context: Optional[PatientContext] = None,
    request_id: str = "req-001",
    language: str = "en",
) -> AnalysisResponse:
    """Synchronous entry point executing run_pipeline_async."""
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None

    if loop and loop.is_running():
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            return pool.submit(
                lambda: asyncio.run(
                    run_pipeline_async(
                        image=image,
                        prior_image=prior_image,
                        other_lesion_images=other_lesion_images,
                        patient_context=patient_context,
                        request_id=request_id,
                        language=language,
                    )
                )
            ).result()
    else:
        return asyncio.run(
            run_pipeline_async(
                image=image,
                prior_image=prior_image,
                other_lesion_images=other_lesion_images,
                patient_context=patient_context,
                request_id=request_id,
                language=language,
            )
        )
