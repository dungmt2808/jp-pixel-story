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

import provenance
from art_manifest import apply_art_manifest
from pixel_extract import extract_object
from content_validator import validate_catalog, validate_story_folder
from pixel_rig import add_expression, build_rig, lock_expressions
from pixel_tools import cleanup_sprite, depixelize, detect_grid, extract_palette_tool, sprite_quality
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
    grid: str = "auto",
    source: dict[str, Any] | None = None,
) -> str:
    """Convert an AI-generated scene illustration into a crisp 320x200 pixel-art background locked to a Master Palette with subtle retro Bayer ordered dithering."""
    result: dict[str, Any] = process_pixel_background(
        input_path=input_path,
        output_path=output_path,
        target_width=target_width,
        target_height=target_height,
        palette_name=palette_name,
        dither_strength=dither_strength,
        grid=grid,
        source=source,
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
    grid: str = "auto",
    cleanup: bool = True,
    outline_color: str = "#241712",
    source: dict[str, Any] | None = None,
) -> str:
    """Convert an AI-generated character or prop image into a crisp, transparent, palette-locked pixel-art sprite PNG.

    Proportions are always preserved. fit_mode='bbox' fits the visible subject into the cell;
    fit_mode='frame' keeps the source framing. grid='auto' rebuilds the true pixels of AI
    pixel-art inputs first (skipped automatically for non-pixel-art images). cleanup=True
    despeckles, enforces the Art Bible outline colour and removes double outline corners.
    `source` (prompt / model / seed) is stored in provenance.json next to the output.
    For several expressions/poses of ONE character use pixellab_slice_spritesheet instead.
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
        grid=grid,
        cleanup=cleanup,
        outline_color=outline_color or None,
        source=source,
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
    grid: str = "auto",
    cleanup: bool = True,
    outline_color: str = "#241712",
    lock_expressions: bool = False,
    source: dict[str, Any] | None = None,
    facing: str = "",
    split: str = "grid",
    pixel_pitch: float = 0.0,
) -> str:
    """Slice a raw AI spritesheet grid into registered, palette-locked animation frames + spritesheet.png + meta.json.

    All frames share one scale and one anchor (no stretching or jitter). registration='centroid'
    corrects AI sheets whose character drifts between cells (full body); registration='bust' does the
    same for portrait/expression sheets cut off at the cell edge (anchors on the head).
    clips maps a name to frame indices, e.g. {"idle": [0, 2], "talk": {"frames": [0, 1], "fps": 10}}.
    lock_expressions=True (expression sheets) copies the base frame everywhere except the face
    region, so clothes/hair never flicker when frames swap. grid/cleanup as in pixellab_clean_sprite.
    Full-body walkers (route B `sprite:<key>` people): registration='centroid', facing='right' (the way the
    sheet looks) and a walk clip with stridePx, e.g. {"walk": {"frames": [0,1,2,3,4,5,6,7], "fps": 10,
    "stridePx": 24}}: the player then picks walk frames by distance travelled, so feet never slide.
    split='gaps' finds unevenly spaced figures in one row by the empty columns between them (cols = how
    many); pixel_pitch (source px per drawn pixel) fixes the scale so all sheets of a story match.
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
        grid=grid,
        cleanup=cleanup,
        outline_color=outline_color or None,
        lock_expressions=lock_expressions,
        source=source,
        facing=facing,
        split=split,
        pixel_pitch=pixel_pitch,
    )
    return json.dumps(result, ensure_ascii=False, indent=2)


# ---------------------------------------------------------------------------------------------
# Step 1: quality tools
# ---------------------------------------------------------------------------------------------


@mcp.tool()
def pixellab_detect_grid(input_path: str) -> str:
    """Measure the fake-pixel grid (pitch + offset) of an AI pixel-art image and say whether it is real pixel art."""
    return json.dumps(detect_grid(input_path), ensure_ascii=False, indent=2)


@mcp.tool()
def pixellab_depixelize(
    input_path: str, output_path: str, palette_name: str = "none", source: dict[str, Any] | None = None
) -> str:
    """Rebuild the TRUE low-res image of an AI pixel-art picture: one output pixel per fake pixel (no broken lines)."""
    return json.dumps(depixelize(input_path, output_path, palette_name=palette_name, source=source), ensure_ascii=False, indent=2)


