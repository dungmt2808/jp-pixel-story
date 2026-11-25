"""Tests for Mini-PixelLab sprite processing and VOICEVOX local integration."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from palettes import get_palette_rgb
from pixel_processor import process_pixel_sprite, process_sprite_sheet
from voicevox_client import check_voicevox_health, synthesize_line


def _create_mock_ai_character(width: int = 256, height: int = 256, bg=(0, 255, 0)) -> Image.Image:
    """Create a noisy high-res character on a green backdrop with soft edges (simulating raw AI output)."""
    img = Image.new("RGB", (width, height), bg)
    draw = ImageDraw.Draw(img)
    # Head
    draw.ellipse((88, 30, 168, 110), fill=(245, 200, 165), outline=(45, 25, 20), width=6)
    # Eyes (white inside face — must NOT be removed by border flood-fill!)
    draw.rectangle((108, 60, 120, 74), fill=(255, 255, 255))
    draw.rectangle((136, 60, 148, 74), fill=(255, 255, 255))
    # Body
    draw.rectangle((92, 112, 164, 198), fill=(52, 84, 142), outline=(25, 25, 40), width=5)
    # Legs
    draw.rectangle((98, 198, 124, 240), fill=(40, 42, 60))
    draw.rectangle((132, 198, 158, 240), fill=(40, 42, 60))
    return img


def test_clean_single_sprite(tmp_path: Path) -> None:
    raw_path = tmp_path / "raw_char.png"
    out_path = tmp_path / "clean_char.png"
    _create_mock_ai_character().save(raw_path)

    res = process_pixel_sprite(
        raw_path,
        out_path,
        target_width=32,
        target_height=40,
        palette_name="midnight_tokyo",
        bg_mode="chroma_green",
    )

    assert res["ok"] is True
    assert out_path.exists()

    out = Image.open(out_path).convert("RGBA")
    assert out.size == (32, 40)

    arr = np.array(out)
    # Corners must be transparent
    assert arr[0, 0, 3] == 0
    assert arr[0, -1, 3] == 0
    # Must contain visible pixels
    visible_pixels = arr[arr[:, :, 3] == 255][:, :3]
    assert len(visible_pixels) > 80

    # Every visible pixel must belong strictly to midnight_tokyo palette
    allowed = set(get_palette_rgb("midnight_tokyo"))
    for px in visible_pixels:
        assert tuple(int(c) for c in px) in allowed


def test_slice_spritesheet(tmp_path: Path) -> None:
    sheet = Image.new("RGB", (512, 128), (255, 255, 255))
    for i in range(4):
        frame = _create_mock_ai_character(128, 128, bg=(255, 255, 255))
        sheet.paste(frame, (i * 128, 0))

    raw_sheet = tmp_path / "raw_walk.png"
    sheet.save(raw_sheet)

    out_dir = tmp_path / "walk_out"
    res = process_sprite_sheet(
        raw_sheet,
        out_dir,
        cols=4,
        rows=1,
        frame_width=32,
        frame_height=32,
        palette_name="konbini_warm",
        bg_mode="white",
    )

    assert res["ok"] is True
    assert res["frame_count"] == 4
    strip = Image.open(out_dir / "spritesheet.png")
    assert strip.size == (128, 32)
    meta = json.loads((out_dir / "meta.json").read_text(encoding="utf-8"))
    assert meta["frameCount"] == 4
    assert meta["frameWidth"] == 32


def test_voicevox_live_if_running(tmp_path: Path) -> None:
    health = asyncio.run(check_voicevox_health())
    if not health.get("ok"):
        return  # Skip gracefully when VOICEVOX is not open

    wav_out = tmp_path / "hello.wav"
    res = asyncio.run(
        synthesize_line("いらっしゃいませ！", speaker_id=13, output_path=wav_out)
    )
    assert res["ok"] is True
    assert wav_out.exists()
    assert res["duration_sec"] > 0.3


def test_validate_real_repo_stories() -> None:
    from content_validator import validate_story_folder

    stories_root = Path(__file__).resolve().parents[2] / "web" / "public" / "stories"
    for story_id in ("konbini-onigiri", "hachiko"):
        res = validate_story_folder(stories_root / story_id)
        assert res["ok"] is True, f"Validation failed for {story_id}: {res['issues']}"
        assert res["registered_in_catalog"] is True
        assert res["stats"]["audio_checked"] >= 14
