"""Image quality gate for SkinSentry screening pipeline.

Assesses blur, brightness, contrast, and resolution against thresholds stored in config/thresholds.json.
Provides actionable coach tips from config/coach_tips.yaml.
"""

import json
from pathlib import Path
from typing import Dict, List, Optional
import cv2
import numpy as np
from PIL import Image
import yaml

from app.schemas import QualityResult

CONFIG_DIR = Path(__file__).resolve().parent.parent.parent / "config"


class QualityGate:
    """Evaluates input image quality against evidence-based thresholds."""

    def __init__(self, config_dir: Optional[Path] = None):
        self.config_dir = config_dir or CONFIG_DIR
        self._load_config()

    def _load_config(self):
        thresholds_path = self.config_dir / "thresholds.json"
        if not thresholds_path.exists():
            raise FileNotFoundError(f"Missing quality thresholds file: {thresholds_path}")

        with open(thresholds_path, "r", encoding="utf-8") as f:
            thresholds_data = json.load(f)
        self.quality_cfg = thresholds_data.get("quality", {})

        tips_path = self.config_dir / "coach_tips.yaml"
        if not tips_path.exists():
            raise FileNotFoundError(f"Missing coach tips file: {tips_path}")

        with open(tips_path, "r", encoding="utf-8") as f:
            tips_data = yaml.safe_load(f)
        self.tips_dict: Dict[str, str] = tips_data.get("tips", {})

    def assess_image(self, image: Image.Image) -> QualityResult:
        """Run image quality assessment and return QualityResult."""
        width, height = image.size

        # Convert to RGB numpy array
        img_rgb = np.array(image.convert("RGB"))

        # Convert to Grayscale and HSV
        img_gray = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2GRAY)
        img_hsv = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2HSV)

        # 1. Blur evaluation: Laplacian variance on resized image
        long_side = self.quality_cfg.get("fixed_resize_long_side", 512)
        h, w = img_gray.shape
        if max(h, w) > long_side:
            scale = long_side / max(h, w)
            new_w, new_h = int(w * scale), int(h * scale)
            resized_gray = cv2.resize(img_gray, (new_w, new_h), interpolation=cv2.INTER_AREA)
        else:
            resized_gray = img_gray

        laplacian_var = float(cv2.Laplacian(resized_gray, cv2.CV_64F).var())

        # 2. Brightness evaluation: Mean of V channel
        brightness_v = float(img_hsv[:, :, 2].mean())

        # 3. Contrast evaluation: Standard deviation of grayscale
        contrast_std = float(img_gray.std())

        # Check against thresholds
        reasons: List[str] = []
        min_blur = self.quality_cfg.get("min_blur_laplacian_var", 10.0)
        min_brightness = self.quality_cfg.get("min_brightness_v", 10.0)
        max_brightness = self.quality_cfg.get("max_brightness_v", 250.0)
        min_contrast = self.quality_cfg.get("min_contrast_std", 5.0)
        min_w = self.quality_cfg.get("min_width", 64)
        min_h = self.quality_cfg.get("min_height", 64)

        if laplacian_var < min_blur:
            reasons.append("blur_detected")
        if brightness_v < min_brightness:
            reasons.append("too_dark")
        elif brightness_v > max_brightness:
            reasons.append("too_bright")
        if contrast_std < min_contrast:
            reasons.append("low_contrast")
        if width < min_w or height < min_h:
            reasons.append("resolution_too_low")

        coach_tips = [self.tips_dict[r] for r in reasons if r in self.tips_dict]

        return QualityResult(
            passed=len(reasons) == 0,
            blur=round(laplacian_var, 2),
            brightness=round(brightness_v, 2),
            contrast=round(contrast_std, 2),
            width=width,
            height=height,
            reasons=reasons,
            coach_tips=coach_tips,
        )


# Singleton instance
_quality_gate: Optional[QualityGate] = None


def get_quality_gate() -> QualityGate:
    global _quality_gate
    if _quality_gate is None:
        _quality_gate = QualityGate()
    return _quality_gate


def assess_quality(image: Image.Image) -> QualityResult:
    """Assess image quality with default QualityGate."""
    return get_quality_gate().assess_image(image)
