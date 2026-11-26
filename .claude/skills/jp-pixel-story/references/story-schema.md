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
  "artQuality": { "outlineColor": "#241712", "minOutlineCompliance": 0.98, "maxOrphanRatio": 0.06 },
  "bgm": "default",
  "assets": {
    "backgrounds": { "park": "/stories/hanami-first/assets/bg_park.png" },
    "portraits": {},
    "sprites": { "minh": "/stories/hanami-first/assets/sprites/minh/meta.json" },
    "rigs": { "minh": "/stories/hanami-first/assets/sprites/minh/rig/rig.json" },
    "cardPortrait": "/stories/hanami-first/assets/sprites/yui/frame_03.png"
  },
  "cast": {
    "left":  { "voice": "minh", "rig": "minh", "sprite": "minh", "idleClip": "idle", "talkClip": "talk" },
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
- `cast.left/right`: `voice` (matches `lines[].voice` to animate talking), and one of (best first):
  `rig` (head/body cutout from `pixellab_build_rig`: expression clips on the head + breathing / nodding / bobbing),
  `sprite` (frame animation from a `pixellab_slice_spritesheet` meta.json, playing `idleClip` / `talkClip`), or a static `portrait`.
  `scale` is a whole number.
- `artQuality`: strict validator thresholds for this story's sprites (outline colour compliance, isolated-pixel ratio, optional `maxColorsPerSprite`).
  Without `cast`, the first two `assets.portraits` are used (legacy).
- `actors`: which sides are on stage (default: none in intro, both in dialogue/checklist, left only in outro).
- `lines[]`: `{ id, voice, speakerLabel, jaPlain, ttsText?, jaRuby, vi, audioUrl, durationSec, ttsHash }` — the last three are written by `voicevox_generate_story_audio`.
- `reading`: `{ sectionTitle, subtitle, sentences, vocab, grammar, quiz }`. Daily Dictation is built automatically from all voiced lines.

### Cinematic player v2 (Classmate-style chrome, labels & mini-games)

`CinemaStage` renders every cinema story as one player: a top bar (title + `?` card, `ふ` furigana, `JA·VI`, mute, close),
the 16:10 pixel stage, and a caption bar *under* the stage (speaker, Japanese with ruby, Vietnamese, or the
interaction hint / outro buttons). All coordinates below are in the 320x200 virtual frame. Example: `hanami-first`.

```json
{
  "brand": "jp-pixel-story.vn",
  "look": { "vignette": false },
  "assets": { "items": { "bento": "/stories/hanami-first/assets/items/bento.png" } },
  "characterCard": { "nameJa": "ゆい (YUI)", "subtitle": "{東京|とうきょう}の{大学生|だいがくせい}",
    "facts": [ { "label": "SỞ THÍCH", "value": "お{弁当|べんとう}を{作|つく}ること" },
               { "label": "BÍ MẬT", "value": "...", "locked": true } ] },
  "scenes": [
    { "type": "cinema_intro", "titleCard": { "title": "はじめてのお{花見|はなみ}", "subtitle": "JLPT N4", "credit": "..." } },
    { "type": "cinema_dialogue", "stamp": "TOKYO · THÁNG 4 · CHỦ NHẬT", "overlays": ["light_rays", "petals"],
      "labels": [ { "text": "{桜|さくら}", "sub": "hoa anh đào", "x": 250, "y": 40, "to": [228, 70], "afterLine": 1 } ],
      "lines": [ ... ] },
    { "type": "cinema_dialogue", "actors": ["right"],
      "interaction": { "type": "drag", "hint": "Kéo hộp cơm đến tấm thảm",
        "items": [ { "id": "b", "item": "bento", "from": [52, 150], "to": [168, 164], "label": "{弁当|べんとう}", "labelVi": "cơm hộp" } ],
        "doneLine": { "id": "h05", "voice": "yui", "jaPlain": "...", "jaRuby": "...", "vi": "..." } } },
    { "interaction": { "type": "hold", "hint": "Giữ để rót trà",
        "hold": { "label": "{注|そそ}ぐ", "x": 252, "y": 70, "durationSec": 2.2, "item": "teapot", "streamTo": [262, 132] } } },
    { "interaction": { "type": "tap", "hint": "Tìm 3 cánh hoa rơi",
        "spots": [ { "id": "p1", "x": 60, "y": 90, "r": 12, "item": "sakura", "label": "一" } ] } },
    { "type": "cinema_outro", "summary": "{今日|きょう}は…", "outroLabels": { "reading": "📖 ĐỌC BÀI →" } }
  ]
}
```

- `stamp`: string or `{ text, x?, y? }` — typewriter-style location/date stamp (top-left by default).
- `labels[]`: pixel tags `{ text, sub?, x, y, to?, afterLine?, style? }`; `to` draws a crisp 1px leader line, `sub` (Vietnamese)
  hides when VI is off, `afterLine` delays the tag until that line (0-based) starts.
- `interaction` runs after the scene's lines; the caption shows `hint` in uppercase with progress (`1/3`).
  `drag` (items from `from` to `to`, dotted arc hint + target glow), `tap` (find `spots`, optional `line` per spot),
  `hold` (press-and-hold meter for `durationSec`, optional `item` sprite + pixel `streamTo`). `doneLine` plays on completion.
  In `autoplay` / exported videos a pixel cursor performs the interaction, so MP4s show the whole game.
- `assets.items`: small palette-locked object sprites (`pixellab_clean_sprite` on an `art-src/` raw image) used by interactions.
- `titleCard`: intro panel `{ title, subtitle, credit }` (falls back to `bannerTitle` / `bannerSubtitle` / story title).
- `overlays[]`: several atmospheric layers in order (`light_rays`, `petals`, `snow`, `rain`, `bath_steam`); `overlay` still works.
- `summary`: one-line recap (ruby allowed) shown above the end buttons of `cinema_outro`.
- `characterCard` (parchment info card, opened with `?`): `nameJa`, `subtitle` and fact values accept ruby; `locked: true`
  facts show "??? — hoàn thành truyện để mở khoá" until the outro is reached.
- `brand`: small watermark in the stage corner. `look.vignette`: opt-in subtle dithered corner vignette.
- Scene changes use a Bayer-dither dissolve; voices are generated for `doneLine` (`sXX_done`) and spot lines (`sXX_tNN`) too.
- Furigana rule: every kanji in `titleCard.title`, `labels[].text`, interaction labels, `summary` and `characterCard` must use
  `{漢字|かな}` — the validator fails stories with `artQuality` (warning for legacy stories).

### Vibe kit (acting, camera, light, sound)

Per line (scene lines, `doneLine`, choice `responseLine`):

```json
{ "id": "l03_l02", "voice": "haruko", "jaRuby": "...", "vi": "...",
  "emote": "shock", "emoteSide": "left", "camera": "punch", "sfx": "shock",
  "telop": { "text": "いつもはちょっと{違|ちが}う！？", "sub": "Bình thường… khác cơ á!?", "color": "ai" } }
```

- `emote`: `sweat`, `anger`, `heart`, `sparkle`, `shock`, `question`, `note`, `dots`, `gloom` — pixel manga symbol over
  the speaker (or `emoteSide`), pops in and animates while the line plays; brings a default sound effect.
- `camera`: `push` (slow zoom toward the speaker), `punch` (comedic snap zoom), `close`, `shake`, `pan_left`, `pan_right`.
  With `emoteSide` the camera frames the actor who reacts. The 320x200 frame is cropped at presentation, never resampled.
- `telop`: big variety-show caption (string or `{ text, sub?, color?: "shu"|"gold"|"ai"|"white", x?, y? }`, % of stage).
- `sfx`: `pop`, `ding`, `whoosh`, `boing`, `shock`, `sparkle`, `thud`, `gloom`, `heart` (`"none"` silences the emote sound).
  Files live in `web/public/audio/sfx/` (regenerate with `cd web && npm run render:audio`).

Per scene: `light` (`day`, `morning`, `golden`, `dusk`, `night`, `rain`, `warm`) — one grade over backdrop, actors and
items; `bgm` (`calm`, `happy`, `tender`/`sad`, `none`, or a theme name) — switches the music from this scene on.
The MP4 exporter renders the same BGM themes and SFX into the video, with the music ducked under the voices.

### Reading page (`reading.chapters`, vocab `hanViet` / `forms`)

```json
"reading": {
  "chapters": [
    { "id": "ch1", "title": "{春|はる}の{公園|こうえん}", "titleVi": "Công viên mùa xuân",
      "sentenceIds": ["hr1", "hr2"], "scene": "tea_time" }
  ],
  "vocab": [ { "id": "yakusoku", "word": "約束", "reading": "やくそく", "hanViet": "ƯỚC THÚC",
               "forms": ["約束します"], "level": "N4", "partOfSpeech": "Danh từ", "meaningVi": "Lời hứa", "note": "..." } ]
}
```

- The reader shows a table of contents (第一章…, then 確認テスト), the chapter's scene backdrop (or `image`) with
  "▶ Xem lại cảnh này" (opens the animation at that scene), read-along of the whole chapter, and tappable vocab.
- Every vocab word found in the text (its `word`, or any of `forms` for conjugations) is underlined; tapping it opens a
  word card (reading, Hán Việt, level, meaning, note, the sentence that uses it). The validator warns
  `[Vocab Not In Text]` when a word can never be tapped.
- Reader settings (per device): text size, paper (和紙 / 古書 / 夜), 横書き / 縦書き, and 素読み (no underlines).

### Sprite `meta.json` (written by `pixellab_slice_spritesheet`)

```json
{ "spritesheet": "spritesheet.png", "frameWidth": 96, "frameHeight": 96, "frameCount": 4,
  "pivot": { "x": 47, "y": 95 }, "fps": 6, "palette": "jp_story_master",
  "clips": { "idle": { "frames": [0,0,0,0,0,0,0,0,0,0,0,2], "fps": 4, "loop": true },
             "talk": { "frames": [1,0], "fps": 7, "loop": true }, "happy": { "frames": [3], "fps": 6, "loop": true } } }
```
The pivot is placed on the stage ground line, so every frame of every clip stays registered.
`lock_expressions=True` adds `"expressionRegion": [x0, y0, x1, y1]` (the only area that differs between frames).

### Rig `rig.json` (written by `pixellab_build_rig`, next to `body.png` + `head.png`)

```json
{ "version": 1, "frameWidth": 96, "frameHeight": 96, "neckRow": 56, "neckExtension": 3,
  "pivot": { "x": 47, "y": 95 }, "palette": "jp_story_master",
  "body": { "image": "body.png" }, "head": { "sheet": "head.png", "frameHeight": 56, "frameCount": 4 },
  "fps": 6, "clips": { "idle": {...}, "talk": {...} } }
```
The engine draws body then head (current clip frame) with whole-pixel offsets only.

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
