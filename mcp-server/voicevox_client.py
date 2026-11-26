"""Client for local VOICEVOX Engine HTTP API (default: http://127.0.0.1:50021)."""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import tempfile
import wave
from pathlib import Path
from typing import Any

import httpx

from tts_spec import (
    RUBY_BRACE_RE,
    TtsSpec,
    braced_to_plain,
    cache_decision,
    dokkai_sentence_spec,
    iter_story_lines,
    standalone_spec,
    story_line_spec,
)

DEFAULT_VOICEVOX_URL = os.environ.get("VOICEVOX_URL", "http://127.0.0.1:50021")


def _convert_wav_to_mp3(wav_path: Path, mp3_path: Path, bitrate: str = "96k") -> None:
    """Compress WAV to lightweight MP3 via FFmpeg (ideal for GitHub Pages static hosting)."""
    ffmpeg_bin = shutil.which("ffmpeg")
    if not ffmpeg_bin:
        raise RuntimeError("ffmpeg not found; install ffmpeg or use audio_format='wav'.")
    subprocess.run(
        [
            ffmpeg_bin,
            "-v",
            "error",
            "-y",
            "-i",
            str(wav_path),
            "-codec:a",
            "libmp3lame",
            "-b:a",
            bitrate,
            str(mp3_path),
        ],
        check=True,
    )


def get_wav_duration_sec(wav_path: Path) -> float:
    """Return exact duration of a WAV file in seconds."""
    with wave.open(str(wav_path), "rb") as wf:
        frames = wf.getnframes()
        rate = wf.getframerate()
        return round(frames / float(rate), 3) if rate > 0 else 0.0


