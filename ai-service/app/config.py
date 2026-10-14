"""Configuration management for the SkinSentry AI service.

Loads typed settings from environment variables and .env file.
"""

from pathlib import Path
from typing import List, Optional
import sys
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings with environment validation."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    AI_SERVICE_API_KEY: str
    GROQ_API_KEY: Optional[str] = None
    GROQ_MODEL: Optional[str] = None
    GROQ_BASE_URL: str = "https://api.groq.com/openai/v1"
    HF_TOKEN: Optional[str] = None
    MAX_UPLOAD_MB: int = 10
    MODELS_ARCHIVE_URL: Optional[str] = None
    DEVICE: str = "auto"
    MODELS_DIR: str = "../models"
    DATA_DIR: str = "../data"
    LOG_LEVEL: str = "INFO"

    @field_validator("AI_SERVICE_API_KEY")
    @classmethod
    def validate_api_key(cls, value: Optional[str]) -> str:
        """Ensure AI_SERVICE_API_KEY is defined and non-empty."""
        if not value or not value.strip():
            raise ValueError(
                "AI_SERVICE_API_KEY is missing or empty. "
                "Provide AI_SERVICE_API_KEY in .env or system environment."
            )
        return value.strip()

    @property
    def resolved_device(self) -> str:
        """Resolve device string: auto resolves to cuda if torch is installed and CUDA is available, else cpu."""
        if self.DEVICE.lower() == "auto":
            try:
                import torch
                return "cuda" if torch.cuda.is_available() else "cpu"
            except ImportError:
                return "cpu"
        return self.DEVICE.lower()

    @property
    def required_model_files(self) -> List[str]:
        """List of required model file paths relative to MODELS_DIR."""
        return [
            "nurses/ulcer_nurse.joblib",
            "nurses/disease_nurse.joblib",
            "nurses/cancer_nurse.joblib",
            "nurses/ood.joblib",
            "cancer/junior_a_classifier.joblib",
            "ulcer/unet.pt",
            "disease/junior_a_classifier.joblib",
            "cancer/junior_b.joblib",
            "ulcer/junior_b.joblib",
            "disease/junior_b.joblib",
            "cancer/senior_meta.joblib",
            "disease/senior_meta.joblib",
        ]


_settings_instance: Optional[Settings] = None


def get_settings() -> Settings:
    """Retrieve or initialize application settings.

    Fails with a clear message at startup if required configuration is missing.
    """
    global _settings_instance
    if _settings_instance is None:
        try:
            _settings_instance = Settings()
        except Exception as exc:
            print(f"FATAL: Application configuration failure: {exc}", file=sys.stderr)
            raise SystemExit(f"Configuration error: {exc}") from exc
    return _settings_instance
