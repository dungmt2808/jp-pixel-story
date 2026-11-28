#!/usr/bin/env python3
"""Pose spike (Bước 0): generate ojiisan key poses + state edits with a Gemini image model.

    GEMINI_API_KEY=... python3 art-src/kasa-jizo/gen_poses.py [--model gemini-3-pro-image] [--only weave,bow]

Writes raw_pose_<name>.png next to this file. Base poses get the character's expression sheet + walk
sheet (identity) and a story background (style) as references; the `_b` / bow images are EDITS of a
base pose ("change only the hands"), the way the reference video makes its lever states. Prompts
are documented in PROMPTS-poses.md. Image models need a paid (billing-enabled) AI Studio key: the
free tier quota for them is 0 (HTTP 429). Standard library only.
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

STYLE = (
    "Cozy 16-bit Japanese retro adventure game pixel art (GBA / Eastward aesthetic). "
    "Warm dark espresso-brown outlines (#241712), never pure black. Crisp chunky pixel clusters, "
    "clean 3-tone cel shading, every pixel clearly visible. NO text, NO watermark, NO UI, NO blur."
)
CHARACTER = (
    "The SAME elderly Japanese grandfather as in the reference images: white hair tied in a small topknot, "
    "bushy white eyebrows, kind wrinkled face, brown patched quilted hanten jacket over a dark navy kimono, "
    "blue-and-white tenugui cloth tied at the neck, dark work trousers, straw sandals. Keep his face, hair, "
    "outfit colours and proportions identical to the references."
)
GREEN = (
    "Single character centred on a FLAT SOLID BRIGHT CHROMA GREEN (#00FF00) background, zero shadows, "
    "zero floor, zero props except the ones described. Full body visible with empty green margin."
)
REFS_NOTE = (
    "Reference 1: his expression sheet (identity). Reference 2: his full-body walk sheet (outfit and body "
    "proportions). Reference 3: a background of this story (match its pixel art style, outline colour and "
    "shading warmth, but do NOT draw the background)."
)
REFERENCES = ["raw_sheet_ojiisan_warm.png", "raw_walk_ojiisan.png", "raw_bg_hut_hearth.png"]

BASE_POSES = {
    "weave": (
        "Pose: he sits on his knees (seiza) on the floor, three-quarter view facing RIGHT, weaving a "
        "half-finished golden straw sugegasa hat that rests on his lap; both hands hold straw strands, "
        "head tilted down looking at his work with a gentle focused smile."
    ),
    "place_hat": (
        "Pose: he stands, side view facing RIGHT, both arms raised forward at shoulder height holding a golden "
        "straw sugegasa hat with both hands, as if gently placing it on the head of a small stone statue in "
        "front of him; kind tender expression."
    ),
    "stand": "Pose: he stands upright, side view facing RIGHT, hands relaxed at his sides, calm gentle smile.",
}
EDITS = {
    "weave_b": (
        "weave",
        "Edit this image. Keep EVERYTHING pixel-identical (face, eyes, hair, body, jacket, colours, position, "
        "background) EXCEPT his two hands and the straw strands: move his right hand outward, pulling a straw "
        "strand tight, the left hand holding the hat brim. Only the hands region may change.",
    ),
    "place_hat_b": (
        "place_hat",
        "Edit this image. Keep his head, face, body, legs and colours pixel-identical and in the same position. "
        "Change ONLY his arms and the hat: arms lowered and stretched further forward, the hat now held lower "
        "at chest height, as if it has just been set down. Background stays flat #00FF00.",
    ),
    "bow": (
        "stand",
        "Edit this image. Same character, same outfit, same colours, same feet position and same size. Change "
        "his pose to a polite Japanese bow (ojigi): upper body bent forward about 35 degrees from the hips, "
        "hands placed on the front of his thighs, eyes looking down. Background stays flat #00FF00.",
    ),
}


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
                      "enable billing for its AI Studio project, or use the Gemini app with PROMPTS-poses.md.")
                return False
            print(f"{dst.name}: HTTP {e.code} {' '.join(detail.split())[:300]}")
        except (urllib.error.URLError, TimeoutError, KeyError) as e:
            print(f"{dst.name}: attempt {attempt + 1} failed: {e}")
        time.sleep(5 * (attempt + 1))
    return False


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--model", default="gemini-3-pro-image")
    ap.add_argument("--only", default="", help="comma-separated names, e.g. weave,weave_b")
    args = ap.parse_args()
    key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not key:
        print("Set GEMINI_API_KEY (an AI Studio key with billing enabled).")
        return 2
    only = {n for n in args.only.split(",") if n}
    refs = [_image_part(HERE / r) for r in REFERENCES]
    ok = True
    for name, pose in BASE_POSES.items():
        if only and name not in only:
            continue
        prompt = f"{STYLE}\n{CHARACTER}\n{pose}\n{GREEN}\n{REFS_NOTE}"
        ok &= _generate(args.model, key, [{"text": prompt}, *refs], HERE / f"raw_pose_{name}.png")
    for name, (base, instruction) in EDITS.items():
        if only and name not in only:
            continue
        base_png = HERE / f"raw_pose_{base}.png"
        if not base_png.exists():
            print(f"skip {name}: generate raw_pose_{base}.png first")
            ok = False
            continue
        ok &= _generate(args.model, key, [{"text": f"{instruction}\n{STYLE}"}, _image_part(base_png)],
                        HERE / f"raw_pose_{name}.png")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
