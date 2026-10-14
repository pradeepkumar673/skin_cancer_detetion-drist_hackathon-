"""Tests for the Nurse domain gate module."""

import numpy as np
import pytest

from app.pipeline.nurses import NursesGate


def test_nurses_gate_fails_safely_when_models_missing():
    """Verify that NursesGate fails loudly without fake predictions if checkpoints are missing (Rule 3)."""
    gate = NursesGate(models_dir=None)
    fake_embedding = np.random.randn(384)

    # When checkpoints are not installed on disk, evaluate must raise FileNotFoundError
    if not gate.is_ready():
        with pytest.raises(FileNotFoundError):
            gate.evaluate(fake_embedding)
