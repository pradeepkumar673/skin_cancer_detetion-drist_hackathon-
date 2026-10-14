"""De-identified clinical facts builder for LLM explanation generation.

Rule 6: Never send patient identity or raw patient images to Groq.
Rule 4: The LLM only explains structured results. It never decides risk.
"""

from typing import Any, Dict, List, Optional, Union
import json


FORBIDDEN_KEYS = {
    "patient_id",
    "patientid",
    "patient_name",
    "patientname",
    "first_name",
    "last_name",
    "full_name",
    "email",
    "dob",
    "date_of_birth",
    "birth_date",
    "image",
    "image_b64",
    "mask_png_b64",
    "overlay_png_b64",
    "heatmap_png_b64",
    "phone",
    "address",
    "password",
    "ssn",
}


def assert_no_forbidden_fields(data: Any, path: str = "") -> None:
    """Recursively assert that no forbidden patient identifying or raw image fields exist."""
    if isinstance(data, dict):
        for key, value in data.items():
            lower_key = str(key).lower().replace("-", "_")
            if lower_key in FORBIDDEN_KEYS:
                raise ValueError(f"Forbidden field '{key}' detected at '{path}'. Patient data must be strictly de-identified.")
            assert_no_forbidden_fields(value, f"{path}.{key}" if path else key)
    elif isinstance(data, list):
        for idx, item in enumerate(data):
            assert_no_forbidden_fields(item, f"{path}[{idx}]")


def build_facts(
    result: Union[Dict[str, Any], Any],
    language: str = "en",
) -> Dict[str, Any]:
    """Construct a strictly de-identified facts dictionary from an AnalysisResponse or dict.

    Contains ONLY clinical parameters required for explanation synthesis.
    """
    if hasattr(result, "model_dump"):
        data = result.model_dump()
    elif isinstance(result, dict):
        data = result
    else:
        raise TypeError("result must be an AnalysisResponse instance or a dictionary")

    arbitration = data.get("arbitration", {})
    primary_team = arbitration.get("primary_team", "none")
    quality = data.get("quality", {})
    safety = data.get("safety", {})
    teams = data.get("teams", {})

    facts: Dict[str, Any] = {
        "language": language,
        "primary_team": primary_team,
        "quality": {
            "passed": quality.get("passed", False),
            "reasons": quality.get("reasons", []),
            "coach_tips": quality.get("coach_tips", []),
        },
        "safety": {
            "decision": safety.get("decision", "proceed"),
            "reasons": safety.get("reasons", []),
            "ood_flagged": safety.get("ood", {}).get("flagged", False),
            "agreement_score": safety.get("agreement", {}).get("score"),
            "agree_cells": safety.get("agreement", {}).get("agree_cells", 0),
            "disagree_cells": safety.get("agreement", {}).get("disagree_cells", 0),
        },
    }

    # Extract team-specific clinical parameters
    if primary_team == "cancer" and teams.get("cancer"):
        cancer = teams["cancer"]
        senior = cancer.get("senior", {})
        junior_a = cancer.get("junior_a", {})
        abcde = junior_a.get("abcde", {})

        facts["cancer"] = {
            "likelihood_point": round(float(senior.get("likelihood_point", 0.0)), 4),
            "likelihood_low": round(float(senior.get("likelihood_low", 0.0)), 4),
            "likelihood_high": round(float(senior.get("likelihood_high", 0.0)), 4),
            "band": senior.get("band", "low"),
            "urgency": senior.get("urgency", "routine_annual"),
            "warning_signs": senior.get("warning_signs", []),
            "likely_types": [
                {
                    "condition": lt.get("name") or lt.get("condition", ""),
                    "probability": round(float(lt.get("probability", 0.0)), 4),
                }
                for lt in junior_a.get("likely_types", [])
            ],
            "abcde": {
                "asymmetry": round(float(abcde.get("asymmetry", 0.0)), 4),
                "border": round(float(abcde.get("border", 0.0)), 4),
                "color_var": round(float(abcde.get("color_var", 0.0)), 4),
                "diameter_mm": round(float(abcde.get("diameter_mm", 0.0)), 2),
                "evolution": (
                    round(float(abcde["evolution"]), 4)
                    if abcde.get("evolution") is not None
                    else None
                ),
            },
        }

    elif primary_team == "ulcer" and teams.get("ulcer"):
        ulcer = teams["ulcer"]
        senior = ulcer.get("senior", {})
        junior_a = ulcer.get("junior_a", {})
        facts["ulcer"] = {
            "trajectory": senior.get("trajectory", "unknown"),
            "urgency": senior.get("urgency", "routine_visit"),
            "red_flags": senior.get("red_flags", []),
            "warning_signs": senior.get("warning_signs", []),
            "area_px": round(float(junior_a.get("area_px", 0.0)), 1),
            "area_cm2": (
                round(float(junior_a["area_cm2"]), 2)
                if junior_a.get("area_cm2") is not None
                else None
            ),
            "tissue": {
                k: round(float(v), 3)
                for k, v in junior_a.get("tissue", {}).items()
            },
            "periwound_redness_ratio": (
                round(float(junior_a["periwound_redness_ratio"]), 3)
                if junior_a.get("periwound_redness_ratio") is not None
                else None
            ),
        }

    elif primary_team == "disease" and teams.get("disease"):
        disease = teams["disease"]
        senior = disease.get("senior", {})
        facts["disease"] = {
            "abstained": senior.get("abstain", False),
            "urgency": senior.get("urgency", "routine_visit"),
            "warning_signs": senior.get("warning_signs", []),
            "top_conditions": [
                {
                    "condition": cond.get("condition", ""),
                    "confidence": round(float(cond.get("confidence", 0.0)), 4),
                }
                for cond in senior.get("top_conditions", [])
            ],
        }

    # Verify that facts structure is 100% de-identified
    assert_no_forbidden_fields(facts)

    return facts
