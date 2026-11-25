# Story, Catalog & Daily Dictation Schema Reference

## 1. Library Catalog (`web/public/stories/index.json`)

```json
{
  "stories": [
    {
      "id": "konbini-onigiri",
      "category": "situation",
      "kind": "engine",
      "thumbStyle": "konbini",
      "titleJa": "夜のコンビニ",
      "titleVi": "Lần đầu mua cơm nắm lúc nửa đêm",
      "level": "JLPT N5–N4",
      "description": "Tóm tắt ngắn gọn tình huống/câu chuyện.",
      "sceneCount": 6,
      "vocabCount": 6,
      "grammarCount": 4,
      "quizCount": 3
    }
  ]
}
```
- `category`: strictly `"situation"` (`💬 Tình huống`) or `"story"` (`📖 Câu chuyện`).
- `kind`: `"engine"` (uses React `PixelStage` + `ReadingView` + auto `DictationView`) or `"standalone"` (requires `href`: `"stories/<id>/index.html"` + `dictation.json`).

## 2. Standard Story (`web/public/stories/<id>/story.json`)

- **No Romaji UI**: keep every Kanji annotated via `jaRuby` (`{ "t": "漢字", "r": "かんじ" }`) so the **`ふりがな ON/OFF`** button works everywhere.
- **`reading` object must include:**
  - `sentences`: clickable reading sentences with VOICEVOX audio.
  - `vocab`: `{ id, word, reading, level, partOfSpeech, meaningVi, note }`.
  - `grammar`: `{ id, pattern, level, meaningVi, explanation, exampleJa, exampleRuby, exampleVi }`.
  - `quiz`: `{ id, questionJa: RubySegment[], questionVi, options: [{ ja: RubySegment[] }], correctIndex, explanationVi }`.

## 3. Standalone Daily Dictation Pack (`web/public/stories/<id>/dictation.json`)

Automatically generated for standalone stories by MCP tool `voicevox_generate_standalone_pack`:

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
      "jaRuby": [
        { "t": "東京", "r": "とうきょう" },
        { "t": "の" },
        { "t": "渋谷", "r": "しぶや" }
      ],
      "vi": "Ở Shibuya, Tokyo, có một giáo sư đại học tên là Ueno.",
      "audioUrl": "/stories/hachiko/audio/line_00.mp3",
      "durationSec": 5.184
    }
  ]
}
```
