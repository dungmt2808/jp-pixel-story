# Story, Cinema & Catalog Schema Reference

## 1. Library Catalog (`web/public/stories/index.json`)

```json
{
  "stories": [
    {
      "id": "jlpt-n4-2025-12-japan-life",
      "category": "jlpt",
      "kind": "engine",
      "thumbStyle": "image",
      "thumbImage": "stories/jlpt-n4-2025-12-japan-life/assets/bg_ofuro.png",
      "artBadge": "📖 ĐỌC HIỂU 12/2025",
      "titleJa": "日本の生活",
      "titleVi": "JLPT N4 12/2025 (問題5) · Tuần trải nghiệm cuộc sống Nhật của Lisa",
      "level": "JLPT N4 · 12/2025",
      "description": "Tóm tắt ngắn gọn bài học.",
      "sceneCount": 4,
      "vocabCount": 7,
      "grammarCount": 5,
      "quizCount": 3,
      "theme": "ramen_midnight"
    }
  ]
}
```

- `category`: `"jlpt"` (`📝 Đề thi JLPT`) | `"situation"` (`💬 Tình huống`) | `"story"` (`📖 Câu chuyện`).
- `kind`:
  - `"engine"` — React interactive stage (`CinemaStage` when `"engine": "cinema"`, `HybridStage`, `TsuruStage`, `DepatoStage`, or `PixelStage`) + `ReadingView` + auto `DictationView`.
  - `"standalone"` — custom HTML5 Canvas (`href: "stories/<id>/index.html"`) + `dictation.json`.
  - `"jlpt-choukai"` — `choukai.json` + optional native `dictation.json`.
  - `"jlpt-dokkai"` — `dokkai.json` + auto `DictationView`.
  - `"jlpt-gengo"` — `gengo.json` (49 Vocab & Grammar exam questions).
- `thumbStyle`: `"image"` (uses `thumbImage`) | `"jlpt"` | `"jlpt-dokkai"` | `"jlpt-gengo"` | `"konbini"` | `"hachiko"`.

## 2. Compact Furigana Notation (`RubyTextValue`)

All Ruby fields (`jaRuby`, `labelRuby`, `exampleRuby`, `questionJa`, `options[].ja`) accept compact `{漢字|かんじ}` strings (parsed by `web/src/utils/ruby.ts`, cutting JSON size & tokens by ~75%):

```json
"jaRuby": "{先週|せんしゅう}、さくらデパートへ{買|か}い{物|もの}に{行|い}きました。"
```

## 3. Data-Driven Pixel Cinema (`story.json` with `"engine": "cinema"`)

Use `"engine": "cinema"` for every new animated story, situation or JLPT `問題5` adaptation — no per-story code.
Full example: `web/public/stories/hanami-first/story.json`.

```json
{
  "id": "hanami-first",
  "engine": "cinema",
  "palette": "jp_story_master",
  "bgm": "default",
  "assets": {
    "backgrounds": { "park": "/stories/hanami-first/assets/bg_park.png" },
    "portraits": {},
    "sprites": { "minh": "/stories/hanami-first/assets/sprites/minh/meta.json" },
    "cardPortrait": "/stories/hanami-first/assets/sprites/yui/frame_03.png"
  },
  "cast": {
    "left":  { "voice": "minh", "sprite": "minh", "idleClip": "idle", "talkClip": "talk" },
    "right": { "voice": "yui",  "portrait": "yui_static", "scale": 1 }
  },
  "scenes": [
    { "id": "s1", "type": "cinema_intro", "backdrop": "bg:park", "overlay": "petals",
      "bannerTitle": "はじめてのお花見", "bannerSubtitle": "JLPT N4 · Tình huống", "lines": [ ... ] },
    { "id": "s2", "type": "cinema_checklist", "backdrop": "bg:park",
      "minigame": { "choices": [ { "id": "c1", "labelJa": "...", "backdrop": "bg:picnic", "responseLine": { ... } } ] } },
    { "id": "s3", "type": "cinema_dialogue", "backdrop": "proc:airport_train",
      "revealNote": [ { "label": "Trước:", "text": "...", "color": "#ffd875" } ] },
    { "id": "s4", "type": "cinema_outro", "actors": ["left", "right"],
      "outroLabels": { "reading": "📖 ĐỌC BÀI →", "card": "THẺ NHÂN VẬT" } }
  ]
}
```

- `engine` (routes the stage, never the story id): `"cinema"` (default for new work) | legacy `"tsuru"`, `"depato"`, `"hybrid"`, `"pixel"`.
- Scene `type`: `cinema_intro` (title banner + start button), `cinema_dialogue` / `cinema_reveal` (lines + continue),
  `cinema_checklist` / `cinema_explore` (clickable choices, each may switch `backdrop`), `cinema_outro` (reading / dictation / card / replay buttons).
- `backdrop`: `"bg:<key>"` (a palette-locked PNG from `assets.backgrounds`) or `"proc:<name>"` from `PROCEDURAL_BACKDROPS`
  (`washoku_table`, `airport_train`). `overlay`: `bath_steam`, `snow`, `rain`, `petals` (`web/src/engine/cinemaBackdrops.ts`).
- `cast.left/right`: `voice` (matches `lines[].voice` to animate talking), and either `sprite` (frame animation from a
  `pixellab_slice_spritesheet` meta.json, playing `idleClip` / `talkClip`) or a static `portrait`. `scale` is a whole number.
  Without `cast`, the first two `assets.portraits` are used (legacy).
- `actors`: which sides are on stage (default: none in intro, both in dialogue/checklist, left only in outro).
- `lines[]`: `{ id, voice, speakerLabel, jaPlain, ttsText?, jaRuby, vi, audioUrl, durationSec, ttsHash }` — the last three are written by `voicevox_generate_story_audio`.
- `reading`: `{ sectionTitle, subtitle, sentences, vocab, grammar, quiz }`. Daily Dictation is built automatically from all voiced lines.

### Sprite `meta.json` (written by `pixellab_slice_spritesheet`)

```json
{ "spritesheet": "spritesheet.png", "frameWidth": 96, "frameHeight": 96, "frameCount": 4,
  "pivot": { "x": 47, "y": 95 }, "fps": 6, "palette": "jp_story_master",
  "clips": { "idle": { "frames": [0,0,0,0,0,0,0,0,0,0,0,2], "fps": 4, "loop": true },
             "talk": { "frames": [1,0], "fps": 7, "loop": true }, "happy": { "frames": [3], "fps": 6, "loop": true } } }
```
The pivot is placed on the stage ground line, so every frame of every clip stays registered.

## 4. Standalone Daily Dictation Pack (`dictation.json`)

Used by standalone HTML stories (generated by `voicevox_generate_standalone_pack`) and JLPT Listening exams (`jlpt-*-choukai` native single-sentence slices):

```json
{
  "id": "hachiko",
  "titleJa": "ハチ公の話",
  "titleVi": "Câu chuyện chú chó Hachikō ở ga Shibuya",
  "level": "JLPT N4",
  "items": [
    {
      "id": "h_01",
      "speakerLabel": "ナレーター",
      "jaPlain": "東京の渋谷に、上野先生という大学の先生が住んでいました。",
      "jaKana": "とうきょうのしぶやに、うえのせんせいというだいがくのせんせいがすんでいました。",
      "jaRuby": "{東京|とうきょう}の{渋谷|しぶや}に...",
      "vi": "Ở Shibuya, Tokyo, có một giáo sư đại học tên là Ueno.",
      "audioUrl": "/stories/hachiko/audio/line_00.mp3",
      "durationSec": 5.18
    }
  ]
}
```
