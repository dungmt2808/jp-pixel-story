"""Key-pose sheets: every pose of one character in ONE palette-locked sprite sheet (Bước 3).

A pose is a base painting plus optional state EDITS of it (the image model was asked to "change only
the hands"), the way the reference player animates Edison's lever: two complete paintings that differ
only in the arm + lever region, swapped in one frame. Pipeline:

1. splice each edit into its base at RAW resolution: edit pixels only where the pose really moved
   (difference > `splice_threshold`, speckle removed, grown by `splice_grow` px), base pixels
   everywhere else. Image models shift the colours of an edit by a few levels, enough to flip many
   pixels to a neighbouring palette entry (a flickering jacket); spliced, face and body are identical;
2. slice every pose with the sheet pipeline at ONE fixed `pixel_pitch` (raw px per art px), so all
   poses share the character's scale;
3. stand every pose on the same pivot (feet centre + ground line) in one common frame size;
4. one colour budget (`max_colors`) for the whole sheet, the same merge in every frame;
5. lock each edit to its base outside the box that really moved (no 1px drift around the face).

meta.json gets a clip per pose (`<pose>`: the base frame, `<pose>_loop`: all its frames, `<pose>_b`,
`<pose>_c`...: each edit, named like its raw file) and `poses: {name: [frame indices]}` for interactions
that drive a pose (`interaction.drive`).
"""

from __future__ import annotations

import json
import shutil
import tempfile
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageFilter

import provenance
from pixel_processor import process_sprite_sheet, srgb_to_oklab


def splice_edit(base: np.ndarray, edit: np.ndarray, *, threshold: int = 60, grow: int = 31) -> np.ndarray:
    """Edit pixels only where the pose moved (RGB arrays of the same size), base pixels elsewhere."""
    if base.shape != edit.shape:
        raise ValueError(f"an edit must have the size of its base image ({edit.shape} != {base.shape})")
    moved = (np.abs(base.astype(np.int16) - edit.astype(np.int16)).max(axis=2) > threshold).astype(np.uint8) * 255
    mask_img = Image.fromarray(moved).filter(ImageFilter.MinFilter(5))  # drop compression speckle
    if grow > 1:
        mask_img = mask_img.filter(ImageFilter.MaxFilter(grow | 1))  # margin around the moved part
    mask = np.asarray(mask_img) > 0
    return np.where(mask[:, :, None], edit, base)


def moved_box(a: np.ndarray, b: np.ndarray, *, delta_e: float = 0.10, margin: int = 1) -> list[int] | None:
    """[x0, y0, x1, y1] of the solid differences between two RGBA frames (a moved arm), or None.

    Scattered 1px differences (resampling noise) are ignored: a pixel counts only when at least 5 of
    its 3x3 neighbourhood differ too.
    """
    la = srgb_to_oklab(a[:, :, :3].reshape(-1, 3).astype(np.float64)).reshape(a.shape[0], a.shape[1], 3)
    lb = srgb_to_oklab(b[:, :, :3].reshape(-1, 3).astype(np.float64)).reshape(b.shape[0], b.shape[1], 3)
    diff = (np.sqrt(((la - lb) ** 2).sum(-1)) > delta_e) | ((a[:, :, 3] > 0) != (b[:, :, 3] > 0))
    p = np.pad(diff, 1)
    h, w = diff.shape
    near = sum(p[1 + dy : h + 1 + dy, 1 + dx : w + 1 + dx].astype(np.int8) for dy in (-1, 0, 1) for dx in (-1, 0, 1))
    solid = diff & (near >= 5)
    if not solid.any():
        return None
    ys, xs = np.nonzero(solid)
    return [max(0, int(xs.min()) - margin), max(0, int(ys.min()) - margin),
            min(w, int(xs.max()) + 1 + margin), min(h, int(ys.max()) + 1 + margin)]


