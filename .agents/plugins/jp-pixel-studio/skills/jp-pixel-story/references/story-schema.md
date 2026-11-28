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
  - `"engine"` — React interactive stage (`CinemaStage`, `"engine": "cinema"`) + `ReadingView` + auto `DictationView`.
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

- `engine`: `"cinema"` (the only stage; the former `"tsuru"`, `"depato"`, `"hybrid"`, `"pixel"` stages were removed after
  their stories were ported — a story still using one shows a "no longer supported" notice).
- Scene `type`: `cinema_intro` (title banner + start button), `cinema_dialogue` / `cinema_reveal` (lines + continue),
  `cinema_checklist` / `cinema_explore` (clickable choices, each may switch `backdrop`), `cinema_outro` (reading / dictation / card / replay buttons).
- `backdrop`: `"bg:<key>"` (a palette-locked PNG from `assets.backgrounds`) or `"proc:<name>"` from `PROCEDURAL_BACKDROPS`
  (`washoku_table`, `airport_train`). `overlay`: `bath_steam`, `snow`, `rain`, `petals` (`web/src/engine/cinemaBackdrops.ts`).
- `cast.left/right`: `voice` (matches `lines[].voice` to animate talking), and one of (best first):
  `rig` (head/body cutout from `pixellab_build_rig`: expression clips on the head + breathing / nodding / bobbing),
  `sprite` (frame animation from a `pixellab_slice_spritesheet` meta.json, playing `idleClip` / `talkClip`), or a static `portrait`.
  `scale` is a whole number. A cast member with only a `portrait` is animated automatically when an expression sheet
  exists for that portrait key (`assets.rigs[key]` / `assets.sprites[key]`): it talks, blinks and nods, and line
  `castPortrait` switches between animated expressions. Those sheets come from art.json `characters`
  (`{ "key": "<portrait key>", "raw": "raw_sheet_<key>.png", "kind": "bust" }`; walk cycles: `"kind": "walk"`), run with
  `art_manifest.py <art.json> --only characters`; prompts per story in `art-src/<story>/PROMPTS-cast.md`.
- `artQuality`: strict validator thresholds for this story's sprites (outline colour compliance, isolated-pixel ratio, optional `maxColorsPerSprite`).
  `artExceptions`: `{ "/stories/<id>/assets/item_cloth.png": { "noise": "woven silk texture (12.3% after cleanup, reviewed)" } }`
  — a reviewed decision that one metric (`outline`, `noise`, `colors`) does not apply to one sprite; a written reason is
  required and the validator counts them (`stats.art_exceptions`). Clean first (`pixellab_cleanup_sprite`), excuse last.
  Without `cast`, the first two `assets.portraits` are used (legacy).
- `actors`: which sides are on stage (default: none in intro, both in dialogue/checklist, left only in outro).
- Scene `cast`: `{ "right": { "voice": "kitamura", "portrait": "kitamura" } }` replaces the story cast for that side in
  this scene only (a new character in a new place). Line `bgm` switches the music when that line starts (the store's rain song).
- `lines[]`: `{ id, voice, speakerLabel, jaPlain, ttsText?, jaRuby, vi, audioUrl, durationSec, ttsHash }` — the last three are written by `voicevox_generate_story_audio`.
- `reading`: `{ sectionTitle, subtitle, sentences, vocab, grammar, quiz }`. Daily Dictation is built automatically from all voiced lines.

### Cinematic player v2 (Classmate-style chrome, labels & mini-games)

`CinemaStage` renders every cinema story as one player: a top bar (title + `?` card, `ふ` furigana, `JA·VI`, mute, close),
the 16:10 pixel stage, and a caption bar *under* the stage (speaker, Japanese with ruby, Vietnamese, or the outro
buttons). During an interaction its `hint` sits at the TOP of the frame (the stamp and brand step aside), so lines
spoken while tapping keep their subtitles. UI type: Japanese labels / telops in DotGothic16, Vietnamese UI lines in
VT323 (DotGothic16 and Press Start 2P have no Vietnamese letters). Tags near the frame edge hang inwards.
All coordinates below are in the 320x200 virtual frame. Example: `hanami-first`.

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
- `interaction` runs after the scene's lines; `hint` shows in uppercase at the top of the frame with progress (`1/3`).
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
- `castPortrait`: switch a cast member's expression from this line on (`{ "right": "otsu_plead" }`, keys of
  `assets.portraits`); `castExit`: sides that slide off the stage when the line starts (`["right"]`, a farewell).

