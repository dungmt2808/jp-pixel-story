"""Cut a moving object out of a finished pixel background (route C: painted scene + motion layers).

Two ways to find the object inside `rect`:
  * `polygon` (lasso, best for full-resolution AI source art whose colours blend into the scene):
    the pixels inside the outline, minus `exclude` rects for thin occluders in front of it;
  * no polygon (best for flat-colour pixel art), a "magic wand" from the rect border:
  1. inside `rect`, every colour that touches the rect border is background (sky, runway, wall...);
     a 4-connected flood fill from the border through pixels close to those colours marks it;
  2. what is left (components >= `min_component` px) is the object;
  3. `part="sprite"`: the object on transparency, with thin vertical occluders (window mullions,
     poles) healed by closing horizontal gaps <= `max_gap` px;
     `part="clean"`: the background with the object removed and the hole filled, either by cloning
     the texture just left (or right) of each masked run (`inpaint="clone"`, for pixel art) or with
     the row median (`inpaint="median"`, for full-resolution source art that is pixelized after).
     Sky, runway and floor are horizontal bands, so both fills continue them.
Both parts come from the same call signature, so provenance can replay each one.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageDraw

import provenance


def _object_mask(crop: np.ndarray, tolerance: float, min_component: int) -> tuple[np.ndarray, np.ndarray]:
    h, w, _ = crop.shape
    rgb = crop[..., :3].astype(np.int32)
    border = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]])
    bg_colors = np.unique(border.reshape(-1, 3), axis=0)
    # distance of every pixel to the nearest border colour
    d = np.min(np.linalg.norm(rgb[:, :, None, :] - bg_colors[None, None, :, :], axis=-1), axis=-1)
    passable = d <= tolerance
    if crop.shape[2] == 4:
        passable |= crop[..., 3] < 16

    background = np.zeros((h, w), dtype=bool)
    stack = [(y, x) for y in range(h) for x in (0, w - 1)] + [(y, x) for x in range(w) for y in (0, h - 1)]
    while stack:
        y, x = stack.pop()
        if background[y, x] or not passable[y, x]:
            continue
        background[y, x] = True
        if y > 0:
            stack.append((y - 1, x))
        if y + 1 < h:
            stack.append((y + 1, x))
        if x > 0:
            stack.append((y, x - 1))
        if x + 1 < w:
            stack.append((y, x + 1))

    obj = ~background
    # drop specks: keep connected components of at least `min_component` px
    seen = np.zeros_like(obj)
    keep = np.zeros_like(obj)
    for sy in range(h):
        for sx in range(w):
            if not obj[sy, sx] or seen[sy, sx]:
                continue
            comp = []
            st = [(sy, sx)]
            seen[sy, sx] = True
            while st:
                y, x = st.pop()
                comp.append((y, x))
                for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                    if 0 <= ny < h and 0 <= nx < w and obj[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        st.append((ny, nx))
            if len(comp) >= min_component:
                for y, x in comp:
                    keep[y, x] = True
    # `passable` = pixels in the background colours: never grown into when emptying the hole
    return keep, passable


def _polygon_mask(shape: tuple[int, int], polygon: list[list[float]], exclude: list[list[int]]) -> np.ndarray:
    """Lasso selection: pixels inside `polygon` (crop coordinates), minus `exclude` rects
    (thin occluders in front of the object, e.g. window mullions)."""
    h, w = shape
    m = Image.new("L", (w, h), 0)
    ImageDraw.Draw(m).polygon([(float(x), float(y)) for x, y in polygon], fill=255, outline=255)
    mask = np.array(m) > 0
    for ex, ey, ew, eh in exclude:
        mask[max(0, ey) : max(0, ey + eh), max(0, ex) : max(0, ex + ew)] = False
    return mask


def _heal_gaps(sprite: np.ndarray, max_gap: int) -> np.ndarray:
    """Close short horizontal transparent runs between opaque pixels (an occluder's shadow)."""
    out = sprite.copy()
    h, w, _ = out.shape
    for y in range(h):
        opaque = np.where(out[y, :, 3] > 0)[0]
        for a, b in zip(opaque[:-1], opaque[1:]):
            gap = b - a - 1
            if 0 < gap <= max_gap:
                for x in range(a + 1, b):
                    out[y, x] = out[y, a] if x - a <= b - x else out[y, b]
    return out


def _inpaint_median(img: np.ndarray, mask: np.ndarray, x0: int, x1: int, reach: int = 48) -> np.ndarray:
    """Fill each masked pixel with the median colour of the unmasked pixels of its row near the hole.
    Best for full-resolution source art (noisy gradients): the later pixelize + dither pass
    turns the flat bands back into texture that matches the surroundings."""
    out = img.copy()
    h, w = mask.shape
    a, b = max(0, x0 - reach), min(w, x1 + reach)
    for y in range(h):
        row_mask = mask[y]
        if not row_mask.any():
            continue
        window = img[y, a:b][~row_mask[a:b]]
        if len(window) == 0:
            continue
        out[y, row_mask] = np.median(window, axis=0).astype(img.dtype)
    return out


def _inpaint_rows(img: np.ndarray, mask: np.ndarray) -> np.ndarray:
    """Fill masked pixels by cloning the run of pixels just left of each masked span (or right)."""
    out = img.copy()
    h, w = mask.shape
    for y in range(h):
        x = 0
        while x < w:
            if not mask[y, x]:
                x += 1
                continue
            a = x
            while x < w and mask[y, x]:
                x += 1
            b = x  # span [a, b)
            n = b - a
            for i in range(n):
                src = a - n + i
                if src < 0 or mask[y, max(0, src)]:
                    src = b + i
                src = min(max(src, 0), w - 1)
                out[y, a + i] = img[y, src]
    return out


def extract_object(
    input_path: str | Path,
    output_path: str | Path,
    *,
    rect: list[int],
    part: str = "sprite",
    tolerance: float = 10.0,  # palette-locked pixel art: border colours are exact
    min_component: int = 12,
    max_gap: int = 3,
    dilate: int = 1,
    inpaint: str = "clone",
    polygon: list[list[float]] | None = None,
    exclude: list[list[int]] | None = None,
    record_provenance: bool = True,
    source: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if part not in ("sprite", "clean"):
        raise ValueError("part must be 'sprite' or 'clean'")
    im = np.array(Image.open(input_path).convert("RGBA"))
    x, y, w, h = (int(v) for v in rect)
    H, W = im.shape[:2]
    x0, y0, x1, y1 = max(0, x), max(0, y), min(W, x + w), min(H, y + h)
    crop = im[y0:y1, x0:x1]
    if polygon:
        local = [[float(px) - x0, float(py) - y0] for px, py in polygon]
        excl = [[int(ex) - x0, int(ey) - y0, int(ew), int(eh)] for ex, ey, ew, eh in (exclude or [])]
        obj = _polygon_mask(crop.shape[:2], local, excl)
        protect = np.zeros_like(obj)
        for ex, ey, ew, eh in excl:
            protect[max(0, ey) : max(0, ey + eh), max(0, ex) : max(0, ex + ew)] = True
    else:
        obj, protect = _object_mask(crop, tolerance, min_component)
    if not obj.any():
        raise ValueError("no object found inside rect (lower `tolerance` or adjust `rect`)")

    if part == "sprite":
        ys, xs = np.where(obj)
        sprite = np.zeros_like(crop)
        sprite[obj] = crop[obj]
        sprite = sprite[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1]
        sprite = _heal_gaps(sprite, max_gap)
        Image.fromarray(sprite, "RGBA").save(output_path)
        result = {
            "part": part,
            "size": [int(sprite.shape[1]), int(sprite.shape[0])],
            # where the sprite sat in the background (top-left), for placing movers
            "origin": [int(x0 + xs.min()), int(y0 + ys.min())],
            "pixels": int(obj.sum()),
        }
    else:
        full = np.zeros((H, W), dtype=bool)
        full[y0:y1, x0:x1] = obj
        if dilate > 0:
            grown = full.copy()
            for _ in range(dilate):
                g = grown.copy()
                g[1:] |= grown[:-1]
                g[:-1] |= grown[1:]
                g[:, 1:] |= grown[:, :-1]
                g[:, :-1] |= grown[:, 1:]
                grown = g
            # never grow outside the rect
            clip = np.zeros_like(full)
            clip[y0:y1, x0:x1] = True
            keep_out = np.zeros_like(full)
            keep_out[y0:y1, x0:x1] = protect  # occluders in front (mullions) and plain background
            full = (grown & clip & ~keep_out) | full
        clean = _inpaint_median(im, full, x0, x1) if inpaint == "median" else _inpaint_rows(im, full)
        Image.fromarray(clean, "RGBA").convert("RGB").save(output_path)
        result = {"part": part, "filled_pixels": int(full.sum())}

    if record_provenance:
        provenance.record(
            "extract_object",
            {"rect": [x, y, w, h], "part": part, "tolerance": tolerance, "min_component": min_component,
             "max_gap": max_gap, "dilate": dilate, "inpaint": inpaint, "polygon": polygon,
             "exclude": exclude},
            output=output_path,
            input_path=input_path,
            source=source,
        )
    return result
