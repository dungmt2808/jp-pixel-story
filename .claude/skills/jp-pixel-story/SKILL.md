---
name: jp-pixel-story
description: >-
  Create a new 3-in-1 interactive 2D pixel-art Japanese learning lesson
  (Animated Interactive Story + Reading/Vocab/Grammar/Quiz + Daily Dictation
  listening practice) with Furigana-only toggle and local VOICEVOX MP3 audio,
  validate content quality, and register it in the web library. Use this skill
  whenever the user asks to generate a new Japanese situation or story lesson,
  add Daily Dictation, process pixel sprites, or export a video.
---

# Creating a New 3-in-1 Japanese Learning Lesson

Every lesson in `web/public/stories/<story-id>/` automatically powers **3 modes**:
1. **🎮 Interactive 2D Pixel Animation** (`?story=<id>`)
2. **📖 Reading Study View** (Furigana toggle + Vocab + Grammar + Quiz)
3. **🎧 Daily Dictation** (`?story=<id>&mode=dictation` — Type & Word-Tile listening practice)

## Prerequisites

1. Verify local VOICEVOX is running with MCP tool `voicevox_health`.
2. Inspect available speakers via `voicevox_list_speakers`. Recommended expressive voice cast (always pass real Kanji `jaPlain` so OpenJTalk preserves native Japanese pitch accent — NEVER pass all-Hiragana `ttsText` unless fixing a specific misread word!):
   - Warm storyteller narrator: `青山龍星 (しっとり=84)` or `(ノーマル=13)`
   - Gentle/emotional female: `WhiteCUL (ノーマル=23 / かなしい=25)` or `小夜/SAYO (46)`
   - Earnest young male: `玄野武宏 (ノーマル=11 / 悲しみ=41)`
   - Bright female: `春日部つむぎ (8)`

## Step 1: Choose Category & Format

Decide the library category in `web/public/stories/index.json`:
- `"situation"` (`💬 Tình huống đời sống`): everyday Japan interactions (konbini, train station, ramen shop, clinic, JLPT Listening).
- `"story"` (`📖 Câu chuyện & Đọc hiểu`): cultural stories, folktales, JLPT Reading passages (Hachikō, Tsuru no Ongaeshi...).

And choose one of two formats:
- **Format A — Standard Engine (`story.json`, fastest, token-efficient & auto-supports Daily Dictation):**
  Create `web/public/stories/<story-id>/story.json` following [story-schema.md](./references/story-schema.md), using **compact `{漢字|かんじ}` string notation** for `jaRuby`, `labelRuby`, `exampleRuby`, `questionJa`, and `options[].ja` (~75% fewer tokens than segment arrays!):
  - 5–6 scenes with `jaPlain` (with natural `、` breath commas for VOICEVOX), compact `{漢字|かんじ}` `jaRuby` on every Kanji (no Romaji!), and natural Vietnamese `vi`.
  - `characterCard` popup facts.
  - `reading` with `sentences`, `vocab`, `grammar` (with compact `exampleRuby`), and 3–4 `quiz` questions.
  - Run MCP tool `voicevox_generate_story_audio` (`audio_format="mp3"`), and audition key lines to confirm natural prosody.
  - Daily Dictation automatically reads all voiced lines from `story.json`!
- **Format B — Custom Standalone Interactive HTML (for richly bespoke interactions like Hachikō):**
  Create `web/public/stories/<story-id>/index.html` using `{漢字|かんじ}` markup, `sayW(jp, vi)`, `PASSAGE`, `DICT`, `QUIZ`, a **`ふりがな ON/OFF`** toggle (no Romaji), a **`📚 Thư viện`** button (`../../`), and a **`🎧 Nghe chép`** button (`../../?story=<story-id>&mode=dictation`).
  - Run MCP tool `voicevox_generate_standalone_pack` to synthesize all VOICEVOX `.mp3` clips, `audio/manifest.json`, and **`dictation.json`** for Daily Dictation in one step!

## Step 2: Generate & Lock Unified Pixel Art Assets (Hybrid Upgrade)

Follow the Art Style Bible in [art-style.md](./references/art-style.md) strictly so every lesson matches the exact same retro Japanese 16-bit style:
1. Always pass style anchor images from `web/public/assets/style-ref/` (`ref_background.png`, `ref_minh.png`) when generating new artwork.
2. Lock backgrounds (`320×200`) with MCP tool `pixellab_clean_background(..., palette_name="ramen_midnight")`.
3. Lock character portraits (`96×96`) and interactive items (`36×36`–`80×80`) with `pixellab_clean_sprite` or `pixellab_slice_spritesheet(..., palette_name="ramen_midnight", bg_mode="chroma_green")`.
4. Stage portraits **frameless** flush to the bottom edge (`bottomY = VIRTUAL_H`) with `ctx.filter = "brightness(0.64)"` for listening characters — never paste floating square portrait boxes on top of scenes!
5. Declare `"engine": "hybrid"` and `"assets": { ... }` in `story.json` so the stage renders crisp PNG art + live Canvas FX (snow/rain, steam, hearth embers, radial candlelight, Bayer dithering).

## Step 3: Register in Library Catalog

Add the lesson card to `web/public/stories/index.json` with:
`id`, `category` (`"situation"` | `"story"`), `kind` (`"engine"` | `"standalone"`), `href` (if standalone), `titleJa`, `titleVi`, `level`, `description`, `sceneCount`, `vocabCount`, `grammarCount`, `quizCount`.

## Step 4: Mandatory Content QA Validation

Before finishing or pushing, ALWAYS run MCP tool `story_validate_content` on `web/public/stories/<story-id>`:
- Confirms **0 missing Furigana** on any Kanji.
- Confirms **all audio files exist** and are non-empty.
- Confirms **quiz `correctIndex` bounds** and **`stories/index.json` registration**.

## Step 5: Preview, Deploy, or Export MP4

- Local preview: `cd web && npm run dev`
- Deploy live to GitHub Pages: `git add . && git commit && git push origin main`
- Optional MP4 video export: `cd exporter && node export_video.mjs --story <story-id>`
