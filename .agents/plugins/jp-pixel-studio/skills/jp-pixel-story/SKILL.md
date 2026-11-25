---
name: jp-pixel-story
description: >-
  Create a new interactive 2D pixel-art Japanese learning story (with Furigana,
  bilingual subtitles, VOICEVOX Japanese voiceovers, pixel sprites, interactive
  mini-games, and a reading study view) and optionally export it to MP4. Use
  this skill whenever the user asks to generate a new Japanese story, JLPT
  reading intro, conversation animation, or process pixel sprites for this project.
---

# Creating a New Japanese Pixel Story

Follow this end-to-end procedure whenever creating a new story lesson in `web/public/stories/<story-id>/`.

## Prerequisites

1. Verify that the local VOICEVOX engine is reachable via the MCP tool `voicevox_health`.
   - If unreachable, remind the user to launch the VOICEVOX desktop app or engine on port `50021`.
2. Inspect available speakers via `voicevox_list_speakers` to pick fitting character voices (e.g., narrator `13`, male learner `11`, female staff `8`).

## Step 1: Write `story.json`

Create `web/public/stories/<story-id>/story.json` following the schema in [story-schema.md](./references/story-schema.md):

- Break the Japanese passage or dialogue into 5–6 crisp scenes (`skyline_intro`, `exterior_zoom`, `konbini_walkin`, `drag_counter`, `closeup_choice`, `outro_celebrate` — or extend `web/src/engine/pixelRenderer.ts` for new scene backdrops).
- For every Japanese line:
  - Fill `jaPlain` (natural Japanese with Kanji).
  - Fill `ttsText` (clean reading hints if a Kanji has tricky pronunciation so VOICEVOX reads it accurately).
  - Fill `jaRuby` with exact `{ "t": "...", "r": "..." }` Furigana segments.
  - Fill `vi` with natural Vietnamese translation.
- Add a `characterCard` (cultural/character context popup) and a `reading` section (`sentences` + `vocab` with JLPT level tags).

## Step 2: Synthesize Real VOICEVOX Audio & Sync Timestamps

Run the MCP tool `voicevox_generate_story_audio` pointing at `web/public/stories/<story-id>/story.json`:

- Generates `.wav` voiceovers into `web/public/stories/<story-id>/audio/`.
- Automatically measures exact `durationSec` and updates `audioUrl` in `story.json`.
- For beginner JLPT N5–N4 stories, keep `speedScale` around `0.90–0.95`.

## Step 3: Process Custom Pixel-Art Sprites (Optional)

If the user supplies AI-generated character or prop images (e.g. from Gemini):

1. Check available palettes with `pixellab_list_palettes` and choose one matching `story.json`'s `palette`.
2. For single portraits or props, call `pixellab_clean_sprite`.
3. For 4-frame walk cycles or expression sheets, call `pixellab_slice_spritesheet` into `web/public/stories/<story-id>/sprites/`.

## Step 4: Preview & Export Video

1. Preview interactively:
   ```bash
   cd web && npm run dev
   ```
   Open `http://127.0.0.1:5173/?story=<story-id>`.
2. Test hands-free autoplay mode:
   Open `http://127.0.0.1:5173/?story=<story-id>&autoplay=true`.
3. Export an MP4 video with synced VOICEVOX audio:
   ```bash
   cd exporter && node export_video.mjs --story <story-id>
   ```
