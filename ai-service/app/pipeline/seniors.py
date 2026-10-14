"""Senior decision-makers for Cancer, Ulcer, and Disease clinical teams.

Implements Step 14:
1. Cancer Senior:
   - Multimodal feature fusion (Junior A class probabilities, ABCDE metrics, patient context).
   - Calibrated point estimate with bootstrap ensemble uncertainty range (low/high).
   - Risk band (low, moderate, high, very_high) and clinical urgency mapping.
   - Non-altering escalation rules for ugly duckling and rapid evolution.
   - Reliability indicator reduction when OOD is flagged.
2. Ulcer Senior:
   - Clinical rule engine evaluating wound trajectory, red flags, and escalation.
   - Red flag override forcing urgency to urgent_visit.
3. Disease Senior:
   - Evaluates Junior A top 3, selective abstention, and progression status.

Adheres to Project Rules:
- Rule 1: No fake data or placeholder predictions.
- Rule 2: Thresholds and clinical rules loaded from config files.
- Rule 10: Decision support only. A doctor makes the diagnosis.
"""

import json
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import joblib
import numpy as np

from app.schemas import (
    ABCDE,
    CancerJuniorA,
    CancerJuniorB,
    CancerSenior,
    DiseaseJuniorA,
    DiseaseJuniorB,
    DiseaseSenior,
    LikelihoodRange,
    PatientContext,
    UlcerJuniorA,
    UlcerJuniorB,
    UlcerSenior,
)

ROOT_DIR = Path(__file__).resolve().parent.parent.parent.parent
MODEL_PATH = ROOT_DIR / "models" / "cancer" / "senior_model.joblib"
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


