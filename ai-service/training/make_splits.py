"""Generate leak-free train/val/test splits for datasets.

Usage:
    python ai-service/training/make_splits.py ham10000
    python ai-service/training/make_splits.py all
"""

import argparse
from pathlib import Path
import sys
import numpy as np
import pandas as pd
import yaml

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
CONFIG_PATH = Path(__file__).resolve().parent / "config.yaml"


def load_config():
    if not CONFIG_PATH.exists():
        raise FileNotFoundError(f"Configuration file not found: {CONFIG_PATH}")
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def make_ham10000_splits():
    print("=" * 60)
    print("Generating Leak-Free HAM10000 Splits...")
    print("=" * 60)

    cfg = load_config()
    seed = cfg.get("random_seed", 42)
    split_ratios = cfg.get("splits", {"train": 0.70, "val": 0.15, "test": 0.15})

    train_pct = split_ratios["train"]
    val_pct = split_ratios["val"]
    test_pct = split_ratios["test"]

    raw_dir = REPO_ROOT / "data" / "raw" / "ham10000"
    metadata_path = raw_dir / "HAM10000_metadata.csv"

    if not metadata_path.exists():
        print(f"FAILURE: HAM10000 metadata CSV not found at: {metadata_path}", file=sys.stderr)
        sys.exit(1)

    df = pd.read_csv(metadata_path)

    # Locate image paths
    part1_dir = raw_dir / "HAM10000_images_part_1"
    part2_dir = raw_dir / "HAM10000_images_part_2"
    path_map = {}
    if part1_dir.exists():
        for f in part1_dir.glob("*.jpg"):
            path_map[f.stem] = str(f.relative_to(REPO_ROOT)).replace("\\", "/")
    if part2_dir.exists():
        for f in part2_dir.glob("*.jpg"):
            path_map[f.stem] = str(f.relative_to(REPO_ROOT)).replace("\\", "/")

    df["path"] = df["image_id"].map(path_map)

    # 1. Group by lesion_id so the same lesion NEVER appears in multiple splits
    # Extract unique lesion_id and their dominant dx for stratification
    lesion_df = df.groupby("lesion_id").agg({
        "dx": "first",
        "image_id": "count"
    }).reset_index().rename(columns={"image_id": "num_images"})

    # Shuffle lesions deterministically
    np.random.seed(seed)
    lesion_df = lesion_df.sample(frac=1.0, random_state=seed).reset_index(drop=True)

    # Stratified grouping across lesions
    train_lesions, val_lesions, test_lesions = set(), set(), set()
    for dx_class, group in lesion_df.groupby("dx"):
        n_total = len(group)
        n_train = int(round(n_total * train_pct))
        n_val = int(round(n_total * val_pct))

        lesion_ids = group["lesion_id"].tolist()
        train_lesions.update(lesion_ids[:n_train])
        val_lesions.update(lesion_ids[n_train:n_train + n_val])
        test_lesions.update(lesion_ids[n_train + n_val:])

    # Map split to original dataframe
    def assign_split(lesion_id):
        if lesion_id in train_lesions:
            return "train"
        if lesion_id in val_lesions:
            return "val"
        return "test"

    df["split"] = df["lesion_id"].apply(assign_split)

    # 2. Add malignant_or_premalignant column:
    # 1 for mel (melanoma), bcc (basal cell carcinoma), akiec (actinic keratoses); 0 otherwise
    malignant_classes = {"mel", "bcc", "akiec"}
    df["malignant_or_premalignant"] = df["dx"].apply(lambda x: 1 if x in malignant_classes else 0)

    # 3. Leak-free assertions
    train_ids = set(df[df["split"] == "train"]["lesion_id"])
    val_ids = set(df[df["split"] == "val"]["lesion_id"])
    test_ids = set(df[df["split"] == "test"]["lesion_id"])

    assert len(train_ids.intersection(val_ids)) == 0, "DATA LEAK: train and val share lesion_id"
    assert len(train_ids.intersection(test_ids)) == 0, "DATA LEAK: train and test share lesion_id"
    assert len(val_ids.intersection(test_ids)) == 0, "DATA LEAK: val and test share lesion_id"
    print("VERIFIED: Zero lesion overlap between train, val, and test splits (no data leakage).")

    # Save to data/processed/ham10000_splits.csv
    processed_dir = REPO_ROOT / "data" / "processed"
    processed_dir.mkdir(parents=True, exist_ok=True)
    out_csv = processed_dir / "ham10000_splits.csv"

    columns_to_save = [
        "image_id", "lesion_id", "dx", "split", "path",
        "age", "sex", "localization", "malignant_or_premalignant"
    ]
    df[columns_to_save].to_csv(out_csv, index=False)
    print(f"\nSaved split file: {out_csv} ({len(df)} rows)")

    # Print split counts and per-split class distribution
    print("\nSummary per split:")
    for split_name in ["train", "val", "test"]:
        split_df = df[df["split"] == split_name]
        n_img = len(split_df)
        n_les = split_df["lesion_id"].nunique()
        n_mal = split_df["malignant_or_premalignant"].sum()
        print(f"  {split_name.upper():5s}: {n_img:5d} images, {n_les:5d} unique lesions | Malignant/premalignant: {n_mal:4d} ({n_mal/n_img*100:.1f}%)")


def main():
    parser = argparse.ArgumentParser(description="Create grouped train/val/test splits.")
    parser.add_argument("dataset", choices=["ham10000", "all"], help="Dataset to split")
    args = parser.parse_args()

    if args.dataset in ("ham10000", "all"):
        make_ham10000_splits()


if __name__ == "__main__":
    main()
