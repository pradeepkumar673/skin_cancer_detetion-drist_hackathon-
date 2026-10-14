"""DINOv2 backbone feature extractor for SkinSentry screening pipeline.

Loads DINOv2-small from local models/backbone/dinov2_small or HuggingFace to extract:
1. Mean patch token embeddings (N, 384)
2. Spatial patch tokens (grid_h, grid_w, 384) for lesion activation analysis.
"""

import os
from pathlib import Path
from typing import List, Optional, Tuple, Union
import numpy as np
from PIL import Image
import torch
import yaml

REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent
LOCAL_BACKBONE_DIR = REPO_ROOT / "models" / "backbone" / "dinov2_small"
CONFIG_PATH = Path(__file__).resolve().parent.parent.parent / "training" / "config.yaml"


def load_backbone_id() -> str:
    # Prefer local offline directory only if download is fully completed
    if (LOCAL_BACKBONE_DIR / "SOURCE.txt").exists() and (LOCAL_BACKBONE_DIR / "model.safetensors").exists():
        return str(LOCAL_BACKBONE_DIR)

    if CONFIG_PATH.exists():
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            cfg = yaml.safe_load(f)
            return cfg.get("backbone_id", "facebook/dinov2-small")
    return "facebook/dinov2-small"


class Backbone:
    """Pretrained vision transformer backbone for unified feature extraction."""

    def __init__(
        self,
        model_id: Optional[str] = None,
        device: Optional[str] = None,
        hf_token: Optional[str] = None,
    ):
        self.model_id = model_id or load_backbone_id()
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self.token = hf_token or os.environ.get("HF_TOKEN", None)
        self.model = None
        self.processor = None
        self._load_model()

    def _load_model(self):
        from transformers import AutoImageProcessor, AutoModel

        # If local download is still in progress, raise clear FileNotFoundError
        if not (LOCAL_BACKBONE_DIR / "SOURCE.txt").exists() and not Path(self.model_id).exists():
            raise FileNotFoundError(
                "DINOv2 backbone weights in models/backbone/dinov2_small are currently downloading. "
                "Run 'python scripts/download_backbone_model.py' to download."
            )

        token_arg = {"token": self.token} if (self.token and not Path(self.model_id).exists()) else {}
        try:
            self.processor = AutoImageProcessor.from_pretrained(
                self.model_id,
                **token_arg,
            )
            self.model = AutoModel.from_pretrained(
                self.model_id,
                **token_arg,
            )
        except Exception as e:
            raise FileNotFoundError(
                f"Failed to load DINOv2 backbone from '{self.model_id}': {e}. "
                "Run 'python scripts/download_backbone_model.py' to download weights locally."
            )

        self.model.to(self.device)
        if self.device == "cuda":
            self.model.half()
        self.model.eval()

    @torch.no_grad()
    def embed(self, images: Union[Image.Image, List[Image.Image]]) -> np.ndarray:
        """Extract mean patch tokens embedding of shape (N, 384)."""
        if isinstance(images, Image.Image):
            images = [images]

        inputs = self.processor(images=images, return_tensors="pt").to(self.device)
        if self.device == "cuda":
            inputs = {k: v.half() if v.dtype == torch.float32 else v for k, v in inputs.items()}

        outputs = self.model(**inputs)
        last_hidden = outputs.last_hidden_state
        # Token 0 is CLS token; tokens 1: are patch tokens
        patch_tokens = last_hidden[:, 1:, :]
        mean_embedding = patch_tokens.mean(dim=1)

        return mean_embedding.cpu().float().numpy()

    @torch.no_grad()
    def patch_tokens(self, image: Image.Image) -> np.ndarray:
        """Extract spatial grid patch tokens of shape (grid_h, grid_w, 384)."""
        inputs = self.processor(images=[image], return_tensors="pt").to(self.device)
        if self.device == "cuda":
            inputs = {k: v.half() if v.dtype == torch.float32 else v for k, v in inputs.items()}

        outputs = self.model(**inputs)
        last_hidden = outputs.last_hidden_state
        tokens = last_hidden[:, 1:, :][0]

        num_patches = tokens.shape[0]
        grid_dim = int(np.sqrt(num_patches))
        if grid_dim * grid_dim != num_patches:
            return tokens.cpu().float().numpy()

        grid_tokens = tokens.reshape(grid_dim, grid_dim, -1)
        return grid_tokens.cpu().float().numpy()

    def verify(self) -> bool:
        """Verify model determinism and sensitivity on distinct images."""
        img1 = Image.new("RGB", (224, 224), color=(255, 0, 0))
        img2 = Image.new("RGB", (224, 224), color=(0, 255, 0))

        emb = self.embed([img1, img2])
        if emb.shape != (2, 384):
            return False

        emb1_again = self.embed(img1)
        if not np.allclose(emb[0], emb1_again[0], atol=1e-4):
            return False

        if np.allclose(emb[0], emb[1], atol=1e-3):
            return False

        return True


_backbone_instance: Optional[Backbone] = None


def get_backbone() -> Backbone:
    global _backbone_instance
    if _backbone_instance is None:
        _backbone_instance = Backbone()
    return _backbone_instance
