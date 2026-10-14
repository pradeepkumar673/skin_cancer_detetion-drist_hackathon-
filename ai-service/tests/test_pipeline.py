"""End-to-end integration tests for orchestrator and POST /v1/analyze endpoint.

Implements Step 15 test suite:
1. End-to-end clinical pipeline execution on sharp lesion image.
2. Blurry/degraded image returns decision='abstain' with coach tips.
3. Content-type enforcement rejects unsupported media types with HTTP 415.
4. Payload size limit enforcement rejects oversize images with HTTP 413.
5. Missing prior image gracefully produces null change with reason, not an unhandled exception.
"""

from io import BytesIO
import numpy as np
from PIL import Image, ImageFilter
import pytest
from starlette.testclient import TestClient

from app.config import get_settings
from app.main import app
from app.pipeline.orchestrator import run_pipeline

settings = get_settings()
client = TestClient(app)


def test_pipeline_execution_sharp_image():
    """Verify run_pipeline completes and returns valid AnalysisResponse schema."""
    # Create synthetic sharp lesion image
    arr = np.full((256, 256, 3), 190, dtype=np.uint8)
    y, x = np.ogrid[:256, :256]
    lesion = (x - 128) ** 2 + (y - 128) ** 2 <= 45 ** 2
    arr[lesion] = [80, 40, 30]

    pil_img = Image.fromarray(arr)
    response = run_pipeline(image=pil_img, request_id="test-sharp-001")

    assert response.request_id == "test-sharp-001"
    assert response.quality.passed is True
    assert response.safety.decision in ["proceed", "escalate", "abstain"]
    assert response.arbitration.primary_team in ["cancer", "ulcer", "disease", "none"]
    assert response.artifacts.heatmap_png_b64 != ""


def test_pipeline_abstains_on_blurry_image():
    """Verify pipeline halts early with decision 'abstain' and coach tips on blurry input."""
    # Flat/blurry image
    arr = np.full((256, 256, 3), 128, dtype=np.uint8)
    pil_img = Image.fromarray(arr)

    response = run_pipeline(image=pil_img, request_id="test-blurry-001")

    assert response.quality.passed is False
    assert response.safety.decision == "abstain"
    assert len(response.quality.coach_tips) > 0


def test_analyze_endpoint_e2e_success():
    """Verify POST /v1/analyze returns HTTP 200 with valid contract."""
    arr = np.full((256, 256, 3), 180, dtype=np.uint8)
    y, x = np.ogrid[:256, :256]
    lesion = (x - 128) ** 2 + (y - 128) ** 2 <= 40 ** 2
    arr[lesion] = [90, 45, 35]

    buf = BytesIO()
    Image.fromarray(arr).save(buf, format="JPEG")
    buf.seek(0)

    res = client.post(
        "/v1/analyze",
        headers={"X-API-Key": settings.AI_SERVICE_API_KEY},
        files={"image": ("lesion.jpg", buf, "image/jpeg")},
        data={"language": "en"},
    )
    assert res.status_code == 200
    data = res.json()

    assert data["quality"]["passed"] is True
    assert "cancer" in data["nurses"]
    assert "arbitration" in data
    assert "artifacts" in data


def test_analyze_endpoint_unsupported_media_type_415():
    """Verify HTTP 415 returned for non-image files."""
    dummy_pdf = BytesIO(b"%PDF-1.4 dummy pdf content")

    res = client.post(
        "/v1/analyze",
        headers={"X-API-Key": settings.AI_SERVICE_API_KEY},
        files={"image": ("document.pdf", dummy_pdf, "application/pdf")},
    )
    assert res.status_code == 415
    data = res.json()
    assert data["error"] == "unsupported_media_type"


def test_analyze_endpoint_payload_too_large_413():
    """Verify HTTP 413 returned when image exceeds 10MB limit."""
    oversize = BytesIO(b"0" * (11 * 1024 * 1024))  # 11 MB

    res = client.post(
        "/v1/analyze",
        headers={"X-API-Key": settings.AI_SERVICE_API_KEY},
        files={"image": ("huge.jpg", oversize, "image/jpeg")},
    )
    assert res.status_code == 413
    data = res.json()
    assert data["error"] == "payload_too_large"


def test_missing_prior_gives_null_change_without_error():
    """Verify that omitting prior_image gracefully returns null change without error."""
    arr = np.full((256, 256, 3), 180, dtype=np.uint8)
    pil_img = Image.fromarray(arr)

    response = run_pipeline(image=pil_img, prior_image=None)
    assert response.quality is not None
    if response.teams.cancer and response.teams.cancer.junior_b:
        assert response.teams.cancer.junior_b.change is None
