"""Generate leak-free train/val/test splits for datasets and domain table.

Usage:
    python ai-service/training/make_splits.py ham10000
    python ai-service/training/make_splits.py dermnet
    python ai-service/training/make_splits.py fuseg
    python ai-service/training/make_splits.py nonskin
    python ai-service/training/make_splits.py all
"""

import argparse
import hashlib
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


def compute_sha256(file_path: Path) -> str:
    h = hashlib.sha256()
    with open(file_path, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


def make_ham10000_splits():
    print("=" * 60)
    print("Generating Leak-Free HAM10000 Splits...")
    print("=" * 60)

    cfg = load_config()
    seed = cfg.get("random_seed", 42)
    split_ratios = cfg.get("splits", {"train": 0.70, "val": 0.15, "test": 0.15})

    train_pct = split_ratios["train"]
    val_pct = split_ratios["val"]

    raw_dir = REPO_ROOT / "data" / "raw" / "ham10000"
    metadata_path = raw_dir / "HAM10000_metadata.csv"

    if not metadata_path.exists():
        print(f"FAILURE: HAM10000 metadata CSV not found at: {metadata_path}", file=sys.stderr)
        return False

    df = pd.read_csv(metadata_path)

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

    lesion_df = df.groupby("lesion_id").agg({
        "dx": "first",
        "image_id": "count"
    }).reset_index().rename(columns={"image_id": "num_images"})

    np.random.seed(seed)
    lesion_df = lesion_df.sample(frac=1.0, random_state=seed).reset_index(drop=True)

    train_lesions, val_lesions, test_lesions = set(), set(), set()
    for dx_class, group in lesion_df.groupby("dx"):
        n_total = len(group)
        n_train = int(round(n_total * train_pct))
        n_val = int(round(n_total * val_pct))

        lesion_ids = group["lesion_id"].tolist()
        train_lesions.update(lesion_ids[:n_train])
        val_lesions.update(lesion_ids[n_train:n_train + n_val])
        test_lesions.update(lesion_ids[n_train + n_val:])

    def assign_split(lesion_id):
        if lesion_id in train_lesions:
            return "train"
        if lesion_id in val_lesions:
            return "val"
        return "test"

    df["split"] = df["lesion_id"].apply(assign_split)

    malignant_classes = {"mel", "bcc", "akiec"}
    df["malignant_or_premalignant"] = df["dx"].apply(lambda x: 1 if x in malignant_classes else 0)

    train_ids = set(df[df["split"] == "train"]["lesion_id"])
    val_ids = set(df[df["split"] == "val"]["lesion_id"])
    test_ids = set(df[df["split"] == "test"]["lesion_id"])

    assert len(train_ids.intersection(val_ids)) == 0, "DATA LEAK: train and val share lesion_id"
    assert len(train_ids.intersection(test_ids)) == 0, "DATA LEAK: train and test share lesion_id"
    assert len(val_ids.intersection(test_ids)) == 0, "DATA LEAK: val and test share lesion_id"
    print("VERIFIED: Zero lesion overlap between train, val, and test splits.")

    processed_dir = REPO_ROOT / "data" / "processed"
    processed_dir.mkdir(parents=True, exist_ok=True)
    out_csv = processed_dir / "ham10000_splits.csv"

    columns_to_save = [
        "image_id", "lesion_id", "dx", "split", "path",
        "age", "sex", "localization", "malignant_or_premalignant"
    ]
    df[columns_to_save].to_csv(out_csv, index=False)
    print(f"Saved: {out_csv} ({len(df)} rows)")
    return True


def make_dermnet_splits():
    print("=" * 60)
    print("Generating DermNet Splits...")
    print("=" * 60)

    raw_dir = REPO_ROOT / "data" / "raw" / "dermnet"
    if not (raw_dir / "train").exists():
        print(f"FAILURE: DermNet train folder not found at: {raw_dir / 'train'}", file=sys.stderr)
        return False

    cfg = load_config()
    seed = cfg.get("random_seed", 42)
    split_ratios = cfg.get("splits", {"train": 0.70, "val": 0.15, "test": 0.15})

    train_pct = split_ratios["train"] / (split_ratios["train"] + split_ratios["val"])

    records = []
    # Collect train images
    for cls_dir in (raw_dir / "train").iterdir():
        if cls_dir.is_dir():
            for img_p in cls_dir.glob("*.jpg"):
                records.append({
                    "path": str(img_p.relative_to(REPO_ROOT)).replace("\\", "/"),
                    "class": cls_dir.name,
                    "original_split": "train",
                    "sha256": compute_sha256(img_p)
                })

    # Collect test images
    for cls_dir in (raw_dir / "test").iterdir():
        if cls_dir.is_dir():
            for img_p in cls_dir.glob("*.jpg"):
                records.append({
                    "path": str(img_p.relative_to(REPO_ROOT)).replace("\\", "/"),
                    "class": cls_dir.name,
                    "original_split": "test",
                    "sha256": compute_sha256(img_p)
                })

    df = pd.DataFrame(records)
    # Split train into train and val grouped by sha256 to prevent duplicate leakage
    train_pool = df[df["original_split"] == "train"].copy()
    unique_hashes = train_pool.drop_duplicates(subset=["sha256"]).sample(frac=1.0, random_state=seed)

    train_hashes = set()
    val_hashes = set()
    for cls_name, group in unique_hashes.groupby("class"):
        n_train = int(round(len(group) * train_pct))
        h_list = group["sha256"].tolist()
        train_hashes.update(h_list[:n_train])
        val_hashes.update(h_list[n_train:])

    def assign_split(row):
        if row["original_split"] == "test":
            return "test"
        if row["sha256"] in train_hashes:
            return "train"
        return "val"

    df["split"] = df.apply(assign_split, axis=1)

    processed_dir = REPO_ROOT / "data" / "processed"
    processed_dir.mkdir(parents=True, exist_ok=True)
    out_csv = processed_dir / "dermnet_splits.csv"
    df[["path", "class", "split", "sha256"]].to_csv(out_csv, index=False)
    print(f"Saved: {out_csv} ({len(df)} rows)")
    return True


def make_fuseg_splits():
    print("=" * 60)
    print("Generating FUSeg Wound Splits...")
    print("=" * 60)

    raw_dir = REPO_ROOT / "data" / "raw" / "fuseg"
    img_dir = raw_dir / "train" / "images"
    lbl_dir = raw_dir / "train" / "labels"

    if not img_dir.exists():
        print(f"FAILURE: FUSeg train images not found at: {img_dir}", file=sys.stderr)
        return False

    cfg = load_config()
    seed = cfg.get("random_seed", 42)
    ratios = cfg.get("splits", {"train": 0.70, "val": 0.15, "test": 0.15})

    images = sorted(list(img_dir.glob("*.png")))
    records = []
    for p in images:
        lbl_p = lbl_dir / p.name
        if lbl_p.exists():
            records.append({
                "image_path": str(p.relative_to(REPO_ROOT)).replace("\\", "/"),
                "mask_path": str(lbl_p.relative_to(REPO_ROOT)).replace("\\", "/"),
                "stem": p.stem
            })

    df = pd.DataFrame(records).sample(frac=1.0, random_state=seed).reset_index(drop=True)
    n = len(df)
    n_train = int(round(n * ratios["train"]))
    n_val = int(round(n * ratios["val"]))

    df["split"] = "test"
    df.loc[:n_train - 1, "split"] = "train"
    df.loc[n_train:n_train + n_val - 1, "split"] = "val"

    processed_dir = REPO_ROOT / "data" / "processed"
    processed_dir.mkdir(parents=True, exist_ok=True)
    out_csv = processed_dir / "fuseg_splits.csv"
    df.to_csv(out_csv, index=False)
    print(f"Saved: {out_csv} ({len(df)} rows)")
    return True


def make_nonskin_splits():
    print("=" * 60)
    print("Generating Non-Skin Splits...")
    print("=" * 60)

    raw_dir = REPO_ROOT / "data" / "raw" / "nonskin"
    if not raw_dir.exists():
        print(f"FAILURE: Non-skin folder not found at: {raw_dir}", file=sys.stderr)
        return False

    cfg = load_config()
    seed = cfg.get("random_seed", 42)
    ratios = cfg.get("splits", {"train": 0.70, "val": 0.15, "test": 0.15})

    images = list(raw_dir.rglob("*.jpg")) + list(raw_dir.rglob("*.png"))
    df = pd.DataFrame({
        "path": [str(p.relative_to(REPO_ROOT)).replace("\\", "/") for p in images]
    }).sample(frac=1.0, random_state=seed).reset_index(drop=True)

    n = len(df)
    n_train = int(round(n * ratios["train"]))
    n_val = int(round(n * ratios["val"]))

    df["split"] = "test"
    df.loc[:n_train - 1, "split"] = "train"
    df.loc[n_train:n_train + n_val - 1, "split"] = "val"

    processed_dir = REPO_ROOT / "data" / "processed"
    processed_dir.mkdir(parents=True, exist_ok=True)
    out_csv = processed_dir / "nonskin_splits.csv"
    df.to_csv(out_csv, index=False)
    print(f"Saved: {out_csv} ({len(df)} rows)")
    return True


def make_nurse_domains():
    print("=" * 60)
    print("Generating Nurse Domain Master Table...")
    print("=" * 60)

    processed_dir = REPO_ROOT / "data" / "processed"
    domain_records = []

    # 1. HAM10000 -> cancer
    ham_csv = processed_dir / "ham10000_splits.csv"
    if ham_csv.exists():
        df_ham = pd.read_csv(ham_csv)
        for _, r in df_ham.iterrows():
            domain_records.append({"path": r["path"], "split": r["split"], "domain": "cancer"})

    # 2. DermNet -> cancer for melanomas/nevi, else disease
    derm_csv = processed_dir / "dermnet_splits.csv"
    if derm_csv.exists():
        df_derm = pd.read_csv(derm_csv)
        cancer_keywords = {"melanoma", "nevi", "mole", "cancer", "carcinoma"}
        for _, r in df_derm.iterrows():
            c_name = str(r["class"]).lower()
            dom = "cancer" if any(kw in c_name for kw in cancer_keywords) else "disease"
            domain_records.append({"path": r["path"], "split": r["split"], "domain": dom})

    # 3. FUSeg -> ulcer
    fuseg_csv = processed_dir / "fuseg_splits.csv"
    if fuseg_csv.exists():
        df_fuseg = pd.read_csv(fuseg_csv)
        for _, r in df_fuseg.iterrows():
            domain_records.append({"path": r["image_path"], "split": r["split"], "domain": "ulcer"})

    # 4. Non-skin -> none
    nonskin_csv = processed_dir / "nonskin_splits.csv"
    if nonskin_csv.exists():
        df_nonskin = pd.read_csv(nonskin_csv)
        for _, r in df_nonskin.iterrows():
            domain_records.append({"path": r["path"], "split": r["split"], "domain": "none"})

    if not domain_records:
        print("No processed split CSVs available yet to construct nurse_domains.csv.")
        return

    df_domains = pd.DataFrame(domain_records)
    out_csv = processed_dir / "nurse_domains.csv"
    df_domains.to_csv(out_csv, index=False)
    print(f"Saved: {out_csv} ({len(df_domains)} total entries)")

    # Print summary table
    pivot = pd.crosstab(df_domains["domain"], df_domains["split"])
    print("\nNurse Domains Distribution:")
    print(pivot)


def main():
    parser = argparse.ArgumentParser(description="Create grouped train/val/test splits.")
    parser.add_argument("dataset", choices=["ham10000", "dermnet", "fuseg", "nonskin", "all"], help="Dataset to split")
    args = parser.parse_args()

    if args.dataset in ("ham10000", "all"):
        make_ham10000_splits()
    if args.dataset in ("dermnet", "all"):
        make_dermnet_splits()
    if args.dataset in ("fuseg", "all"):
        make_fuseg_splits()
    if args.dataset in ("nonskin", "all"):
        make_nonskin_splits()

    if args.dataset == "all":
        make_nurse_domains()


if __name__ == "__main__":
    main()
