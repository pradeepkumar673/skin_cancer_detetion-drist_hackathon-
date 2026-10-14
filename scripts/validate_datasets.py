"""Validate dataset completeness, integrity, and class distribution.

Subcommands:
    python scripts/validate_datasets.py ham10000
    python scripts/validate_datasets.py dermnet
    python scripts/validate_datasets.py fuseg
    python scripts/validate_datasets.py nonskin
"""

import argparse
import hashlib
from pathlib import Path
import random
import sys
import numpy as np
from PIL import Image
import pandas as pd

REPO_ROOT = Path(__file__).resolve().parent.parent


def validate_ham10000():
    print("=" * 60)
    print("Validating HAM10000 Dataset...")
    print("=" * 60)

    raw_dir = REPO_ROOT / "data" / "raw" / "ham10000"
    if not raw_dir.exists():
        print(f"FAILURE: HAM10000 directory not found at: {raw_dir}", file=sys.stderr)
        print("Please ensure raw HAM10000 dataset is placed under data/raw/ham10000/", file=sys.stderr)
        sys.exit(1)

    metadata_path = raw_dir / "HAM10000_metadata.csv"
    if not metadata_path.exists():
        print(f"FAILURE: Missing metadata CSV: {metadata_path}", file=sys.stderr)
        sys.exit(1)

    df = pd.read_csv(metadata_path)
    expected_cols = {"lesion_id", "image_id", "dx", "dx_type", "age", "sex", "localization"}
    missing_cols = expected_cols - set(df.columns)
    if missing_cols:
        print(f"FAILURE: Metadata CSV is missing required columns: {missing_cols}", file=sys.stderr)
        sys.exit(1)

    part1_dir = raw_dir / "HAM10000_images_part_1"
    part2_dir = raw_dir / "HAM10000_images_part_2"

    part1_exists = part1_dir.is_dir()
    part2_exists = part2_dir.is_dir()

    if not (part1_exists or part2_exists):
        print("FAILURE: Neither HAM10000_images_part_1 nor part_2 folder exists.", file=sys.stderr)
        sys.exit(1)

    image_paths = {}
    if part1_exists:
        for f in part1_dir.glob("*.jpg"):
            image_paths[f.stem] = f
    if part2_exists:
        for f in part2_dir.glob("*.jpg"):
            image_paths[f.stem] = f

    total_csv_records = len(df)
    missing_images = [img_id for img_id in df["image_id"] if img_id not in image_paths]

    print(f"Metadata records in CSV: {total_csv_records}")
    print(f"Discovered image files: {len(image_paths)}")
    print(f"Missing images count: {len(missing_images)}")

    if len(missing_images) > 0:
        print(f"FAILURE: {len(missing_images)} images referenced in CSV were not found on disk.", file=sys.stderr)
        sys.exit(1)

    print("\nClass distribution (dx):")
    dx_counts = df["dx"].value_counts().to_dict()
    for dx_cls, count in sorted(dx_counts.items()):
        print(f"  {dx_cls:8s}: {count:5d}")

    sample_size = min(50, len(image_paths))
    sampled_stems = random.sample(list(image_paths.keys()), sample_size)
    print(f"\nVerifying {sample_size} random images with Pillow...")
    for stem in sampled_stems:
        p = image_paths[stem]
        try:
            with Image.open(p) as img:
                img.verify()
        except Exception as e:
            print(f"FAILURE: Corrupted image file: {p} ({e})", file=sys.stderr)
            sys.exit(1)

    print("All 50 sampled images successfully verified.")
    print("\nSTATUS: VALID")


