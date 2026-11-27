"""Route C: cut a moving object out of a background (magic wand on pixel art, lasso on source art)."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from art_manifest import apply_art_manifest
from pixel_extract import extract_object

SKY = (228, 138, 160)
GROUND = (110, 63, 39)
MULLION = (58, 26, 18)
BODY = (246, 238, 216)
OUTLINE = (36, 23, 18)


def _scene(path: Path, scale: int = 1) -> None:
    """Sky over ground, a plane (cream body + dark outline) crossed by a dark window mullion."""
    w, h = 120 * scale, 60 * scale
    im = Image.new("RGB", (w, h), SKY)
    d = ImageDraw.Draw(im)
    d.rectangle((0, 40 * scale, w, h), fill=GROUND)
    d.rectangle((30 * scale, 28 * scale, 80 * scale - 1, 38 * scale - 1), fill=BODY, outline=OUTLINE)
    d.rectangle((54 * scale, 0, 55 * scale + scale - 1, h), fill=MULLION)  # in front of the plane
    im.save(path)


def test_magic_wand_cuts_the_object_heals_the_mullion_and_fills_the_hole(tmp_path: Path) -> None:
    src = tmp_path / "bg.png"
    _scene(src)
    info = extract_object(src, tmp_path / "plane.png", rect=[24, 22, 64, 22], part="sprite", record_provenance=False)
    sprite = np.array(Image.open(tmp_path / "plane.png"))
    assert info["origin"] == [30, 28] and info["size"] == [50, 10]
    # the mullion's 2 px gap through the body is healed: the middle row is opaque end to end
    assert (sprite[5, :, 3] > 0).all()
    assert tuple(sprite[5, 25, :3]) in (BODY, OUTLINE)

    extract_object(src, tmp_path / "clean.png", rect=[24, 22, 64, 22], part="clean", record_provenance=False)
    clean = np.array(Image.open(tmp_path / "clean.png").convert("RGB"))
    body = np.all(clean == BODY, axis=-1) | np.all(clean == OUTLINE, axis=-1)
    assert not body.any(), "no plane pixel left in the emptied background"
    assert tuple(clean[33, 40]) == SKY
    assert tuple(clean[33, 54]) == MULLION, "the occluder in front stays"


def test_lasso_polygon_with_exclude_for_source_art(tmp_path: Path) -> None:
    src = tmp_path / "raw.png"
    _scene(src, scale=4)
    poly = [[118, 110], [322, 110], [322, 154], [118, 154]]
    kw = dict(rect=[100, 100, 240, 70], polygon=poly, exclude=[[214, 90, 10, 80]], max_gap=10, record_provenance=False)
    info = extract_object(src, tmp_path / "p.png", part="sprite", **kw)
    assert info["origin"] == [118, 110]
    sprite = np.array(Image.open(tmp_path / "p.png"))
    assert (sprite[20, :, 3] > 0).all(), "the excluded mullion columns are healed"
    extract_object(src, tmp_path / "c.png", part="clean", inpaint="median", dilate=0, **kw)
    clean = np.array(Image.open(tmp_path / "c.png").convert("RGB"))
    assert tuple(clean[130, 150]) == SKY
    assert tuple(clean[130, 218]) == MULLION


def test_art_manifest_objects_make_an_item_and_an_emptied_background(tmp_path: Path) -> None:
    public = tmp_path / "public"
    sdir = public / "stories" / "demo"
    sdir.mkdir(parents=True)
    story = {"id": "demo", "engine": "cinema", "palette": "jp_story_master",
             "assets": {"backgrounds": {}, "portraits": {}},
             "scenes": [{"id": "s1", "backdrop": "bg:field", "lines": []}]}
    (sdir / "story.json").write_text(json.dumps(story), encoding="utf-8")
    art = tmp_path / "art"
    art.mkdir()
    _scene(art / "raw_bg_field.png", scale=8)  # 960x480 "source art"
    (art / "art.json").write_text(json.dumps({
        "story": "demo",
        "backgrounds": [{"key": "field", "raw": "raw_bg_field.png", "use": ["s1"]}],
        "objects": [{"key": "plane", "from": "field", "rect": [200, 180, 500, 160],
                     "polygon": [[236, 220], [644, 220], [644, 308], [236, 308]],
                     "exclude": [[428, 170, 20, 180]], "max_gap": 20, "clean": "field_empty", "use": ["s1"]}],
    }), encoding="utf-8")
    res = apply_art_manifest(art / "art.json", public_root=public)
    ob = res["objects"][0]
    assert ob["scenes"] == ["s1"] and res["problems"] == []
    item = Image.open(sdir / "assets" / "items" / "plane.png")
    assert item.size == tuple(ob["size"]) == (136, 37)  # 1/3 scale, like every other asset
    assert ob["origin"] == [round(236 * 320 / 960), round(220 * 200 / 480)]
    saved = json.loads((sdir / "story.json").read_text())
    assert saved["scenes"][0]["backdrop"] == "bg:field_empty"
    assert saved["assets"]["items"]["plane"].endswith("items/plane.png")
    assert (sdir / "assets" / "bg_field_empty.png").exists()
