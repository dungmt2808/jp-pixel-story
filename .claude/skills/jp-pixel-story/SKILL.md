---
name: jp-pixel-story
description: >-
  Create a new interactive 2D pixel-art Japanese learning story (with Furigana,
  bilingual subtitles, VOICEVOX Japanese voiceovers, pixel sprites, interactive
  mini-games, and a reading study view) and optionally export it to MP4.
---

# Creating a New Japanese Pixel Story

Follow the complete workflow in `.agents/plugins/jp-pixel-studio/skills/jp-pixel-story/SKILL.md` and schema reference `.agents/plugins/jp-pixel-studio/skills/jp-pixel-story/references/story-schema.md`.

## Quick Checklist
1. Check VOICEVOX with `voicevox_health` and pick speaker IDs via `voicevox_list_speakers`.
2. Write `web/public/stories/<story-id>/story.json` with exact `jaRuby` Furigana segments, `ttsText`, Vietnamese translation, `characterCard`, and `reading` passage + JLPT vocab.
3. Run `voicevox_generate_story_audio` to synthesize real WAV voiceovers and update `durationSec`.
4. Optional: Process custom AI sprite images using `pixellab_clean_sprite` or `pixellab_slice_spritesheet` locked to the story's palette.
5. Preview at `http://127.0.0.1:5173/?story=<story-id>` (or `&autoplay=true`) and optionally export MP4 via `exporter/export_video.mjs`.
