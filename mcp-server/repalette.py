"""Re-palette a whole story (or a shared series pack) from its provenance records.

Every asset that `provenance.json` can rebuild from a raw source is replayed with exactly its recorded
steps and parameters (crop, scale, registration, expression locks, rigs ...), changing only:
  - `palette_name` -> the story's own palette,
  - `dither_strength` -> `dither` for backgrounds (0: the palette already has the scene's shades),
  - `max_colors` -> `sprite_max_colors` for sprite sheets that had no colour budget.
Assets that cannot be rebuilt (`legacy_master`: made before provenance, raw lost; `cleanup_sprite` of a
legacy source; code-drawn items) stay byte-identical and their colours are KEPT in the new palette, so
the whole story still passes the palette lock.

The palette itself is picked like `art_manifest` `palette_build`: every rebuildable asset is first
replayed without a palette, then `pixel_quality.build_story_palette` chooses real colours (saturated
accents weighted up, the #241712 outline and the kept colours always in). It is saved in
palettes_custom.json and the provenance records get the new parameters, so `pixellab_reprocess`
stays byte-identical.

CLI: uv run python repalette.py ../web/public/stories/<id> --palette <name> [--colors 64] [--dry-run]
"""

from __future__ import annotations

import json
import shutil
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

import provenance
from palettes import PALETTES, _custom_names, save_custom_palette

PALETTE_OPS = {"process_pixel_background", "process_pixel_sprite", "process_sprite_sheet", "relock_palette",
               "process_pose_sheet"}
OUTLINE = "#241712"


def _records(root: Path) -> list[tuple[Path, str, dict[str, Any]]]:
    """(provenance file, asset name, entry) under `root`; rigs (built from sheets) last."""
    out = []
    for pf in sorted(root.rglob(provenance.MANIFEST)):
        for name, entry in json.loads(pf.read_text(encoding="utf-8")).get("assets", {}).items():
            out.append((pf, name, entry))
    return sorted(out, key=lambda r: any(s["op"] == "build_rig" for s in r[2].get("steps", [])))


def _rebuildable(entry: dict[str, Any]) -> bool:
    steps = entry.get("steps") or []
    if not steps or not any(s["op"] in PALETTE_OPS for s in steps):
        return False
    first = steps[0].get("input")
    return isinstance(first, dict) and provenance._resolve(first["path"]).exists()


def _params(
    step: dict[str, Any], palette: str, dither: float | None, sprite_max_colors: int, item_colors: int = 0
) -> dict[str, Any]:
    p = dict(step.get("params") or {})
    if "palette_name" in p:
        p["palette_name"] = palette
    if step["op"] == "process_pixel_background" and dither is not None:
        p["dither_strength"] = float(dither)
    if step["op"] == "process_sprite_sheet" and sprite_max_colors and not p.get("max_colors"):
        p["max_colors"] = int(sprite_max_colors)
    if step["op"] == "process_pixel_sprite" and item_colors and not p.get("max_colors"):
        # a small prop keeps the colour count it was designed with: a richer palette must not add
        # near-identical shades (on a 15x15 sprite one extra highlight pixel is 1 % of "noise")
        p["max_colors"] = int(item_colors)
    return p


def _replay(entry: dict[str, Any], target: Path, params_of) -> None:
    """Run an entry's steps into an empty `target` (a file or a sheet / rig directory), like reprocess."""
    ops = provenance._ops()
    for step in entry["steps"]:
        src = target if step["input"] == "self" else provenance._resolve(step["input"]["path"])
        kwargs = params_of(step)
        for key, ref in (step.get("extra_inputs") or {}).items():
            kwargs[key] = str(provenance._resolve(ref["path"]))
        ops[step["op"]](src, target, **kwargs)


def _install(tmp: Path, real: Path) -> None:
    """Copy a replayed file, or the direct files of a replayed directory (nested assets and records stay)."""
    if tmp.is_dir():
        real.mkdir(parents=True, exist_ok=True)
        for f in tmp.iterdir():
            if f.is_file() and f.name != provenance.MANIFEST:
                shutil.copy2(f, real / f.name)
    else:
        real.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(tmp, real)


def _colours(png: Path) -> dict[str, int]:
    a = np.array(Image.open(png).convert("RGBA"))
    px = a[a[:, :, 3] >= 128][:, :3]
    if not len(px):
        return {}
    keys, cnt = np.unique(px, axis=0, return_counts=True)
    return {"#%02x%02x%02x" % tuple(int(v) for v in k): int(c) for k, c in zip(keys, cnt)}


def _group(path: Path) -> str:
    if path.is_dir() or path.name == "spritesheet.png":
        return "characters"
    return "backgrounds" if path.name.startswith("bg_") else "items"


