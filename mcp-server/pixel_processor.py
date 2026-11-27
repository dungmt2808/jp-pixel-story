"""Mini-PixelLab: Convert AI-generated images into crisp, palette-locked pixel-art spritesheets."""

from __future__ import annotations

import json
from collections import deque
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

import provenance
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

    # Chroma-green cleanup. Only touches (a) enclosed holes that really are the backdrop colour and
    # (b) the green JPEG halo along the silhouette, so GREEN OBJECTS (tea, leaves, scallions) survive.
    if mode == "chroma_green":
        rgb_i = out[:, :, :3].astype(np.int32)
        backdrop = np.array([0, 255, 0], dtype=np.int32)
        near_backdrop = np.sum((rgb_i - backdrop) ** 2, axis=-1) <= (tolerance * 1.5) ** 2
        out[near_backdrop, 3] = 0  # enclosed pockets of green screen (e.g. between arm and body)
        opaque = out[:, :, 3] > 0
        transparent = np.pad(~opaque, 2, constant_values=True)
        near_edge = np.zeros_like(opaque)
        for dy in range(-2, 3):
            for dx in range(-2, 3):
                near_edge |= transparent[2 + dy : 2 + dy + h, 2 + dx : 2 + dx + w]
        g_dom = rgb_i[:, :, 1] - np.maximum(rgb_i[:, :, 0], rgb_i[:, :, 2])
        fringe = opaque & near_edge & (g_dom > 14)
        if np.any(fringe):
            # classic despill: clamp green to the stronger of red/blue (removes the halo tint only)
            out[fringe, 1] = np.maximum(rgb_i[fringe, 0], rgb_i[fringe, 2]).astype(np.uint8)

    return Image.fromarray(out, mode="RGBA")


def _downsample_rgba(
    arr: np.ndarray,
    out_w: int,
    out_h: int,
    *,
    alpha_threshold: int = 128,
    coverage: float = 0.40,
) -> np.ndarray:
    """Area-sample an RGBA array onto an ``out_w x out_h`` grid with hard binary alpha.

    Every target pixel looks at the source cell it covers: it becomes opaque only when at
    least ``coverage`` of that cell is opaque, and takes the per-channel median colour of the
    opaque source pixels (robust against anti-aliased edges, so no mixels or halos).
    """
    src_h, src_w = arr.shape[:2]
    out = np.zeros((out_h, out_w, 4), dtype=np.uint8)
    ys = [int(round(i * src_h / out_h)) for i in range(out_h + 1)]
    xs = [int(round(i * src_w / out_w)) for i in range(out_w + 1)]
    for ty in range(out_h):
        y0 = min(ys[ty], src_h - 1)
        y1 = max(y0 + 1, ys[ty + 1])
        for tx in range(out_w):
            x0 = min(xs[tx], src_w - 1)
            x1 = max(x0 + 1, xs[tx + 1])
            cell = arr[y0:y1, x0:x1]
            opaque_mask = cell[:, :, 3] >= alpha_threshold
            if np.mean(opaque_mask) < coverage:
                continue
            opaque_rgb = cell[:, :, :3][opaque_mask]
            out[ty, tx, :3] = np.median(opaque_rgb, axis=0).astype(np.uint8)
            out[ty, tx, 3] = 255
    return out


def snap_to_pixel_grid(
    img: Image.Image,
    target_width: int,
    target_height: int,
    *,
    alpha_threshold: int = 128,
) -> Image.Image:
    """Downscale an image to a crisp pixel-art grid with hard binary alpha (no anti-aliasing).

    NOTE: this maps the whole image onto the target size and does NOT preserve aspect ratio.
    Sprite pipelines use :func:`fit_sprite` instead, which keeps proportions.
    """
    arr = np.array(img.convert("RGBA"), dtype=np.uint8)
    out = _downsample_rgba(arr, target_width, target_height, alpha_threshold=alpha_threshold)
    return Image.fromarray(out, mode="RGBA")


def _alpha_bbox(arr: np.ndarray, alpha_threshold: int = 128) -> tuple[int, int, int, int] | None:
    """Return (x0, y0, x1, y1) (exclusive) of pixels with alpha >= threshold, or None."""
    mask = arr[:, :, 3] >= alpha_threshold
    if not np.any(mask):
        return None
    rows = np.where(mask.any(axis=1))[0]
    cols = np.where(mask.any(axis=0))[0]
    return int(cols[0]), int(rows[0]), int(cols[-1]) + 1, int(rows[-1]) + 1


