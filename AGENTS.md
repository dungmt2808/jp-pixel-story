# jp-pixel-story — Agent Guidelines

This repository is an interactive 2D Pixel Art Japanese learning engine + automated video studio powered by:
- **Local VOICEVOX MCP + Mini-PixelLab MCP** (`mcp-server/server.py`)
- **HTML5 Canvas + React Interactive Stage & Reading View** (`web/`)
- **Playwright + FFmpeg MP4 Auto-Exporter** (`exporter/`)

## Key Commands
- Test MCP server: `cd mcp-server && uv run pytest -v`
- Run interactive web demo: `cd web && npm run dev`
- Build web app: `cd web && npm run build`
- Synthesize VOICEVOX audio for a story: use MCP tool `voicevox_generate_story_audio` or run:
  `cd mcp-server && uv run python -c "import asyncio; from voicevox_client import generate_story_audio; print(asyncio.run(generate_story_audio('../web/public/stories/konbini-onigiri/story.json')))"`

## Workflow Skill
Use the `jp-pixel-story` skill (`.agents/plugins/jp-pixel-studio/skills/jp-pixel-story/SKILL.md`) whenever creating new Japanese learning stories, processing pixel sprites, or exporting videos.