@mcp.tool()
def pixellab_cleanup_sprite(
    input_path: str,
    output_path: str = "",
    despeckle: bool = True,
    outline_color: str = "#241712",
    pixel_perfect: bool = True,
    max_colors: int = 0,
) -> str:
    """Clean an existing sprite: remove noise specks, force the Art Bible outline colour, remove double outline corners, optionally cap the colour count. Reports before/after quality."""
    res = cleanup_sprite(
        input_path, output_path or None, despeckle=despeckle, outline_color=outline_color or None,
        pixel_perfect=pixel_perfect, max_colors=max_colors,
    )
    return json.dumps(res, ensure_ascii=False, indent=2)


@mcp.tool()
def pixellab_sprite_quality(input_path: str, outline_color: str = "#241712") -> str:
    """Report orphan-pixel ratio, outline compliance and colour count of a sprite."""
    return json.dumps(sprite_quality(input_path, outline_color), ensure_ascii=False, indent=2)


@mcp.tool()
def pixellab_extract_palette(
    image_paths: list[str], n_colors: int = 16, base_palette: str = "", save_as: str = "", description: str = ""
) -> str:
    """Pick real representative colours from images (optionally extending a base palette) and save them as a new palette."""
    res = extract_palette_tool(image_paths, n_colors, base_palette=base_palette, save_as=save_as, description=description)
    return json.dumps(res, ensure_ascii=False, indent=2)


@mcp.tool()
def pixellab_extract_object(
    input_path: str,
    output_path: str,
    rect: list[int],
    part: str = "sprite",
    polygon: list[list[float]] | None = None,
    exclude: list[list[int]] | None = None,
    tolerance: float = 10.0,
    max_gap: int = 3,
    inpaint: str = "clone",
) -> str:
    """Cut an object out of a background so it can move (route C). part="sprite" writes the object on
    transparency (thin occluders like window mullions healed); part="clean" writes the background
    with the hole filled. Without `polygon` a magic wand from the rect border is used (flat pixel
    art); with `polygon` (lasso) + `exclude` rects it works on full-resolution AI source art.
    Usually driven by the `objects` section of art.json (pixellab_apply_art_manifest)."""
    res = extract_object(input_path, output_path, rect=rect, part=part, polygon=polygon, exclude=exclude,
                         tolerance=tolerance, max_gap=max_gap, inpaint=inpaint)
    return json.dumps(res, ensure_ascii=False, indent=2)


@mcp.tool()
def pixellab_apply_art_manifest(manifest_path: str, dry_run: bool = False) -> str:
    """Process every raw image listed in `art-src/<story>/art.json` that exists (grid detection,
    320x200, palette lock, provenance) and point the listed scenes/choices at the new `bg:<key>`
    backgrounds in story.json. Missing raw files are listed under `waiting_for_art`."""
    return json.dumps(apply_art_manifest(manifest_path, dry_run=dry_run), ensure_ascii=False, indent=2)


@mcp.tool()
def pixellab_reprocess(provenance_path: str, names: list[str] | None = None) -> str:
    """Replay the recorded processing of assets (provenance.json) and check the results are byte-identical."""
    return json.dumps(provenance.reprocess(provenance_path, names), ensure_ascii=False, indent=2)


# ---------------------------------------------------------------------------------------------
# Step 2: character tools
# ---------------------------------------------------------------------------------------------


@mcp.tool()
def pixellab_lock_expressions(sheet_dir: str, region: list[int] | None = None, base_frame: int = 0) -> str:
    """Make every frame of an expression sheet identical to the base frame outside the face region (auto-detected or [x0, y0, x1, y1]) -> no body flicker."""
    res = lock_expressions(sheet_dir, region=region or "auto", base_frame=base_frame)
    return json.dumps(res, ensure_ascii=False, indent=2)


@mcp.tool()
def pixellab_add_expression(sheet_dir: str, patch_path: str, x: int, y: int, clip: str = "") -> str:
    """Append a new expression frame = base frame + a small patch (e.g. sad mouth) at (x, y); optionally add it to a clip."""
    return json.dumps(add_expression(sheet_dir, patch_path, x=x, y=y, clip=clip), ensure_ascii=False, indent=2)


@mcp.tool()
def pixellab_build_rig(sheet_dir: str, out_dir: str = "", neck_row: int | None = None, neck_extension: int = 3) -> str:
    """Split a bust expression sheet at the neck into head frames + body + rig.json so the engine can breathe / nod / bob the head without new art."""
    res = build_rig(sheet_dir, out_dir or None, neck_row=neck_row, neck_extension=neck_extension)
    return json.dumps(res, ensure_ascii=False, indent=2)


def main() -> None:
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
