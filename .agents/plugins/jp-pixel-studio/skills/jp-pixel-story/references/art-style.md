# jp-pixel-story Unified Art Style Bible

To ensure every background, character portrait, and interactive item looks as if drawn by the **same indie pixel artist**, EVERY generated image MUST obey these 4 strict rules:

## 1. Master Style DNA (Append to EVERY Image Prompt)

```text
Cozy 16-bit Japanese retro adventure game pixel art (classic GBA / Coffee Talk / Eastward aesthetic).
Warm dark espresso-brown outlines (#241712) — NEVER harsh pure black (#000000).
Crisp chunky pixel clusters, clean 3-tone cel shading, cozy nostalgic lighting.
NO text, NO watermarks, NO speech bubbles, NO UI frames, NO blurry bloom gradients.
```

## 2. Master Palette Lock (`jp_story_master` — 40 colors)

All generated assets MUST be post-processed through **Mini-PixelLab MCP** locked to the master palette
(`palette_name="jp_story_master"`, the tools' default; defined in `mcp-server/palettes.py`). It is the 24 `ramen_midnight`
colors + 12 neutral greys / slate blues / earth browns + 4 seasonal accents (sakura pinks, spring green), so ramen-era
assets remain compliant. `story_validate_catalog` fails on any `[Off-Palette Asset]`; fix with `pixellab_relock_palette`.
Colour matching is perceptual (OKLab).
- **Backgrounds (`320×200`):** `pixellab_clean_background(..., dither_strength=18.0)` — subtle Bayer 4×4 dithering.
- **Characters:** one expression sheet per character via `pixellab_slice_spritesheet(..., bg_mode="chroma_green", registration="bust")`
  — shared scale + anchor across frames (no stretch, no jitter), hard binary alpha, `meta.json` with pivot/fps/clips.
- **Props / single images:** `pixellab_clean_sprite` (aspect ratio preserved; `fit_mode="frame"` keeps the source framing).

## 3. Consistent Texel Density (Virtual Grid `320×200`)

| Asset Type | Final Processed Size | Chroma Backdrop |
| :--- | :--- | :--- |
| Scene Background | `320×200` PNG | None (full scene) |
| Character expression sheet | `96×96` per frame, `4×1` (neutral, talk, blink, happy) | Pure `#00FF00` green |
| Hero Interactive Item (ramen bowl, ticket...) | `64×64` PNG | Pure `#00FF00` green |
| Small Topping / Prop Item | `32×32` PNG | Pure `#00FF00` green |

Runtime rules (enforced by the engine helpers, never bypass them with raw `ctx.drawImage` sizes):
- Only whole-number scales: `drawPixelImage` snaps upscales to 1×/2×/3× and mode-resamples downscales (no new colours);
  `drawSpriteFrame` takes an integer scale; camera zooms use `drawPixelZoom` (1× → 2× snap, no sub-pixel Ken Burns).
- The stage draws into a 320×200 buffer and presents it at an integer multiple, so pixels stay square at any window size.

## 4. Style & Character Anchor Reference Rule

- Store verified master references in `web/public/assets/style-ref/` (`ref_background.png`, `ref_minh.png`).
- Whenever generating a new background, secondary character, or item set, ALWAYS pass the anchor reference image alongside the prompt with:
  > *"Match the EXACT pixel art style, warm espresso outline color (#241712), pixel density, and shading warmth of the attached reference image."*
