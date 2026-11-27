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
   - Video stages (`TsuruStage`, `CinemaStage`, `DepatoStage`, `HybridStage`, `PixelStage`) default `Dịch ON` so learners can hide `.subtitle-vi` / `.choice-vi` in 1 click.
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

| Content Type | `kind` / `engine` | Data File | Engine Component | Audio / Image MCP Tools |
| :--- | :--- | :--- | :--- | :--- |
| **NEW animated story / situation / JLPT 問題5** | `"engine"` + `story.engine: "cinema"` | `story.json` | `CinemaStage` player v2 (100% data-driven: top bar + caption bar, title card, stamps, leader-line labels, drag/tap/hold mini-games, info card, backdrops, overlays, rig/sprite cast) + `ReadingView` + auto `DictationView` | `pixellab_clean_background`, `pixellab_slice_spritesheet(registration="bust")`, `voicevox_generate_story_audio` |
| Legacy bespoke stages | `story.engine`: `"tsuru"`, `"depato"`, `"hybrid"`, `"pixel"` | `story.json` | `TsuruStage`, `DepatoStage`, `HybridStage`, `PixelStage` (all on the shared `useStageRuntime`) | same |
| **JLPT Listening (`聴解`)** | `"jlpt-choukai"` | `choukai.json` + `dictation.json` | `JlptChoukaiView` + native `DictationView` | `jlpt_clean_exam_image` + FFmpeg slice |
| **JLPT Reading (`読解 問題4・6`)** | `"jlpt-dokkai"` | `dokkai.json` | `JlptDokkaiView` + auto `DictationView` | `voicevox_generate_dokkai_audio` |
| **JLPT Vocab & Grammar (`言語知識`)** | `"jlpt-gengo"` | `gengo.json` | `JlptGengoView` | (text + interactive `★` scramble & cloze essay) |
| **Custom Bespoke HTML** | `"standalone"` | `index.html` + `dictation.json` | Standalone Canvas + `DictationView` | `voicevox_generate_standalone_pack` |

**Never write a new per-story stage component.** New stories use `engine: "cinema"`; if a scene needs a new
look, add ONE reusable entry to `web/src/engine/cinemaBackdrops.ts` (`PROCEDURAL_BACKDROPS` / `OVERLAYS`).
Make scenes feel like a cinematic lesson, not a slideshow: give most scenes a `stamp` or `labels`, and add one
`interaction` (drag / tap / hold) every 2–3 scenes with a voiced `doneLine` (see story-schema.md "Cinematic player v2").
Vibe over detail: keep ONE art source per story (never mix `bg:` and `proc:` backdrops — `[Style Mix]`), set `light`
and `bgm` per scene, and give key lines an `emote` / `camera` / `telop` (story-schema.md "Vibe kit"; art-style.md §5).
Missing art: write `art-src/<story>/art.json` + `PROMPTS.md`, then `pixellab_apply_art_manifest`.
Make painted scenes move (route C): `scene.motion` layers + art.json `objects` to cut out vehicles/props
(story-schema.md "Route C"; art-style.md §6 compares the three art routes).
Route B (code-drawn worlds, full-body characters walking, the world changing with the story): `backdrop: "set:<name>"`,
`people`, `cues` — story-schema.md "Route B"; new sets go in `web/src/engine/proc/` and `PROC_SETS`.
Stages are routed by `story.engine` (`web/src/engine/stageEngines.ts`), never by story id.

Read schema references before creating files:
- Stories & Cinema format: [references/story-schema.md](./references/story-schema.md)
- JLPT `choukai.json`, `dokkai.json`, `gengo.json`: [references/jlpt-schemas.md](./references/jlpt-schemas.md)
- Unified 16-bit Pixel Art Style Bible: [references/art-style.md](./references/art-style.md)

## Workflow Steps

