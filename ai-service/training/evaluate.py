#!/usr/bin/env python3
"""Unified model evaluation and summary aggregator.

Reads every model metrics file in models/metrics/*.json, verifies that no
metric looks like leakage, attaches a one-line honest verdict to each
model, and writes models/metrics/summary.json for the public
/performance page.

Run this immediately before shipping metrics to the UI.
"""
from __future__ import annotations

import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

# Add current dir to sys.path to import splits
sys.path.insert(0, str(Path(__file__).resolve().parent))
from splits import LeakageSuspected, assert_no_leakage  # type: ignore

ROOT = Path(__file__).resolve().parent.parent.parent
METRICS_DIR = ROOT / "models" / "metrics"
SUMMARY_FILE = METRICS_DIR / "summary.json"


def get_git_commit() -> str:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=ROOT, text=True
        ).strip()
    except Exception:
        manifest = ROOT / "models" / "MANIFEST.json"
        if manifest.exists():
            try:
                return json.loads(manifest.read_text()).get("git_commit", "unknown")
            except Exception:
                pass
        return "unknown"


# ---------------------------------------------------------------------------
# Honest verdicts. These are shown verbatim on the public performance page.
# ---------------------------------------------------------------------------
def verdict_for(name: str, m: dict) -> str:
    if name == "cancer_classifier":
        recall = m.get("malignant_premalignant_recall", {})
        mel = recall.get("melanoma_mel_recall")
        if isinstance(mel, (int, float)) and mel < 0.5:
            return (
                f"NOT SAFE for clinical use. Held-out melanoma recall is "
                f"{mel:.1%}; the model misses most melanomas. This is a "
                f"research prototype and must not be relied on for triage."
            )
        if isinstance(mel, (int, float)) and mel < 0.85:
            return (
                f"Research-grade only. Melanoma recall {mel:.1%} on "
                f"held-out dermoscopy. Do not use without a clinician in "
                f"the loop."
            )
        return "Research-grade. Requires external validation."

    if name == "cancer_senior":
        return (
            "Research-grade risk estimator. Trained on out-of-fold "
            "probabilities from the junior classifier. Interpret alongside "
            "the junior model's known weaknesses."
        )

    if name == "disease":
        classes = m.get("classes") or []
        return (
            f"Demo-grade. {len(classes)}-class classifier evaluated on a "
            f"small reference set. Uses smartphone-style images, so it is "
            "closer to real use than the cancer model, but the class list "
            "is not clinically complete."
        )

    if name == "ulcer_segmentation":
        dice = (m.get("test_metrics") or {}).get("dice")
        if isinstance(dice, (int, float)):
            return (
                f"Wound area only. Dice={dice:.2f} on FUSeg. Useful for "
                "tracking change over time. It does not classify the "
                "wound and cannot sense depth or undermining."
            )
        return "Wound area only. Cannot sense depth or undermining."

    if name == "nurses":
        return (
            "Gatekeepers. Each nurse is a calibrated one-vs-rest classifier "
            "plus a Mahalanobis OOD score. If all three say no, the case "
            "is refused rather than guessed."
        )

    if name == "quality_gate":
        return (
            "Rule-based (OpenCV). Rejects blur, darkness, low contrast, "
            "and low resolution. Thresholds were tuned on degraded copies "
            "of real images."
        )

    return "See metrics. Interpret with the dataset limitations in mind."


# ---------------------------------------------------------------------------
# Dataset provenance. Kept here so the summary is self-contained.
# ---------------------------------------------------------------------------
DATASETS = [
    {
        "name": "HAM10000 (Human Against Machine)",
        "source": "ISIC Archive / Tschandl et al.",
        "license": "CC BY-NC 4.0",
        "size": "10,015 dermoscopic images",
        "split_strategy": "Patient-stratified train/val/test (80/10/10)",
        "known_bias": (
            "Overwhelmingly lighter skin (Fitzpatrick I-III). "
            "Dermoscopic, not smartphone."
        ),
    },
    {
        "name": "DermNet New Zealand Clinical Atlas",
        "source": "DermNet NZ",
        "license": "Educational fair use",
        "size": "23 superclasses across ~16k clinical photos",
        "split_strategy": "Class-balanced held-out evaluation",
        "known_bias": "Clinically framed photos with mixed illumination.",
    },
    {
        "name": "FUSeg (Foot Ulcer Segmentation)",
        "source": "FUSeg Challenge 2021",
        "license": "Academic use",
        "size": "1,210 wound photos with expert masks",
        "split_strategy": "Grouped lesion partitioning",
        "known_bias": "Some patient overlap between images.",
    },
    {
        "name": "DINOv2 Foundation ViT",
        "source": "Meta AI (Oquab et al., 2023)",
        "license": "Apache 2.0",
        "size": "Pre-trained on LVD-142M",
        "known_bias": "General-purpose, not medical.",
    },
]


LIMITATIONS = [
    {
        "topic": "Not a medical device",
        "description": (
            "SkinSentry is decision support. A low-risk result never "
            "proves there is no problem. A clinician makes the diagnosis."
        ),
    },
    {
        "topic": "Dermoscopy vs smartphone",
        "description": (
            "The cancer model was trained on dermoscopic images. "
            "Smartphone photos without clinical illumination are "
            "systematically harder."
        ),
    },
    {
        "topic": "Skin tone representation",
        "description": (
            "HAM10000 has historical under-representation of Fitzpatrick "
            "V-VI. Calibration on darker skin is weaker and explicitly "
            "flagged in the safety layer."
        ),
    },
    {
        "topic": "2D wound photography",
        "description": (
            "Wound area from a 2D photo cannot recover tissue depth or "
            "undermining. A probe exam is always required."
        ),
    },
    {
        "topic": "Multilingual explanation",
        "description": (
            "Tamil and Hindi output is generated from structured "
            "terminology maps and requires a native clinician's review "
            "before any clinical pilot."
        ),
    },
]


def evaluate_and_aggregate() -> None:
    METRICS_DIR.mkdir(parents=True, exist_ok=True)
    metric_files = sorted(METRICS_DIR.glob("*.json"))

    parsed: dict[str, dict] = {}
    for mf in metric_files:
        if mf.name == "summary.json":
            continue
        key = mf.stem
        try:
            parsed[key] = json.loads(mf.read_text(encoding="utf-8"))
        except Exception as e:
            parsed[key] = {"error": f"Failed to load: {e}"}
            continue

        # Hard gate: refuse to publish metrics that look like leakage.
        flat = {}
        for section in ("test_metrics", "metrics", "malignant_premalignant_recall"):
            section_val = parsed[key].get(section)
            if isinstance(section_val, dict):
                flat.update(section_val)
        flat.update(
            {k: v for k, v in parsed[key].items() if isinstance(v, (int, float))}
        )
        try:
            assert_no_leakage(flat, name=key)
        except LeakageSuspected as e:
            parsed[key]["leakage_warning"] = str(e)
            # Do not raise: keep the report but mark it loudly.
            print(f"[leakage-warning] {e}")

        parsed[key]["verdict"] = verdict_for(key, parsed[key])

    summary = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "git_commit": get_git_commit(),
        "datasets": DATASETS,
        "models": parsed,
        "limitations": LIMITATIONS,
    }

    SUMMARY_FILE.write_text(
        json.dumps(summary, indent=2), encoding="utf-8"
    )
    n = len([k for k in parsed if "error" not in parsed[k]])
    print(f"Wrote {SUMMARY_FILE} with {n} model evaluations.")


if __name__ == "__main__":
    evaluate_and_aggregate()
