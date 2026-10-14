"""Validation of LLM-generated explanations against facts and clinical safety constraints.

Rules:
- Rule 1: No fake or invented numbers. Every number must match input facts.
- Rule 4: The LLM only explains structured results. It never decides risk.
- Rule 10: "Decision support only. A normal or low-risk result never proves there is no problem. A doctor makes the diagnosis."
- Banned phrases check from config/banned_phrases.yaml.
"""

from pathlib import Path
import re
from typing import Any, Dict, List, Set, Tuple
from pydantic import BaseModel, Field, ValidationError
import yaml

CONFIG_PATH = Path(__file__).resolve().parent.parent.parent / "config" / "banned_phrases.yaml"

_BANNED_PHRASES: List[str] = []


def load_banned_phrases() -> List[str]:
    """Load banned diagnostic phrases from configuration."""
    global _BANNED_PHRASES
    if not _BANNED_PHRASES:
        if CONFIG_PATH.exists():
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                data = yaml.safe_load(f)
                _BANNED_PHRASES = data.get("banned_phrases", [])
        else:
            _BANNED_PHRASES = [
                "you have cancer",
                "you are diagnosed",
                "diagnosis is",
                "we diagnose",
                "you definitely have",
                "proven to be",
                "confirm cancer",
                "diagnostic confirmation",
                "guaranteed benign",
                "no medical problem",
            ]
    return _BANNED_PHRASES


class StructuredExplanation(BaseModel):
    """Schema for LLM structured JSON response."""

    summary: str = Field(..., description="Overview of screening findings")
    key_findings: List[str] = Field(default_factory=list, description="List of key observations")
    why_this_risk: str = Field(..., description="Explanation of risk level and parameters")
    next_steps: List[str] = Field(default_factory=list, description="Recommended next actions")
    limitations: List[str] = Field(default_factory=list, description="Clinical disclaimers")


def extract_numbers_from_facts(facts: Any) -> Set[str]:
    """Extract all valid string representations of numbers present in the facts."""
    numbers: Set[str] = set()

    def _collect(val: Any) -> None:
        if isinstance(val, (int, float)) and not isinstance(val, bool):
            num = float(val)
            # Add exact representations
            numbers.add(str(val))
            numbers.add(f"{num:.1f}")
            numbers.add(f"{num:.2f}")
            numbers.add(f"{num:.3f}")
            numbers.add(f"{num:.4f}")
            numbers.add(str(int(num)))
            # Add percentage representations for probabilities / ratios
            if 0.0 <= num <= 1.0:
                pct = num * 100.0
                numbers.add(f"{pct:.0f}%")
                numbers.add(f"{pct:.1f}%")
                numbers.add(f"{pct:.2f}%")
                numbers.add(f"{pct:.0f}")
                numbers.add(f"{pct:.1f}")
        elif isinstance(val, dict):
            for v in val.values():
                _collect(v)
        elif isinstance(val, list):
            for v in val:
                _collect(v)

    _collect(facts)

    # Standard benign structural constants (e.g. list numbering, ABCDE counts)
    numbers.update({"0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"})
    return numbers


def extract_numbers_from_text(text: str) -> List[str]:
    """Extract numeric tokens from text, excluding list markers like '1.' at start of lines."""
    # Remove markdown/list prefixes like '1. ', '2. '
    cleaned = re.sub(r'(?:^|\n)\s*\d+[\.\)]\s*', ' ', text)
    # Find all digits with optional decimal point and optional percent sign
    tokens = re.findall(r'\b\d+(?:\.\d+)?%?', cleaned)
    return tokens


def validate_explanation(
    content: str,
    facts: Dict[str, Any],
) -> Tuple[bool, List[str], Dict[str, Any]]:
    """Validate LLM output against facts and safety rules.

    Returns:
        (is_valid, error_messages, parsed_data)
    """
    errors: List[str] = []
    parsed_dict: Dict[str, Any] = {}

    # 1. Schema parsing
    try:
        import json
        raw_json = json.loads(content)
        parsed = StructuredExplanation(**raw_json)
        parsed_dict = parsed.model_dump()
    except Exception as exc:
        errors.append(f"JSON schema validation failed: {exc}")
        return False, errors, {}

    # Combine all text fields for text-level validation
    all_text = " ".join([
        parsed_dict["summary"],
        " ".join(parsed_dict["key_findings"]),
        parsed_dict["why_this_risk"],
        " ".join(parsed_dict["next_steps"]),
        " ".join(parsed_dict["limitations"]),
    ])

    # 2. Check banned diagnostic phrases (Rule 10, Rule 4)
    banned = load_banned_phrases()
    text_lower = all_text.lower()
    for phrase in banned:
        if phrase.lower() in text_lower:
            errors.append(f"Prohibited diagnostic phrase detected: '{phrase}'")

    # 3. Check for mandatory decision-support disclaimer (Rule 10)
    disclaimer_keywords = [
        "doctor",
        "physician",
        "decision support",
        "healthcare professional",
        "மருத்துவர்",
        "முடிவு ஆதரவு",
        "चिकित्सक",
        "डॉक्टर",
        "निर्णय",
    ]
    has_disclaimer = any(kw in text_lower for kw in disclaimer_keywords)
    if not has_disclaimer:
        errors.append("Mandatory clinical disclaimer missing (must state decision support or doctor makes diagnosis).")

    # 4. Check numbers in output vs input facts (Rule 1, Rule 2)
    allowed_numbers = extract_numbers_from_facts(facts)
    found_numbers = extract_numbers_from_text(all_text)

    for num_str in found_numbers:
        # Check direct match
        clean_num = num_str.rstrip("%")
        matched = (
            num_str in allowed_numbers
            or clean_num in allowed_numbers
        )
        if not matched:
            # Check numerical equivalence
            try:
                val = float(clean_num)
                # Check if val matches any allowed float
                for allowed in allowed_numbers:
                    try:
                        if abs(val - float(allowed.rstrip("%"))) < 0.05:
                            matched = True
                            break
                    except ValueError:
                        continue
            except ValueError:
                pass

        if not matched:
            errors.append(f"Hallucinated or unverified number in output: '{num_str}'")

    is_valid = len(errors) == 0
    return is_valid, errors, parsed_dict
