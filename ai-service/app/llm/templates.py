"""Deterministic multilingual template fallback for clinical report generation.

Languages supported: en (English), ta (Tamil), hi (Hindi).
"""

from pathlib import Path
from typing import Any, Dict, List, Tuple
import yaml

CONFIG_PATH = Path(__file__).resolve().parent.parent.parent / "config" / "report_templates.yaml"

_TEMPLATES_CACHE: Dict[str, Any] = {}


def load_templates() -> Dict[str, Any]:
    """Load report templates YAML."""
    global _TEMPLATES_CACHE
    if not _TEMPLATES_CACHE:
        if not CONFIG_PATH.exists():
            raise FileNotFoundError(f"Template configuration missing: {CONFIG_PATH}")
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            _TEMPLATES_CACHE = yaml.safe_load(f)
    return _TEMPLATES_CACHE


def format_template_explanation(
    facts: Dict[str, Any],
    language: str = "en",
) -> Tuple[str, Dict[str, Any]]:
    """Generate a deterministic, validated report using predefined clinical templates.

    Returns:
        (full_text, structured_dict)
    """
    templates = load_templates()
    lang = language.lower()
    if lang not in templates:
        lang = "en"

    t = templates[lang]
    primary_team = facts.get("primary_team", "none")
    safety = facts.get("safety", {})
    safety_decision = safety.get("decision", "proceed")

    summary_text = ""
    why_risk = ""
    key_findings: List[str] = []
    next_steps: List[str] = []
    urgency_action = "routine_annual"

    if safety_decision == "abstain" or primary_team == "none":
        summary_text = t.get("abstain_summary", "")
        why_risk = "Visual features did not meet clinical confidence criteria or quality thresholds."
        for r in safety.get("reasons", []):
            key_findings.append(f"Observation: {r}")
        urgency_action = "clinical_consultation"

    elif primary_team == "cancer" and "cancer" in facts:
        c = facts["cancer"]
        urgency_action = c.get("urgency", "routine_annual")
        summary_text = t.get("cancer_summary", "").format(
            band=c.get("band", "low"),
            point=c.get("likelihood_point", 0.0),
            low=c.get("likelihood_low", 0.0),
            high=c.get("likelihood_high", 0.0),
        )
        why_risk = f"Risk band: {c.get('band')}, estimated likelihood: {c.get('likelihood_point')} with uncertainty range {c.get('likelihood_low')} to {c.get('likelihood_high')}."
        
        abcde = c.get("abcde", {})
        key_findings.append(f"Asymmetry score: {abcde.get('asymmetry', 0.0)}")
        key_findings.append(f"Border irregularity: {abcde.get('border', 0.0)}")
        key_findings.append(f"Color variation: {abcde.get('color_var', 0.0)}")
        key_findings.append(f"Diameter: {abcde.get('diameter_mm', 0.0)} mm")
        for ws in c.get("warning_signs", []):
            key_findings.append(f"Warning sign: {ws}")

    elif primary_team == "ulcer" and "ulcer" in facts:
        u = facts["ulcer"]
        urgency_action = u.get("urgency", "routine_visit")
        tissue = u.get("tissue", {})
        summary_text = t.get("ulcer_summary", "").format(
            area_px=u.get("area_px", 0.0),
            area_cm2=u.get("area_cm2") if u.get("area_cm2") is not None else "N/A",
            granulation=round(tissue.get("granulation", 0.0) * 100, 1),
            slough=round(tissue.get("slough", 0.0) * 100, 1),
            necrotic=round(tissue.get("necrotic", 0.0) * 100, 1),
            trajectory=u.get("trajectory", "unknown"),
        )
        why_risk = f"Ulcer trajectory: {u.get('trajectory')}. Area: {u.get('area_px')} px."
        for rf in u.get("red_flags", []):
            key_findings.append(f"Red flag: {rf}")
        for ws in u.get("warning_signs", []):
            key_findings.append(f"Warning sign: {ws}")

    elif primary_team == "disease" and "disease" in facts:
        d = facts["disease"]
        urgency_action = d.get("urgency", "routine_visit")
        top_conds = d.get("top_conditions", [])
        top_name = top_conds[0]["condition"] if top_conds else "unspecified"
        top_conf = round(top_conds[0]["confidence"] * 100, 1) if top_conds else 0.0
        summary_text = t.get("disease_summary", "").format(
            top_condition=top_name,
            confidence=top_conf,
        )
        why_risk = f"Condition match: {top_name} with confidence {top_conf}%."
        for cond in top_conds:
            key_findings.append(f"Possible condition: {cond.get('condition')} ({round(cond.get('confidence', 0.0)*100, 1)}%)")

    urgency_text = t.get("urgency_recommendation", "").format(urgency_action=urgency_action)
    next_steps.append(urgency_text)

    disclaimer = t.get("disclaimer", "Decision support only. A normal or low-risk result never proves there is no problem. A doctor makes the diagnosis.")
    limitations = [disclaimer]

    structured: Dict[str, Any] = {
        "summary": summary_text,
        "key_findings": key_findings,
        "why_this_risk": why_risk,
        "next_steps": next_steps,
        "limitations": limitations,
    }

    # Format full readable text
    lines = [
        f"{t.get('header', 'SkinSentry Screening Report')}",
        "",
        f"Summary: {summary_text}",
        "",
        "Key Findings:",
    ]
    for kf in key_findings:
        lines.append(f"- {kf}")
    lines.append("")
    lines.append(f"Risk Assessment: {why_risk}")
    lines.append("")
    lines.append("Next Steps:")
    for ns in next_steps:
        lines.append(f"- {ns}")
    lines.append("")
    lines.append(f"Disclaimer: {disclaimer}")

    full_text = "\n".join(lines)
    return full_text, structured
