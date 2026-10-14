# SkinSentry: Model Cards

Every card is written to be read by a clinician who has never seen the
code. Each card states what the model does, what it was trained on,
where it fails, and what a safe deployment would require.

---

## 1. Cancer Junior A: 7-class lesion classifier

**Task:** Classify a skin lesion into one of 7 HAM10000 categories.

**Architecture:** Logistic regression on 384-d DINOv2-small embeddings,
trained on a patient-stratified split of HAM10000.

**Reported metrics:** See `models/metrics/cancer_classifier.json`.
Melanoma recall on held-out data is the number that matters.

**Known failure modes:**
- Melanoma recall is poor (~12% on our held-out split). The model
  misses most melanomas.
- Trained on dermoscopy. Smartphone photos degrade further.
- HAM10000 skews toward Fitzpatrick I-III.

**Safe use:** Never for triage. Never to reassure a patient. Any lesion
the user is worried about must be reviewed by a clinician regardless of
the model's output.

---

## 2. Ulcer Junior A: wound segmenter

**Task:** Segment wound region and estimate tissue composition.

**Architecture:** U-Net with ImageNet ResNet-34 encoder (segmentation
models PyTorch).

**Reported metrics:** Dice and IoU on FUSeg held-out.

**Known failure modes:**
- 2D photo cannot recover depth or undermining.
- Colour-based tissue estimate is heuristic, not clinically validated.
- FUSeg has patient overlap between images.

**Safe use:** Tracking wound area change over time. Not classification.

---

## 3. Disease Junior A: clinical skin classifier

**Task:** Top-3 prediction over a small set of DermNet classes, with
abstention.

**Architecture:** Calibrated logistic regression on DINOv2-small
embeddings.

**Known failure modes:**
- Class list is short and not clinically complete.
- Abstention threshold is a UX choice, not a clinical decision.

**Safe use:** Suggests possibilities. Does not diagnose.

---

## 4. Cancer Senior: risk estimator

**Task:** Predict malignant / pre-malignant probability.

**Architecture:** XGBoost on out-of-fold junior probabilities + ABCDE
percentile ranks + age + sex + body site. Isotonic calibration. Bootstrap
ensemble for the range.

**Known failure modes:**
- Only as good as the junior classifier feeding it.
- ABCDE measurements come from a segmentation mask that can be wrong.
- The ugly-duckling and change signals raise urgency but never feed
  the probability.

**Safe use:** Same as the junior: never triage.

---

## 5. Nurses: modality gates

**Task:** Decide whether an image belongs to a team's domain.

**Architecture:** Three calibrated one-vs-rest logistic regressions
plus a shared Mahalanobis OOD score.

**Known failure modes:**
- Gate thresholds are chosen for recall, so they admit some noise.
- If all three say no, the case is refused. Refusing is safe.

**Safe use:** Not user-facing.
