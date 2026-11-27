"""Automated QA validator for Japanese stories (Furigana coverage, audio files, quiz bounds, catalog)."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

from palettes import PALETTES, get_palette_rgb
from pixel_quality import quality_metrics
from tts_spec import braced_to_plain, dokkai_sentence_spec, iter_story_lines, standalone_spec, story_line_spec

KANJI_RE = re.compile(r"[\u4e00-\u9faf]")
RUBY_BRACE_RE = re.compile(r"\{([^|}]+)\|([^}]+)\}")


# Names the cinema "vibe kit" understands (keep in sync with cinemaVibe.ts / audio/themes.ts).
VIBE_EMOTES = {"sweat", "anger", "heart", "sparkle", "shock", "question", "note", "dots", "gloom"}
VIBE_ACTIONS = {"hop", "bow", "startle", "shiver", "lean", "sway"}
VIBE_CAMERAS = {"push", "punch", "close", "shake", "pan_left", "pan_right"}
VIBE_SFX = {"pop", "ding", "whoosh", "boing", "shock", "sparkle", "thud", "gloom", "heart"}
VIBE_LIGHTS = {"day", "morning", "golden", "dusk", "night", "rain", "warm"}
VIBE_BGM = {"default", "depato_sunny", "depato_rain", "calm", "night", "happy", "bright", "sad", "tender", "rain", "none"}
MOTION_TYPES = {"scroll", "sweep", "glow", "shimmer", "steam", "mover", "rumble"}
PERSON_KINDS = {"dog", "bronze-dog", "sensei", "person", "stackchan"}
# the series mascot (web/src/engine/mascot/stackchan.ts)
MASCOT_MOODS = {"idle", "happy", "star", "sad", "think", "heart", "wink", "surprise", "cool", "cry", "kira", "pout", "sleep"}
MASCOT_WEAR = {"leaf", "hachimaki", "catears", "straw", "santa", "nonla", "grad", "crown", "glasses", "bandaid", "bow", "scarf", "bell"}
MASCOT_SHELLS = {"sky", "matcha", "sakura", "gold"}
PROC_SETS = {"shibuya", "shibuya_today", "konbini_skyline", "konbini_exterior", "konbini_interior", "konbini_counter", "konbini_closeup", "konbini_outro"}


def vocab_needles(v: dict[str, Any]) -> list[str]:
    """Spellings the reading page looks for (mirror of web/src/utils/readingText.ts vocabNeedles)."""
    base = re.sub(r"\s*[(（][^)）]*[)）]\s*", "", str(v.get("word", "")))
    base = re.split(r"[〜~]", base)[0].strip()
    out: list[str] = []
    for n in [*(v.get("forms") or []), base]:
        if n and n not in out:
            out.append(n)
    return out


def _check_ruby_segments(label: str, segs: str | list[dict[str, Any]], issues: list[str]) -> None:
    if isinstance(segs, str):
        for m in RUBY_BRACE_RE.finditer(segs):
            if not KANJI_RE.search(m.group(1)):
                issues.append(f"[Ruby on non-Kanji] {label}: '{m.group(1)}' -> '{m.group(2)}'")
        stripped = RUBY_BRACE_RE.sub("", segs)
        leftover = KANJI_RE.findall(stripped)
        if leftover:
            issues.append(f"[Missing Furigana] {label}: '{''.join(leftover)}'")
        return
    for seg in segs:
        text = str(seg.get("t", ""))
        reading = seg.get("r")
        if KANJI_RE.search(text) and not reading:
            issues.append(f"[Missing Furigana] {label}: '{text}'")
        if reading and not KANJI_RE.search(text):
            issues.append(f"[Ruby on non-Kanji] {label}: '{text}' -> '{reading}'")


def _off_palette_colors(png_path: Path, palette_name: str) -> int:
    """Number of distinct visible colours in an image that are NOT in the named palette."""
    allowed = {tuple(c) for c in get_palette_rgb(palette_name)}
    arr = np.array(Image.open(png_path).convert("RGBA"))
    visible = arr[arr[:, :, 3] > 0][:, :3]
    if len(visible) == 0:
        return 0
    used = {tuple(int(v) for v in c) for c in np.unique(visible, axis=0)}
    return len(used - allowed)


def _resolve_palette(story: dict[str, Any], catalog_entry: dict[str, Any] | None) -> str | None:
    """Declared palette of a story: story.json `palette`, else a catalog `theme` naming a palette."""
    name = story.get("palette")
    if not name and catalog_entry:
        theme = catalog_entry.get("theme")
        name = theme if theme in PALETTES else None
    if name in (None, "none"):
        return None
    return str(name)


DEFAULT_ART_QUALITY = {"outlineColor": "#241712", "minOutlineCompliance": 0.9, "maxOrphanRatio": 0.08}


ART_EXCEPTION_METRICS = {"outline", "noise", "colors"}


def _check_art_quality(
    sprite_pngs: dict[str, Path],
    public_root: Path,
    art_quality: dict[str, Any] | None,
    issues: list[str],
    warnings: list[str],
    stats: dict[str, int],
    exceptions: dict[str, Any] | None = None,
) -> None:
    """Sprite craft quality. Stories declaring `artQuality` are strict (issues); others get warnings.

    `exceptions` (story `artExceptions`): { "<url of the sprite>": { "noise": "why this is fine" } } —
    a reviewed decision that a metric does not apply to one sprite (a woven texture IS isolated
    pixels). Each needs a written reason; it is counted in stats, never silently dropped.
    """
    rules = {**DEFAULT_ART_QUALITY, **(art_quality or {})}
    sink = issues if art_quality else warnings
    by_path = {
        (public_root / str(url).lstrip("/")).resolve(): spec for url, spec in (exceptions or {}).items()
    }
    for fp in sprite_pngs.values():
        with Image.open(fp) as im:
            if im.mode != "RGBA" or im.getextrema()[3][0] == 255:
                continue  # not a cut-out sprite
            q = quality_metrics(im, rules["outlineColor"])
        stats["sprites_quality_checked"] = stats.get("sprites_quality_checked", 0) + 1
        rel = fp.relative_to(public_root) if fp.is_relative_to(public_root) else fp
        excused = by_path.get(fp.resolve()) or {}
        for metric in list(excused):
            if metric not in ART_EXCEPTION_METRICS or not str(excused[metric]).strip():
                sink.append(f"[Art Exception] {rel}: '{metric}' needs one of {sorted(ART_EXCEPTION_METRICS)} and a written reason")
                excused = {k: v for k, v in excused.items() if k != metric}
        if excused:
            stats["art_exceptions"] = stats.get("art_exceptions", 0) + len(excused)
        if q["outline_compliance"] < rules["minOutlineCompliance"] and "outline" not in excused:
            sink.append(
                f"[Outline] {rel}: {q['outline_compliance'] * 100:.0f}% of the silhouette uses {rules['outlineColor']} "
                f"(< {rules['minOutlineCompliance'] * 100:.0f}%; run pixellab_cleanup_sprite)"
            )
        if q["orphan_ratio"] > rules["maxOrphanRatio"] and "noise" not in excused:
            sink.append(f"[Noise] {rel}: {q['orphan_ratio'] * 100:.1f}% isolated pixels (> {rules['maxOrphanRatio'] * 100:.0f}%)")
        if rules.get("maxColorsPerSprite") and q["colors"] > rules["maxColorsPerSprite"] and "colors" not in excused:
            sink.append(f"[Colors] {rel}: {q['colors']} colours (> {rules['maxColorsPerSprite']})")


def _check_story_assets(
    data: dict[str, Any],
    sdir: Path,
    public_root: Path,
    catalog_entry: dict[str, Any] | None,
    issues: list[str],
    stats: dict[str, int],
    warnings: list[str] | None = None,
) -> None:
    """Every referenced asset exists, sprite metas are consistent, and PNGs obey the palette lock."""
    palette = _resolve_palette(data, catalog_entry)
    if data.get("palette") and data["palette"] != "none" and data["palette"] not in PALETTES:
        issues.append(f"[Unknown Palette] story.json palette '{data['palette']}' is not in palettes.py")
        palette = None

    pngs: dict[str, Path] = {}
    sprite_pngs: dict[str, Path] = {}
    assets = data.get("assets") or {}
    for group in ("backgrounds", "portraits", "items"):
        for key, url in (assets.get(group) or {}).items():
            fp = public_root / str(url).lstrip("/")
            if not fp.exists():
                issues.append(f"[Missing Asset] {group}/{key}: {url}")
            elif fp.suffix.lower() == ".png":
                pngs[str(fp)] = fp
    if assets.get("cardPortrait"):
        fp = public_root / str(assets["cardPortrait"]).lstrip("/")
        if not fp.exists():
            issues.append(f"[Missing Asset] cardPortrait: {assets['cardPortrait']}")

    for key, url in (assets.get("sprites") or {}).items():
        meta_fp = public_root / str(url).lstrip("/")
        if not meta_fp.exists():
            issues.append(f"[Missing Sprite Meta] sprites/{key}: {url}")
            continue
        meta = json.loads(meta_fp.read_text(encoding="utf-8"))
        sheet_fp = meta_fp.parent / meta.get("spritesheet", "spritesheet.png")
        if not sheet_fp.exists():
            issues.append(f"[Missing Spritesheet] sprites/{key}: {sheet_fp.name}")
            continue
        fw, fh, n = int(meta.get("frameWidth", 0)), int(meta.get("frameHeight", 0)), int(meta.get("frameCount", 0))
        with Image.open(sheet_fp) as im:
            if im.size != (fw * n, fh):
                issues.append(f"[Spritesheet Size Mismatch] sprites/{key}: {im.size} != {(fw * n, fh)}")
        for clip, spec in (meta.get("clips") or {}).items():
            frames = spec.get("frames", []) if isinstance(spec, dict) else spec
            if not frames or any(not (0 <= int(f) < n) for f in frames):
                issues.append(f"[Invalid Sprite Clip] sprites/{key}.{clip}: {frames} (frameCount={n})")
        if meta.get("palette") and palette and meta["palette"] != palette:
            issues.append(f"[Sprite Palette Mismatch] sprites/{key}: '{meta['palette']}' != story '{palette}'")
        pngs[str(sheet_fp)] = sheet_fp
        sprite_pngs[str(sheet_fp)] = sheet_fp

    for key, url in (assets.get("rigs") or {}).items():
        rig_fp = public_root / str(url).lstrip("/")
        if not rig_fp.exists():
            issues.append(f"[Missing Rig] rigs/{key}: {url}")
            continue
        rig = json.loads(rig_fp.read_text(encoding="utf-8"))
        body_fp = rig_fp.parent / rig.get("body", {}).get("image", "body.png")
        head_fp = rig_fp.parent / rig.get("head", {}).get("sheet", "head.png")
        if not body_fp.exists() or not head_fp.exists():
            issues.append(f"[Missing Rig Part] rigs/{key}: body/head image not found")
            continue
        fw, fh = int(rig.get("frameWidth", 0)), int(rig.get("frameHeight", 0))
        n, hh = int(rig["head"].get("frameCount", 0)), int(rig["head"].get("frameHeight", 0))
        with Image.open(body_fp) as b, Image.open(head_fp) as h:
            if b.size != (fw, fh) or h.size != (fw * n, hh):
                issues.append(f"[Rig Size Mismatch] rigs/{key}: body {b.size} / head {h.size} vs {fw}x{fh}, {n} head frames")
        for clip, spec in (rig.get("clips") or {}).items():
            frames = spec.get("frames", []) if isinstance(spec, dict) else spec
            if not frames or any(not (0 <= int(f) < n) for f in frames):
                issues.append(f"[Invalid Rig Clip] rigs/{key}.{clip}: {frames} (head frames={n})")
        for fp in (body_fp, head_fp):
            # palette-checked; craft quality is judged on the source spritesheet (the neck cut of
            # body.png is a hidden seam, not a silhouette edge that needs an outline)
            pngs[str(fp)] = fp

    for group in ("portraits", "items"):
        for url in (assets.get(group) or {}).values():
            fp = public_root / str(url).lstrip("/")
            if fp.exists() and fp.suffix.lower() == ".png":
                sprite_pngs[str(fp)] = fp
    if warnings is not None:
        _check_art_quality(
            sprite_pngs, public_root, data.get("artQuality"), issues, warnings, stats, data.get("artExceptions")
        )
        for url in data.get("artExceptions") or {}:
            if str(public_root / str(url).lstrip("/")) not in {str(p) for p in sprite_pngs.values()}:
                warnings.append(f"[Art Exception] '{url}' is not a portrait or item of this story")
        _check_provenance(pngs, warnings, stats)

    assets_dir = sdir / "assets"
    if assets_dir.is_dir():
        for fp in sorted(assets_dir.rglob("*.png")):
            if fp.name.startswith("frame_"):
                continue  # individual frames are already covered by their spritesheet.png
            pngs.setdefault(str(fp), fp)

    if not palette:
        return
    for fp in pngs.values():
        stats["palette_assets_checked"] = stats.get("palette_assets_checked", 0) + 1
        off = _off_palette_colors(fp, palette)
        if off:
            rel = fp.relative_to(public_root) if fp.is_relative_to(public_root) else fp
            issues.append(
                f"[Off-Palette Asset] {rel}: {off} colours outside '{palette}' "
                "(re-run pixellab_clean_* with this palette)"
            )


def _check_provenance(pngs: dict[str, Path], warnings: list[str], stats: dict[str, int]) -> None:
    """Count assets with a provenance record; warn (never fail) about the ones without."""
    missing = 0
    for fp in pngs.values():
        found = False
        for parent in (fp.parent, fp.parent.parent):
            mf = parent / "provenance.json"
            if mf.exists():
                assets = json.loads(mf.read_text(encoding="utf-8")).get("assets", {})
                key = fp.name if parent == fp.parent else fp.parent.name
                if key in assets:
                    found = True
                    break
        if found:
            stats["assets_with_provenance"] = stats.get("assets_with_provenance", 0) + 1
        else:
            missing += 1
    if missing:
        warnings.append(f"[No Provenance] {missing} asset(s) have no provenance.json record (cannot be rebuilt exactly)")


def _check_tts_hash(label: str, obj: dict[str, Any], spec: Any, issues: list[str], stats: dict[str, int]) -> None:
    stored = obj.get("ttsHash")
    if not stored or spec is None:
        return
    stats["tts_hash_checked"] = stats.get("tts_hash_checked", 0) + 1
    if spec.fingerprint() != stored:
        issues.append(
            f"[Stale Audio] {label}: text/voice changed since the clip was synthesized "
            "(re-run the voicevox_generate_* tool)"
        )


def validate_story_folder(
    story_dir: str | Path,
    *,
    web_public_dir: str | Path | None = None,
) -> dict[str, Any]:
    """Validate Furigana completeness, audio files, quiz answers, and dictation readiness."""
    sdir = Path(story_dir).expanduser().resolve()
    public_root = (
        Path(web_public_dir).expanduser().resolve()
        if web_public_dir
        else sdir.parent.parent
    )
    issues: list[str] = []
    warnings: list[str] = []
    stats: dict[str, int] = {"audio_checked": 0, "kanji_blocks_checked": 0}

    def check_audio_ref(label: str, audio_url: str | None) -> None:
        if not audio_url:
            issues.append(f"[Missing audioUrl] {label}")
            return
        fp = public_root / audio_url.lstrip("/")
        if not fp.exists() or fp.stat().st_size < 500:
            issues.append(f"[Missing/Empty Audio] {label}: {audio_url}")
        else:
            stats["audio_checked"] += 1

    story_json = sdir / "story.json"
    dictation_json = sdir / "dictation.json"
    choukai_json = sdir / "choukai.json"
    dokkai_json = sdir / "dokkai.json"
    gengo_json = sdir / "gengo.json"
    standalone_html = sdir / "index.html"

    index_file = sdir.parent / "index.json"
    catalog_entry: dict[str, Any] | None = None
    if index_file.exists():
        for entry in json.loads(index_file.read_text(encoding="utf-8")).get("stories", []):
            if entry.get("id") == sdir.name:
                catalog_entry = entry

    if story_json.exists():
        data = json.loads(story_json.read_text(encoding="utf-8"))
        _check_story_assets(data, sdir, public_root, catalog_entry, issues, stats, warnings)
        voices = data.get("voices", {})
        for line, default_id in iter_story_lines(data):
            _check_tts_hash(f"story/{line.get('id') or default_id}", line, story_line_spec(line, voices), issues, stats)
        for sc in data.get("scenes", []):
            for ln in sc.get("lines", []):
                stats["kanji_blocks_checked"] += 1
                _check_ruby_segments(f"{sc['id']}/{ln['id']}", ln.get("jaRuby", []), issues)
                check_audio_ref(f"{sc['id']}/{ln['id']}", ln.get("audioUrl"))
            inter = sc.get("interaction")
            if isinstance(inter, dict):
                extra = [("done", inter.get("doneLine"))] + [
                    (f"done{i + 1}", ln) for i, ln in enumerate(inter.get("doneLines") or [])
                ] + [
                    (f"spot{i}", sp.get("line")) for i, sp in enumerate(inter.get("spots") or [])
                ]
                for tag, ln in extra:
                    if isinstance(ln, dict):
                        stats["kanji_blocks_checked"] += 1
                        _check_ruby_segments(f"{sc['id']}/{tag}", ln.get("jaRuby", []), issues)
                        check_audio_ref(f"{sc['id']}/{tag}", ln.get("audioUrl"))
                texts = [it.get("label") for it in inter.get("items") or []]
                texts += [sp.get("label") for sp in inter.get("spots") or []]
                texts += [(inter.get("hold") or {}).get("label")]
                for i, txt in enumerate(x for x in texts if x):
                    _check_ruby_segments(f"{sc['id']}/interaction.label[{i}]", txt, issues)
                for key, grp in (("items", inter.get("items") or []), ("spots", inter.get("spots") or [])):
                    for it in grp:
                        ref = it.get("item")
                        if ref and ref not in ((data.get("assets") or {}).get("items") or {}):
                            issues.append(f"[Missing Item] {sc['id']}/{key}: '{ref}' is not in assets.items")
                hold_item = (inter.get("hold") or {}).get("item")
                if hold_item and hold_item not in ((data.get("assets") or {}).get("items") or {}):
                    issues.append(f"[Missing Item] {sc['id']}/hold: '{hold_item}' is not in assets.items")
            for i, lab in enumerate(sc.get("labels") or []):
                _check_ruby_segments(f"{sc['id']}/labels[{i}]", lab.get("text", ""), issues)
            if sc.get("summary"):
                _check_ruby_segments(f"{sc['id']}/summary", sc["summary"], issues)
            if (sc.get("titleCard") or {}).get("title"):
                _check_ruby_segments(f"{sc['id']}/titleCard", sc["titleCard"]["title"], issues)
            mg = sc.get("minigame")
            if isinstance(mg, dict):
                for ch in mg.get("choices", []):
                    if ch.get("labelRuby"):
                        _check_ruby_segments(f"{sc['id']}/{ch['id']}.label", ch["labelRuby"], issues)
                    rl = ch.get("responseLine")
                    if isinstance(rl, dict):
                        _check_ruby_segments(f"{sc['id']}/{ch['id']}.resp", rl.get("jaRuby", []), issues)
                        check_audio_ref(f"{sc['id']}/{ch['id']}.resp", rl.get("audioUrl"))

        # vibe kit (web/src/engine/cinemaVibe.ts + web/src/audio/themes.ts)
        for line, default_id in iter_story_lines(data):
            lid = line.get("id", default_id)
            if line.get("emote") and line["emote"] not in VIBE_EMOTES:
                issues.append(f"[Unknown Emote] {lid}: '{line['emote']}' (use one of {sorted(VIBE_EMOTES)})")
            if line.get("action") and line["action"] not in VIBE_ACTIONS:
                issues.append(f"[Unknown Action] {lid}: '{line['action']}' (use one of {sorted(VIBE_ACTIONS)})")
            if line.get("actionSide") and line["actionSide"] not in ("left", "right"):
                issues.append(f"[Unknown Side] {lid}/actionSide: '{line['actionSide']}' (use 'left' or 'right')")
            if line.get("camera") and line["camera"] not in VIBE_CAMERAS:
                issues.append(f"[Unknown Camera] {lid}: '{line['camera']}' (use one of {sorted(VIBE_CAMERAS)})")
            if line.get("sfx") and line["sfx"] not in VIBE_SFX | {"none"}:
                issues.append(f"[Unknown SFX] {lid}: '{line['sfx']}' (use one of {sorted(VIBE_SFX)} or 'none')")
            telop = line.get("telop")
            if telop:
                text = telop if isinstance(telop, str) else telop.get("text", "")
                _check_ruby_segments(f"{lid}/telop", text, issues)
            assets_map = data.get("assets") or {}
            actor_keys = (
                set((assets_map.get("portraits") or {}).keys())
                | set((assets_map.get("sprites") or {}).keys())
                | set((assets_map.get("rigs") or {}).keys())
            )
            for side, key in (line.get("castPortrait") or {}).items():
                if side not in ("left", "right"):
                    issues.append(f"[Unknown Side] {lid}/castPortrait: '{side}' (use 'left' or 'right')")
                elif key not in actor_keys:
                    issues.append(f"[Missing Portrait] {lid}/castPortrait.{side}: '{key}' is not in assets.portraits/sprites/rigs")
            if line.get("bgm") and line["bgm"] not in VIBE_BGM:
                warnings.append(f"[Unknown BGM] {lid}: '{line['bgm']}' falls back to 'default'")
            for side in line.get("castExit") or []:
                if side not in ("left", "right"):
                    issues.append(f"[Unknown Side] {lid}/castExit: '{side}' (use 'left' or 'right')")
        # the series mascot: kind, wardrobe, tips
        def _check_wear(where: str, wear: Any) -> None:
            for slot, item in (wear or {}).items():
                if slot == "shell":
                    if item not in MASCOT_SHELLS:
                        issues.append(f"[Mascot] {where}: shell '{item}' (use one of {sorted(MASCOT_SHELLS)})")
                elif slot not in ("head", "face", "neck"):
                    issues.append(f"[Mascot] {where}: wear slot '{slot}' (head, face, neck, shell)")
                elif item not in MASCOT_WEAR:
                    issues.append(f"[Mascot] {where}: wear '{item}' (use one of {sorted(MASCOT_WEAR)})")

        mascot = data.get("mascot")
        if mascot is not None:
            if mascot.get("kind") != "stackchan":
                issues.append(f"[Mascot] kind '{mascot.get('kind')}' (only 'stackchan')")
            _check_wear("mascot", mascot.get("wear"))
        for sc in data.get("scenes", []):
            sid = sc.get("id", "?")
            n_lines = len(sc.get("lines") or [])
            if sc.get("tips") and mascot is None:
                issues.append(f"[Mascot] {sid}: scene tips need a story `mascot`")
            for ti, tp in enumerate(sc.get("tips") or []):
                after = tp.get("after", -1)
                if not isinstance(after, int) or not -1 <= after < n_lines:
                    issues.append(f"[Mascot] {sid}/tips[{ti}]: after {after} (lines are 0..{n_lines - 1}, -1 = first)")
                if tp.get("who") and tp["who"] not in (sc.get("people") or {}):
                    issues.append(f"[Mascot] {sid}/tips[{ti}]: who '{tp['who']}' is not in scene.people")
                if tp.get("mood") and tp["mood"] not in MASCOT_MOODS:
                    issues.append(f"[Mascot] {sid}/tips[{ti}]: mood '{tp['mood']}' (use one of {sorted(MASCOT_MOODS)})")
                _check_ruby_segments(f"{sid}/tips[{ti}].text", tp.get("text", ""), issues)
                if tp.get("ja"):
                    _check_ruby_segments(f"{sid}/tips[{ti}].ja", tp["ja"], issues)
            for pid, pdef in (sc.get("people") or {}).items():
                if pdef.get("kind") == "stackchan":
                    _check_wear(f"{sid}/{pid}", pdef.get("wear"))
            for side, actor in (sc.get("cast") or {}).items():
                if isinstance(actor, dict) and actor.get("mascot"):
                    _check_wear(f"{sid}/cast.{side}", actor.get("wear"))
        for side, actor in (data.get("cast") or {}).items():
            if isinstance(actor, dict) and actor.get("mascot"):
                if actor["mascot"] != "stackchan":
                    issues.append(f"[Mascot] cast.{side}: mascot '{actor['mascot']}' (only 'stackchan')")
                _check_wear(f"cast.{side}", actor.get("wear"))
        for line, default_id in iter_story_lines(data):
            if line.get("mascotMood") and line["mascotMood"] not in MASCOT_MOODS:
                issues.append(f"[Mascot] {line.get('id', default_id)}: mascotMood '{line['mascotMood']}'")

        # cast (story-wide and per scene): portraits/sprites/rigs must exist
        if data.get("engine") == "cinema":
            assets_map = data.get("assets") or {}
            actor_keys = (
                set((assets_map.get("portraits") or {}).keys())
                | set((assets_map.get("sprites") or {}).keys())
                | set((assets_map.get("rigs") or {}).keys())
            )
            casts = [("cast", data.get("cast") or {})] + [
                (f"{sc.get('id', '?')}/cast", sc.get("cast") or {}) for sc in data.get("scenes", [])
            ]
            for where, cast in casts:
                for side, actor in cast.items():
                    if side not in ("left", "right"):
                        issues.append(f"[Unknown Side] {where}: '{side}' (use 'left' or 'right')")
                    elif isinstance(actor, dict) and actor.get("portrait") and actor["portrait"] not in actor_keys:
                        issues.append(f"[Missing Portrait] {where}.{side}: '{actor['portrait']}' is not in assets.portraits/sprites/rigs")
        # style consistency: painted pixel backgrounds and code-drawn (proc:) backdrops look like
        # two different worlds in one video, so mixing them is flagged
        if data.get("engine") == "cinema":
            refs: list[tuple[str, str]] = []
            for sc in data.get("scenes", []):
                if sc.get("backdrop"):
                    refs.append((sc.get("id", "?"), sc["backdrop"]))
                for ch in (sc.get("minigame") or {}).get("choices", []) or []:
                    if ch.get("backdrop"):
                        refs.append((f"{sc.get('id', '?')}/{ch.get('id', '?')}", ch["backdrop"]))
            painted = [r for r in refs if r[1].startswith("bg:")]
            coded = [r for r in refs if r[1].startswith(("proc:", "set:"))]
            if painted and coded and not (data.get("look") or {}).get("allowMixedBackdrops"):
                warnings.append(
                    "[Style Mix] painted backgrounds (" + ", ".join(sorted({r[1] for r in painted})) + ") and code-drawn "
                    "backdrops (" + ", ".join(f"{sid}: {ref}" for sid, ref in coded) + ") in one story; replace the proc: "
                    "scenes with pixel backgrounds from the same art source (see art-src/<story>/PROMPTS.md)"
                )

        # route C motion layers (web/src/engine/sceneMotion.ts)
        items = (data.get("assets") or {}).get("items") or {}
        backgrounds = (data.get("assets") or {}).get("backgrounds") or {}

        def check_motion(where_prefix: str, fxs: list[dict[str, Any]], painted: bool) -> None:
            for i, fx in enumerate(fxs or []):
                where = f"{where_prefix}[{i}]"
                kind = fx.get("type")
                if kind not in MOTION_TYPES:
                    issues.append(f"[Unknown Motion] {where}: '{kind}' (use one of {sorted(MOTION_TYPES)})")
                    continue
                rects = list(fx.get("rects") or []) + ([fx["rect"]] if fx.get("rect") else []) + list(fx.get("front") or [])
                for r in rects:
                    if len(r) != 4 or r[2] <= 0 or r[3] <= 0 or r[0] < 0 or r[1] < 0 or r[0] + r[2] > 320 or r[1] + r[3] > 200:
                        issues.append(f"[Bad Motion Rect] {where}: {r} must lie inside the 320x200 frame")
                if kind == "mover" and fx.get("item") not in items:
                    issues.append(f"[Missing Asset] {where}: mover item '{fx.get('item')}' is not in assets.items")
                if kind in ("scroll", "mover") and not painted:
                    warnings.append(f"[Motion Needs Painting] {where}: '{kind}' samples the painted bg: backdrop")

        # route B: people + cues (web/src/engine/people.ts, cues.ts) and code-drawn set: backdrops
        for sc in data.get("scenes", []):
            people = sc.get("people") or {}
            for pid, pdef in people.items():
                kind = str(pdef.get("kind", ""))
                if kind not in PERSON_KINDS and not kind.startswith("sprite:"):
                    issues.append(f"[Unknown Person] {sc.get('id')}/{pid}: kind '{kind}' (use {sorted(PERSON_KINDS)} or sprite:<key>)")
                sprite_url = ((data.get("assets") or {}).get("sprites") or {}).get(kind[7:]) if kind.startswith("sprite:") else None
                if kind.startswith("sprite:") and not sprite_url:
                    issues.append(f"[Missing Asset] {sc.get('id')}/{pid}: sprite '{kind[7:]}' is not in assets.sprites")
                if sprite_url:
                    meta_fp = public_root / str(sprite_url).lstrip("/")
                    clips = json.loads(meta_fp.read_text(encoding="utf-8")).get("clips", {}) if meta_fp.exists() else {}
                    walks = any(
                        mv.get("who") == pid and mv.get("walkTo") is not None
                        for cue in sc.get("cues") or [] for mv in cue.get("people") or []
                    ) or pdef.get("pose") in ("walk", "run")
                    if "idle" not in clips:
                        warnings.append(f"[Sprite Clips] {sc.get('id')}/{pid}: '{kind[7:]}' has no 'idle' clip (standing still)")
                    if walks and "walk" not in clips:
                        warnings.append(f"[Sprite Clips] {sc.get('id')}/{pid}: walks but '{kind[7:]}' has no 'walk' clip")
                    elif walks and not (clips.get("walk") or {}).get("stridePx"):
                        warnings.append(
                            f"[Foot Slide] {sc.get('id')}/{pid}: the 'walk' clip of '{kind[7:]}' has no stridePx "
                            "(px per cycle), so frames follow time and the feet slide"
                        )
            # the same character twice: a bust portrait on stage AND its walking sprite in the shot
            if people and data.get("engine") == "cinema":
                kind_of = str(sc.get("type", ""))
                default_sides = [] if kind_of == "cinema_intro" else ["left"] if kind_of == "cinema_outro" else ["left", "right"]
                sides = sc.get("actors", default_sides)
                cast = {**(data.get("cast") or {}), **(sc.get("cast") or {})}
                names = {side: {str(cast[side].get("voice", "")), str(cast[side].get("portrait", ""))} - {""}
                         for side in sides if isinstance(cast.get(side), dict)}
                for pid, pdef in people.items():
                    kind = str(pdef.get("kind", ""))
                    if not kind.startswith("sprite:"):
                        continue
                    stem = kind[7:].removesuffix("_walk")
                    for side, ids in names.items():
                        if stem in ids or pid in ids or any(i.startswith(stem + "_") for i in ids):
                            warnings.append(
                                f"[Double Character] {sc.get('id')}: '{pid}' walks in the shot while the {side} portrait "
                                f"is the same character; set `actors` without '{side}' (use `emoteWho` for the reactions)"
                            )
            n_lines = len(sc.get("lines") or [])
            inter = sc.get("interaction") or {}
            n_done = (1 if inter.get("doneLine") else 0) + len(inter.get("doneLines") or [])
            for ci, cue in enumerate(sc.get("cues") or []):
                where = f"{sc.get('id')}/cues[{ci}]"
                if "line" in cue and not 0 <= int(cue["line"]) < n_lines:
                    issues.append(f"[Bad Cue] {where}: line {cue['line']} does not exist ({n_lines} lines)")
                if "doneLine" in cue and not 0 <= int(cue["doneLine"]) < n_done:
                    issues.append(f"[Bad Cue] {where}: doneLine {cue['doneLine']} does not exist ({n_done} done-lines)")
                if cue.get("done") and not inter:
                    issues.append(f"[Bad Cue] {where}: 'done' needs a scene interaction")
                for mv in cue.get("people") or []:
                    if mv.get("who") not in people:
                        issues.append(f"[Bad Cue] {where}: person '{mv.get('who')}' is not in scene.people")
            for item in inter.get("items") or []:
                if item.get("person") and item["person"] not in people:
                    issues.append(f"[Bad Interaction] {sc.get('id')}: drag person '{item['person']}' is not in scene.people")
            for ln in [*(sc.get("lines") or []), *(inter.get("doneLines") or []), *([inter["doneLine"]] if inter.get("doneLine") else [])]:
                if ln.get("emoteWho") and ln["emoteWho"] not in people:
                    issues.append(f"[Bad Cue] {sc.get('id')}/{ln.get('id')}: emoteWho '{ln['emoteWho']}' is not in scene.people")
            bd = str(sc.get("backdrop", ""))
            if bd.startswith("set:") and bd[4:] not in PROC_SETS:
                issues.append(f"[Unknown Set] {sc.get('id')}: '{bd}' (known: {sorted(PROC_SETS)})")

        for key, fxs in (data.get("backdropMotion") or {}).items():
            if key not in backgrounds:
                issues.append(f"[Bad Backdrop Motion] '{key}' is not in assets.backgrounds")
            check_motion(f"backdropMotion.{key}", fxs, True)
        for sc in data.get("scenes", []):
            check_motion(f"{sc.get('id')}/motion", sc.get("motion") or [], str(sc.get("backdrop", "")).startswith("bg:"))

        for sc in data.get("scenes", []):
            if sc.get("light") and sc["light"] not in VIBE_LIGHTS:
                issues.append(f"[Unknown Light] {sc.get('id')}: '{sc['light']}' (use one of {sorted(VIBE_LIGHTS)})")
            if sc.get("bgm") and sc["bgm"] not in VIBE_BGM:
                warnings.append(f"[Unknown BGM] {sc.get('id')}: '{sc['bgm']}' falls back to 'default'")

        card = data.get("characterCard") or {}
        card_issues: list[str] = []
        for key in ("nameJa", "subtitle"):
            if card.get(key):
                _check_ruby_segments(f"characterCard.{key}", card[key], card_issues)
        for i, fact in enumerate(card.get("facts") or []):
            _check_ruby_segments(f"characterCard.facts[{i}]", fact.get("value", ""), card_issues)
        # strict for stories that opt into the v2 quality gate, a warning for legacy cards
        (issues if data.get("artQuality") else warnings).extend(card_issues)

        reading = data.get("reading", {})
        for sent in reading.get("sentences", []):
            stats["kanji_blocks_checked"] += 1
            _check_ruby_segments(f"reading/{sent['id']}", sent.get("jaRuby", []), issues)
            check_audio_ref(f"reading/{sent['id']}", sent.get("audioUrl"))
        for g in reading.get("grammar", []):
            if g.get("exampleRuby"):
                _check_ruby_segments(f"grammar/{g['id']}", g["exampleRuby"], issues)
        for q in reading.get("quiz", []):
            _check_ruby_segments(f"quiz/{q['id']}", q.get("questionJa", []), issues)
            opts = q.get("options", [])
            for oi, opt in enumerate(opts):
                _check_ruby_segments(f"quiz/{q['id']}/opt{oi}", opt.get("ja", []), issues)
            cidx = q.get("correctIndex", -1)
            if not (0 <= cidx < len(opts)):
                issues.append(f"[Invalid quiz correctIndex] {q['id']}: {cidx}")

        # reading page v2: chapters + tappable vocab
        sent_ids = {sent.get("id") for sent in reading.get("sentences", [])}
        scene_ids = {sc.get("id") for sc in data.get("scenes", [])}
        for ch in reading.get("chapters", []) or []:
            cid = ch.get("id", "?")
            _check_ruby_segments(f"reading.chapter/{cid}", ch.get("title", ""), issues)
            unknown = [sid for sid in ch.get("sentenceIds", []) if sid not in sent_ids]
            if unknown or not ch.get("sentenceIds"):
                issues.append(f"[Bad Reading Chapter] {cid}: unknown/empty sentenceIds {unknown}")
            if ch.get("scene") and ch["scene"] not in scene_ids:
                issues.append(f"[Bad Reading Chapter] {cid}: unknown scene '{ch['scene']}'")
            if ch.get("image") and not (public_root / ch["image"].lstrip("/")).exists():
                issues.append(f"[Missing Asset] reading.chapter/{cid}: {ch['image']}")
        def _plain(ruby: Any) -> str:
            if isinstance(ruby, list):
                return "".join(str(seg.get("t", "")) for seg in ruby if isinstance(seg, dict))
            return braced_to_plain(str(ruby or ""))

        plain_text = "".join(_plain(sent.get("jaRuby")) for sent in reading.get("sentences", []))
        # words met in the animation count too: they stay reachable from the word list
        spoken = "".join(_plain(ln.get("jaRuby")) for ln, _ in iter_story_lines({"scenes": data.get("scenes", [])}))
        spoken += str(data.get("titleJa", "")) + "".join(
            _plain((sc.get("titleCard") or {}).get("title", "")) for sc in data.get("scenes", [])
        )
        # the reader v2 for every animated story: chapters linked to scenes, Hán Việt on kanji words
        vocab_ids = {v.get("id") for v in reading.get("vocab", [])}
        for sent in reading.get("sentences", []):
            dangling = [i for i in sent.get("highlightVocabIds") or [] if i not in vocab_ids]
            if dangling:
                issues.append(f"[Unknown Vocab] reading/{sent.get('id')}: highlightVocabIds {dangling} are not in reading.vocab")
        if data.get("engine") == "cinema" and reading.get("sentences") and not reading.get("chapters"):
            warnings.append(
                "[No Chapters] the reading page shows one long chapter: split reading.sentences into "
                "`chapters` (title, titleVi, sentenceIds, scene) so each has its picture and a 'watch again' link"
            )
        if data.get("engine") == "cinema":
            for v in reading.get("vocab", []):
                if not v.get("hanViet") and any(KANJI_RE.search(n) for n in vocab_needles(v)):
                    warnings.append(f"[No Hán Việt] {v.get('id')}: '{v.get('word')}' is written with kanji; add `hanViet`")
        for v in reading.get("vocab", []):
            needles = vocab_needles(v)
            if not any(n in plain_text or n in spoken for n in needles):
                warnings.append(f"[Vocab Not In Text] {v.get('id')}: '{v.get('word')}' appears neither in the reading nor in the dialogue (add `forms` or drop it)")

    if dictation_json.exists():
        ddata = json.loads(dictation_json.read_text(encoding="utf-8"))
        for it in ddata.get("items", []):
            stats["kanji_blocks_checked"] += 1
            _check_ruby_segments(f"dictation/{it['id']}", it.get("jaRuby", []), issues)
            check_audio_ref(f"dictation/{it['id']}", it.get("audioUrl"))

    if choukai_json.exists():
        cdata = json.loads(choukai_json.read_text(encoding="utf-8"))
        for q in cdata.get("questions", []):
            qid = q["id"]
            stats["kanji_blocks_checked"] += 1
            _check_ruby_segments(f"choukai/{qid}.prompt", q.get("promptJa", ""), issues)
            check_audio_ref(f"choukai/{qid}", q.get("audioUrl"))
            img_url = q.get("imageUrl")
            if img_url:
                img_fp = public_root / img_url.lstrip("/")
                if not img_fp.exists() or img_fp.stat().st_size < 500:
                    issues.append(f"[Missing/Empty Image] choukai/{qid}: {img_url}")
            opts = q.get("options", [])
            for oi, opt in enumerate(opts):
                if opt.get("ja"):
                    _check_ruby_segments(f"choukai/{qid}.opt{oi}", opt["ja"], issues)
            cidx = q.get("correctIndex", -1)
            if not (0 <= cidx < len(opts)):
                issues.append(f"[Invalid choukai correctIndex] {qid}: {cidx}")
            for li, ln in enumerate(q.get("script", [])):
                stats["kanji_blocks_checked"] += 1
                _check_ruby_segments(f"choukai/{qid}.script[{li}]", ln.get("ja", ""), issues)

    if dokkai_json.exists():
        dkdata = json.loads(dokkai_json.read_text(encoding="utf-8"))
        for p in dkdata.get("passages", []):
            pid = p["id"]
            stats["kanji_blocks_checked"] += 1
            _check_ruby_segments(f"dokkai/{pid}.titleJa", p.get("titleJa", ""), issues)
            if p.get("contextIntroJa"):
                _check_ruby_segments(f"dokkai/{pid}.contextIntroJa", p["contextIntroJa"], issues)
            for mi, meta in enumerate(p.get("headerMeta", [])):
                _check_ruby_segments(f"dokkai/{pid}.headerMeta[{mi}]", meta.get("valueJa", ""), issues)
            for fi, fline in enumerate(p.get("footerMeta", [])):
                _check_ruby_segments(f"dokkai/{pid}.footerMeta[{fi}]", fline, issues)
            for sent in p.get("sentences", []):
                stats["kanji_blocks_checked"] += 1
                _check_ruby_segments(f"dokkai/{pid}/{sent['id']}", sent.get("jaRuby", ""), issues)
                if sent.get("sectionTagJa"):
                    _check_ruby_segments(
                        f"dokkai/{pid}/{sent['id']}.sectionTag", sent["sectionTagJa"], issues
                    )
                check_audio_ref(f"dokkai/{pid}/{sent['id']}", sent.get("audioUrl"))
                _check_tts_hash(f"dokkai/{pid}/{sent['id']}", sent, dokkai_sentence_spec(sent, p), issues, stats)
            sim = p.get("conditionSimulator")
            if isinstance(sim, dict):
                for oi, opt in enumerate(sim.get("options", [])):
                    _check_ruby_segments(f"dokkai/{pid}.sim[{oi}]", opt.get("summaryJa", ""), issues)
            for tli, step in enumerate(p.get("timeline", [])):
                _check_ruby_segments(f"dokkai/{pid}.timeline[{tli}]", step.get("labelJa", ""), issues)
            for ti, tbl in enumerate(p.get("tables", [])):
                if tbl.get("captionJa"):
                    _check_ruby_segments(f"dokkai/{pid}.tbl[{ti}].caption", tbl["captionJa"], issues)
                for ci, col in enumerate(tbl.get("columns", [])):
                    _check_ruby_segments(f"dokkai/{pid}.tbl[{ti}].col[{ci}]", col, issues)
                for ri, row in enumerate(tbl.get("rows", [])):
                    for ci, cell in enumerate(row.get("cells", [])):
                        stats["kanji_blocks_checked"] += 1
                        _check_ruby_segments(
                            f"dokkai/{pid}.tbl[{ti}].row[{ri}].c[{ci}]", cell, issues
                        )
                for fi, flt in enumerate(tbl.get("filters", [])):
                    _check_ruby_segments(
                        f"dokkai/{pid}.tbl[{ti}].filter[{fi}]", flt.get("labelJa", ""), issues
                    )
                if tbl.get("footnoteJa"):
                    _check_ruby_segments(
                        f"dokkai/{pid}.tbl[{ti}].footnote", tbl["footnoteJa"], issues
                    )
            for q in p.get("questions", []):
                qid = q["id"]
                stats["kanji_blocks_checked"] += 1
                _check_ruby_segments(f"dokkai/{pid}/{qid}.q", q.get("questionJa", ""), issues)
                opts = q.get("options", [])
                for oi, opt in enumerate(opts):
                    _check_ruby_segments(f"dokkai/{pid}/{qid}.opt{oi}", opt.get("ja", ""), issues)
                cidx = q.get("correctIndex", -1)
                if not (0 <= cidx < len(opts)):
                    issues.append(f"[Invalid dokkai correctIndex] {pid}/{qid}: {cidx}")
            for g in p.get("grammar", []):
                if g.get("exampleRuby"):
                    _check_ruby_segments(f"dokkai/{pid}/grammar/{g['id']}", g["exampleRuby"], issues)

    if gengo_json.exists():
        gdata = json.loads(gengo_json.read_text(encoding="utf-8"))
        for p in gdata.get("passages", []):
            pid = p["id"]
            stats["kanji_blocks_checked"] += 1
            _check_ruby_segments(f"gengo/{pid}.intro", p.get("contextIntroJa", ""), issues)
            _check_ruby_segments(f"gengo/{pid}.title", p.get("titleJa", ""), issues)
            for pi, para in enumerate(p.get("paragraphs", [])):
                stats["kanji_blocks_checked"] += 1
                clean_para = re.sub(r"\[\[\d+\]\]", "", para)
                _check_ruby_segments(f"gengo/{pid}.para[{pi}]", clean_para, issues)
        for q in gdata.get("questions", []):
            qid = q["id"]
            stats["kanji_blocks_checked"] += 1
            clean_prompt = q.get("promptJa", "").replace("[[STAR_SLOTS]]", "")
            clean_prompt = re.sub(r"\[\[([^\]]+)\]\]", r"\1", clean_prompt)
            _check_ruby_segments(f"gengo/{qid}.prompt", clean_prompt, issues)
            opts = q.get("options", [])
            for oi, opt in enumerate(opts):
                raw_opt = opt.get("ja", "")
                if isinstance(raw_opt, str):
                    raw_opt = re.sub(r"\[\[([^\]]+)\]\]", r"\1", raw_opt)
                # For kanji_write (問題2), options intentionally test Kanji writing so we allow ruby or plain
                if q.get("kind") != "kanji_write":
                    _check_ruby_segments(f"gengo/{qid}.opt{oi}", raw_opt, issues)
            cidx = q.get("correctIndex", -1)
            if not (0 <= cidx < len(opts)):
                issues.append(f"[Invalid gengo correctIndex] {qid}: {cidx}")
            if q.get("kind") == "star_order":
                order = q.get("starOrder", [])
                star_pos = q.get("starSlotIndex", 2)
                if sorted(order) != [0, 1, 2, 3]:
                    issues.append(f"[Invalid starOrder] {qid}: {order}")
                elif order[star_pos] != cidx:
                    issues.append(
                        f"[Mismatch starOrder vs correctIndex] {qid}: order[{star_pos}]={order[star_pos]} != {cidx}"
                    )

    if standalone_html.exists():
        html = standalone_html.read_text(encoding="utf-8")
        manifest_path = sdir / "audio" / "manifest.json"
        if manifest_path.exists():
            man = json.loads(manifest_path.read_text(encoding="utf-8"))
            for section in ("lines", "paragraphs"):
                for k, v in man.get(section, {}).items():
                    fp = sdir / v["file"]
                    if not fp.exists() or fp.stat().st_size < 500:
                        issues.append(f"[Missing Standalone Audio] {section}/{v['file']}")
                    else:
                        stats["audio_checked"] += 1
                    if section == "lines" and "speedScale" in v:
                        spec = standalone_spec(k, int(v.get("speakerId", 13)), float(v["speedScale"]))
                        _check_tts_hash(f"standalone/{v['file']}", v, spec, issues, stats)
            voiced = set(man.get("lines", {}).keys())
            for i, m in enumerate(re.finditer(r'sayW\("([^"]+)","([^"]+)"', html)):
                if m.group(1) not in voiced:
                    issues.append(f"[Unvoiced Standalone Line] sayW[{i}]: re-run voicevox_generate_standalone_pack")
        for i, m in enumerate(re.finditer(r'sayW\("([^"]+)","([^"]+)"', html)):
            stripped = RUBY_BRACE_RE.sub("", m.group(1))
            leftover = KANJI_RE.findall(stripped)
            if leftover:
                issues.append(f"[Unfurigana Kanji in HTML sayW[{i}]] {''.join(leftover)}")

    # Verify registration in stories/index.json
    registered = False
    if index_file.exists():
        cat = json.loads(index_file.read_text(encoding="utf-8"))
        for entry in cat.get("stories", []):
            if entry.get("id") == sdir.name:
                registered = True
                if entry.get("category") not in ("situation", "story", "jlpt"):
                    issues.append(
                        f"[Invalid Category in index.json] '{sdir.name}': {entry.get('category')}"
                    )
        if not registered:
            issues.append(f"[Not Registered] '{sdir.name}' is missing from stories/index.json")

    return {
        "ok": len(issues) == 0,
        "story_dir": str(sdir),
        "registered_in_catalog": registered,
        "stats": stats,
        "issue_count": len(issues),
        "issues": issues,
        "warnings": warnings,
    }


def validate_catalog(
    stories_root: str | Path,
    *,
    web_public_dir: str | Path | None = None,
) -> dict[str, Any]:
    """Validate EVERY story listed in `stories/index.json` and check for unregistered folders."""
    sroot = Path(stories_root).expanduser().resolve()
    public_root = (
        Path(web_public_dir).expanduser().resolve()
        if web_public_dir
        else sroot.parent
    )
    index_file = sroot / "index.json"
    if not index_file.exists():
        return {
            "ok": False,
            "stories_root": str(sroot),
            "error": f"Missing catalog file: {index_file}",
            "results": [],
        }

    cat = json.loads(index_file.read_text(encoding="utf-8"))
    entries = cat.get("stories", [])
    registered_ids = {e["id"] for e in entries if "id" in e}

    results: list[dict[str, Any]] = []
    failed: list[str] = []
    total_issues = 0
    total_audio = 0
    total_kanji = 0
    total_palette = 0
    total_hash = 0
    total_warnings = 0

    for entry in entries:
        sid = entry["id"]
        res = validate_story_folder(sroot / sid, web_public_dir=public_root)
        res["id"] = sid
        results.append(res)
        total_issues += res["issue_count"]
        total_audio += res["stats"]["audio_checked"]
        total_kanji += res["stats"]["kanji_blocks_checked"]
        total_palette += res["stats"].get("palette_assets_checked", 0)
        total_hash += res["stats"].get("tts_hash_checked", 0)
        total_warnings += len(res.get("warnings", []))
        if not res["ok"]:
            failed.append(sid)

    orphan_folders = sorted(
        p.name
        for p in sroot.iterdir()
        if p.is_dir() and not p.name.startswith(".") and p.name not in registered_ids
    )

    return {
        "ok": len(failed) == 0 and len(orphan_folders) == 0,
        "stories_root": str(sroot),
        "story_count": len(entries),
        "failed_stories": failed,
        "orphan_folders": orphan_folders,
        "total_issues": total_issues,
        "total_audio_checked": total_audio,
        "total_kanji_blocks_checked": total_kanji,
        "total_palette_assets_checked": total_palette,
        "total_tts_hashes_checked": total_hash,
        "total_warnings": total_warnings,
        "results": results,
    }
