"""Cancer Junior A pipeline adapter and ABCDE dermatological analyzer.

Implements:
1. Lesion segmentation mask extraction using morphology and contour detection
2. Clinical ABCDE metrics (Asymmetry, Border, Color variegation, Diameter)
3. 8x8 spatial patch activation scores
4. 7-class lesion classification (mel, nv, bcc, akiec, bkl, df, vasc)

Follows Rule 3: Never invents synthetic model predictions.
"""

import base64
from io import BytesIO
import math
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import cv2
import joblib
import numpy as np
from PIL import Image

from app.schemas import ABCDE, CancerJuniorA, PatchScores, PatientContext

MODELS_DIR = Path(__file__).resolve().parent.parent.parent.parent / "models" / "cancer"

HAM10000_CLASSES = ["akiec", "bcc", "bkl", "df", "mel", "nv", "vasc"]


def extract_lesion_mask(image_rgb: np.ndarray) -> np.ndarray:
    """Extract a binary lesion mask using color contrast and morphological operations.
    
    Returns a binary uint8 array (255 for lesion, 0 for background).
    """
    h, w, _ = image_rgb.shape

    # Convert to grayscale
    gray = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2GRAY)

    # Blur to suppress hair and small skin textures
    blurred = cv2.GaussianBlur(gray, (15, 15), 0)

    # Otsu thresholding with inverse (lesions are typically darker than surrounding skin)
    _, thresh = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

    # Morphological opening and closing to remove noise and fill holes
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
    opened = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel)
    closed = cv2.morphologyEx(opened, cv2.MORPH_CLOSE, kernel)

    # Find the largest connected component nearest to the center
    num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(closed)
    if num_labels <= 1:
        # If no foreground found, create a small central circular fallback region
        mask = np.zeros((h, w), dtype=np.uint8)
        cv2.circle(mask, (w // 2, h // 2), min(w, h) // 6, 255, -1)
        return mask

    center_x, center_y = w / 2.0, h / 2.0
    best_label = 1
    best_score = -1.0

    for i in range(1, num_labels):
        area = stats[i, cv2.CC_STAT_AREA]
        # Ignore tiny specks or enormous borders taking up >90% of image
        if area < 50 or area > (h * w * 0.9):
            continue
        cx, cy = centroids[i]
        dist_from_center = math.hypot(cx - center_x, cy - center_y)
        max_dist = math.hypot(center_x, center_y)
        center_proximity = 1.0 - (dist_from_center / max_dist)
        # Score balances area and center proximity
        score = (area ** 0.5) * (center_proximity ** 1.5)
        if score > best_score:
            best_score = score
            best_label = i

    mask = np.where(labels == best_label, 255, 0).astype(np.uint8)

    # Hole filling
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    filled_mask = np.zeros_like(mask)
    if contours:
        cv2.drawContours(filled_mask, contours, -1, 255, -1)
    else:
        filled_mask = mask

    return filled_mask


def mask_to_base64_png(mask: np.ndarray) -> str:
    """Encode a binary mask as base64 PNG."""
    mask_pil = Image.fromarray(mask)
    buffer = BytesIO()
    mask_pil.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("utf-8")


def compute_abcde_features(
    mask: np.ndarray,
    image_rgb: np.ndarray,
    px_per_cm: Optional[float] = None,
) -> ABCDE:
    """Calculate dermatological ABCDE metrics from lesion mask and RGB image."""
    h, w = mask.shape
    area = float(np.count_nonzero(mask))
    if area < 10:
        return ABCDE(
            asymmetry=0.0,
            border=0.0,
            color=0.0,
            diameter_px=0.0,
            diameter_mm=None,
            diameter_mm_reason="lesion_too_small",
            evolution=None,
            evolution_reason="no_prior_image",
        )

    # 1. Asymmetry: Complement of IoU when flipped along horizontal and vertical axes
    flipped_h = np.fliplr(mask)
    flipped_v = np.flipud(mask)

    def mask_iou(m1: np.ndarray, m2: np.ndarray) -> float:
        intersection = np.logical_and(m1 > 0, m2 > 0).sum()
        union = np.logical_or(m1 > 0, m2 > 0).sum()
        return float(intersection) / float(union) if union > 0 else 1.0

    iou_h = mask_iou(mask, flipped_h)
    iou_v = mask_iou(mask, flipped_v)
    asymmetry_score = round(1.0 - ((iou_h + iou_v) / 2.0), 3)

    # 2. Border irregularity: Compactness + (1 - Solidity)
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if contours:
        cnt = max(contours, key=cv2.contourArea)
        perimeter = cv2.arcLength(cnt, True)
        # Isoperimetric quotient / Compactness ratio (circle is 1.0, irregular > 1.0)
        compactness = (perimeter ** 2) / (4.0 * math.pi * area) if area > 0 else 1.0
        hull = cv2.convexHull(cnt)
        hull_area = cv2.contourArea(hull)
        solidity = float(area) / float(hull_area) if hull_area > 0 else 1.0
        # Combine compactness (normalized) with 1 - solidity
        border_score = round(min(1.0, 0.6 * (compactness - 1.0) + 0.4 * (1.0 - solidity)), 3)
    else:
        border_score = 0.0

    # 3. Color variegation: Standard deviation in CIE Lab color space within mask
    lab = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2LAB)
    lesion_pixels = lab[mask > 0]
    if len(lesion_pixels) > 0:
        # Standard deviation of L, a, b channels
        std_l = float(lesion_pixels[:, 0].std())
        std_a = float(lesion_pixels[:, 1].std())
        std_b = float(lesion_pixels[:, 2].std())
        # Normalized variegation score
        raw_color_var = math.sqrt(std_l**2 + std_a**2 + std_b**2)
        color_score = round(min(1.0, raw_color_var / 50.0), 3)
    else:
        color_score = 0.0

    # 4. Diameter: Max Feret distance (distance between furthest contour points)
    if contours:
        pts = cnt.reshape(-1, 2)
        # Sample points if contour is dense for speed
        if len(pts) > 100:
            indices = np.linspace(0, len(pts) - 1, 100, dtype=int)
            pts = pts[indices]
        dists = np.sqrt(((pts[:, None, :] - pts[None, :, :]) ** 2).sum(axis=-1))
        diameter_px = round(float(dists.max()), 1)
    else:
        diameter_px = 0.0

    # Diameter in mm if scale is known
    diameter_mm: Optional[float] = None
    diameter_mm_reason: Optional[str] = None
    if px_per_cm and px_per_cm > 0:
        diameter_mm = round((diameter_px / px_per_cm) * 10.0, 2)
    else:
        diameter_mm_reason = "no_scale"

    return ABCDE(
        asymmetry=asymmetry_score,
        border=border_score,
        color=color_score,
        diameter_px=diameter_px,
        diameter_mm=diameter_mm,
        diameter_mm_reason=diameter_mm_reason,
        evolution=None,
        evolution_reason="no_prior_image",
    )


def compute_patch_scores(mask: np.ndarray, grid_size: Tuple[int, int] = (8, 8)) -> PatchScores:
    """Compute 8x8 spatial lesion density / activation values."""
    rows, cols = grid_size
    h, w = mask.shape
    patch_h = h // rows
    patch_w = w // cols

    values: List[List[float]] = []
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


def compute_linear_patch_scores(
    patch_tokens: np.ndarray,
    coef: np.ndarray,
    intercept: np.ndarray,
    classes: List[str],
    target_grid: Tuple[int, int] = (8, 8),
) -> PatchScores:
    """Compute 8x8 spatial malignant-risk attribution scores from backbone patch tokens.
    
    Because the classifier is linear on mean patch tokens, applying the weights
    to each patch token gives approximate localized attribution scores.
    """
    grid_h, grid_w, dim = patch_tokens.shape
    flat_patches = patch_tokens.reshape(-1, dim)  # (N_patches, 384)

    # Per-patch logits: flat_patches @ coef.T + (intercept / N_patches)
    patch_logits = flat_patches @ coef.T + (intercept / float(flat_patches.shape[0]))
    # Softmax per patch
    shift = patch_logits - np.max(patch_logits, axis=-1, keepdims=True)
    exp_logits = np.exp(shift)
    patch_probs = exp_logits / np.sum(exp_logits, axis=-1, keepdims=True)

    # Sum probabilities of malignant/premalignant classes (mel, bcc, akiec)
    mal_indices = [classes.index(c) for c in MALIGNANT_CLASSES if c in classes]
    if mal_indices:
        mal_mass = np.sum(patch_probs[:, mal_indices], axis=-1)
    else:
        mal_mass = np.max(patch_probs, axis=-1)

    mal_grid = mal_mass.reshape(grid_h, grid_w)

    # Resize/pool to target grid (e.g. 8x8)
    rows, cols = target_grid
    pooled = cv2.resize(mal_grid.astype(np.float32), (cols, rows), interpolation=cv2.INTER_AREA)

    # Normalise between 0 and 1
    min_val, max_val = float(np.min(pooled)), float(np.max(pooled))
    if max_val > min_val:
        norm_grid = (pooled - min_val) / (max_val - min_val)
    else:
        norm_grid = pooled

    values = [[round(float(v), 3) for v in row] for row in norm_grid]
    return PatchScores(grid=[rows, cols], values=values)


MALIGNANT_CLASSES = ["mel", "bcc", "akiec"]


class CancerJuniorAClassifier:
    """7-class classifier for dermoscopic skin lesions."""

    def __init__(self, models_dir: Optional[Path] = None):
        self.models_dir = models_dir or MODELS_DIR
        self._model = None
        self._temperature: float = 1.0
        self._classes: List[str] = HAM10000_CLASSES
        self._coef: Optional[np.ndarray] = None
        self._intercept: Optional[np.ndarray] = None

    def is_ready(self) -> bool:
        """Check if classifier checkpoint is ready on disk."""
        joblib_path = self.models_dir / "junior_a_classifier.joblib"
        h5_path = self.models_dir / "vit_skin_cancer" / "efficientnetv2s.h5"
        return joblib_path.exists() or h5_path.exists()

    def load_model(self):
        joblib_path = self.models_dir / "junior_a_classifier.joblib"
        if joblib_path.exists():
            payload = joblib.load(joblib_path)
            if isinstance(payload, dict):
                self._model = payload.get("model")
                self._temperature = float(payload.get("temperature", 1.0))
                self._classes = list(payload.get("classes", HAM10000_CLASSES))
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
            return

        h5_path = self.models_dir / "vit_skin_cancer" / "efficientnetv2s.h5"
        if not h5_path.exists():
            raise FileNotFoundError(
                f"Cancer classifier checkpoint not found. Expected {joblib_path} or {h5_path}"
            )

    def predict(
        self,
        image: Image.Image,
        embedding: Optional[np.ndarray] = None,
    ) -> Tuple[Dict[str, float], str]:
        """Predict class probabilities for the 7 HAM10000 classes.
        
        Raises FileNotFoundError if model checkpoint is not yet available.
        """
        if self._model is None and self._coef is None:
            self.load_model()

        if embedding is None:
            raise ValueError("Embedding required for linear classifier")

        emb = np.array(embedding, dtype=np.float32)
        if emb.ndim == 1:
            emb = emb.reshape(1, -1)

        # Calibrated prediction using linear weights and temperature scaling
        if self._coef is not None and self._intercept is not None:
            logits = emb @ self._coef.T + self._intercept
            scaled_logits = logits / max(self._temperature, 0.01)
            shift = scaled_logits - np.max(scaled_logits, axis=-1, keepdims=True)
            exp_scores = np.exp(shift)
            probs = (exp_scores / np.sum(exp_scores, axis=-1, keepdims=True))[0]
        elif self._model is not None and hasattr(self._model, "predict_proba"):
            probs = self._model.predict_proba(emb)[0]
        else:
            raise FileNotFoundError("Trained classifier model weights are not loaded.")

        # Ensure probabilities sum to 1.0
        probs = probs / np.sum(probs)
        prob_map = {cls: round(float(p), 4) for cls, p in zip(self._classes, probs)}
        top_class = max(prob_map, key=prob_map.get)
        return prob_map, top_class


_cancer_classifier: Optional[CancerJuniorAClassifier] = None


def get_cancer_classifier() -> CancerJuniorAClassifier:
    global _cancer_classifier
    if _cancer_classifier is None:
        _cancer_classifier = CancerJuniorAClassifier()
    return _cancer_classifier


def analyze_cancer_junior_a(
    image: Image.Image,
    patient_context: Optional[PatientContext] = None,
    embedding: Optional[np.ndarray] = None,
    patch_tokens: Optional[np.ndarray] = None,
) -> CancerJuniorA:
    """Run Cancer Junior A assessment on input image."""
    img_rgb = np.array(image.convert("RGB"))

    # 1. Lesion segmentation
    mask = extract_lesion_mask(img_rgb)
    mask_b64 = mask_to_base64_png(mask)

    # 2. ABCDE features
    px_per_cm = patient_context.px_per_cm if patient_context else None
    abcde = compute_abcde_features(mask, img_rgb, px_per_cm=px_per_cm)

    # 3. Class probabilities
    classifier = get_cancer_classifier()
    class_probs: Dict[str, float] = {}
    top_class = ""
    if classifier.is_ready() and embedding is not None:
        try:
            class_probs, top_class = classifier.predict(image, embedding=embedding)
        except Exception:
            class_probs = {}
            top_class = ""

    # 4. Patch scores (linear attributions if patch tokens available, else morphological density)
    if (
        patch_tokens is not None
        and classifier._coef is not None
        and classifier._intercept is not None
    ):
        patch_scores = compute_linear_patch_scores(
            patch_tokens=patch_tokens,
            coef=classifier._coef,
            intercept=classifier._intercept,
            classes=classifier._classes,
            target_grid=(8, 8),
        )
    else:
        patch_scores = compute_patch_scores(mask, grid_size=(8, 8))

    return CancerJuniorA(
        class_probs=class_probs,
        top_class=top_class,
        abcde=abcde,
        mask_png_b64=mask_b64,
        patch_scores=patch_scores,
    )
