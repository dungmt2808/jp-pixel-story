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

## 3b. Craft Quality Gate (Mini-PixelLab Step 1)

- **Outline:** every silhouette edge uses `#241712`. `cleanup=True` recolours dark edges and adds a 1px outline outside light
  edges (light clothes keep their colour); frame borders (busts cut by the cell) never get an outline.
- **Pixel-perfect lines:** L-shaped double corners on outlines are removed.
- **Noise:** isolated specks close to their surroundings are removed; high-contrast details (eye highlights, buttons) stay.
- **True pixels:** AI images drawn as big fake pixels are depixelized on their detected grid before any resize.
- **Provenance:** keep raw sources in `art-src/` and pass `source=` so `pixellab_reprocess` can rebuild assets byte-for-byte.

## 4. Style & Character Anchor Reference Rule

- Store verified master references in `web/public/assets/style-ref/` (`ref_background.png`, `ref_minh.png`).
- Whenever generating a new background, secondary character, or item set, ALWAYS pass the anchor reference image alongside the prompt with:
  > *"Match the EXACT pixel art style, warm espresso outline color (#241712), pixel density, and shading warmth of the attached reference image."*

## 5. Vibe Over Detail — One World Per Story

A video feels finished when everything in it belongs to the same world, not when one asset is very
detailed. Rules (the validator enforces the first one):

1. **One detail level per story.** Never mix painted `bg:` backgrounds with code-drawn `proc:` backdrops
   in one cinema story (`[Style Mix]` warning). Missing art goes in `art-src/<story>/art.json` + `PROMPTS.md`
   (house-style prompt prefix, negative prompt, one prompt per background) and is applied with
   `pixellab_apply_art_manifest` (or `uv run python art_manifest.py ../art-src/<story>/art.json`).
   Pass an existing background of the story as the style reference image.
2. **Light, not repainting.** Set `scene.light` (`morning`, `golden`, `dusk`, `night`, `rain`, `warm`) so the
   backdrop, characters and items share one time of day — art from different sources then reads as one place.
3. **Acting over polish** (limited animation, like short-form anime channels): per line, at most one
   `emote` (manga symbol) and one `camera` move; use `punch` + `shock`/`sweat` for comedic beats, `push` for
   emotional lines, `shake` for surprises. Leave most lines plain so the accents land.
4. **Telop for the lesson.** `telop` (big caption) only for the key phrase / grammar of the scene
   (`うちに{来|き}ませんか`, `{約束|やくそく}！`), 1–2 per scene, with a short Vietnamese `sub`.
5. **Sound sells it.** Each scene may set `bgm` (`calm`, `happy`, `tender`/`sad`, `none`); emotes bring a
   default sound effect (`sfx` overrides, `"none"` silences). The MP4 exporter renders the same BGM and
   SFX, ducked under the voices.

## 6. Three Art Routes (pick ONE per story)

| Route | Art | Motion | Best for |
| :--- | :--- | :--- | :--- |
| **A — painted** | AI/PixelLab backgrounds via `art.json` + `PROMPTS.md` | vibe kit (emote, camera, telop, light) | dialogue-heavy JLPT stories |
| **B — code** | everything drawn in code from one shared style (like `hachiko`) | full-body actors, living world | short stories with lots of action |
| **C — painted + motion** | route A art, with objects cut out (`objects`) | `scene.motion`: scroll, sweep, glow, steam, shimmer, movers, rumble | travel, cities, weather: scenes that should feel alive |

Route C prompt tip: ask for moving things (vehicles, clouds, people) as SEPARATE images on a green screen when
possible; cutting them out of a finished painting works (lasso polygon on the raw image) but needs the outline.
After 320x200 palette lock, objects whose colours match the background (a white plane on a pink sunset) merge
into it — always cut from the RAW image, never from the processed background.
