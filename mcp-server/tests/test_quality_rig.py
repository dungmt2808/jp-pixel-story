"""Tests for Step 1 (grid detection, cleanup, palette extraction, provenance) and
Step 2 (expression lock, add-expression, head/body rig) of Mini-PixelLab."""

from __future__ import annotations

import io
import json
from pathlib import Path

import numpy as np
import pytest
from PIL import Image, ImageDraw, ImageFilter

import palettes
import provenance
from content_validator import validate_story_folder
from palettes import get_palette_rgb
from pixel_processor import _downsample_rgba, process_pixel_sprite
from pixel_quality import (
    cleanup_sprite_image,
    depixelize_image,
    despeckle,
    detect_pixel_grid,
    enforce_outline,
    extract_palette,
    limit_colors,
    pixel_perfect_outline,
    quality_metrics,
)
from pixel_rig import add_expression, build_rig, compose_rig_frame, detect_neck_row, lock_expressions

PAL = np.array([[36, 23, 18], [246, 238, 216], [184, 56, 44], [65, 82, 125], [94, 140, 70], [232, 188, 125]], np.uint8)
INK = (0x24, 0x17, 0x12)


def _native(seed: int = 100) -> np.ndarray:
    rng = np.random.default_rng(seed)
    nat = np.zeros((30, 40), int)
    for _ in range(25):
        cy, cx, r = rng.integers(0, 30), rng.integers(0, 40), rng.integers(2, 7)
        yy, xx = np.ogrid[:30, :40]
        nat[(yy - cy) ** 2 + (xx - cx) ** 2 < r * r] = rng.integers(0, 6)
    return nat


def _ai_pixel_art(nat: np.ndarray, pitch: float, off: int) -> Image.Image:
    """What image generators output for 'pixel art': fake pixels of a non-integer size, offset,
    slightly blurred and JPEG-compressed."""
    h, w = nat.shape
    W, H = int(w * pitch + off + 5), int(h * pitch + off + 5)
    ys = np.clip(((np.arange(H) - off) / pitch).astype(int), 0, h - 1)
    xs = np.clip(((np.arange(W) - off) / pitch).astype(int), 0, w - 1)
    big = Image.fromarray(PAL[nat][ys][:, xs]).filter(ImageFilter.GaussianBlur(0.8))
    buf = io.BytesIO()
    big.save(buf, "JPEG", quality=80)
    return Image.open(io.BytesIO(buf.getvalue()))


def _match(img_rgb: np.ndarray, nat: np.ndarray) -> float:
    d = ((img_rgb[:, :, None, :].astype(int) - PAL[None, None].astype(int)) ** 2).sum(-1).argmin(-1)
    return float((d == nat).mean())


# --------------------------------------------------------------------------------------------- grid


@pytest.mark.parametrize("pitch,off", [(7.6, 3), (5.3, 2), (12.25, 6), (6.4, 5), (8.0, 0)])
def test_detects_fake_pixel_grid_and_rebuilds_exact_art(pitch: float, off: int) -> None:
    nat = _native()
    img = _ai_pixel_art(nat, pitch, off)
    g = detect_pixel_grid(img)
    assert g["is_pixel_art"]
    assert g["x"]["pitch"] == pytest.approx(pitch, abs=0.05)
    assert g["y"]["pitch"] == pytest.approx(pitch, abs=0.05)
    rec, g2 = depixelize_image(img, g)
    assert g2["fits"]
    assert _match(np.array(rec)[:30, :40, :3], nat) == 1.0
    # a plain resize - even when told the (normally unknown!) native size - is not exact
    naive = _downsample_rgba(np.array(img.convert("RGBA")), 40, 30)[:, :, :3]
    assert _match(naive, nat) < 1.0