def _fit_scale(content_w: int, content_h: int, box_w: int, box_h: int) -> float:
    """Uniform scale that fits content inside box. Upscales only by whole integers (crisp)."""
    scale = min(box_w / content_w, box_h / content_h)
    if scale >= 1.0:
        return float(int(scale))
    return scale


def _place_offset(
    out_w: int, out_h: int, frame_w: int, frame_h: int, *, align_bottom: bool, padding: int
) -> tuple[int, int]:
    x = (frame_w - out_w) // 2
    y = (frame_h - out_h - padding) if align_bottom else (frame_h - out_h) // 2
    return x, max(0, y)


def fit_sprite(
    img: Image.Image,
    target_width: int,
    target_height: int,
    *,
    align_bottom: bool = True,
    padding: int = 1,
    fit_mode: str = "bbox",
) -> Image.Image:
    """Scale a background-removed image into a target cell WITHOUT distorting its proportions.

    fit_mode:
      - 'bbox'  : crop tight to the visible subject, then fit it inside the cell (default).
      - 'frame' : keep the source framing (centre-crop the whole image to the cell aspect ratio).
    """
    arr = np.array(img.convert("RGBA"), dtype=np.uint8)
    if fit_mode == "frame":
        src_h, src_w = arr.shape[:2]
        target_ratio = target_width / float(target_height)
        if src_w / float(src_h) > target_ratio:
            new_w = int(round(src_h * target_ratio))
            left = (src_w - new_w) // 2
            arr = arr[:, left : left + new_w]
        else:
            new_h = int(round(src_w / target_ratio))
            top = (src_h - new_h) // 2
            arr = arr[top : top + new_h]
        out = _downsample_rgba(arr, target_width, target_height)
        return Image.fromarray(out, mode="RGBA")
    if fit_mode != "bbox":
        raise ValueError(f"Unsupported fit_mode '{fit_mode}'. Use bbox or frame.")

    canvas = np.zeros((target_height, target_width, 4), dtype=np.uint8)
    bbox = _alpha_bbox(arr)
    if bbox is None:
        return Image.fromarray(canvas, mode="RGBA")
    x0, y0, x1, y1 = bbox
    content = arr[y0:y1, x0:x1]
    cw, ch = x1 - x0, y1 - y0
    scale = _fit_scale(cw, ch, max(1, target_width - 2 * padding), max(1, target_height - 2 * padding))
    out_w = max(1, int(round(cw * scale)))
    out_h = max(1, int(round(ch * scale)))
    small = _downsample_rgba(content, out_w, out_h)
    px_, py_ = _place_offset(out_w, out_h, target_width, target_height, align_bottom=align_bottom, padding=padding)
    canvas[py_ : py_ + out_h, px_ : px_ + out_w] = small
    return Image.fromarray(canvas, mode="RGBA")


def align_sprite_frame(
    frame: Image.Image,
    target_width: int,
    target_height: int,
    *,
    align_bottom: bool = True,
    padding: int = 1,
) -> Image.Image:
    """Crop tight to the subject and place it in the target cell, keeping aspect ratio.

    Kept for backwards compatibility; equivalent to ``fit_sprite(..., fit_mode='bbox')``.
    """
    return fit_sprite(frame, target_width, target_height, align_bottom=align_bottom, padding=padding)


# ---------------------------------------------------------------------------
# Perceptual palette matching (OKLab)
# ---------------------------------------------------------------------------


def srgb_to_oklab(rgb: np.ndarray) -> np.ndarray:
    """Convert sRGB values (0-255, shape (..., 3)) to OKLab (perceptually uniform)."""
    c = np.asarray(rgb, dtype=np.float64) / 255.0
    lin = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    r, g, b = lin[..., 0], lin[..., 1], lin[..., 2]
    l_ = np.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
    m_ = np.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
    s_ = np.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
    return np.stack(
        [
            0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
            1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
            0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
        ],
        axis=-1,
    )