Choices (`cinema_checklist`): `minigame.mode: "one"` makes the buttons a single pick (the others lock, the story goes on
after one answer) — `"all"` (default) asks to try every answer. `autoPick` is the answer taken in autoplay / videos;
`prompt` is shown in the caption bar until a choice is made.

Per scene: `light` (`day`, `morning`, `golden`, `dusk`, `night`, `rain`, `warm`) — one grade over backdrop, actors and
items; `bgm` (`calm`, `happy`, `tender`/`sad`, `none`, or a theme name) — switches the music from this scene on.
The MP4 exporter renders the same BGM themes and SFX into the video, with the music ducked under the voices.

### Series mascot: StackChan (`mascot`, scene `tips`, cast `mascot`, people kind `stackchan`)

The same pixel StackChan as the ことば畑 Anki add-on (dungmt2808/kotoba-anki), drawn in code
(`web/src/engine/mascot/stackchan.ts`): box body, screen face, 13 moods, wardrobe, talking mouth.

```json
"mascot": { "kind": "stackchan", "name": "StackChan", "wear": { "head": "nonla", "neck": "scarf" } },
"scenes": [
  { "id": "intro", "people": { "bot": { "kind": "stackchan", "x": -96, "y": 190, "wear": { "head": "nonla" } } },
    "cues": [ { "line": 0, "people": [ { "who": "bot", "walkTo": 40, "speed": 26, "then": "wave" } ] } ],
    "tips": [ { "after": 0, "who": "bot", "mood": "happy", "text": "Chào cả nhà!", "ja": "お{花見|はなみ}に{行|い}こう！" } ] },
  { "id": "s2", "tips": [ { "after": 1, "mood": "think", "text": "「Vた + ことがありません」: chưa từng…",
                           "ja": "{桜|さくら}を{見|み}たことがありません。" } ] }
]
```

- `tips` pop up between the lines (`after` = line index, -1 = before the first) and pause the scene for `sec`
  (default from the text length): StackChan rises at the bottom centre with a speech bubble (Vietnamese `text`, Japanese
  `ja`, both with ruby). With `who` (a `people` id) the bubble sits over that StackChan in the shot, which waves instead.
- Moods: idle, happy, star, sad, think, heart, wink, surprise, cool, cry, kira, pout, sleep. Wardrobe `head`/`face`/`neck`:
  leaf, hachimaki, catears, straw, santa, nonla, grad, crown, glasses, bandaid, bow, scarf, bell; `shell`: sky, matcha, sakura, gold.
- As a speaking cast member: `"cast": { "right": { "voice": "stackchan", "mascot": "stackchan" } }` (bust, scale 4 = the
  96 px portrait height); its mouth moves while its lines play and its mood follows the line (`mascotMood`, or the `emote`).
- In a wide shot: `people` kind `stackchan` (full body, scale 2: stand / walk / wave / sit, steps follow the distance walked).

### Route B — code-drawn worlds, full-body people, cues (`set:`, `people`, `cues`)

Everything drawn in code from one style kit (`web/src/engine/proc/`), characters act in a wide shot, and
the world changes with the story. Example: `hachiko` (ported from the old standalone page).

```json
{ "id": "every_evening", "type": "cinema_dialogue", "backdrop": "set:shibuya", "actors": [],
  "set": { "sky": "dusk", "lamp": 1, "lit": 1, "clock": 4.8 },
  "people": { "hachi": { "kind": "dog", "x": 214, "y": 150, "face": "right", "pose": "sit" },
              "sensei": { "kind": "sensei", "x": 272, "y": 150, "hidden": true } },
  "lines": [ ... ],
  "cues": [ { "done": true, "set": { "clock": 5.5 } },
            { "done": true, "delay": 1.0, "set": { "train": "go" } },
            { "done": true, "delay": 4.9, "people": [ { "who": "sensei", "walkTo": 238, "speed": 16 } ] },
            { "done": true, "delay": 6.6, "people": [ { "who": "hachi", "pose": "stand", "hop": 1.6 } ] } ],
  "interaction": { "type": "tap", "hint": "Bấm vào đồng hồ", "spots": [ { "id": "clock", "x": 272, "y": 78, "r": 10 } ],
                   "doneDelaySec": 7.4, "doneLines": [ { "id": "h07", "emote": "heart", "emoteWho": "hachi", ... } ] } }
```

