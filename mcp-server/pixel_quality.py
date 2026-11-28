"""Mini-PixelLab quality passes (Step 1).

1. Pseudo-pixel grid detection: AI "pixel art" images are drawn with big fake pixels whose size is
   rarely an integer (e.g. 7.6 px) and whose grid starts at an arbitrary offset. Resizing such an
   image straight to a target size cuts across those fake pixels (broken / doubled 1px lines).
   `detect_pixel_grid` measures the real pitch + offset from edge statistics, and `depixelize`
   rebuilds the true low-resolution image (one output pixel per fake pixel).
2. Cleanup passes for sprites: despeckle (noise specks), outline enforcement (Art Bible outline
   colour), pixel-perfect outlines (remove L-shaped double corners), colour-count limit.
3. Palette extraction: greedy extension of a base palette (mood palettes), and `build_story_palette`
   (one palette per story / series from its own processed art, saturated accents kept).
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

from palettes import hex_to_rgb
from pixel_processor import nearest_palette_indices, srgb_to_oklab

# ---------------------------------------------------------------------------------------------
# 1. Pixel grid detection / depixelize
# ---------------------------------------------------------------------------------------------


@dataclass
class GridAxis:
    pitch: float  # source pixels per fake pixel
    offset: float  # position of the first cell boundary (0 <= offset < pitch)
    contrast: float  # edge energy on grid lines / edge energy inside cells (pixel art >> 1)
    confidence: float  # 0..1 derived from contrast
    line_share: float = 0.0  # share of ALL edge energy that lies on the grid lines (pixel art ~1)


MIN_CONTRAST = 3.0
MIN_LINE_SHARE = 0.40  # true grids: 0.5-0.7 even with JPEG noise; wrong grids ~0.2


def _line_share(profile: np.ndarray, pitch: float, offset: float) -> float:
    """Fraction of the total edge energy located within 1px of the grid lines."""
    n = len(profile)
    pos = np.arange(n, dtype=np.float64)
    dist = np.abs(((pos - offset + pitch / 2) % pitch) - pitch / 2)
    total = profile.sum()
    return float(profile[dist <= 1.0].sum() / total) if total > 0 else 0.0


def _edge_profile(arr: np.ndarray, axis: int) -> np.ndarray:
    """Mean colour change between neighbouring columns (axis=1) or rows (axis=0)."""
    a = arr.astype(np.float64)
    d = np.abs(np.diff(a, axis=axis)).sum(axis=2)  # (h, w-1) or (h-1, w)
    prof = d.mean(axis=0 if axis == 1 else 1)
    # boundary index b means "a new cell starts at pixel b": diff index i sits at boundary i+1
    return np.concatenate([[0.0], prof])


def _boundary_contrast(profile: np.ndarray, pitch: float, offset: float) -> float:
    """How much more the image changes ON the grid lines than INSIDE the cells.

    Real pixel art is flat inside every fake pixel, so the ratio is large (often > 10).
    Smooth illustrations and photos change everywhere (ratio ~1); JPEG 8x8 blocking only
    nudges it to ~1.5-2, so it is no longer mistaken for pixel art.
    """
    n = len(profile)
    k = np.arange(int(np.ceil((n - offset) / pitch)) + 1)
    bounds = offset + k * pitch
    bounds = bounds[(bounds >= 1) & (bounds < n - 1)]
    if len(bounds) < 3:
        return 0.0
    idx = np.round(bounds).astype(int)
    on_line = np.maximum.reduce([profile[np.clip(idx + d, 0, n - 1)] for d in (-1, 0, 1)])
    pos = np.arange(n, dtype=np.float64)
    dist = np.abs(((pos - offset + pitch / 2) % pitch) - pitch / 2)
    inside = profile[(dist >= 1.5) & (pos > 0)]
    if len(inside) == 0:
        return 0.0
    return float(on_line.mean() / (inside.mean() + 1e-6))


def _line_energy(
    profile: np.ndarray, pitch: float, offset: float, *, skip_every: int = 0, skip_phase: int = 0
) -> float:
    """Mean edge energy on grid lines (optionally skipping every `skip_every`-th line)."""
    n = len(profile)
    k = np.arange(int(np.ceil((n - offset) / pitch)) + 1)
    if skip_every:
        k = k[(k - skip_phase) % skip_every != 0]
    b = offset + k * pitch
    keep = (b >= 1) & (b < n - 1)
    if not keep.any():
        return 0.0
    idx = np.round(b[keep]).astype(int)
    return float(np.maximum.reduce([profile[np.clip(idx + d, 0, n - 1)] for d in (-1, 0, 1)]).mean())


def _axis_candidates(profile: np.ndarray, min_pitch: float, max_pitch: float) -> list[tuple[float, float, float]]:
    """(pitch, offset, contrast) for the strongest periodicities of one axis."""
    n = len(profile)
    x = np.arange(n, dtype=np.float64)
    p = profile - np.convolve(profile, np.ones(9) / 9, mode="same")  # remove slow trends
    p = np.clip(p, 0, None)
    total = p.sum() or 1.0
    pitches = np.arange(min_pitch, min(max_pitch, n / 3) + 1e-9, 0.01)
    if len(pitches) == 0:
        return [(1.0, 0.0, 0.0)]
    phases = np.exp(-2j * np.pi * x[None, :] / pitches[:, None])
    coefs = phases @ p
    scores = np.abs(coefs) / total
    peaks = [i for i in range(len(scores))
             if (i == 0 or scores[i] >= scores[i - 1]) and (i == len(scores) - 1 or scores[i] >= scores[i + 1])]
    peaks = sorted(peaks, key=lambda i: -scores[i])[:16]
    out = []
    for i in peaks:
        pitch = float(pitches[i])
        offset = float((-np.angle(coefs[i]) / (2 * np.pi) * pitch) % pitch)
        out.append((pitch, offset, _boundary_contrast(profile, pitch, offset)))
    return out


def _promote_harmonic(profile: np.ndarray, cand: tuple[float, float, float], max_pitch: float) -> tuple[float, float, float]:
    """If only every m-th line of `cand` carries edges, the real pixel is m times bigger."""
    pitch, offset, contrast = cand
    n = len(profile)
    for m in (4, 3, 2):
        big = pitch * m
        if big > min(max_pitch, n / 3):
            continue
        for j in range(m):
            on = _line_energy(profile, big, (offset + j * pitch) % big)
            between = _line_energy(profile, pitch, offset, skip_every=m, skip_phase=j)
            if on > 0 and between < 0.3 * on:
                off_big = (offset + j * pitch) % big
                c = _boundary_contrast(profile, big, off_big)
                if c >= MIN_CONTRAST:
                    return big, off_big, c
    return cand


def _axis(cand: tuple[float, float, float], profile: np.ndarray) -> GridAxis:
    pitch, offset, contrast = cand
    conf = float(np.clip((contrast - 1.0) / 9.0, 0.0, 1.0))
    return GridAxis(pitch=round(pitch, 3), offset=round(offset, 3), contrast=round(contrast, 2),
                    confidence=round(conf, 3), line_share=round(_line_share(profile, pitch, offset), 3))


def detect_pixel_grid(
    img: Image.Image, *, min_pitch: float = 3.0, max_pitch: float = 48.0
) -> dict[str, Any]:
    """Estimate the pseudo-pixel grid of an AI pixel-art image (pitch + offset per axis)."""
    rgb = np.array(img.convert("RGB"))
    px_prof, py_prof = _edge_profile(rgb, axis=1), _edge_profile(rgb, axis=0)
    cx = _axis_candidates(px_prof, min_pitch, max_pitch)
    cy = _axis_candidates(py_prof, min_pitch, max_pitch)
    # Fake pixels are square: pick the best-supported (x, y) pair with matching pitch.
    pairs = [(a, b) for a in cx for b in cy if abs(a[0] - b[0]) <= 0.03 * max(a[0], b[0])]
    if pairs:
        bx, by = max(pairs, key=lambda ab: min(ab[0][2], ab[1][2]))
    else:
        bx, by = max(cx, key=lambda e: e[2]), max(cy, key=lambda e: e[2])
    gx = _axis(_promote_harmonic(px_prof, bx, max_pitch), px_prof)
    gy = _axis(_promote_harmonic(py_prof, by, max_pitch), py_prof)
    conf = min(gx.confidence, gy.confidence)
    return {
        "x": asdict(gx),
        "y": asdict(gy),
        "confidence": conf,
        "is_pixel_art": bool(
            gx.contrast >= MIN_CONTRAST and gy.contrast >= MIN_CONTRAST
            and gx.line_share >= MIN_LINE_SHARE and gy.line_share >= MIN_LINE_SHARE
            and min(gx.pitch, gy.pitch) >= 3.0
        ),
        "native_size": [
            len(_cell_edges(rgb.shape[1], gx.pitch, gx.offset)),
            len(_cell_edges(rgb.shape[0], gy.pitch, gy.offset)),
        ],
    }


def _cell_edges(length: int, pitch: float, offset: float) -> list[tuple[int, int]]:
    """[start, end) of every complete cell, shrunk 25% per side to avoid blurry borders."""
    cells = []
    # a boundary detected just below `pitch` really sits at ~0: start one cell earlier
    start = offset - pitch if offset > pitch - 0.6 else offset
    while start + pitch <= length + 0.25 * pitch:
        a = start + 0.25 * pitch
        b = start + 0.75 * pitch
        lo, hi = int(np.floor(a)), int(np.ceil(b))
        cells.append((max(0, lo), min(length, max(lo + 1, hi))))
        start += pitch
    return cells


MAX_FIT_ERROR = 0.03  # true grids ~0.01 even with JPEG noise; a 2x-6x too coarse grid >= 0.037


def depixelize_image(img: Image.Image, grid: dict[str, Any] | None = None) -> tuple[Image.Image, dict[str, Any]]:
    """Rebuild the true low-res image: one output pixel per detected fake pixel (median colour).

    Also measures `fit_error`: mean colour deviation inside the cells (0 = perfectly flat cells).
    A wrong grid (e.g. a screenshot of a game scaled by a non-integer factor) leaves real detail
    inside the cells and scores high; pipelines only apply the grid when fit_error <= 0.03.
    """
    grid = dict(grid or detect_pixel_grid(img))
    rgba = np.array(img.convert("RGBA"))
    h, w = rgba.shape[:2]
    xs = _cell_edges(w, grid["x"]["pitch"], grid["x"]["offset"])
    ys = _cell_edges(h, grid["y"]["pitch"], grid["y"]["offset"])
    out = np.zeros((len(ys), len(xs), 4), dtype=np.uint8)
    devs = []
    for j, (y0, y1) in enumerate(ys):
        for i, (x0, x1) in enumerate(xs):
            cell = rgba[y0:y1, x0:x1].reshape(-1, 4)
            opaque = cell[cell[:, 3] >= 128]
            if len(opaque) * 2 < len(cell):
                continue
            med = np.median(opaque[:, :3], axis=0)
            devs.append(float(np.abs(opaque[:, :3].astype(np.float64) - med).mean()) / 255.0)
            out[j, i, :3] = med.astype(np.uint8)
            out[j, i, 3] = 255
    grid["fit_error"] = round(float(np.mean(devs)) if devs else 1.0, 4)
    grid["fits"] = bool(grid.get("is_pixel_art", True) and grid["fit_error"] <= MAX_FIT_ERROR)
    return Image.fromarray(out, "RGBA"), grid


# ---------------------------------------------------------------------------------------------
# 2. Cleanup passes
# ---------------------------------------------------------------------------------------------

_N4 = ((-1, 0), (1, 0), (0, -1), (0, 1))
_N8 = _N4 + ((-1, -1), (-1, 1), (1, -1), (1, 1))


def _key(arr: np.ndarray) -> np.ndarray:
    rgb = arr[:, :, :3].astype(np.int64)
    k = (rgb[:, :, 0] << 16) | (rgb[:, :, 1] << 8) | rgb[:, :, 2]
    return np.where(arr[:, :, 3] > 0, k, -1)  # -1 = transparent


def _neighbors(k: np.ndarray, y: int, x: int, offsets) -> list[int]:
    h, w = k.shape
    return [int(k[y + dy, x + dx]) for dy, dx in offsets if 0 <= y + dy < h and 0 <= x + dx < w]


def _rgb_of(key: int) -> tuple[int, int, int]:
    return ((key >> 16) & 255, (key >> 8) & 255, key & 255)


def _set(arr: np.ndarray, y: int, x: int, key: int) -> None:
    if key < 0:
        arr[y, x] = (0, 0, 0, 0)
    else:
        arr[y, x] = (*_rgb_of(key), 255)


def quality_metrics(img: Image.Image, outline_hex: str = "#241712") -> dict[str, Any]:
    """Orphan-pixel ratio, outline compliance and colour count of a sprite (validator + reports)."""
    arr = np.array(img.convert("RGBA"))
    k = _key(arr)
    h, w = k.shape
    opaque = k >= 0
    kp = np.pad(k, 1, constant_values=-2)
    c = kp[1:-1, 1:-1]
    same = (kp[:-2, 1:-1] == c) | (kp[2:, 1:-1] == c) | (kp[1:-1, :-2] == c) | (kp[1:-1, 2:] == c)
    orphans = int(np.sum(opaque & ~same))
    # silhouette edge = opaque pixel touching a transparent pixel INSIDE the frame
    # (frame borders count as solid: busts cut by the cell edge get no outline there)
    tp = np.pad(~opaque, 1, constant_values=False)
    touches = tp[:-2, 1:-1] | tp[2:, 1:-1] | tp[1:-1, :-2] | tp[1:-1, 2:]
    edge = opaque & touches
    ol = hex_to_rgb(outline_hex)
    ok = np.all(arr[:, :, :3] == ol, axis=2) & edge
    return {
        "opaque_pixels": int(opaque.sum()),
        "orphan_pixels": orphans,
        "orphan_ratio": round(orphans / max(1, int(opaque.sum())), 4),
        "edge_pixels": int(edge.sum()),
        "outline_compliance": round(float(ok.sum()) / max(1, int(edge.sum())), 4),
        "colors": int(len(np.unique(k[opaque]))) if opaque.any() else 0,
    }


def despeckle(arr: np.ndarray, *, max_delta_e: float = 0.12) -> tuple[np.ndarray, int]:
    """Remove noise specks while keeping deliberate details.

    - floating opaque pixel with no opaque 4-neighbour -> transparent
    - 1px transparent pinhole fully surrounded by opaque pixels -> filled
    - opaque pixel unlike all 4 neighbours AND perceptually close (OKLab dE < max_delta_e) to the
      dominant neighbour colour -> takes that colour. High-contrast specks (eye highlights,
      buttons, stars) are kept because they are far from their surroundings.
    """
    out = arr.copy()
    k = _key(arr)
    h, w = k.shape
    changed = 0
    for y in range(h):
        for x in range(w):
            me = int(k[y, x])
            n4 = _neighbors(k, y, x, _N4)
            if me >= 0 and all(v < 0 for v in n4) and len(n4) == 4:
                _set(out, y, x, -1)
                changed += 1
                continue
            if me < 0:
                if len(n4) == 4 and all(v >= 0 for v in n4):
                    vals, cnt = np.unique(n4, return_counts=True)
                    _set(out, y, x, int(vals[np.argmax(cnt)]))
                    changed += 1
                continue
            if any(v == me for v in n4) or any(v < 0 for v in n4):
                continue
            n8 = [v for v in _neighbors(k, y, x, _N8) if v >= 0]
            vals, cnt = np.unique(n8, return_counts=True)
            dom = int(vals[np.argmax(cnt)])
            lab = srgb_to_oklab(np.array([_rgb_of(me), _rgb_of(dom)], dtype=np.float64))
            if float(np.linalg.norm(lab[0] - lab[1])) < max_delta_e:
                _set(out, y, x, dom)
                changed += 1
    return out, changed


def enforce_outline(arr: np.ndarray, outline_hex: str = "#241712", *, dark_l: float = 0.42) -> tuple[np.ndarray, int]:
    """Make every silhouette edge pixel the Art Bible outline colour.

    Dark edge pixels (OKLab L < dark_l) are already "outline-ish" and are recoloured; light edge
    pixels get a NEW outline pixel on the transparent side, so light clothes keep their colour.
    Frame borders count as solid (no outline along a bust's cut-off edge).
    """
    ol = hex_to_rgb(outline_hex)
    out = arr.copy()
    opaque = arr[:, :, 3] > 0
    h, w = opaque.shape
    lum = srgb_to_oklab(arr[:, :, :3].astype(np.float64))[:, :, 0]
    changed = 0
    for y in range(h):
        for x in range(w):
            if not opaque[y, x]:
                continue
            holes = [(y + dy, x + dx) for dy, dx in _N4 if 0 <= y + dy < h and 0 <= x + dx < w and not opaque[y + dy, x + dx]]
            if not holes:
                continue
            if lum[y, x] < dark_l:
                if tuple(out[y, x, :3]) != ol:
                    out[y, x] = (*ol, 255)
                    changed += 1
            else:
                for hy, hx in holes:
                    if out[hy, hx, 3] == 0:
                        out[hy, hx] = (*ol, 255)
                        changed += 1
    return out, changed


def pixel_perfect_outline(arr: np.ndarray, outline_hex: str = "#241712") -> tuple[np.ndarray, int]:
    """Remove L-shaped double corners from 1px outlines (Aseprite-style "pixel perfect")."""
    ol = hex_to_rgb(outline_hex)
    out = arr.copy()
    is_ol = (arr[:, :, 3] > 0) & np.all(arr[:, :, :3] == ol, axis=2)
    h, w = is_ol.shape
    k = _key(arr)
    changed = 0

    def o(y: int, x: int) -> bool:
        return 0 <= y < h and 0 <= x < w and bool(is_ol[y, x])

    for y in range(h):
        for x in range(w):
            if not is_ol[y, x]:
                continue
            nbrs = [(dy, dx) for dy, dx in _N4 if o(y + dy, x + dx)]
            if len(nbrs) != 2:
                continue
            (ay, ax), (by, bx) = nbrs
            if ay == by or ax == bx:  # straight line, not an L
                continue
            dy, dx = ay + by, ax + bx  # diagonal between the two neighbours
            if o(y + dy, x + dx):
                continue
            # the two neighbours stay 8-connected without this pixel -> it is a redundant corner
            others = [v for v in _neighbors(k, y, x, _N8) if v != int(k[y, x])]
            if not others:
                continue
            vals, cnt = np.unique(others, return_counts=True)
            repl = int(vals[np.argmax(cnt)])
            on_silhouette = any(
                0 <= y + dy < h and 0 <= x + dx < w and k[y + dy, x + dx] < 0 for dy, dx in _N4
            )
            if on_silhouette and repl >= 0:
                continue  # an interior colour here would become an un-outlined edge pixel
            if repl < 0:
                # becoming transparent must not expose a non-outline pixel to the outside
                exposed = any(
                    0 <= y + dy < h and 0 <= x + dx < w and k[y + dy, x + dx] >= 0 and not is_ol[y + dy, x + dx]
                    for dy, dx in _N4
                )
                if exposed:
                    continue
            _set(out, y, x, repl)
            k[y, x] = repl
            is_ol[y, x] = False
            changed += 1
    return out, changed


def limit_colors(arr: np.ndarray, max_colors: int) -> tuple[np.ndarray, int]:
    """Merge the least-used colours into their perceptually nearest remaining colour."""
    out = arr.copy()
    k = _key(arr)
    opaque = k >= 0
    vals, cnt = np.unique(k[opaque], return_counts=True)
    if max_colors <= 0 or len(vals) <= max_colors:
        return out, 0
    order = list(vals[np.argsort(cnt)])  # rarest first
    keep = set(int(v) for v in vals)
    merged = 0
    while len(keep) > max_colors:
        victim = int(order.pop(0))
        keep.discard(victim)
        rest = np.array(sorted(keep), dtype=np.int64)
        rest_rgb = np.array([_rgb_of(int(v)) for v in rest], dtype=np.uint8)
        target = int(rest[nearest_palette_indices(np.array([_rgb_of(victim)], dtype=np.uint8), rest_rgb)[0]])
        mask = k == victim
        out[mask, :3] = _rgb_of(target)
        k[mask] = target
        merged += 1
    return out, merged


def cleanup_sprite_image(
    img: Image.Image,
    *,
    despeckle_pass: bool = True,
    outline_hex: str | None = "#241712",
    pixel_perfect: bool = True,
    max_colors: int = 0,
) -> tuple[Image.Image, dict[str, Any]]:
    """Run the cleanup passes in a safe order and report before/after quality metrics."""
    arr = np.array(img.convert("RGBA"))
    before = quality_metrics(Image.fromarray(arr, "RGBA"), outline_hex or "#241712")
    report: dict[str, Any] = {"before": before}
    if despeckle_pass:
        arr, report["despeckled"] = despeckle(arr)
    if outline_hex:
        arr, report["outline_fixed"] = enforce_outline(arr, outline_hex)
        if pixel_perfect:
            arr, report["corners_removed"] = pixel_perfect_outline(arr, outline_hex)
    if max_colors:
        arr, report["colors_merged"] = limit_colors(arr, max_colors)
    out = Image.fromarray(arr, "RGBA")
    report["after"] = quality_metrics(out, outline_hex or "#241712")
    return out, report


# ---------------------------------------------------------------------------------------------
# 3. Palette extraction
# ---------------------------------------------------------------------------------------------


def _collect_colors(paths: list[str | Path]) -> tuple[np.ndarray, np.ndarray]:
    cols = []
    for p in paths:
        a = np.array(Image.open(p).convert("RGBA"))
        cols.append(a[a[:, :, 3] > 0][:, :3])
    allpx = np.concatenate(cols) if cols else np.zeros((0, 3), dtype=np.uint8)
    uniq, cnt = np.unique(allpx, axis=0, return_counts=True)
    return uniq, cnt


def extract_palette(
    paths: list[str | Path],
    n_colors: int,
    *,
    base_colors: list[tuple[int, int, int]] | None = None,
    weight_power: float = 0.75,
) -> list[str]:
    """Pick representative colours (real colours from the images, never invented averages).

    With `base_colors`, greedily ADDS the `n_colors` colours that most reduce the perceptual
    error of the images against base + added (how jp_story_master was built). Without a base,
    it greedily builds an `n_colors` palette from scratch.
    """
    uniq, cnt = _collect_colors(paths)
    if len(uniq) == 0:
        return []
    lab = srgb_to_oklab(uniq.astype(np.float64))
    w = cnt.astype(np.float64) ** weight_power
    chosen: list[int] = []
    if base_colors:
        cur = srgb_to_oklab(np.array(base_colors, dtype=np.float64))
    else:
        first = int(np.argmax(w))
        chosen.append(first)
        cur = lab[[first]]
    target = n_colors if base_colors else n_colors - 1
    # cap the candidate set for speed (most frequent colours)
    cand = np.argsort(-w)[:1500]
    for _ in range(max(0, target)):
        dcur = ((lab[:, None] - cur[None]) ** 2).sum(-1).min(1)
        dc = ((lab[:, None] - lab[None, cand]) ** 2).sum(-1)
        gain = (np.maximum(0, dcur[:, None] - dc) * w[:, None]).sum(0)
        j = int(cand[int(np.argmax(gain))])
        if gain.max() <= 0:
            break
        chosen.append(j)
        cur = np.vstack([cur, lab[j]])
    return ["#%02x%02x%02x" % tuple(int(v) for v in uniq[i]) for i in chosen]


def build_story_palette(
    groups: dict[str, list[str | Path]],
    n_colors: int = 64,
    *,
    keep: list[str] | None = None,
    group_weights: dict[str, float] | None = None,
    chroma_boost: float = 4.0,
    weight_power: float = 0.75,
    bits: int = 5,
    max_candidates: int = 2000,
) -> list[str]:
    """One palette for a whole story (or series pack), built from its own processed art.

    Why: a fixed 40-colour master palette has no warm stone grey, cold snow white or deep fire
    orange for some scenes, so locking to it (plus Bayer dither) turns grey statues into an
    orange/blue checkerboard. A palette taken from the story's own images keeps every scene's
    real colours while all assets of the story still share ONE palette (one world).

    - `groups`: images per kind, e.g. {"backgrounds": [...], "characters": [...], "items": [...]};
      each group gets `group_weights[kind]` of the total weight, split equally between its images,
      so a few small character sheets are not drowned by 64 000 background pixels.
    - `chroma_boost`: saturated colours (fire, sunset, a red bib) weigh more, so small accents keep
      a palette entry instead of being merged into the surrounding browns/greys.
    - Colours are real colours of the images (never averages); `keep` colours (the Art Bible
      outline) are always included. Deterministic: same images -> same palette.
    """
    keep = [k.lower() for k in (keep or [])]
    default_weights = {"backgrounds": 0.55, "characters": 0.35, "items": 0.10}
    weights = {**default_weights, **(group_weights or {})}
    shift = 8 - bits
    bin_rep: dict[int, tuple[int, float]] = {}  # bin -> (best colour key, best colour weight)
    bin_w: dict[int, float] = {}
    present = [g for g, ps in groups.items() if ps]
    total_share = sum(weights.get(g, 0.1) for g in present) or 1.0
    color_w: dict[int, float] = {}
    for g in present:
        share = weights.get(g, 0.1) / total_share / len(groups[g])
        for p in groups[g]:
            a = np.array(Image.open(p).convert("RGBA"))
            px = a[a[:, :, 3] >= 128][:, :3].astype(np.int64)
            if not len(px):
                continue
            keys, cnt = np.unique((px[:, 0] << 16) | (px[:, 1] << 8) | px[:, 2], return_counts=True)
            w = cnt.astype(np.float64) ** weight_power
            w *= share / w.sum()
            for k, wk in zip(keys.tolist(), w.tolist()):
                color_w[k] = color_w.get(k, 0.0) + wk
    if not color_w:
        return keep[:n_colors]
    for k, wk in color_w.items():
        b = (((k >> 16) & 255) >> shift << (2 * bits)) | (((k >> 8) & 255) >> shift << bits) | ((k & 255) >> shift)
        bin_w[b] = bin_w.get(b, 0.0) + wk
        if b not in bin_rep or wk > bin_rep[b][1] or (wk == bin_rep[b][1] and k < bin_rep[b][0]):
            bin_rep[b] = (k, wk)
    bins = sorted(bin_w)
    reps = np.array([bin_rep[b][0] for b in bins], dtype=np.int64)
    rgb = np.stack([(reps >> 16) & 255, (reps >> 8) & 255, reps & 255], axis=1).astype(np.float64)
    lab = srgb_to_oklab(rgb)
    chroma = np.sqrt(lab[:, 1] ** 2 + lab[:, 2] ** 2)
    W = np.array([bin_w[b] for b in bins]) * (1.0 + chroma_boost * chroma)
    cand = np.argsort(-W, kind="stable")[:max_candidates]
    dc = ((lab[:, None, :] - lab[None, cand, :]) ** 2).sum(-1).astype(np.float32)  # (N, C), computed once
    if keep:
        cur = srgb_to_oklab(np.array([hex_to_rgb(k) for k in keep], dtype=np.float64))
        dcur = ((lab[:, None, :] - cur[None]) ** 2).sum(-1).min(1).astype(np.float32)
    else:
        dcur = np.full(len(lab), np.inf, dtype=np.float32)
    chosen: list[int] = []
    Wf = W.astype(np.float32)
    for _ in range(max(0, n_colors - len(keep))):
        gain = (np.maximum(0, np.minimum(dcur[:, None], 1e9) - dc) * Wf[:, None]).sum(0)
        best = int(np.argmax(gain))
        if gain[best] <= 0:
            break
        chosen.append(int(cand[best]))
        dcur = np.minimum(dcur, dc[:, best])
    out = list(keep)
    for i in chosen:
        hx = "#%02x%02x%02x" % tuple(int(v) for v in rgb[i])
        if hx not in out:
            out.append(hx)
    return out
