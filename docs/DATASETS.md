# Datasets

| Dataset | Purpose | Source link | Licence | Local path | Date downloaded | Notes |
|---|---|---|---|---|---|---|
| HAM10000 (ISIC 2018 dermoscopy) | Skin cancer screening, 7 lesion classes | https://www.kaggle.com/datasets/kmader/skin-cancer-mnist-ham10000 | CC BY-NC 4.0 (Non-commercial, citation Tschandl 2018 doi:10.7910/DVN/DBW86T) | data/raw/ham10000/ | | 10015 dermoscopy images across 7 diagnoses. Used for leak-free grouped split generation by lesion_id. |
| HAM10000 Pre-trained EfficientNetV2S (Miguel764) | Cancer Junior A classifier weights | https://huggingface.co/Miguel764/efficientnetv2s-skin-cancer-classifier | Check model card | models/cancer/vit_skin_cancer/ | 2026-10-14 | 235.8 MB .h5 checkpoint trained on HAM10000 (mel, nv, bcc, akiec, bkl, df, vasc). |

---

## Split Definitions and Labels

### HAM10000
- **Split Scheme**: 70% Train, 15% Validation, 15% Test.
- **Leak-Free Guarantee**: Grouped strictly by `lesion_id`. Multiple images of the same lesion never appear across different splits.
- **Malignant or Premalignant Target (`malignant_or_premalignant`)**:
  - `1`: Malignant or premalignant diagnoses: `mel` (Melanoma), `bcc` (Basal cell carcinoma), `akiec` (Actinic keratoses / Bowen's disease).
  - `0`: Benign or non-malignant diagnoses: `nv` (Melanocytic nevi), `bkl` (Benign keratosis), `df` (Dermatofibroma), `vasc` (Vascular lesions).
