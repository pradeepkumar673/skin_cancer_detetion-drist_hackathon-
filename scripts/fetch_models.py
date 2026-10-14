#!/usr/bin/env python3
"""Downloads trained model weights archive from MODELS_ARCHIVE_URL, unpacks into models/,

and verifies every file's SHA-256 against models/MANIFEST.json.
"""
from __future__ import annotations

import hashlib
import json
import os
import sys
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODELS_DIR = ROOT / "models"
MANIFEST_PATH = MODELS_DIR / "MANIFEST.json"


def compute_sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


def fetch_models() -> None:
    archive_url = os.environ.get("MODELS_ARCHIVE_URL", "").strip()
    if not archive_url:
        print("ERROR: MODELS_ARCHIVE_URL environment variable is not configured.")
        print("Set MODELS_ARCHIVE_URL to a valid download endpoint (e.g. Hugging Face resolve URL or S3).")
        sys.exit(1)

    hf_token = os.environ.get("HF_TOKEN", "").strip()
    headers = {}
    if hf_token and "huggingface.co" in archive_url:
        headers["Authorization"] = f"Bearer {hf_token}"

    zip_dest = ROOT / "models_download.zip"
    print(f"Downloading models archive from {archive_url}...")

    req = urllib.request.Request(archive_url, headers=headers)
    try:
        with urllib.request.urlopen(req) as resp, open(zip_dest, "wb") as out_f:
            while chunk := resp.read(65536):
                out_f.write(chunk)
    except Exception as e:
        print(f"ERROR: Failed downloading models archive: {e}")
        sys.exit(1)

    print(f"Downloaded archive ({zip_dest.stat().st_size} bytes). Unpacking into {MODELS_DIR}...")
    MODELS_DIR.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(zip_dest, "r") as zf:
        zf.extractall(MODELS_DIR)

    if zip_dest.exists():
        zip_dest.unlink()

    print("Unpack complete. Verifying integrity against models/MANIFEST.json...")
    if not MANIFEST_PATH.exists():
        print(f"WARNING: Manifest {MANIFEST_PATH} not found; skipping hash verification.")
        return

    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    files_map = manifest.get("files", {})

    all_matched = True
    for rel_path, expected_hash in files_map.items():
        target = MODELS_DIR / rel_path
        if not target.exists():
            print(f"FAIL: Expected file missing on disk: {rel_path}")
            all_matched = False
            continue

        actual_hash = compute_sha256(target)
        if actual_hash.lower() != expected_hash.lower():
            print(f"FAIL: SHA-256 mismatch for {rel_path}: expected {expected_hash}, got {actual_hash}")
            all_matched = False
        else:
            print(f"OK: {rel_path} ({actual_hash[:8]}...) verified.")

    if not all_matched:
        print("\nERROR: Integrity verification failed. Model files may be corrupted.")
        sys.exit(1)

    print("\nAll model files verified successfully against manifest.")


if __name__ == "__main__":
    fetch_models()
