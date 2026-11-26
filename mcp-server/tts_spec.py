"""Pure (network-free) resolution of VOICEVOX synthesis specs + audio fingerprints.

Both the generators (`voicevox_client.py`) and the QA validator (`content_validator.py`)
use these helpers, so "which text/voice/prosody produced this clip" is computed in exactly
one place. Every generated clip stores a `ttsHash`; if a line's text or voice settings
change later, the hash no longer matches and:
  * the generator re-synthesises that clip on the next run (no `force=True` needed), and
  * the validator reports the clip as stale before it can be deployed.
"""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import asdict, dataclass
from typing import Any

RUBY_BRACE_RE = re.compile(r"\{([^|}]+)\|([^}]+)\}")
HIGHLIGHT_RE = re.compile(r"<<[a-z0-9]+:(.*?)>>")

# Bump only if the meaning of the fingerprint changes (forces every clip to be regenerated).
FINGERPRINT_VERSION = 1

DOKKAI_DOC_SPEAKER = {
    "email": 46,  # 小夜/SAYO
    "memo": 46,  # 小夜/SAYO
    "essay": 23,  # WhiteCUL ノーマル
    "notice": 13,  # 青山龍星 ノーマル
    "info_table": 13,  # 青山龍星 ノーマル
}


@dataclass(frozen=True)
class TtsSpec:
    text: str
    speaker_id: int
    speed_scale: float
    pitch_scale: float = 0.0
    intonation_scale: float = 1.05
    pause_length_scale: float = 1.08

    def fingerprint(self) -> str:
        payload = {"v": FINGERPRINT_VERSION, **asdict(self)}
        for k in ("speed_scale", "pitch_scale", "intonation_scale", "pause_length_scale"):
            payload[k] = round(float(payload[k]), 4)
        blob = json.dumps(payload, ensure_ascii=False, sort_keys=True).encode("utf-8")
        return hashlib.sha1(blob).hexdigest()[:12]

    def synth_kwargs(self) -> dict[str, Any]:
        return {
            "text": self.text,
            "speaker_id": self.speaker_id,
            "speed_scale": self.speed_scale,
            "pitch_scale": self.pitch_scale,
            "intonation_scale": self.intonation_scale,
            "pause_length_scale": self.pause_length_scale,
        }


def braced_to_plain(text: str) -> str:
    """`{漢字|かんじ}` ruby + `<<tag:...>>` highlights -> natural Kanji text for TTS."""
    return RUBY_BRACE_RE.sub(r"\1", HIGHLIGHT_RE.sub(r"\1", text))


def story_line_spec(line: dict[str, Any], voices: dict[str, dict[str, Any]]) -> TtsSpec | None:
    """Spec for a `story.json` scene line / choice responseLine / reading sentence."""
    raw_ja = line.get("ja") if isinstance(line.get("ja"), str) else (
        line.get("jaRuby") if isinstance(line.get("jaRuby"), str) else None
    )
    plain_from_ruby = braced_to_plain(raw_ja) if isinstance(raw_ja, str) else None
    tts_text = line.get("ttsText") or line.get("jaPlain") or plain_from_ruby
    if not tts_text:
        return None
    voice_cfg = voices.get(line.get("voice", "narrator"), {"speakerId": 13, "speedScale": 0.92})
    return TtsSpec(
        text=tts_text,
        speaker_id=int(line.get("speakerId", voice_cfg.get("speakerId", 13))),
        speed_scale=float(line.get("speedScale", voice_cfg.get("speedScale", 0.92))),
        pitch_scale=float(line.get("pitchScale", voice_cfg.get("pitchScale", 0.0))),
        intonation_scale=float(line.get("intonationScale", voice_cfg.get("intonationScale", 1.12))),
        pause_length_scale=float(line.get("pauseLengthScale", voice_cfg.get("pauseLengthScale", 1.12))),
    )


def iter_story_lines(story: dict[str, Any]):
    """Yield (line_dict, default_id) for every voiced object in a story.json."""
    for s_idx, scene in enumerate(story.get("scenes", [])):
        for l_idx, line in enumerate(scene.get("lines", [])):
            yield line, f"s{s_idx + 1:02d}_l{l_idx + 1:02d}"
        minigame = scene.get("minigame")
        if isinstance(minigame, dict):
            for c_idx, choice in enumerate(minigame.get("choices", [])):
                if isinstance(choice.get("responseLine"), dict):
                    yield choice["responseLine"], f"s{s_idx + 1:02d}_c{c_idx + 1:02d}"
    reading = story.get("reading")
    if isinstance(reading, dict):
        for p_idx, sent in enumerate(reading.get("sentences", [])):
            yield sent, f"read_{p_idx + 1:02d}"


def dokkai_sentence_spec(sent: dict[str, Any], passage: dict[str, Any]) -> TtsSpec | None:
    """Spec for one sentence of a JLPT `dokkai.json` passage."""
    raw_text = sent.get("ttsText") or sent.get("jaPlain") or ""
    if not raw_text and isinstance(sent.get("jaRuby"), str):
        raw_text = braced_to_plain(sent["jaRuby"])
    tts_text = raw_text.lstrip("※").strip()
    if not tts_text:
        return None
    return TtsSpec(
        text=tts_text,
        speaker_id=int(sent.get("speakerId", DOKKAI_DOC_SPEAKER.get(passage.get("docStyle", ""), 13))),
        speed_scale=float(sent.get("speedScale", 0.98)),
        intonation_scale=float(sent.get("intonationScale", 1.08)),
    )


def standalone_spec(raw_ja: str, speaker_id: int, speed_scale: float) -> TtsSpec:
    """Spec for a `sayW(...)` line / PASSAGE paragraph of a standalone HTML story."""
    return TtsSpec(text=braced_to_plain(raw_ja), speaker_id=speaker_id, speed_scale=speed_scale)


def cache_decision(*, exists: bool, stored_hash: str | None, new_hash: str, force: bool) -> str:
    """Decide what to do with one clip.

    Returns one of:
      'forced'  - regenerate because force=True
      'missing' - regenerate because the file does not exist
      'changed' - regenerate because text/voice/prosody changed since the clip was made
      'fresh'   - keep: hash matches
      'legacy'  - keep: clip predates fingerprints; record the current hash (backfill)
    """
    if force:
        return "forced"
    if not exists:
        return "missing"
    if stored_hash is None:
        return "legacy"
    return "fresh" if stored_hash == new_hash else "changed"
