"""Tests for Ulcer Junior A U-Net segmentation, tissue composition, and erythema ratio."""

import numpy as np
from PIL import Image
import pytest

from app.pipeline.ulcer import (
    analyze_ulcer_junior_a,
    calculate_periwound_redness_ratio,
    classify_tissue_composition,
    get_ulcer_segmenter,
)
from app.schemas import PatientContext


def test_ulcer_segmenter_is_ready():
    """Verify that U-Net checkpoint is present on disk and can be instantiated."""
    segmenter = get_ulcer_segmenter()
    assert segmenter.is_ready()


def test_tissue_composition_fractions_sum_to_one():
    """Verify tissue fractions sum to 1.0 within floating point tolerance."""
    # Create an RGB image with red (granulation), yellow (slough), and black (necrotic) pixels
    img = np.full((100, 100, 3), 150, dtype=np.uint8)
    mask = np.zeros((100, 100), dtype=np.uint8)

    # Granulation region (red)
    img[20:40, 20:40] = [180, 20, 20]
    mask[20:40, 20:40] = 255

    # Slough region (yellow)
    img[40:60, 40:60] = [210, 180, 40]
    mask[40:60, 40:60] = 255

    # Necrotic region (black)
    img[60:80, 60:80] = [15, 10, 10]
    mask[60:80, 60:80] = 255

    tissues = classify_tissue_composition(img, mask)

    assert "granulation" in tissues
    assert "slough" in tissues
    assert "necrotic" in tissues
    assert "other" in tissues

    total_frac = sum(tissues.values())
    assert total_frac == pytest.approx(1.0, abs=1e-3)
    assert tissues["granulation"] > 0.0
    assert tissues["slough"] > 0.0
    assert tissues["necrotic"] > 0.0


def test_ulcer_area_with_and_without_scale():
    """Verify area_cm2 is computed only when px_per_cm is provided."""
    img_arr = np.full((120, 120, 3), 160, dtype=np.uint8)
    # Circular central wound
    y, x = np.ogrid[:120, :120]
    wound = (x - 60) ** 2 + (y - 60) ** 2 <= 25 ** 2
    img_arr[wound] = [120, 30, 25]

    pil_img = Image.fromarray(img_arr)

    # Without scale
    res_no_scale = analyze_ulcer_junior_a(pil_img, patient_context=None)
    assert res_no_scale.area_cm2 is None
    assert res_no_scale.area_cm2_reason == "no_scale"
    assert res_no_scale.tissue_estimate_only is True

    # With scale: 50 px per cm
    ctx = PatientContext(px_per_cm=50.0)
    res_with_scale = analyze_ulcer_junior_a(pil_img, patient_context=ctx)
    assert res_with_scale.area_cm2_reason is None
    assert res_with_scale.patch_scores is not None
    assert res_with_scale.patch_scores.grid == [8, 8]


def test_periwound_redness_ratio():
    """Verify erythema ratio computes finite value for defined periwound ring."""
    img = np.full((100, 100, 3), 160, dtype=np.uint8)
    mask = np.zeros((100, 100), dtype=np.uint8)
    mask[30:70, 30:70] = 255

    # Add red tint to periwound area (margin around 30:70)
    img[20:80, 20:80] = [190, 130, 130]

    ratio = calculate_periwound_redness_ratio(img, mask)
    assert ratio is not None
    assert ratio > 0.0
