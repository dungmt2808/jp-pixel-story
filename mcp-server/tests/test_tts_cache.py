"""Tests for the hash-aware VOICEVOX audio cache and the new validator checks
(stale audio, palette lock, sprite metadata). No VOICEVOX engine needed: synthesis is faked.
"""

from __future__ import annotations

import asyncio
import json
import wave
from pathlib import Path
from typing import Any

import pytest
from PIL import Image

import voicevox_client
from content_validator import validate_story_folder
from palettes import get_palette_rgb
from tts_spec import TtsSpec, cache_decision, story_line_spec


def _write_wav(path: Path, seconds: float) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(24000)
        wf.writeframes(b"\x00\x00" * int(24000 * seconds))


@pytest.fixture()
def fake_engine(monkeypatch: pytest.MonkeyPatch) -> list[dict[str, Any]]:
    """Replace the HTTP synthesis with a local fake that records every call."""
    calls: list[dict[str, Any]] = []

    async def fake_synthesize_line(text: str, speaker_id: int, output_path: str | Path, **kw: Any) -> dict[str, Any]:
        calls.append({"text": text, "speaker_id": speaker_id, **kw})
        seconds = 0.5 + 0.1 * len(text)
        _write_wav(Path(output_path), seconds)
        return {"ok": True, "duration_sec": round(seconds, 3)}

    monkeypatch.setattr(voicevox_client, "synthesize_line", fake_synthesize_line)
    return calls


def _story(tmp_path: Path) -> tuple[Path, Path]:
    pub = tmp_path / "public"
    sdir = pub / "stories" / "demo"
    sdir.mkdir(parents=True)
    (pub / "stories" / "index.json").write_text(
        json.dumps({"stories": [{"id": "demo", "category": "story"}]}), encoding="utf-8"
    )
    story = {
        "id": "demo",
        "voices": {"narrator": {"speakerId": 13, "speedScale": 0.9}, "yui": {"speakerId": 46, "speedScale": 1.0}},
        "scenes": [
            {
                "id": "sc1",
                "lines": [
                    {"id": "l1", "voice": "narrator", "jaPlain": "雨が降っています。", "jaRuby": "{雨|あめ}が{降|ふ}っています。"},
                    {"id": "l2", "voice": "yui", "jaPlain": "傘を持っていますか。", "jaRuby": "{傘|かさ}を{持|も}っていますか。"},
                ],
            }
        ],
        "reading": {"sentences": [], "grammar": [], "quiz": []},
    }
    path = sdir / "story.json"
    path.write_text(json.dumps(story, ensure_ascii=False), encoding="utf-8")
    return pub, path


def _run(story_path: Path, **kw: Any) -> dict[str, Any]:
    return asyncio.run(voicevox_client.generate_story_audio(story_path, audio_format="wav", **kw))


def test_cache_decision_table() -> None:
    assert cache_decision(exists=True, stored_hash="a", new_hash="a", force=True) == "forced"
    assert cache_decision(exists=False, stored_hash="a", new_hash="a", force=False) == "missing"
    assert cache_decision(exists=True, stored_hash=None, new_hash="a", force=False) == "legacy"
    assert cache_decision(exists=True, stored_hash="a", new_hash="b", force=False) == "changed"
    assert cache_decision(exists=True, stored_hash="a", new_hash="a", force=False) == "fresh"


def test_fingerprint_tracks_text_voice_and_prosody() -> None:
    base = TtsSpec(text="こんにちは", speaker_id=13, speed_scale=0.9)
    assert base.fingerprint() == TtsSpec(text="こんにちは", speaker_id=13, speed_scale=0.9).fingerprint()
    assert base.fingerprint() != TtsSpec(text="こんばんは", speaker_id=13, speed_scale=0.9).fingerprint()
    assert base.fingerprint() != TtsSpec(text="こんにちは", speaker_id=46, speed_scale=0.9).fingerprint()
    assert base.fingerprint() != TtsSpec(text="こんにちは", speaker_id=13, speed_scale=1.0).fingerprint()
    # ruby markup is stripped to Kanji, so the spec only changes when the spoken text does
    spec = story_line_spec({"jaRuby": "{雨|あめ}です。"}, {})
    assert spec is not None and spec.text == "雨です。"


