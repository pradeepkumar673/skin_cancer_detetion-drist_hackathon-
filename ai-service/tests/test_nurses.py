"""Tests for the Nurse domain gate module and OOD detector."""

import numpy as np
import pytest

from app.pipeline.nurses import NursesGate, get_nurses_gate, run_nurses
from app.schemas import NursesResult


def test_nurses_gate_is_ready_with_saved_checkpoints():
    """Verify that NursesGate detects saved checkpoints in models/nurses/."""
    gate = get_nurses_gate()
    assert gate.is_ready() is True


def test_nurses_gate_evaluate_returns_valid_schema():
    """Verify that nurse evaluation returns calibrated probabilities and relevance."""
    fake_embedding = np.random.normal(0, 1, 384)
    fake_embedding = fake_embedding / np.linalg.norm(fake_embedding)

    result = run_nurses(fake_embedding)

    assert isinstance(result, NursesResult)
    assert 0.0 <= result.cancer.score <= 1.0
    assert 0.0 <= result.ulcer.score <= 1.0
    assert 0.0 <= result.disease.score <= 1.0
    assert isinstance(result.cancer.relevant, bool)
    assert isinstance(result.ulcer.relevant, bool)
    assert isinstance(result.disease.relevant, bool)


def test_nurses_gate_ood_computation():
    """Verify that compute_ood returns finite distance score and boolean flag."""
    gate = get_nurses_gate()
    fake_embedding = np.random.normal(0, 1, 384)
    score, flagged = gate.compute_ood(fake_embedding)

    assert isinstance(score, float)
    assert score >= 0.0
    assert isinstance(flagged, bool)
