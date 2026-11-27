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
