"""Disease Junior A pipeline adapter: multi-class DermNet condition classifier with calibrated abstention.

Implements Step 12:
1. Multi-class prediction across verified DermNet condition categories.
2. Calibrated probabilities via temperature scaling.
3. Top-3 probable conditions with non-diagnostic clinical labeling ("Possible condition: ...").
4. Evidence-based abstention when maximum class confidence falls below data-derived threshold.
5. Linear 8x8 spatial patch attribution decomposition for the top condition.

Adheres to Project Rules:
- Rule 1: No fake data or mock responses.
- Rule 3: Fails cleanly if model checkpoint is missing.
- Rule 10: Decision support only. A doctor makes the diagnosis.
"""

import json
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import cv2
import joblib
import numpy as np
from PIL import Image
import yaml

from app.schemas import DiseaseJuniorA, PatchScores

ROOT_DIR = Path(__file__).resolve().parent.parent.parent.parent
MODEL_PATH = ROOT_DIR / "models" / "disease" / "junior_a_classifier.joblib"
THRESHOLDS_PATH = ROOT_DIR / "ai-service" / "config" / "thresholds.json"
UI_TEXT_PATH = ROOT_DIR / "ai-service" / "config" / "ui_text.yaml"

DEFAULT_CLASSES = [
    "eczema",
    "psoriasis",
    "tinea_ringworm",
    "acne_vulgaris",
    "rosacea",
    "vitiligo",
]


class DiseaseJuniorAClassifier:
    """Multi-class dermatological disease classifier with selective abstention."""

    def __init__(self, model_path: Optional[Path] = None):
        self.model_path = model_path or MODEL_PATH
        self._model = None
        self._temperature: float = 1.0
        self._abstain_threshold: float = 0.40
        self._classes: List[str] = DEFAULT_CLASSES
        self._coef: Optional[np.ndarray] = None
        self._intercept: Optional[np.ndarray] = None
        self._ui_text: Dict[str, Any] = {}
        self._load_config()

    def _load_config(self):
        if THRESHOLDS_PATH.exists():
            try:
                with open(THRESHOLDS_PATH, "r", encoding="utf-8") as f:
                    cfg = json.load(f)
                self._abstain_threshold = float(
                    cfg.get("disease", {}).get("abstain_confidence", 0.40)
                )
            except Exception:
                pass

        if UI_TEXT_PATH.exists():
            try:
                with open(UI_TEXT_PATH, "r", encoding="utf-8") as f:
                    self._ui_text = yaml.safe_load(f) or {}
            except Exception:
                pass

    def is_ready(self) -> bool:
        return self.model_path.exists()

    def load_model(self):
        if not self.model_path.exists():
            raise FileNotFoundError(
                f"Disease classifier checkpoint not found at {self.model_path}"
            )

        payload = joblib.load(self.model_path)
        if isinstance(payload, dict):
            self._model = payload.get("model")
            self._temperature = float(payload.get("temperature", 1.0))
            self._abstain_threshold = float(payload.get("abstain_threshold", self._abstain_threshold))
            self._classes = list(payload.get("classes", DEFAULT_CLASSES))
            self._coef = np.array(payload.get("coef")) if payload.get("coef") is not None else None
            self._intercept = (
                np.array(payload.get("intercept")) if payload.get("intercept") is not None else None
            )
        else:
            self._model = payload
            if hasattr(self._model, "coef_"):
                self._coef = self._model.coef_
                self._intercept = self._model.intercept_
            if hasattr(self._model, "classes_"):
                self._classes = list(self._model.classes_)

    def predict(
        self,
        image: Image.Image,
        embedding: np.ndarray,
    ) -> Tuple[List[Dict[str, Any]], bool, str]:
        """Predict calibrated probabilities for disease categories.
        
        Returns (top_3_list, abstain_flag, top_class).
        """
        if self._model is None and self._coef is None:
            self.load_model()

        emb = np.array(embedding, dtype=np.float32)
        if emb.ndim == 1:
            emb = emb.reshape(1, -1)

        # Calibrated logits using temperature scaling
        if self._coef is not None and self._intercept is not None:
            logits = emb @ self._coef.T + self._intercept
            scaled_logits = logits / max(self._temperature, 0.05)
            shift = scaled_logits - np.max(scaled_logits, axis=-1, keepdims=True)
            exp_scores = np.exp(shift)
            probs = (exp_scores / np.sum(exp_scores, axis=-1, keepdims=True))[0]
        elif self._model is not None and hasattr(self._model, "predict_proba"):
            probs = self._model.predict_proba(emb)[0]
        else:
            raise FileNotFoundError("Trained disease classifier weights are not loaded.")

        probs = probs / np.sum(probs)
        prob_pairs = [(cls, float(p)) for cls, p in zip(self._classes, probs)]
        prob_pairs.sort(key=lambda x: x[1], reverse=True)

        top_class, max_prob = prob_pairs[0]
        abstain = max_prob < self._abstain_threshold

        prefix = self._ui_text.get("disease", {}).get("condition_prefix", "Possible condition")

        top_3 = []
        for cls, prob in prob_pairs[:3]:
            friendly_name = cls.replace("_", " ").title()
            top_3.append({
                "condition": cls,
                "probability": round(prob, 4),
                "label": f"{prefix}: {friendly_name}",
            })

        return top_3, abstain, top_class


