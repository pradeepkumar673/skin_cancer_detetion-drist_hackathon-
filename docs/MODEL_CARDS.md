# SkinSentry Model Cards

## 1. Feature Backbone
- **Model:** `facebook/dinov2-small`
- **Architecture:** Vision Transformer (ViT-S/14) with patch size 14x14
- **Output:** 384-dimensional pooled mean feature vector and 16x16 patch tokens
- **Training Paradigm:** Self-supervised learning on LVD-142M
- **Use in SkinSentry:** Universal feature extractor for domain classifiers, lesion segmenters, and patch-level spatial disagreement.

## 2. Nurses Domain Gate
- **Models:** Binary Logistic Regression classifiers with Platt scaling (Cancer, Ulcer, Disease)
- **OOD Detector:** Empirical covariance Mahalanobis distance with Chi-squared p-value gating (threshold 99.5th percentile)
- **Inputs:** 384-dimensional DINOv2 embeddings

## 3. Cancer Screening Team
- **Junior A Classifier:** Multi-class classification on dermatoscopic features (melanocytic nevi, melanoma, basal cell carcinoma, actinic keratosis, benign keratosis, dermatofibroma, vascular)
- **Junior A ABCDE:** Automated empirical contour extraction (Asymmetry, Border irregularity, Color variance, Diameter mm, Evolution index)
- **Junior B:** ECC Affine registration + ORB feature alignment for longitudinal evolution and ugly-duckling outlier analysis
- **Senior Decider:** Calibrated risk point estimate with bootstrap ensemble uncertainty range (low to high), ugly-duckling escalation, and rapid evolution escalation

## 4. Ulcer Screening Team
- **Junior A U-Net:** ResNet-34 encoder with U-Net decoder for wound margin segmentation and metric calibration (area in px and cm2)
- **Tissue Classifier:** Granulation, slough, and necrotic tissue estimation (`tissue_estimate_only: true` per clinical protocol)
- **Junior B:** Longitudinal surface area reduction rate tracking (% change per week)
- **Senior Decider:** Trajectory classification (healing, stalled, worsening) with red-flag overrides forcing urgent clinical consultation

## 5. Disease Screening Team
- **Junior A Classifier:** Multi-class disease classification with temperature scaling and calibrated abstention
- **Senior Decider:** Top-3 validated disease candidates with confidence thresholds and clinical abstention logic

## 6. Multilingual LLM Explanation Service
- **Model:** Groq OpenAI-compatible Chat Completions API (`openai/gpt-oss-120b`)
- **Role:** Decision-support narrative synthesis in English (en), Tamil (ta), and Hindi (hi).
- **Clinical Safety Constraints:**
  - Fact-conditioned generation only: every number in output is strictly validated against input facts.
  - Banned diagnostic phrases check: prohibits definitive diagnostic claims.
  - Mandatory disclaimer: "Decision support only. A normal or low-risk result never proves there is no problem. A doctor makes the diagnosis."
  - Deterministic fallback: pre-compiled clinical templates in `config/report_templates.yaml` are invoked if API is unavailable or output fails validation.
- **Clinical Notice:** Tamil and Hindi texts must be reviewed by a native speaker before real use in clinical environments.
