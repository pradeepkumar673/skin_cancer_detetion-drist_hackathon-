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
import time
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from download_cancer_model import download_with_progress, load_hf_token

REPO_ROOT = Path(__file__).resolve().parent.parent
MODELS_DIR = REPO_ROOT / "models"
HF_RESOLVE = "https://huggingface.co/{repo}/resolve/main/{filename}"

MODELS = [
    {
        "id": "cancer_classifier",
        "repo_id": "Miguel764/efficientnetv2s-skin-cancer-classifier",
        "local_dir": MODELS_DIR / "cancer" / "vit_skin_cancer",
        "role": "Cancer junior classifier, 7 HAM10000 classes",
        "licence": "MIT (check model card)",
        "files": ["efficientnetv2s.h5", "README.md"],
    },
    {
        "id": "disease_classifier",
        "repo_id": "WahajRaza/finetuned-dermnet",
        "local_dir": MODELS_DIR / "disease" / "dermnet_vit",
        "role": "Skin-disease classifier fine-tuned on DermNet images",
        "licence": "Apache-2.0 (check model card)",
        "files": ["model.safetensors", "config.json", "preprocessor_config.json", "README.md"],
    },
    {
        "id": "ulcer_segmentation",
        "repo_id": "RuthvikBandari/DiaFootAI",
        "local_dir": MODELS_DIR / "ulcer" / "diafoot",
        "role": "Foot-ulcer segmentation trained on FUSeg",
        "licence": "Check model card before use",
        "files": ["best_model.pt", "README.md"],
    },
    {
        "id": "backbone",
        "repo_id": "facebook/dinov2-small",
        "local_dir": MODELS_DIR / "backbone" / "dinov2-small",
        "role": "DINOv2-small image backbone for embeddings",
        "licence": "Apache-2.0",
        "files": ["model.safetensors", "config.json", "preprocessor_config.json", "README.md"],
    },
    {
        "id": "medsam",
        "repo_id": "wanglab/medsam-vit-base",
        "local_dir": MODELS_DIR / "cancer" / "medsam",
        "role": "MedSAM lesion and medical image segmentation",
        "licence": "Apache-2.0",
        "files": ["model.safetensors", "config.json", "preprocessor_config.json", "README.md"],
    },
]


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
    skip_names = {".gitattributes", "SOURCE.txt"}
    files = []
    for path in sorted(local_dir.rglob("*")):
        if not path.is_file():
            continue
        if ".cache" in path.parts or path.name.startswith("."):
            continue
        if path.name in skip_names:
            continue
        files.append(path)
    return files


def write_manifest(entries: list[dict]) -> None:
    artifacts = []
    for entry in entries:
        local_dir = entry["local_dir"]
        if not local_dir.exists():
            continue
        for path in list_weight_files(local_dir):
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


def download_named_file(repo_id: str, filename: str, dest: Path, token: str) -> None:
    url = HF_RESOLVE.format(repo=repo_id, filename=filename)
    last_error = None
    for attempt in range(1, 9):
        try:
            download_with_progress(url, dest, token)
            if dest.exists() and dest.stat().st_size > 0:
                return
            raise RuntimeError(f"{filename} is empty after download")
        except Exception as err:
            last_error = err
            wait = min(2 ** attempt, 30)
            print(f"    retry {attempt}/8 for {filename} in {wait}s ({err})")
            time.sleep(wait)
    raise RuntimeError(f"Failed to download {repo_id}/{filename}: {last_error}")


def download_one(entry: dict, token: str) -> None:
    local_dir = entry["local_dir"]
    local_dir.mkdir(parents=True, exist_ok=True)
    print(f"==> {entry['id']}: {entry['repo_id']}")
    print(f"    -> {local_dir.relative_to(REPO_ROOT).as_posix()}")
    downloaded = 0
    for filename in entry["files"]:
        dest = local_dir / filename
        print(f"    downloading {filename}")
        try:
            download_named_file(entry["repo_id"], filename, dest, token)
            downloaded += 1
            print(f"    saved {filename} ({dest.stat().st_size / 1024**2:.1f} MB)")
        except Exception as err:
            if filename in {"preprocessor_config.json", "README.md", "pytorch_model.bin"}:
                print(f"    skip optional {filename}: {err}")
                if dest.exists() and dest.stat().st_size == 0:
                    dest.unlink()
                continue
            raise
    if downloaded == 0:
        raise RuntimeError(f"No files downloaded for {entry['repo_id']}")
    write_source(entry)


def main() -> int:
    token = load_hf_token()
    if not token:
        print("ERROR: HF_TOKEN not found in ai-service/.env", file=sys.stderr)
        return 1

    try:
        import requests  # noqa: F401
    except ImportError:
        print("ERROR: requests is not installed. Run: pip install requests", file=sys.stderr)
        return 1

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
