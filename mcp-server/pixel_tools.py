"""File-level Mini-PixelLab quality tools (Step 1): depixelize, cleanup, palette extraction."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from PIL import Image

import provenance
from palettes import PALETTES, get_palette_rgb, save_custom_palette
from pixel_processor import quantize_to_palette
from pixel_quality import cleanup_sprite_image, depixelize_image, detect_pixel_grid, extract_palette, quality_metrics


def detect_grid(input_path: str | Path) -> dict[str, Any]:
    """Report the pseudo-pixel grid of an AI pixel-art image (no file written)."""
    inp = Path(input_path).expanduser().resolve()
    with Image.open(inp) as im:
        g = detect_pixel_grid(im)
        g["input_size"] = list(im.size)
    g["input_path"] = str(inp)
    return g


def depixelize(
    input_path: str | Path,
    output_path: str | Path,
    *,
    palette_name: str = "none",
    record_provenance: bool = True,
    source: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Rebuild the TRUE low-res image of an AI pixel-art picture (one pixel per fake pixel)."""
    inp = Path(input_path).expanduser().resolve()
    out = Path(output_path).expanduser().resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(inp) as im:
        small, grid = depixelize_image(im)
    if palette_name != "none":
        small = quantize_to_palette(small, palette_name)
    small.save(out, format="PNG")
    if record_provenance:
        provenance.record("depixelize", {"palette_name": palette_name}, output=out, input_path=inp, source=source)
    return {"ok": True, "output_path": str(out), "native_size": list(small.size), "grid": grid}


def cleanup_sprite(
    input_path: str | Path,
    output_path: str | Path | None = None,
    *,
    despeckle: bool = True,
    outline_color: str | None = "#241712",
    pixel_perfect: bool = True,
    max_colors: int = 0,
    record_provenance: bool = True,
) -> dict[str, Any]:
    """Despeckle + enforce the Art Bible outline + pixel-perfect corners (+ optional colour cap)."""
    inp = Path(input_path).expanduser().resolve()
    out = Path(output_path).expanduser().resolve() if output_path else inp
    with Image.open(inp) as im:
        cleaned, report = cleanup_sprite_image(
            im, despeckle_pass=despeckle, outline_hex=outline_color or None, pixel_perfect=pixel_perfect, max_colors=max_colors
        )
    out.parent.mkdir(parents=True, exist_ok=True)
    cleaned.save(out, format="PNG")
    if record_provenance:
        provenance.record(
            "cleanup_sprite",
            {"despeckle": despeckle, "outline_color": outline_color, "pixel_perfect": pixel_perfect, "max_colors": max_colors},
            output=out,
            input_path=inp,
            in_place=out == inp,
        )
    return {"ok": True, "output_path": str(out), **report}


def sprite_quality(input_path: str | Path, outline_color: str = "#241712") -> dict[str, Any]:
    with Image.open(Path(input_path).expanduser()) as im:
        return quality_metrics(im, outline_color)


def extract_palette_tool(
    image_paths: list[str],
    n_colors: int = 16,
    *,
    base_palette: str = "",
    save_as: str = "",
    description: str = "",
) -> dict[str, Any]:
    """Pick real representative colours from images; optionally extend a base palette and save it."""
    base = get_palette_rgb(base_palette) if base_palette else None
    added = extract_palette([Path(p).expanduser() for p in image_paths], n_colors, base_colors=base)
    colors = ([("#%02x%02x%02x" % c) for c in base] if base else []) + added
    if save_as:
        save_custom_palette(
            save_as,
            colors,
            description or f"Extracted from {len(image_paths)} image(s)" + (f" on top of {base_palette}" if base_palette else ""),
        )
    return {"ok": True, "colors": colors, "added": added, "saved_as": save_as or None, "available": sorted(PALETTES)}
