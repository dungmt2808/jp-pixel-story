---
name: jp-pixel-story
description: >-
  Create a new 3-in-1 interactive 2D pixel-art Japanese learning lesson
  (Animated Story + Reading/Vocab/Grammar/Quiz + Daily Dictation) with
  Furigana-only toggle and local VOICEVOX MP3 audio.
---

# Creating a New 3-in-1 Japanese Learning Lesson

Follow `.agents/plugins/jp-pixel-studio/skills/jp-pixel-story/SKILL.md` and `.agents/plugins/jp-pixel-studio/skills/jp-pixel-story/references/story-schema.md`.

## Quick Checklist
1. Check VOICEVOX with `voicevox_health` and pick speaker IDs via `voicevox_list_speakers`.
2. Choose category (`"situation"` or `"story"`) and format:
   - **Standard Engine:** write `story.json` (no Romaji, exact Furigana on every Kanji, `vocab`, `grammar` with `exampleRuby`, `quiz`) → run `voicevox_generate_story_audio` (`audio_format="mp3"`). Daily Dictation works automatically!
   - **Standalone Interactive HTML (Hachikō style):** write `index.html` with `ふりがな ON/OFF`, `📚 Thư viện`, `🎧 Nghe chép` → run `voicevox_generate_standalone_pack` to generate MP3s + `manifest.json` + `dictation.json`.
3. Register the lesson in `web/public/stories/index.json`.
4. Run `story_validate_content` to verify 0 missing Furigana, 100% audio presence, and catalog registration.
5. Build (`cd web && npm run build`) and push to `main` for automatic GitHub Pages deploy.
