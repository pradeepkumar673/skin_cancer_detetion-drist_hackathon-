"""Deterministic, stratified, patient-grouped splits.

Rules:
  * The same patient or lesion ID never spans train / val / test.
  * The split is computed once and cached to disk; every trainer reads it.
  * Any held-out metric >= 0.98 raises LeakageSuspected and must be
    resolved before training output is written.
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

import numpy as np
from sklearn.model_selection import StratifiedGroupKFold

ROOT = Path(__file__).resolve().parent.parent.parent
SPLIT_DIR = ROOT / "data" / "splits"
SPLIT_DIR.mkdir(parents=True, exist_ok=True)

LEAKAGE_KEYS = (
    "balanced_accuracy",
    "macro_f1",
    "micro_f1",
    "top1_accuracy",
    "top3_accuracy",
    "accuracy",
    "auroc",
    "auprc",
    "selective_accuracy",
    "dice",
    "iou",
)
LEAKAGE_THRESHOLD = 0.98


class LeakageSuspected(RuntimeError):
    """Raised when held-out metrics look like they saw the training data."""


@dataclass(frozen=True)
class Split:
    train_idx: np.ndarray
    val_idx: np.ndarray
    test_idx: np.ndarray
    seed: int
    groups_hash: str


def _hash_groups(groups: Sequence) -> str:
    h = hashlib.sha256()
    for g in sorted(map(str, groups)):
        h.update(g.encode())
        h.update(b"\x00")
    return h.hexdigest()[:16]


def make_split(
    labels: np.ndarray,
    groups: np.ndarray,
    *,
    name: str,
    seed: int = 42,
    val_frac: float = 0.10,
    test_frac: float = 0.10,
    force: bool = False,
) -> Split:
    """Return a cached stratified, group-aware train/val/test split.

    labels : int class ids, shape (n,)
    groups : patient or lesion id, shape (n,); rows sharing an id stay together
    """
    labels = np.asarray(labels)
    groups = np.asarray(groups)
    if labels.shape != groups.shape:
        raise ValueError("labels and groups must share shape")
    if len(np.unique(labels)) < 2:
        raise ValueError("need at least two classes for a stratified split")

    cache = SPLIT_DIR / f"{name}__seed{seed}.npz"
    if cache.exists() and not force:
        d = np.load(cache, allow_pickle=False)
        return Split(
            d["train"], d["val"], d["test"], int(d["seed"]),
            str(d["groups_hash"]),
        )

    n = len(labels)
    if not 0.0 < test_frac < 0.5 or not 0.0 < val_frac < 0.5:
        raise ValueError("val_frac and test_frac must be in (0, 0.5)")

    # Peel test off first.
    outer_n = max(2, int(round(1.0 / test_frac)))
    outer = StratifiedGroupKFold(n_splits=outer_n, shuffle=True,
                                 random_state=seed)
    trainval_idx, test_idx = next(
        outer.split(np.zeros(n), labels, groups)
    )

    # Then split the remainder into train / val.
    remaining = 1.0 - test_frac
    inner_n = max(2, int(round(remaining / val_frac)))
    inner = StratifiedGroupKFold(n_splits=inner_n, shuffle=True,
                                 random_state=seed + 1)
    tv_labels = labels[trainval_idx]
    tv_groups = groups[trainval_idx]
    rel_train, rel_val = next(
        inner.split(np.zeros(len(trainval_idx)), tv_labels, tv_groups)
    )
    train_idx = trainval_idx[rel_train]
    val_idx = trainval_idx[rel_val]

    # Hard guarantee: no shared groups across splits.
    g_train = set(groups[train_idx].tolist())
    g_val = set(groups[val_idx].tolist())
    g_test = set(groups[test_idx].tolist())
    assert not (g_train & g_val), "group leak between train and val"
    assert not (g_train & g_test), "group leak between train and test"
    assert not (g_val & g_test), "group leak between val and test"

    gh = _hash_groups(groups.tolist())
    np.savez(
        cache,
        train=train_idx, val=val_idx, test=test_idx,
        seed=np.array(seed), groups_hash=np.array(gh),
    )
    return Split(train_idx, val_idx, test_idx, seed, gh)


def assert_no_leakage(metrics: dict, *, name: str) -> None:
    """Fail loudly if any held-out metric is suspiciously perfect.

    A balanced accuracy of 1.0 on a 6-class problem, or a Brier score of
    exactly 0, means the model saw the test set during training. This
    should never ship.
    """
    suspicious = []
    for key in LEAKAGE_KEYS:
        v = metrics.get(key)
        if isinstance(v, (int, float)) and v >= LEAKAGE_THRESHOLD:
            suspicious.append(f"{key}={v:.4f}")
    if suspicious:
        raise LeakageSuspected(
            f"{name}: metrics look like leakage -> {', '.join(suspicious)}. "
            "Confirm the test split is truly held out, that no reference "
            "embeddings were built on test rows, and that the model was "
            "trained on train only."
        )


def write_split_manifest(name: str, split: Split, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(
            {
                "name": name,
                "seed": split.seed,
                "groups_hash": split.groups_hash,
                "n_train": int(len(split.train_idx)),
                "n_val": int(len(split.val_idx)),
                "n_test": int(len(split.test_idx)),
            },
            indent=2,
        ),
        encoding="utf-8",
    )
