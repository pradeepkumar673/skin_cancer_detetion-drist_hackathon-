"""Tests for configuration loading and validation."""

import pytest
from pydantic import ValidationError

from app.config import Settings


def test_missing_api_key_fails(monkeypatch):
    """Ensure configuration fails with a clear message if AI_SERVICE_API_KEY is missing."""
    monkeypatch.delenv("AI_SERVICE_API_KEY", raising=False)
    # Instantiate Settings without env_file to test environment validation directly
    with pytest.raises((ValidationError, SystemExit, ValueError)):
        Settings(_env_file=None, AI_SERVICE_API_KEY="")


def test_device_auto_resolution(monkeypatch):
    """Verify DEVICE=auto resolves to cuda or cpu."""
    settings = Settings(_env_file=None, AI_SERVICE_API_KEY="test_key", DEVICE="auto")
    assert settings.resolved_device in ["cuda", "cpu"]


def test_device_explicit(monkeypatch):
    """Verify explicit DEVICE setting is preserved."""
    settings = Settings(_env_file=None, AI_SERVICE_API_KEY="test_key", DEVICE="cpu")
    assert settings.resolved_device == "cpu"
