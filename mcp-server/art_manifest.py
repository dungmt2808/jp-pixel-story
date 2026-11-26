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
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from pixel_processor import process_pixel_background

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
) -> dict[str, Any]:
    manifest_path = Path(manifest_path).resolve()
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    story_id = manifest["story"]
    public = Path(public_root) if public_root else REPO_ROOT / "web" / "public"
    story_dir = public / "stories" / story_id
    story_json = story_dir / "story.json"
    story = json.loads(story_json.read_text(encoding="utf-8"))
    palette = manifest.get("palette") or story.get("palette") or "jp_story_master"

    applied: list[dict[str, Any]] = []
    waiting: list[dict[str, str]] = []
    problems: list[str] = []
    for bg in manifest.get("backgrounds", []):
        key = bg["key"]
        raw = manifest_path.parent / bg["raw"]
        if not raw.exists():
            waiting.append({"key": key, "raw": str(raw.relative_to(REPO_ROOT)) if raw.is_relative_to(REPO_ROOT) else str(raw)})
            continue
        out = story_dir / "assets" / f"bg_{key}.png"
        url = f"/stories/{story_id}/assets/bg_{key}.png"
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

    if applied and not dry_run:
        story_json.write_text(json.dumps(story, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {"story": story_id, "applied": applied, "waiting_for_art": waiting, "problems": problems, "dry_run": dry_run}


if __name__ == "__main__":  # uv run python art_manifest.py ../art-src/<story>/art.json
    import sys

    print(json.dumps(apply_art_manifest(sys.argv[1], dry_run="--dry-run" in sys.argv), ensure_ascii=False, indent=2))
