"""Asynchronous Groq API client with backoff retries and model verification.

Follows OpenAI-compatible chat completions interface.
"""

import asyncio
import logging
from typing import Any, Dict, List, Optional
import httpx

from app.config import get_settings

logger = logging.getLogger("skinsentry.llm.groq")


class GroqClient:
    """Async HTTP client for Groq Chat Completions API."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        model: Optional[str] = None,
        timeout: float = 30.0,
        max_retries: int = 3,
    ):
        settings = get_settings()
        self.api_key = api_key if api_key is not None else settings.GROQ_API_KEY
        self.base_url = (base_url or settings.GROQ_BASE_URL or "https://api.groq.com/openai/v1").rstrip("/")
        self.model = model or settings.GROQ_MODEL or "llama-3.3-70b-versatile"
        self.timeout = timeout
        self.max_retries = max_retries

    @property
    def is_configured(self) -> bool:
        """Check if Groq API key is present."""
        return bool(self.api_key and self.api_key.strip())

    async def verify_model_available(self) -> bool:
        """Check if configured model exists in Groq's available models list."""
        if not self.is_configured:
            logger.warning("GROQ_API_KEY is not configured; model verification skipped.")
            return False

        url = f"{self.base_url}/models"
        headers = {"Authorization": f"Bearer {self.api_key}"}

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(url, headers=headers)
                if resp.status_code == 200:
                    data = resp.json()
                    model_ids = [m.get("id") for m in data.get("data", [])]
                    if self.model in model_ids:
                        logger.info("Groq model verified: %s is available.", self.model)
                        return True
                    else:
                        logger.warning(
                            "Configured GROQ_MODEL '%s' not found in available Groq models (%s).",
                            self.model,
                            model_ids[:5],
                        )
                        return False
                else:
                    logger.warning("Groq /models check returned status %d: %s", resp.status_code, resp.text)
                    return False
        except Exception as exc:
            logger.warning("Groq model verification failed: %s", exc)
            return False

    async def complete_chat_json(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.2,
        max_tokens: int = 1024,
    ) -> str:
        """Call chat completions expecting a JSON object response with exponential backoff."""
        if not self.is_configured:
            raise ValueError("GROQ_API_KEY is not configured.")

        url = f"{self.base_url}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self.model,
            "messages": messages,
            "response_format": {"type": "json_object"},
            "temperature": temperature,
            "max_tokens": max_tokens,
        }

        delay = 1.0
        last_error: Optional[Exception] = None

        for attempt in range(1, self.max_retries + 1):
            try:
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    resp = await client.post(url, headers=headers, json=payload)

                    if resp.status_code == 200:
                        data = resp.json()
                        choices = data.get("choices", [])
                        if not choices:
                            raise ValueError("Groq returned empty choices array.")
                        content = choices[0].get("message", {}).get("content", "")
                        return content

                    if resp.status_code in (429, 500, 502, 503, 504):
                        logger.warning(
                            "Groq API error HTTP %d (attempt %d/%d). Retrying in %.1fs...",
                            resp.status_code,
                            attempt,
                            self.max_retries,
                            delay,
                        )
                        await asyncio.sleep(delay)
                        delay *= 2.0
                        continue

                    # Client errors (400, 401, 403, etc.) fail immediately
                    resp.raise_for_status()

            except (httpx.TimeoutException, httpx.NetworkError) as net_err:
                logger.warning(
                    "Groq network error: %s (attempt %d/%d). Retrying in %.1fs...",
                    net_err,
                    attempt,
                    self.max_retries,
                    delay,
                )
                last_error = net_err
                if attempt < self.max_retries:
                    await asyncio.sleep(delay)
                    delay *= 2.0
                else:
                    raise last_error

            except Exception as exc:
                last_error = exc
                raise exc

        raise RuntimeError(f"Groq API call failed after {self.max_retries} attempts: {last_error}")
