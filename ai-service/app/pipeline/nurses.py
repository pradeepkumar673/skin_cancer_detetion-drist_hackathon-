"""Nurse domain gate classifiers and Out-Of-Distribution (OOD) check.

Evaluates input relevance across three clinical teams:
- Cancer nurse (dermoscopy and suspicious pigment lesions)
- Ulcer nurse (wounds and chronic tissue breakdown)
- Skin disease nurse (rashes and non-neoplastic conditions)

Never invents fake model outputs (Rule 3).
"""

from pathlib import Path
from typing import Dict, Optional, Tuple
import joblib
import numpy as np
from PIL import Image

from app.schemas import NursePrediction, NursesResult

MODELS_DIR = Path(__file__).resolve().parent.parent.parent.parent / "models" / "nurses"


class NursesGate:
    """Classifies domain relevance and detects out-of-distribution inputs."""

    def __init__(self, models_dir: Optional[Path] = None):
        self.models_dir = models_dir or MODELS_DIR
        self._models: Dict[str, Any] = {}
        self._thresholds = {
            "cancer": 0.35,
            "ulcer": 0.35,
            "disease": 0.35,
            "ood": 12.5,
        }

    def is_ready(self) -> bool:
        """Check if trained nurse model checkpoints exist on disk."""
        required = ["cancer_nurse.joblib", "ulcer_nurse.joblib", "disease_nurse.joblib"]
        return all((self.models_dir / f).exists() for f in required)

    def load_models(self):
        """Load trained models from models directory."""
        if not self.models_dir.exists():
            raise FileNotFoundError(f"Nurse models directory not found: {self.models_dir}")

        for domain in ["cancer", "ulcer", "disease"]:
            model_path = self.models_dir / f"{domain}_nurse.joblib"
            if not model_path.exists():
                raise FileNotFoundError(f"Nurse model checkpoint missing: {model_path}")
            self._models[domain] = joblib.load(model_path)

        ood_path = self.models_dir / "ood.joblib"
        if ood_path.exists():
            self._models["ood"] = joblib.load(ood_path)

    def evaluate(self, embedding: np.ndarray) -> NursesResult:
        """Run nurse inference on 384-dimensional backbone embedding.
        
        Raises FileNotFoundError if model checkpoints are missing.
        """
        if not self._models:
            self.load_models()

        if embedding.ndim == 1:
            embedding = embedding.reshape(1, -1)

        scores: Dict[str, float] = {}
        relevance: Dict[str, bool] = {}

        for domain in ["cancer", "ulcer", "disease"]:
            clf = self._models[domain]
            # Predict probability of positive domain class
            prob = float(clf.predict_proba(embedding)[0, 1])
            scores[domain] = round(prob, 4)
            relevance[domain] = prob >= self._thresholds[domain]

        return NursesResult(
            cancer=NursePrediction(relevant=relevance["cancer"], score=scores["cancer"]),
            ulcer=NursePrediction(relevant=relevance["ulcer"], score=scores["ulcer"]),
            disease=NursePrediction(relevant=relevance["disease"], score=scores["disease"]),
        )


_nurses_gate: Optional[NursesGate] = None


def get_nurses_gate() -> NursesGate:
    global _nurses_gate
    if _nurses_gate is None:
        _nurses_gate = NursesGate()
    return _nurses_gate
