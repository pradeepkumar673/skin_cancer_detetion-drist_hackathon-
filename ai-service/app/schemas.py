"""Pydantic v2 schemas mirroring the SkinSentry API contract.

Refer to docs/API_CONTRACT.md for response shapes and definitions.
"""

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class PatientContext(BaseModel):
    """Optional clinical context supplied with patient image."""

    age: Optional[int] = Field(None, description="Patient age in years")
    sex: Optional[str] = Field(None, description="Patient sex (male, female, other)")
    skin_type: Optional[str] = Field(None, description="Fitzpatrick skin type I to VI")
    body_site: Optional[str] = Field(None, description="Anatomical location of lesion")
    sun_exposure: Optional[str] = Field(None, description="History of sun exposure")
    family_history: Optional[bool] = Field(None, description="Family history of skin cancer")
    diabetic: Optional[bool] = Field(None, description="Whether patient has diabetes")
    px_per_cm: Optional[float] = Field(None, description="Pixel to centimeter calibration scale")


class ModelVersions(BaseModel):
    """Versions or commit hashes of loaded models."""

    backbone: str = Field(..., description="Backbone feature extractor model identifier")
    nurses: str = Field(..., description="Nurse gate models identifier")
    cancer: str = Field(..., description="Cancer pipeline model identifier")
    ulcer: str = Field(..., description="Ulcer pipeline model identifier")
    disease: str = Field(..., description="Skin disease pipeline model identifier")
    llm: str = Field(..., description="Explanation LLM model identifier")


class QualityResult(BaseModel):
    """Image quality assessment and camera feedback."""

    passed: bool = Field(..., description="Whether image passed quality screening")
    blur: float = Field(..., description="Laplacian variance blur score")
    brightness: float = Field(..., description="Mean image brightness score")
    contrast: float = Field(..., description="Image RMS contrast score")
    width: int = Field(..., description="Image width in pixels")
    height: int = Field(..., description="Image height in pixels")
    reasons: List[str] = Field(default_factory=list, description="Quality failure reasons")
    coach_tips: List[str] = Field(default_factory=list, description="Guidance for retaking image")


class NursePrediction(BaseModel):
    """Individual nurse domain gate prediction."""

    relevant: bool = Field(..., description="Whether image belongs to domain")
    score: float = Field(..., description="Domain relevance probability score")


class NursesResult(BaseModel):
    """Nurse gate classification results for all three domains."""

    ulcer: NursePrediction
    disease: NursePrediction
    cancer: NursePrediction


class PatchScores(BaseModel):
    """Spatial 8x8 patch-level feature or attention scores."""

    grid: List[int] = Field(default=[8, 8], description="Grid dimensions")
    values: List[List[float]] = Field(default_factory=list, description="2D grid of patch scores")
    reason: Optional[str] = Field(None, description="Reason if patch scores could not be computed")


class ABCDE(BaseModel):
    """Dermatological ABCDE assessment metrics."""

    asymmetry: float = Field(0.0, description="Lesion contour asymmetry index")
    border: float = Field(0.0, description="Border irregularity score")
    color: float = Field(0.0, description="Color variegation score")
    diameter_px: float = Field(0.0, description="Longest diameter in pixels")
    diameter_mm: Optional[float] = Field(None, description="Calculated diameter in millimeters")
    diameter_mm_reason: Optional[str] = Field(
        None, description="Reason if millimeter diameter is unavailable (e.g. no_scale)"
    )
    evolution: Optional[float] = Field(None, description="Evolution score based on prior image")
    evolution_reason: Optional[str] = Field(
        None, description="Reason if evolution score is unavailable (e.g. no_prior_image)"
    )


class CancerJuniorA(BaseModel):
    """Cancer Junior A classifier and lesion feature extractor."""

    class_probs: Dict[str, float] = Field(default_factory=dict, description="Class probability map")
    top_class: str = Field("", description="Highest probability lesion class")
    abcde: ABCDE
    mask_png_b64: str = Field("", description="Base64 encoded lesion segmentation mask")
    patch_scores: PatchScores
    detected_boxes: List[Dict[str, Any]] = Field(default_factory=list, description="Normalized bounding boxes of detected lesions/injuries")


class UglyDuckling(BaseModel):
    """Comparison against patient other lesions."""

    score: Optional[float] = Field(None, description="Outlier z-score compared to other lesions")
    reason: Optional[str] = Field("", description="Reason if ugly duckling score cannot be computed")


