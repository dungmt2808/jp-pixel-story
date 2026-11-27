"""Stand-in raw walk-cycle sheets for the hanami demo (no image model in this environment).

Draws Yui and Minh full-body, side view facing right, in the same flat cartoon style as
raw_sheet_yui.png / raw_sheet_minh.png, at "AI generator" resolution on a green screen:

    cells 0-7 : walk cycle (contact, down, passing, up, then the other leg)
    cell  8   : standing (idle)
    cell  9   : standing, eyes closed (idle blink)

Like the other stand-ins it deliberately carries generator defects so the pipeline is exercised:
anti-aliased edges, a noisy green screen with green spill on the outline, and the character
drifting a few pixels between cells (`registration="centroid"` has to line them up).

    python3 art-src/hanami-first/standin_walk.py      # writes raw_walk_yui.png, raw_walk_minh.png

Replace these files with real generated sheets (prompts in PROMPTS-walk.md) and re-run
`pixellab_slice_spritesheet` with the same parameters (see assets/sprites/*_walk/provenance).
"""
from __future__ import annotations

import math
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

HERE = Path(__file__).resolve().parent
CELL_W, CELL_H = 256, 384
SS = 2  # draw at 2x, then downsample: anti-aliased edges like a generator's output
LINE = (42, 34, 45)

CHARACTERS = {
    "yui": {
        "skin": (246, 207, 176), "skin_shade": (220, 160, 124), "hair": (42, 34, 45), "hair_hi": (78, 66, 86),
        "top": (246, 235, 213), "top_shade": (213, 196, 168), "bottom": (233, 150, 168), "bottom_shade": (196, 112, 134),
        "legs": (246, 207, 176), "shoe": (122, 52, 58), "accent": (246, 168, 190), "hair_style": "bob", "skirt": True,
    },
    "minh": {
        "skin": (242, 199, 164), "skin_shade": (214, 152, 111), "hair": (66, 42, 30), "hair_hi": (104, 72, 52),
        "top": (53, 74, 129), "top_shade": (36, 48, 90), "bottom": (58, 62, 78), "bottom_shade": (40, 42, 54),
        "legs": (58, 62, 78), "shoe": (236, 232, 222), "accent": (236, 232, 222), "hair_style": "short", "skirt": False,
    },
}


def _limb(d: ImageDraw.ImageDraw, a: tuple[float, float], b: tuple[float, float], w: int, fill, outline=LINE) -> None:
    d.line([a, b], fill=outline, width=w + 10)
    for p in (a, b):
        r = (w + 10) / 2
        d.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill=outline)
    d.line([a, b], fill=fill, width=w)
    for p in (a, b):
        r = w / 2
        d.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill=fill)


def _leg(d, hip, thigh_deg, knee_bend, length, w, fill, shoe, k=SS):
    """Two-segment leg from the hip; angles in degrees from straight down, + = forward (right)."""
    t = math.radians(thigh_deg)
    knee = (hip[0] + math.sin(t) * length, hip[1] + math.cos(t) * length)
    s = math.radians(thigh_deg - knee_bend)
    foot = (knee[0] + math.sin(s) * length, knee[1] + math.cos(s) * length)
    _limb(d, hip, knee, w, fill)
    _limb(d, knee, foot, w, fill)
    fx, fy = foot
    d.rounded_rectangle([fx - 12 * k, fy - 9 * k, fx + 20 * k, fy + 7 * k], radius=7 * k, fill=shoe, outline=LINE, width=4 * k)
    return foot


