"""Curated retro pixel-art color palettes inspired by classic JRPGs and Japanese night scenes."""

from __future__ import annotations

PALETTES: dict[str, dict[str, object]] = {
    "midnight_tokyo": {
        "description": "Deep indigo Tokyo night sky, warm konbini amber, soft sakura pink & cream highlights.",
        "colors": [
            "#0b0e1a",  # deep night ink
            "#151b30",  # midnight navy
            "#222c4a",  # urban slate blue
            "#37476e",  # skyline mid blue
            "#5a6f9c",  # misty blue highlight
            "#9ab0d6",  # moonlight blue
            "#f5f1e6",  # warm cream white
            "#ffd875",  # warm streetlight gold
            "#f29f3d",  # konbini amber orange
            "#c95c2e",  # brick/terracotta
            "#6e2d24",  # dark wood shadow
            "#3b2421",  # deep espresso outline
            "#e86a82",  # neon sakura coral
            "#9b4dca",  # retro accent purple
            "#46b89d",  # konbini mint green
            "#226e68",  # deep teal shadow
            "#f5cba7",  # light skin tone
            "#d99b72",  # shaded skin tone
            "#8c5a3c",  # brown hair / counter wood
            "#4d3326",  # dark hair / shadow
        ],
    },
    "konbini_warm": {
        "description": "Cozy late-night convenience store interior: warm wood, fluorescent white, mint & salmon tones.",
        "colors": [
            "#12131c",
            "#24283b",
            "#3c4563",
            "#6a7799",
            "#b8c2d9",
            "#faf6eb",
            "#ffe699",
            "#f4a261",
            "#e76f51",
            "#a83c32",
            "#5e2c25",
            "#2a9d8f",
            "#70d6b8",
            "#1d5c57",
            "#f2c6a0",
            "#d4956a",
            "#7a4b32",
            "#3d251b",
            "#8f5be8",
            "#e87ea1",
        ],
    },
    "kyoto_autumn": {
        "description": "Traditional Kyoto wooden streets, vermilion torii gates, maple red and twilight blue.",
        "colors": [
            "#141019",
            "#291f33",
            "#483a59",
            "#7a6b8c",
            "#c7bdd4",
            "#f7f2e7",
            "#f2d08a",
            "#e69138",
            "#c9452c",
            "#8a2420",
            "#4a1619",
            "#7d5a3c",
            "#4f3524",
            "#2b1b14",
            "#698c4f",
            "#3a5732",
            "#f0c29e",
            "#cf9069",
        ],
    },
    "snes_rpg": {
        "description": "Classic 16-bit Japanese RPG balanced 24-color palette.",
        "colors": [
            "#0f0f1b",
            "#262b44",
            "#3a4466",
            "#5a6988",
            "#8b9bb4",
            "#c0cbdc",
            "#ffffff",
            "#ff0044",
            "#a22633",
            "#e43b44",
            "#f77622",
            "#feae34",
            "#fee761",
            "#63c74d",
            "#3e8948",
            "#265c42",
            "#193c3e",
            "#0099db",
            "#124e89",
            "#68386c",
            "#b55088",
            "#f6757a",
            "#e8b796",
            "#c28569",
        ],
    },
}


def hex_to_rgb(hex_color: str) -> tuple[int, int, int]:
    """Convert a #RRGGBB hex string into an (R, G, B) tuple."""
    h = hex_color.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


def get_palette_rgb(name: str) -> list[tuple[int, int, int]]:
    """Return a list of (R, G, B) tuples for a named palette."""
    if name not in PALETTES:
        available = ", ".join(sorted(PALETTES.keys()))
        raise ValueError(f"Unknown palette '{name}'. Available: {available}")
    colors = PALETTES[name]["colors"]
    assert isinstance(colors, list)
    return [hex_to_rgb(c) for c in colors]
