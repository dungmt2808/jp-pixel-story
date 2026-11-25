# jp-pixel-studio Rules

- Always keep Japanese text authentic and natural for the requested JLPT level (N5–N1).
- Every Kanji in `story.json` must have accurate Furigana in `jaRuby` segments (`{ "t": "漢字", "r": "かんじ" }`).
- Provide clean `ttsText` in Hiragana/natural Japanese whenever Kanji readings are ambiguous for VOICEVOX.
- Keep pixel art locked to one of the curated palettes in `mcp-server/palettes.py` (`midnight_tokyo`, `konbini_warm`, `kyoto_autumn`, `snes_rpg`).
- Always verify `voicevox_health` before batch-synthesizing story audio.
