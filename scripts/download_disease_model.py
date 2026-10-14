"""Download pre-trained DermNet skin disease classifier from HuggingFace.

Model: alxfgh/dinov2-base-finetuned-dermnet (330 MB DINOv2 model, 91 conditions)
Includes: Acne, Eczema, Psoriasis, Rosacea, Vitiligo, Tinea, Dermatitis, etc.

Usage:
    python scripts/download_disease_model.py
"""

import os
from pathlib import Path
import sys
from huggingface_hub import hf_hub_download

# Disable symlink warnings on Windows
os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"

REPO_ROOT = Path(__file__).resolve().parent.parent


def load_hf_token():
    env_path = REPO_ROOT / "ai-service" / ".env"
    if env_path.exists():
        with open(env_path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line.startswith("HF_TOKEN="):
                    return line.split("=", 1)[1].strip()
    return os.environ.get("HF_TOKEN", None)


def main():
    token = load_hf_token()
    repo_id = "alxfgh/dinov2-base-finetuned-dermnet"
    target_dir = REPO_ROOT / "models" / "disease" / "dinov2_dermnet"
    target_dir.mkdir(parents=True, exist_ok=True)

    files = ["config.json", "model.safetensors"]

    print("=" * 60)
    print(f"Downloading {repo_id}")
    print(f"Target directory: {target_dir}")
    print("=" * 60)

    for filename in files:
        print(f"\nDownloading {filename}...")
        hf_hub_download(
            repo_id=repo_id,
            filename=filename,
            local_dir=str(target_dir),
            token=token if token else None,
        )
        dest = target_dir / filename
        size_mb = dest.stat().st_size / (1024 * 1024)
        print(f"  Saved: {filename} ({size_mb:.1f} MB)")

    readme = target_dir / "SOURCE.txt"
    readme.write_text(
        "Model: alxfgh/dinov2-base-finetuned-dermnet\n"
        "Architecture: DINOv2-base\n"
        "Trained on: DermNet (91 condition classes)\n"
        "HuggingFace: https://huggingface.co/alxfgh/dinov2-base-finetuned-dermnet\n"
        "Downloaded: by scripts/download_disease_model.py\n",
        encoding="utf-8"
    )

    print("\nDownload complete.")
    print("\nFiles in models/disease/dinov2_dermnet/:")
    for f in sorted(target_dir.rglob("*")):
        if f.is_file():
            size_mb = f.stat().st_size / (1024 * 1024)
            print(f"  {f.name}: {size_mb:.1f} MB")


if __name__ == "__main__":
    main()