def draw_pose(ch: dict, phase: float | None, blink: bool = False) -> Image.Image:
    """One cell. phase in [0, 1) walks; None stands still."""
    W, H = CELL_W * SS, CELL_H * SS
    img = Image.new("RGB", (W, H), (0, 253, 0))
    d = ImageDraw.Draw(img)
    k = SS
    walking = phase is not None
    p = (phase or 0.0) * 2 * math.pi
    swing = math.sin(p) * 30 if walking else 0.0
    bob = abs(math.sin(p)) * 7 if walking else 0.0  # lowest when the legs are spread
    leg_len = 46
    ground = 352
    hip = (128 * k, (ground - 2 * leg_len - 4 + bob) * k)

    def bend(sign: float) -> float:
        # the leg swinging forward lifts its foot (knee bends), the planted one stays straight
        return max(0.0, math.cos(p) * sign) * 38 if walking else 0.0

    # back leg (darker), back arm
    _leg(d, hip, -swing, bend(-1), leg_len * k, 15 * k, ch["bottom_shade"] if not ch["skirt"] else ch["skin_shade"], ch["shoe"])
    shoulder = (128 * k, hip[1] - 78 * k)
    a = math.radians(swing * 0.8)
    _limb(d, shoulder, (shoulder[0] + math.sin(a) * 60 * k, shoulder[1] + math.cos(a) * 60 * k), 18 * k // 2, ch["top_shade"])
    # front leg
    _leg(d, hip, swing, bend(1), leg_len * k, 15 * k, ch["legs"], ch["shoe"])
    # body
    body = [hip[0] - 36 * k, shoulder[1] - 8 * k, hip[0] + 36 * k, hip[1] + 10 * k]
    if ch["skirt"]:
        d.polygon([(hip[0] - 34 * k, hip[1] - 26 * k), (hip[0] + 34 * k, hip[1] - 26 * k),
                   (hip[0] + 46 * k, hip[1] + 26 * k), (hip[0] - 46 * k, hip[1] + 26 * k)],
                  fill=ch["bottom"], outline=LINE, width=5 * k)
        d.rounded_rectangle([body[0], body[1], body[2], hip[1] - 20 * k], radius=24 * k, fill=ch["top"], outline=LINE, width=5 * k)
        d.line([(hip[0] - 10 * k, body[1] + 6 * k), (hip[0] + 18 * k, hip[1] - 26 * k)], fill=ch["top_shade"], width=6 * k)
    else:
        d.rounded_rectangle([hip[0] - 34 * k, hip[1] - 20 * k, hip[0] + 34 * k, hip[1] + 14 * k], radius=10 * k,
                            fill=ch["bottom"], outline=LINE, width=5 * k)
        d.rounded_rectangle(body[:3] + [hip[1] - 4 * k], radius=24 * k, fill=ch["top"], outline=LINE, width=5 * k)
        d.line([(hip[0] + 22 * k, body[1] + 10 * k), (hip[0] + 22 * k, hip[1] - 16 * k)], fill=ch["top_shade"], width=8 * k)
        d.line([(hip[0] + 6 * k, body[1] + 4 * k), (hip[0] + 4 * k, body[1] + 40 * k)], fill=ch["accent"], width=4 * k)
    # head (side view, facing right)
    hc = (hip[0] + 6 * k, shoulder[1] - 64 * k)
    r = 66 * k
    d.ellipse([hc[0] - r, hc[1] - r, hc[0] + r, hc[1] + r], fill=ch["hair"], outline=LINE, width=5 * k)
    face = [hc[0] - r * 0.55, hc[1] - r * 0.55, hc[0] + r * 0.98, hc[1] + r * 0.92]
    d.ellipse(face, fill=ch["skin"])
    d.chord(face, 200, 340, fill=ch["hair"])  # fringe
    if ch["hair_style"] == "bob":
        d.pieslice([hc[0] - r * 1.08, hc[1] - r, hc[0] + r * 0.5, hc[1] + r * 1.12], 90, 270, fill=ch["hair"], outline=LINE, width=5 * k)
        d.ellipse([hc[0] - r * 0.1, hc[1] - r * 1.0, hc[0] + r * 0.35, hc[1] - r * 0.55], fill=ch["accent"], outline=LINE, width=3 * k)
    else:
        for i in range(3):  # short tufts on top, swept back
            x = hc[0] - r * 0.75 + i * r * 0.42
            d.polygon([(x, hc[1] - r * 0.7), (x - r * 0.12, hc[1] - r * 1.08), (x + r * 0.42, hc[1] - r * 0.86)], fill=ch["hair"])
    d.arc([hc[0] - r * 0.6, hc[1] - r * 0.9, hc[0] + r * 0.2, hc[1] - r * 0.3], 200, 300, fill=ch["hair_hi"], width=6 * k)
    if ch["hair_style"] != "bob":  # Yui's bob covers her ear
        ear = (hc[0] - r * 0.3, hc[1] + r * 0.18)
        d.ellipse([ear[0] - 9 * k, ear[1] - 12 * k, ear[0] + 9 * k, ear[1] + 12 * k], fill=ch["skin"], outline=LINE, width=4 * k)
        d.arc([ear[0] - 4 * k, ear[1] - 6 * k, ear[0] + 4 * k, ear[1] + 6 * k], 90, 270, fill=ch["skin_shade"], width=3 * k)
    eye = (hc[0] + r * 0.55, hc[1] + r * 0.12)
    if blink:
        d.arc([eye[0] - 12 * k, eye[1] - 8 * k, eye[0] + 12 * k, eye[1] + 10 * k], 200, 340, fill=LINE, width=5 * k)
    else:
        d.ellipse([eye[0] - 9 * k, eye[1] - 14 * k, eye[0] + 9 * k, eye[1] + 14 * k], fill=LINE)
        d.ellipse([eye[0] - 3 * k, eye[1] - 9 * k, eye[0] + 3 * k, eye[1] - 3 * k], fill=(255, 255, 255))
    d.ellipse([eye[0] - 18 * k, eye[1] + 16 * k, eye[0] + 2 * k, eye[1] + 26 * k], fill=(244, 160, 160))
    d.arc([eye[0] + 2 * k, eye[1] + 26 * k, eye[0] + 22 * k, eye[1] + 42 * k], 20, 160, fill=LINE, width=4 * k)
    # front arm last
    a = math.radians(-swing * 0.8)
    _limb(d, (shoulder[0] + 4 * k, shoulder[1] + 4 * k),
          (shoulder[0] + 4 * k + math.sin(a) * 60 * k, shoulder[1] + 4 * k + math.cos(a) * 60 * k), 18 * k // 2, ch["top"])
    return img.resize((CELL_W, CELL_H), Image.LANCZOS)


def make_sheet(name: str, seed: int) -> Path:
    ch = CHARACTERS[name]
    rnd = random.Random(seed)
    cells = [draw_pose(ch, i / 8) for i in range(8)] + [draw_pose(ch, None), draw_pose(ch, None, blink=True)]
    sheet = Image.new("RGB", (CELL_W * len(cells), CELL_H), (0, 253, 0))
    for i, cell in enumerate(cells):
        # generator drift: every cell sits a little off
        dx, dy = rnd.randint(-6, 6), rnd.randint(-4, 3)
        sheet.paste(cell, (i * CELL_W + dx, dy))
    # green spill on the outline + a noisy screen
    spill = sheet.filter(ImageFilter.GaussianBlur(1.2))
    sheet = Image.blend(sheet, spill, 0.12)
    px = sheet.load()
    for _ in range(sheet.width * sheet.height // 40):
        x, y = rnd.randrange(sheet.width), rnd.randrange(sheet.height)
        r, g, b = px[x, y]
        if g > 200 and r < 40:
            px[x, y] = (rnd.randint(0, 3), rnd.randint(250, 255), rnd.randint(0, 3))
    out = HERE / f"raw_walk_{name}.png"
    sheet.save(out)
    return out


if __name__ == "__main__":
    for i, who in enumerate(CHARACTERS):
        print(make_sheet(who, seed=11 + i))