def compute_sha256(file_path: Path) -> str:
    h = hashlib.sha256()
    with open(file_path, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


def validate_dermnet():
    print("=" * 60)
    print("Validating DermNet Dataset...")
    print("=" * 60)

    raw_dir = REPO_ROOT / "data" / "raw" / "dermnet"
    if not raw_dir.exists():
        print(f"FAILURE: DermNet directory not found at: {raw_dir}", file=sys.stderr)
        print("Please ensure DermNet dataset is placed under data/raw/dermnet/", file=sys.stderr)
        sys.exit(1)

    train_dir = raw_dir / "train"
    test_dir = raw_dir / "test"

    if not train_dir.exists() or not test_dir.exists():
        print(f"FAILURE: Expected 'train' and 'test' subdirectories in {raw_dir}", file=sys.stderr)
        sys.exit(1)

    train_classes = {d.name: len(list(d.glob("*.jpg"))) for d in train_dir.iterdir() if d.is_dir()}
    test_classes = {d.name: len(list(d.glob("*.jpg"))) for d in test_dir.iterdir() if d.is_dir()}

    print(f"Discovered {len(train_classes)} train classes, {len(test_classes)} test classes.")
    print("\nTrain class image counts:")
    for cls_name, count in sorted(train_classes.items(), key=lambda x: -x[1]):
        print(f"  {cls_name:40s}: {count:5d}")

    # Check 50 random images
    all_train_images = list(train_dir.rglob("*.jpg"))
    if not all_train_images:
        print("FAILURE: No .jpg images found in train folders.", file=sys.stderr)
        sys.exit(1)

    sample_size = min(50, len(all_train_images))
    sampled = random.sample(all_train_images, sample_size)
    print(f"\nVerifying {sample_size} random images with Pillow...")
    for p in sampled:
        try:
            with Image.open(p) as img:
                img.verify()
        except Exception as e:
            print(f"FAILURE: Corrupted image: {p} ({e})", file=sys.stderr)
            sys.exit(1)

    # Detect duplicate images across train and test
    print("\nChecking for duplicate images across train and test via SHA-256...")
    train_hashes = {}
    for p in all_train_images:
        train_hashes[compute_sha256(p)] = p

    all_test_images = list(test_dir.rglob("*.jpg"))
    duplicates = []
    for p in all_test_images:
        h = compute_sha256(p)
        if h in train_hashes:
            duplicates.append((train_hashes[h], p))

    print(f"Exact cross-split duplicate images found: {len(duplicates)}")
    print("STATUS: VALID")


def validate_fuseg():
    print("=" * 60)
    print("Validating FUSeg Foot Ulcer Dataset...")
    print("=" * 60)

    raw_dir = REPO_ROOT / "data" / "raw" / "fuseg"
    if not raw_dir.exists():
        print(f"FAILURE: FUSeg directory not found at: {raw_dir}", file=sys.stderr)
        print("Please place FUSeg dataset under data/raw/fuseg/", file=sys.stderr)
        sys.exit(1)

    train_img_dir = raw_dir / "train" / "images"
    train_lbl_dir = raw_dir / "train" / "labels"

    if not train_img_dir.exists() or not train_lbl_dir.exists():
        print(f"FAILURE: Expected train/images and train/labels in {raw_dir}", file=sys.stderr)
        sys.exit(1)

    images = {f.stem: f for f in train_img_dir.glob("*.png")}
    masks = {f.stem: f for f in train_lbl_dir.glob("*.png")}

    print(f"Training images found: {len(images)}")
    print(f"Training masks found: {len(masks)}")

    missing_masks = set(images.keys()) - set(masks.keys())
    if missing_masks:
        print(f"FAILURE: {len(missing_masks)} images do not have a matching mask.", file=sys.stderr)
        sys.exit(1)

    # Check mask properties and wound fraction
    area_fractions = []
    sample_stems = list(images.keys())[:min(50, len(images))]
    for stem in sample_stems:
        mask_arr = np.array(Image.open(masks[stem]))
        unique_vals = np.unique(mask_arr)
        # Check binary
        if not set(unique_vals).issubset({0, 1, 255}):
            print(f"WARNING: Mask {stem} has non-standard values: {unique_vals}")
        frac = np.count_nonzero(mask_arr) / mask_arr.size
        area_fractions.append(frac)

    mean_frac = np.mean(area_fractions) if area_fractions else 0.0
    print(f"Sampled mean wound area fraction: {mean_frac * 100:.2f}%")
    print("STATUS: VALID")


def validate_nonskin():
    print("=" * 60)
    print("Validating Non-Skin Dataset...")
    print("=" * 60)

    raw_dir = REPO_ROOT / "data" / "raw" / "nonskin"
    if not raw_dir.exists():
        print(f"FAILURE: Non-skin directory not found at: {raw_dir}", file=sys.stderr)
        print("Please place non-skin photos under data/raw/nonskin/", file=sys.stderr)
        sys.exit(1)

    all_images = list(raw_dir.rglob("*.jpg")) + list(raw_dir.rglob("*.png"))
    print(f"Discovered images: {len(all_images)}")

    if len(all_images) < 2000:
        print(f"FAILURE: Expected at least 2000 non-skin photos, found {len(all_images)}", file=sys.stderr)
        sys.exit(1)

    print("Verifying 50 random non-skin images with Pillow...")
    for p in random.sample(all_images, min(50, len(all_images))):
        try:
            with Image.open(p) as img:
                img.verify()
        except Exception as e:
            print(f"FAILURE: Corrupted non-skin image: {p} ({e})", file=sys.stderr)
            sys.exit(1)

    print("STATUS: VALID")


def main():
    parser = argparse.ArgumentParser(description="Validate dataset integrity and schemas.")
    subparsers = parser.add_subparsers(dest="dataset", required=True)

    subparsers.add_parser("ham10000", help="Validate HAM10000 dataset")
    subparsers.add_parser("dermnet", help="Validate DermNet dataset")
    subparsers.add_parser("fuseg", help="Validate FUSeg dataset")
    subparsers.add_parser("nonskin", help="Validate non-skin dataset")

    args = parser.parse_args()

    if args.dataset == "ham10000":
        validate_ham10000()
    elif args.dataset == "dermnet":
        validate_dermnet()
    elif args.dataset == "fuseg":
        validate_fuseg()
    elif args.dataset == "nonskin":
        validate_nonskin()


if __name__ == "__main__":
    main()