class ChangeOverTime(BaseModel):
    """Longitudinal change metrics against prior image."""

    score: Optional[float] = Field(None, description="Composite lesion evolution change score")
    area_change_pct: Optional[float] = Field(None, description="Percentage change in lesion area")
    color_delta_e: Optional[float] = Field(None, description="CIE Delta E color difference")
    border_compactness_change: Optional[float] = Field(None, description="Change in border compactness")
    cosine_distance: Optional[float] = Field(None, description="Feature embedding cosine distance")
    reason: Optional[str] = Field(None, description="Reason if change could not be computed")


class CancerJuniorB(BaseModel):
    """Cancer Junior B comparative analyst."""

    ugly_duckling: UglyDuckling
    change: Optional[ChangeOverTime] = Field(
        None, description="Change analysis relative to prior image"
    )
    patch_scores: Optional[PatchScores] = Field(
        None, description="Disagreement patch scores between current and prior or other lesions"
    )


class LikelihoodRange(BaseModel):
    """Calibrated probability estimate with bootstrap confidence range."""

    point: float = Field(..., description="Calibrated point estimate probability")
    low: float = Field(..., description="Lower confidence interval boundary")
    high: float = Field(..., description="Upper confidence interval boundary")


class CancerSenior(BaseModel):
    """Cancer Senior decision maker."""

    likelihood: LikelihoodRange
    band: str = Field(..., description="Risk band: low, moderate, high, or very_high")
    urgency: str = Field(..., description="Urgency: monitor, routine_visit, or urgent_visit")
    likely_types: List[str] = Field(default_factory=list, description="Suspected diagnostic categories")
    warning_signs: List[str] = Field(default_factory=list, description="Elevated ABCDE or outlier flags")
    reliability: Optional[str] = Field(None, description="Reliability indicator (e.g. reduced if OOD)")


class CancerTeamResult(BaseModel):
    """Cancer team comprehensive findings."""

    junior_a: CancerJuniorA
    junior_b: Optional[CancerJuniorB] = None
    senior: CancerSenior


class UlcerJuniorA(BaseModel):
    """Ulcer Junior A wound segmenter and tissue classifier."""

    mask_png_b64: str = Field("", description="Base64 encoded wound segmentation mask")
    area_px: float = Field(0.0, description="Wound area in pixels")
    area_cm2: Optional[float] = Field(None, description="Wound area in square centimeters")
    area_cm2_reason: Optional[str] = Field(None, description="Reason if cm2 area is unavailable")
    tissue: Dict[str, float] = Field(
        default_factory=dict,
        description="Fractions of granulation, slough, necrotic, and other tissue",
    )
    tissue_estimate_only: bool = Field(False, description="Whether tissue breakdown is heuristic")
    periwound_redness_ratio: Optional[float] = Field(None, description="Periwound erythema ratio")
    patch_scores: Optional[PatchScores] = None


class UlcerJuniorB(BaseModel):
    """Ulcer Junior B wound longitudinal tracking."""

    healing_trend: Optional[str] = Field(None, description="Trajectory: improving, stalled, worsening")
    area_change_pct: Optional[float] = Field(None, description="Percentage area reduction or increase")
    change_per_week: Optional[float] = Field(None, description="Rate of area change per week")
    reason: Optional[str] = Field(None, description="Reason if longitudinal trend cannot be computed")
    patch_scores: Optional[PatchScores] = None


class UlcerSenior(BaseModel):
    """Ulcer Senior decision maker."""

    trajectory: str = Field(..., description="Overall trajectory: healing, stalled, worsening, unknown")
    red_flags: List[str] = Field(default_factory=list, description="Clinical escalation triggers")
    urgency: str = Field(..., description="Recommended urgency: monitor, routine_visit, urgent_visit")
    warning_signs: List[str] = Field(default_factory=list, description="Clinical warnings detected")


class UlcerTeamResult(BaseModel):
    """Ulcer team comprehensive findings."""

    junior_a: UlcerJuniorA
    junior_b: Optional[UlcerJuniorB] = None
    senior: UlcerSenior


class DiseaseJuniorA(BaseModel):
    """Skin disease Junior A multi-class analyst."""

    top_3: List[Dict[str, Any]] = Field(default_factory=list, description="Top 3 probable conditions")
    abstain: bool = Field(False, description="Whether model abstains due to low confidence")
    patch_scores: Optional[PatchScores] = None


class DiseaseJuniorB(BaseModel):
    """Skin disease Junior B progression tracker."""

    progression: Optional[Dict[str, Any]] = Field(None, description="Disease progression metrics")
    reason: Optional[str] = Field(None, description="Reason if progression cannot be computed")
    patch_scores: Optional[PatchScores] = None


