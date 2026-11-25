# jp-pixel-story Unified Art Style Bible

To ensure every background, character portrait, and interactive item looks as if drawn by the **same indie pixel artist**, EVERY generated image MUST obey these 4 strict rules:

## 1. Master Style DNA (Append to EVERY Image Prompt)

```text
Cozy 16-bit Japanese retro adventure game pixel art (classic GBA / Coffee Talk / Eastward aesthetic).
Warm dark espresso-brown outlines (#241712) — NEVER harsh pure black (#000000).
Crisp chunky pixel clusters, clean 3-tone cel shading, cozy nostalgic lighting.
NO text, NO watermarks, NO speech bubbles, NO UI frames, NO blurry bloom gradients.
```

## 2. Master Palette Lock (`ramen_midnight` — 24 colors)

All generated assets MUST be post-processed through **Mini-PixelLab MCP** locked to the same palette (`palette_name="ramen_midnight"` in `mcp-server/palettes.py`):
- **Backgrounds (`320×200`):** `pixellab_clean_background(..., dither_strength=18.0)` — subtle Bayer 4×4 dithering preserves warm lantern/sky glow without harsh color banding.
- **Character Portraits (`96×96`) & Hero Items (`48×48` or `64×64`):** `pixellab_clean_sprite` or `pixellab_slice_spritesheet(..., bg_mode="chroma_green")` — crisp cel-shading with hard binary transparency (zero fuzzy halo!).

## 3. Consistent Texel Density (Virtual Grid `320×200`)

| Asset Type | Final Processed Size | Chroma Backdrop |
| :--- | :--- | :--- |
| Scene Background | `320×200` PNG | None (full scene) |
| Character Portrait (expression sheet) | `96×96` per frame (`3×1` or `4×1`) | Pure `#00FF00` green |
| Hero Interactive Item (ramen bowl, ticket...) | `64×64` PNG | Pure `#00FF00` green |
| Small Topping / Prop Item | `32×32` PNG | Pure `#00FF00` green |

## 4. Style & Character Anchor Reference Rule

- Store verified master references in `web/public/assets/style-ref/` (`ref_background.png`, `ref_minh.png`).
- Whenever generating a new background, secondary character, or item set, ALWAYS pass the anchor reference image alongside the prompt with:
  > *"Match the EXACT pixel art style, warm espresso outline color (#241712), pixel density, and shading warmth of the attached reference image."*
