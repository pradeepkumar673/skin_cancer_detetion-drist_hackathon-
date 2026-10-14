"""Download SkinSentry pretrained checkpoints from Hugging Face with resume support.

Usage (from repo root):
    python scripts/download_pretrained_models.py

Reads HF_TOKEN from ai-service/.env. Never prints the token.
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
from datetime import date
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
MODELS_DIR = REPO_ROOT / "models"

MODELS = [
    {
        "id": "cancer_classifier",
        "repo_id": "Miguel764/efficientnetv2s-skin-cancer-classifier",
        "local_dir": MODELS_DIR / "cancer" / "vit_skin_cancer",
        "role": "Cancer junior classifier, 7 HAM10000 classes",
        "licence": "MIT (check model card)",
        "allow_patterns": ["efficientnetv2s.h5", "README.md", "config.json"],
    },
    {
        "id": "disease_classifier",
        "repo_id": "WahajRaza/finetuned-dermnet",
        "local_dir": MODELS_DIR / "disease" / "dermnet_vit",
        "role": "Skin-disease classifier fine-tuned on DermNet images",
        "licence": "Apache-2.0 (check model card)",
        "allow_patterns": [
            "model.safetensors",
            "pytorch_model.bin",
            "config.json",
            "preprocessor_config.json",
            "README.md",
        ],
    },
    {
        "id": "ulcer_segmentation",
        "repo_id": "RuthvikBandari/DiaFootAI",
        "local_dir": MODELS_DIR / "ulcer" / "diafoot",
        "role": "Foot-ulcer segmentation trained on FUSeg",
        "licence": "Check model card before use",
        "allow_patterns": ["best_model.pt", "README.md"],
    },
    {
        "id": "backbone",
        "repo_id": "facebook/dinov2-small",
        "local_dir": MODELS_DIR / "backbone" / "dinov2-small",
        "role": "DINOv2-small image backbone for embeddings",
        "licence": "Apache-2.0",
        "allow_patterns": [
            "model.safetensors",
            "config.json",
            "preprocessor_config.json",
            "README.md",
        ],
    },
    {
        "id": "medsam",
        "repo_id": "wanglab/medsam-vit-base",
        "local_dir": MODELS_DIR / "cancer" / "medsam",
        "role": "MedSAM lesion and medical image segmentation",
        "licence": "Apache-2.0",
        "allow_patterns": [
            "model.safetensors",
            "pytorch_model.bin",
            "config.json",
            "preprocessor_config.json",
            "README.md",
        ],
    },
]


def load_hf_token() -> str:
    env_path = REPO_ROOT / "ai-service" / ".env"
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.startswith("HF_TOKEN="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    return os.environ.get("HF_TOKEN", "").strip()


def sha256_file(path: Path, chunk_size: int = 1024 * 1024) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while True:
            chunk = handle.read(chunk_size)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


def write_source(entry: dict) -> None:
    dest = entry["local_dir"] / "SOURCE.txt"
    dest.write_text(
        (
            f"id: {entry['id']}\n"
            f"repo: {entry['repo_id']}\n"
            f"url: https://huggingface.co/{entry['repo_id']}\n"
            f"role: {entry['role']}\n"
            f"licence: {entry['licence']}\n"
            f"local_path: {entry['local_dir'].relative_to(REPO_ROOT).as_posix()}\n"
            f"downloaded: {date.today().isoformat()}\n"
            "note: Pretrained checkpoint. Metrics on the model card are not our held-out test results.\n"
        ),
        encoding="utf-8",
    )


def list_weight_files(local_dir: Path) -> list[Path]:
    skip = {".gitattributes", "SOURCE.txt"}
    files = []
    for path in sorted(local_dir.rglob("*")):
        if not path.is_file():
            continue
        if path.name in skip or path.name.startswith("."):
            continue
        files.append(path)
    return files


def write_manifest(entries: list[dict]) -> None:
    artifacts = []
    for entry in entries:
        for path in list_weight_files(entry["local_dir"]):
            artifacts.append(
                {
                    "id": entry["id"],
                    "repo_id": entry["repo_id"],
                    "path": path.relative_to(REPO_ROOT).as_posix(),
                    "size_bytes": path.stat().st_size,
                    "sha256": sha256_file(path),
                }
            )
    manifest = {
        "created": date.today().isoformat(),
        "note": "Pretrained Hugging Face checkpoints. Not trained on local splits.",
        "artifacts": artifacts,
    }
    dest = MODELS_DIR / "MANIFEST.json"
    dest.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {dest.relative_to(REPO_ROOT)} ({len(artifacts)} files)")


def download_one(entry: dict, token: str) -> None:
    from huggingface_hub import snapshot_download

    local_dir = entry["local_dir"]
    local_dir.mkdir(parents=True, exist_ok=True)
    print(f"==> {entry['id']}: {entry['repo_id']}")
    print(f"    -> {local_dir.relative_to(REPO_ROOT).as_posix()}")
    snapshot_download(
        repo_id=entry["repo_id"],
        local_dir=str(local_dir),
        token=token or None,
        resume_download=True,
        allow_patterns=entry["allow_patterns"],
        ignore_patterns=["*.msgpack", "*.ot", "*.onnx", "*.md5"],
    )
    write_source(entry)
    files = list_weight_files(local_dir)
    if not files:
        raise RuntimeError(f"No files downloaded for {entry['repo_id']}")
    for path in files:
        size_mb = path.stat().st_size / (1024**2)
        print(f"    {path.name}: {size_mb:.1f} MB")


def main() -> int:
    token = load_hf_token()
    if not token:
        print("ERROR: HF_TOKEN not found in ai-service/.env", file=sys.stderr)
        return 1

    try:
        import huggingface_hub  # noqa: F401
    except ImportError:
        print("ERROR: huggingface_hub is not installed. Run: pip install huggingface_hub", file=sys.stderr)
        return 1

    os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")
    MODELS_DIR.mkdir(parents=True, exist_ok=True)

    failed = []
    for entry in MODELS:
        try:
            download_one(entry, token)
        except Exception as err:
            print(f"ERROR downloading {entry['repo_id']}: {err}", file=sys.stderr)
            failed.append(entry["id"])

    write_manifest(MODELS)
    if failed:
        print(f"Finished with failures: {', '.join(failed)}", file=sys.stderr)
        return 1
    print("All pretrained models downloaded.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
