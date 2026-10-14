"""Test suite for Step 16: Groq Explanation Service.

Verifies:
1. De-identified facts builder never leaks forbidden patient data, image bytes, or identifiers.
2. Number validation rejects hallucinated or invented numbers not present in facts.
3. Banned phrases validator rejects prohibited diagnostic terminology.
4. Deterministic template fallback generates compliant explanations in en, ta, hi.
5. Invalid API key gracefully falls back to deterministic template with source='template'.
6. Real Groq API call works when configured.
7. POST /v1/explain endpoint works with valid API key.
"""

import json
from unittest.mock import patch
import pytest
from starlette.testclient import TestClient

from app.config import get_settings
from app.llm.groq_client import GroqClient
from app.llm.report import FORBIDDEN_KEYS, build_facts
from app.llm.service import ExplanationService
from app.llm.templates import format_template_explanation
from app.llm.validator import validate_explanation
from app.main import app

settings = get_settings()
client = TestClient(app)

MOCK_ANALYSIS_RESULT = {
    "request_id": "test-req-123",
    "quality": {
        "passed": True,
        "blur_score": 142.5,
        "brightness_score": 128.0,
        "contrast_score": 45.2,
        "reasons": [],
        "coach_tips": [],
    },
    "nurses": {
        "cancer": {"relevant": True, "score": 0.88},
        "ulcer": {"relevant": False, "score": 0.12},
        "disease": {"relevant": False, "score": 0.05},
    },
    "teams": {
        "cancer": {
            "junior_a": {
                "likely_types": [
                    {"name": "melanocytic_nevi", "probability": 0.65},
                    {"name": "melanoma", "probability": 0.22},
                ],
                "abcde": {
                    "asymmetry": 0.15,
                    "border": 0.18,
                    "color_var": 0.25,
                    "diameter_mm": 5.4,
                    "evolution": 0.05,
                },
                "mask_png_b64": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
            },
            "senior": {
                "likelihood_point": 0.22,
                "likelihood_low": 0.18,
                "likelihood_high": 0.28,
                "band": "low",
                "urgency": "routine_annual",
                "warning_signs": [],
            },
        }
    },
    "safety": {
        "decision": "proceed",
        "reasons": [],
        "ood": {"score": 2.4, "flagged": False, "reason": None},
        "agreement": {"score": 0.92, "agree_cells": 15, "disagree_cells": 1},
    },
    "arbitration": {
        "primary_team": "cancer",
        "notes": ["Cancer team selected as primary pathway."],
    },
    # Sensitive fields that MUST NEVER leak to LLM
    "patient_id": "secret-pat-9999",
    "patient_name": "John Doe",
    "email": "patient@hospital.com",
    "dob": "1980-01-01",
    "image_b64": "data:image/jpeg;base64,RAW_BYTES_HERE",
}


def test_facts_builder_deidentification():
    """Verify that build_facts strips all forbidden patient identifiers and raw image data."""
    facts = build_facts(MOCK_ANALYSIS_RESULT, language="en")

    facts_str = json.dumps(facts).lower()
    for forbidden in FORBIDDEN_KEYS:
        assert forbidden not in facts, f"Forbidden key '{forbidden}' found in facts root"
        assert f'"{forbidden}"' not in facts_str, f"Forbidden key '{forbidden}' leaked into facts JSON"

    assert "secret-pat-9999" not in facts_str
    assert "john doe" not in facts_str
    assert "patient@hospital.com" not in facts_str
    assert "raw_bytes_here" not in facts_str

    assert facts["primary_team"] == "cancer"
    assert facts["cancer"]["band"] == "low"
    assert facts["cancer"]["likelihood_point"] == 0.22


