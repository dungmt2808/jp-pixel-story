"""Automated QA validator for Japanese stories (Furigana coverage, audio files, quiz bounds, catalog)."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

KANJI_RE = re.compile(r"[\u4e00-\u9faf]")
RUBY_BRACE_RE = re.compile(r"\{([^|}]+)\|([^}]+)\}")


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
    choukai_json = sdir / "choukai.json"
    dokkai_json = sdir / "dokkai.json"
    gengo_json = sdir / "gengo.json"
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

    for entry in entries:
        sid = entry["id"]
        res = validate_story_folder(sroot / sid, web_public_dir=public_root)
        res["id"] = sid
        results.append(res)
        total_issues += res["issue_count"]
        total_audio += res["stats"]["audio_checked"]
        total_kanji += res["stats"]["kanji_blocks_checked"]
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
        "results": results,
    }
