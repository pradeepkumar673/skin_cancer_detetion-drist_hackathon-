"""Tests for Junior B comparers across Cancer, Ulcer, and Disease teams."""

from datetime import datetime, timedelta
import cv2
import numpy as np
from PIL import Image
import pytest

from app.pipeline.junior_b import (
    analyze_cancer_junior_b,
    analyze_disease_junior_b,
    analyze_ulcer_junior_b,
    compute_longitudinal_change,
    compute_patch_disagreement,
    compute_ugly_duckling_score,
    register_images,
)


def test_registration_recovers_known_transform():
    """Verify that ECC/ORB image registration aligns an image with slight shift."""
    h, w = 150, 150
    # Draw geometric pattern
    curr = np.full((h, w, 3), 180, dtype=np.uint8)
    cv2.circle(curr, (75, 75), 30, (80, 50, 40), -1)
    cv2.rectangle(curr, (50, 50), (100, 100), (120, 70, 60), 2)

    # Prior with 4-pixel shift
    M = np.float32([[1, 0, 4], [0, 1, 3]])
    prior = cv2.warpAffine(curr, M, (w, h), borderMode=cv2.BORDER_REFLECT)

    warped, quality, success, reason = register_images(prior, curr, min_quality=0.40)
    assert success is True
    assert quality >= 0.40
    assert warped is not None


def test_change_near_zero_for_identical_image():
    """Verify comparing an image with itself produces near-zero change metrics."""
    h, w = 100, 100
    img = np.full((h, w, 3), 170, dtype=np.uint8)
    mask = np.zeros((h, w), dtype=np.uint8)
    cv2.circle(mask, (50, 50), 25, 255, -1)
    img[mask > 0] = [100, 50, 40]

    emb = np.random.RandomState(42).randn(384).astype(np.float32)

    change, evo_score = compute_longitudinal_change(
        current_rgb=img,
        prior_rgb=img,
        current_mask=mask,
        prior_mask=mask,
        current_embedding=emb,
        prior_embedding=emb,
    )

    assert change is not None
    assert change.reason is None
    assert abs(change.area_change_pct) < 1.0
    assert change.color_delta_e < 1.0
    assert change.border_compactness_change < 0.05
    assert change.cosine_distance < 0.01
    assert evo_score is not None
    assert evo_score < 0.10


def test_ugly_duckling_flags_outlier_lesion():
    """Verify that an outlier feature vector achieves highest z-score among clustered lesions."""
    rng = np.random.RandomState(42)
    dim = 384
    # Cluster center for 4 benign lesions
    cluster_center = rng.randn(dim)
    cluster_center = cluster_center / np.linalg.norm(cluster_center)

    others = [
        (cluster_center + rng.randn(dim) * 0.05) / np.linalg.norm(cluster_center)
        for _ in range(4)
    ]

    # Target 1: normal member of the same cluster
    normal_target = (cluster_center + rng.randn(dim) * 0.05)
    normal_res = compute_ugly_duckling_score(normal_target, others)

    # Target 2: distinct outlier lesion
    outlier_target = rng.randn(dim)
    outlier_target = outlier_target / np.linalg.norm(outlier_target)
    outlier_res = compute_ugly_duckling_score(outlier_target, others)

    assert normal_res.score is not None
    assert outlier_res.score is not None
    # Outlier z-score must be higher than cluster member
    assert outlier_res.score > normal_res.score


def test_ulcer_healing_trend_trajectories():
    """Verify ulcer Junior B classifies healing trajectories based on weekly rate."""
    t0 = datetime(2026, 1, 1)
    t1 = datetime(2026, 1, 8)  # 1 week later

    # 1. Improving (>10% reduction)
    res_improving = analyze_ulcer_junior_b(
        current_area_px=80.0,
        prior_area_px=100.0,
        current_taken_at=t1,
        prior_taken_at=t0,
    )
    assert res_improving.healing_trend == "improving"
    assert res_improving.area_change_pct == -20.0

    # 2. Worsening (>10% increase)
    res_worsening = analyze_ulcer_junior_b(
        current_area_px=120.0,
        prior_area_px=100.0,
        current_taken_at=t1,
        prior_taken_at=t0,
    )
    assert res_worsening.healing_trend == "worsening"
    assert res_worsening.area_change_pct == 20.0

    # 3. Stalled (-5% change)
    res_stalled = analyze_ulcer_junior_b(
        current_area_px=95.0,
        prior_area_px=100.0,
        current_taken_at=t1,
        prior_taken_at=t0,
    )
    assert res_stalled.healing_trend == "stalled"


def test_disease_junior_b_progression():
    """Verify disease Junior B computes stable vs changed progression."""
    rng = np.random.RandomState(42)
    dim = 384
    emb1 = rng.randn(dim).astype(np.float32)

    # Same embedding -> stable
    res_stable = analyze_disease_junior_b(
        current_embedding=emb1,
        prior_embedding=emb1,
        current_top_prob=0.85,
        prior_top_prob=0.82,
    )
    assert res_stable.progression is not None
    assert res_stable.progression["status"] == "stable"
    assert res_stable.progression["embedding_distance"] < 0.05


def test_patch_disagreement_grid():
    """Verify patch disagreement produces 8x8 normalized values."""
    rng = np.random.RandomState(42)
    curr_patches = rng.randn(12, 12, 384).astype(np.float32)
    prior_patches = rng.randn(12, 12, 384).astype(np.float32)

    scores = compute_patch_disagreement(curr_patches, prior_patches, target_grid=(8, 8))
    assert scores.grid == [8, 8]
    assert len(scores.values) == 8
    assert all(len(row) == 8 for row in scores.values)
    for row in scores.values:
        for val in row:
            assert 0.0 <= val <= 1.0
