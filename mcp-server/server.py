"""jp-pixel-studio Local MCP Server.

Exposes two local toolkits to AI Coding Agents (Antigravity & Claude Code):
1. VOICEVOX Japanese TTS tools (powered by your local VOICEVOX engine on port 50021).
2. Mini-PixelLab tools (background removal, pixel-grid snapping, Lospec palette lock, spritesheet slicing).
"""

from __future__ import annotations

import json
from typing import Any

try:
    from mcp.server.mcpserver import MCPServer as FastMCP
except ImportError:
    from mcp.server.fastmcp import FastMCP  # type: ignore[no-redef]

from content_validator import validate_catalog, validate_story_folder
from pixel_processor import (
    clean_exam_image,
    list_palettes_info,
    process_pixel_background,
    relock_palette,
    process_pixel_sprite,
    process_sprite_sheet,
)
from voicevox_client import (
    DEFAULT_VOICEVOX_URL,
    check_voicevox_health,
    generate_dokkai_audio,
    generate_standalone_pack,
    generate_story_audio,
    list_speakers,
    synthesize_line,
)

mcp = FastMCP("jp-pixel-studio")


# ---------------------------------------------------------------------------
# VOICEVOX Tools
# ---------------------------------------------------------------------------


@mcp.tool()
async def voicevox_health(base_url: str = DEFAULT_VOICEVOX_URL) -> str:
    """Check if the local VOICEVOX engine is running and return its version."""
    result = await check_voicevox_health(base_url=base_url)
    return json.dumps(result, ensure_ascii=False, indent=2)


@mcp.tool()
async def voicevox_list_speakers(base_url: str = DEFAULT_VOICEVOX_URL) -> str:
    """List available Japanese VOICEVOX characters and their numeric speaker style IDs."""
    speakers = await list_speakers(base_url=base_url)
    return json.dumps(speakers, ensure_ascii=False, indent=2)


@mcp.tool()
async def voicevox_synthesize_line(
    text: str,
    speaker_id: int,
    output_path: str,
    speed_scale: float = 0.94,
    pitch_scale: float = 0.0,
    intonation_scale: float = 1.05,
    base_url: str = DEFAULT_VOICEVOX_URL,
) -> str:
    """Synthesize a single Japanese sentence to a WAV file using local VOICEVOX and return exact duration_sec."""
    result = await synthesize_line(
        text=text,
        speaker_id=speaker_id,
        output_path=output_path,
        speed_scale=speed_scale,
        pitch_scale=pitch_scale,
        intonation_scale=intonation_scale,
        base_url=base_url,
    )
    return json.dumps(result, ensure_ascii=False, indent=2)


@mcp.tool()
async def voicevox_generate_story_audio(
    story_json_path: str,
    force: bool = False,
    audio_format: str = "mp3",
    base_url: str = DEFAULT_VOICEVOX_URL,
) -> str:
    """Batch-generate all Japanese VOICEVOX audio files (mp3 or wav) for a story.json file and automatically write durationSec back."""
    result = await generate_story_audio(
        story_json_path=story_json_path,
        force=force,
        audio_format=audio_format,
        base_url=base_url,
    )
    return json.dumps(result, ensure_ascii=False, indent=2)


@mcp.tool()
async def voicevox_generate_standalone_pack(
    html_path: str,
    story_id: str,
    title_ja: str,
    title_vi: str,
    level: str = "JLPT N4",
    speaker_id: int = 13,
    speed_scale: float = 0.91,
    force: bool = False,
    rebuild_dictation: bool = False,
    base_url: str = DEFAULT_VOICEVOX_URL,
) -> str:
    """Scan a standalone interactive HTML story (like Hachiko), synthesize VOICEVOX MP3 audio + audio/manifest.json, and auto-generate dictation.json for Daily Dictation mode.

    Hash-aware (only new/edited lines are synthesized) and merge-safe (hand-made manifest entries,
    per-entry speaker overrides and an existing dictation.json are preserved unless rebuild_dictation=True)."""
    result = await generate_standalone_pack(
        html_path=html_path,
        story_id=story_id,
        title_ja=title_ja,
        title_vi=title_vi,
        level=level,
        speaker_id=speaker_id,
        speed_scale=speed_scale,
        force=force,
        rebuild_dictation=rebuild_dictation,
        base_url=base_url,
    )
    return json.dumps(result, ensure_ascii=False, indent=2)


@mcp.tool()
async def voicevox_generate_dokkai_audio(
    dokkai_json_path: str,
    force: bool = False,
    audio_format: str = "mp3",
    base_url: str = DEFAULT_VOICEVOX_URL,
) -> str:
    """Batch-generate Japanese VOICEVOX MP3/WAV audio for every sentence in a JLPT dokkai.json file and write audioUrl + durationSec back."""
    result = await generate_dokkai_audio(
        dokkai_json_path=dokkai_json_path,
        force=force,
        audio_format=audio_format,
        base_url=base_url,
    )
    return json.dumps(result, ensure_ascii=False, indent=2)


# ---------------------------------------------------------------------------
# Content QA Tool
# ---------------------------------------------------------------------------


@mcp.tool()
def story_validate_content(
    story_dir: str,
    web_public_dir: str | None = None,
) -> str:
    """Validate a story folder for 100% Furigana coverage on Kanji, existing audio files, valid quiz/gengo answers, and catalog registration in stories/index.json."""
    result = validate_story_folder(story_dir=story_dir, web_public_dir=web_public_dir)
    return json.dumps(result, ensure_ascii=False, indent=2)


