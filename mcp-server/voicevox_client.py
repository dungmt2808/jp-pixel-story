"""Client for local VOICEVOX Engine HTTP API (default: http://127.0.0.1:50021)."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
import wave
from pathlib import Path
from typing import Any

import httpx

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

        # Adjust prosody for Japanese learners (slightly slower & clear intonation)
        query["speedScale"] = speed_scale
        query["pitchScale"] = pitch_scale
        query["intonationScale"] = intonation_scale
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


async def generate_story_audio(
    story_json_path: str | Path,
    *,
    force: bool = False,
    audio_format: str = "mp3",
    base_url: str = DEFAULT_VOICEVOX_URL,
) -> dict[str, Any]:
    """Batch-generate VOICEVOX audio files (mp3 or wav) for all lines in story.json and update durations."""
    story_file = Path(story_json_path).expanduser().resolve()
    story = json.loads(story_file.read_text(encoding="utf-8"))

    story_dir = story_file.parent
    audio_dir = story_dir / "audio"
    audio_dir.mkdir(parents=True, exist_ok=True)

    ext = "mp3" if (audio_format == "mp3" and shutil.which("ffmpeg")) else "wav"
    story_id = story.get("id", story_dir.name)
    voices: dict[str, dict[str, Any]] = story.get("voices", {})
    generated: list[dict[str, Any]] = []
    skipped: list[str] = []

    async def process_line_obj(line: dict[str, Any], default_id: str) -> None:
        tts_text = line.get("ttsText") or line.get("jaPlain")
        if not tts_text:
            return
        line_id = line.get("id") or default_id
        voice_key = line.get("voice", "narrator")
        voice_cfg = voices.get(voice_key, {"speakerId": 13, "speedScale": 0.94})
        speaker_id = int(voice_cfg.get("speakerId", 13))
        speed_scale = float(line.get("speedScale", voice_cfg.get("speedScale", 0.94)))
        pitch_scale = float(voice_cfg.get("pitchScale", 0.0))
        intonation_scale = float(voice_cfg.get("intonationScale", 1.05))

        out_name = f"{line_id}.{ext}"
        out_path = audio_dir / out_name

        if out_path.exists() and not force:
            duration_sec = (
                get_wav_duration_sec(out_path)
                if ext == "wav"
                else float(line.get("durationSec") or 0.0)
            )
            skipped.append(out_name)
        else:
            if ext == "mp3":
                with tempfile.TemporaryDirectory() as td:
                    tmp_wav = Path(td) / f"{line_id}.wav"
                    res = await synthesize_line(
                        text=tts_text,
                        speaker_id=speaker_id,
                        output_path=tmp_wav,
                        speed_scale=speed_scale,
                        pitch_scale=pitch_scale,
                        intonation_scale=intonation_scale,
                        base_url=base_url,
                    )
                    _convert_wav_to_mp3(tmp_wav, out_path)
                    duration_sec = res["duration_sec"]
            else:
                res = await synthesize_line(
                    text=tts_text,
                    speaker_id=speaker_id,
                    output_path=out_path,
                    speed_scale=speed_scale,
                    pitch_scale=pitch_scale,
                    intonation_scale=intonation_scale,
                    base_url=base_url,
                )
                duration_sec = res["duration_sec"]
            generated.append(
                {
                    "file": out_name,
                    "speaker_id": speaker_id,
                    "duration_sec": duration_sec,
                    "text": tts_text,
                }
            )

        line["audioUrl"] = f"/stories/{story_id}/audio/{out_name}"
        line["durationSec"] = duration_sec

    # 1. Process scene lines & branch responses
    for s_idx, scene in enumerate(story.get("scenes", [])):
        for l_idx, line in enumerate(scene.get("lines", [])):
            await process_line_obj(line, f"s{s_idx+1:02d}_l{l_idx+1:02d}")

        minigame = scene.get("minigame")
        if isinstance(minigame, dict):
            for c_idx, choice in enumerate(minigame.get("choices", [])):
                if isinstance(choice.get("responseLine"), dict):
                    await process_line_obj(
                        choice["responseLine"], f"s{s_idx+1:02d}_c{c_idx+1:02d}"
                    )

    # 2. Process reading passage sentences (for click-to-listen in ReadingView)
    reading = story.get("reading")
    if isinstance(reading, dict):
        for p_idx, sent in enumerate(reading.get("sentences", [])):
            await process_line_obj(sent, f"read_{p_idx+1:02d}")

    story_file.write_text(
        json.dumps(story, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return {
        "ok": True,
        "story_json": str(story_file),
        "audio_dir": str(audio_dir),
        "generated_count": len(generated),
        "skipped_count": len(skipped),
        "generated": generated,
    }