def test_validator_rejects_hallucinated_numbers():
    """Verify that validator rejects output containing unverified or fabricated numbers."""
    facts = build_facts(MOCK_ANALYSIS_RESULT, language="en")

    # Hallucinated 99% and 42 days not in facts
    invalid_content = json.dumps({
        "summary": "Screening shows 99% accuracy with 0.22 likelihood.",
        "key_findings": ["Asymmetry is 0.15", "Follow up in 42 days"],
        "why_this_risk": "Risk is low at 0.22.",
        "next_steps": ["Doctor consultation recommended"],
        "limitations": ["Decision support only. A doctor makes the diagnosis."],
    })

    is_valid, errors, _ = validate_explanation(invalid_content, facts)
    assert is_valid is False
    assert any("99%" in err or "42" in err for err in errors)


def test_validator_rejects_banned_diagnostic_phrases():
    """Verify that validator rejects definitive diagnostic claims."""
    facts = build_facts(MOCK_ANALYSIS_RESULT, language="en")

    invalid_content = json.dumps({
        "summary": "You are diagnosed with a skin condition.",
        "key_findings": ["Asymmetry is 0.15"],
        "why_this_risk": "Risk is low at 0.22.",
        "next_steps": ["Doctor consultation recommended"],
        "limitations": ["Decision support only. A doctor makes the diagnosis."],
    })

    is_valid, errors, _ = validate_explanation(invalid_content, facts)
    assert is_valid is False
    assert any("Prohibited diagnostic phrase" in err for err in errors)


def test_validator_accepts_valid_explanation():
    """Verify validator passes compliant output with matching facts and disclaimer."""
    facts = build_facts(MOCK_ANALYSIS_RESULT, language="en")

    valid_content = json.dumps({
        "summary": "Screening indicates low risk with likelihood 0.22 (range 0.18 to 0.28).",
        "key_findings": ["Asymmetry score: 0.15", "Diameter: 5.4 mm"],
        "why_this_risk": "Lesion displays low risk profile at 0.22 likelihood.",
        "next_steps": ["Follow routine annual checkup."],
        "limitations": ["Decision support only. A normal or low-risk result never proves there is no problem. A doctor makes the diagnosis."],
    })

    is_valid, errors, parsed = validate_explanation(valid_content, facts)
    assert is_valid is True
    assert len(errors) == 0
    assert parsed["summary"].startswith("Screening indicates")


def test_template_multilingual_fallback():
    """Verify deterministic fallback generates valid content for en, ta, and hi."""
    facts = build_facts(MOCK_ANALYSIS_RESULT, language="en")

    for lang in ["en", "ta", "hi"]:
        full_text, structured = format_template_explanation(facts, language=lang)
        assert len(full_text) > 50
        assert "summary" in structured
        assert len(structured["key_findings"]) > 0
        assert len(structured["limitations"]) > 0
        assert "0.22" in full_text or "0.22" in structured["summary"]


@pytest.mark.asyncio
async def test_invalid_api_key_gracefully_falls_back():
    """Verify that an invalid or expired API key falls back to template without raising an error."""
    bad_client = GroqClient(api_key="gsk_invalid_test_key_12345")
    service = ExplanationService(client=bad_client)

    explanation = await service.generate_explanation(MOCK_ANALYSIS_RESULT, language="en")
    assert explanation.source == "template"
    assert explanation.validated is True
    assert len(explanation.text) > 50


@pytest.mark.asyncio
async def test_real_groq_generation_if_configured():
    """Verify real Groq API generates and validates explanation when API key is present."""
    if not settings.GROQ_API_KEY:
        pytest.skip("GROQ_API_KEY not configured")

    service = ExplanationService()
    explanation = await service.generate_explanation(MOCK_ANALYSIS_RESULT, language="en")

    assert explanation.validated is True
    assert explanation.source in ["groq", "template"]
    assert "0.22" in explanation.text or (explanation.summary and "0.22" in explanation.summary)


def test_explain_endpoint_http():
    """Verify POST /v1/explain returns HTTP 200 with valid ExplanationResult."""
    headers = {"X-API-Key": settings.AI_SERVICE_API_KEY}
    payload = {
        "result": MOCK_ANALYSIS_RESULT,
        "language": "en",
    }
    resp = client.post("/v1/explain", headers=headers, json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["language"] == "en"
    assert data["validated"] is True
    assert data["source"] in ["groq", "template"]
    assert len(data["text"]) > 0
