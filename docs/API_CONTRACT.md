# AI Service API Contract

## Endpoint

`POST /v1/analyze` (multipart)

### Request Parameters

- `image` (file, required): The lesion, wound, or skin condition image to analyze.
- `prior_image` (file, optional): A prior photo of the same site for longitudinal comparison.
- `other_lesion_images[]` (files, optional): Other lesions on the same patient for ugly-duckling comparison.
- `patient_context` (JSON string, optional): JSON containing `age`, `sex`, `skin_type`, `body_site`, `sun_exposure`, `family_history`, `diabetic`, and `px_per_cm`.

### Response Contract

Every field comes from real computation. Fields that cannot be computed are `null` with a `reason`.

```json
{
  "request_id": "uuid",
  "model_versions": {
    "backbone": "...",
    "nurses": "...",
    "cancer": "...",
    "ulcer": "...",
    "disease": "...",
    "llm": "..."
  },
  "quality": {
    "passed": true,
    "blur": 0.0,
    "brightness": 0.0,
    "contrast": 0.0,
    "width": 0,
    "height": 0,
    "reasons": [],
    "coach_tips": []
  },
  "nurses": {
    "ulcer": {
      "relevant": false,
      "score": 0.0
    },
    "disease": {
      "relevant": false,
      "score": 0.0
    },
    "cancer": {
      "relevant": true,
      "score": 0.0
    }
  },
  "teams": {
    "cancer": {
      "junior_a": {
        "class_probs": {},
        "top_class": "",
        "abcde": {
          "asymmetry": 0.0,
          "border": 0.0,
          "color": 0.0,
          "diameter_px": 0.0,
          "diameter_mm": null,
          "evolution": null
        },
        "mask_png_b64": "",
        "patch_scores": {
          "grid": [8, 8],
          "values": []
        }
      },
      "junior_b": {
        "ugly_duckling": {
          "score": null,
          "reason": ""
        },
        "change": null,
        "patch_scores": {
          "grid": [8, 8],
          "values": []
        }
      },
      "senior": {
        "likelihood": {
          "point": 0.0,
          "low": 0.0,
          "high": 0.0
        },
        "band": "low|moderate|high|very_high",
        "urgency": "monitor|routine_visit|urgent_visit",
        "likely_types": [],
        "warning_signs": []
      }
    },
    "ulcer": null,
    "disease": null
  },
  "safety": {
    "decision": "proceed|abstain|escalate",
    "agreement": {
      "agree_cells": 0,
      "disagree_cells": 0,
      "score": 0.0
    },
    "ood": {
      "score": 0.0,
      "flagged": false
    },
    "reasons": []
  },
  "arbitration": {
    "primary_team": "cancer|ulcer|disease|none",
    "notes": []
  },
  "explanation": {
    "language": "en",
    "text": "",
    "source": "groq|template",
    "validated": true
  },
  "artifacts": {
    "overlay_png_b64": "",
    "heatmap_png_b64": ""
  }
}
```
