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
    target_size: Tuple[int, int] = (256, 256),
) -> str:
    """Render 8x8 spatial activation grid into an artifact PNG with discrete clinical steps."""
    rows, cols = grid_size
    if patch_values and len(patch_values) == rows:
        grid = np.array(patch_values, dtype=np.float32)
    else:
        grid = np.zeros((rows, cols), dtype=np.float32)

    # Render cell-by-cell into target size with discrete palette steps
    cell_h = target_size[0] // rows
    cell_w = target_size[1] // cols

    heatmap_rgb = np.full((target_size[0], target_size[1], 3), INK_RGB, dtype=np.uint8)

    for r in range(rows):
        for c in range(cols):
            val = float(grid[r, c])
            # Palette mapping: 0.0 -> INK, 0.35 -> TEAL, 0.70 -> LIGHT_TEAL, >0.85 -> MIST
            if val < 0.20:
                color = INK_RGB
            elif val < 0.50:
                color = TEAL_RGB
            elif val < 0.75:
                color = LIGHT_TEAL_RGB
            else:
                color = MIST_RGB

            y1, y2 = r * cell_h, (r + 1) * cell_h
            x1, x2 = c * cell_w, (c + 1) * cell_w
            heatmap_rgb[y1:y2, x1:x2] = color

            # 1px border between grid cells for clean clinical layout
            cv2.rectangle(heatmap_rgb, (x1, y1), (x2, y2), INK_RGB, 1)

    pil_img = Image.fromarray(heatmap_rgb)
    buffer = BytesIO()
    pil_img.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("utf-8")