def test_non_pixel_art_is_left_alone() -> None:
    rng = np.random.default_rng(0)
    photo = Image.fromarray(rng.normal(128, 40, (300, 400, 3)).clip(0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(2))
    buf = io.BytesIO()
    photo.save(buf, "JPEG", quality=60)  # JPEG 8x8 blocks are periodic too - must not fool it
    assert detect_pixel_grid(Image.open(io.BytesIO(buf.getvalue())))["is_pixel_art"] is False
    smooth = Image.new("RGB", (400, 300), (120, 170, 220))
    ImageDraw.Draw(smooth).ellipse([60, 40, 300, 260], fill=(240, 180, 190))
    assert detect_pixel_grid(smooth.filter(ImageFilter.GaussianBlur(3)))["is_pixel_art"] is False


def test_wrong_grid_is_flagged_as_not_fitting() -> None:
    """If a grid much coarser than the real pixels were used (e.g. on a game screenshot), real
    detail would be destroyed: depixelize must report it does not fit, so pipelines skip it."""
    nat = _native(3)
    img = _ai_pixel_art(nat, 6.0, 0)
    wrong = {"x": {"pitch": 36.0, "offset": 0.0}, "y": {"pitch": 36.0, "offset": 0.0}, "is_pixel_art": True}
    _, g = depixelize_image(img, wrong)
    assert g["fits"] is False and g["fit_error"] > 0.03
    _, ok = depixelize_image(img)
    assert ok["fits"] is True


def test_sprite_pipeline_grid_auto_restores_true_pixels(tmp_path: Path) -> None:
    nat = _native(7)
    nat[:2] = 4
    raw = _ai_pixel_art(nat, 7.6, 3)
    raw.save(tmp_path / "ai.png")
    res = process_pixel_sprite(
        tmp_path / "ai.png", tmp_path / "out.png", target_width=40, target_height=30,
        palette_name="none", bg_mode="none", grid="auto", fit_mode="frame",
    )
    assert res["grid"]["applied"] is True
    assert _match(np.array(Image.open(tmp_path / "out.png"))[:, :, :3], nat) == 1.0


# --------------------------------------------------------------------------------------------- cleanup


def _sprite(w: int = 20, h: int = 20) -> np.ndarray:
    a = np.zeros((h, w, 4), np.uint8)
    a[4:16, 5:15] = (246, 238, 216, 255)  # light body (no outline yet)
    return a


def test_outline_is_added_outside_light_edges_and_recoloured_on_dark_edges() -> None:
    a = _sprite()
    a[4:16, 5] = (60, 40, 40, 255)  # a dark-but-wrong outline on the left side
    out, _ = enforce_outline(a)
    q = quality_metrics(Image.fromarray(out, "RGBA"))
    assert q["outline_compliance"] == 1.0
    assert tuple(out[10, 5, :3]) == INK  # dark edge recoloured in place
    assert tuple(out[10, 15, :3]) == INK and out[10, 15, 3] == 255  # new outline outside light edge
    assert tuple(out[10, 14, :3]) == (246, 238, 216)  # light colour itself is kept


def test_no_outline_along_a_cut_frame_border() -> None:
    a = np.zeros((10, 10, 4), np.uint8)
    a[4:, 2:8] = (246, 238, 216, 255)  # bust cut by the bottom of the frame
    out, _ = enforce_outline(a)
    assert tuple(out[9, 4, :3]) == (246, 238, 216)


def test_despeckle_removes_noise_but_keeps_deliberate_highlights() -> None:
    a = np.zeros((12, 12, 4), np.uint8)
    a[:, :] = (65, 82, 125, 255)
    a[3, 3] = (70, 86, 130, 255)  # JPEG-ish speck, almost the same colour -> removed
    a[8, 8] = (246, 238, 216, 255)  # eye highlight, high contrast -> kept
    out, changed = despeckle(a)
    assert tuple(out[3, 3, :3]) == (65, 82, 125)
    assert tuple(out[8, 8, :3]) == (246, 238, 216)
    b = np.zeros((9, 9, 4), np.uint8)
    b[4, 4] = (184, 56, 44, 255)  # floating dust speck in transparency -> removed
    out_b, _ = despeckle(b)
    assert out_b[4, 4, 3] == 0 and changed >= 1


def test_pixel_perfect_removes_double_corners_without_breaking_the_line() -> None:
    a = np.zeros((8, 8, 4), np.uint8)
    for y, x in [(1, 1), (1, 2), (2, 2), (2, 3), (3, 3)]:  # staircase with L-shaped doubles
        a[y, x] = (*INK, 255)
    out, removed = pixel_perfect_outline(a)
    assert removed >= 1
    on = {(y, x) for y in range(8) for x in range(8) if out[y, x, 3]}
    # still one 8-connected line from (1,1) to (3,3)
    assert (1, 1) in on and (3, 3) in on
    assert all(any(abs(y - y2) <= 1 and abs(x - x2) <= 1 and (y, x) != (y2, x2) for y2, x2 in on) for y, x in on)


def test_limit_colors_merges_rarest_into_nearest() -> None:
    a = np.zeros((4, 4, 4), np.uint8)
    a[:, :] = (65, 82, 125, 255)
    a[0, 0] = (70, 86, 132, 255)
    a[3, 3] = (246, 238, 216, 255)
    out, merged = limit_colors(a, 2)
    assert merged == 1 and tuple(out[0, 0, :3]) == (65, 82, 125)


def test_cleanup_report_improves_real_like_sprite() -> None:
    a = _sprite()
    a[8, 8] = (240, 232, 210, 255)
    out, rep = cleanup_sprite_image(Image.fromarray(a, "RGBA"))
    assert rep["before"]["outline_compliance"] < 0.5
    assert rep["after"]["outline_compliance"] == 1.0
    assert rep["after"]["orphan_ratio"] <= rep["before"]["orphan_ratio"]


# --------------------------------------------------------------------------------------------- palette + provenance


def test_extract_palette_picks_real_colours_and_saves(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    img = np.zeros((10, 30, 3), np.uint8)
    img[:, :10], img[:, 10:20], img[:, 20:] = (10, 20, 30), (200, 100, 50), (90, 200, 90)
    Image.fromarray(img).save(tmp_path / "a.png")
    cols = extract_palette([tmp_path / "a.png"], 3)
    assert set(cols) == {"#0a141e", "#c86432", "#5ac85a"}
    monkeypatch.setattr(palettes, "CUSTOM_PALETTES_FILE", tmp_path / "custom.json")
    palettes.save_custom_palette("test_mood", cols, "test")
    assert set(get_palette_rgb("test_mood")) == {(10, 20, 30), (200, 100, 50), (90, 200, 90)}
    with pytest.raises(ValueError):
        palettes.save_custom_palette("ramen_midnight", cols, "x")


def test_provenance_records_and_reprocess_is_byte_identical(tmp_path: Path) -> None:
    raw = Image.new("RGB", (128, 128), (0, 255, 0))
    ImageDraw.Draw(raw).ellipse([30, 20, 100, 120], fill=(184, 56, 44))
    raw.save(tmp_path / "raw.png")
    out = tmp_path / "assets" / "item.png"
    process_pixel_sprite(tmp_path / "raw.png", out, target_width=32, target_height=32, bg_mode="chroma_green",
                         cleanup=True, source={"prompt": "a red apple", "seed": 7})
    man = json.loads((out.parent / "provenance.json").read_text(encoding="utf-8"))
    step = man["assets"]["item.png"]["steps"][0]
    assert step["op"] == "process_pixel_sprite" and step["source"]["prompt"] == "a red apple"
    assert step["params"]["cleanup"] is True and "input_path" not in step["params"]
    assert provenance.reprocess(out.parent / "provenance.json")["results"]["item.png"] == "identical"
    Image.new("RGBA", (32, 32), (1, 2, 3, 255)).save(out)  # hand edit after processing
    assert provenance.reprocess(out.parent / "provenance.json")["results"]["item.png"] == "file edited after processing"
    (tmp_path / "raw.png").unlink()
    assert provenance.reprocess(out.parent / "provenance.json")["results"]["item.png"].startswith("missing source")


def test_legacy_master_is_kept_as_its_own_source(tmp_path: Path) -> None:
    bg = tmp_path / "assets" / "bg_old.png"
    bg.parent.mkdir()
    Image.new("RGB", (8, 8), (40, 50, 60)).save(bg)
    provenance.adopt_legacy(bg, "made before provenance; prompt lost")
    step = json.loads((bg.parent / "provenance.json").read_text(encoding="utf-8"))["assets"]["bg_old.png"]["steps"][0]
    assert step["op"] == "legacy_master" and step["input"] is None and step["params"]["note"].startswith("made before")
    res = provenance.reprocess(bg.parent / "provenance.json")
    assert res["ok"] and res["results"]["bg_old.png"].startswith("legacy master")
    Image.new("RGB", (8, 8), (1, 2, 3)).save(bg)  # edited after adoption
    res = provenance.reprocess(bg.parent / "provenance.json")
    assert not res["ok"] and res["results"]["bg_old.png"] == "file edited after adoption"


# --------------------------------------------------------------------------------------------- step 2


def _bust_sheet(tmp_path: Path, noise: bool = True) -> Path:
    """4-frame 48x48 bust sheet: head (rows 4-27), neck (28-31), shoulders (32-47); frames differ in
    the mouth, plus 'AI noise' pixels on the clothes that make the body flicker."""
    sdir = tmp_path / "sheet"
    sdir.mkdir()
    rng = np.random.default_rng(1)
    frames = []
    for i in range(4):
        f = np.zeros((48, 48, 4), np.uint8)
        f[4:28, 12:36] = (242, 198, 160, 255)  # head
        f[28:32, 20:28] = (214, 152, 110, 255)  # neck
        f[32:48, 6:42] = (65, 82, 125, 255)  # shoulders (cut by the frame bottom)
        f[12:15, 17:20] = f[12:15, 28:31] = (36, 23, 18, 255)  # eyes
        f[20:22 + (2 if i == 1 else 0), 21:27] = (122, 32, 36, 255)  # mouth (open in frame 1)
        if i == 2:
            f[13, 17:20] = f[13, 28:31] = (242, 198, 160, 255)  # blink
        if noise and i:
            ys, xs = rng.integers(34, 47, 6), rng.integers(8, 40, 6)
            f[ys, xs] = (88, 112, 168, 255)
        frames.append(f)
    strip = np.concatenate(frames, axis=1)
    Image.fromarray(strip, "RGBA").save(sdir / "spritesheet.png")
    meta = {"spritesheet": "spritesheet.png", "frameWidth": 48, "frameHeight": 48, "frameCount": 4,
            "palette": "none", "pivot": {"x": 24, "y": 48}, "fps": 8,
            "clips": {"idle": {"frames": [0, 2], "fps": 4, "loop": True}, "talk": {"frames": [1, 0], "fps": 7, "loop": True}}}
    (sdir / "meta.json").write_text(json.dumps(meta), encoding="utf-8")
    return sdir


def test_lock_expressions_removes_body_flicker(tmp_path: Path) -> None:
    sdir = _bust_sheet(tmp_path)
    res = lock_expressions(sdir)
    x0, y0, x1, y1 = res["region"]
    assert y1 <= 32 and x0 <= 17 and x1 >= 31  # face only (eyes + mouth), not the clothes
    assert sum(res["flicker_pixels_before"]) > 0
    assert res["flicker_pixels_after"] == [0, 0, 0, 0]
    meta = json.loads((sdir / "meta.json").read_text())
    assert meta["expressionRegion"] == res["region"]
    strip = np.array(Image.open(sdir / "spritesheet.png"))
    assert not np.array_equal(strip[:, 48:96][20:24], strip[:, 0:48][20:24])  # mouth still animates


def test_lock_expressions_frame_regions_freezes_eyes_while_talking(tmp_path: Path) -> None:
    sdir = _bust_sheet(tmp_path, noise=False)
    # Introduce an unwanted pupil shift on talking frame 1 and mouth shift on blink frame 2
    strip = np.array(Image.open(sdir / "spritesheet.png"))
    strip[12:15, 48 + 18 : 48 + 21] = (255, 255, 255, 255)  # shifted eye in frame 1
    strip[20:22, 96 + 21 : 96 + 27] = (200, 80, 80, 255)  # shifted mouth in frame 2
    Image.fromarray(strip, "RGBA").save(sdir / "spritesheet.png")

    res = lock_expressions(
        sdir,
        region=[16, 11, 32, 25],
        frame_regions={"1": [20, 19, 28, 25], "2": [16, 11, 32, 16]},
    )
    assert res["flicker_pixels_after"] == [0, 0, 0, 0]
    out = np.array(Image.open(sdir / "spritesheet.png"))
    f0, f1, f2 = out[:, 0:48], out[:, 48:96], out[:, 96:144]
    assert np.array_equal(f1[11:16, 16:32], f0[11:16, 16:32])  # eyes frozen on talk frame 1
    assert not np.array_equal(f1[19:25, 20:28], f0[19:25, 20:28])  # mouth still animates on talk frame 1
    assert np.array_equal(f2[19:25, 20:28], f0[19:25, 20:28])  # mouth frozen on blink frame 2
    assert not np.array_equal(f2[11:16, 16:32], f0[11:16, 16:32])  # eyes blink on blink frame 2


def test_add_expression_appends_frame_and_clip(tmp_path: Path) -> None:
    sdir = _bust_sheet(tmp_path, noise=False)
    patch = np.zeros((2, 6, 4), np.uint8)
    patch[:, :] = (36, 23, 18, 255)
    Image.fromarray(patch, "RGBA").save(tmp_path / "sad_mouth.png")
    res = add_expression(sdir, tmp_path / "sad_mouth.png", x=21, y=22, clip="sad")
    meta = json.loads((sdir / "meta.json").read_text())
    assert res["frame_index"] == 4 and meta["frameCount"] == 5 and meta["clips"]["sad"]["frames"] == [4]
    assert Image.open(sdir / "spritesheet.png").size == (48 * 5, 48)
    with pytest.raises(ValueError):
        add_expression(sdir, tmp_path / "sad_mouth.png", x=45, y=0)


def test_rig_splits_at_neck_and_recombines_exactly(tmp_path: Path) -> None:
    sdir = _bust_sheet(tmp_path)
    lock_expressions(sdir, record_provenance=False)
    res = build_rig(sdir)
    assert res["neck_row"] in range(27, 32)
    rig_dir = sdir / "rig"
    rig = json.loads((rig_dir / "rig.json").read_text())
    assert rig["head"]["frameCount"] == 4 and rig["clips"]["talk"]["frames"] == [1, 0]
    frames = [np.array(Image.open(sdir / f"frame_{i:02d}.png")) for i in range(4)]
    for i in range(4):
        assert np.array_equal(compose_rig_frame(rig_dir, i), frames[i])
    # lifting the head by 1-2px shows neck, never a hole between head and shoulders
    neck = res["neck_row"]
    for lift in (1, 2):
        up = compose_rig_frame(rig_dir, 0, head_dy=-lift)
        assert np.all(up[neck - lift : neck, 20:28, 3] == 255)


def test_rig_neck_never_cuts_through_the_face() -> None:
    # a 3/4 bust whose narrowest row is ABOVE the mouth (hair tuft / chin line): the cut must go
    # below the expression region, otherwise the talking mouth would stay on the body
    bust = np.zeros((48, 48, 4), np.uint8)
    bust[4:20, 10:38] = (40, 30, 30, 255)  # hair
    bust[20:23, 21:27] = (242, 198, 160, 255)  # narrower than the neck: looks like a neck
    bust[23:32, 14:34] = (242, 198, 160, 255)  # lower face with the mouth at rows 27-29
    bust[32:35, 19:29] = (214, 152, 110, 255)  # the real neck
    bust[35:48, 4:44] = (65, 82, 125, 255)  # shoulders
    assert detect_neck_row(bust) < 27
    assert detect_neck_row(bust, min_row=30) >= 30


def test_rig_refuses_a_silhouette_without_neck() -> None:
    block = np.zeros((40, 40, 4), np.uint8)
    block[5:40, 5:35] = (65, 82, 125, 255)
    with pytest.raises(ValueError):
        detect_neck_row(block)


# --------------------------------------------------------------------------------------------- validator


def _story_dir(tmp_path: Path, extra: dict) -> tuple[Path, Path]:
    pub = tmp_path / "public"
    sdir = pub / "stories" / "q"
    (sdir / "assets").mkdir(parents=True)
    (pub / "stories" / "index.json").write_text(json.dumps({"stories": [{"id": "q", "category": "story"}]}), encoding="utf-8")
    story = {"id": "q", "palette": "jp_story_master", "assets": {"backgrounds": {}, "portraits": {}, **extra},
             "scenes": [], "reading": {"sentences": [], "grammar": [], "quiz": []}}
    (sdir / "story.json").write_text(json.dumps(story), encoding="utf-8")
    return pub, sdir


def test_validator_art_quality_is_warning_by_default_and_strict_when_declared(tmp_path: Path) -> None:
    pub, sdir = _story_dir(tmp_path, {})
    a = _sprite()
    Image.fromarray(a, "RGBA").save(sdir / "assets" / "p.png")
    story = json.loads((sdir / "story.json").read_text())
    story["assets"]["portraits"] = {"p": "/stories/q/assets/p.png"}
    (sdir / "story.json").write_text(json.dumps(story))
    res = validate_story_folder(sdir, web_public_dir=pub)
    assert res["ok"] is True and any(w.startswith("[Outline]") for w in res["warnings"])
    assert any(w.startswith("[No Provenance]") for w in res["warnings"])
    story["artQuality"] = {"minOutlineCompliance": 0.95}
    (sdir / "story.json").write_text(json.dumps(story))
    res = validate_story_folder(sdir, web_public_dir=pub)
    assert res["ok"] is False and any(i.startswith("[Outline]") for i in res["issues"])


def test_validator_art_exceptions_need_a_reason_and_a_real_sprite(tmp_path: Path) -> None:
    pub, sdir = _story_dir(tmp_path, {})
    Image.fromarray(_sprite(), "RGBA").save(sdir / "assets" / "p.png")
    story = json.loads((sdir / "story.json").read_text())
    story["assets"]["portraits"] = {"p": "/stories/q/assets/p.png"}
    story["artExceptions"] = {"/stories/q/assets/p.png": {"outline": "soft painted edge, reviewed"}}
    (sdir / "story.json").write_text(json.dumps(story))
    res = validate_story_folder(sdir, web_public_dir=pub)
    assert not any(w.startswith("[Outline]") for w in res["warnings"])
    assert res["stats"]["art_exceptions"] == 1
    story["artExceptions"] = {"/stories/q/assets/p.png": {"outline": " "}, "/stories/q/assets/zz.png": {"noise": "x"}}
    (sdir / "story.json").write_text(json.dumps(story))
    joined = " | ".join(validate_story_folder(sdir, web_public_dir=pub)["warnings"])
    assert "[Outline]" in joined and "needs one of" in joined and "'/stories/q/assets/zz.png' is not a portrait" in joined


def test_validator_checks_rig_files(tmp_path: Path) -> None:
    pub, sdir = _story_dir(tmp_path, {})
    sheet = _bust_sheet(sdir / "assets")
    lock_expressions(sheet, record_provenance=False)
    build_rig(sheet, record_provenance=False)
    story = json.loads((sdir / "story.json").read_text())
    story["palette"] = "none"
    story["assets"]["rigs"] = {"bust": "/stories/q/assets/sheet/rig/rig.json"}
    (sdir / "story.json").write_text(json.dumps(story))
    assert not any("Rig" in i for i in validate_story_folder(sdir, web_public_dir=pub)["issues"])
    rig_json = sheet / "rig" / "rig.json"
    rig = json.loads(rig_json.read_text())
    rig["clips"]["talk"]["frames"] = [0, 9]
    rig_json.write_text(json.dumps(rig))
    assert any(i.startswith("[Invalid Rig Clip]") for i in validate_story_folder(sdir, web_public_dir=pub)["issues"])


def test_chroma_green_keeps_green_objects(tmp_path: Path) -> None:
    """Regression: the old despill turned every greenish pixel (tea, leaves) almost black."""
    img = Image.new("RGB", (200, 200), (0, 255, 0))
    d = ImageDraw.Draw(img)
    d.ellipse([40, 40, 160, 160], fill=(98, 120, 72), outline=(36, 23, 18), width=6)  # green teapot body
    d.rectangle([90, 90, 110, 110], fill=(0, 255, 0))  # enclosed pocket of green screen
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=85)
    (tmp_path / "pot.jpg").write_bytes(buf.getvalue())
    process_pixel_sprite(tmp_path / "pot.jpg", tmp_path / "pot.png", target_width=40, target_height=40,
                         palette_name="none", bg_mode="chroma_green", record_provenance=False)
    a = np.array(Image.open(tmp_path / "pot.png"))
    body = a[(a[:, :, 3] > 0)][:, :3].astype(int)
    greenish = body[(body[:, 1] > 100) & (body[:, 1] > body[:, 0])]
    assert len(greenish) > 0.5 * len(body)  # the body is still green, not black
    assert a[20, 20, 3] == 0  # enclosed green-screen pocket removed


def test_limit_colors_keeps_a_rare_distinct_colour_over_common_near_duplicates() -> None:
    """A mouth (3 px) must survive while 20 px of near-identical skin shades are merged."""
    a = np.zeros((10, 10, 4), np.uint8)
    a[:, :] = (240, 190, 150, 255)  # skin
    a[:2, :] = (236, 186, 146, 255)  # 20 px of a near-duplicate skin shade
    a[5, 4:7] = (150, 60, 60, 255)  # a 3 px mouth
    out, merged = limit_colors(a, 2)
    colours = {tuple(c) for c in out[:, :, :3].reshape(-1, 3)}
    assert merged == 1 and (150, 60, 60) in colours and (236, 186, 146) not in colours


def test_keep_lines_downsample_keeps_a_thin_mouth() -> None:
    from pixel_processor import _downsample_rgba

    src = np.zeros((110, 110, 4), np.uint8)
    src[:, :] = (240, 190, 150, 255)
    src[57:62, 40:70] = (120, 50, 50, 255)  # a 5 px line in 11 px cells: under half of any cell
    plain = _downsample_rgba(src, 10, 10)
    kept = _downsample_rgba(src, 10, 10, keep_lines=0.3)
    dark = lambda a: int((a[:, :, 0] < 200).sum())  # noqa: E731
    assert dark(plain) == 0 and dark(kept) == 2  # the two cells the line fully crosses
