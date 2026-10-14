"""Tests for Disease Junior A multi-class classifier and calibrated abstention."""

import numpy as np
from PIL import Image
import pytest

from app.pipeline.disease import (
    analyze_disease_junior_a,
    compute_disease_patch_scores,
    get_disease_classifier,
)


def test_disease_classifier_is_ready():
    """Verify that Disease Junior A classifier checkpoint is ready on disk."""
    classifier = get_disease_classifier()
    assert classifier.is_ready()


def test_disease_predict_returns_top_3_with_non_diagnostic_labels():
    """Verify top-3 predictions and clinical 'Possible condition' phrasing."""
    classifier = get_disease_classifier()
    img = Image.new("RGB", (200, 200), color=(180, 130, 110))
    emb = np.random.RandomState(42).randn(384).astype(np.float32)

    top_3, abstain, top_class = classifier.predict(img, embedding=emb)

    assert len(top_3) == 3
    for item in top_3:
        assert "condition" in item
        assert "probability" in item
        assert "label" in item
        # Rule 10 & 17: Non-diagnostic prefix
        assert item["label"].startswith("Possible condition:")
        assert 0.0 <= item["probability"] <= 1.0

    # Probabilities in descending order
    assert top_3[0]["probability"] >= top_3[1]["probability"] >= top_3[2]["probability"]


def test_disease_abstains_on_low_confidence():
    """Verify that abstention fires when top confidence is below threshold."""
    img = Image.new("RGB", (200, 200), color=(150, 150, 150))
    # Near-zero embedding produces uniform probability distribution across classes (each ~0.166)
    uniform_emb = np.zeros(384, dtype=np.float32)

    res = analyze_disease_junior_a(img, embedding=uniform_emb)
    # 0.166 < 0.40 threshold -> must abstain
    assert res.abstain is True


def test_disease_linear_patch_scores():
    """Verify that linear patch attributions produce an 8x8 normalized grid."""
    classifier = get_disease_classifier()
    if classifier._coef is None:
        classifier.load_model()

    patch_tokens = np.random.RandomState(42).randn(14, 14, 384).astype(np.float32)
    patch_scores = compute_disease_patch_scores(
        patch_tokens=patch_tokens,
        coef=classifier._coef,
        intercept=classifier._intercept,
        classes=classifier._classes,
        target_class=classifier._classes[0],
        target_grid=(8, 8),
    )

    assert patch_scores.grid == [8, 8]
    assert len(patch_scores.values) == 8
    assert all(len(row) == 8 for row in patch_scores.values)
    for row in patch_scores.values:
        for val in row:
            assert 0.0 <= val <= 1.0
