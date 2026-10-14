"""Tests for the image quality gate."""

import numpy as np
from PIL import Image
import pytest

from app.pipeline.quality import assess_quality


def test_quality_gate_passes_on_sharp_image():
    """Verify that a well-lit, sharp image with rich texture passes the quality gate."""
    # Create a synthetic image with high contrast and sharp gradients (checkered pattern)
    arr = np.zeros((300, 300, 3), dtype=np.uint8)
    for i in range(0, 300, 30):
        for j in range(0, 300, 30):
            if (i // 30 + j // 30) % 2 == 0:
                arr[i:i+30, j:j+30] = [180, 140, 120]
            else:
                arr[i:i+30, j:j+30] = [80, 50, 40]
    
    img = Image.fromarray(arr)
    result = assess_quality(img)

    assert result.passed is True
    assert len(result.reasons) == 0
    assert result.blur > 45.0
    assert result.width == 300
    assert result.height == 300


def test_quality_gate_fails_on_blurry_flat_image():
    """Verify that a uniform/flat blurred image fails with blur and low contrast reasons."""
    # Uniform grey image has zero variance of Laplacian and zero contrast
    arr = np.full((300, 300, 3), 120, dtype=np.uint8)
    img = Image.fromarray(arr)
    result = assess_quality(img)

    assert result.passed is False
    assert "blur_detected" in result.reasons
    assert "low_contrast" in result.reasons
    assert len(result.coach_tips) >= 1


def test_quality_gate_fails_on_too_dark():
    """Verify that an underexposed image triggers the too_dark reason."""
    arr = np.full((300, 300, 3), 10, dtype=np.uint8)
    img = Image.fromarray(arr)
    result = assess_quality(img)

    assert result.passed is False
    assert "too_dark" in result.reasons
    assert any("light" in tip.lower() for tip in result.coach_tips)


def test_quality_gate_fails_on_resolution_too_low():
    """Verify that a tiny image triggers resolution_too_low."""
    arr = np.full((100, 100, 3), 128, dtype=np.uint8)
    img = Image.fromarray(arr)
    result = assess_quality(img)

    assert result.passed is False
    assert "resolution_too_low" in result.reasons


@pytest.mark.asyncio
async def test_quality_endpoint_authenticated():
    """Verify POST /v1/quality with valid API key returns 200 and quality metrics."""
    import io
    from httpx import ASGITransport, AsyncClient
    from app.config import get_settings
    from app.main import app

    settings = get_settings()

    # Generate a sample image in memory
    arr = np.full((250, 250, 3), 120, dtype=np.uint8)
    # Put a centered contrasting circle
    y, x = np.ogrid[:250, :250]
    arr[(x - 125)**2 + (y - 125)**2 <= 40**2] = [40, 20, 10]
    img = Image.fromarray(arr)
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    buf.seek(0)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.post(
            "/v1/quality",
            headers={"X-API-Key": settings.AI_SERVICE_API_KEY},
            files={"image": ("test.jpg", buf, "image/jpeg")},
        )
    assert response.status_code == 200
    data = response.json()
    assert "passed" in data
    assert "blur" in data
    assert "brightness" in data
    assert "contrast" in data
    assert data["width"] == 250
    assert data["height"] == 250
