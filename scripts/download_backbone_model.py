"""Download pretrained DINOv2-small backbone from HuggingFace to models/backbone/dinov2_small/.

Model: facebook/dinov2-small (84 MB vision transformer, 384-dim features)

Usage:
    python scripts/download_backbone_model.py
"""

from pathlib import Path
import sys
import time

REPO_ROOT = Path(__file__).resolve().parent.parent


def download_with_progress(url, dest_path, chunk_size=1024 * 1024, max_retries=30):
    """Download a file with resume support, auto-retry on drops, and a live progress bar."""
    import requests

    dest_path = Path(dest_path)
    dest_path.parent.mkdir(parents=True, exist_ok=True)

    total_size = 0
    for attempt in range(max_retries):
        try:
            head = requests.head(url, allow_redirects=True, timeout=30)
            total_size = int(head.headers.get("content-length", 0))
            break
        except Exception:
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

        req_headers = {}
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
            print(f"\nNetwork drop ({err}). Retrying attempt {retries}/{max_retries} in 3s...")
            time.sleep(3)


def main():
    target_dir = REPO_ROOT / "models" / "backbone" / "dinov2_small"
    target_dir.mkdir(parents=True, exist_ok=True)

    base_url = "https://huggingface.co/facebook/dinov2-small/resolve/main"
    files = [
        ("config.json", "config.json"),
        ("preprocessor_config.json", "preprocessor_config.json"),
        ("model.safetensors", "model.safetensors"),
    ]

    print("=" * 60)
    print("Downloading DINOv2-small backbone (facebook/dinov2-small)...")
    print(f"Target: {target_dir}")
    print("=" * 60)

    for filename, dest_name in files:
        url = f"{base_url}/{filename}"
        dest = target_dir / dest_name
        print(f"Downloading {filename} ...")
        download_with_progress(url, dest)
        print(f"  Saved: {dest.name} ({dest.stat().st_size / 1024**2:.1f} MB)")
        print()

    readme = target_dir / "SOURCE.txt"
    readme.write_text(
        "Model: facebook/dinov2-small\n"
        "Architecture: Vision Transformer (small, patch size 14)\n"
        "HuggingFace: https://huggingface.co/facebook/dinov2-small\n"
        "Embedding dimension: 384\n"
        "Downloaded: by scripts/download_backbone_model.py\n",
        encoding="utf-8"
    )

    print("DINOv2-small download complete.")


if __name__ == "__main__":
    main()
