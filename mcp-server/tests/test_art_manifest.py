"""Art manifest: raw images in -> palette-locked backgrounds + story.json scenes switched to bg:<key>."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw

from art_manifest import apply_art_manifest


def _scene_png(path: Path) -> None:
    im = Image.new("RGB", (640, 400), (120, 170, 220))
    d = ImageDraw.Draw(im)
    d.rectangle((0, 260, 640, 400), fill=(140, 100, 60))
    d.rectangle((80, 120, 260, 260), fill=(200, 60, 50), outline=(30, 20, 10), width=4)
    im.save(path)


def test_apply_art_manifest_processes_existing_art_and_switches_scenes(tmp_path: Path) -> None:
    public = tmp_path / "public"
    sdir = public / "stories" / "demo"
    sdir.mkdir(parents=True)
    story = {
        "id": "demo",
        "engine": "cinema",
        "palette": "jp_story_master",
        "assets": {"backgrounds": {}, "portraits": {}},
        "scenes": [
            {"id": "s1", "backdrop": "proc:airport_train", "lines": []},
            {"id": "s2", "backdrop": "proc:washoku_table", "lines": [],
             "minigame": {"choices": [{"id": "c1", "backdrop": "proc:washoku_table"}]}},
        ],
    }
    (sdir / "story.json").write_text(json.dumps(story), encoding="utf-8")
    art = tmp_path / "art"
    art.mkdir()
    _scene_png(art / "raw_bg_train.png")
    (art / "art.json").write_text(json.dumps({
        "story": "demo",
        "backgrounds": [
            {"key": "train", "raw": "raw_bg_train.png", "use": ["s1", "s2/c1", "nope"]},
            {"key": "dining", "raw": "raw_bg_dining.png", "use": ["s2"]},
        ],
    }), encoding="utf-8")

    dry = apply_art_manifest(art / "art.json", public_root=public, dry_run=True)
    assert not (sdir / "assets" / "bg_train.png").exists()
    assert json.loads((sdir / "story.json").read_text())["scenes"][0]["backdrop"] == "proc:airport_train"
    assert [a["key"] for a in dry["applied"]] == ["train"]

    res = apply_art_manifest(art / "art.json", public_root=public)
    out = sdir / "assets" / "bg_train.png"
    assert out.exists() and Image.open(out).size == (320, 200)
    assert (sdir / "assets" / "provenance.json").exists()
    saved = json.loads((sdir / "story.json").read_text())
    assert saved["assets"]["backgrounds"]["train"] == "/stories/demo/assets/bg_train.png"
    assert saved["scenes"][0]["backdrop"] == "bg:train"
    assert saved["scenes"][1]["minigame"]["choices"][0]["backdrop"] == "bg:train"
    assert saved["scenes"][1]["backdrop"] == "proc:washoku_table"  # its art has not arrived yet
    assert [w["key"] for w in res["waiting_for_art"]] == ["dining"]
    assert res["problems"] == ["train: no scene/choice 'nope' in demo"]


def test_art_manifest_characters_animate_portraits_and_add_walkers(tmp_path: Path) -> None:
    import shutil

    repo = Path(__file__).resolve().parents[2]
    public = tmp_path / "public"
    sdir = public / "stories" / "demo"
    (sdir / "assets").mkdir(parents=True)
    Image.new("RGBA", (96, 96), (0, 0, 0, 0)).save(sdir / "assets" / "portrait_yui.png")
    story = {"id": "demo", "engine": "cinema", "palette": "jp_story_master",
             "assets": {"backgrounds": {}, "portraits": {"yui": "/stories/demo/assets/portrait_yui.png"}},
             "scenes": [{"id": "s1", "lines": []}]}
    (sdir / "story.json").write_text(json.dumps(story), encoding="utf-8")
    art = tmp_path / "art"
    art.mkdir()
    shutil.copy(repo / "art-src" / "hanami-first" / "raw_sheet_yui.png", art / "raw_sheet_yui.png")
    shutil.copy(repo / "art-src" / "hanami-first" / "raw_walk_yui.png", art / "raw_walk_yui.png")
    (art / "art.json").write_text(json.dumps({"story": "demo", "characters": [
        {"key": "yui", "raw": "raw_sheet_yui.png", "kind": "bust"},
        {"key": "yui_walk", "raw": "raw_walk_yui.png", "kind": "walk", "pixel_pitch": 5.5, "stride": 32},
        {"key": "ghost", "raw": "raw_sheet_ghost.png", "kind": "bust"},
        {"key": "yui", "raw": "raw_missing.png", "kind": "dance"},
    ]}), encoding="utf-8")
    nothing = apply_art_manifest(art / "art.json", public_root=public, only=["backgrounds"])
    assert nothing["characters"] == [] and not (sdir / "assets" / "sprites").exists()
    res = apply_art_manifest(art / "art.json", public_root=public, only=["characters"])
    assert [c["key"] for c in res["characters"]] == ["yui", "yui_walk"]
    assert "ghost: a bust sheet animates a portrait" in " ".join(res["problems"])
    assert "kind must be 'bust' or 'walk'" in " ".join(res["problems"])
    saved = json.loads((sdir / "story.json").read_text())
    assert saved["assets"]["sprites"]["yui"].endswith("sprites/yui/meta.json")
    assert saved["assets"]["rigs"]["yui"].endswith("sprites/yui/rig/rig.json")
    bust = json.loads((sdir / "assets" / "sprites" / "yui" / "meta.json").read_text())
    assert (bust["frameWidth"], bust["frameHeight"]) == (96, 96)  # the portrait's own size
    assert set(bust["clips"]) == {"idle", "talk"}
    walk = json.loads((sdir / "assets" / "sprites" / "yui_walk" / "meta.json").read_text())
    assert walk["facing"] == "right" and walk["clips"]["walk"]["stridePx"] == 32.0 and walk["frameCount"] == 10
    # Optional expression_region + rig: false override
    (art / "art.json").write_text(json.dumps({"story": "demo", "characters": [
        {"key": "yui", "raw": "raw_sheet_yui.png", "kind": "bust",
         "expression_region": [24, 24, 72, 56], "rig": False},
    ]}), encoding="utf-8")
    res2 = apply_art_manifest(art / "art.json", public_root=public, only=["characters"])
    assert res2["problems"] == [] and "rig" not in res2["characters"][0]
    saved2 = json.loads((sdir / "story.json").read_text())
    assert "yui" not in saved2["assets"].get("rigs", {})
    bust2 = json.loads((sdir / "assets" / "sprites" / "yui" / "meta.json").read_text())
    assert bust2["expressionRegion"] == [24, 24, 72, 56]


def test_art_manifest_shared_pack_builds_reusable_cast_and_backgrounds(tmp_path: Path) -> None:
    import shutil

    repo = Path(__file__).resolve().parents[2]
    public = tmp_path / "public"
    art = tmp_path / "art"
    art.mkdir()
    _scene_png(art / "raw_bg_garden.png")
    shutil.copy(repo / "art-src" / "hanami-first" / "raw_sheet_yui.png", art / "raw_sheet_lin.png")
    shutil.copy(repo / "art-src" / "hanami-first" / "raw_walk_yui.png", art / "raw_walk_lin.png")
    (art / "art.json").write_text(json.dumps({
        "shared": "kotoba-mura",
        "name": "Kotoba Village",
        "palette": "jp_story_master",
        "voices": {"lin": {"speakerId": 46}},
        "backgrounds": [{"key": "garden", "raw": "raw_bg_garden.png"}],
        "characters": [
            {"key": "lin_neutral", "raw": "raw_sheet_lin.png", "kind": "bust", "frame": [96, 96]},
            {"key": "lin_walk", "raw": "raw_walk_lin.png", "kind": "walk", "pixel_pitch": 5.5, "stride": 30},
            {"key": "stackchan_neutral", "raw": "raw_missing.png", "kind": "bust", "frame": [96, 96], "rig": False},
        ],
    }), encoding="utf-8")

    res = apply_art_manifest(art / "art.json", public_root=public)
    assert res["shared"] == "kotoba-mura" and res["problems"] == []
    assert [w["key"] for w in res["waiting_for_art"]] == ["stackchan_neutral"]
    pack_fp = public / "shared" / "kotoba-mura" / "pack.json"
    assert pack_fp.exists()
    pack = json.loads(pack_fp.read_text(encoding="utf-8"))
    assert pack["voices"]["lin"]["speakerId"] == 46
    assert pack["assets"]["backgrounds"]["garden"] == "/shared/kotoba-mura/bg_garden.png"
    assert pack["assets"]["sprites"]["lin_neutral"] == "/shared/kotoba-mura/sprites/lin_neutral/meta.json"
    assert pack["assets"]["rigs"]["lin_neutral"] == "/shared/kotoba-mura/sprites/lin_neutral/rig/rig.json"
    assert pack["assets"]["sprites"]["lin_walk"] == "/shared/kotoba-mura/sprites/lin_walk/meta.json"
    assert (public / "shared" / "kotoba-mura" / "bg_garden.png").exists()
    assert (public / "shared" / "kotoba-mura" / "provenance.json").exists()
    assert (public / "shared" / "kotoba-mura" / "sprites" / "provenance.json").exists()


def _grey_scene_with_fire(path: Path) -> None:
    """A mostly grey/blue scene with a tiny saturated fire: the kind of accent a fixed palette loses."""
    im = Image.new("RGB", (640, 400), (92, 96, 104))
    d = ImageDraw.Draw(im)
    d.rectangle((0, 0, 640, 180), fill=(52, 64, 92))  # dusk sky
    d.rectangle((0, 300, 640, 400), fill=(226, 232, 242))  # snow
    d.rectangle((40, 200, 200, 280), fill=(100, 104, 112))  # big patch, almost the wall colour
    d.rectangle((300, 250, 316, 266), fill=(250, 150, 30))  # 8x8 px fire after 320x200
    im.save(path)


def test_build_story_palette_keeps_outline_real_colours_and_small_accents(tmp_path: Path) -> None:
    from pixel_quality import build_story_palette

    raw = tmp_path / "bg.png"
    _grey_scene_with_fire(raw)
    small = tmp_path / "bg_small.png"
    Image.open(raw).resize((320, 200), Image.Resampling.NEAREST).save(small)
    pal = build_story_palette({"backgrounds": [small]}, 5, keep=["#241712"])
    assert pal[0] == "#241712" and len(pal) == 5
    real = {"#%02x%02x%02x" % c for _, c in Image.open(small).convert("RGB").getcolors()}
    assert set(pal[1:]) <= real  # real colours only, never invented averages
    # the 0.1% fire beats a 10x bigger grey patch that the wall colour already covers
    assert "#fa961e" in pal and "#646870" not in pal
    assert build_story_palette({"backgrounds": [small]}, 5, keep=["#241712"]) == pal  # deterministic


def test_art_manifest_palette_build_locks_the_story_to_its_own_palette(tmp_path: Path, monkeypatch) -> None:
    import palettes
    from pixel_quality import quality_metrics

    monkeypatch.setattr(palettes, "CUSTOM_PALETTES_FILE", tmp_path / "palettes_custom.json")
    public = tmp_path / "public"
    sdir = public / "stories" / "demo"
    sdir.mkdir(parents=True)
    (sdir / "story.json").write_text(json.dumps({
        "id": "demo", "engine": "cinema", "palette": "jp_story_master",
        "assets": {"backgrounds": {}}, "scenes": [{"id": "s1", "lines": []}],
    }), encoding="utf-8")
    art = tmp_path / "art"
    art.mkdir()
    _grey_scene_with_fire(art / "raw_bg_road.png")
    hat = Image.new("RGBA", (20, 10), (0, 0, 0, 0))
    ImageDraw.Draw(hat).rectangle((2, 2, 17, 8), fill=(205, 168, 118), outline=(36, 23, 18))
    hat.save(art / "raw_item_hat.png")
    (art / "art.json").write_text(json.dumps({
        "story": "demo", "palette": "demo_story", "palette_build": {"n_colors": 8},
        "backgrounds": [{"key": "road", "raw": "raw_bg_road.png", "dither": 0, "use": ["s1"]}],
        "items": [{"key": "hat", "raw": "raw_item_hat.png", "size": [18, 9]}],
    }), encoding="utf-8")
    try:
        res = apply_art_manifest(art / "art.json", public_root=public)
        assert res["palette_built"]["palette"] == "demo_story" and res["problems"] == []
        saved_pal = json.loads((tmp_path / "palettes_custom.json").read_text())["demo_story"]["colors"]
        assert saved_pal[0] == "#241712" and len(saved_pal) <= 8
        story = json.loads((sdir / "story.json").read_text())
        assert story["palette"] == "demo_story"
        assert story["assets"]["items"]["hat"] == "/stories/demo/assets/items/hat.png"
        allowed = set(saved_pal)
        for png in (sdir / "assets" / "bg_road.png", sdir / "assets" / "items" / "hat.png"):
            used = {"#%02x%02x%02x" % c[1][:3] for c in Image.open(png).convert("RGBA").getcolors() if c[1][3]}
            assert used <= allowed, png
        hat_out = Image.open(sdir / "assets" / "items" / "hat.png")
        assert hat_out.size == (20, 10)  # hand-made pixel item: re-locked at its own size, not refitted
        assert quality_metrics(hat_out)["colors"] <= 2
        # the saved palette is reused (not rebuilt) on the next run, so outputs stay byte-identical
        before = (sdir / "assets" / "bg_road.png").read_bytes()
        again = apply_art_manifest(art / "art.json", public_root=public)
        assert "palette_built" not in again and (sdir / "assets" / "bg_road.png").read_bytes() == before
    finally:
        palettes.PALETTES.pop("demo_story", None)


def test_sprite_sheet_colour_budget_is_shared_by_every_frame(tmp_path: Path) -> None:
    import shutil

    from pixel_processor import process_sprite_sheet

    repo = Path(__file__).resolve().parents[2]
    raw = tmp_path / "raw_sheet_yui.png"
    shutil.copy(repo / "art-src" / "hanami-first" / "raw_sheet_yui.png", raw)
    out = tmp_path / "yui"
    process_sprite_sheet(raw, out, cols=4, frame_width=96, frame_height=96, registration="bust",
                         bg_mode="chroma_green", split="gaps", cleanup=True, max_colors=12, record_provenance=False)
    sheet = Image.open(out / "spritesheet.png").convert("RGBA")
    colours = {c[1][:3] for c in sheet.getcolors(1 << 16) if c[1][3]}
    assert len(colours) <= 12
    for i in range(4):  # every frame draws from the same 12 colours (no per-frame flicker)
        fr = Image.open(out / f"frame_{i:02d}.png").convert("RGBA")
        assert {c[1][:3] for c in fr.getcolors(1 << 16) if c[1][3]} <= colours
