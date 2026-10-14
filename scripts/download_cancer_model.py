"""Download pre-trained cancer classifier from HuggingFace with chunked progress and resume support.

Model: Miguel764/efficientnetv2s-skin-cancer-classifier (235 MB .h5 Keras model)
Trained on HAM10000. 7 classes: mel, bcc, bkl, df, nv, vasc, akiec.

Usage (run from repo root):
    python scripts/download_cancer_model.py

HF_TOKEN is read automatically from ai-service/.env
"""

import os
import sys
import time
from pathlib import Path


def load_hf_token():
    env_path = Path(__file__).resolve().parent.parent / "ai-service" / ".env"
    if env_path.exists():
        with open(env_path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line.startswith("HF_TOKEN="):
                    return line.split("=", 1)[1].strip()
    return os.environ.get("HF_TOKEN", "")


def download_with_progress(url, dest_path, token, chunk_size=1024 * 1024, max_retries=50):
    """Download a file with resume support, auto-retry on drops, and a live progress bar."""
    import requests

    dest_path = Path(dest_path)
    dest_path.parent.mkdir(parents=True, exist_ok=True)

    headers = {"Authorization": f"Bearer {token}"}

    # Get total size
    total_size = 0
    for attempt in range(max_retries):
        try:
            head = requests.head(url, headers=headers, allow_redirects=True, timeout=30)
            total_size = int(head.headers.get("content-length", 0))
            break
        except Exception as e:
            if attempt == max_retries - 1:
                raise
            time.sleep(2)

    existing_size = dest_path.stat().st_size if dest_path.exists() else 0
    if existing_size >= total_size and total_size > 0:
        print(f"Already downloaded: {dest_path.name} ({existing_size / 1024**2:.1f} MB)")
        return

    retries = 0
    start_time = time.time()
    while retries < max_retries:
        existing_size = dest_path.stat().st_size if dest_path.exists() else 0
        if total_size > 0 and existing_size >= total_size:
            break

        req_headers = dict(headers)
        if existing_size > 0:
            print(f"\nResuming from {existing_size / 1024**2:.1f} MB of {total_size / 1024**2:.1f} MB...")
            req_headers["Range"] = f"bytes={existing_size}-"

        mode = "ab" if existing_size > 0 else "wb"
        downloaded = existing_size

        try:
            with requests.get(url, headers=req_headers, stream=True, allow_redirects=True, timeout=60) as r:
                if r.status_code not in (200, 206):
                    r.raise_for_status()
                with open(dest_path, mode) as f:
                    for chunk in r.iter_content(chunk_size=chunk_size):
                        if chunk:
                            f.write(chunk)
                            downloaded += len(chunk)
                            elapsed = time.time() - start_time
                            speed_kb = (downloaded - existing_size) / max(elapsed, 0.001) / 1024
                            pct = downloaded / total_size * 100 if total_size else 0
                            bar_width = 30
                            filled = int(bar_width * pct / 100)
                            bar = "#" * filled + "-" * (bar_width - filled)
                            print(
                                f"\r  [{bar}] {pct:5.1f}%  {downloaded/1024**2:.1f}/{total_size/1024**2:.1f} MB  {speed_kb:.0f} KB/s",
                                end="",
                                flush=True,
                            )
            print()
            break
        except Exception as err:
            retries += 1
            print(f"\nNetwork interruption ({err}). Auto-retrying attempt {retries}/{max_retries} in 3s...")
            time.sleep(3)


def main():
    token = load_hf_token()
    if not token:
        print("ERROR: HF_TOKEN not found in ai-service/.env", file=sys.stderr)
        sys.exit(1)

    try:
        import requests  # noqa: F401
    except ImportError:
        print("ERROR: requests is not installed. Run: pip install requests", file=sys.stderr)
        sys.exit(1)

    repo_root = Path(__file__).resolve().parent.parent
    target_dir = repo_root / "models" / "cancer" / "vit_skin_cancer"
    target_dir.mkdir(parents=True, exist_ok=True)

    base_url = "https://huggingface.co/Miguel764/efficientnetv2s-skin-cancer-classifier/resolve/main"

    files = [
        ("efficientnetv2s.h5", "efficientnetv2s.h5"),
        ("README.md", "README.md"),
    ]

    print("Downloading Miguel764/efficientnetv2s-skin-cancer-classifier")
    print(f"Target: {target_dir}")
    print()

    for filename, dest_name in files:
        url = f"{base_url}/{filename}"
        dest = target_dir / dest_name
        print(f"Downloading {filename} ...")
        download_with_progress(url, dest, token)
        print(f"  Saved: {dest.name} ({dest.stat().st_size / 1024**2:.1f} MB)")
        print()

    # Write a README so the model slot is documented
    readme = target_dir / "SOURCE.txt"
    readme.write_text(
        "Model: Miguel764/efficientnetv2s-skin-cancer-classifier\n"
        "Architecture: EfficientNetV2S (Keras)\n"
        "Trained on: HAM10000\n"
        "Classes: mel, bcc, bkl, df, nv, vasc, akiec\n"
        "HuggingFace: https://huggingface.co/Miguel764/efficientnetv2s-skin-cancer-classifier\n"
        "Licence: Check model card before clinical use\n"
        "Downloaded: by scripts/download_cancer_model.py\n"
    )

    print("Download complete.")
    print()
    print("Files in models/cancer/vit_skin_cancer/:")
    for f in sorted(target_dir.rglob("*")):
        if f.is_file():
            size_mb = f.stat().st_size / (1024**2)
            print(f"  {f.name}: {size_mb:.1f} MB")


if __name__ == "__main__":
    main()
