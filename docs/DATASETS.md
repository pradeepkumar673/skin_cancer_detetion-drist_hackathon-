# Datasets

| Dataset | Purpose | Source link | Licence | Local path | Date downloaded | Notes |
|---|---|---|---|---|---|---|
| HAM10000 (ISIC 2018 dermoscopy) | Skin cancer screening, 7 lesion classes | https://www.kaggle.com/datasets/kmader/skin-cancer-mnist-ham10000 | CC BY-NC 4.0 (Non-commercial, citation Tschandl 2018 doi:10.7910/DVN/DBW86T) | data/raw/ham10000/ | | 10015 dermoscopy images across 7 diagnoses. Used for leak-free grouped split generation by lesion_id. |
| HAM10000 Pre-trained EfficientNetV2S (Miguel764) | Cancer Junior A classifier weights | https://huggingface.co/Miguel764/efficientnetv2s-skin-cancer-classifier | Check model card | models/cancer/vit_skin_cancer/ | 2026-10-14 | 235.8 MB .h5 checkpoint trained on HAM10000 (mel, nv, bcc, akiec, bkl, df, vasc). |
| DermNet | Skin disease classifier (23 classes) | https://www.kaggle.com/datasets/shubhamgoel27/dermnet | Kaggle Open / CC BY-SA | data/raw/dermnet/ | | 23 disease class folders across train and test sets. |
| DermNet Pre-trained DINOv2 (alxfgh) | Skin disease classifier weights | https://huggingface.co/alxfgh/dinov2-base-finetuned-dermnet | Check model card | models/disease/dinov2_dermnet/ | | 330.8 MB checkpoint fine-tuned on DermNet categories. |
| FUSeg Chronic Wound Dataset | Ulcer team wound segmentation | https://github.com/uwm-bigdata/wound-segmentation | Research only (cite FUSeg challenge paper) | data/raw/fuseg/ | | 1010 labeled wound photos and masks across 889 patients. Known patient-overlap leakage risk noted. |
| MedSAM (wanglab) | Wound and lesion contour segmentation | https://huggingface.co/wanglab/medsam-vit-base | Apache-2.0 | models/segmentation/medsam/ | | Pre-trained medical image segmentation model. |
| Intel Non-skin Scenes | Nurse gate negative class ("not skin") | https://www.kaggle.com/datasets/puneet6060/intel-image-classification | CC0 Public Domain | data/raw/nonskin/ | | 2000+ natural scene and everyday object photos. |

---

## Split Definitions and Labels

### HAM10000
- **Split Scheme**: 70% Train, 15% Validation, 15% Test.
- **Leak-Free Guarantee**: Grouped strictly by `lesion_id`. Multiple images of the same lesion never appear across different splits.
- **Malignant or Premalignant Target (`malignant_or_premalignant`)**:
  - `1`: Malignant or premalignant diagnoses: `mel` (Melanoma), `bcc` (Basal cell carcinoma), `akiec` (Actinic keratoses / Bowen's disease).
  - `0`: Benign or non-malignant diagnoses: `nv` (Melanocytic nevi), `bkl` (Benign keratosis), `df` (Dermatofibroma), `vasc` (Vascular lesions).

### DermNet
- **Split Scheme**: Train/val created from `train/` folder grouped by SHA-256 to eliminate exact duplicate leakage; `test/` preserved as held-out test split.

### FUSeg Foot Ulcer
- **Split Scheme**: 70% Train, 15% Validation, 15% Test from labeled images only.
- **Known Limitation**: Multiple photos per patient exist without patient ID tracking; documented as clinical test constraint.