def test_generate_then_skip_then_regenerate_only_edited_line(tmp_path: Path, fake_engine: list) -> None:
    _, story_path = _story(tmp_path)

    first = _run(story_path)
    assert first["generated_count"] == 2 and len(fake_engine) == 2
    data = json.loads(story_path.read_text(encoding="utf-8"))
    l1, l2 = data["scenes"][0]["lines"]
    assert l1["audioUrl"] == "/stories/demo/audio/l1.wav" and l1["ttsHash"] and l1["durationSec"] > 0
    assert fake_engine[1]["speaker_id"] == 46 and fake_engine[1]["speed_scale"] == 1.0

    second = _run(story_path)
    assert second["generated_count"] == 0 and second["skipped_count"] == 2 and len(fake_engine) == 2

    # Edit the text of l2 WITHOUT force=True: the old code silently kept the stale clip.
    l2["jaPlain"] = "傘を貸しましょうか。"
    l2["jaRuby"] = "{傘|かさ}を{貸|か}しましょうか。"
    story_path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    third = _run(story_path)
    assert third["generated_count"] == 1
    assert third["generated"][0]["file"] == "l2.wav" and third["generated"][0]["reason"] == "changed"
    assert fake_engine[-1]["text"] == "傘を貸しましょうか。"


def test_legacy_clips_are_backfilled_without_synthesis(tmp_path: Path, fake_engine: list) -> None:
    _, story_path = _story(tmp_path)
    _run(story_path)
    data = json.loads(story_path.read_text(encoding="utf-8"))
    for line in data["scenes"][0]["lines"]:
        del line["ttsHash"]
    story_path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    calls_before = len(fake_engine)

    res = _run(story_path)
    assert res["backfilled_count"] == 2 and res["generated_count"] == 0
    assert len(fake_engine) == calls_before
    assert all(line.get("ttsHash") for line in json.loads(story_path.read_text(encoding="utf-8"))["scenes"][0]["lines"])


def test_validator_flags_stale_audio(tmp_path: Path, fake_engine: list) -> None:
    pub, story_path = _story(tmp_path)
    _run(story_path)
    assert validate_story_folder(story_path.parent, web_public_dir=pub)["ok"] is True

    data = json.loads(story_path.read_text(encoding="utf-8"))
    data["scenes"][0]["lines"][0]["jaPlain"] = "雪が降っています。"
    data["scenes"][0]["lines"][0]["jaRuby"] = "{雪|ゆき}が{降|ふ}っています。"
    story_path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    res = validate_story_folder(story_path.parent, web_public_dir=pub)
    assert res["ok"] is False
    assert any(i.startswith("[Stale Audio] story/l1") for i in res["issues"])


