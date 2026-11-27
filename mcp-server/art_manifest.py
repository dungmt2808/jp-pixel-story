"""Art manifests: drop raw images into art-src/<story>/, run one command, get a consistent story.

`art-src/<story>/art.json`:
{
  "story": "jlpt-n4-2025-12-japan-life",
  "palette": "jp_story_master",
  "backgrounds": [
    { "key": "train", "raw": "raw_bg_train.png", "use": ["airport_train_twist", "warm_ending"] },
    { "key": "dining", "raw": "raw_bg_dining.png", "use": ["dream_anime", "haruko_home_experience/exp_washoku"] }
  ]
}

For every background whose raw file exists, `apply_art_manifest` runs the Mini-PixelLab background
pipeline (grid detection, 320x200, palette lock, dithering, provenance) into
`web/public/stories/<story>/assets/bg_<key>.png`, registers it in `assets.backgrounds` and points
each listed scene (or `scene/choice`) at `bg:<key>`. Missing raw files are reported, not fatal, so
art can arrive one image at a time.

Route C — moving objects cut out of a background (`objects`):
  { "key": "plane", "from": "airport", "rect": [x, y, w, h], "polygon": [[x, y], ...],
    "exclude": [[x, y, w, h]], "clean": "airport_empty", "use": ["warm_ending"] }
Coordinates are in the RAW image. The object is cut with `pixel_extract` (lasso polygon, or the
border magic wand without one), the hole is filled, and BOTH the sprite and the emptied background
go through the same pixelize + palette lock as every other asset, at the same scale. The sprite
lands in `assets.items[key]`, the emptied background in `assets.backgrounds[clean]`, the listed
scenes switch to it, and the report gives the object's virtual position (`origin`) for a mover.

Characters that move (`characters`):
  { "key": "lisa", "raw": "raw_sheet_lisa.png", "kind": "bust" }
  { "key": "lisa_walk", "raw": "raw_walk_lisa.png", "kind": "walk", "pixel_pitch": 5.5, "stride": 28 }
`bust`: an expression sheet of one portrait (4 figures in a row: neutral, mouth open, eyes
closed, mouth half open). `key` must be a key of `assets.portraits`: the sheet is sliced at the
portrait's size, the expressions are locked (hair and clothes never flicker), a head/body rig is
built, and both are registered under the SAME key, so the player animates that portrait (talks,
blinks, nods) wherever it appears, `castPortrait` switches included. `walk`: a full-body walk
cycle (8 walk + idle + blink, side view facing right) registered as `assets.sprites[key]` for
route B `people` (`kind: "sprite:<key>"`). Figures are found by the gaps between them, so the
generator does not have to space them evenly.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from PIL import Image

from pixel_extract import extract_object
from pixel_processor import process_pixel_background, process_pixel_sprite, process_sprite_sheet

BUST_CLIPS = {
    "idle": {"frames": [0] * 11 + [2], "fps": 4},  # a blink every 3 s
    "talk": {"frames": [1, 3, 1, 0], "fps": 8},
}
WALK_CLIPS = {"idle": {"frames": [8] * 11 + [9], "fps": 4}}

REPO_ROOT = Path(__file__).resolve().parent.parent


def _set_backdrop(story: dict[str, Any], target: str, ref: str) -> bool:
    scene_id, _, choice_id = target.partition("/")
    for sc in story.get("scenes", []):
        if sc.get("id") != scene_id:
            continue
        if not choice_id:
            sc["backdrop"] = ref
            return True
        for ch in (sc.get("minigame") or {}).get("choices", []) or []:
            if ch.get("id") == choice_id:
                ch["backdrop"] = ref
                return True
    return False


def apply_art_manifest(
    manifest_path: str | Path,
    *,
    public_root: str | Path | None = None,
    dry_run: bool = False,
    only: list[str] | None = None,
) -> dict[str, Any]:
    """`only`: sections to run ("backgrounds", "objects", "characters"); default all. Lets new
    character sheets be added without re-running the backgrounds already in the story.

    Supports both per-story manifests (`"story": "<id>"`) and reusable shared-universe packs
    (`"shared": "<pack-id>"`, written to `web/public/shared/<pack-id>/` with `pack.json`).
    """
    manifest_path = Path(manifest_path).resolve()
    raw_manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest = dict(raw_manifest)
    if only:
        unknown = set(only) - {"backgrounds", "objects", "characters"}
        if unknown:
            raise ValueError(f"only: unknown sections {sorted(unknown)}")
        # objects are cut from the raw backgrounds, so they keep their `backgrounds` specs to read
        manifest = {**manifest, **{sec: [] for sec in ("backgrounds", "objects", "characters") if sec not in only}}
        if "objects" in only:
            manifest["_object_sources"] = raw_manifest.get("backgrounds", [])
    shared_id = manifest.get("shared")
    story_id = manifest.get("story") or shared_id
    if not story_id:
        raise ValueError("manifest must declare either 'story' or 'shared'")
    public = Path(public_root) if public_root else REPO_ROOT / "web" / "public"
    if shared_id:
        assets_dir = public / "shared" / shared_id
        url_base = f"/shared/{shared_id}"
        target_json = assets_dir / "pack.json"
        if target_json.exists():
            story = json.loads(target_json.read_text(encoding="utf-8"))
        else:
            story = {"id": shared_id, "assets": {"backgrounds": {}, "sprites": {}, "rigs": {}}}
        for meta_key in ("name", "palette", "voices", "cast"):
            if meta_key in raw_manifest:
                story[meta_key] = raw_manifest[meta_key]
    else:
        story_dir = public / "stories" / story_id
        assets_dir = story_dir / "assets"
        url_base = f"/stories/{story_id}/assets"
        target_json = story_dir / "story.json"
        story = json.loads(target_json.read_text(encoding="utf-8"))
    palette = manifest.get("palette") or story.get("palette") or "jp_story_master"
    if shared_id:
        story["palette"] = palette

    applied: list[dict[str, Any]] = []
    waiting: list[dict[str, str]] = []
    problems: list[str] = []
    for bg in manifest.get("backgrounds", []):
        key = bg["key"]
        raw = manifest_path.parent / bg["raw"]
        if not raw.exists():
            waiting.append({"key": key, "raw": str(raw.relative_to(REPO_ROOT)) if raw.is_relative_to(REPO_ROOT) else str(raw)})
            continue
        out = assets_dir / f"bg_{key}.png"
        url = f"{url_base}/bg_{key}.png"
        entry: dict[str, Any] = {"key": key, "output": url, "scenes": []}
        if not dry_run:
            out.parent.mkdir(parents=True, exist_ok=True)
            res = process_pixel_background(
                raw,
                out,
                palette_name=palette,
                grid=bg.get("grid", "auto"),
                dither_strength=float(bg.get("dither", 18.0)),
                source={"kind": "art-manifest", "manifest": manifest_path.name, "key": key},
            )
            entry["colors"] = res.get("unique_colors") or res.get("colors")
        story.setdefault("assets", {}).setdefault("backgrounds", {})[key] = url
        for target in bg.get("use", []):
            if _set_backdrop(story, target, f"bg:{key}"):
                entry["scenes"].append(target)
            else:
                problems.append(f"{key}: no scene/choice '{target}' in {story_id}")
        applied.append(entry)

    bg_specs = manifest.get("backgrounds", []) or manifest.get("_object_sources", [])
    raw_of = {bg["key"]: manifest_path.parent / bg["raw"] for bg in bg_specs}
    objects: list[dict[str, Any]] = []
    for ob in manifest.get("objects", []):
        key = ob["key"]
        raw = raw_of.get(ob["from"])
        if raw is None or not raw.exists():
            waiting.append({"key": key, "raw": f"(background '{ob['from']}' not available yet)"})
            continue
        raw_w, raw_h = Image.open(raw).size
        sx, sy = 320 / raw_w, 200 / raw_h
        cut = {k: ob[k] for k in ("rect", "polygon", "exclude", "tolerance", "max_gap") if k in ob}
        sprite_raw = manifest_path.parent / f"raw_item_{key}.png"
        clean_key = ob.get("clean", f"{ob['from']}_without_{key}")
        clean_raw = manifest_path.parent / f"raw_bg_{clean_key}.png"
        entry = {"key": key, "item": f"{url_base}/items/{key}.png", "clean": f"bg:{clean_key}", "scenes": []}
        if not dry_run:
            info = extract_object(raw, sprite_raw, part="sprite", record_provenance=False, **cut)
            extract_object(raw, clean_raw, part="clean", inpaint="median", dilate=int(ob.get("dilate", 2)),
                           record_provenance=False, **cut)
            w, h = info["size"]
            tw, th = max(1, round(w * sx)), max(1, round(h * sy))
            item_out = assets_dir / "items" / f"{key}.png"
            item_out.parent.mkdir(parents=True, exist_ok=True)
            process_pixel_sprite(sprite_raw, item_out, target_width=tw, target_height=th, palette_name=palette,
                                 bg_mode="none", align_bottom=False, fit_mode="bbox", grid="none",
                                 cleanup=bool(ob.get("cleanup", False)),
                                 source={"kind": "art-manifest", "manifest": manifest_path.name, "object": key})
            bg_spec = next(b for b in bg_specs if b["key"] == ob["from"])
            process_pixel_background(clean_raw, assets_dir / f"bg_{clean_key}.png", palette_name=palette,
                                     grid=bg_spec.get("grid", "auto"), dither_strength=float(bg_spec.get("dither", 18.0)),
                                     source={"kind": "art-manifest", "manifest": manifest_path.name, "cleaned": key})
            entry["size"] = [tw, th]
            entry["origin"] = [round(info["origin"][0] * sx), round(info["origin"][1] * sy)]
        story.setdefault("assets", {}).setdefault("items", {})[key] = entry["item"]
        story["assets"].setdefault("backgrounds", {})[clean_key] = f"{url_base}/bg_{clean_key}.png"
        for target in ob.get("use", []):
            if _set_backdrop(story, target, f"bg:{clean_key}"):
                entry["scenes"].append(target)
            else:
                problems.append(f"{key}: no scene/choice '{target}' in {story_id}")
        objects.append(entry)

    characters = _apply_characters(
        manifest, manifest_path, story, assets_dir, url_base, public, palette, waiting, problems, dry_run,
        is_shared=bool(shared_id),
    )

    if (applied or objects or characters or (shared_id and not target_json.exists())) and not dry_run:
        target_json.parent.mkdir(parents=True, exist_ok=True)
        target_json.write_text(json.dumps(story, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    out_key = "shared" if shared_id else "story"
    return {out_key: story_id, "applied": applied, "objects": objects, "characters": characters,
            "waiting_for_art": waiting, "problems": problems, "dry_run": dry_run}


def _apply_characters(
    manifest: dict[str, Any],
    manifest_path: Path,
    story: dict[str, Any],
    assets_dir: Path,
    url_base: str,
    public: Path,
    palette: str,
    waiting: list[dict[str, str]],
    problems: list[str],
    dry_run: bool,
    *,
    is_shared: bool = False,
) -> list[dict[str, Any]]:
    from pixel_rig import build_rig

    assets = story.setdefault("assets", {})
    done: list[dict[str, Any]] = []
    for ch in manifest.get("characters", []):
        key, kind = ch["key"], ch.get("kind", "bust")
        raw = manifest_path.parent / ch["raw"]
        if kind not in ("bust", "walk"):
            problems.append(f"{key}: kind must be 'bust' or 'walk'")
            continue
        portrait_url = (assets.get("portraits") or {}).get(key)
        if kind == "bust" and not portrait_url and not is_shared and not ch.get("frame"):
            problems.append(f"{key}: a bust sheet animates a portrait; '{key}' is not in assets.portraits")
            continue
        if not raw.exists():
            waiting.append({"key": key, "raw": str(raw.relative_to(REPO_ROOT)) if raw.is_relative_to(REPO_ROOT) else str(raw)})
            continue
        out = assets_dir / "sprites" / key
        url = f"{url_base}/sprites/{key}/meta.json"
        entry: dict[str, Any] = {"key": key, "kind": kind, "sprite": url}
        source = {"kind": "art-manifest", "manifest": manifest_path.name, "character": key}
        common = dict(palette_name=palette, bg_mode=ch.get("bg_mode", "chroma_green"), cleanup=True,
                      split="gaps", source=source)
        try:
            if kind == "bust":
                if ch.get("frame"):
                    pw, ph = int(ch["frame"][0]), int(ch["frame"][1])
                elif portrait_url:
                    pw, ph = Image.open(public / portrait_url.lstrip("/")).size
                else:
                    pw, ph = 96, 96
                if not dry_run:
                    process_sprite_sheet(raw, out, cols=int(ch.get("frames", 4)), frame_width=pw, frame_height=ph,
                                         registration=ch.get("registration", "bust"), grid=ch.get("grid", "auto"),
                                         lock_expressions=bool(ch.get("lock_expressions", True)),
                                         expression_region=ch.get("expression_region"),
                                         frame_regions=ch.get("frame_regions"),
                                         padding=int(ch.get("padding", 0)),
                                         clips=ch.get("clips", BUST_CLIPS), fps=8, **common)
                assets.setdefault("sprites", {})[key] = url
                if ch.get("rig", True) is False:
                    if key in (assets.get("rigs") or {}):
                        del assets["rigs"][key]
                else:
                    try:
                        if not dry_run:
                            build_rig(out, neck_row=ch.get("neck_row"))
                        assets.setdefault("rigs", {})[key] = f"{url_base}/sprites/{key}/rig/rig.json"
                        entry["rig"] = assets["rigs"][key]
                    except ValueError as err:  # no clear neck: the sprite still talks and blinks
                        problems.append(f"{key}: no rig ({err}); the sheet animates without nodding")
            else:
                fw, fh = ch.get("frame", [40, 64])
                clips = {"walk": {"frames": list(range(8)), "fps": 10, "stridePx": float(ch.get("stride", 28))}, **WALK_CLIPS}
                if not dry_run:
                    process_sprite_sheet(raw, out, cols=int(ch.get("frames", 10)), frame_width=int(fw), frame_height=int(fh),
                                         registration="centroid", facing=ch.get("facing", "right"),
                                         pixel_pitch=float(ch.get("pixel_pitch", 0)), grid="none",
                                         clips=ch.get("clips", clips), fps=10, **common)
                assets.setdefault("sprites", {})[key] = url
        except ValueError as err:
            problems.append(f"{key}: {err}")
            continue
        done.append(entry)
    return done


if __name__ == "__main__":  # uv run python art_manifest.py ../art-src/<story>/art.json [--only characters] [--dry-run]
    import sys

    sections = sys.argv[sys.argv.index("--only") + 1].split(",") if "--only" in sys.argv else None
    print(json.dumps(apply_art_manifest(sys.argv[1], dry_run="--dry-run" in sys.argv, only=sections),
                     ensure_ascii=False, indent=2))
