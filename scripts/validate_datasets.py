"""Validate dataset completeness, integrity, and class distribution.

Subcommands:
    python scripts/validate_datasets.py ham10000
    python scripts/validate_datasets.py dermnet
    python scripts/validate_datasets.py fuseg
    python scripts/validate_datasets.py nonskin
"""

import argparse
from pathlib import Path
import random
import sys
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

    # Map image_id to actual image paths
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

    # Class distribution
    print("\nClass distribution (dx):")
    expected_classes = {"akiec", "bcc", "bkl", "df", "mel", "nv", "vasc"}
    dx_counts = df["dx"].value_counts().to_dict()
    for dx_cls, count in sorted(dx_counts.items()):
        print(f"  {dx_cls:8s}: {count:5d}")

    unrecognized_classes = set(dx_counts.keys()) - expected_classes
    if unrecognized_classes:
        print(f"WARNING: Unexpected diagnosis classes found: {unrecognized_classes}")

    # Missing clinical metadata values
    missing_age = int(df["age"].isna().sum())
    missing_sex = int(df["sex"].isna().sum())
    missing_loc = int(df["localization"].isna().sum())
    print("\nMissing metadata fields:")
    print(f"  Missing age: {missing_age}")
    print(f"  Missing sex: {missing_sex}")
    print(f"  Missing localization: {missing_loc}")

    # Check random 50 images with Pillow
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
    else:
        print(f"Dataset validator for '{args.dataset}' will be run in Step 6.", file=sys.stderr)


if __name__ == "__main__":
    main()
