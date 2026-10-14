"""Tests for Cancer, Ulcer, and Disease Senior decision deciders."""

import numpy as np
import pytest

from app.pipeline.seniors import (
    get_cancer_senior,
    get_disease_senior,
    get_ulcer_senior,
)
from app.schemas import (
    ABCDE,
    CancerJuniorA,
    CancerJuniorB,
    ChangeOverTime,
    DiseaseJuniorA,
    PatchScores,
    PatientContext,
    UglyDuckling,
    UlcerJuniorA,
    UlcerJuniorB,
)


def test_cancer_senior_likelihood_range_consistency():
    """Verify calibrated likelihood produces valid range where low <= point <= high."""
    senior = get_cancer_senior()
    assert senior.is_ready()

    junior_a = CancerJuniorA(
        class_probs={"mel": 0.65, "bcc": 0.15, "akiec": 0.05, "nv": 0.10, "bkl": 0.05, "df": 0.0, "vasc": 0.0},
        top_class="mel",
        abcde=ABCDE(asymmetry=0.52, border=0.62, color=0.55, diameter_px=140.0),
        mask_png_b64="",
        patch_scores=PatchScores(grid=[8, 8], values=[]),
    )

    result = senior.decide(junior_a=junior_a)

    assert 0.0 <= result.likelihood.point <= 1.0
    assert 0.0 <= result.likelihood.low <= result.likelihood.point
    assert result.likelihood.point <= result.likelihood.high <= 1.0
    assert result.band in ["low", "moderate", "high", "very_high"]
    assert result.urgency in ["monitor", "routine_visit", "urgent_visit"]


def test_cancer_senior_escalates_on_ugly_duckling_without_altering_likelihood():
    """Verify Rule 990: ugly duckling escalates urgency but never alters calibrated likelihood."""
    senior = get_cancer_senior()

    # Mild lesion: base urgency monitor or routine
    junior_a = CancerJuniorA(
        class_probs={"nv": 0.85, "bkl": 0.10, "mel": 0.03, "bcc": 0.02, "akiec": 0.0, "df": 0.0, "vasc": 0.0},
        top_class="nv",
        abcde=ABCDE(asymmetry=0.10, border=0.15, color=0.10, diameter_px=60.0),
        mask_png_b64="",
        patch_scores=PatchScores(grid=[8, 8], values=[]),
    )

    base_decision = senior.decide(junior_a=junior_a, junior_b=None)

    # Now add ugly duckling outlier
    junior_b = CancerJuniorB(
        ugly_duckling=UglyDuckling(score=2.5, reason=""),
        change=None,
        patch_scores=None,
    )
    escalated_decision = senior.decide(junior_a=junior_a, junior_b=junior_b)

    # Calibrated point estimate must NOT change
    assert base_decision.likelihood.point == escalated_decision.likelihood.point
    assert any("Ugly duckling" in w for w in escalated_decision.warning_signs)


def test_ulcer_senior_red_flag_forces_urgent_visit():
    """Verify any ulcer red flag (e.g. >20% necrotic eschar) forces urgent_visit."""
    senior = get_ulcer_senior()

    junior_a = UlcerJuniorA(
        mask_png_b64="",
        area_px=250.0,
        area_cm2=2.5,
        tissue={"granulation": 0.40, "slough": 0.30, "necrotic": 0.30, "other": 0.0},
        tissue_estimate_only=True,
        periwound_redness_ratio=1.10,
        patch_scores=None,
    )

    decision = senior.decide(junior_a=junior_a)

    assert decision.urgency == "urgent_visit"
    assert len(decision.red_flags) > 0
    assert any("necrotic" in rf.lower() for rf in decision.red_flags)


def test_disease_senior_respects_abstention():
    """Verify Disease Senior abstains and directs to clinical consultation when confidence is low."""
    senior = get_disease_senior()

    junior_a = DiseaseJuniorA(
        top_3=[],
        abstain=True,
        patch_scores=None,
    )

    decision = senior.decide(junior_a=junior_a)
    assert decision.abstain is True
    assert len(decision.top_conditions) == 0
    assert any("threshold" in w.lower() for w in decision.warning_signs)
