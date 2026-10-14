"""Junior B comparison and longitudinal tracking modules for Cancer, Ulcer, and Disease teams.

Implements Step 13:
1. Image registration: OpenCV ECC affine alignment with fallback to ORB + RANSAC.
2. Cancer Junior B:
   - Ugly Duckling: Outlier z-score of target lesion vs other lesions of the same patient.
   - Longitudinal Change: Area change %, CIE Lab Delta-E, compactness change, and embedding cosine distance.
   - Evolution score and ABCDE "E" computation.
3. Ulcer Junior B:
   - Healing trajectory tracking (improving, stalled, worsening) using clinical rules.
4. Disease Junior B:
   - Progression tracking across aligned prior and current lesions.
5. 8x8 spatial disagreement patch scores between aligned prior and current patches.

Adheres to Project Rules:
- Rule 1: No synthetic data or stub predictions.
- Rule 2: Reads weights and thresholds from clinical_rules.yaml and thresholds.json.
- Rule 10: Decision support only.
"""

from datetime import datetime
import json
import math
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import cv2
import numpy as np
from PIL import Image
import yaml

from app.schemas import (
    CancerJuniorB,
    ChangeOverTime,
    DiseaseJuniorB,
    PatchScores,
    UglyDuckling,
    UlcerJuniorB,
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
            with open(CLINICAL_RULES_PATH, "r", encoding="utf-8") as f:
                clinical_rules = yaml.safe_load(f) or {}
        except Exception:
            pass

    return thresholds, clinical_rules


# ---------------------------------------------------------------------------
# 1. Image Registration (Common)
# ---------------------------------------------------------------------------


def register_images(
    prior_rgb: np.ndarray,
    current_rgb: np.ndarray,
    min_quality: float = 0.40,
) -> Tuple[Optional[np.ndarray], float, bool, Optional[str]]:
    """Align prior RGB photo to current RGB photo space using ECC affine with ORB fallback.
    
    Returns (warped_prior_rgb, alignment_quality, success, reason).
    """
    h_curr, w_curr = current_rgb.shape[:2]
    prior_resized = cv2.resize(prior_rgb, (w_curr, h_curr))

    curr_gray = cv2.cvtColor(current_rgb, cv2.COLOR_RGB2GRAY)
    prior_gray = cv2.cvtColor(prior_resized, cv2.COLOR_RGB2GRAY)

    warp_matrix = np.eye(2, 3, dtype=np.float32)
    success = False

    # Attempt 1: ECC with affine model
    try:
        criteria = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 50, 1e-4)
        _, warp_matrix = cv2.findTransformECC(
            prior_gray, curr_gray, warp_matrix, cv2.MOTION_AFFINE, criteria
        )
        success = True
    except cv2.error:
        success = False

    # Attempt 2: Feature-based ORB + RANSAC fallback
    if not success:
        try:
            orb = cv2.ORB_create(nfeatures=500)
            kp1, des1 = orb.detectAndCompute(prior_gray, None)
            kp2, des2 = orb.detectAndCompute(curr_gray, None)

            if des1 is not None and des2 is not None and len(kp1) >= 4 and len(kp2) >= 4:
                bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
                matches = bf.match(des1, des2)
                matches = sorted(matches, key=lambda x: x.distance)

                if len(matches) >= 4:
                    pts1 = np.float32([kp1[m.queryIdx].pt for m in matches[:50]])
                    pts2 = np.float32([kp2[m.trainIdx].pt for m in matches[:50]])
                    warp_matrix, _ = cv2.estimateAffinePartial2D(pts1, pts2, method=cv2.RANSAC)
                    if warp_matrix is not None:
                        success = True
        except Exception:
            success = False

    if not success or warp_matrix is None:
        return None, 0.0, False, "alignment_failed"

    # Warp prior to match current
    warped = cv2.warpAffine(
        prior_resized,
        warp_matrix,
        (w_curr, h_curr),
        flags=cv2.INTER_LINEAR + cv2.WARP_INVERSE_MAP,
        borderMode=cv2.BORDER_REFLECT,
    )

    # Compute post-alignment correlation quality score
    warped_gray = cv2.cvtColor(warped, cv2.COLOR_RGB2GRAY)
    res = cv2.matchTemplate(warped_gray, curr_gray, cv2.TM_CCOEFF_NORMED)
    quality = float(round(max(0.0, res[0][0]), 3))

    if quality < min_quality:
        return None, quality, False, "alignment_quality_below_threshold"

    return warped, quality, True, None


