"""Key-pose sheets (pixel_pose): edits spliced at raw size, one pitch / pivot / colour budget."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

import provenance
from art_manifest import apply_art_manifest
from pixel_pose import moved_box, process_pose_sheet, splice_edit

GREEN = (0, 255, 0)


def _figure(path: Path, *, arm_up: bool, shift: int = 0, size=(400, 400), x0: int = 150) -> None:
    """A blocky character on chroma green: head, body, legs and one arm (up or forward).

    `shift` adds a small global colour drift, like the one an image model adds to an edit.
    """
    im = Image.new("RGB", size, GREEN)
    d = ImageDraw.Draw(im)
    c = lambda rgb: tuple(min(255, v + shift) for v in rgb)  # noqa: E731
    d.rectangle((x0 + 20, 40, x0 + 80, 110), fill=c((236, 196, 160)), outline=(36, 23, 18), width=4)  # head
    d.rectangle((x0 + 40, 60, x0 + 50, 70), fill=(36, 23, 18))  # eye
    d.rectangle((x0, 110, x0 + 100, 260), fill=c((120, 70, 50)), outline=(36, 23, 18), width=4)  # body
    d.rectangle((x0 + 10, 260, x0 + 90, 360), fill=c((40, 44, 70)), outline=(36, 23, 18), width=4)  # legs
    arm = (x0 + 100, 90, x0 + 130, 170) if arm_up else (x0 + 100, 150, x0 + 200, 180)
    d.rectangle(arm, fill=c((120, 70, 50)), outline=(36, 23, 18), width=4)
    im.save(path)


def test_splice_keeps_base_pixels_where_the_pose_did_not_move(tmp_path: Path) -> None:
    _figure(tmp_path / "a.png", arm_up=True)
    _figure(tmp_path / "b.png", arm_up=False, shift=6)
    a = np.asarray(Image.open(tmp_path / "a.png"))
    b = np.asarray(Image.open(tmp_path / "b.png"))
    c = splice_edit(a, b, grow=9)
    assert (c[40:110, 150:230] == a[40:110, 150:230]).all()  # the head comes from the base (no drift)
    assert (c[155:175, 300:345] == b[155:175, 300:345]).all()  # the moved arm comes from the edit


def test_pose_sheet_shares_pitch_pivot_and_locks_edits(tmp_path: Path) -> None:
    raws = tmp_path / "art"
    raws.mkdir()
    _figure(raws / "raw_pose_reach.png", arm_up=True)
    _figure(raws / "raw_pose_reach_b.png", arm_up=False, shift=6)
    _figure(raws / "raw_pose_stand.png", arm_up=True, x0=60)  # drawn elsewhere on its canvas
    out = tmp_path / "sprites" / "hero_poses"
    res = process_pose_sheet(
        raws / "raw_pose_reach.png", out,
        poses={"reach": [str(raws / "raw_pose_reach.png"), str(raws / "raw_pose_reach_b.png")],
               "stand": [str(raws / "raw_pose_stand.png")]},
        pixel_pitch=4, palette_name="jp_story_master", max_colors=12,
    )
    meta = json.loads((out / "meta.json").read_text())
    assert meta["poses"] == {"reach": [0, 1], "stand": [2]}
    assert {"idle", "reach", "reach_loop", "reach_b", "stand"} <= set(meta["clips"])
    assert meta["clips"]["reach_b"]["frames"] == [1]  # each edit is a clip named like its raw (raw_pose_reach_b)
    assert meta["frameCount"] == 3 and Image.open(out / "spritesheet.png").size == (meta["frameWidth"] * 3, meta["frameHeight"])
    frames = [np.array(Image.open(out / f"frame_{i:02d}.png").convert("RGBA")) for i in range(3)]
    # same pivot: both poses stand on the same ground line, feet centred on the pivot
    for f in (frames[0], frames[2]):
        ys, xs = np.nonzero(f[:, :, 3] > 0)
        assert ys.max() + 1 == meta["pivot"]["y"]
        assert abs(xs[ys >= ys.max() - 10].mean() - meta["pivot"]["x"]) <= 1.5
    # the edit differs from its base only inside the recorded box (the arm), never on the head
    box = meta["poseRegions"]["reach"]["1"]
    outside = np.ones(frames[0].shape[:2], bool)
    outside[box[1] : box[3], box[0] : box[2]] = False
    assert (frames[0][outside] == frames[1][outside]).all()
    ys, xs = np.nonzero(frames[0][:, :, 3] > 0)
    head_cols = xs[ys <= ys.min() + 8]  # the top rows of the figure are the head
    assert head_cols.max() < box[0]  # the lock box (the arm) stays clear of the head
    colours = {tuple(c) for f in frames for c in f[f[:, :, 3] > 0][:, :3]}
    assert len(colours) <= 12
    assert res["poses"] == meta["poses"]


def test_art_manifest_poses_kind_registers_a_reproducible_sheet(tmp_path: Path, monkeypatch) -> None:
    public = tmp_path / "public"
    sdir = public / "stories" / "demo"
    sdir.mkdir(parents=True)
    (sdir / "story.json").write_text(json.dumps({"id": "demo", "engine": "cinema", "palette": "jp_story_master",
                                                 "assets": {}, "scenes": []}), encoding="utf-8")
    art = tmp_path / "art"
    art.mkdir()
    _figure(art / "raw_pose_reach.png", arm_up=True)
    _figure(art / "raw_pose_reach_b.png", arm_up=False, shift=6)
    (art / "art.json").write_text(json.dumps({"story": "demo", "characters": [
        {"key": "hero_poses", "kind": "poses", "pixel_pitch": 4,
         "poses": {"reach": ["raw_pose_reach.png", "raw_pose_reach_b.png"]}},
        {"key": "ghost_poses", "kind": "poses", "pixel_pitch": 4, "poses": {"x": ["raw_missing.png"]}},
    ]}), encoding="utf-8")
    res = apply_art_manifest(art / "art.json", public_root=public)
    assert [c["key"] for c in res["characters"]] == ["hero_poses"]
    assert [w["key"] for w in res["waiting_for_art"]] == ["ghost_poses"]
    story = json.loads((sdir / "story.json").read_text())
    assert story["assets"]["sprites"]["hero_poses"] == "/stories/demo/assets/sprites/hero_poses/meta.json"
    rep = provenance.reprocess(sdir / "assets" / "sprites" / "provenance.json")
    assert rep["results"]["hero_poses"] == "identical", rep


def test_moved_box_ignores_scattered_noise() -> None:
    a = np.zeros((40, 40, 4), np.uint8)
    a[:, :, 3] = 255
    b = a.copy()
    b[5, 5, :3] = 255  # one noisy pixel
    assert moved_box(a, b) is None
    b[20:30, 22:34, :3] = 200  # a solid moved part
    assert moved_box(a, b, margin=0) == [22, 20, 34, 30]