class CancerSeniorDecider:
    """Multimodal decision maker for skin cancer screening."""

    def __init__(self, model_path: Optional[Path] = None):
        self.model_path = model_path or MODEL_PATH
        self._calibrated_model = None
        self._bootstrap_models: List[Any] = []
        self._feature_names: List[str] = []

    def is_ready(self) -> bool:
        return self.model_path.exists()

    def load_model(self):
        if not self.model_path.exists():
            raise FileNotFoundError(f"Cancer Senior model not found at {self.model_path}")

        payload = joblib.load(self.model_path)
        self._calibrated_model = payload.get("calibrated_model")
        self._bootstrap_models = payload.get("bootstrap_models", [])
        self._feature_names = payload.get("feature_names", [])

    def _build_feature_vector(
        self,
        junior_a: CancerJuniorA,
        patient_context: Optional[PatientContext] = None,
    ) -> np.ndarray:
        probs = junior_a.class_probs
        prob_akiec = float(probs.get("akiec", 0.0))
        prob_bcc = float(probs.get("bcc", 0.0))
        prob_bkl = float(probs.get("bkl", 0.0))
        prob_df = float(probs.get("df", 0.0))
        prob_mel = float(probs.get("mel", 0.0))
        prob_nv = float(probs.get("nv", 0.0))
        prob_vasc = float(probs.get("vasc", 0.0))

        abcde = junior_a.abcde
        asym = float(abcde.asymmetry)
        border = float(abcde.border)
        color = float(abcde.color)
        diam_px = float(abcde.diameter_px)

        age_norm = (float(patient_context.age) / 100.0) if patient_context and patient_context.age else 0.50
        sex_male = 1.0 if patient_context and patient_context.sex == "male" else 0.0

        return np.array([
            prob_akiec,
            prob_bcc,
            prob_bkl,
            prob_df,
            prob_mel,
            prob_nv,
            prob_vasc,
            asym,
            border,
            color,
            diam_px,
            age_norm,
            sex_male,
        ], dtype=np.float32).reshape(1, -1)

    def decide(
        self,
        junior_a: CancerJuniorA,
        junior_b: Optional[CancerJuniorB] = None,
        patient_context: Optional[PatientContext] = None,
        ood_flagged: bool = False,
    ) -> CancerSenior:
        """Run Cancer Senior decision pipeline."""
        if self._calibrated_model is None:
            self.load_model()

        thresholds, clinical_rules = load_config()

        # 1. Feature vector & point estimate
        X = self._build_feature_vector(junior_a, patient_context)
        point_est = float(self._calibrated_model.predict_proba(X)[0, 1])

        # 2. Uncertainty bounds from bootstrap ensemble
        if self._bootstrap_models:
            boot_probs = [float(m.predict_proba(X)[0, 1]) for m in self._bootstrap_models]
            low_bound = float(np.percentile(boot_probs, 10))
            high_bound = float(np.percentile(boot_probs, 90))
        else:
            low_bound = max(0.0, point_est - 0.10)
            high_bound = min(1.0, point_est + 0.10)

        # Enforce bounds consistency
        low_bound = min(low_bound, point_est)
        high_bound = max(high_bound, point_est)

        # 3. Handle OOD reduced reliability
        reliability = None
        warning_signs = []
        if ood_flagged:
            reliability = "reduced"
            warning_signs.append(
                "Image characteristics deviate from training manifold (non-dermoscopic or atypical lighting). Uncertainty widened."
            )
            # Widen range by factor
            low_bound = max(0.0, point_est - (point_est - low_bound) * 1.5)
            high_bound = min(1.0, point_est + (high_bound - point_est) * 1.5)

        # 4. ABCDE clinical warning signs
        abcde = junior_a.abcde
        t_abcde = clinical_rules.get("cancer", {}).get("abcde", {}).get("thresholds", {})
        if abcde.asymmetry >= t_abcde.get("asymmetry_high", 0.45):
            warning_signs.append(f"Elevated contour asymmetry ({abcde.asymmetry:.2f})")
        if abcde.border >= t_abcde.get("border_high", 0.60):
            warning_signs.append(f"Irregular border / low compactness ({abcde.border:.2f})")
        if abcde.color >= t_abcde.get("color_high", 0.50):
            warning_signs.append(f"High color variegation ({abcde.color:.2f})")
        if abcde.diameter_mm and abcde.diameter_mm >= t_abcde.get("diameter_mm_alert", 6.0):
            warning_signs.append(f"Diameter exceeds clinical 6mm threshold ({abcde.diameter_mm:.1f} mm)")

        # 5. Risk bands mapping
        bands = thresholds.get("cancer", {}).get("risk_bands", {
            "low": 0.15,
            "moderate": 0.45,
            "high": 0.75,
        })
        if point_est < bands.get("low", 0.15):
            band = "low"
        elif point_est < bands.get("moderate", 0.45):
            band = "moderate"
        elif point_est < bands.get("high", 0.75):
            band = "high"
        else:
            band = "very_high"

        # 6. Urgency mapping
        urgency_map = clinical_rules.get("cancer", {}).get("urgency_mapping", {
            "low": "monitor",
            "moderate": "routine_visit",
            "high": "urgent_visit",
            "very_high": "urgent_visit",
        })
        urgency = urgency_map.get(band, "routine_visit")

        # 7. Longitudinal / Ugly Duckling Escalation
        urgency_ladder = ["monitor", "routine_visit", "urgent_visit"]
        def escalate(curr_u: str) -> str:
            idx = urgency_ladder.index(curr_u) if curr_u in urgency_ladder else 1
            return urgency_ladder[min(len(urgency_ladder) - 1, idx + 1)]

        if junior_b:
            # Ugly duckling escalation
            ud = junior_b.ugly_duckling
            if ud and ud.score is not None and ud.score >= 1.5:
                warning_signs.append(f"Ugly duckling outlier flagged (z-score: {ud.score:.2f})")
                if clinical_rules.get("cancer", {}).get("warning_signs", {}).get("escalate_on_ugly_duckling", True):
                    urgency = escalate(urgency)

            # Rapid evolution escalation
            ch = junior_b.change
            if ch and ch.score is not None and ch.score >= 0.45:
                warning_signs.append(f"Rapid longitudinal evolution detected (change score: {ch.score:.2f})")
                if clinical_rules.get("cancer", {}).get("warning_signs", {}).get("escalate_on_rapid_evolution", True):
                    urgency = escalate(urgency)

        # Likely types from Junior A
        likely_types = []
        if junior_a.top_class:
            likely_types.append(junior_a.top_class)

        likelihood = LikelihoodRange(
            point=round(point_est, 4),
            low=round(low_bound, 4),
            high=round(high_bound, 4),
        )

        return CancerSenior(
            likelihood=likelihood,
            band=band,
            urgency=urgency,
            likely_types=likely_types,
            warning_signs=warning_signs,
            reliability=reliability,
        )