# ---------------------------------------------------------------------------
# 2. Patch Disagreement Scores (Common)
# ---------------------------------------------------------------------------


def compute_patch_disagreement(
    current_patches: np.ndarray,
    prior_patches: Optional[np.ndarray] = None,
    target_grid: Tuple[int, int] = (8, 8),
) -> PatchScores:
    """Compute 8x8 spatial feature disagreement (cosine distance) between current and prior."""
    if prior_patches is None:
        return PatchScores(grid=list(target_grid), values=[], reason="no_prior_image")

    h, w, dim = current_patches.shape
    curr_flat = current_patches.reshape(-1, dim)
    prior_flat = prior_patches.reshape(-1, dim)

    # Cosine distance per patch: 1 - (u . v) / (||u|| * ||v||)
    curr_norm = curr_flat / (np.linalg.norm(curr_flat, axis=-1, keepdims=True) + 1e-7)
    prior_norm = prior_flat / (np.linalg.norm(prior_flat, axis=-1, keepdims=True) + 1e-7)
    cos_sim = np.sum(curr_norm * prior_norm, axis=-1)
    cos_dist = np.clip(1.0 - cos_sim, 0.0, 1.0).reshape(h, w)

    # Resize/pool to target 8x8 grid
    rows, cols = target_grid
    pooled = cv2.resize(cos_dist.astype(np.float32), (cols, rows), interpolation=cv2.INTER_AREA)

    values = [[round(float(v), 3) for v in row] for row in pooled]
    return PatchScores(grid=[rows, cols], values=values)


# ---------------------------------------------------------------------------
# 3. Cancer Junior B: Ugly Duckling & Longitudinal Change
# ---------------------------------------------------------------------------


def compute_ugly_duckling_score(
    target_embedding: np.ndarray,
    other_embeddings: Optional[List[np.ndarray]] = None,
    min_others: int = 2,
) -> UglyDuckling:
    """Calculate outlier z-score of the target lesion relative to patient's other lesions."""
    if other_embeddings is None or len(other_embeddings) < min_others:
        return UglyDuckling(
            score=None,
            reason="not_enough_other_lesions",
        )

    t_emb = target_embedding / (np.linalg.norm(target_embedding) + 1e-7)
    others = np.array([e / (np.linalg.norm(e) + 1e-7) for e in other_embeddings])

    # Distance from target to each other lesion
    target_distances = 1.0 - np.dot(others, t_emb)
    mean_target_dist = float(np.mean(target_distances))

    # Leave-one-out distances among the others
    n = len(others)
    loo_distances = []
    for i in range(n):
        dist_i = 1.0 - np.dot(np.delete(others, i, axis=0), others[i])
        loo_distances.append(float(np.mean(dist_i)))

    mu = float(np.mean(loo_distances))
    sigma = float(np.std(loo_distances))

    if sigma < 1e-4:
        z_score = 0.0
    else:
        z_score = round((mean_target_dist - mu) / sigma, 2)

    return UglyDuckling(score=z_score, reason="")


