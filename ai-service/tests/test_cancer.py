"""Tests for Cancer Junior A pipeline adapter and ABCDE metrics."""

import math
import numpy as np
from PIL import Image
import pytest

from app.pipeline.cancer import (
    analyze_cancer_junior_a,
    compute_abcde_features,
    compute_patch_scores,
    extract_lesion_mask,
)
from app.schemas import PatientContext


def test_synthetic_round_disc_asymmetry_near_zero():
    """Verify that a symmetric circular disc has asymmetry near 0."""
    h, w = 200, 200
    mask = np.zeros((h, w), dtype=np.uint8)
    # Draw centered filled circle
    y, x = np.ogrid[:h, :w]
    dist_from_center = (x - 100)**2 + (y - 100)**2
    mask[dist_from_center <= 40**2] = 255

    fake_rgb = np.full((h, w, 3), 150, dtype=np.uint8)
    fake_rgb[mask > 0] = [80, 40, 30]

    abcde = compute_abcde_features(mask, fake_rgb, px_per_cm=100.0)

    # Perfectly centered circle IoU with its flip is 1.0, so asymmetry = 0.0
    assert abcde.asymmetry < 0.05
    # Border irregularity should also be very low for a circle
    assert abcde.border < 0.15
    assert abcde.diameter_px > 70.0
    # 80 px diameter with 100 px/cm = 8.0 mm
    assert abcde.diameter_mm is not None
    assert math.isclose(abcde.diameter_mm, 8.0, abs_tol=1.0)


def test_abcde_evolution_is_null_without_prior():
    """Verify that evolution is None with reason no_prior_image when no prior is given."""
    mask = np.zeros((100, 100), dtype=np.uint8)
    mask[30:70, 30:70] = 255
    fake_rgb = np.full((100, 100, 3), 128, dtype=np.uint8)

    abcde = compute_abcde_features(mask, fake_rgb, px_per_cm=None)
    assert abcde.evolution is None
    assert abcde.evolution_reason == "no_prior_image"
    assert abcde.diameter_mm is None
    assert abcde.diameter_mm_reason == "no_scale"


def test_patch_scores_grid_dimensions():
    """Verify that patch scores return an 8x8 grid of finite values."""
    mask = np.zeros((160, 160), dtype=np.uint8)
    mask[40:120, 40:120] = 255

    patch_scores = compute_patch_scores(mask, grid_size=(8, 8))
    assert patch_scores.grid == [8, 8]
    assert len(patch_scores.values) == 8
    assert all(len(row) == 8 for row in patch_scores.values)
    # Center patches must have positive density, corners must be 0
    assert patch_scores.values[0][0] == 0.0
    assert patch_scores.values[4][4] > 0.0


def test_analyze_cancer_junior_a_returns_valid_schema():
    """Verify analyze_cancer_junior_a execution produces valid schema."""
    # Create synthetic lesion image
    arr = np.full((250, 250, 3), 200, dtype=np.uint8)
    y, x = np.ogrid[:250, :250]
    mask = (x - 125)**2 + (y - 125)**2 <= 50**2
    arr[mask] = [70, 40, 35]

    img = Image.fromarray(arr)
    context = PatientContext(px_per_cm=50.0)

    result = analyze_cancer_junior_a(img, patient_context=context)

    assert result.mask_png_b64 != ""
    assert result.abcde.asymmetry >= 0.0
    assert result.abcde.diameter_px > 0
    assert result.patch_scores.grid == [8, 8]
