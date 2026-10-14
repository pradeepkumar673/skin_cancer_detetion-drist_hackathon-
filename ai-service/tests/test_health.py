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


def test_analyze_with_valid_key_missing_params():
    """Verify /v1/analyze returns HTTP 422 when required image file is missing."""
    response = client.post(
        "/v1/analyze", headers={"X-API-Key": settings.AI_SERVICE_API_KEY}
    )
    assert response.status_code == 422
    data = response.json()
    assert data["error"] == "validation_error"
    assert "request_id" in data


def test_analyze_with_valid_key():
    """Verify /v1/analyze returns HTTP 200 and valid schema when supplied with a sharp test image."""
    from io import BytesIO
    from PIL import Image

    # Create sharp test image
    img = Image.new("RGB", (256, 256), color=(180, 130, 110))
    buf = BytesIO()
    img.save(buf, format="JPEG")
    buf.seek(0)

    response = client.post(
        "/v1/analyze",
        headers={"X-API-Key": settings.AI_SERVICE_API_KEY},
        files={"image": ("lesion.jpg", buf, "image/jpeg")},
    )
    assert response.status_code == 200
    data = response.json()
    assert "request_id" in data
    assert "quality" in data
    assert "nurses" in data
    assert "teams" in data
    assert "safety" in data
    assert "arbitration" in data
