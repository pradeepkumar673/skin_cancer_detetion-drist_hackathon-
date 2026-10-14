"""Tests for DINOv2 backbone feature extractor."""

import numpy as np
from PIL import Image
import pytest

from app.pipeline.backbone import Backbone


@pytest.fixture(scope="module")
def backbone():
    """Module-level fixture to load Backbone once for tests."""
    try:
        return Backbone()
    except FileNotFoundError as e:
        pytest.skip(f"Backbone weights not yet downloaded: {e}")


def test_backbone_embedding_shape(backbone):
    """Verify that backbone produces (N, 384) embeddings."""
    img1 = Image.new("RGB", (224, 224), color=(200, 150, 100))
    img2 = Image.new("RGB", (224, 224), color=(100, 50, 40))

    emb = backbone.embed([img1, img2])
    assert emb.shape == (2, 384)
    assert not np.isnan(emb).any()


def test_backbone_determinism(backbone):
    """Verify that embedding the same image twice produces identical vectors within tolerance."""
    img = Image.new("RGB", (224, 224), color=(180, 120, 90))

    emb_first = backbone.embed(img)
    emb_second = backbone.embed(img)

    assert np.allclose(emb_first, emb_second, atol=1e-5)


def test_backbone_sensitivity_to_different_images(backbone):
    """Verify that different images produce distinguishable embeddings."""
    img_light = Image.new("RGB", (224, 224), color=(240, 220, 200))
    img_dark = Image.new("RGB", (224, 224), color=(30, 20, 15))

    emb = backbone.embed([img_light, img_dark])
    diff = np.abs(emb[0] - emb[1]).mean()
    assert diff > 0.05


def test_backbone_patch_tokens_grid_shape(backbone):
    """Verify spatial patch tokens produce (grid_h, grid_w, 384)."""
    img = Image.new("RGB", (224, 224), color=(150, 100, 80))
    tokens = backbone.patch_tokens(img)

    assert tokens.ndim == 3
    assert tokens.shape[-1] == 384
    # DINOv2 small with 14x14 patches on 224x224 produces 16x16 grid
    assert tokens.shape[0] == tokens.shape[1]