class DiseaseSenior(BaseModel):
    """Skin disease Senior decision maker."""

    top_conditions: List[Dict[str, Any]] = Field(default_factory=list, description="Validated conditions")
    abstain: bool = Field(False, description="Whether senior abstained from classification")
    urgency: str = Field("routine_visit", description="Recommended urgency")
    warning_signs: List[str] = Field(default_factory=list, description="Clinical warning indicators")


class DiseaseTeamResult(BaseModel):
    """Skin disease team comprehensive findings."""

    junior_a: DiseaseJuniorA
    junior_b: Optional[DiseaseJuniorB] = None
    senior: DiseaseSenior


class TeamsContainer(BaseModel):
    """Container for the three clinical analysis teams."""

    cancer: Optional[CancerTeamResult] = None
    ulcer: Optional[UlcerTeamResult] = None
    disease: Optional[DiseaseTeamResult] = None


class AgreementView(BaseModel):
    """Spatial agreement between Junior A and Junior B patch scores."""

    agree_cells: int = Field(0, description="Count of grid cells flagged by both models")
    disagree_cells: int = Field(0, description="Count of grid cells flagged by only one model")
    score: Optional[float] = Field(0.0, description="Jaccard agreement score across grid cells")
    reason: Optional[str] = Field(None, description="Reason if agreement cannot be computed")


class OODView(BaseModel):
    """Out-of-distribution detection metrics."""

    score: float = Field(0.0, description="Mahalanobis or distance score to training manifold")
    flagged: bool = Field(False, description="Whether image is considered out of distribution")
    reason: Optional[str] = Field(None, description="Explanation of out of distribution flag")


class SafetyResult(BaseModel):
    """Safety layer arbitration and risk gating."""

    decision: str = Field(..., description="Action decision: proceed, abstain, or escalate")
    agreement: AgreementView
    ood: OODView
    reasons: List[str] = Field(default_factory=list, description="Safety trigger reasons")


class ArbitrationResult(BaseModel):
    """Multi-team consensus and primary pathway selection."""

    primary_team: str = Field(..., description="Selected team: cancer, ulcer, disease, or none")
    notes: List[str] = Field(default_factory=list, description="Arbitration rationale notes")


class ExplanationResult(BaseModel):
    """Plain-language explanation generated by LLM from structured findings."""

    language: str = Field("en", description="Explanation language code")
    text: str = Field("", description="Structured clinical findings explanation")
    source: str = Field("groq", description="Explanation engine source: groq or template")
    validated: bool = Field(True, description="Whether text was validated against input facts")
    summary: Optional[str] = Field(None, description="Screening summary overview")
    key_findings: Optional[List[str]] = Field(None, description="List of key clinical observations")
    why_this_risk: Optional[str] = Field(None, description="Explanation of risk level")
    next_steps: Optional[List[str]] = Field(None, description="Recommended next actions")
    limitations: Optional[List[str]] = Field(None, description="Clinical disclaimers and limitations")



class ArtifactsResult(BaseModel):
    """Visual explanation and heatmap artifacts."""

    overlay_png_b64: str = Field("", description="Base64 encoded outline overlay image")
    heatmap_png_b64: str = Field("", description="Base64 encoded attention heatmap image")


class AnalysisResponse(BaseModel):
    """Complete analysis response matching docs/API_CONTRACT.md."""

    model_config = {"protected_namespaces": ()}

    request_id: str = Field(..., description="Unique request tracing identifier")
    model_versions: ModelVersions
    quality: QualityResult
    nurses: NursesResult
    teams: TeamsContainer
    safety: SafetyResult
    arbitration: ArbitrationResult
    explanation: ExplanationResult
    artifacts: ArtifactsResult


class ErrorResponse(BaseModel):
    """Standardized JSON error contract."""

    error: str = Field(..., description="Error code identifier")
    message: str = Field(..., description="Human-readable explanation of the error")
    request_id: Optional[str] = Field(None, description="Request tracking identifier")


class ModelStatus(BaseModel):
    """Status entry for a required model file."""

    name: str = Field(..., description="Relative model file name")
    exists: bool = Field(..., description="Whether model artifact exists on disk")


class HealthResponse(BaseModel):
    """Health check response schema."""

    status: str = Field("ok", description="Overall service status")
    device: str = Field(..., description="Compute execution device (cpu or cuda)")
    models: List[ModelStatus] = Field(default_factory=list, description="Status of required model files")
    python_version: str = Field(..., description="Host Python runtime version")
    package_versions: Dict[str, str] = Field(
        default_factory=dict, description="Key package versions installed"
    )
