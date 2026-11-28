#!/usr/bin/env python3
"""Generate key poses + state edits of a character with a Gemini image model.

    GEMINI_API_KEY=... python3 art-src/kasa-jizo/gen_poses.py --set obaasan [--only see_off,see_off_b]
    python3 art-src/kasa-jizo/gen_poses.py --set obaasan --print     # the prompts, for the Gemini app

Prompts and references live in poses_prompts.json (one entry per character in "sets"). Base poses get
the character's references; edits ("change only the hands") get ONLY their base image, the way the
reference video makes its lever states. Files are written next to this script as <prefix><name>.png.
Image models need a paid (billing-enabled) AI Studio key: their free-tier quota is 0 (HTTP 429).
Standard library only.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
SPEC = json.loads((HERE / "poses_prompts.json").read_text(encoding="utf-8"))


def base_prompt(cs: dict, pose: str) -> str:
    return f"{SPEC['style']}\n{cs['character']}\n{cs['base'][pose]}\n{SPEC['green']}\n{cs['references_note']}"


def edit_prompt(instruction: str) -> str:
    return f"{instruction}\n{SPEC['style']}"


def _image_part(path: Path) -> dict:
    return {"inline_data": {"mime_type": "image/png", "data": base64.b64encode(path.read_bytes()).decode()}}


def _generate(model: str, key: str, parts: list, dst: Path) -> bool:
    body = {
        "contents": [{"parts": parts}],
        "generationConfig": {"responseModalities": ["IMAGE"], "imageConfig": {"aspectRatio": "1:1"}},
    }
    req = urllib.request.Request(
        f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", "x-goog-api-key": key},
    )
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                data = json.loads(r.read())
            for part in data["candidates"][0]["content"]["parts"]:
                inline = part.get("inlineData") or part.get("inline_data")
                if inline:
                    dst.write_bytes(base64.b64decode(inline["data"]))
                    print(f"saved {dst.name}")
                    return True
            print(f"{dst.name}: the model returned no image: {json.dumps(data)[:300]}")
        except urllib.error.HTTPError as e:
            detail = e.read().decode(errors="replace")
            if e.code == 429 and "limit: 0" in detail:
                print(f"{dst.name}: HTTP 429 - this key's quota for image models is 0 (free tier): "
                      "enable billing for its AI Studio project, or use the Gemini app (--print).")
                return False
            print(f"{dst.name}: HTTP {e.code} {' '.join(detail.split())[:300]}")
        except (urllib.error.URLError, TimeoutError, KeyError) as e:
            print(f"{dst.name}: attempt {attempt + 1} failed: {e}")
        time.sleep(5 * (attempt + 1))
    return False


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--set", default="ojiisan", choices=sorted(SPEC["sets"]))
    ap.add_argument("--model", default="gemini-3-pro-image")
    ap.add_argument("--only", default="", help="comma-separated pose names, e.g. see_off,see_off_b")
    ap.add_argument("--print", action="store_true", help="print the prompts (for the Gemini app) instead of calling the API")
    args = ap.parse_args()
    cs = SPEC["sets"][args.set]
    only = {n for n in args.only.split(",") if n}
    want = lambda name: not only or name in only  # noqa: E731
    if args.print:
        for name in cs["base"]:
            if want(name):
                print(f"=== {cs['prefix']}{name}.png  (attach: {', '.join(cs['references'])})\n{base_prompt(cs, name)}\n")
        for name, (base, instruction) in cs["edits"].items():
            if want(name):
                print(f"=== {cs['prefix']}{name}.png  (attach ONLY: {cs['prefix']}{base}.png)\n{edit_prompt(instruction)}\n")
        return 0
    key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not key:
        print("Set GEMINI_API_KEY (an AI Studio key with billing enabled), or use --print.")
        return 2
    refs = [_image_part(HERE / r) for r in cs["references"]]
    ok = True
    for name in cs["base"]:
        if want(name):
            ok &= _generate(args.model, key, [{"text": base_prompt(cs, name)}, *refs], HERE / f"{cs['prefix']}{name}.png")
    for name, (base, instruction) in cs["edits"].items():
        if not want(name):
            continue
        base_png = HERE / f"{cs['prefix']}{base}.png"
        if not base_png.exists():
            print(f"skip {name}: generate {base_png.name} first")
            ok = False
            continue
        ok &= _generate(args.model, key, [{"text": edit_prompt(instruction)}, _image_part(base_png)],
                        HERE / f"{cs['prefix']}{name}.png")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
