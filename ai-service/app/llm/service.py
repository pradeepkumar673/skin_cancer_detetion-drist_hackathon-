"""Explanation generation service integrating Groq LLM, safety validation, and deterministic fallbacks.

Rules:
- Rule 4: The LLM only explains structured results. It never decides risk.
- Rule 6: Never send patient identity or raw patient images to Groq.
- Rule 10: Decision support disclaimer is mandatory.
"""

import json
import logging
from pathlib import Path
from typing import Any, Dict, Optional, Tuple, Union

from app.llm.groq_client import GroqClient
from app.llm.report import build_facts
from app.llm.templates import format_template_explanation
from app.llm.validator import validate_explanation
from app.schemas import ExplanationResult

logger = logging.getLogger("skinsentry.llm.service")

PROMPTS_DIR = Path(__file__).resolve().parent / "prompts"

LANGUAGE_NAMES = {
    "en": "English",
    "ta": "Tamil",
    "hi": "Hindi",
}


def _load_prompt(filename: str) -> str:
    path = PROMPTS_DIR / filename
    if not path.exists():
        raise FileNotFoundError(f"Prompt template missing: {path}")
    return path.read_text(encoding="utf-8")


def _format_composite_text(parsed: Dict[str, Any]) -> str:
    """Format structured fields into a coherent readable clinical report text."""
    lines = [
        f"Summary: {parsed.get('summary', '')}",
        "",
        "Key Findings:",
    ]
    for kf in parsed.get("key_findings", []):
        lines.append(f"- {kf}")
    lines.append("")
    lines.append(f"Risk Assessment: {parsed.get('why_this_risk', '')}")
    lines.append("")
    lines.append("Next Steps:")
    for ns in parsed.get("next_steps", []):
        lines.append(f"- {ns}")
    lines.append("")
    lines.append("Clinical Limitations & Disclaimer:")
    for lim in parsed.get("limitations", []):
        lines.append(f"- {lim}")
    return "\n".join(lines)


class ExplanationService:
    """High-level service coordinating LLM generation, validation, and deterministic fallback."""

    def __init__(self, client: Optional[GroqClient] = None):
        self.client = client or GroqClient()
        self.system_prompt = _load_prompt("explanation_system.txt")
        self.user_prompt_template = _load_prompt("explanation_user.txt")

    async def generate_explanation(
        self,
        result: Union[Dict[str, Any], Any],
        language: str = "en",
    ) -> ExplanationResult:
        """Generate a validated clinical explanation in the requested language.

        Falls back gracefully to deterministic templates if Groq is unavailable
        or fails validation after retry.
        """
        lang = language.lower() if language else "en"
        if lang not in LANGUAGE_NAMES:
            lang = "en"

        # 1. Build strictly de-identified clinical facts
        try:
            facts = build_facts(result, language=lang)
        except Exception as exc:
            logger.error("Failed to build de-identified facts: %s", exc)
            full_text, structured = format_template_explanation({}, language=lang)
            return ExplanationResult(
                language=lang,
                text=full_text,
                source="template",
                validated=True,
                summary=structured.get("summary"),
                key_findings=structured.get("key_findings"),
                why_this_risk=structured.get("why_this_risk"),
                next_steps=structured.get("next_steps"),
                limitations=structured.get("limitations"),
            )

        # 2. Check if Groq client is configured
        if not self.client.is_configured:
            logger.info("Groq API not configured; using deterministic clinical template.")
            full_text, structured = format_template_explanation(facts, language=lang)
            return ExplanationResult(
                language=lang,
                text=full_text,
                source="template",
                validated=True,
                summary=structured.get("summary"),
                key_findings=structured.get("key_findings"),
                why_this_risk=structured.get("why_this_risk"),
                next_steps=structured.get("next_steps"),
                limitations=structured.get("limitations"),
            )

        # 3. Format user prompt
        facts_json = json.dumps(facts, indent=2)
        user_content = self.user_prompt_template.format(
            language_name=LANGUAGE_NAMES[lang],
            language_code=lang,
            facts_json=facts_json,
        )

        messages = [
            {"role": "system", "content": self.system_prompt},
            {"role": "user", "content": user_content},
        ]

        # 4. Attempt Groq generation with 1 retry on validation failure
        try:
            raw_response = await self.client.complete_chat_json(messages)
            is_valid, errors, parsed_dict = validate_explanation(raw_response, facts)

            if not is_valid:
                logger.warning(
                    "Groq explanation failed initial validation: %s. Retrying with feedback...",
                    errors,
                )
                retry_messages = list(messages)
                retry_messages.append({"role": "assistant", "content": raw_response})
                retry_messages.append({
                    "role": "user",
                    "content": (
                        "Your response had clinical validation errors:\n"
                        + "\n".join(f"- {err}" for err in errors)
                        + "\nPlease correct these errors and generate a strictly compliant JSON response matching all safety rules."
                    ),
                })
                raw_response = await self.client.complete_chat_json(retry_messages)
                is_valid, errors, parsed_dict = validate_explanation(raw_response, facts)

            if is_valid and parsed_dict:
                composite_text = _format_composite_text(parsed_dict)
                return ExplanationResult(
                    language=lang,
                    text=composite_text,
                    source="groq",
                    validated=True,
                    summary=parsed_dict.get("summary"),
                    key_findings=parsed_dict.get("key_findings"),
                    why_this_risk=parsed_dict.get("why_this_risk"),
                    next_steps=parsed_dict.get("next_steps"),
                    limitations=parsed_dict.get("limitations"),
                )
            else:
                logger.warning(
                    "Groq explanation failed validation after retry (%s). Falling back to deterministic template.",
                    errors,
                )

        except Exception as exc:
            logger.warning("Groq API call failed (%s). Falling back to deterministic template.", exc)

        # 5. Deterministic fallback
        full_text, structured = format_template_explanation(facts, language=lang)
        return ExplanationResult(
            language=lang,
            text=full_text,
            source="template",
            validated=True,
            summary=structured.get("summary"),
            key_findings=structured.get("key_findings"),
            why_this_risk=structured.get("why_this_risk"),
            next_steps=structured.get("next_steps"),
            limitations=structured.get("limitations"),
        )


_service_instance: Optional[ExplanationService] = None


def get_explanation_service() -> ExplanationService:
    """Singleton getter for ExplanationService."""
    global _service_instance
    if _service_instance is None:
        _service_instance = ExplanationService()
    return _service_instance
