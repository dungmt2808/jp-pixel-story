# jp-pixel-story — Agent Guidelines (v2.0)

This repository is an interactive **2D Pixel Art Japanese Learning Platform & Full JLPT Exam Studio** powered by:
- **Local VOICEVOX + Mini-PixelLab + JLPT QA MCP Server** (`mcp-server/server.py`, 23 tools)
- **React + Vite + HTML5 Canvas Web App** (`web/`, shared stage engine in `web/src/engine/` — `useStageRuntime`, pixel-perfect scaling, `SpriteAnimator`, `RigAnimator`; data-driven `CinemaStage` for all new stories; `JlptChoukaiView`, `JlptDokkaiView`, `JlptGengoView` + `DictationView` + global `ふりがな` & `🇻🇳 Dịch` toggles)
- **Deterministic Playwright (virtual clock) + FFmpeg MP4 Exporter & stage E2E check** (`exporter/`)
- **Automated CI QA Gate** (`.github/workflows/deploy-pages.yml`)

## Key Commands
- Run backend unit tests & validate ALL lessons in `stories/index.json`:
  `cd mcp-server && PYTHONPATH=. uv run pytest -v`
- Run frontend unit tests (`ruby.ts`, `dictation.ts`, stage engine):
  `cd web && npm test`
- Run exporter unit tests / play every animated story end-to-end / A/V sync test:
  `cd exporter && npm test && npm run check:all -- --url <preview url> && npm run test:e2e -- --url <preview url>`
- Run interactive web app locally:
  `cd web && npm run dev`
- Type-check & build production bundle:
  `cd web && npm run build`

## Workflow Skill & Schema References
Always follow the `jp-pixel-story` skill (`.agents/plugins/jp-pixel-studio/skills/jp-pixel-story/SKILL.md`, mirrored to `.claude/skills/jp-pixel-story/`) whenever creating new stories, JLPT exam packs, pixel assets, or VOICEVOX audio.