def nearest_palette_indices(pixels_rgb: np.ndarray, palette_rgb: np.ndarray) -> np.ndarray:
    """Index of the perceptually closest palette colour (OKLab distance) for every pixel."""
    pix_lab = srgb_to_oklab(pixels_rgb.reshape(-1, 3))
    pal_lab = srgb_to_oklab(np.asarray(palette_rgb).reshape(-1, 3))
    idx = np.empty(len(pix_lab), dtype=np.int64)
    chunk = 65536
    for start in range(0, len(pix_lab), chunk):
        part = pix_lab[start : start + chunk]
        d = np.sum((part[:, None, :] - pal_lab[None, :, :]) ** 2, axis=-1)
        idx[start : start + chunk] = np.argmin(d, axis=-1)
    return idx


def quantize_to_palette(img: Image.Image, palette_name: str) -> Image.Image:
    """Lock every visible pixel to the perceptually closest colour of a curated palette."""
    if palette_name == "none":
        return img.convert("RGBA")

    palette_rgb = np.array(get_palette_rgb(palette_name), dtype=np.uint8)
    arr = np.array(img.convert("RGBA"), dtype=np.uint8)
    visible = arr[:, :, 3] > 0
    if not np.any(visible):
        return img.convert("RGBA")

    nearest_idx = nearest_palette_indices(arr[:, :, :3][visible], palette_rgb)
    out = arr.copy()
    out[:, :, :3][visible] = palette_rgb[nearest_idx]
    return Image.fromarray(out, mode="RGBA")


def _maybe_depixelize(img: Image.Image, grid: str) -> tuple[Image.Image, dict[str, Any] | None]:
    """grid='auto': rebuild true pixels of AI pixel-art inputs before any resizing."""
    if grid not in ("auto", "none"):
        raise ValueError("grid must be 'auto' or 'none'.")
    if grid == "none":
        return img, None
    from pixel_quality import depixelize_image, detect_pixel_grid

    g = detect_pixel_grid(img)
    if not g["is_pixel_art"]:
        return img, {**g, "applied": False}
    small, g = depixelize_image(img, g)
    if not g["fits"]:
        return img, {**g, "applied": False}
    return small, {**g, "applied": True}


def _outline_for_palette(outline_color: str | None, palette_name: str) -> str | None:
    """Snap the outline colour to the palette so cleanup never adds an off-palette colour."""
    if not outline_color or palette_name == "none":
        return outline_color
    from palettes import hex_to_rgb

    pal = np.array(get_palette_rgb(palette_name), dtype=np.uint8)
    idx = nearest_palette_indices(np.array([hex_to_rgb(outline_color)], dtype=np.uint8), pal)[0]
    return "#%02x%02x%02x" % tuple(int(v) for v in pal[idx])


def _cleanup(img: Image.Image, outline_color: str | None, palette_name: str) -> tuple[Image.Image, dict[str, Any]]:
    from pixel_quality import cleanup_sprite_image

    return cleanup_sprite_image(img, outline_hex=_outline_for_palette(outline_color, palette_name))


def _used_colors(img: Image.Image) -> int:
    arr = np.array(img.convert("RGBA"))
    vis = arr[arr[:, :, 3] > 0][:, :3]
    return int(len(np.unique(vis, axis=0))) if len(vis) else 0


