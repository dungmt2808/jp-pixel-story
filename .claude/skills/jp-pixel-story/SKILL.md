---
name: jp-pixel-story
description: >-
  Create interactive 2D pixel-art Japanese lessons and full JLPT N5-N1 exam suites
  (Animated Cinema Story, JLPT Listening with real MP3 + Daily Dictation, JLPT
  Reading with interactive filter tables/simulators, and JLPT Vocab & Grammar
  with anti-spoiler Kanji & star-order puzzles), process pixel art & clean exam
  illustrations, synthesize local VOICEVOX MP3s, validate the full catalog, and
  deploy to GitHub Pages.
---

# Creating Japanese Learning Lessons & JLPT Exam Suites (v2.0)

Every lesson lives in `web/public/stories/<id>/` and is registered in `web/public/stories/index.json` under one of **3 categories**:
- `"jlpt"` (`📝 Đề thi JLPT`): Official JLPT exams (`聴解`, `読解 問題4・6`, `読解 問題5` animated cinema, `文字・語彙・文法`)
- `"situation"` (`💬 Tình huống đời sống`): Everyday Japan interactions (konbini, ramen shop, train station, clinic...)
- `"story"` (`📖 Câu chuyện & Đọc hiểu`): Cultural stories & Japanese folktales (Hachikō, Tsuru no Ongaeshi...)

## Core Pedagogical & UX Rules

1. **NO Romaji anywhere** — every Kanji uses compact `{漢字|かんじ}` Furigana notation with the global **`ふりがな ON/OFF`** toggle (and never place ruby on pure Kana).
2. **Global Vietnamese Toggle (`🇻🇳 Dịch ON/OFF`):**
   - Video stages (`TsuruStage`, `CinemaStage`, `DepatoStage`, `HybridStage`, `PixelStage`, `hachiko/index.html`) default `Dịch ON` so learners can hide `.subtitle-vi` / `.choice-vi` in 1 click.
   - Exam views (`JlptDokkaiView`, `JlptGengoView`) default `Dịch OFF` so meaning hints never spoil exam answers before selection.
3. **Natural VOICEVOX Prosody:**
   - Verify engine via `voicevox_health` and inspect casts via `voicevox_list_speakers`.
   - **Always send real Japanese Kanji** (`jaPlain`) so OpenJTalk preserves native Japanese pitch accent — NEVER pass all-Hiragana unless overriding a single misread word via `ttsText`.
   - **Verified natural cast:**
     - `青山龍星` (`しっとり=84` storyteller / `ノーマル=13` notices & announcements)
     - `小夜/SAYO` (`ノーマル=46` warm natural female — email, office memo, friends)
     - `WhiteCUL` (`ノーマル=23` / `かなしい=25` clear expressive female)
     - `玄野武宏` (`ノーマル=11` / `悲しみ=41` earnest young male)
   - **Common TTS gotchas to override via `ttsText`:**
     - Weekday parens like `7月11日（水）` → `7月11日、水曜日` (avoids reading 水 as *mizu*).
     - Range tilde `午前9時〜午後10時` → `午前9時から午後10時`.
     - Strip leading `※` symbols (avoids reading *komejirushi*).
     - Laughter `"はは、"` → `"ああ、"` (avoids OpenJTalk reading *wawa*).
   - Always audition 2–3 synthesized MP3s before pushing!

## Choose the Right Reusable Engine (Zero Boilerplate!)

| Content Type | `kind` in `index.json` | Data File | Engine Component | Audio / Image MCP Tools |
| :--- | :--- | :--- | :--- | :--- |
| **Animated Story / JLPT 問題5** | `"engine"` (`engine: "cinema"`) | `story.json` | `CinemaStage` + `ReadingView` + auto `DictationView` | `voicevox_generate_story_audio`, `pixellab_clean_background`, `pixellab_clean_sprite` |
| **JLPT Listening (`聴解`)** | `"jlpt-choukai"` | `choukai.json` + `dictation.json` | `JlptChoukaiView` + native `DictationView` | `jlpt_clean_exam_image` + FFmpeg slice |
| **JLPT Reading (`読解 問題4・6`)** | `"jlpt-dokkai"` | `dokkai.json` | `JlptDokkaiView` + auto `DictationView` | `voicevox_generate_dokkai_audio` |
| **JLPT Vocab & Grammar (`言語知識`)** | `"jlpt-gengo"` | `gengo.json` | `JlptGengoView` | (text + interactive `★` scramble & cloze essay) |
| **Custom Bespoke HTML** | `"standalone"` | `index.html` + `dictation.json` | Standalone Canvas + `DictationView` | `voicevox_generate_standalone_pack` |

Read schema references before creating files:
- Stories & Cinema format: [references/story-schema.md](./references/story-schema.md)
- JLPT `choukai.json`, `dokkai.json`, `gengo.json`: [references/jlpt-schemas.md](./references/jlpt-schemas.md)
- Unified 16-bit Pixel Art Style Bible: [references/art-style.md](./references/art-style.md)

## Workflow Steps

1. **Author compact JSON** using `{漢字|かんじ}` strings (~75% fewer tokens than segment arrays).
2. **Process Art & Exam Cards:**
   - Stories: lock `320×200` backgrounds with `pixellab_clean_background(..., palette_name="ramen_midnight")` and `96×96` portraits with `pixellab_clean_sprite` / `pixellab_slice_spritesheet(..., bg_mode="chroma_green")`. Stage portraits frameless flush-bottom (`bottomY = VIRTUAL_H`).
   - JLPT Listening/Reading cards: strip colored watermarks with `jlpt_clean_exam_image`.
3. **Generate VOICEVOX MP3 Audio:**
   - `story.json` → `voicevox_generate_story_audio(audio_format="mp3")`
   - `dokkai.json` → `voicevox_generate_dokkai_audio(audio_format="mp3")`
   - Standalone HTML → `voicevox_generate_standalone_pack`
4. **Register in `web/public/stories/index.json`** with accurate counts and `category`.
5. **Mandatory Verification Gate (Before Commit / Push):**
   - Run MCP tool **`story_validate_catalog`** on `web/public/stories` (must return `ok: true`, `total_issues: 0`, `orphan_folders: []`).
   - Run backend tests: `cd mcp-server && PYTHONPATH=. uv run pytest -v`
   - Run frontend tests & build: `cd web && npm test && npm run build`
   - Deploy live to GitHub Pages via `git push origin main` (CI automatically re-runs frontend tests, Python validator/pytest, and Vite build before deploying!).