def get_audio_duration_sec(path: Path) -> float | None:
    """Duration of a WAV (exact) or any FFmpeg-readable file (via ffprobe); None if unknown."""
    if path.suffix.lower() == ".wav":
        try:
            return get_wav_duration_sec(path)
        except (wave.Error, EOFError):
            pass
    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        return None
    try:
        out = subprocess.run(
            [ffprobe, "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()
        return round(float(out), 3)
    except (subprocess.CalledProcessError, ValueError):
        return None


async def check_voicevox_health(base_url: str = DEFAULT_VOICEVOX_URL) -> dict[str, Any]:
    """Check whether the local VOICEVOX engine is reachable and return its version."""
    async with httpx.AsyncClient(timeout=5.0) as client:
        try:
            resp = await client.get(f"{base_url}/version")
            resp.raise_for_status()
            return {"ok": True, "url": base_url, "version": resp.json()}
        except Exception as exc:
            return {
                "ok": False,
                "url": base_url,
                "error": str(exc),
                "hint": "Hãy mở ứng dụng VOICEVOX (hoặc VOICEVOX Engine) trên máy ở cổng 50021.",
            }


async def list_speakers(base_url: str = DEFAULT_VOICEVOX_URL) -> list[dict[str, Any]]:
    """Return a compact list of installed VOICEVOX speakers and their style IDs."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(f"{base_url}/speakers")
        resp.raise_for_status()
        speakers = resp.json()
        result: list[dict[str, Any]] = []
        for sp in speakers:
            result.append(
                {
                    "name": sp["name"],
                    "styles": [
                        {"style": st["name"], "id": st["id"]}
                        for st in sp.get("styles", [])
                    ],
                }
            )
        return result


async def synthesize_line(
    text: str,
    speaker_id: int,
    output_path: str | Path,
    *,
    speed_scale: float = 0.94,
    pitch_scale: float = 0.0,
    intonation_scale: float = 1.05,
    pause_length_scale: float = 1.08,
    volume_scale: float = 1.0,
    pre_phoneme_length: float = 0.1,
    post_phoneme_length: float = 0.18,
    base_url: str = DEFAULT_VOICEVOX_URL,
) -> dict[str, Any]:
    """Synthesize a Japanese utterance with VOICEVOX and save as a WAV file."""
    out = Path(output_path).expanduser().resolve()
    out.parent.mkdir(parents=True, exist_ok=True)

    async with httpx.AsyncClient(timeout=60.0) as client:
        # Step 1: Create audio query
        q_resp = await client.post(
            f"{base_url}/audio_query",
            params={"text": text, "speaker": speaker_id},
        )
        q_resp.raise_for_status()
        query = q_resp.json()

        # Adjust prosody for Japanese learners (slightly slower, expressive pitch & breath pauses)
        query["speedScale"] = speed_scale
        query["pitchScale"] = pitch_scale
        query["intonationScale"] = intonation_scale
        query["pauseLengthScale"] = pause_length_scale
        query["volumeScale"] = volume_scale
        query["prePhonemeLength"] = pre_phoneme_length
        query["postPhonemeLength"] = post_phoneme_length

        # Step 2: Synthesize WAV bytes
        s_resp = await client.post(
            f"{base_url}/synthesis",
            params={"speaker": speaker_id},
            json=query,
            headers={"Accept": "audio/wav"},
        )
        s_resp.raise_for_status()
        out.write_bytes(s_resp.content)

    duration_sec = get_wav_duration_sec(out)
    return {
        "ok": True,
        "output_path": str(out),
        "speaker_id": speaker_id,
        "text": text,
        "speed_scale": speed_scale,
        "duration_sec": duration_sec,
        "size_bytes": out.stat().st_size,
    }


async def _render_clip(spec: TtsSpec, out_path: Path, ext: str, base_url: str) -> float:
    """Synthesize one clip to WAV (or WAV->MP3) and return its exact duration in seconds."""
    if ext == "mp3":
        with tempfile.TemporaryDirectory() as td:
            tmp_wav = Path(td) / f"{out_path.stem}.wav"
            res = await synthesize_line(output_path=tmp_wav, base_url=base_url, **spec.synth_kwargs())
            _convert_wav_to_mp3(tmp_wav, out_path)
            return float(res["duration_sec"])
    res = await synthesize_line(output_path=out_path, base_url=base_url, **spec.synth_kwargs())
    return float(res["duration_sec"])


class _ClipCache:
    """Bookkeeping shared by every batch generator (generated / kept / backfilled)."""

    def __init__(self, audio_dir: Path, ext: str, force: bool, base_url: str) -> None:
        self.audio_dir = audio_dir
        self.ext = ext
        self.force = force
        self.base_url = base_url
        self.generated: list[dict[str, Any]] = []
        self.skipped: list[str] = []
        self.backfilled: list[str] = []

    async def ensure(
        self, clip_id: str, spec: TtsSpec, stored_hash: str | None, stored_duration: Any
    ) -> tuple[str, float, str]:
        """Return (file_name, duration_sec, ttsHash), synthesizing only when needed."""
        out_name = f"{clip_id}.{self.ext}"
        out_path = self.audio_dir / out_name
        new_hash = spec.fingerprint()
        decision = cache_decision(
            exists=out_path.exists(), stored_hash=stored_hash, new_hash=new_hash, force=self.force
        )
        if decision in ("fresh", "legacy"):
            duration = float(stored_duration) if stored_duration else (get_audio_duration_sec(out_path) or 0.0)
            (self.backfilled if decision == "legacy" else self.skipped).append(out_name)
            return out_name, duration, new_hash
        duration = await _render_clip(spec, out_path, self.ext, self.base_url)
        self.generated.append(
            {
                "file": out_name,
                "reason": decision,
                "speaker_id": spec.speaker_id,
                "duration_sec": duration,
                "text": spec.text,
            }
        )
        return out_name, duration, new_hash

    def summary(self) -> dict[str, Any]:
        return {
            "generated_count": len(self.generated),
            "skipped_count": len(self.skipped),
            "backfilled_count": len(self.backfilled),
            "generated": self.generated,
        }


def _pick_ext(audio_format: str) -> str:
    return "mp3" if (audio_format == "mp3" and shutil.which("ffmpeg")) else "wav"


async def generate_story_audio(
    story_json_path: str | Path,
    *,
    force: bool = False,
    audio_format: str = "mp3",
    base_url: str = DEFAULT_VOICEVOX_URL,
) -> dict[str, Any]:
    """Batch-generate VOICEVOX audio (mp3 or wav) for every voiced line in story.json.

    Writes `audioUrl`, `durationSec` and `ttsHash` back. A clip is re-synthesized when it is
    missing, when `force=True`, or when its text/voice/prosody changed (hash mismatch).
    """
    story_file = Path(story_json_path).expanduser().resolve()
    story = json.loads(story_file.read_text(encoding="utf-8"))
    story_dir = story_file.parent
    audio_dir = story_dir / "audio"
    audio_dir.mkdir(parents=True, exist_ok=True)
    story_id = story.get("id", story_dir.name)
    voices: dict[str, dict[str, Any]] = story.get("voices", {})
    cache = _ClipCache(audio_dir, _pick_ext(audio_format), force, base_url)

    for line, default_id in iter_story_lines(story):
        spec = story_line_spec(line, voices)
        if spec is None:
            continue
        name, duration, tts_hash = await cache.ensure(
            line.get("id") or default_id, spec, line.get("ttsHash"), line.get("durationSec")
        )
        line["audioUrl"] = f"/stories/{story_id}/audio/{name}"
        line["durationSec"] = duration
        line["ttsHash"] = tts_hash

    story_file.write_text(json.dumps(story, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {"ok": True, "story_json": str(story_file), "audio_dir": str(audio_dir), **cache.summary()}


_RUBY_BRACE_RE = RUBY_BRACE_RE


def _parse_braced_ruby(text: str) -> list[dict[str, str]]:
    """Convert `{漢字|かんじ}` markup into RubySegment list for DictationView."""
    segs: list[dict[str, str]] = []
    pos = 0
    for m in RUBY_BRACE_RE.finditer(text):
        if m.start() > pos:
            segs.append({"t": text[pos : m.start()]})
        segs.append({"t": m.group(1), "r": m.group(2)})
        pos = m.end()
    if pos < len(text):
        segs.append({"t": text[pos:]})
    return segs


def _braced_to_tts_kanji(text: str) -> str:
    """Strip inline highlight tags and `{漢字|かんじ}` ruby to natural Kanji for authentic pitch accent."""
    return braced_to_plain(text)


async def generate_dokkai_audio(
    dokkai_json_path: str | Path,
    *,
    force: bool = False,
    audio_format: str = "mp3",
    base_url: str = DEFAULT_VOICEVOX_URL,
) -> dict[str, Any]:
    """Batch-generate VOICEVOX MP3/WAV audio for every sentence in a JLPT dokkai.json file
    and write `audioUrl` + `durationSec` + `ttsHash` back (hash-aware cache, see generate_story_audio).
    """
    dokkai_file = Path(dokkai_json_path).expanduser().resolve()
    data = json.loads(dokkai_file.read_text(encoding="utf-8"))
    pack_id = data["id"]
    audio_dir = dokkai_file.parent / "audio"
    audio_dir.mkdir(parents=True, exist_ok=True)
    cache = _ClipCache(audio_dir, _pick_ext(audio_format), force, base_url)

    for passage in data.get("passages", []):
        for s_idx, sent in enumerate(passage.get("sentences", [])):
            spec = dokkai_sentence_spec(sent, passage)
            if spec is None:
                continue
            sid = sent.get("id") or f"{passage['id']}_s{s_idx + 1}"
            name, duration, tts_hash = await cache.ensure(
                sid, spec, sent.get("ttsHash"), sent.get("durationSec")
            )
            sent["audioUrl"] = f"/stories/{pack_id}/audio/{name}"
            sent["durationSec"] = round(duration, 2)
            sent["ttsHash"] = tts_hash

    dokkai_file.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {"ok": True, "dokkai_json": str(dokkai_file), "audio_dir": str(audio_dir), **cache.summary()}


async def generate_standalone_pack(
    html_path: str | Path,
    *,
    story_id: str,
    title_ja: str,
    title_vi: str,
    level: str = "JLPT N4",
    speaker_id: int = 13,
    speed_scale: float = 0.91,
    force: bool = False,
    rebuild_dictation: bool = False,
    base_url: str = DEFAULT_VOICEVOX_URL,
) -> dict[str, Any]:
    """Scan a standalone interactive HTML story (using `sayW` & `PASSAGE` with `{漢字|かんじ}`),
    synthesize VOICEVOX MP3 clips + `audio/manifest.json`, and generate `dictation.json` for Daily Dictation.

    Hash-aware: unchanged clips are reused (both MP3 and WAV), edited lines are re-synthesized.
    Merge-safe: hand-made manifest entries and per-entry speakerId/speedScale overrides are kept,
    and an existing dictation.json is only refreshed (pass rebuild_dictation=True to regenerate).
    """
    html_file = Path(html_path).expanduser().resolve()
    story_dir = html_file.parent
    audio_dir = story_dir / "audio"
    audio_dir.mkdir(parents=True, exist_ok=True)
    html = html_file.read_text(encoding="utf-8")

    manifest_path = audio_dir / "manifest.json"
    old_manifest: dict[str, Any] = {}
    if manifest_path.exists():
        old_manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    cache = _ClipCache(audio_dir, _pick_ext("mp3"), force, base_url)
    manifest: dict[str, dict[str, Any]] = {"lines": {}, "paragraphs": {}}
    dictation_items: list[dict[str, Any]] = []
    seen_lines: set[str] = set()

    async def synth_one(fid: str, raw_ja: str, old: dict[str, Any] | None) -> dict[str, Any]:
        old = old or {}
        # Per-entry overrides curated by hand in manifest.json win over the pack defaults.
        spk = int(old.get("speakerId", speaker_id))
        spd = float(old.get("speedScale", speed_scale))
        spec = standalone_spec(raw_ja, spk, spd)
        expected_file = f"audio/{fid}.{cache.ext}"
        same_file = old.get("file") == expected_file
        name, duration, tts_hash = await cache.ensure(
            fid,
            spec,
            old.get("ttsHash") if same_file else None,
            old.get("durationSec") if same_file else None,
        )
        return {
            "file": f"audio/{name}",
            "durationSec": duration,
            "speakerId": spk,
            "speedScale": spd,
            "ttsHash": tts_hash,
        }

    # 1. Extract sayW("jp","vi") dialogue/narration lines
    for m in re.finditer(r'sayW\("([^"]+)","([^"]+)"', html):
        raw_jp, vi = m.group(1), m.group(2)
        if raw_jp in seen_lines:
            continue
        seen_lines.add(raw_jp)
        idx = len(dictation_items)
        entry = await synth_one(f"line_{idx:02d}", raw_jp, old_manifest.get("lines", {}).get(raw_jp))
        manifest["lines"][raw_jp] = entry
        dictation_items.append(
            {
                "id": f"{story_id}_{idx + 1:02d}",
                "speakerLabel": "ナレーター",
                "jaPlain": RUBY_BRACE_RE.sub(r"\1", raw_jp),
                "jaKana": RUBY_BRACE_RE.sub(r"\2", raw_jp),
                "jaRuby": _parse_braced_ruby(raw_jp),
                "vi": vi,
                "audioUrl": f"/stories/{story_id}/{entry['file']}",
                "durationSec": entry["durationSec"],
            }
        )

    # 2. Extract PASSAGE paragraphs if present
    m_pas = re.search(r"const PASSAGE=\[(.*?)\];", html, re.S)
    if m_pas:
        for p_idx, m in enumerate(re.finditer(r'\["([^"]+)","([^"]+)"\]', m_pas.group(1))):
            key = f"para_{p_idx}"
            manifest["paragraphs"][key] = await synth_one(
                f"para_{p_idx:02d}", m.group(1), old_manifest.get("paragraphs", {}).get(key)
            )

    # Keep hand-made clips that the sayW/PASSAGE scan does not know about (e.g. custom messages).
    preserved = 0
    for section in ("lines", "paragraphs"):
        for key, entry in old_manifest.get(section, {}).items():
            if key not in manifest[section]:
                manifest[section][key] = entry
                preserved += 1

    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    dictation_path = story_dir / "dictation.json"
    if dictation_path.exists() and not rebuild_dictation:
        # Never clobber a curated dictation pack: only refresh audio refs of matching sentences.
        existing = json.loads(dictation_path.read_text(encoding="utf-8"))
        fresh = {it["jaPlain"]: it for it in dictation_items}
        for item in existing.get("items", []):
            src = fresh.get(item.get("jaPlain"))
            if src:
                item["audioUrl"] = src["audioUrl"]
                item["durationSec"] = src["durationSec"]
        dictation_pack = existing
    else:
        dictation_pack = {
            "id": story_id,
            "titleJa": title_ja,
            "titleVi": title_vi,
            "level": level,
            "items": dictation_items,
        }
    dictation_path.write_text(
        json.dumps(dictation_pack, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return {
        "preserved_manual_entries": preserved,
        "ok": True,
        "manifest_path": str(manifest_path),
        "dictation_json": str(dictation_path),
        "line_count": len(manifest["lines"]),
        "paragraph_count": len(manifest["paragraphs"]),
        **cache.summary(),
    }