def _feet_anchor(frame: np.ndarray) -> tuple[int, int, int, int, float]:
    """Opaque bbox (x0, y0, x1, y1) and the x centre of the lowest fifth (feet / knees)."""
    ys, xs = np.nonzero(frame[:, :, 3] > 0)
    x0, y0, x1, y1 = int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1
    low = ys >= y1 - max(2, (y1 - y0) // 5)
    return x0, y0, x1, y1, float(xs[low].mean())


def process_pose_sheet(
    input_path: str | Path,
    output_dir: str | Path,
    *,
    poses: dict[str, list[str]],
    pixel_pitch: float,
    palette_name: str = "jp_story_master",
    bg_mode: str = "chroma_green",
    tolerance: int = 48,
    max_colors: int = 0,
    padding: int = 1,
    fps: float = 4.0,
    facing: str = "right",
    splice_threshold: int = 60,
    splice_grow: int = 31,
    record_provenance: bool = True,
    source: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build one sheet of key poses. `poses`: {name: [base raw, edit raw, ...]} (absolute or
    repo-relative paths); `input_path` is the first base (the provenance anchor)."""
    from pixel_quality import despeckle, limit_colors

    if not poses:
        raise ValueError("poses: give at least one {name: [base raw, edits...]}")
    if pixel_pitch <= 0:
        raise ValueError("pixel_pitch must be > 0 (raw px per art px, one value for every pose)")
    out = Path(output_dir).expanduser().resolve()
    groups: list[tuple[str, list[np.ndarray]]] = []  # (pose, RGBA frames at art scale)
    with tempfile.TemporaryDirectory(prefix="poses_") as td:
        for name, raws in poses.items():
            paths = [provenance._resolve(str(r)) if not Path(r).is_absolute() else Path(r) for r in raws]
            base = np.asarray(Image.open(paths[0]).convert("RGB"))
            imgs = [base] + [
                splice_edit(base, np.asarray(Image.open(p).convert("RGB")), threshold=splice_threshold, grow=splice_grow)
                for p in paths[1:]
            ]
            h, w = base.shape[:2]
            sheet = np.concatenate(imgs, axis=1)
            sheet_path = Path(td) / f"{name}.png"
            Image.fromarray(sheet).save(sheet_path)
            fw, fh = int(np.ceil(w / pixel_pitch)) + 2 * padding + 2, int(np.ceil(h / pixel_pitch)) + 2 * padding + 2
            pose_dir = Path(td) / f"out_{name}"
            process_sprite_sheet(sheet_path, pose_dir, cols=len(imgs), frame_width=fw, frame_height=fh,
                                 palette_name=palette_name, bg_mode=bg_mode, tolerance=tolerance,
                                 registration="cell", split="grid", cleanup=True, pixel_pitch=pixel_pitch,
                                 padding=padding, record_provenance=False)
            frames = [np.array(Image.open(pose_dir / f"frame_{i:02d}.png").convert("RGBA")) for i in range(len(imgs))]
            groups.append((name, frames))

    # one pivot for every pose: feet centre of the base frame, ground = lowest opaque row of the pose
    placed: list[tuple[str, list[np.ndarray], int, int, int, int, float]] = []
    half, height = 0, 0
    for name, frames in groups:
        bx = [_feet_anchor(f) for f in frames if (f[:, :, 3] > 0).any()]
        if not bx:
            raise ValueError(f"pose '{name}': nothing left after background removal")
        x0, y0 = min(b[0] for b in bx), min(b[1] for b in bx)
        x1, y1 = max(b[2] for b in bx), max(b[3] for b in bx)
        anchor = _feet_anchor(frames[0])[4]
        half = max(half, int(np.ceil(anchor - x0)), int(np.ceil(x1 - anchor)))
        height = max(height, y1 - y0)
        placed.append((name, frames, x0, y0, x1, y1, anchor))
    fw, fh = 2 * half + 2 * padding, height + 2 * padding
    pivot = {"x": half + padding, "y": fh - padding}
    cells: list[np.ndarray] = []
    pose_frames: dict[str, list[int]] = {}
    for name, frames, x0, y0, x1, y1, anchor in placed:
        pose_frames[name] = []
        dx = pivot["x"] - int(round(anchor))
        dy = pivot["y"] - y1
        for f in frames:
            cell = np.zeros((fh, fw, 4), dtype=np.uint8)
            crop = f[y0:y1, x0:x1]
            cx, cy = x0 + dx, y0 + dy
            cell[cy : cy + crop.shape[0], cx : cx + crop.shape[1]] = crop
            pose_frames[name].append(len(cells))
            cells.append(cell)

    if max_colors:
        merged, _ = limit_colors(np.concatenate(cells, axis=1), int(max_colors))
        cells = [despeckle(np.ascontiguousarray(merged[:, i * fw : (i + 1) * fw]))[0] for i in range(len(cells))]

    regions: dict[str, dict[str, list[int]]] = {}
    for name, idx in pose_frames.items():
        base = cells[idx[0]]
        for i in idx[1:]:
            box = moved_box(base, cells[i])
            locked = base.copy()
            if box:
                x0, y0, x1, y1 = box
                locked[y0:y1, x0:x1] = cells[i][y0:y1, x0:x1]
                regions.setdefault(name, {})[str(i)] = box
            cells[i] = locked

    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    for i, c in enumerate(cells):
        Image.fromarray(c, "RGBA").save(out / f"frame_{i:02d}.png")
    Image.fromarray(np.concatenate(cells, axis=1), "RGBA").save(out / "spritesheet.png")
    first = next(iter(pose_frames))
    clips: dict[str, Any] = {"idle": {"frames": [pose_frames[first][0]], "fps": float(fps), "loop": True}}
    for name, idx in pose_frames.items():
        clips[name] = {"frames": [idx[0]], "fps": float(fps), "loop": True}
        if len(idx) > 1:
            clips[f"{name}_loop"] = {"frames": idx, "fps": float(fps), "loop": True}
        for k, frame in enumerate(idx[1:], start=1):
            # one clip per edit, named like its raw (raw_pose_x_b.png -> "x_b"): a cue can hold that state
            clips[f"{name}_{chr(ord('a') + k)}"] = {"frames": [frame], "fps": float(fps), "loop": True}
    meta = {
        "spritesheet": "spritesheet.png",
        "frameWidth": fw,
        "frameHeight": fh,
        "frameCount": len(cells),
        "palette": palette_name,
        "frames": [f"frame_{i:02d}.png" for i in range(len(cells))],
        "pivot": pivot,
        "fps": float(fps),
        "clips": clips,
        "poses": pose_frames,
        "poseRegions": regions,
        "scale": round(1.0 / pixel_pitch, 6),
        "registration": "poses",
        "facing": facing,
    }
    (out / "meta.json").write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
    if record_provenance:
        provenance.record(
            "process_pose_sheet",
            dict(poses={k: [provenance._portable(v) for v in vs] for k, vs in poses.items()}, pixel_pitch=pixel_pitch,
                 palette_name=palette_name, bg_mode=bg_mode, tolerance=tolerance, max_colors=max_colors,
                 padding=padding, fps=fps, facing=facing, splice_threshold=splice_threshold, splice_grow=splice_grow),
            output=out, input_path=input_path, source=source,
        )
    return {"ok": True, "output_dir": str(out), "frame": [fw, fh], "frames": len(cells), "poses": pose_frames,
            "regions": regions}