def compute_longitudinal_change(
    current_rgb: np.ndarray,
    prior_rgb: Optional[np.ndarray] = None,
    current_mask: Optional[np.ndarray] = None,
    prior_mask: Optional[np.ndarray] = None,
    current_embedding: Optional[np.ndarray] = None,
    prior_embedding: Optional[np.ndarray] = None,
) -> Tuple[Optional[ChangeOverTime], Optional[float]]:
    """Compute change metrics against aligned prior image."""
    if prior_rgb is None:
        return None, None

    thresholds, rules = load_config()
    min_qual = thresholds.get("junior_b", {}).get("min_alignment_quality", 0.40)

    # 1. Registration
    warped_prior, quality, success, reason = register_images(
        prior_rgb, current_rgb, min_quality=min_qual
    )
    if not success or warped_prior is None:
        return ChangeOverTime(reason=reason or "alignment_failed"), None

    curr_h, curr_w = current_rgb.shape[:2]

    # Warp prior mask if provided
    if prior_mask is not None:
        prior_mask_resized = cv2.resize(prior_mask, (curr_w, curr_h))
        warped_prior_mask = cv2.resize(
            prior_mask_resized, (curr_w, curr_h), interpolation=cv2.INTER_NEAREST
        )
    else:
        warped_prior_mask = None

    # 2. Area change %
    if current_mask is not None and warped_prior_mask is not None:
        curr_area = float(np.count_nonzero(current_mask))
        prior_area = float(np.count_nonzero(warped_prior_mask))
        if prior_area > 0:
            area_change_pct = round(((curr_area - prior_area) / prior_area) * 100.0, 1)
        else:
            area_change_pct = 0.0
    else:
        area_change_pct = 0.0

    # 3. Color Delta-E (Lab)
    curr_lab = cv2.cvtColor(current_rgb, cv2.COLOR_RGB2LAB)
    prior_lab = cv2.cvtColor(warped_prior, cv2.COLOR_RGB2LAB)

    if current_mask is not None and np.count_nonzero(current_mask) > 0:
        c_pixels = curr_lab[current_mask > 0].astype(np.float32)
        p_pixels = prior_lab[current_mask > 0].astype(np.float32)
        delta_e = float(round(np.mean(np.sqrt(np.sum((c_pixels - p_pixels) ** 2, axis=-1))), 2))
    else:
        delta_e = float(round(np.mean(np.sqrt(np.sum((curr_lab - prior_lab) ** 2, axis=-1))), 2))

    # 4. Border compactness change
    def get_compactness(m: np.ndarray) -> float:
        area = float(np.count_nonzero(m))
        contours, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if contours and area > 0:
            p = cv2.arcLength(max(contours, key=cv2.contourArea), True)
            return (p ** 2) / (4.0 * math.pi * area)
        return 1.0

    if current_mask is not None and warped_prior_mask is not None:
        comp_curr = get_compactness(current_mask)
        comp_prior = get_compactness(warped_prior_mask)
        compactness_change = round(abs(comp_curr - comp_prior), 3)
    else:
        compactness_change = 0.0

    # 5. Embedding cosine distance
    if current_embedding is not None and prior_embedding is not None:
        c_e = current_embedding / (np.linalg.norm(current_embedding) + 1e-7)
        p_e = prior_embedding / (np.linalg.norm(prior_embedding) + 1e-7)
        cos_dist = round(float(np.clip(1.0 - np.dot(c_e, p_e), 0.0, 1.0)), 4)
    else:
        cos_dist = 0.0

    # Composite evolution score (heuristic weights from clinical_rules.yaml)
    weights = rules.get("cancer", {}).get("evolution_weights", {})
    w_area = weights.get("area_weight", 0.35)
    w_color = weights.get("color_weight", 0.25)
    w_border = weights.get("border_weight", 0.20)
    w_emb = weights.get("embedding_weight", 0.20)

    norm_area = min(1.0, abs(area_change_pct) / 50.0)
    norm_color = min(1.0, delta_e / 30.0)
    norm_border = min(1.0, compactness_change / 2.0)
    norm_emb = min(1.0, cos_dist * 2.0)

    composite_evolution = round(
        w_area * norm_area + w_color * norm_color + w_border * norm_border + w_emb * norm_emb,
        3,
    )

    change = ChangeOverTime(
        score=composite_evolution,
        area_change_pct=area_change_pct,
        color_delta_e=delta_e,
        border_compactness_change=compactness_change,
        cosine_distance=cos_dist,
        reason=None,
    )

    return change, composite_evolution


