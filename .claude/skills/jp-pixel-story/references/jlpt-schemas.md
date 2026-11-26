# JLPT Exam Schemas (`choukai.json`, `dokkai.json`, `gengo.json`)

All three JLPT exam engines are 100% data-driven and validated by `mcp-server/content_validator.py`.

## 1. JLPT Listening (`web/public/stories/<id>/choukai.json`)
- Engine: `web/src/components/JlptChoukaiView.tsx` (`?story=<id>&mode=choukai`).
- `sections[]`: `m1` (課題理解), `m2` (ポイント理解), `m3` (発話表現), `m4` (即時応答).
- `questions[]`:
  - `id`, `sectionId`, `number`, `audioUrl` (sliced from real exam MP3; trim dead >3s option gaps in `m2`!), `durationSec`
  - `imageUrl?` (watermark-cleaned via `jlpt_clean_exam_image` MCP tool)
  - `hideOptionsUntilAnswered?` (`true` for `m3`/`m4` where options are spoken only)
  - `promptJa` (`{漢字|かんじ}`), `promptVi`, `options[]` (`{ label, ja?, vi? }`), `correctIndex`, `keyClueVi`, `script[]` (`{ speaker, ja, vi }`).
- Pair with `dictation.json` (single-sentence clips cleanly sliced from `m3`/`m4` with chimes & numbers stripped) to unlock native-voice JLPT Daily Dictation!

## 2. JLPT Reading `問題4 & 問題6` (`web/public/stories/<id>/dokkai.json`)
- Engine: `web/src/components/JlptDokkaiView.tsx` (`?story=<id>&mode=dokkai`).
- Top-level fields: `id`, `examDate`, `level`, `titleJa`, `titleVi`, `description`, `mondai5StoryId?` (links directly to animated `問題5` story!), `passages[]`.
- Each `passage`:
  - `docStyle`: `"email" | "memo" | "essay" | "notice" | "info_table"`.
  - `sentences[]`: `{ id, jaPlain, ttsText?, speakerId?, jaRuby, vi, audioUrl, durationSec, sectionTagJa?, highlight? }`. Run `voicevox_generate_dokkai_audio` to batch-synthesize MP3s!
  - Optional interactive helpers:
    - `conditionSimulator`: live toggle buttons for notices (e.g., Sunny vs Rain opening hours).
    - `timeline[]`: visual time-node strip for office memos/deadlines.
    - `tables[]`: synchronized filterable tables for `問題6` (`columns`, `rows[].tags`, `filters[]`, `presets[]`) — all tables in one passage share the same active filter tags!
  - `questions[]`, `vocab[]`, `grammar[]`.
- Daily Dictation is auto-built from all voiced `sentences[]` in `dokkai.json`.

## 3. JLPT Language Knowledge `文字・語彙 & 文法` (`web/public/stories/<id>/gengo.json`)
- Engine: `web/src/components/JlptGengoView.tsx` (`?story=<id>&mode=gengo`).
- Top-level fields: `id`, `examDate`, `level`, `titleJa`, `titleVi`, `dokkaiId?`, `choukaiId?`, `sections[]`, `passages[]` (for `問題3` cloze composition), `questions[]`.
- Question `kind`:
  - `"kanji_read"` (`問題1`): wrap target Kanji in `[[{漢字|かんじ}]]` + set `"maskTargetRuby": true` so Furigana is hidden until answered (never spoils the question!).
  - `"kanji_write"` (`問題2`): wrap target Kana in `[[...]]`; validator allows unannotated Kanji in `options[].ja` since Kanji forms are being tested.
  - `"cloze"` (`問題3` vocab & `問題1` grammar): place `（　）` inside `promptJa`.
  - `"synonym"` (`問題4`) & `"usage"` (`問題5`): wrap underlined phrase/word in `[[...]]`; `usage` adds `headwordJa`.
  - `"star_order"` (`問題2` grammar `★`): place `[[STAR_SLOTS]]` inside `promptJa`, set `starSlotIndex` (usually `2`) and `starOrder: [i0, i1, i2, i3]` (validator verifies `starOrder[starSlotIndex] === correctIndex`!).
  - `"passage_cloze"` (`問題3` grammar): link `passageId` to a `passages[]` entry whose `paragraphs[]` contain clickable inline `[[18]]`..`[[21]]` blank markers.