def test_standalone_pack_reuses_mp3_or_wav_clips(tmp_path: Path, fake_engine: list, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(voicevox_client, "_pick_ext", lambda fmt: "wav")
    html = tmp_path / "s" / "index.html"
    html.parent.mkdir()
    html.write_text('<script>sayW("{犬|いぬ}が{来|き}た。","Con chó đến.");</script>', encoding="utf-8")
    kw = dict(story_id="s", title_ja="犬", title_vi="Chó")
    asyncio.run(voicevox_client.generate_standalone_pack(html, **kw))
    asyncio.run(voicevox_client.generate_standalone_pack(html, **kw))
    assert len(fake_engine) == 1  # second run reuses the clip (old code re-synthesized every MP3)
    manifest = json.loads((html.parent / "audio" / "manifest.json").read_text(encoding="utf-8"))
    entry = manifest["lines"]["{犬|いぬ}が{来|き}た。"]
    assert entry["ttsHash"] and entry["speedScale"] == 0.91


# ---------------------------------------------------------------------------
# Palette lock + sprite meta validation
# ---------------------------------------------------------------------------


def _story_with_assets(tmp_path: Path, bg_color: tuple[int, int, int], meta_patch: dict | None = None) -> tuple[Path, Path]:
    pub = tmp_path / "public"
    sdir = pub / "stories" / "pal"
    (sdir / "assets" / "sprites" / "hero").mkdir(parents=True)
    (pub / "stories" / "index.json").write_text(
        json.dumps({"stories": [{"id": "pal", "category": "story"}]}), encoding="utf-8"
    )
    Image.new("RGB", (320, 200), bg_color).save(sdir / "assets" / "bg.png")
    ok_color = get_palette_rgb("ramen_midnight")[3]
    sheet = Image.new("RGBA", (16 * 2, 16), (0, 0, 0, 0))
    sheet.paste(Image.new("RGBA", (8, 8), ok_color + (255,)), (4, 4))
    sheet.save(sdir / "assets" / "sprites" / "hero" / "spritesheet.png")
    meta = {
        "spritesheet": "spritesheet.png",
        "frameWidth": 16,
        "frameHeight": 16,
        "frameCount": 2,
        "palette": "ramen_midnight",
        "pivot": {"x": 8, "y": 15},
        "fps": 8,
        "clips": {"idle": {"frames": [0, 1], "fps": 8, "loop": True}},
    }
    meta.update(meta_patch or {})
    (sdir / "assets" / "sprites" / "hero" / "meta.json").write_text(json.dumps(meta), encoding="utf-8")
    story = {
        "id": "pal",
        "palette": "ramen_midnight",
        "assets": {
            "backgrounds": {"bg": "/stories/pal/assets/bg.png"},
            "portraits": {},
            "sprites": {"hero": "/stories/pal/assets/sprites/hero/meta.json"},
        },
        "scenes": [],
        "reading": {"sentences": [], "grammar": [], "quiz": []},
    }
    (sdir / "story.json").write_text(json.dumps(story), encoding="utf-8")
    return pub, sdir


def test_validator_accepts_palette_locked_assets(tmp_path: Path) -> None:
    pub, sdir = _story_with_assets(tmp_path, get_palette_rgb("ramen_midnight")[0])
    res = validate_story_folder(sdir, web_public_dir=pub)
    assert res["ok"] is True, res["issues"]
    assert res["stats"]["palette_assets_checked"] == 2


def test_validator_flags_off_palette_asset(tmp_path: Path) -> None:
    pub, sdir = _story_with_assets(tmp_path, (1, 2, 3))
    res = validate_story_folder(sdir, web_public_dir=pub)
    assert res["ok"] is False
    assert any("[Off-Palette Asset]" in i and "bg.png" in i for i in res["issues"])


def test_validator_flags_broken_sprite_meta(tmp_path: Path) -> None:
    pub, sdir = _story_with_assets(
        tmp_path,
        get_palette_rgb("ramen_midnight")[0],
        {"frameCount": 3, "clips": {"talk": {"frames": [0, 5]}}, "palette": "snes_rpg"},
    )
    joined = " | ".join(validate_story_folder(sdir, web_public_dir=pub)["issues"])
    assert "[Spritesheet Size Mismatch]" in joined
    assert "[Invalid Sprite Clip]" in joined
    assert "[Sprite Palette Mismatch]" in joined


def test_validator_flags_missing_asset_and_unknown_palette(tmp_path: Path) -> None:
    pub, sdir = _story_with_assets(tmp_path, get_palette_rgb("ramen_midnight")[0])
    story = json.loads((sdir / "story.json").read_text(encoding="utf-8"))
    story["palette"] = "does_not_exist"
    story["assets"]["backgrounds"]["gone"] = "/stories/pal/assets/nope.png"
    (sdir / "story.json").write_text(json.dumps(story), encoding="utf-8")
    joined = " | ".join(validate_story_folder(sdir, web_public_dir=pub)["issues"])
    assert "[Unknown Palette]" in joined
    assert "[Missing Asset] backgrounds/gone" in joined


def test_progress_is_saved_when_engine_fails_mid_batch(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _, story_path = _story(tmp_path)
    calls: list[str] = []

    async def flaky(text: str, speaker_id: int, output_path: str | Path, **kw: Any) -> dict[str, Any]:
        calls.append(text)
        if len(calls) == 2:
            raise RuntimeError("engine crashed")
        _write_wav(Path(output_path), 1.0)
        return {"ok": True, "duration_sec": 1.0}

    monkeypatch.setattr(voicevox_client, "synthesize_line", flaky)
    with pytest.raises(RuntimeError):
        _run(story_path)
    first = json.loads(story_path.read_text(encoding="utf-8"))["scenes"][0]["lines"][0]
    assert first.get("ttsHash") and first["durationSec"] == 1.0  # finished clip was persisted

    res = _run(story_path)  # re-run only synthesizes the clip that failed
    assert res["generated_count"] == 1 and res["skipped_count"] == 1
