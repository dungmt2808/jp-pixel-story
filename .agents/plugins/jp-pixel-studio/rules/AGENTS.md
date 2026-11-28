# jp-pixel-studio Rules

- Keep Japanese authentic and natural for the target JLPT level (N5–N1).
- **No Romaji anywhere**: use compact `{漢字|かんじ}` Furigana notation with the `ふりがな ON/OFF` toggle.
- Every Kanji must have accurate Furigana; never place ruby on pure Kana characters.
- Respect **`🇻🇳 Dịch ON/OFF`**: default `ON` on interactive video stages (so learners can toggle subtitles off in 1 click) and default `OFF` on JLPT exam rooms (`JlptDokkaiView`, `JlptGengoView`) to prevent spoiling answers.
- Always categorize entries in `web/public/stories/index.json` strictly as `"jlpt"`, `"situation"`, or `"story"`.
- Always pass natural Japanese Kanji (not all-Hiragana) to VOICEVOX for authentic pitch accent; override tricky readings (`（水）→水曜日`, `※` strip, `はは→ああ`) only via `ttsText`, prefer `.mp3` audio, and audition samples before pushing.
- Always run `story_validate_catalog` (or `cd mcp-server && PYTHONPATH=. uv run pytest -v`) and `cd web && npm test && npm run build` before committing or pushing.
- New animated stories use `"engine": "cinema"` (data-driven); never add a per-story stage component or route by story id.
- Lock every asset to the story's palette (story.json `palette`; validator fails on off-palette PNGs): new painted stories build their own with art.json `palette_build` and `"dither": 0` backgrounds, code-drawn worlds and older stories use the master `jp_story_master`; never scale pixel art by fractions in code (`drawPixelImage` / `drawSpriteFrame` / `drawPixelZoom`).
- Character animation = one expression spritesheet per character through `pixellab_slice_spritesheet(registration="bust", cleanup=True, lock_expressions=True)` + `pixellab_build_rig`, referenced as `assets.rigs` + `cast.*.rig`.
- Keep raw art in `art-src/<story>/`, pass `source=` to the pixellab tools, and declare `"artQuality"` in every new story.json.
