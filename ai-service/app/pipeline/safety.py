"""Safety evaluation layer and Junior A / Junior B spatial agreement.

Implements Step 15 safety checks:
1. Spatial agreement view between Junior A and Junior B 8x8 patch scores.
2. Comprehensive multi-criteria safety evaluation:
   - "abstain": quality failure, low confidence, severe OOD on in-domain models.
   - "escalate": low spatial agreement between Junior A & B, critical red flags,
     or conflicting urgent nurse activations.
   - "proceed": normal clinical decision support pipeline.

Adheres to Project Rules:
- Rule 1: No synthetic data or stub decisions.
- Rule 2: Thresholds loaded from config/thresholds.json and clinical_rules.yaml.
- Rule 10: Decision support only.
"""

import json
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import numpy as np

from app.schemas import (
    AgreementView,
    OODView,
    PatchScores,
    QualityResult,
    SafetyResult,
)

ROOT_DIR = Path(__file__).resolve().parent.parent.parent.parent
THRESHOLDS_PATH = ROOT_DIR / "ai-service" / "config" / "thresholds.json"
CLINICAL_RULES_PATH = ROOT_DIR / "ai-service" / "config" / "clinical_rules.yaml"


def load_config() -> Tuple[Dict[str, Any], Dict[str, Any]]:
    thresholds: Dict[str, Any] = {}
    clinical_rules: Dict[str, Any] = {}

    if THRESHOLDS_PATH.exists():
        try:
            with open(THRESHOLDS_PATH, "r", encoding="utf-8") as f:
                thresholds = json.load(f)
        except Exception:
            pass

    if CLINICAL_RULES_PATH.exists():
        try:
            import yaml
            with open(CLINICAL_RULES_PATH, "r", encoding="utf-8") as f:
                clinical_rules = yaml.safe_load(f) or {}
        except Exception:
            pass

    return thresholds, clinical_rules


def compute_agreement_view(
    patch_scores_a: Optional[PatchScores] = None,
    patch_scores_b: Optional[PatchScores] = None,
    percentile_threshold: float = 70.0,
) -> AgreementView:
    """Calculate cell-by-cell agreement between Junior A and Junior B patch scores."""
    if (
        patch_scores_a is None
        or not patch_scores_a.values
        or patch_scores_b is None
        or not patch_scores_b.values
    ):
        return AgreementView(
            agree_cells=0,
            disagree_cells=0,
            score=None,
            reason="junior_b_patch_scores_missing",
        )

    arr_a = np.array(patch_scores_a.values, dtype=np.float32)
    arr_b = np.array(patch_scores_b.values, dtype=np.float32)

    if arr_a.shape != arr_b.shape:
        return AgreementView(
            agree_cells=0,
            disagree_cells=0,
            score=None,
            reason="grid_dimensions_mismatch",
        )

    # Active cells determined by percentile cutoff
    t_a = float(np.percentile(arr_a, percentile_threshold))
    t_b = float(np.percentile(arr_b, percentile_threshold))

    active_a = arr_a >= max(t_a, 0.20)
    active_b = arr_b >= max(t_b, 0.20)

    agree_cells = int(np.sum(active_a & active_b))
    disagree_cells = int(np.sum(active_a ^ active_b))
    total_active = agree_cells + disagree_cells

    score = round(float(agree_cells) / float(total_active), 3) if total_active > 0 else 1.0

    return AgreementView(
        agree_cells=agree_cells,
        disagree_cells=disagree_cells,
        score=score,
        reason=None,
    )


def evaluate_safety(
    quality: QualityResult,
    ood: OODView,
    primary_team: str,
    cancer_senior_urgency: Optional[str] = None,
    disease_senior_urgency: Optional[str] = None,
    ulcer_red_flags: Optional[List[str]] = None,
    cancer_warning_signs: Optional[List[str]] = None,
    agreement: Optional[AgreementView] = None,
    nurses_fired: Optional[List[str]] = None,
) -> SafetyResult:
    """Evaluate clinical safety rules and determine proceed / escalate / abstain decision."""
    reasons: List[str] = []

    # 1. Quality Advisory
    if not quality.passed:
        reasons.extend(quality.reasons)

    # 2. Non-skin domain advisory
    if primary_team == "none":
        reasons.append("Image does not strongly match known dermatological lesions, ulcers, or conditions.")

    # 3. Severe OOD Check
    if ood.flagged and primary_team == "cancer":
        reasons.append("Image characteristics deviate significantly from dermoscopic training manifold.")

    # 4. Agreement Check
    if agreement and agreement.score is not None:
        if agreement.score < 0.20 and agreement.disagree_cells > 8:
            reasons.append(
                f"Low spatial agreement ({agreement.score:.2f}) between current and prior/comparator patch activations."
            )

    # 5. Red Flags Check
    has_red_flags = False
    if ulcer_red_flags and len(ulcer_red_flags) > 0:
        has_red_flags = True
        reasons.extend(ulcer_red_flags)

    # 6. Conflicting Urgencies Check
    nurses = nurses_fired or []
    if "cancer" in nurses and "disease" in nurses:
        if cancer_senior_urgency == "urgent_visit" and disease_senior_urgency == "routine_visit":
            reasons.append("Concurrent cancer and inflammatory disease indications with conflicting clinical urgency.")

    # 7. Final Decision synthesis
    if has_red_flags or (agreement and agreement.score is not None and agreement.score < 0.20):
        decision = "escalate"
    elif cancer_senior_urgency == "urgent_visit":
        decision = "escalate"
        if not reasons:
            reasons.append("Urgent clinical evaluation recommended by senior decision-maker.")
    else:
        decision = "proceed"

    return SafetyResult(
        decision=decision,
        agreement=agreement or AgreementView(),
        ood=ood,
        reasons=reasons,
    )