def repalette_story(
    asset_root: str | Path,
    palette: str,
    *,
    n_colors: int = 64,
    chroma_boost: float = 4.0,
    dither: float | None = 0.0,
    sprite_max_colors: int = 32,
    dry_run: bool = False,
) -> dict[str, Any]:
    """`asset_root`: a story folder (web/public/stories/<id>) or a shared pack (web/public/shared/<id>)."""
    from pixel_quality import build_story_palette

    root = Path(asset_root).expanduser().resolve()
    data_json = root / "story.json" if (root / "story.json").exists() else root / "pack.json"
    if not data_json.exists():
        raise ValueError(f"{root} has no story.json / pack.json")
    if palette in PALETTES and palette not in _custom_names():
        raise ValueError(f"'{palette}' is a built-in palette: give the story its own name")
    records = _records(root)
    rebuild = [(pf, n, e) for pf, n, e in records if _rebuildable(e)]
    item_colors = {(pf.parent / n).resolve(): len(_colours(pf.parent / n)) for pf, n, e in rebuild
                   if (pf.parent / n).is_file() and e["steps"][0]["op"] == "process_pixel_sprite"}
    rebuilt_outputs = {(pf.parent / n).resolve() for pf, n, _ in rebuild}
    # rigs are cut from a sheet: rebuild them (after their sheet) when the sheet is rebuilt
    for pf, n, e in records:
        st = (e.get("steps") or [{}])[0]
        if st.get("op") == "build_rig" and isinstance(st.get("input"), dict) and \
                provenance._resolve(st["input"]["path"]).resolve() in rebuilt_outputs:
            rebuild.append((pf, n, e))

    # colours that must stay: every PNG of the story that no rebuildable record produces
    keep_counts: dict[str, int] = {}
    fixed: list[str] = []
    for png in sorted(root.rglob("*.png")):
        if png.name.startswith("frame_") or "rig" in png.parent.name:
            continue  # derived from a sheet
        if png.resolve() in rebuilt_outputs or png.parent.resolve() in rebuilt_outputs:
            continue
        fixed.append(str(png.relative_to(root)))
        for c, k in _colours(png).items():
            keep_counts[c] = keep_counts.get(c, 0) + k
    keep = [OUTLINE] + [c for c, _ in sorted(keep_counts.items(), key=lambda kv: -kv[1]) if c != OUTLINE]
    if len(keep) >= n_colors:
        n_colors = len(keep) + 16

    # 1. true-colour replay (no palette) -> the colours the rebuilt assets need
    with tempfile.TemporaryDirectory(prefix="repalette_") as td:
        groups: dict[str, list[Path]] = {"backgrounds": [], "characters": [], "items": []}
        for i, (pf, name, entry) in enumerate(rebuild):
            if any(s["op"] == "build_rig" for s in entry["steps"]):
                continue  # rigs are cut from the sheets: no colours of their own
            tgt = Path(td) / f"{i}_{name}"
            budget = item_colors.get((pf.parent / name).resolve(), 0)
            _replay(entry, tgt, lambda s: _params(s, "none", dither, sprite_max_colors, budget))
            out = tgt / "spritesheet.png" if tgt.is_dir() else tgt
            if out.exists():
                groups[_group(out)].append(out)
        colors = build_story_palette(groups, n_colors, keep=keep, chroma_boost=chroma_boost)
    report: dict[str, Any] = {
        "palette": palette, "colors": len(colors), "kept_from_fixed_assets": len(keep) - 1, "fixed_assets": fixed,
        "rebuilt": [str((pf.parent / n).relative_to(root)) for pf, n, _ in rebuild], "dry_run": dry_run,
    }
    if dry_run:
        return report
    save_custom_palette(palette, colors, f"Palette of '{root.name}' (repalette.py from its provenance: "
                                         f"{len(keep) - 1} colours kept from assets without a raw source).")

    # 2. real replay with the new palette, then update the records
    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    by_file: dict[Path, dict[str, Any]] = {}
    for pf, name, entry in rebuild:
        real = pf.parent / name
        with tempfile.TemporaryDirectory(prefix="repalette_") as td:
            tgt = Path(td) / name
            budget = item_colors.get(real.resolve(), 0)
            _replay(entry, tgt, lambda s: _params(s, palette, dither, sprite_max_colors, budget))
            _install(tgt, real)
        doc = by_file.setdefault(pf, json.loads(pf.read_text(encoding="utf-8")))
        rec = doc["assets"][name]
        for step in rec["steps"]:
            step["params"] = _params(step, palette, dither, sprite_max_colors, item_colors.get(real.resolve(), 0))
            step["at"] = now
        rec["output"] = {"sha": provenance.path_sha(real)}
        pf.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        by_file[pf] = doc

    story = json.loads(data_json.read_text(encoding="utf-8"))
    story["palette"] = palette
    data_json.write_text(json.dumps(story, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return report


if __name__ == "__main__":
    import sys

    args = sys.argv[1:]
    get = lambda flag, default: args[args.index(flag) + 1] if flag in args else default  # noqa: E731
    print(json.dumps(repalette_story(args[0], get("--palette", ""), n_colors=int(get("--colors", 64)),
                                     dry_run="--dry-run" in args), ensure_ascii=False, indent=2))