1. **Author compact JSON** using `{漢字|かんじ}` strings (~75% fewer tokens than segment arrays). Reference example: `web/public/stories/hanami-first/story.json`.
2. **Process Art & Exam Cards** (master palette `jp_story_master`, the tools' default). Keep raw sources in `art-src/<story-id>/` and pass `source={"prompt": ..., "model": ..., "seed": ...}` so every asset gets a `provenance.json` record and can be rebuilt with `pixellab_reprocess`.
   - AI "pixel art" inputs: `grid="auto"` (default) detects the fake-pixel grid and rebuilds the TRUE pixels first (`pixellab_detect_grid` / `pixellab_depixelize` to inspect). Non-pixel-art images are left alone automatically.
   - Backgrounds: `pixellab_clean_background(...)` -> `320x200`.
   - Characters (recommended, best animation): ONE expression sheet per character on pure `#00FF00` (frames: neutral, talk, blink, happy):
     1. `pixellab_slice_spritesheet(frame_width=96, frame_height=96, bg_mode="chroma_green", registration="bust", cleanup=True, lock_expressions=True, clips={"idle": {"frames": [0,0,0,0,0,0,0,0,0,0,0,2], "fps": 4}, "talk": {"frames": [1,0], "fps": 7}, "happy": [3]})`
        - shared scale + anchor (no stretch/jitter), cleanup = despeckle + `#241712` outline + pixel-perfect corners, lock = clothes/hair identical in every frame (no flicker).
     2. `pixellab_build_rig(sheet_dir)` -> `rig/rig.json` (head frames + body with hidden neck extension).
     3. story.json: `assets.rigs.<key> = ".../rig/rig.json"` and `cast.left/right.rig = "<key>"` -> breathing, nodding while listening, head bob + mouth while talking (whole pixels only).
     - More expressions later: `pixellab_add_expression(sheet_dir, patch_path, x, y, clip="sad")` (base frame + small eyes/mouth patch), then rebuild the rig.
   - Single props/portraits: `pixellab_clean_sprite` (keeps aspect ratio, `cleanup=True` by default). Existing sprites: `pixellab_cleanup_sprite`; off-palette PNGs: `pixellab_relock_palette`; check with `pixellab_sprite_quality`.
   - New mood palette (e.g. underwater, night): `pixellab_extract_palette(image_paths, n_colors, base_palette="jp_story_master", save_as="...")`.
   - Never scale pixel art by fractions in code: use `drawPixelImage` / `drawSpriteFrame` / `drawPixelZoom` / `drawRig` (whole-number scales only).
   - JLPT Listening/Reading cards: strip colored watermarks with `jlpt_clean_exam_image`.
3. **Generate VOICEVOX MP3 Audio** (hash-aware: re-running only re-synthesizes new or edited lines; `force=True` only when switching engines/voices globally):
   - `story.json` -> `voicevox_generate_story_audio(audio_format="mp3")`
   - `dokkai.json` -> `voicevox_generate_dokkai_audio(audio_format="mp3")`
   - Standalone HTML -> `voicevox_generate_standalone_pack` (merge-safe: keeps hand-made manifest entries & dictation.json)
4. **Register in `web/public/stories/index.json`** with accurate counts and `category`.
5. **Mandatory Verification Gate (Before Commit / Push):**
   - Run MCP tool **`story_validate_catalog`** on `web/public/stories` (must return `ok: true`, `total_issues: 0`, `orphan_folders: []`).
     It also fails on `[Off-Palette Asset]`, `[Missing Asset]`, broken sprite `meta.json` / `rig.json`, and `[Stale Audio]` (text edited after synthesis).
     Sprite craft (`[Outline]`, `[Noise]`, `[Colors]`) and `[No Provenance]` are warnings, but become errors for stories that declare `"artQuality"` (do this for every NEW story).
   - Run backend tests: `cd mcp-server && PYTHONPATH=. uv run pytest -v`
   - Run frontend tests & build: `cd web && npm test && npm run build`
   - Play every animated story end-to-end on a virtual clock: `cd exporter && npm run check:all -- --url <preview url>`
   - Optional MP4: `cd exporter && node export_video.mjs --story <id>` (deterministic, frame-exact A/V sync; voices are muxed from the clip files).
   - Deploy live to GitHub Pages via `git push origin main` (CI re-runs all of the above before deploying).