def process_pixel_sprite(
    input_path: str | Path,
    output_path: str | Path,
    *,
    target_width: int = 48,
    target_height: int = 64,
    palette_name: str = "jp_story_master",
    bg_mode: str = "auto",
    tolerance: int = 48,
    align_bottom: bool = True,
    fit_mode: str = "bbox",
    grid: str = "none",
    cleanup: bool = False,
    outline_color: str | None = "#241712",
    record_provenance: bool = True,
    source: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Process a single AI-generated character/object image into a crisp pixel-art PNG.

    Proportions are always preserved (the subject is fitted, never stretched).
    grid='auto' first rebuilds the true pixels of AI pixel-art inputs; cleanup=True runs
    despeckle + Art Bible outline + pixel-perfect corners on the result.
    """
    inp = Path(input_path).expanduser().resolve()
    out = Path(output_path).expanduser().resolve()
    out.parent.mkdir(parents=True, exist_ok=True)

    img, grid_info = _maybe_depixelize(Image.open(inp), grid)
    clean = remove_background(img, mode=bg_mode, tolerance=tolerance)
    fitted = fit_sprite(
        clean, target_width, target_height, align_bottom=align_bottom, fit_mode=fit_mode
    )
    locked = quantize_to_palette(fitted, palette_name)
    cleanup_report = None
    if cleanup:
        locked, cleanup_report = _cleanup(locked, outline_color, palette_name)
    locked.save(out, format="PNG")
    if record_provenance:
        provenance.record(
            "process_pixel_sprite",
            dict(target_width=target_width, target_height=target_height, palette_name=palette_name, bg_mode=bg_mode,
                 tolerance=tolerance, align_bottom=align_bottom, fit_mode=fit_mode, grid=grid, cleanup=cleanup,
                 outline_color=outline_color),
            output=out, input_path=inp, source=source,
        )

    return {
        "grid": grid_info,
        "cleanup": cleanup_report,
        "ok": True,
        "input_path": str(inp),
        "output_path": str(out),
        "size": [target_width, target_height],
        "palette": palette_name,
        "fit_mode": fit_mode,
        "unique_colors": _used_colors(locked),
    }


def _normalize_clips(
    clips: dict[str, Any] | None, frame_count: int, fps: float
) -> dict[str, dict[str, Any]]:
    """Normalise clip definitions to {name: {frames: [...], fps: float, loop: bool}}."""
    if not clips:
        return {"all": {"frames": list(range(frame_count)), "fps": fps, "loop": True}}
    result: dict[str, dict[str, Any]] = {}
    for name, spec in clips.items():
        if isinstance(spec, list):
            spec = {"frames": spec}
        if not isinstance(spec, dict) or not isinstance(spec.get("frames"), list):
            raise ValueError(f"Clip '{name}' must be a list of frame indices or {{frames: [...]}}.")
        frames = [int(f) for f in spec["frames"]]
        bad = [f for f in frames if f < 0 or f >= frame_count]
        if not frames or bad:
            raise ValueError(f"Clip '{name}' has invalid frame indices {bad or frames} (0..{frame_count - 1}).")
        result[name] = {
            "frames": frames,
            "fps": float(spec.get("fps", fps)),
            "loop": bool(spec.get("loop", True)),
        }
        if spec.get("stridePx") is not None:
            # walk / run cycles: px travelled per full cycle, so the player picks frames by distance
            stride = float(spec["stridePx"])
            if stride <= 0:
                raise ValueError(f"Clip '{name}': stridePx must be > 0.")
            result[name]["stridePx"] = stride
    return result


def _split_by_gaps(clean: np.ndarray, count: int, margin: int = 6) -> list[np.ndarray]:
    """Cut one row of `count` figures apart at the empty columns between them.

    Every cell gets the same width (widest figure + margin) centred on its figure, and keeps
    only that figure's columns, so a neighbour's hand or a stray speck never leaks in.
    """
    h, w = clean.shape[:2]
    occupied = (clean[:, :, 3] >= 128).sum(axis=0) >= 2  # 2+ px tall: lone noise specks do not count
    runs: list[list[int]] = []
    x = 0
    while x < w:
        if occupied[x]:
            x0 = x
            while x < w and occupied[x]:
                x += 1
            runs.append([x0, x])
        x += 1
    if not runs:
        raise ValueError("split='gaps': no figure found (is the background removed?).")
    widest = max(b - a for a, b in runs)
    # merge parts of one figure (a hand held out in front) split by a narrow gap,
    # without merging two separate full-size figures that sit close together
    merged: list[list[int]] = []
    for a, b in runs:
        if merged and a - merged[-1][1] < max(3, widest * 0.08) and b - merged[-1][0] <= widest * 1.15:
            merged[-1][1] = b
        else:
            merged.append([a, b])
    figures = [r for r in merged if r[1] - r[0] >= max(4, 0.25 * max(b - a for a, b in merged))]
    if len(figures) != count:
        raise ValueError(
            f"split='gaps' found {len(figures)} figures (x ranges {figures}), expected cols={count}."
        )
    cell_w = max(b - a for a, b in figures) + 2 * margin
    cells: list[np.ndarray] = []
    for a, b in figures:
        cell = np.zeros((h, cell_w, 4), dtype=np.uint8)
        left = (a + b) // 2 - cell_w // 2
        for cx in range(cell_w):
            sx = left + cx
            if a <= sx < b:
                cell[:, cx] = clean[:, sx]
        cells.append(cell)
    return cells


def process_sprite_sheet(
    input_path: str | Path,
    output_dir: str | Path,
    *,
    cols: int = 4,
    rows: int = 1,
    frame_width: int = 48,
    frame_height: int = 64,
    palette_name: str = "jp_story_master",
    bg_mode: str = "auto",
    tolerance: int = 48,
    align_bottom: bool = True,
    registration: str = "cell",
    fps: float = 8.0,
    clips: dict[str, Any] | None = None,
    padding: int = 1,
    grid: str = "none",
    cleanup: bool = False,
    outline_color: str | None = "#241712",
    lock_expressions: bool = False,
    expression_region: list[int] | None = None,
    record_provenance: bool = True,
    source: dict[str, Any] | None = None,
    facing: str = "",
    split: str = "grid",
    pixel_pitch: float = 0.0,
) -> dict[str, Any]:
    """Slice a raw AI spritesheet grid into registered, pixel-perfect animation frames.

    All frames share ONE scale factor and ONE anchor so the character never stretches,
    shrinks or jitters between frames.

    registration:
      - 'cell'     : trust the source layout; every frame keeps its position inside its cell.
      - 'centroid' : AI sheets often drift; shift every frame so the silhouette centroid (x)
                     and the ground line (bottom y) line up before the shared crop.
      - 'bust'     : like 'centroid' but anchored on the head (top row + head centroid-x), for
                     portrait/expression sheets whose torso is cut off by the cell edge.

    split:
      - 'grid' : `cols` x `rows` equal cells.
      - 'gaps' : one row of figures that are NOT evenly spaced (generators rarely are): the figures
                 are found by the empty columns between them; there must be exactly `cols` of them.
    pixel_pitch: source pixels per art pixel (e.g. 5.5 for a 2000 px wide sheet of 10 chibi
      walkers). Fixes the scale to 1 / pitch instead of fitting the frame, so every sheet of a
      story keeps the same world scale and one output pixel = one drawn pixel.
    """
    if registration not in ("cell", "centroid", "bust"):
        raise ValueError("registration must be 'cell', 'centroid' or 'bust'.")
    if facing not in ("", "left", "right"):
        raise ValueError("facing must be 'left' or 'right' (the way a side-view character looks).")
    if split not in ("grid", "gaps"):
        raise ValueError("split must be 'grid' or 'gaps'.")
    if split == "gaps" and rows != 1:
        raise ValueError("split='gaps' reads one row of figures (rows=1).")
    if pixel_pitch < 0:
        raise ValueError("pixel_pitch must be > 0 (or 0 to fit the frame).")
    inp = Path(input_path).expanduser().resolve()
    out_dir = Path(output_dir).expanduser().resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    raw_img, grid_info = _maybe_depixelize(Image.open(inp), grid)
    raw = raw_img.convert("RGBA")
    src_w, src_h = raw.size
    cell_w = src_w // cols
    cell_h = src_h // rows

    # 1. Clean every cell (identical cell size so a shared crop box maps identically).
    cells: list[np.ndarray] = []
    if split == "gaps":
        cells = _split_by_gaps(np.array(remove_background(raw, mode=bg_mode, tolerance=tolerance), dtype=np.uint8), cols)
    for r in range(rows if split == "grid" else 0):
        for c in range(cols):
            left = int(round(c * src_w / cols))
            top = int(round(r * src_h / rows))
            sub = raw.crop((left, top, left + cell_w, top + cell_h))
            clean = remove_background(sub, mode=bg_mode, tolerance=tolerance)
            cells.append(np.array(clean, dtype=np.uint8))

    # 2. Optional drift correction across frames:
    #    'centroid' -> silhouette centroid-x + ground line (bottom row): full-body sprites;
    #    'bust'     -> head centroid-x (top 40% of the silhouette) + top row: busts/portraits
    #                  that are cut off by the cell edge, so their bottom row cannot be trusted.
    if registration in ("centroid", "bust"):
        anchors: list[tuple[float, int] | None] = []
        for arr in cells:
            mask = arr[:, :, 3] >= 128
            if not np.any(mask):
                anchors.append(None)
                continue
            filled_rows = np.where(mask.any(axis=1))[0]
            top, bottom = int(filled_rows[0]), int(filled_rows[-1])
            if registration == "bust":
                head_end = top + max(1, int((bottom - top + 1) * 0.4))
                xs = np.where(mask[top:head_end])[1]
                anchors.append((float(xs.mean()), top))
            else:
                xs = np.where(mask)[1]
                anchors.append((float(xs.mean()), bottom))
        valid = [a for a in anchors if a is not None]
        if valid:
            ref_x = float(np.median([a[0] for a in valid]))
            ref_b = int(np.median([a[1] for a in valid]))
            shifted: list[np.ndarray] = []
            for arr, a in zip(cells, anchors):
                if a is None:
                    shifted.append(arr)
                    continue
                dx = int(round(ref_x - a[0]))
                dy = ref_b - a[1]
                moved = np.zeros_like(arr)
                h, w = arr.shape[:2]
                ys0, ys1 = max(0, dy), min(h, h + dy)
                xs0, xs1 = max(0, dx), min(w, w + dx)
                moved[ys0:ys1, xs0:xs1] = arr[ys0 - dy : ys1 - dy, xs0 - dx : xs1 - dx]
                shifted.append(moved)
            cells = shifted

    # 3. Union bounding box over all frames -> one shared crop + one shared scale.
    boxes = [b for b in (_alpha_bbox(a) for a in cells) if b is not None]
    frame_files: list[str] = []
    frames: list[Image.Image] = []
    if boxes:
        ux0 = min(b[0] for b in boxes)
        uy0 = min(b[1] for b in boxes)
        ux1 = max(b[2] for b in boxes)
        uy1 = max(b[3] for b in boxes)
        uw, uh = ux1 - ux0, uy1 - uy0
        scale = _fit_scale(uw, uh, max(1, frame_width - 2 * padding), max(1, frame_height - 2 * padding))
        if pixel_pitch:
            fixed = 1.0 / pixel_pitch
            need_w, need_h = int(round(uw * fixed)) + 2 * padding, int(round(uh * fixed)) + 2 * padding
            if need_w > frame_width or need_h > frame_height:
                raise ValueError(
                    f"At pixel_pitch {pixel_pitch} the figure is {need_w}x{need_h} px with padding; "
                    f"use a frame of at least that size (got {frame_width}x{frame_height})."
                )
            scale = fixed
        out_w = max(1, int(round(uw * scale)))
        out_h = max(1, int(round(uh * scale)))
        off_x, off_y = _place_offset(
            out_w, out_h, frame_width, frame_height, align_bottom=align_bottom, padding=padding
        )
    else:
        ux0 = uy0 = ux1 = uy1 = 0
        scale, out_w, out_h, off_x, off_y = 1.0, frame_width, frame_height, 0, 0

    for idx, arr in enumerate(cells):
        canvas = np.zeros((frame_height, frame_width, 4), dtype=np.uint8)
        if boxes:
            small = _downsample_rgba(arr[uy0:uy1, ux0:ux1], out_w, out_h)
            canvas[off_y : off_y + out_h, off_x : off_x + out_w] = small
        locked = quantize_to_palette(Image.fromarray(canvas, mode="RGBA"), palette_name)
        if cleanup:
            locked, _ = _cleanup(locked, outline_color, palette_name)
        frame_path = out_dir / f"frame_{idx:02d}.png"
        locked.save(frame_path, format="PNG")
        frames.append(locked)
        frame_files.append(str(frame_path))

    # 4. Uniform horizontal strip.
    strip = Image.new("RGBA", (frame_width * len(frames), frame_height), (0, 0, 0, 0))
    for i, fr in enumerate(frames):
        strip.paste(fr, (i * frame_width, 0))
    strip_path = out_dir / "spritesheet.png"
    strip.save(strip_path, format="PNG")

    norm_clips = _normalize_clips(clips, len(frames), fps)
    pivot = {"x": off_x + out_w // 2, "y": off_y + out_h} if boxes else {"x": frame_width // 2, "y": frame_height}
    meta = {
        "spritesheet": "spritesheet.png",
        "frameWidth": frame_width,
        "frameHeight": frame_height,
        "frameCount": len(frames),
        "palette": palette_name,
        "frames": [f"frame_{i:02d}.png" for i in range(len(frames))],
        "pivot": pivot,
        "fps": float(fps),
        "clips": norm_clips,
        "scale": round(float(scale), 6),
        "registration": registration,
    }
    if facing:
        meta["facing"] = facing
    meta_path = out_dir / "meta.json"
    meta_path.write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")

    lock_report = None
    if lock_expressions:
        from pixel_rig import lock_expressions as _lock

        lock_report = _lock(out_dir, region=expression_region or "auto", record_provenance=False)
    if record_provenance:
        provenance.record(
            "process_sprite_sheet",
            dict(cols=cols, rows=rows, frame_width=frame_width, frame_height=frame_height, palette_name=palette_name,
                 bg_mode=bg_mode, tolerance=tolerance, align_bottom=align_bottom, registration=registration, fps=fps,
                 clips=clips, padding=padding, grid=grid, cleanup=cleanup, outline_color=outline_color,
                 lock_expressions=lock_expressions, expression_region=expression_region,
                 **({"facing": facing} if facing else {}),
                 **({"split": split} if split != "grid" else {}),
                 **({"pixel_pitch": pixel_pitch} if pixel_pitch else {})),
            output=out_dir, input_path=inp, source=source,
        )

    return {
        "ok": True,
        "grid": grid_info,
        "expression_lock": lock_report,
        "spritesheet_path": str(strip_path),
        "meta_path": str(meta_path),
        "frame_count": len(frames),
        "frame_size": [frame_width, frame_height],
        "palette": palette_name,
        "scale": meta["scale"],
        "pivot": pivot,
        "clips": list(norm_clips.keys()),
        "frame_files": frame_files,
    }


def relock_palette(
    input_path: str | Path,
    output_path: str | Path | None = None,
    *,
    palette_name: str = "jp_story_master",
    record_provenance: bool = True,
) -> dict[str, Any]:
    """Re-lock an EXISTING pixel-art PNG to a palette without resizing (keeps alpha as-is)."""
    inp = Path(input_path).expanduser().resolve()
    out = Path(output_path).expanduser().resolve() if output_path else inp
    img = Image.open(inp)
    had_alpha = img.mode in ("RGBA", "LA") or "transparency" in img.info
    before = _used_colors(img)
    locked = quantize_to_palette(img, palette_name)
    if not had_alpha:
        locked = locked.convert("RGB")
    out.parent.mkdir(parents=True, exist_ok=True)
    locked.save(out, format="PNG")
    if record_provenance:
        provenance.record("relock_palette", {"palette_name": palette_name}, output=out, input_path=inp, in_place=out == inp)
    return {
        "ok": True,
        "input_path": str(inp),
        "output_path": str(out),
        "palette": palette_name,
        "colors_before": before,
        "colors_after": _used_colors(locked),
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
    palette_name: str = "jp_story_master",
    dither_strength: float = 18.0,
    grid: str = "none",
    record_provenance: bool = True,
    source: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Convert an AI-generated environment illustration into a true crisp 320x200 pixel-art background
    locked strictly to a Master Palette with subtle retro Bayer ordered dithering for warm lighting.
    """
    inp = Path(input_path).expanduser().resolve()
    out = Path(output_path).expanduser().resolve()
    out.parent.mkdir(parents=True, exist_ok=True)

    depix, grid_info = _maybe_depixelize(Image.open(inp), grid)
    img = depix.convert("RGB")
    if grid_info and grid_info.get("applied") and (img.width < target_width or img.height < target_height):
        # true pixels smaller than the stage: whole-number nearest upscale, then crop (stay crisp)
        k = int(np.ceil(max(target_width / img.width, target_height / img.height)))
        img = img.resize((img.width * k, img.height * k), Image.Resampling.NEAREST)
        left = (img.width - target_width) // 2
        top = (img.height - target_height) // 2
        img = img.crop((left, top, left + target_width, top + target_height))
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

    def _record() -> None:
        if record_provenance:
            provenance.record(
                "process_pixel_background",
                dict(target_width=target_width, target_height=target_height, palette_name=palette_name,
                     dither_strength=dither_strength, grid=grid),
                output=out, input_path=inp, source=source,
            )

    if palette_name == "none":
        small.save(out, format="PNG")
        _record()
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

    palette_rgb = np.array(get_palette_rgb(palette_name), dtype=np.uint8)
    # Perceptual OKLab distance (same matcher as sprites, so every asset maps consistently)
    nearest = nearest_palette_indices(arr.reshape(-1, 3), palette_rgb)
    quantized = palette_rgb[nearest].reshape(h, w, 3).astype(np.uint8)

    Image.fromarray(quantized, mode="RGB").save(out, format="PNG")
    _record()
    used = np.unique(quantized.reshape(-1, 3), axis=0)
    return {
        "grid": grid_info,
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