@mcp.tool()
def story_validate_catalog(
    stories_root: str,
    web_public_dir: str | None = None,
) -> str:
    """Validate EVERY lesson registered in stories/index.json and report any orphan folders, missing Furigana, missing audio, or invalid quiz indices."""
    result = validate_catalog(stories_root=stories_root, web_public_dir=web_public_dir)
    return json.dumps(result, ensure_ascii=False, indent=2)


# ---------------------------------------------------------------------------
# Mini-PixelLab & JLPT Image Tools
# ---------------------------------------------------------------------------


@mcp.tool()
def jlpt_clean_exam_image(
    input_path: str,
    output_path: str,
    saturation_threshold: int = 18,
    min_brightness: int = 145,
) -> str:
    """Strip colored watermarks (e.g., green/blue/yellow academy overlays) from black-and-white JLPT exam illustration cards while preserving crisp black line art."""
    result = clean_exam_image(
        input_path=input_path,
        output_path=output_path,
        saturation_threshold=saturation_threshold,
        min_brightness=min_brightness,
    )
    return json.dumps(result, ensure_ascii=False, indent=2)


@mcp.tool()
def pixellab_list_palettes() -> str:
    """List all built-in retro Japanese pixel-art color palettes."""
    return json.dumps(list_palettes_info(), ensure_ascii=False, indent=2)


@mcp.tool()
def pixellab_relock_palette(
    input_path: str,
    output_path: str = "",
    palette_name: str = "jp_story_master",
) -> str:
    """Re-lock an existing pixel-art PNG (background, portrait, item or spritesheet) to a palette without resizing.

    Use it to fix '[Off-Palette Asset]' validator issues. Overwrites the input when output_path is empty."""
    result = relock_palette(input_path, output_path or None, palette_name=palette_name)
    return json.dumps(result, ensure_ascii=False, indent=2)


@mcp.tool()
def pixellab_clean_background(
    input_path: str,
    output_path: str,
    target_width: int = 320,
    target_height: int = 200,
    palette_name: str = "jp_story_master",
    dither_strength: float = 18.0,
) -> str:
    """Convert an AI-generated scene illustration into a crisp 320x200 pixel-art background locked to a Master Palette with subtle retro Bayer ordered dithering."""
    result: dict[str, Any] = process_pixel_background(
        input_path=input_path,
        output_path=output_path,
        target_width=target_width,
        target_height=target_height,
        palette_name=palette_name,
        dither_strength=dither_strength,
    )
    return json.dumps(result, ensure_ascii=False, indent=2)


@mcp.tool()
def pixellab_clean_sprite(
    input_path: str,
    output_path: str,
    target_width: int = 48,
    target_height: int = 64,
    palette_name: str = "jp_story_master",
    bg_mode: str = "auto",
    tolerance: int = 48,
    align_bottom: bool = True,
    fit_mode: str = "bbox",
) -> str:
    """Convert an AI-generated character or prop image into a crisp, transparent, palette-locked pixel-art sprite PNG.

    Proportions are always preserved. fit_mode='bbox' fits the visible subject into the cell;
    fit_mode='frame' keeps the source framing (centre-cropped to the cell aspect ratio).
    For several expressions/poses of ONE character use pixellab_slice_spritesheet instead,
    so all frames share one scale and anchor.
    """
    result: dict[str, Any] = process_pixel_sprite(
        input_path=input_path,
        output_path=output_path,
        target_width=target_width,
        target_height=target_height,
        palette_name=palette_name,
        bg_mode=bg_mode,
        tolerance=tolerance,
        align_bottom=align_bottom,
        fit_mode=fit_mode,
    )
    return json.dumps(result, ensure_ascii=False, indent=2)


@mcp.tool()
def pixellab_slice_spritesheet(
    input_path: str,
    output_dir: str,
    cols: int = 4,
    rows: int = 1,
    frame_width: int = 48,
    frame_height: int = 64,
    palette_name: str = "jp_story_master",
    bg_mode: str = "auto",
    tolerance: int = 48,
    align_bottom: bool = True,
    registration: str = "cell",
    fps: float = 8.0,
    clips: dict[str, Any] | None = None,
) -> str:
    """Slice a raw AI spritesheet grid into registered, palette-locked animation frames + spritesheet.png + meta.json.

    All frames share one scale and one anchor (no stretching or jitter). registration='centroid'
    corrects AI sheets whose character drifts between cells (full body); registration='bust' does the
    same for portrait/expression sheets cut off at the cell edge (anchors on the head). clips maps a name to frame indices,
    e.g. {"idle": [0, 2], "talk": {"frames": [0, 1], "fps": 10}}; meta.json stores pivot, fps
    and clips for the web SpriteAnimator.
    """
    result = process_sprite_sheet(
        input_path=input_path,
        output_dir=output_dir,
        cols=cols,
        rows=rows,
        frame_width=frame_width,
        frame_height=frame_height,
        palette_name=palette_name,
        bg_mode=bg_mode,
        tolerance=tolerance,
        align_bottom=align_bottom,
        registration=registration,
        fps=fps,
        clips=clips,
    )
    return json.dumps(result, ensure_ascii=False, indent=2)


def main() -> None:
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
