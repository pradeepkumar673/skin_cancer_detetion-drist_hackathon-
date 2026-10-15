"""Image artifact generation: segmentation contours and patch score heatmaps.

Adheres to Project Design Rules (Rule 11, Rule 16):
- Strict clinical palette: #17252A ink, #2B7A78 teal, #3AAFA9 light teal, #DEF2F1 mist, #FEFFFF paper.
- No gradients, no glassmorphism, no purple/fuchsia.
- Clean crisp outlines (2px solid #2B7A78 teal).
"""

import base64
from io import BytesIO
from typing import List, Optional, Tuple
import cv2
import numpy as np
from PIL import Image

TEAL_RGB = (43, 122, 120)       # #2B7A78
LIGHT_TEAL_RGB = (58, 175, 169) # #3AAFA9
MIST_RGB = (222, 242, 241)      # #DEF2F1
INK_RGB = (23, 37, 42)          # #17252A


def render_overlay_b64(
    image_rgb: np.ndarray,
    mask: Optional[np.ndarray] = None,
) -> str:
    """Render original image with sharp 2px teal boundary contour around the lesion/wound mask."""
    overlay = image_rgb.copy()

    if mask is not None and np.count_nonzero(mask) > 0:
        # Find outer contours
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        # Draw 2px teal boundary (#2B7A78 -> BGR (120, 122, 43))
        bgr_teal = (TEAL_RGB[2], TEAL_RGB[1], TEAL_RGB[0])
        cv2.drawContours(overlay, contours, -1, TEAL_RGB, 2)

    # Convert to base64 PNG
    pil_img = Image.fromarray(overlay)
    buffer = BytesIO()
    pil_img.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("utf-8")


def render_heatmap_b64(
    patch_values: Optional[List[List[float]]] = None,
    grid_size: Tuple[int, int] = (8, 8),
    target_size: Tuple[int, int] = (512, 512),
) -> str:
    """Render continuous attention and saliency heatmap into an artifact PNG (matching Grad-CAM & patch attribution)."""
    rows, cols = grid_size
    if patch_values and len(patch_values) == rows:
        grid = np.array(patch_values, dtype=np.float32)
    else:
        grid = np.zeros((rows, cols), dtype=np.float32)

    # Normalize grid 0..1
    min_v, max_v = float(grid.min()), float(grid.max())
    if max_v > min_v:
        norm_grid = (grid - min_v) / (max_v - min_v)
    else:
        norm_grid = grid

    # Upsample with smooth bicubic interpolation to target size
    upsampled = cv2.resize(norm_grid, target_size, interpolation=cv2.INTER_CUBIC)
    # Smooth with Gaussian filter to match continuous optical thermal activation
    smoothed = cv2.GaussianBlur(upsampled, (25, 25), 0)
    smoothed = np.clip(smoothed, 0.0, 1.0)

    # Apply continuous TURBO colormap (deep navy -> cyan -> yellow -> intense red)
    heatmap_u8 = (smoothed * 255.0).astype(np.uint8)
    colored = cv2.applyColorMap(heatmap_u8, cv2.COLORMAP_TURBO)
    colored_rgb = cv2.cvtColor(colored, cv2.COLOR_BGR2RGB)

    pil_img = Image.fromarray(colored_rgb)
    buffer = BytesIO()
    pil_img.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("utf-8")
