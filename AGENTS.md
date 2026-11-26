# jp-pixel-story — Agent Guidelines (v2.0)

This repository is an interactive **2D Pixel Art Japanese Learning Platform & Full JLPT Exam Studio** powered by:
- **Local VOICEVOX + Mini-PixelLab + JLPT QA MCP Server** (`mcp-server/server.py`, 13 tools)
- **React + Vite + HTML5 Canvas Web App** (`web/`, 4 reusable engines: `CinemaStage`, `JlptChoukaiView`, `JlptDokkaiView`, `JlptGengoView` + `DictationView` + global `ふりがな` & `🇻🇳 Dịch` toggles)
- **Playwright + FFmpeg MP4 Auto-Exporter** (`exporter/`)
- **Automated CI QA Gate** (`.github/workflows/deploy-pages.yml`)

## Key Commands
- Run backend unit tests & validate ALL lessons in `stories/index.json`:
  `cd mcp-server && PYTHONPATH=. uv run pytest -v`
- Run frontend unit tests (`ruby.ts` & `dictation.ts`):
  `cd web && npm test`
- Run interactive web app locally:
  `cd web && npm run dev`
- Type-check & build production bundle:
  `cd web && npm run build`

## Workflow Skill & Schema References
Always follow the `jp-pixel-story` skill (`.agents/plugins/jp-pixel-studio/skills/jp-pixel-story/SKILL.md`, mirrored to `.claude/skills/jp-pixel-story/`) whenever creating new stories, JLPT exam packs, pixel assets, or VOICEVOX audio.
