"""Regression tests for the animation-safe Mini-PixelLab sprite pipeline.

These reproduce two real bugs of the old slicer:
  * every cell was squashed onto frame_width x frame_height (aspect ratio distorted), and
  * every frame was cropped + centred on its OWN bounding box (body jittered between frames).
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest
from PIL import Image, ImageDraw

from palettes import get_palette_rgb
from pixel_processor import (
    nearest_palette_indices,
    process_pixel_sprite,
    process_sprite_sheet,
    srgb_to_oklab,
)

BODY = (110, 63, 39)
FACE = (242, 198, 160)
GREEN = (0, 255, 0)


def _draw_character(draw: ImageDraw.ImageDraw, ox: int, oy: int, *, arm: bool = False) -> None:
    """Body 64x128 (w/h = 0.5) with a face; optional arm sticking out to the right."""
    draw.rectangle([ox + 96, oy + 64, ox + 159, oy + 191], fill=BODY)
    draw.rectangle([ox + 104, oy + 72, ox + 151, oy + 103], fill=FACE)
    if arm:
        draw.rectangle([ox + 160, oy + 110, ox + 230, oy + 124], fill=FACE)


def _body_columns(frame: np.ndarray) -> tuple[int, int, int, int]:
    """Bounding box (x0, y0, x1, y1 inclusive) of the BODY-coloured pixels only."""
    body_rgb = np.array(get_palette_rgb("ramen_midnight"))[
        nearest_palette_indices(np.array([BODY]), np.array(get_palette_rgb("ramen_midnight")))[0]
    ]
    mask = (frame[:, :, 3] > 0) & np.all(frame[:, :, :3] == body_rgb, axis=-1)
    ys, xs = np.where(mask)
    return int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())


def _make_sheet(path: Path, *, arm_frame: int | None = 2, drift: list[tuple[int, int]] | None = None) -> None:
    w = 256
    sheet = Image.new("RGB", (w * 4, w), GREEN)
    draw = ImageDraw.Draw(sheet)
    for i in range(4):
        dx, dy = drift[i] if drift else (0, 0)
        _draw_character(draw, i * w + dx, dy, arm=(i == arm_frame))
    sheet.save(path)


def test_slicer_preserves_aspect_ratio(tmp_path: Path) -> None:
    raw = tmp_path / "raw.png"
    _make_sheet(raw, arm_frame=None)
    process_sprite_sheet(raw, tmp_path / "out", cols=4, frame_width=48, frame_height=64, bg_mode="chroma_green", palette_name="ramen_midnight")
    frame = np.array(Image.open(tmp_path / "out" / "frame_00.png"))
    x0, y0, x1, y1 = _body_columns(frame)
    ratio = (x1 - x0 + 1) / (y1 - y0 + 1)
    # Source body is exactly 64x128 -> 0.5. Old slicer produced 0.375.
    assert ratio == pytest.approx(0.5, abs=0.04)


def test_slicer_frames_are_registered_no_jitter(tmp_path: Path) -> None:
    raw = tmp_path / "raw.png"
    _make_sheet(raw, arm_frame=2)
    res = process_sprite_sheet(raw, tmp_path / "out", cols=4, frame_width=48, frame_height=64, bg_mode="chroma_green", palette_name="ramen_midnight")
    boxes = [
        _body_columns(np.array(Image.open(tmp_path / "out" / f"frame_{i:02d}.png"))) for i in range(4)
    ]
    # The body must sit on exactly the same pixels in every frame, even when an arm sticks out.
    assert len(set(boxes)) == 1, boxes
    assert res["frame_count"] == 4


def test_slicer_centroid_registration_fixes_ai_drift(tmp_path: Path) -> None:
    raw = tmp_path / "raw.png"
    # AI generators rarely place the character at the same spot in every cell.
    _make_sheet(raw, arm_frame=None, drift=[(0, 0), (-30, 6), (24, -10), (10, 12)])
    process_sprite_sheet(
        raw, tmp_path / "cell", cols=4, frame_width=48, frame_height=64, bg_mode="chroma_green", palette_name="ramen_midnight", registration="cell"
    )
    process_sprite_sheet(
        raw, tmp_path / "cen", cols=4, frame_width=48, frame_height=64, bg_mode="chroma_green", palette_name="ramen_midnight", registration="centroid"
    )
    cell_boxes = {_body_columns(np.array(Image.open(tmp_path / "cell" / f"frame_{i:02d}.png"))) for i in range(4)}
    cen_boxes = [_body_columns(np.array(Image.open(tmp_path / "cen" / f"frame_{i:02d}.png"))) for i in range(4)]
    assert len(cell_boxes) > 1  # 'cell' keeps the drift (faithful to the source layout)
    xs = [b[0] for b in cen_boxes]
    bottoms = [b[3] for b in cen_boxes]
    assert max(xs) - min(xs) <= 1
    assert len(set(bottoms)) == 1


def test_slicer_meta_has_pivot_fps_and_clips(tmp_path: Path) -> None:
    raw = tmp_path / "raw.png"
    _make_sheet(raw, arm_frame=None)
    res = process_sprite_sheet(
        raw,
        tmp_path / "out",
        cols=4,
        frame_width=48,
        frame_height=64,
        bg_mode="chroma_green",
        fps=6,
        clips={"idle": [0, 1], "talk": {"frames": [2, 3], "fps": 10, "loop": True}},
    )
    meta = json.loads((tmp_path / "out" / "meta.json").read_text(encoding="utf-8"))
    assert meta["fps"] == 6.0
    assert meta["clips"]["idle"] == {"frames": [0, 1], "fps": 6.0, "loop": True}
    assert meta["clips"]["talk"]["fps"] == 10.0
    # Pivot = bottom-centre of the content, inside the frame, bottom-aligned with 1px padding.
    assert meta["pivot"]["y"] == 63
    assert 0 < meta["pivot"]["x"] < 48
    assert res["pivot"] == meta["pivot"]
    strip = Image.open(tmp_path / "out" / "spritesheet.png")
    assert strip.size == (48 * 4, 64)


def test_slicer_rejects_bad_clip_indices(tmp_path: Path) -> None:
    raw = tmp_path / "raw.png"
    _make_sheet(raw, arm_frame=None)
    with pytest.raises(ValueError):
        process_sprite_sheet(raw, tmp_path / "out", cols=4, bg_mode="chroma_green", clips={"bad": [0, 9]})


def test_single_sprite_keeps_proportions(tmp_path: Path) -> None:
    raw = tmp_path / "char.png"
    img = Image.new("RGB", (256, 256), GREEN)
    _draw_character(ImageDraw.Draw(img), 0, 0)
    img.save(raw)
    out = tmp_path / "char_px.png"
    # Square source -> 48x64 target used to stretch the character by 33% vertically.
    process_pixel_sprite(raw, out, target_width=48, target_height=64, bg_mode="chroma_green", palette_name="ramen_midnight")
    x0, y0, x1, y1 = _body_columns(np.array(Image.open(out)))
    assert (x1 - x0 + 1) / (y1 - y0 + 1) == pytest.approx(0.5, abs=0.04)


def test_small_source_upscales_by_whole_integer_only(tmp_path: Path) -> None:
    raw = tmp_path / "tiny.png"
    img = Image.new("RGBA", (10, 10), (0, 0, 0, 0))
    img.paste(Image.new("RGBA", (6, 8), BODY + (255,)), (2, 1))
    img.save(raw)
    out = tmp_path / "up.png"
    # 6x8 content into a 30x30 cell (28x28 usable): 3.5x would create uneven pixels -> must use 3x.
    process_pixel_sprite(raw, out, target_width=30, target_height=30, bg_mode="none")
    arr = np.array(Image.open(out))
    ys, xs = np.where(arr[:, :, 3] > 0)
    assert (xs.max() - xs.min() + 1, ys.max() - ys.min() + 1) == (18, 24)


def test_oklab_matching_prefers_perceptual_neighbour() -> None:
    # Pure white must map to the palette's cream white, never to a saturated colour.
    palette = np.array(get_palette_rgb("ramen_midnight"), dtype=np.uint8)
    idx = nearest_palette_indices(np.array([[255, 255, 255]], dtype=np.uint8), palette)[0]
    assert tuple(int(c) for c in palette[idx]) == (0xF6, 0xEE, 0xD8)
    lab = srgb_to_oklab(np.array([[255, 255, 255], [0, 0, 0]]))
    assert lab[0, 0] == pytest.approx(1.0, abs=1e-3)
    assert lab[1, 0] == pytest.approx(0.0, abs=1e-6)


def test_relock_palette_keeps_size_and_alpha(tmp_path: Path) -> None:
    from pixel_processor import relock_palette

    src = tmp_path / "legacy.png"
    arr = np.zeros((20, 30, 4), dtype=np.uint8)
    arr[2:18, 3:27] = (123, 77, 201, 255)  # arbitrary off-palette purple
    arr[5:7, 5:7] = (250, 250, 250, 255)
    Image.fromarray(arr, "RGBA").save(src)
    res = relock_palette(src, tmp_path / "out.png", palette_name="jp_story_master")
    out = np.array(Image.open(tmp_path / "out.png"))
    assert out.shape == arr.shape
    assert np.array_equal(out[:, :, 3], arr[:, :, 3])  # transparency untouched
    allowed = set(get_palette_rgb("jp_story_master"))
    assert all(tuple(int(v) for v in c) in allowed for c in out[out[:, :, 3] > 0][:, :3])
    assert res["colors_after"] <= 2


def test_master_palette_contains_ramen_midnight() -> None:
    # ramen-era assets must stay compliant with the new master palette.
    assert set(get_palette_rgb("ramen_midnight")) <= set(get_palette_rgb("jp_story_master"))
    assert len(set(get_palette_rgb("jp_story_master"))) == 40


def test_slicer_bust_registration_fixes_drift_of_cropped_portraits(tmp_path: Path) -> None:
    """Expression sheets are usually busts cut by the cell edge: the bottom row is always the
    cell edge, so only a head-anchored registration can remove vertical drift."""
    w = 256
    sheet = Image.new("RGB", (w * 4, w), GREEN)
    draw = ImageDraw.Draw(sheet)
    drift = [(0, 0), (-20, 12), (16, -14), (8, 20)]
    for i, (dx, dy) in enumerate(drift):
        ox = i * w + dx
        draw.ellipse([ox + 78, 40 + dy, ox + 178, 140 + dy], fill=FACE)  # head
        draw.rectangle([ox + 60, 130 + dy, ox + 196, 300], fill=BODY)  # torso runs off the cell
    raw = tmp_path / "bust.png"
    sheet.save(raw)

    def head_boxes(folder: str) -> list[tuple[int, int, int, int]]:
        face_rgb = np.array(get_palette_rgb("ramen_midnight"))[
            nearest_palette_indices(np.array([FACE]), np.array(get_palette_rgb("ramen_midnight")))[0]
        ]
        out = []
        for i in range(4):
            a = np.array(Image.open(tmp_path / folder / f"frame_{i:02d}.png"))
            m = (a[:, :, 3] > 0) & np.all(a[:, :, :3] == face_rgb, axis=-1)
            ys, xs = np.where(m)
            out.append((int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())))
        return out

    kw = dict(cols=4, frame_width=48, frame_height=48, bg_mode="chroma_green", palette_name="ramen_midnight")
    process_sprite_sheet(raw, tmp_path / "cen", registration="centroid", **kw)
    process_sprite_sheet(raw, tmp_path / "bust", registration="bust", **kw)
    cen_tops = {b[1] for b in head_boxes("cen")}
    bust = head_boxes("bust")
    assert len(cen_tops) > 1  # bottom-anchored registration cannot see the vertical drift
    assert max(b[1] for b in bust) - min(b[1] for b in bust) <= 1
    assert max(b[0] for b in bust) - min(b[0] for b in bust) <= 1


def test_slicer_writes_walk_stride_and_facing(tmp_path: Path) -> None:
    raw = tmp_path / "raw.png"
    _make_sheet(raw, arm_frame=None)
    process_sprite_sheet(
        raw, tmp_path / "out", cols=4, frame_width=48, frame_height=64, bg_mode="chroma_green",
        registration="centroid", facing="right",
        clips={"walk": {"frames": [0, 1, 2, 3], "fps": 10, "stridePx": 24}, "idle": [0]},
    )
    meta = json.loads((tmp_path / "out" / "meta.json").read_text(encoding="utf-8"))
    assert meta["facing"] == "right"
    assert meta["clips"]["walk"]["stridePx"] == 24.0 and "stridePx" not in meta["clips"]["idle"]
    with pytest.raises(ValueError):
        process_sprite_sheet(raw, tmp_path / "bad", cols=4, clips={"walk": {"frames": [0], "stridePx": 0}})
    with pytest.raises(ValueError):
        process_sprite_sheet(raw, tmp_path / "bad2", cols=4, facing="up")


def test_slicer_split_by_gaps_finds_unevenly_spaced_figures(tmp_path: Path) -> None:
    # 4 figures that do NOT sit in 4 equal cells: the last one straddles the cell border
    sheet = Image.new("RGB", (1024, 256), GREEN)
    draw = ImageDraw.Draw(sheet)
    for x in (-40, 180, 430, 690):
        _draw_character(draw, x, 0)
    raw = tmp_path / "uneven.png"
    sheet.save(raw)
    with pytest.raises(ValueError, match="found 4 figures"):  # the count must match cols
        process_sprite_sheet(raw, tmp_path / "bad", cols=3, split="gaps", bg_mode="chroma_green")
    res = process_sprite_sheet(raw, tmp_path / "out", cols=4, split="gaps", frame_width=48, frame_height=64,
                               bg_mode="chroma_green", palette_name="ramen_midnight", registration="centroid")
    frames = [np.array(Image.open(f)) for f in res["frame_files"]]
    boxes = [_body_columns(f) for f in frames]
    assert len({b[2] - b[0] for b in boxes}) == 1  # every figure whole, same width


def test_slicer_pixel_pitch_fixes_the_scale(tmp_path: Path) -> None:
    raw = tmp_path / "raw.png"
    _make_sheet(raw, arm_frame=None)
    res = process_sprite_sheet(raw, tmp_path / "out", cols=4, frame_width=48, frame_height=64,
                               bg_mode="chroma_green", palette_name="ramen_midnight", pixel_pitch=4)
    assert res["scale"] == 0.25
    x0, y0, x1, y1 = _body_columns(np.array(Image.open(res["frame_files"][0])))
    assert (x1 - x0 + 1, y1 - y0 + 1) == (16, 32)  # the 64x128 body at 1/4
    with pytest.raises(ValueError, match="frame of at least"):
        process_sprite_sheet(raw, tmp_path / "small", cols=4, frame_width=16, frame_height=16,
                             bg_mode="chroma_green", pixel_pitch=4)
