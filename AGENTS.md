# jp-pixel-story — Agent Guidelines (v2.0)

This repository is an interactive **2D Pixel Art Japanese Learning Platform & Full JLPT Exam Studio** powered by:
- **Local VOICEVOX + Mini-PixelLab + JLPT QA MCP Server** (`mcp-server/server.py`, 26 tools)
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

## Visual QA & Story-Authoring Guardrails (Lessons Learned — Do Not Regress)
Always verify these checks on every new story, sprite sheet, and background before shipping:
1. **Lock eyes on talk frames (`frame_regions` in `art.json`):** For 4-frame bust sheets (`0=neutral`, `1=open mouth`, `2=blink`, `3=small mouth`), always set `frame_regions` so talk frames `1` and `3` ONLY overwrite the mouth box (`eye_diff == 0`) and blink frame `2` ONLY overwrites the eye box. Never allow pupils or eyebrows to jitter/dart while a character speaks.
2. **Despill chroma-green halos & clean skin speckles before quantization:** Run VFX green-screen despill (`G <= max(R, B)` on non-background pixels) on characters without green clothing so zero green pixels remain near hair/collars, and verify zoomed 3× processed sheets visually.
3. **No Bayer checkerboard dots for light or corners:** Keep `look.vignette` off unless explicitly requested (avoids chunky black corner dots on bright scenes), and keep `drawGlow` (`web/src/engine/sceneMotion.ts`) as a soft warm radial gradient rather than a Bayer dot grid.
4. **Never leave floating labels or mini-game UI out of phase:**
   - Hide HTML `cine-tag` labels AND canvas `drawLeaderLine` whenever `cameraRef.current.zoom > 1.01` so tags never detach from zoomed canvas lines or collide with emotes.
   - Draw `hold` interaction items, target rings, and progress meters **only while `phase === "interact"`** (never before lines finish, and never lingering after completion during `doneLine`/`ready`).
5. **Match interactive targets to the exact spoken landmark & clear character faces:** Plot a 320×200 coordinate grid on every new background before placing `people`, `labels`, `hold`, or `drag` targets. Ensure the action hits the exact object mentioned in dialogue (e.g., watering directly into the glass seedling cover `ガラスの屋根`, not an unrelated bed) and never overlaps any character's face (`cd web && npm test` fails when a `hold` / `drag` / `tap` box meets an on-stage bust's expression region).
6. **Authentic Japanese architecture scale:** When depicting traditional Japanese inns (`旅館ことば屋`) in exterior shots, draw a larger, unmistakably traditional Japanese ryokan (curved *kawara* tile roof, *noren* curtain, glowing *shoji* lattice windows, *engawa* veranda, stone lantern) rather than a small Western-style cabin/shed.
7. **Run Stage E2E A/V sync before pushing new stories:** Always verify `autoplay=true&record=1` plays to `__JP_STORY_DONE__` with zero `findOverlaps` voice collisions (in particular, final `tap` spots with a `line` must finish speaking before `completeInteraction` plays `doneLine` or advances, and single-pick checklists use `"mode": "one"`).
8. **Never lose facial features in processing:** after any change to sprite downsampling, palettes or colour budgets, compare zoomed faces (3×+) of every rebuilt sheet against the raw: eyes, mouth and rosy cheeks must survive. Colour budgets merge by perceptual cost (`limit_colors`: count × OKLab distance², never "rarest first", which erased mouths and blush), and key-pose sheets downsample with `keep_lines` (default 0.3) because an ~11× reduction averages a mouth away.
