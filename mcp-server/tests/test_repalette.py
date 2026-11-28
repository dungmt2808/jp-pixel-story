"""repalette: rebuild a story from its provenance with its own palette, keeping legacy assets."""

from __future__ import annotations

import json
import shutil
from pathlib import Path

from PIL import Image, ImageDraw

import palettes
import provenance
from pixel_processor import process_pixel_background, process_pixel_sprite, process_sprite_sheet
from pixel_rig import build_rig
from repalette import repalette_story

REPO = Path(__file__).resolve().parents[2]


def _colours(png: Path) -> set[str]:
    im = Image.open(png).convert("RGBA")
    return {"#%02x%02x%02x" % c[1][:3] for c in im.getcolors(1 << 20) if c[1][3]}


def test_repalette_rebuilds_from_provenance_and_keeps_legacy_assets(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(palettes, "CUSTOM_PALETTES_FILE", tmp_path / "palettes_custom.json")
    story = tmp_path / "stories" / "demo"
    assets = story / "assets"
    (assets / "sprites").mkdir(parents=True)
    (story / "story.json").write_text(json.dumps({"id": "demo", "palette": "jp_story_master"}), encoding="utf-8")
    # a background made before provenance existed (no raw): must stay byte-identical
    legacy = Image.new("RGB", (320, 200), (16, 19, 34))
    ImageDraw.Draw(legacy).rectangle((0, 120, 320, 200), fill=(110, 63, 39))
    legacy.save(assets / "bg_old.png")
    provenance.adopt_legacy(assets / "bg_old.png", "made by hand")
    legacy_bytes = (assets / "bg_old.png").read_bytes()
    # a background with a raw source, made the old way (master palette + Bayer dither)
    raw = tmp_path / "raw_bg_road.png"
    im = Image.new("RGB", (640, 400), (92, 96, 104))
    d = ImageDraw.Draw(im)
    d.rectangle((0, 0, 640, 180), fill=(52, 64, 92))
    d.rectangle((300, 250, 316, 266), fill=(250, 150, 30))
    im.save(raw)
    process_pixel_background(raw, assets / "bg_road.png", palette_name="jp_story_master", dither_strength=18.0)
    # a bust sheet + its rig
    sheet_raw = tmp_path / "raw_sheet_yui.png"
    shutil.copy(REPO / "art-src" / "hanami-first" / "raw_sheet_yui.png", sheet_raw)
    process_sprite_sheet(sheet_raw, assets / "sprites" / "yui", cols=4, frame_width=96, frame_height=96,
                         registration="bust", bg_mode="chroma_green", split="gaps", cleanup=True,
                         lock_expressions=True)
    build_rig(assets / "sprites" / "yui")
    # a small prop with a raw source: it keeps the colour count it was designed with
    prop_raw = tmp_path / "raw_item_cup.png"
    prop = Image.new("RGB", (120, 60), (0, 255, 0))
    for x in range(20, 100):
        ImageDraw.Draw(prop).line((x, 10, x, 50), fill=(200 - x, 120 + x // 2, 60 + x))
    prop.save(prop_raw)
    (assets / "items").mkdir()
    process_pixel_sprite(prop_raw, assets / "items" / "cup.png", target_width=24, target_height=12,
                         palette_name="jp_story_master", bg_mode="chroma_green", cleanup=True)
    prop_colours = len(_colours(assets / "items" / "cup.png"))

    dry = repalette_story(story, "demo_pal", n_colors=40, dry_run=True)
    assert dry["fixed_assets"] == ["assets/bg_old.png"] and not (tmp_path / "palettes_custom.json").exists()
    assert "assets/sprites/yui/rig" in dry["rebuilt"]
    try:
        rep = repalette_story(story, "demo_pal", n_colors=40)
        pal = set(json.loads((tmp_path / "palettes_custom.json").read_text())["demo_pal"]["colors"])
        assert (assets / "bg_old.png").read_bytes() == legacy_bytes  # untouched
        assert _colours(assets / "bg_old.png") <= pal  # ...and its colours are in the new palette
        assert "#fa961e" in pal  # the small saturated accent of the raw background
        for png in (assets / "bg_road.png", assets / "sprites" / "yui" / "spritesheet.png",
                    assets / "sprites" / "yui" / "rig" / "head.png"):
            assert _colours(png) <= pal, png
        assert json.loads((story / "story.json").read_text())["palette"] == "demo_pal"
        assert json.loads((assets / "sprites" / "yui" / "meta.json").read_text())["palette"] == "demo_pal"
        bg_step = json.loads((assets / "provenance.json").read_text())["assets"]["bg_road.png"]["steps"][0]
        assert bg_step["params"]["dither_strength"] == 0.0 and bg_step["params"]["palette_name"] == "demo_pal"
        sheet_step = json.loads((assets / "sprites" / "provenance.json").read_text())["assets"]["yui"]["steps"][0]
        assert sheet_step["params"]["max_colors"] == 32
        # the new records replay byte-identically (rig included)
        for pf in (assets / "provenance.json", assets / "sprites" / "provenance.json",
                   assets / "sprites" / "yui" / "provenance.json"):
            res = provenance.reprocess(pf)
            assert res["ok"], res
        assert rep["kept_from_fixed_assets"] == len(_colours(assets / "bg_old.png") - {"#241712"})
        assert len(_colours(assets / "items" / "cup.png")) <= prop_colours
        cup_step = json.loads((assets / "items" / "provenance.json").read_text())["assets"]["cup.png"]["steps"][0]
        assert cup_step["params"]["max_colors"] == prop_colours
        assert provenance.reprocess(assets / "items" / "provenance.json")["ok"]
    finally:
        palettes.PALETTES.pop("demo_pal", None)
