#!/usr/bin/env bash
# Runs the complete SkinSentry pipeline training sequence in order.
# Stops immediately on any failure.
set -euo pipefail

cd "$(dirname "$0")/.."

echo "=== 1. Validating Datasets ==="
python scripts/validate_datasets.py

echo "=== 2. Creating Stratified Patient-Grouped Splits ==="
python ai-service/training/splits.py

echo "=== 3. Extracting DINOv2 Feature Embeddings ==="
python ai-service/training/extract_embeddings.py

echo "=== 4. Training Nurse Modality Gates ==="
python ai-service/training/train_nurses.py

echo "=== 5. Training Cancer Screening Team ==="
python ai-service/training/train_cancer.py

echo "=== 6. Training Ulcer Segmentation Team ==="
python ai-service/training/train_ulcer.py

echo "=== 7. Training Disease Screening Team ==="
python ai-service/training/train_disease.py

echo "=== 8. Training Senior Multimodal Deciders ==="
python ai-service/training/train_seniors.py

echo "=== 9. Aggregating Real Benchmarks & Provenance ==="
python ai-service/training/evaluate.py

echo "=== Training pipeline complete. All metrics recorded in models/metrics/summary.json ==="
