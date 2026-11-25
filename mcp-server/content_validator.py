"""Automated QA validator for Japanese stories (Furigana coverage, audio files, quiz bounds, catalog)."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

KANJI_RE = re.compile(r"[\u4e00-\u9faf]")
RUBY_BRACE_RE = re.compile(r"\{([^|}]+)\|([^}]+)\}")


def _check_ruby_segments(label: str, segs: list[dict[str, Any]], issues: list[str]) -> None:
    for seg in segs:
        text = str(seg.get("t", ""))
        reading = seg.get("r")
        if KANJI_RE.search(text) and not reading:
            issues.append(f"[Missing Furigana] {label}: '{text}'")
        if reading and not KANJI_RE.search(text):
            issues.append(f"[Ruby on non-Kanji] {label}: '{text}' -> '{reading}'")


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
    standalone_html = sdir / "index.html"

    if story_json.exists():
        data = json.loads(story_json.read_text(encoding="utf-8"))
        for sc in data.get("scenes", []):
            for ln in sc.get("lines", []):
                stats["kanji_blocks_checked"] += 1
                _check_ruby_segments(f"{sc['id']}/{ln['id']}", ln.get("jaRuby", []), issues)
                check_audio_ref(f"{sc['id']}/{ln['id']}", ln.get("audioUrl"))
            mg = sc.get("minigame")
            if isinstance(mg, dict):
                for ch in mg.get("choices", []):
                    if ch.get("labelRuby"):
                        _check_ruby_segments(f"{sc['id']}/{ch['id']}.label", ch["labelRuby"], issues)
                    rl = ch.get("responseLine")
                    if isinstance(rl, dict):
                        _check_ruby_segments(f"{sc['id']}/{ch['id']}.resp", rl.get("jaRuby", []), issues)
                        check_audio_ref(f"{sc['id']}/{ch['id']}.resp", rl.get("audioUrl"))

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

    if dictation_json.exists():
        ddata = json.loads(dictation_json.read_text(encoding="utf-8"))
        for it in ddata.get("items", []):
            stats["kanji_blocks_checked"] += 1
            _check_ruby_segments(f"dictation/{it['id']}", it.get("jaRuby", []), issues)
            check_audio_ref(f"dictation/{it['id']}", it.get("audioUrl"))

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
        for i, m in enumerate(re.finditer(r'sayW\("([^"]+)","([^"]+)"', html)):
            stripped = RUBY_BRACE_RE.sub("", m.group(1))
            leftover = KANJI_RE.findall(stripped)
            if leftover:
                issues.append(f"[Unfurigana Kanji in HTML sayW[{i}]] {''.join(leftover)}")

    # Verify registration in stories/index.json
    index_file = sdir.parent / "index.json"
    registered = False
    if index_file.exists():
        cat = json.loads(index_file.read_text(encoding="utf-8"))
        for entry in cat.get("stories", []):
            if entry.get("id") == sdir.name:
                registered = True
                if entry.get("category") not in ("situation", "story"):
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
    }
