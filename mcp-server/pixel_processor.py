"""Mini-PixelLab: Convert AI-generated images into crisp, palette-locked pixel-art spritesheets."""

from __future__ import annotations

import json
from collections import deque
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

from palettes import PALETTES, get_palette_rgb


def _color_distance_sq(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    diff = a.astype(np.int32) - b.astype(np.int32)
    return np.sum(diff * diff, axis=-1)


def remove_background(
    img: Image.Image,
    *,
    mode: str = "auto",
    tolerance: int = 48,
) -> Image.Image:
    """Remove solid backdrop via border flood-fill so interior character colors stay intact.

    Modes:
      - 'auto': samples the 4 corners and flood-fills matching border pixels.
      - 'chroma_green': targets pure green (#00FF00) backdrops.
      - 'chroma_magenta': targets pure magenta (#FF00FF) backdrops.
      - 'white': targets bright white (#FFFFFF) backdrops.
      - 'none': leaves alpha channel unchanged.
    """
    rgba = img.convert("RGBA")
    if mode == "none":
        return rgba

    arr = np.array(rgba, dtype=np.uint8)
    h, w, _ = arr.shape
    rgb = arr[:, :, :3]
    alpha = arr[:, :, 3].copy()

    if mode == "chroma_green":
        targets = [np.array([0, 255, 0], dtype=np.uint8)]
    elif mode == "chroma_magenta":
        targets = [np.array([255, 0, 255], dtype=np.uint8)]
    elif mode == "white":
        targets = [np.array([255, 255, 255], dtype=np.uint8)]
    elif mode == "auto":
        corners = [rgb[0, 0], rgb[0, w - 1], rgb[h - 1, 0], rgb[h - 1, w - 1]]
        targets = corners
    else:
        raise ValueError(
            f"Unsupported bg_mode '{mode}'. Use auto, chroma_green, chroma_magenta, white, or none."
        )

    tol_sq = tolerance * tolerance
    # Build candidate mask of pixels close to any target backdrop color
    bg_candidate = np.zeros((h, w), dtype=bool)
    for t in targets:
        dist_sq = _color_distance_sq(rgb, t)
        bg_candidate |= dist_sq <= tol_sq

    # Flood-fill strictly from image perimeter so enclosed character areas (like white eyes) remain safe
    visited = np.zeros((h, w), dtype=bool)
    queue: deque[tuple[int, int]] = deque()

    for x in range(w):
        if bg_candidate[0, x] and not visited[0, x]:
            visited[0, x] = True
            queue.append((0, x))
        if bg_candidate[h - 1, x] and not visited[h - 1, x]:
            visited[h - 1, x] = True
            queue.append((h - 1, x))
    for y in range(h):
        if bg_candidate[y, 0] and not visited[y, 0]:
            visited[y, 0] = True
            queue.append((y, 0))
        if bg_candidate[y, w - 1] and not visited[y, w - 1]:
            visited[y, w - 1] = True
            queue.append((y, w - 1))

    while queue:
        cy, cx = queue.popleft()
        alpha[cy, cx] = 0
        for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
            if 0 <= ny < h and 0 <= nx < w and not visited[ny, nx] and bg_candidate[ny, nx]:
                visited[ny, nx] = True
                queue.append((ny, nx))

    out = arr.copy()
    out[:, :, 3] = alpha

    # Despill any faint greenish JPEG compression halo along 1px silhouette edges
    if mode == "chroma_green":
        rgb_i = out[:, :, :3].astype(np.int32)
        g_dom = rgb_i[:, :, 1] - np.maximum(rgb_i[:, :, 0], rgb_i[:, :, 2])
        strong_green = (rgb_i[:, :, 1] > 110) & (g_dom > 32)
        out[strong_green, 3] = 0
        fringe = (out[:, :, 3] > 0) & (g_dom > 14)
        if np.any(fringe):
            out[fringe, 0] = np.minimum(out[fringe, 0], 42)
            out[fringe, 1] = np.minimum(out[fringe, 1], 28)
            out[fringe, 2] = np.minimum(out[fringe, 2], 24)

    return Image.fromarray(out, mode="RGBA")


def snap_to_pixel_grid(
    img: Image.Image,
    target_width: int,
    target_height: int,
    *,
    alpha_threshold: int = 128,
) -> Image.Image:
    """Downscale an image to a true crisp pixel-art grid with hard binary alpha (no anti-aliasing)."""
    rgba = img.convert("RGBA")
    arr = np.array(rgba, dtype=np.uint8)
    src_h, src_w, _ = arr.shape

    out = np.zeros((target_height, target_width, 4), dtype=np.uint8)

    # Sample the center-weighted region of each target pixel cell to avoid blurry edges / mixels
    for ty in range(target_height):
        y0 = int(round(ty * src_h / target_height))
        y1 = max(y0 + 1, int(round((ty + 1) * src_h / target_height)))
        for tx in range(target_width):
            x0 = int(round(tx * src_w / target_width))
            x1 = max(x0 + 1, int(round((tx + 1) * src_w / target_width)))
            cell = arr[y0:y1, x0:x1]

            opaque_mask = cell[:, :, 3] >= alpha_threshold
            # Pixel is visible only if at least 40% of its source cell is opaque
            if np.mean(opaque_mask) < 0.40:
                continue

            opaque_rgb = cell[:, :, :3][opaque_mask]
            # Use median per channel inside the cell: robust against edge anti-aliasing artifacts
            med_rgb = np.median(opaque_rgb, axis=0).astype(np.uint8)
            out[ty, tx, :3] = med_rgb
            out[ty, tx, 3] = 255

    return Image.fromarray(out, mode="RGBA")


def quantize_to_palette(img: Image.Image, palette_name: str) -> Image.Image:
    """Lock every visible pixel to the closest color in a curated retro palette."""
    if palette_name == "none":
        return img.convert("RGBA")

    palette_rgb = np.array(get_palette_rgb(palette_name), dtype=np.int32)
    arr = np.array(img.convert("RGBA"), dtype=np.uint8)
    visible = arr[:, :, 3] > 0

    if not np.any(visible):
        return img.convert("RGBA")

    pixels = arr[:, :, :3][visible].astype(np.int32)  # (N, 3)
    # Vectorized Euclidean distance in RGB space: (N, 1, 3) - (1, P, 3)
    diffs = pixels[:, None, :] - palette_rgb[None, :, :]
    dists = np.sum(diffs * diffs, axis=-1)
    nearest_idx = np.argmin(dists, axis=-1)
    snapped_rgb = palette_rgb[nearest_idx].astype(np.uint8)

    out = arr.copy()
    out[:, :, :3][visible] = snapped_rgb
    return Image.fromarray(out, mode="RGBA")


def align_sprite_frame(
    frame: Image.Image,
    target_width: int,
    target_height: int,
    *,
    align_bottom: bool = True,
    padding: int = 1,
) -> Image.Image:
    """Crop tight to character bounding box and place cleanly aligned in target cell."""
    bbox = frame.getbbox()
    canvas = Image.new("RGBA", (target_width, target_height), (0, 0, 0, 0))
    if bbox is None:
        return canvas

    cropped = frame.crop(bbox)
    cw, ch = cropped.size

    max_w = max(1, target_width - padding * 2)
    max_h = max(1, target_height - padding * 2)
    if cw > max_w or ch > max_h:
        scale = min(max_w / cw, max_h / ch)
        new_w = max(1, int(round(cw * scale)))
        new_h = max(1, int(round(ch * scale)))
        cropped = cropped.resize((new_w, new_h), resample=Image.Resampling.NEAREST)
        cw, ch = cropped.size

    paste_x = (target_width - cw) // 2
    paste_y = (target_height - ch - padding) if align_bottom else (target_height - ch) // 2
    canvas.paste(cropped, (paste_x, max(0, paste_y)), cropped)
    return canvas


def process_pixel_sprite(
    input_path: str | Path,
    output_path: str | Path,
    *,
    target_width: int = 48,
    target_height: int = 64,
    palette_name: str = "midnight_tokyo",
    bg_mode: str = "auto",
    tolerance: int = 48,
    align_bottom: bool = True,
) -> dict[str, Any]:
    """Process a single AI-generated character/object image into a crisp pixel-art PNG."""
    inp = Path(input_path).expanduser().resolve()
    out = Path(output_path).expanduser().resolve()
    out.parent.mkdir(parents=True, exist_ok=True)

    img = Image.open(inp)
    clean = remove_background(img, mode=bg_mode, tolerance=tolerance)
    snapped = snap_to_pixel_grid(clean, target_width, target_height)
    aligned = align_sprite_frame(snapped, target_width, target_height, align_bottom=align_bottom)
    locked = quantize_to_palette(aligned, palette_name)
    locked.save(out, format="PNG")

    arr = np.array(locked)
    used_colors = np.unique(arr[arr[:, :, 3] > 0][:, :3], axis=0)

    return {
        "ok": True,
        "input_path": str(inp),
        "output_path": str(out),
        "size": [target_width, target_height],
        "palette": palette_name,
        "unique_colors": int(len(used_colors)),
    }


def process_sprite_sheet(
    input_path: str | Path,
    output_dir: str | Path,
    *,
    cols: int = 4,
    rows: int = 1,
    frame_width: int = 48,
    frame_height: int = 64,
    palette_name: str = "midnight_tokyo",
    bg_mode: str = "auto",
    tolerance: int = 48,
    align_bottom: bool = True,
) -> dict[str, Any]:
    """Slice a raw AI spritesheet grid into clean pixel-perfect frames + uniform horizontal strip."""
    inp = Path(input_path).expanduser().resolve()
    out_dir = Path(output_dir).expanduser().resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    raw = Image.open(inp).convert("RGBA")
    src_w, src_h = raw.size
    cell_w = src_w / cols
    cell_h = src_h / rows

    frames: list[Image.Image] = []
    frame_files: list[str] = []

    idx = 0
    for r in range(rows):
        for c in range(cols):
            box = (
                int(round(c * cell_w)),
                int(round(r * cell_h)),
                int(round((c + 1) * cell_w)),
                int(round((r + 1) * cell_h)),
            )
            sub = raw.crop(box)
            clean = remove_background(sub, mode=bg_mode, tolerance=tolerance)
            snapped = snap_to_pixel_grid(clean, frame_width, frame_height)
            aligned = align_sprite_frame(
                snapped, frame_width, frame_height, align_bottom=align_bottom
            )
            locked = quantize_to_palette(aligned, palette_name)

            frame_path = out_dir / f"frame_{idx:02d}.png"
            locked.save(frame_path, format="PNG")
            frames.append(locked)
            frame_files.append(str(frame_path))
            idx += 1

    # Assemble clean horizontal strip spritesheet
    strip = Image.new("RGBA", (frame_width * len(frames), frame_height), (0, 0, 0, 0))
    for i, fr in enumerate(frames):
        strip.paste(fr, (i * frame_width, 0))

    strip_path = out_dir / "spritesheet.png"
    strip.save(strip_path, format="PNG")

    meta = {
        "spritesheet": "spritesheet.png",
        "frameWidth": frame_width,
        "frameHeight": frame_height,
        "frameCount": len(frames),
        "palette": palette_name,
        "frames": [f"frame_{i:02d}.png" for i in range(len(frames))],
    }
    meta_path = out_dir / "meta.json"
    meta_path.write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")

    return {
        "ok": True,
        "spritesheet_path": str(strip_path),
        "meta_path": str(meta_path),
        "frame_count": len(frames),
        "frame_size": [frame_width, frame_height],
        "palette": palette_name,
        "frame_files": frame_files,
    }


def list_palettes_info() -> dict[str, Any]:
    """Return metadata and hex swatches for all built-in pixel-art palettes."""
    return {
        name: {
            "description": info["description"],
            "color_count": len(info["colors"]),  # type: ignore[arg-type]
            "colors": info["colors"],
        }
        for name, info in PALETTES.items()
    }


_BAYER_4X4 = np.array(
    [
        [0, 8, 2, 10],
        [12, 4, 14, 6],
        [3, 11, 1, 9],
        [15, 7, 13, 5],
    ],
    dtype=np.float32,
) / 16.0 - 0.5


def process_pixel_background(
    input_path: str | Path,
    output_path: str | Path,
    *,
    target_width: int = 320,
    target_height: int = 200,
    palette_name: str = "ramen_midnight",
    dither_strength: float = 18.0,
) -> dict[str, Any]:
    """Convert an AI-generated environment illustration into a true crisp 320x200 pixel-art background
    locked strictly to a Master Palette with subtle retro Bayer ordered dithering for warm lighting.
    """
    inp = Path(input_path).expanduser().resolve()
    out = Path(output_path).expanduser().resolve()
    out.parent.mkdir(parents=True, exist_ok=True)

    img = Image.open(inp).convert("RGB")
    # Center-crop to exact target aspect ratio so nothing gets stretched
    src_w, src_h = img.size
    target_ratio = target_width / float(target_height)
    src_ratio = src_w / float(src_h)
    if src_ratio > target_ratio:
        new_w = int(round(src_h * target_ratio))
        left = (src_w - new_w) // 2
        img = img.crop((left, 0, left + new_w, src_h))
    elif src_ratio < target_ratio:
        new_h = int(round(src_w / target_ratio))
        top = (src_h - new_h) // 2
        img = img.crop((0, top, src_w, top + new_h))

    # Downscale crisply with BOX area sampling (clean pixel clusters without ringing)
    small = img.resize((target_width, target_height), resample=Image.Resampling.BOX)

    if palette_name == "none":
        small.save(out, format="PNG")
        return {
            "ok": True,
            "output_path": str(out),
            "size": [target_width, target_height],
            "palette": "none",
        }

    arr = np.array(small, dtype=np.float32)
    h, w, _ = arr.shape
    if dither_strength > 0:
        bayer_tile = np.tile(_BAYER_4X4, (h // 4 + 1, w // 4 + 1))[:h, :w]
        arr = np.clip(arr + bayer_tile[:, :, None] * dither_strength, 0, 255)

    palette_rgb = np.array(get_palette_rgb(palette_name), dtype=np.float32)
    # Perceptually weighted RGB distance (human eye is more sensitive to green & red warmth)
    weights = np.array([2.0, 4.0, 3.0], dtype=np.float32)
    flat = arr.reshape(-1, 3)
    diffs = flat[:, None, :] - palette_rgb[None, :, :]
    dists = np.sum((diffs * diffs) * weights[None, None, :], axis=-1)
    nearest = np.argmin(dists, axis=-1)
    quantized = palette_rgb[nearest].reshape(h, w, 3).astype(np.uint8)

    Image.fromarray(quantized, mode="RGB").save(out, format="PNG")
    used = np.unique(quantized.reshape(-1, 3), axis=0)
    return {
        "ok": True,
        "input_path": str(inp),
        "output_path": str(out),
        "size": [target_width, target_height],
        "palette": palette_name,
        "dither_strength": dither_strength,
        "unique_colors": int(len(used)),
    }


def clean_exam_image(
    input_path: str | Path,
    output_path: str | Path,
    *,
    saturation_threshold: int = 18,
    min_brightness: int = 145,
) -> dict[str, Any]:
    """Strip colored academy watermarks (e.g., light green/blue/yellow DUNGMORI or YUUKI overlays)
    from black-and-white JLPT exam illustration cards while preserving crisp black ink line art.
    """
    inp = Path(input_path).expanduser().resolve()
    out = Path(output_path).expanduser().resolve()
    out.parent.mkdir(parents=True, exist_ok=True)

    img = Image.open(inp).convert("RGB")
    arr = np.array(img, dtype=np.int16)
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]

    max_c = np.maximum(np.maximum(r, g), b)
    min_c = np.minimum(np.minimum(r, g), b)
    chroma = max_c - min_c
    luma = (r + g + b) // 3

    # Pixels with noticeable color saturation that aren't dark ink -> pure paper white
    watermark_mask = (chroma >= saturation_threshold) & (luma >= min_brightness)
    cleaned = arr.copy()
    cleaned[watermark_mask] = 255

    # Convert faint tinted greys near white cleanly to white paper
    near_white = (cleaned[:, :, 0] > 236) & (cleaned[:, :, 1] > 236) & (cleaned[:, :, 2] > 236)
    cleaned[near_white] = 255

    out_img = Image.fromarray(cleaned.astype(np.uint8), mode="RGB")
    out_img.save(out, format="PNG", optimize=True)

    return {
        "ok": True,
        "input_path": str(inp),
        "output_path": str(out),
        "size": list(out_img.size),
        "watermark_pixels_cleaned": int(np.sum(watermark_mask)),
    }
