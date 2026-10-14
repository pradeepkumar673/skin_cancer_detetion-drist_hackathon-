"""Integration and security tests for /health and /v1/analyze endpoints."""

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app

client = TestClient(app)
settings = get_settings()


def test_health_without_key():
    """Verify /health returns HTTP 200 without requiring API key."""
    response = client.get("/health")
    assert response.status_code == 200

    data = response.json()
    assert data["status"] == "ok"
    assert data["device"] in ["cpu", "cuda"]
    assert isinstance(data["models"], list)
    assert len(data["models"]) == len(settings.required_model_files)

    # Verify model statuses accurately reflect files on disk
    model_map = {m["name"]: m["exists"] for m in data["models"]}
    # Nurse files were trained in Step 9 and must report exists: true
    assert model_map.get("nurses/cancer_nurse.joblib") is True
    assert model_map.get("nurses/ulcer_nurse.joblib") is True
    assert model_map.get("nurses/disease_nurse.joblib") is True

    assert "python_version" in data
    assert "package_versions" in data
    assert "X-Request-ID" in response.headers


def test_analyze_without_key():
    """Verify /v1/analyze returns HTTP 401 when X-API-Key is missing."""
    response = client.post("/v1/analyze")
    assert response.status_code == 401

    data = response.json()
    assert data["error"] == "unauthorized"
    assert "request_id" in data


def test_analyze_with_wrong_key():
    """Verify /v1/analyze returns HTTP 403 when X-API-Key is incorrect."""
    response = client.post("/v1/analyze", headers={"X-API-Key": "invalid_wrong_key"})
    assert response.status_code == 403

    data = response.json()
    assert data["error"] == "forbidden"
    assert "request_id" in data


def test_analyze_with_valid_key():
    """Verify /v1/analyze returns HTTP 503 models_not_loaded when authorized."""
    response = client.post(
        "/v1/analyze", headers={"X-API-Key": settings.AI_SERVICE_API_KEY}
    )
    assert response.status_code == 503

    data = response.json()
    assert data["error"] == "models_not_loaded"
    assert "request_id" in data