- `backdrop: "set:<name>"` + `set` parameters: `shibuya` (sky morning|dusk|night|grey|winter blending 1.5 s, sun, moon, stars,
  far, ground, tree spring|summer|autumn|winter, snow, lit, lamp, clock hour (hands ease), train go|loop, weather
  sakura|rain|leaves|snow, crowd {n, seed}, statue {x}, cloth 1→0 unveils, paper [x, y]) and `shibuya_today`.
  The world sits 20 px low: people stand on y = 150, the station clock is at (272, 78).
- `people`: `{ kind: dog | bronze-dog | sensei | person | sprite:<key>, x, y, face, pose: stand|walk|sit|run, age, coat,
  seed, hidden, hideWhileInteract }`. `sprite:<key>` uses an `assets.sprites` meta.json with clips idle / walk / sit / run
  (PixelLab walk cycles go through `pixellab_slice_spritesheet` with `registration: "centroid"`, `facing: "right"` and a
  walk clip `{ "frames": [0..7], "fps": 10, "stridePx": 28 }` (≈ 2 × the foot spread of a contact frame; generated sheets
  whose figures are not evenly spaced: `split: "gaps"`; `pixel_pitch` fixes the scale): walk frames follow the distance travelled, so the
  feet stay planted at any `speed`; the sprite is mirrored when it faces the other way). People also work on painted
  `bg:` scenes (e.g. `hanami-first` intro: Minh and Yui walk into the park; prompts in `art-src/hanami-first/PROMPTS-walk.md`).
  The validator warns `[Sprite Clips]` (no idle / no walk clip) and `[Foot Slide]` (walk clip without `stridePx`).
- `cues`: `{ at | line | doneLine | done | choice, ifChoice, delay, set: {...}, backdrop, people: [{ who, walkTo, speed,
  then: pose|"exit", x, face, pose, show, fadeOut, hop }] }` — anchors are recorded as the scene plays, so videos are
  deterministic. `choice: "<id>"` fires when that answer is picked; `ifChoice` keeps a cue only if that answer was picked
  earlier in the story. `backdrop: "bg:loom"` cuts to another picture (a door slides open on another room); the scene's own
  `motion` stays with the scene's backdrop, the new one brings its `backdropMotion`.
- Other code-drawn sets: `konbini_skyline {title}`, `konbini_exterior`, `konbini_interior`, `konbini_counter {scanned}`,
  `konbini_closeup {effect: "microwave"|"polite_bow"}`, `konbini_outro {warmed}` (story `konbini-onigiri`).
- Lines: `emoteWho` puts the emote (and camera focus) on a person. Interactions: `doneLines` (several lines after the
  game, cues can anchor on them), `doneDelaySec` (let the cues play first), drag `items[].person` drags a person.
- `holdSec`: minimum time on screen (scenes without lines, e.g. seasons passing).

### Acting with key poses (`kind: "poses"` sheets, `interaction.actors`, `interaction.drive`)

