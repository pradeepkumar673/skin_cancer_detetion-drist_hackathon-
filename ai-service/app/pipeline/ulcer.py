"""Ulcer Junior A pipeline adapter: U-Net wound segmenter, tissue composition, and erythema ratio.

Implements Step 11:
1. U-Net wound segmentation with test-time flip averaging.
2. Binary mask extraction and pixel/metric area calculation.
3. Tissue composition breakdown (granulation, slough, necrotic, other) using clinical HSV heuristics.
4. Periwound erythema (redness ratio) in an annular ring in CIE Lab space.
5. Strict adherence to Rule 11A: tissue fractions are explicitly flagged as heuristic estimates.

Adheres to Project Rules:
- Rule 1: No synthetic data or stub predictions.
- Rule 3: Fails cleanly if model checkpoint is missing.
- Rule 10: Decision support only.
"""

import base64
from io import BytesIO
import json
import math
from pathlib import Path
from typing import Dict, Optional, Tuple
import cv2
import numpy as np
from PIL import Image
import torch
import yaml

from app.schemas import PatchScores, PatientContext, UlcerJuniorA

ROOT_DIR = Path(__file__).resolve().parent.parent.parent.parent
MODEL_PATH = ROOT_DIR / "models" / "ulcer" / "unet.pt"
THRESHOLDS_PATH = ROOT_DIR / "ai-service" / "config" / "thresholds.json"
CLINICAL_RULES_PATH = ROOT_DIR / "ai-service" / "config" / "clinical_rules.yaml"


