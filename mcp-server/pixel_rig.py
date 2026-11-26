"""Mini-PixelLab character tools (Step 2): flicker-free expressions + head/body cutout rigs.

lock_expressions  - every frame becomes the base frame except inside the (auto-detected) face
                    region, so clothes/hair never "boil" when the talk clip swaps frames.
add_expression    - append a new expression frame = base frame + a small patch (eyes/mouth).
build_rig         - split a bust sheet at the neck into head frames + one body image (with a
                    hidden neck extension), so the engine can breathe / nod / bob the head by
                    whole pixels without drawing new art.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

import provenance
from pixel_processor import quantize_to_palette


# ---------------------------------------------------------------------------------------------
# sheet I/O
# ---------------------------------------------------------------------------------------------


def _load_sheet(sheet_dir: Path) -> tuple[dict[str, Any], list[np.ndarray]]:
    meta = json.loads((sheet_dir / "meta.json").read_text(encoding="utf-8"))
    strip = np.array(Image.open(sheet_dir / meta.get("spritesheet", "spritesheet.png")).convert("RGBA"))
    fw, n = int(meta["frameWidth"]), int(meta["frameCount"])
    return meta, [strip[:, i * fw : (i + 1) * fw].copy() for i in range(n)]


def _save_sheet(sheet_dir: Path, meta: dict[str, Any], frames: list[np.ndarray]) -> None:
    fh, fw = frames[0].shape[:2]
    strip = np.zeros((fh, fw * len(frames), 4), dtype=np.uint8)
    for i, f in enumerate(frames):
        strip[:, i * fw : (i + 1) * fw] = f
        Image.fromarray(f, "RGBA").save(sheet_dir / f"frame_{i:02d}.png", format="PNG")
    Image.fromarray(strip, "RGBA").save(sheet_dir / meta.get("spritesheet", "spritesheet.png"), format="PNG")
    meta["frameCount"] = len(frames)
    meta["frames"] = [f"frame_{i:02d}.png" for i in range(len(frames))]
    (sheet_dir / "meta.json").write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")


def _diff(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    return np.any(a != b, axis=2)


# ---------------------------------------------------------------------------------------------
# expressions
# ---------------------------------------------------------------------------------------------


def detect_expression_region(frames: list[np.ndarray], base_frame: int = 0, margin: int = 1) -> list[int] | None:
    """Bounding box [x0, y0, x1, y1) of the clustered differences in the HEAD zone of a bust.

    Isolated difference pixels (noise from JPEG / registration) are ignored; only clusters
    (eyes, mouth, brows) count. The head zone is the top 55% of the silhouette.
    """
    base = frames[base_frame]
    diff = np.zeros(base.shape[:2], dtype=bool)
    for i, f in enumerate(frames):
        if i != base_frame:
            diff |= _diff(f, base)
    p = np.pad(diff, 1).astype(np.int32)
    nbrs = sum(p[1 + dy : p.shape[0] - 1 + dy, 1 + dx : p.shape[1] - 1 + dx]
               for dy in (-1, 0, 1) for dx in (-1, 0, 1) if (dy, dx) != (0, 0))
    clustered = diff & (nbrs >= 2)
    opaque_rows = np.where((base[:, :, 3] > 0).any(axis=1))[0]
    if len(opaque_rows) == 0 or not clustered.any():
        return None
    top, bottom = int(opaque_rows[0]), int(opaque_rows[-1])
    head_end = top + int((bottom - top + 1) * 0.55)
    clustered[head_end:] = False
    ys, xs = np.where(clustered)
    if len(ys) == 0:
        return None
    h, w = diff.shape
    return [max(0, int(xs.min()) - margin), max(0, int(ys.min()) - margin),
            min(w, int(xs.max()) + 1 + margin), min(h, int(ys.max()) + 1 + margin)]


def lock_expressions(
    sheet_dir: str | Path,
    *,
    region: str | list[int] = "auto",
    base_frame: int = 0,
    record_provenance: bool = True,
) -> dict[str, Any]:
    """Make every frame identical to the base frame outside the expression region."""
    sdir = Path(sheet_dir).expanduser().resolve()
    meta, frames = _load_sheet(sdir)
    box = detect_expression_region(frames, base_frame) if region == "auto" else list(region)
    base = frames[base_frame]
    outside = np.ones(base.shape[:2], dtype=bool)
    if box:
        x0, y0, x1, y1 = box
        outside[y0:y1, x0:x1] = False
    before = [int((_diff(f, base) & outside).sum()) for f in frames]
    locked = []
    for f in frames:
        g = base.copy()
        if box:
            g[y0:y1, x0:x1] = f[y0:y1, x0:x1]
        locked.append(g)
    meta["expressionRegion"] = box
    meta["lockedToFrame"] = base_frame
    _save_sheet(sdir, meta, locked)
    if record_provenance:
        provenance.record("lock_expressions", {"region": region, "base_frame": base_frame}, output=sdir, in_place=True)
    return {
        "ok": True,
        "region": box,
        "flicker_pixels_before": before,
        "flicker_pixels_after": [int((_diff(f, base) & outside).sum()) for f in locked],
    }


def add_expression(
    sheet_dir: str | Path,
    patch_path: str | Path,
    *,
    x: int,
    y: int,
    clip: str = "",
    base_frame: int = 0,
    record_provenance: bool = True,
) -> dict[str, Any]:
    """Append a frame = base frame with a small RGBA patch (e.g. a sad mouth) pasted at (x, y)."""
    sdir = Path(sheet_dir).expanduser().resolve()
    meta, frames = _load_sheet(sdir)
    patch_img = Image.open(Path(patch_path).expanduser()).convert("RGBA")
    if meta.get("palette") and meta["palette"] != "none":
        patch_img = quantize_to_palette(patch_img, meta["palette"])
    patch = np.array(patch_img)
    frame = frames[base_frame].copy()
    ph, pw = patch.shape[:2]
    fh, fw = frame.shape[:2]
    if x < 0 or y < 0 or x + pw > fw or y + ph > fh:
        raise ValueError(f"patch {pw}x{ph} at ({x},{y}) does not fit in a {fw}x{fh} frame")
    region = frame[y : y + ph, x : x + pw]
    mask = patch[:, :, 3] > 0
    region[mask] = patch[mask]
    frames.append(frame)
    idx = len(frames) - 1
    if clip:
        clips = meta.setdefault("clips", {})
        spec = clips.get(clip)
        if spec is None:
            clips[clip] = {"frames": [idx], "fps": float(meta.get("fps", 8)), "loop": True}
        else:
            spec["frames"].append(idx)
    _save_sheet(sdir, meta, frames)
    if record_provenance:
        provenance.record(
            "add_expression",
            {"x": x, "y": y, "clip": clip, "base_frame": base_frame},
            output=sdir,
            in_place=True,
            extra_inputs={"patch_path": patch_path},
        )
    return {"ok": True, "frame_index": idx, "frame_count": len(frames), "clip": clip or None}


# ---------------------------------------------------------------------------------------------
# cutout rig
# ---------------------------------------------------------------------------------------------


def detect_neck_row(base: np.ndarray) -> int:
    """Row where a bust is narrowest between the head and the shoulders (top of the neck cut)."""
    opaque = base[:, :, 3] > 0
    rows = np.where(opaque.any(axis=1))[0]
    if len(rows) == 0:
        raise ValueError("empty frame")
    top, bottom = int(rows[0]), int(rows[-1])
    height = bottom - top + 1
    widths = opaque.sum(axis=1).astype(np.float64)
    smooth = np.convolve(widths, np.ones(3) / 3, mode="same")
    lo, hi = top + int(0.3 * height), top + int(0.85 * height)
    band = smooth[lo:hi]
    if len(band) == 0:
        raise ValueError("silhouette too small to find a neck")
    neck = lo + int(np.argmin(band))
    head_w = smooth[top:neck].max() if neck > top else 0
    body_w = smooth[neck:bottom + 1].max()
    if not (smooth[neck] < 0.85 * head_w and smooth[neck] < 0.85 * body_w):
        raise ValueError("no clear neck in this silhouette; pass neck_row explicitly")
    return neck


def build_rig(
    sheet_dir: str | Path,
    out_dir: str | Path | None = None,
    *,
    neck_row: int | None = None,
    neck_extension: int = 3,
    record_provenance: bool = True,
) -> dict[str, Any]:
    """Split a (locked) bust sheet into head frames + one body image + rig.json."""
    sdir = Path(sheet_dir).expanduser().resolve()
    odir = Path(out_dir).expanduser().resolve() if out_dir else sdir / "rig"
    odir.mkdir(parents=True, exist_ok=True)
    meta, frames = _load_sheet(sdir)
    base = frames[0]
    neck = int(neck_row) if neck_row is not None else detect_neck_row(base)
    fh, fw = base.shape[:2]

    head_strip = np.zeros((neck, fw * len(frames), 4), dtype=np.uint8)
    for i, f in enumerate(frames):
        head_strip[:, i * fw : (i + 1) * fw] = f[:neck]

    body = base.copy()
    body[:neck] = 0
    # Hidden neck extension: fills, UNDER the head, the rows just above the cut with the neck's
    # colours, so lifting the head by <= neck_extension px reveals neck instead of a hole.
    head_opaque_all = np.logical_and.reduce([f[:neck, :, 3] > 0 for f in frames])
    neck_cols = base[neck, :, 3] > 0
    for r in range(max(0, neck - neck_extension), neck):
        cols = neck_cols & head_opaque_all[r]
        body[r, cols] = base[neck, cols]

    Image.fromarray(body, "RGBA").save(odir / "body.png", format="PNG")
    Image.fromarray(head_strip, "RGBA").save(odir / "head.png", format="PNG")
    rig = {
        "version": 1,
        "frameWidth": fw,
        "frameHeight": fh,
        "neckRow": neck,
        "neckExtension": neck_extension,
        "pivot": meta.get("pivot", {"x": fw // 2, "y": fh}),
        "palette": meta.get("palette"),
        "body": {"image": "body.png"},
        "head": {"sheet": "head.png", "frameHeight": neck, "frameCount": len(frames)},
        "fps": meta.get("fps", 8),
        "clips": meta.get("clips", {}),
    }
    (odir / "rig.json").write_text(json.dumps(rig, indent=2) + "\n", encoding="utf-8")
    if record_provenance:
        provenance.record(
            "build_rig", {"neck_row": neck_row, "neck_extension": neck_extension}, output=odir, input_path=sdir
        )
    return {"ok": True, "rig_path": str(odir / "rig.json"), "neck_row": neck, "frame_count": len(frames)}


def compose_rig_frame(rig_dir: str | Path, frame: int, head_dy: int = 0, body_dy: int = 0) -> np.ndarray:
    """Reference compositor (tests / previews): body, then head frame on top, whole-pixel offsets."""
    rdir = Path(rig_dir)
    rig = json.loads((rdir / "rig.json").read_text(encoding="utf-8"))
    fw, fh, neck = rig["frameWidth"], rig["frameHeight"], rig["neckRow"]
    body = np.array(Image.open(rdir / rig["body"]["image"]).convert("RGBA"))
    head = np.array(Image.open(rdir / rig["head"]["sheet"]).convert("RGBA"))[:, frame * fw : (frame + 1) * fw]
    out = np.zeros((fh, fw, 4), dtype=np.uint8)

    def paste(img: np.ndarray, dy: int) -> None:
        h = img.shape[0]
        for y in range(h):
            ty = y + dy
            if 0 <= ty < fh:
                m = img[y, :, 3] > 0
                out[ty, m] = img[y, m]

    paste(body, body_dy)
    paste(head, body_dy + head_dy)
    _ = neck
    return out
