"""Asset provenance ("birth certificate") for every Mini-PixelLab output.

Each output directory gets a `provenance.json`:

    { "version": 1,
      "assets": {
        "bg_park.png": {
          "steps": [ { "op": "process_pixel_background",
                       "params": {...},                      # everything except paths
                       "input": {"path": "art-src/...", "sha": "..."} | "self",
                       "source": {"prompt": "...", "model": "...", "seed": 42}  # optional
                     } ],
          "output": {"sha": "..."} } } }

`reprocess()` replays the steps into a temp directory and checks the result is byte-identical,
so any asset can be rebuilt exactly (or you learn its source file is gone / it was edited by hand).
"""

from __future__ import annotations

import hashlib
import json
import shutil
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

MANIFEST = "provenance.json"
REPO_ROOT = Path(__file__).resolve().parents[1]


def path_sha(path: str | Path) -> str:
    """sha256 (16 hex) of a file, or of the files directly inside a directory (sorted, names included)."""
    p = Path(path)
    h = hashlib.sha256()
    if p.is_dir():
        # direct files only: nested asset dirs (e.g. sheet/rig) are separate assets with their own record
        for f in sorted(x for x in p.iterdir() if x.is_file() and x.name != MANIFEST):
            h.update(str(f.relative_to(p)).encode())
            h.update(f.read_bytes())
    elif p.exists():
        h.update(p.read_bytes())
    else:
        return ""
    return h.hexdigest()[:16]


def _portable(path: str | Path) -> str:
    p = Path(path).expanduser().resolve()
    try:
        return str(p.relative_to(REPO_ROOT))
    except ValueError:
        return str(p)


def _resolve(path: str) -> Path:
    p = Path(path)
    return p if p.is_absolute() else REPO_ROOT / p


def _clean_params(params: dict[str, Any]) -> dict[str, Any]:
    out = {}
    for k, v in params.items():
        if k in {"input_path", "output_path", "output_dir", "sheet_dir", "out_dir", "source", "patch_path"}:
            continue
        if isinstance(v, Path):
            v = str(v)
        out[k] = v
    return out


def record(
    op: str,
    params: dict[str, Any],
    *,
    output: str | Path,
    input_path: str | Path | None = None,
    in_place: bool = False,
    source: dict[str, Any] | None = None,
    extra_inputs: dict[str, str | Path] | None = None,
) -> None:
    """Append one processing step for `output` (a file or a sheet/rig directory)."""
    out = Path(output).expanduser().resolve()
    manifest_path = out.parent / MANIFEST
    data: dict[str, Any] = {"version": 1, "assets": {}}
    if manifest_path.exists():
        data = json.loads(manifest_path.read_text(encoding="utf-8"))
    entry = data["assets"].get(out.name, {"steps": []})
    if not in_place:
        entry = {"steps": []}  # a fresh build replaces the history
    step: dict[str, Any] = {
        "op": op,
        "params": _clean_params(params),
        "input": "self" if in_place else (
            {"path": _portable(input_path), "sha": path_sha(input_path)} if input_path else None
        ),
        "at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
    }
    if extra_inputs:
        step["extra_inputs"] = {k: {"path": _portable(v), "sha": path_sha(v)} for k, v in extra_inputs.items()}
    if source:
        step["source"] = source
    entry["steps"].append(step)
    entry["output"] = {"sha": path_sha(out)}
    data["assets"][out.name] = entry
    manifest_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _ops() -> dict[str, Callable[..., Any]]:
    import pixel_processor as pp
    import pixel_rig as pr
    import pixel_tools as pt

    return {
        "process_pixel_sprite": lambda i, o, **k: pp.process_pixel_sprite(i, o, record_provenance=False, **k),
        "process_sprite_sheet": lambda i, o, **k: pp.process_sprite_sheet(i, o, record_provenance=False, **k),
        "process_pixel_background": lambda i, o, **k: pp.process_pixel_background(i, o, record_provenance=False, **k),
        "relock_palette": lambda i, o, **k: pp.relock_palette(i, o, record_provenance=False, **k),
        "depixelize": lambda i, o, **k: pt.depixelize(i, o, record_provenance=False, **k),
        "cleanup_sprite": lambda i, o, **k: pt.cleanup_sprite(i, o, record_provenance=False, **k),
        "lock_expressions": lambda i, o, **k: pr.lock_expressions(o, record_provenance=False, **k),
        "add_expression": lambda i, o, **k: pr.add_expression(o, record_provenance=False, **k),
        "build_rig": lambda i, o, **k: pr.build_rig(i, o, record_provenance=False, **k),
    }


def reprocess(manifest_path: str | Path, names: list[str] | None = None) -> dict[str, Any]:
    """Replay recorded steps into a temp dir and compare with the current outputs."""
    mpath = Path(manifest_path).expanduser().resolve()
    data = json.loads(mpath.read_text(encoding="utf-8"))
    ops = _ops()
    results: dict[str, Any] = {}
    for name, entry in data["assets"].items():
        if names and name not in names:
            continue
        current = mpath.parent / name
        with tempfile.TemporaryDirectory() as td:
            target = Path(td) / name
            status = "identical"
            for step in entry["steps"]:
                fn = ops.get(step["op"])
                if fn is None:
                    status = f"unknown op {step['op']}"
                    break
                if step["input"] == "self":
                    src = target
                elif step["input"] is None:
                    status = "no input recorded"
                    break
                else:
                    src = _resolve(step["input"]["path"])
                    if not src.exists():
                        status = f"missing source {step['input']['path']}"
                        break
                    if step["op"] in ("relock_palette", "cleanup_sprite") and src.resolve() == current.resolve():
                        # in-place file op recorded as a fresh build: replay on a copy
                        tmp_src = Path(td) / f"_src_{name}"
                        shutil.copy(src, tmp_src)
                        src = tmp_src
                params = dict(step["params"])
                for key, ref in (step.get("extra_inputs") or {}).items():
                    params[key] = str(_resolve(ref["path"]))
                fn(src, target, **params)
            if status == "identical":
                new_sha = path_sha(target)
                if new_sha != entry["output"]["sha"]:
                    status = "differs from record"
                elif path_sha(current) != entry["output"]["sha"]:
                    status = "file edited after processing"
        results[name] = status
    return {"manifest": str(mpath), "results": results, "ok": all(v == "identical" for v in results.values())}