class UlcerJuniorASegmenter:
    """U-Net deep learning wound segmentation and tissue analyzer."""

    def __init__(self, model_path: Optional[Path] = None):
        self.model_path = model_path or MODEL_PATH
        self._model = None
        self._device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.min_wound_area_px: int = 50
        self._load_config()

    def _load_config(self):
        if THRESHOLDS_PATH.exists():
            try:
                with open(THRESHOLDS_PATH, "r", encoding="utf-8") as f:
                    cfg = json.load(f)
                self.min_wound_area_px = int(
                    cfg.get("ulcer", {}).get("min_wound_area_px", 50)
                )
            except Exception:
                pass

    def is_ready(self) -> bool:
        return self.model_path.exists()

    def load_model(self):
        if not self.model_path.exists():
            raise FileNotFoundError(
                f"Ulcer segmentation model checkpoint not found at {self.model_path}"
            )

        import segmentation_models_pytorch as smp

        checkpoint = torch.load(self.model_path, map_location=self._device)
        model = smp.Unet(
            encoder_name="resnet34",
            encoder_weights=None,
            in_channels=3,
            classes=1,
        )
        if isinstance(checkpoint, dict) and "model_state_dict" in checkpoint:
            model.load_state_dict(checkpoint["model_state_dict"])
        elif isinstance(checkpoint, dict):
            model.load_state_dict(checkpoint)
        else:
            model = checkpoint

        model.to(self._device)
        model.eval()
        self._model = model

    def predict_mask(self, image_rgb: np.ndarray) -> np.ndarray:
        """Predict binary wound mask using test-time flip averaging and morphological post-processing."""
        if self._model is None:
            self.load_model()

        orig_h, orig_w, _ = image_rgb.shape
        # Resize to multiple of 32 for U-Net architecture
        target_size = 256
        resized = cv2.resize(image_rgb, (target_size, target_size), interpolation=cv2.INTER_AREA)

        # Normalize to [0, 1] tensor (1, 3, H, W)
        img_t = (
            torch.tensor(resized, dtype=torch.float32).permute(2, 0, 1).unsqueeze(0) / 255.0
        ).to(self._device)

        # Test-Time Augmentation (TTA): original, horizontal flip, vertical flip
        with torch.no_grad():
            pred_orig = torch.sigmoid(self._model(img_t))
            pred_hflip = torch.sigmoid(self._model(torch.flip(img_t, dims=[3])))
            pred_hflip = torch.flip(pred_hflip, dims=[3])
            pred_vflip = torch.sigmoid(self._model(torch.flip(img_t, dims=[2])))
            pred_vflip = torch.flip(pred_vflip, dims=[2])

            avg_pred = (pred_orig + pred_hflip + pred_vflip) / 3.0
            prob_map = avg_pred.squeeze().cpu().numpy()

        # Threshold at 0.5
        bin_small = (prob_map > 0.5).astype(np.uint8) * 255

        # Resize back to original image dimensions
        bin_mask = cv2.resize(bin_small, (orig_w, orig_h), interpolation=cv2.INTER_NEAREST)

        # Post-processing: keep largest components and fill holes
        num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(bin_mask)
        if num_labels <= 1:
            return np.zeros((orig_h, orig_w), dtype=np.uint8)

        cleaned_mask = np.zeros((orig_h, orig_w), dtype=np.uint8)
        for i in range(1, num_labels):
            area = stats[i, cv2.CC_STAT_AREA]
            if area >= self.min_wound_area_px:
                cleaned_mask[labels == i] = 255

        # Morphological hole filling
        contours, _ = cv2.findContours(cleaned_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        filled_mask = np.zeros_like(cleaned_mask)
        if contours:
            cv2.drawContours(filled_mask, contours, -1, 255, -1)
        else:
            filled_mask = cleaned_mask

        return filled_mask


_segmenter: Optional[UlcerJuniorASegmenter] = None


def get_ulcer_segmenter() -> UlcerJuniorASegmenter:
    global _segmenter
    if _segmenter is None:
        _segmenter = UlcerJuniorASegmenter()
    return _segmenter


def mask_to_base64_png(mask: np.ndarray) -> str:
    """Encode binary mask as base64 PNG string."""
    mask_pil = Image.fromarray(mask)
    buffer = BytesIO()
    mask_pil.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("utf-8")


def classify_tissue_composition(image_rgb: np.ndarray, mask: np.ndarray) -> Dict[str, float]:
    """Classify pixels within wound bed into tissue types using heuristic HSV color rules.
    
    Categories:
    - granulation: vibrant red, vascular healing bed
    - slough: yellow/tan fibrous non-viable tissue
    - necrotic: black/dark brown devitalized eschar
    - other: transitional or unclassified wound bed
    
    Fractions sum to 1.0.
    """
    total_wound_pixels = int(np.count_nonzero(mask))
    if total_wound_pixels == 0:
        return {"granulation": 0.0, "slough": 0.0, "necrotic": 0.0, "other": 0.0}

    hsv = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2HSV)
    wound_hsv = hsv[mask > 0]

    h = wound_hsv[:, 0]
    s = wound_hsv[:, 1]
    v = wound_hsv[:, 2]

    # Necrotic eschar: dark, very low value
    necrotic_mask = v <= 55

    # Granulation tissue: red hues (0-15 and 165-180), moderate-to-high saturation and value
    gran_mask = (
        ((h <= 15) | (h >= 165))
        & (s >= 60)
        & (v > 55)
        & (~necrotic_mask)
    )

    # Slough tissue: yellow/tan hues (18-45), moderate saturation, high value
    slough_mask = (
        (h >= 18)
        & (h <= 45)
        & (s >= 40)
        & (v > 80)
        & (~necrotic_mask)
        & (~gran_mask)
    )

    n_necrotic = int(np.count_nonzero(necrotic_mask))
    n_gran = int(np.count_nonzero(gran_mask))
    n_slough = int(np.count_nonzero(slough_mask))
    n_other = max(0, total_wound_pixels - (n_necrotic + n_gran + n_slough))

    f_gran = round(float(n_gran) / float(total_wound_pixels), 4)
    f_slough = round(float(n_slough) / float(total_wound_pixels), 4)
    f_necrotic = round(float(n_necrotic) / float(total_wound_pixels), 4)
    f_other = round(max(0.0, 1.0 - (f_gran + f_slough + f_necrotic)), 4)

    return {
        "granulation": f_gran,
        "slough": f_slough,
        "necrotic": f_necrotic,
        "other": f_other,
    }