_disease_classifier: Optional[DiseaseJuniorAClassifier] = None


def get_disease_classifier() -> DiseaseJuniorAClassifier:
    global _disease_classifier
    if _disease_classifier is None:
        _disease_classifier = DiseaseJuniorAClassifier()
    return _disease_classifier


def compute_disease_patch_scores(
    patch_tokens: np.ndarray,
    coef: np.ndarray,
    intercept: np.ndarray,
    classes: List[str],
    target_class: str,
    target_grid: Tuple[int, int] = (8, 8),
) -> PatchScores:
    """Compute 8x8 spatial linear decomposition attribution scores for the top disease class."""
    grid_h, grid_w, dim = patch_tokens.shape
    flat_patches = patch_tokens.reshape(-1, dim)

    patch_logits = flat_patches @ coef.T + (intercept / float(flat_patches.shape[0]))
    shift = patch_logits - np.max(patch_logits, axis=-1, keepdims=True)
    exp_logits = np.exp(shift)
    patch_probs = exp_logits / np.sum(exp_logits, axis=-1, keepdims=True)

    if target_class in classes:
        cls_idx = classes.index(target_class)
        cls_mass = patch_probs[:, cls_idx]
    else:
        cls_mass = np.max(patch_probs, axis=-1)

    cls_grid = cls_mass.reshape(grid_h, grid_w)

    rows, cols = target_grid
    pooled = cv2.resize(cls_grid.astype(np.float32), (cols, rows), interpolation=cv2.INTER_AREA)

    min_val, max_val = float(np.min(pooled)), float(np.max(pooled))
    if max_val > min_val:
        norm_grid = (pooled - min_val) / (max_val - min_val)
    else:
        norm_grid = pooled

    values = [[round(float(v), 3) for v in row] for row in norm_grid]
    return PatchScores(grid=[rows, cols], values=values)


def analyze_disease_junior_a(
    image: Image.Image,
    embedding: Optional[np.ndarray] = None,
    patch_tokens: Optional[np.ndarray] = None,
) -> DiseaseJuniorA:
    """Execute complete Disease Junior A clinical analysis."""
    classifier = get_disease_classifier()
    if not classifier.is_ready() or embedding is None:
        return DiseaseJuniorA(top_3=[], abstain=True, patch_scores=None)

    top_3, abstain, top_class = classifier.predict(image, embedding=embedding)

    patch_scores = None
    if (
        patch_tokens is not None
        and classifier._coef is not None
        and classifier._intercept is not None
    ):
        patch_scores = compute_disease_patch_scores(
            patch_tokens=patch_tokens,
            coef=classifier._coef,
            intercept=classifier._intercept,
            classes=classifier._classes,
            target_class=top_class,
            target_grid=(8, 8),
        )

    return DiseaseJuniorA(
        top_3=top_3,
        abstain=abstain,
        patch_scores=patch_scores,
    )