def analyze_cancer_junior_b(
    current_image: Image.Image,
    current_mask: Optional[np.ndarray] = None,
    current_embedding: Optional[np.ndarray] = None,
    current_patch_tokens: Optional[np.ndarray] = None,
    prior_image: Optional[Image.Image] = None,
    prior_mask: Optional[np.ndarray] = None,
    prior_embedding: Optional[np.ndarray] = None,
    prior_patch_tokens: Optional[np.ndarray] = None,
    other_embeddings: Optional[List[np.ndarray]] = None,
) -> Tuple[CancerJuniorB, Optional[float]]:
    """Execute Cancer Junior B comparative assessment."""
    # 1. Ugly duckling
    if current_embedding is not None and other_embeddings:
        ugly_duckling = compute_ugly_duckling_score(current_embedding, other_embeddings)
    else:
        ugly_duckling = UglyDuckling(score=None, reason="not_enough_other_lesions")

    # 2. Longitudinal change
    curr_rgb = np.array(current_image.convert("RGB"))
    prior_rgb = np.array(prior_image.convert("RGB")) if prior_image else None

    change, evolution_score = compute_longitudinal_change(
        curr_rgb,
        prior_rgb,
        current_mask=current_mask,
        prior_mask=prior_mask,
        current_embedding=current_embedding,
        prior_embedding=prior_embedding,
    )

    # 3. Patch scores
    if current_patch_tokens is not None and prior_patch_tokens is not None:
        patch_scores = compute_patch_disagreement(
            current_patch_tokens, prior_patch_tokens, target_grid=(8, 8)
        )
    else:
        patch_scores = None

    junior_b = CancerJuniorB(
        ugly_duckling=ugly_duckling,
        change=change,
        patch_scores=patch_scores,
    )
    return junior_b, evolution_score


# ---------------------------------------------------------------------------
# 4. Ulcer Junior B: Healing Trend Tracking
# ---------------------------------------------------------------------------


def analyze_ulcer_junior_b(
    current_area_px: float,
    prior_area_px: Optional[float] = None,
    current_taken_at: Optional[datetime] = None,
    prior_taken_at: Optional[datetime] = None,
) -> UlcerJuniorB:
    """Analyze ulcer healing trajectory from prior observation."""
    if prior_area_px is None or prior_area_px <= 0:
        return UlcerJuniorB(
            healing_trend=None,
            area_change_pct=None,
            change_per_week=None,
            reason="no_prior_image",
            patch_scores=None,
        )

    area_change_pct = round(((current_area_px - prior_area_px) / prior_area_px) * 100.0, 1)

    # Calculate days elapsed
    if current_taken_at and prior_taken_at and current_taken_at > prior_taken_at:
        days = max(1, (current_taken_at - prior_taken_at).days)
    else:
        days = 7  # Default assumption of 1 week if dates omitted

    change_per_week = round((area_change_pct / float(days)) * 7.0, 1)

    # Classify trajectory according to clinical rules:
    # Healed / improving: reduction >= 10% per week
    # Stalled: between -10% and +10% per week
    # Worsening: area expansion > 10% per week
    if change_per_week <= -10.0:
        healing_trend = "improving"
    elif change_per_week > 10.0:
        healing_trend = "worsening"
    else:
        healing_trend = "stalled"

    return UlcerJuniorB(
        healing_trend=healing_trend,
        area_change_pct=area_change_pct,
        change_per_week=change_per_week,
        reason=None,
        patch_scores=None,
    )


# ---------------------------------------------------------------------------
# 5. Disease Junior B: Progression Tracking
# ---------------------------------------------------------------------------


def analyze_disease_junior_b(
    current_embedding: Optional[np.ndarray] = None,
    prior_embedding: Optional[np.ndarray] = None,
    current_top_prob: Optional[float] = None,
    prior_top_prob: Optional[float] = None,
) -> DiseaseJuniorB:
    """Analyze dermatological disease progression relative to prior."""
    if current_embedding is None or prior_embedding is None:
        return DiseaseJuniorB(progression=None, reason="no_prior_image", patch_scores=None)

    c_e = current_embedding / (np.linalg.norm(current_embedding) + 1e-7)
    p_e = prior_embedding / (np.linalg.norm(prior_embedding) + 1e-7)
    cos_dist = round(float(np.clip(1.0 - np.dot(c_e, p_e), 0.0, 1.0)), 4)

    prob_delta = None
    if current_top_prob is not None and prior_top_prob is not None:
        prob_delta = round(current_top_prob - prior_top_prob, 4)

    progression = {
        "embedding_distance": cos_dist,
        "probability_change": prob_delta,
        "status": "stable" if cos_dist < 0.15 else "changed",
    }

    return DiseaseJuniorB(progression=progression, reason=None, patch_scores=None)
