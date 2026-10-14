---
language: 
- en
library_name: keras
license: mit
datasets:
- HAM10000
metrics:
- accuracy
- f1
base_model: keras.applications.EfficientNetV2S
pipeline_tag: image-classification
tags:
- skin-cancer
- medical-imaging
- dermatology
- efficientnetv2
---

# EfficientNetV2S - Skin Cancer Classifier

This repository hosts the **EfficientNetV2S** deep learning model trained for **skin cancer classification** using the [HAM10000 dataset](https://dataverse.harvard.edu/dataset.xhtml?persistentId=doi:10.7910/DVN/DBW86T). More information on github: [Skin Cancer XAI - Universidad](https://github.com/miguelplana764/skin-cancer-xai-universidad)

The model is used in the **SkinAI Diagnostics** application — a FastAPI-based web tool that allows users to upload dermatoscopic images and receive predictions across 7 skin lesion categories.

🔗 **Application GitHub Repository:** [Skin Cancer Classifier Fastapi
](https://github.com/miguelplana764/skin-cancer-classifier-fastapi)

---

## Model Overview

- **Architecture:** EfficientNetV2S
- **Parameters:** ~20.5 million
- **Dataset:** HAM10000
- **Number of Classes:** 7  
  - Actinic Keratoses and Intraepithelial Carcinoma (AKIEC)  
  - Basal Cell Carcinoma (BCC)  
  - Benign Keratosis-like Lesions (BKL)  
  - Dermatofibroma (DF)  
  - Melanoma (MEL)  
  - Melanocytic Nevi (NV)  
  - Vascular Lesions (VASC)
- **Calibration:** Temperature Scaling (T = 2.77) to improve probability reliability
- **Performance:**  
  - Accuracy: 0.88  
  - Macro F1-score: 0.80  
  - Expected Calibration Error (ECE): 0.022 (after T-scaling)

---

## Usage in SkinAI Diagnostics

In the SkinAI Diagnostics app, the model file is **automatically downloaded** from Hugging Face if not found locally.  
This ensures the application works without requiring the model to be stored in the GitHub repository.

**Automatic download logic:**
- Checks if `app/model/efficientnetv2s.h5` exists locally.
- If not found, downloads from Hugging Face using `huggingface_hub`.
- Loads the model into TensorFlow/Keras for inference.

---

## Direct Download

You can manually download the model by clicking the **Files and versions** tab above or using the `huggingface_hub` library:

```python
from huggingface_hub import hf_hub_download

model_path = hf_hub_download(
    repo_id="Miguel764/efficientnetv2s-skin-cancer-classifier",
    filename="efficientnetv2s.h5"
)
```

---

# License: MIT

---