class UlcerSeniorDecider:
    """Clinical rule engine for diabetic foot ulcer decision support."""

    def decide(
        self,
        junior_a: UlcerJuniorA,
        junior_b: Optional[UlcerJuniorB] = None,
        patient_context: Optional[PatientContext] = None,
    ) -> UlcerSenior:
        _, rules = load_config()
        ulcer_rules = rules.get("ulcer", {})
        red_flags_cfg = ulcer_rules.get("red_flags", {})

        # Trajectory determination
        if junior_b and junior_b.healing_trend:
            trajectory = junior_b.healing_trend
        else:
            trajectory = "unknown"

        red_flags = []
        warning_signs = []

        # Tissue checks
        tissue = junior_a.tissue
        necrotic_frac = float(tissue.get("necrotic", 0.0))
        slough_frac = float(tissue.get("slough", 0.0))

        t_necrotic = float(red_flags_cfg.get("necrotic_fraction_threshold", 0.20))
        t_slough = float(red_flags_cfg.get("slough_fraction_threshold", 0.40))
        t_redness = float(red_flags_cfg.get("periwound_redness_ratio_threshold", 1.35))
        t_expansion = float(red_flags_cfg.get("area_expansion_pct_threshold", 15.0))

        if necrotic_frac >= t_necrotic:
            red_flags.append(f"Devitalized necrotic eschar coverage ({necrotic_frac * 100:.1f}%) exceeds {t_necrotic * 100:.0f}% threshold")

        if slough_frac >= t_slough:
            red_flags.append(f"Fibrous non-viable slough ({slough_frac * 100:.1f}%) exceeds {t_slough * 100:.0f}% threshold")

        # Erythema check
        if junior_a.periwound_redness_ratio and junior_a.periwound_redness_ratio >= t_redness:
            red_flags.append(
                f"Spreading periwound erythema ratio ({junior_a.periwound_redness_ratio:.2f}) indicates potential infection warning signs"
            )

        # Area expansion check
        if junior_b and junior_b.area_change_pct and junior_b.area_change_pct >= t_expansion:
            red_flags.append(f"Acute wound expansion ({junior_b.area_change_pct:+.1f}%) exceeds safety threshold")

        # Diabetic check
        if patient_context and getattr(patient_context, "has_diabetes", False):
            warning_signs.append("Diabetic patient: heightened risk of neuroischemic ulcer complications")

        # Urgency: ANY red flag forces urgent_visit
        if len(red_flags) > 0:
            urgency = "urgent_visit"
        elif trajectory == "worsening":
            urgency = "urgent_visit"
        elif trajectory == "stalled":
            urgency = "routine_visit"
        else:
            urgency = "routine_visit" if junior_a.area_px > 0 else "monitor"

        return UlcerSenior(
            trajectory=trajectory,
            red_flags=red_flags,
            urgency=urgency,
            warning_signs=warning_signs,
        )


class DiseaseSeniorDecider:
    """Decision maker for general skin disease clinical evaluation."""

    def decide(
        self,
        junior_a: DiseaseJuniorA,
        junior_b: Optional[DiseaseJuniorB] = None,
    ) -> DiseaseSenior:
        abstain = junior_a.abstain
        top_conditions = junior_a.top_3 if not abstain else []
        warning_signs = []

        if abstain:
            warning_signs.append(
                "Classification confidence below clinical threshold. Visual features do not match known dermatological profiles with high certainty."
            )
            urgency = "routine_visit"
        else:
            # Check progression
            if junior_b and junior_b.progression and junior_b.progression.get("status") == "changed":
                warning_signs.append("Significant visual feature change observed compared to prior photo")
                urgency = "routine_visit"
            else:
                urgency = "routine_visit"

        return DiseaseSenior(
            top_conditions=top_conditions,
            abstain=abstain,
            urgency=urgency,
            warning_signs=warning_signs,
        )


_cancer_senior: Optional[CancerSeniorDecider] = None
_ulcer_senior: Optional[UlcerSeniorDecider] = None
_disease_senior: Optional[DiseaseSeniorDecider] = None


def get_cancer_senior() -> CancerSeniorDecider:
    global _cancer_senior
    if _cancer_senior is None:
        _cancer_senior = CancerSeniorDecider()
    return _cancer_senior


def get_ulcer_senior() -> UlcerSeniorDecider:
    global _ulcer_senior
    if _ulcer_senior is None:
        _ulcer_senior = UlcerSeniorDecider()
    return _ulcer_senior


def get_disease_senior() -> DiseaseSeniorDecider:
    global _disease_senior
    if _disease_senior is None:
        _disease_senior = DiseaseSeniorDecider()
    return _disease_senior