Characters act by CHANGING POSE (a new drawing per beat, like the reference player's Edison: walk in, write,
hold up the bulb, hand on chin, hand on the lever), not by sliding one portrait around. Make the art with
`art-src/<story>/art.json` characters of `kind: "poses"` (prompts and the splice technique:
`art-src/kasa-jizo/PROMPTS-poses.md`): every pose of a character in ONE sheet, one pitch, one pivot (feet),
one colour budget; meta clips `<pose>` (base frame) / `<pose>_loop` and `poses: {name: [frames]}`.
```json
"people": { "ojiisan_work": { "kind": "sprite:ojiisan_poses", "x": 80, "y": 168, "pose": "weave",
                              "onlyWhileInteract": true } },
"interaction": { "type": "hold", "hint": "Giữ tay để ông lão đan nón", "actors": [],
                 "hold": { "label": "{笠|かさ}を{編|あ}む", "x": 80, "y": 50, "durationSec": 1.8 },
                 "drive": { "who": "ojiisan_work", "pose": "weave", "by": "holding", "fps": 4 } }
```
- `interaction.actors`: busts on stage WHILE the player acts (default: the scene's `actors`). `[]` cuts to a medium
  shot of `people`; the busts come back for the `doneLine` (a reaction shot).
- people `onlyWhileInteract: true`: the posing body exists only during the interaction (the opposite of
  `hideWhileInteract`), so the same character is never on stage twice (validator `[Double Character]` knows this).
- `interaction.drive` `{ who, pose, by, fps?, stepSec?, flash? }`: the player's input picks the frame of that key pose
  (the reference lever: arm and lever are ONE painting per state). `by`: `holding` (frames loop while held /
  dragged), `progress` (frames step through the progress; 2 frames = before/after, the last only when complete),
  `step` (each placed item / found spot plays the other frames once). `flash: [x, y]` sparkles on a frame change.
- Cuts inside a scene: a cue `actors` changes the busts on stage from that moment (`[]` = medium shot), e.g. a
  choice that makes her pour tea: `{ "choice": "warm_tea", "actors": [], "people": [{ "who": "oba_tea", "show": true,
  "fadeIn": 0.25 }] }` then `{ "choice": "warm_tea", "delay": 1, "people": [{ "who": "oba_tea", "pose": "pour_tea_b" }] }`.
  Each edit of a pose is its own clip named like its raw (`raw_pose_obaasan_pour_tea_b.png` -> `pour_tea_b`), so a cue
  can hold a state. Cue anchor `spot: "<tap spot id>"` fires when the player finds that spot (she gasps at the shoji).
  People `hidden` + a cue `show` (with `fadeIn`) step into the shot; put `emoteWho` on lines whose speaker is a person
  (choice `responseLine`s and spot `line`s included). Keep a posing body above the bottom row (y <= 178) in scenes
  with choice buttons. The validator checks `spot` / `choice` anchors and knows that a hidden person shown only by
  cutting cues never meets their own bust.
- A pose for a line or a moment: any clip is a `pose` of a sprite person, e.g. cue
  `{ "done": true, "people": [{ "who": "ojiisan_bow", "show": true }] }` with `pose: "bow"` when the narration says
  he bows. The validator flags `[Unknown Pose]` (not a clip of the sheet) and `[Bad Drive]`.
- Do not put ~100 px key poses in the same shot as an old 64 px walk sheet: one pitch per character per shot.
- The validator checks person kinds, cue anchors/people, `emoteWho`, set names; `set:` counts as code-drawn for `[Style Mix]`.

### Route C — motion layers on painted backgrounds (`scene.motion`)

Painted art gives the detail, code gives the movement. All coordinates are virtual (320x200) and every
effect is a pure function of scene time, so videos stay deterministic. Example: `日本の生活`.

```json
"motion": [
  { "type": "scroll", "speed": 26, "radius": 3, "rects": [[16, 56, 60, 56], [86, 56, 68, 56]] },
  { "type": "sweep", "rect": [0, 118, 320, 82], "speed": 26, "spacing": 46, "width": 12, "slant": 0.6 },
  { "type": "rumble", "period": 0.9 },
  { "type": "glow", "at": [157, 19], "r": 24, "color": "#ffe2b0", "period": 5, "min": 0.2, "max": 0.42, "flicker": false },
  { "type": "steam", "at": [[128, 117], [100, 136]], "rate": 1.4, "height": 18 },
  { "type": "shimmer", "rect": [118, 128, 64, 72], "minLuma": 150 },
  { "type": "mover", "item": "plane", "path": [[196, 95], [140, 95]], "durationSec": 15, "delaySec": 2,
    "ease": "linear", "flipX": false, "scale": 1, "show": "always", "front": [[161, 90, 3, 32]] }
]
```

- `scroll`: the background pixels inside the window `rects` become one continuous strip (mirrored, seamless) that
  slides past every window — the scenery outside a train or bus. `radius` keeps rounded window frames.
- `sweep`: diagonal light/shadow bands crossing a region (sun through poles). `rumble`: the world bumps 1 px "ta-tan".
- `glow`: a breathing, dithered light (lamps, TV, the sun). `steam`: puffs rising from points. `shimmer`: bright
  pixels of a reflection sparkle in a travelling wave.
- `mover`: an `assets.items` sprite along a `path` (top-left positions); `ease: "in"` accelerates (take-off),
  `scale: 0.5` for far away, `show: "moving"` hides it before/after its trip, `startOn` (a cue anchor such as
  `{ "done": true }` or `{ "line": 1 }`) starts its `delaySec` from that moment (the crane takes off once the snare is
  untied; until then it waits at its first point), and the `front` rects of the
  background are redrawn over it so it passes BEHIND mullions, bridges, planters...
- Objects baked into a painting are cut out with art.json `objects` (lasso `polygon` + `exclude` occluders, in RAW
  image coordinates): `pixellab_apply_art_manifest` writes the sprite to `assets.items[key]`, an emptied background
  to `assets.backgrounds[clean]` (hole filled), switches the listed scenes to it and reports the sprite's `origin`
  (the mover's first path point). Single cuts: `pixellab_extract_object`.
- The validator checks motion types, rects inside the frame and mover items; `scroll`/`mover` want a `bg:` backdrop.

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
