# jp-pixel-studio Rules

- Always keep Japanese text authentic and natural for the requested JLPT level (N5–N1).
- **No Romaji**: Use Furigana (`jaRuby` or `{漢字|かんじ}`) with the `ふりがな ON/OFF` toggle instead of Romaji.
- Every single Kanji must have accurate Furigana; never place ruby on pure Kana characters.
- Always include **Vocab (`vocab`)**, **Applied Grammar (`grammar` with `exampleRuby`)**, and **Reading Quiz (`quiz`)** at the end of every lesson.
- Always categorize lessons in `web/public/stories/index.json` as `"situation"` (Tình huống) or `"story"` (Câu chuyện).
- Prefer lightweight `.mp3` VOICEVOX audio (`audio_format="mp3"`) for fast GitHub Pages loading.
- Always run `story_validate_content` MCP tool before committing a new lesson.
