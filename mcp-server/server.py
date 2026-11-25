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

from content_validator import validate_story_folder
from pixel_processor import (
    list_palettes_info,
    process_pixel_sprite,
    process_sprite_sheet,
)
from voicevox_client import (
    DEFAULT_VOICEVOX_URL,
    check_voicevox_health,
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
    base_url: str = DEFAULT_VOICEVOX_URL,
) -> str:
    """Scan a standalone interactive HTML story (like Hachiko), synthesize VOICEVOX MP3 audio + audio/manifest.json, and auto-generate dictation.json for Daily Dictation mode."""
    result = await generate_standalone_pack(
        html_path=html_path,
        story_id=story_id,
        title_ja=title_ja,
        title_vi=title_vi,
        level=level,
        speaker_id=speaker_id,
        speed_scale=speed_scale,
        force=force,
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
    """Validate a story folder for 100% Furigana coverage on Kanji, existing audio files, valid quiz answers, and catalog registration in stories/index.json."""
    result = validate_story_folder(story_dir=story_dir, web_public_dir=web_public_dir)
    return json.dumps(result, ensure_ascii=False, indent=2)


# ---------------------------------------------------------------------------
# Mini-PixelLab Tools
# ---------------------------------------------------------------------------


@mcp.tool()
def pixellab_list_palettes() -> str:
    """List all built-in retro Japanese pixel-art color palettes."""
    return json.dumps(list_palettes_info(), ensure_ascii=False, indent=2)


@mcp.tool()
def pixellab_clean_sprite(
    input_path: str,
    output_path: str,
    target_width: int = 48,
    target_height: int = 64,
    palette_name: str = "midnight_tokyo",
    bg_mode: str = "auto",
    tolerance: int = 48,
    align_bottom: bool = True,
) -> str:
    """Convert an AI-generated character or prop image into a crisp, transparent, palette-locked pixel-art sprite PNG."""
    result: dict[str, Any] = process_pixel_sprite(
        input_path=input_path,
        output_path=output_path,
        target_width=target_width,
        target_height=target_height,
        palette_name=palette_name,
        bg_mode=bg_mode,
        tolerance=tolerance,
        align_bottom=align_bottom,
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
    palette_name: str = "midnight_tokyo",
    bg_mode: str = "auto",
    tolerance: int = 48,
    align_bottom: bool = True,
) -> str:
    """Clean, snap to pixel grid, palette-lock, and slice a raw AI spritesheet grid into a uniform horizontal spritesheet.png + meta.json."""
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
    )
    return json.dumps(result, ensure_ascii=False, indent=2)


def main() -> None:
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
