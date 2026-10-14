#!/usr/bin/env python3
"""Copy and design lint for SkinSentry. Exits with code 1 if any rule is violated."""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCAN_DIRS = ["web/src", "web/public", "api/src", "ai-service/app/llm", "ai-service/config"]
TEXT_EXT = {".ts", ".tsx", ".js", ".mjs", ".jsx", ".css", ".html", ".json", ".yaml", ".yml", ".txt"}
SKIP_PARTS = {"node_modules", ".next", "__pycache__", ".venv", "tests"}

RULES = [
    ("em or en dash", re.compile("[\u2014\u2013]")),
    ("emoji", re.compile("[\U0001F000-\U0001FAFF\u2600-\u27BF\u2B50\u2B55\uFE0F]")),
    ("pill or large rounding", re.compile(r"rounded-(full|xl|2xl|3xl)|9999px|border-radius:\s*(50%|999)")),
    ("gradient", re.compile(r"gradient\(|bg-gradient|from-\[|via-\[")),
    ("purple family", re.compile(r"\b(purple|violet|indigo|fuchsia)\b", re.I)),
    ("scroll or heavy animation", re.compile(r"framer-motion|gsap|lottie|IntersectionObserver|animate-(?!spin)|data-aos|parallax")),
    ("cursor effects", re.compile(r"cursor:\s*(url|none)|cursor-none|mousemove")),
    ("banned marketing words", re.compile(r"\b(revolutionize|revolutionary|cutting-edge|seamless(ly)?|empower(s|ing)?|unlock(s|ing)?|next-generation|game-changing|supercharge|leverage|elevate|world-class|state-of-the-art|your journey)\b", re.I)),
    ("fake social proof", re.compile(r"testimonial|trusted by|happy customers|\d[\d,]*\+?\s+(users|patients|doctors|clinics|customers)", re.I)),
]

problems = 0
for d in SCAN_DIRS:
    base = ROOT / d
    if not base.exists():
        continue
    for path in base.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in TEXT_EXT:
            continue
        if SKIP_PARTS & set(path.parts):
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        for lineno, line in enumerate(text.splitlines(), start=1):
            for name, pattern in RULES:
                if pattern.search(line):
                    problems += 1
                    print(f"{path.relative_to(ROOT)}:{lineno}: {name}: {line.strip()[:120]}")

if problems:
    print(f"\n{problems} problem(s) found.")
    sys.exit(1)
print("Copy and design check passed.")