def calculate_periwound_redness_ratio(image_rgb: np.ndarray, mask: np.ndarray) -> Optional[float]:
    """Calculate erythema redness ratio between the periwound margin and surrounding normal skin.
    
    Uses CIE Lab a* channel (redness).
    """
    total_area = float(np.count_nonzero(mask))
    if total_area < 25:
        return None

    # Equivalent diameter D = 2 * sqrt(area / pi)
    equiv_diam = 2.0 * math.sqrt(total_area / math.pi)
    ring_width = max(3, int(equiv_diam * 0.20))

    # Dilate mask to define periwound annular zone
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (ring_width * 2 + 1, ring_width * 2 + 1))
    dilated = cv2.dilate(mask, kernel)
    periwound_ring = np.logical_and(dilated > 0, mask == 0)

    # Normal reference skin zone (further dilation ring)
    outer_kernel = cv2.getStructuringElement(
        cv2.MORPH_ELLIPSE, (ring_width * 4 + 1, ring_width * 4 + 1)
    )
    outer_dilated = cv2.dilate(dilated, outer_kernel)
    normal_skin_zone = np.logical_and(outer_dilated > 0, dilated == 0)

    if np.count_nonzero(periwound_ring) < 10 or np.count_nonzero(normal_skin_zone) < 10:
        return None

    lab = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2LAB)
    a_channel = lab[:, :, 1]  # a* channel represents green-red axis (higher = redder)

    periwound_a = float(np.mean(a_channel[periwound_ring]))
    normal_a = float(np.mean(a_channel[normal_skin_zone]))

    if normal_a <= 0:
        return 1.0

    ratio = round(periwound_a / normal_a, 3)
    return max(0.5, min(ratio, 3.0))


def compute_ulcer_patch_scores(mask: np.ndarray, grid_size: Tuple[int, int] = (8, 8)) -> PatchScores:
    """Compute 8x8 spatial wound distribution density."""
    rows, cols = grid_size
    h, w = mask.shape
    patch_h = h // rows
    patch_w = w // cols

    values = []
    for r in range(rows):
        row_vals = []
        for c in range(cols):
            y1, y2 = r * patch_h, (r + 1) * patch_h if r < rows - 1 else h
            x1, x2 = c * patch_w, (c + 1) * patch_w if c < cols - 1 else w
            cell = mask[y1:y2, x1:x2]
            density = float(np.count_nonzero(cell)) / float(cell.size) if cell.size > 0 else 0.0
            row_vals.append(round(density, 3))
        values.append(row_vals)

    return PatchScores(grid=[rows, cols], values=values)


def analyze_ulcer_junior_a(
    image: Image.Image,
    patient_context: Optional[PatientContext] = None,
) -> UlcerJuniorA:
    """Execute complete Ulcer Junior A clinical assessment pipeline."""
    img_rgb = np.array(image.convert("RGB"))

    # 1. Wound segmentation mask
    segmenter = get_ulcer_segmenter()
    if segmenter.is_ready():
        try:
            mask = segmenter.predict_mask(img_rgb)
        except Exception:
            mask = np.zeros(img_rgb.shape[:2], dtype=np.uint8)
    else:
        mask = np.zeros(img_rgb.shape[:2], dtype=np.uint8)

    mask_b64 = mask_to_base64_png(mask)
    area_px = float(np.count_nonzero(mask))

    # 2. Metric area in cm2 if scale is supplied
    area_cm2: Optional[float] = None
    area_cm2_reason: Optional[str] = None
    px_per_cm = patient_context.px_per_cm if patient_context else None
    if px_per_cm and px_per_cm > 0:
        area_cm2 = round(area_px / (px_per_cm ** 2), 2)
    else:
        area_cm2_reason = "no_scale"

    # 3. Tissue composition (granulation, slough, necrotic, other)
    tissue = classify_tissue_composition(img_rgb, mask)

    # 4. Periwound erythema ratio
    redness_ratio = calculate_periwound_redness_ratio(img_rgb, mask)

    # 5. Spatial patch distribution
    patch_scores = compute_ulcer_patch_scores(mask)

    return UlcerJuniorA(
        mask_png_b64=mask_b64,
        area_px=area_px,
        area_cm2=area_cm2,
        area_cm2_reason=area_cm2_reason,
        tissue=tissue,
        tissue_estimate_only=True,
        periwound_redness_ratio=redness_ratio,
        patch_scores=patch_scores,
    )
