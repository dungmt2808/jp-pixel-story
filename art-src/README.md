# art-src — raw source art (not deployed)

Raw images that Mini-PixelLab turned into the pixel assets under `web/public/stories/<id>/assets/`.
Every processed asset has a `provenance.json` record pointing here, so it can be rebuilt byte-for-byte:

```bash
# from mcp-server/
uv run python -c "import provenance, json; print(json.dumps(provenance.reprocess('../web/public/stories/hanami-first/assets/provenance.json'), indent=2))"
```
(or call the MCP tool `pixellab_reprocess`).

`hanami-first/` holds stand-in sources authored in code for the demo story (no image model was
available): they deliberately carry AI-generator defects (anti-aliasing, JPEG noise, green spill,
drift between spritesheet cells) to exercise the pipeline.

## `<story>/legacy/` — art made before provenance records

The first stories (`tsuru-ongaeshi`, `jlpt-n4-2025-07-rain-bgm`, `ramen-midnight`, the portraits of
`jlpt-n4-2025-12-japan-life`) were drawn before this pipeline kept raw images and prompts. For them:

- sprites that failed the craft checks (soft outline, speckle noise) keep their **original file here**;
  the deployed asset is `pixellab_cleanup_sprite(legacy/<file>)`, recorded in `provenance.json`, so
  it replays byte-for-byte like any other asset;
- every other legacy asset (backgrounds, portraits that already passed) is recorded as a
  `legacy_master`: the file is its own source; `reprocess` only checks it was not edited since;
- sprites whose remaining "noise" is real texture (feathers, a woven cloth, a dithered yolk, the
  plane's livery) carry a written reason in the story's `artExceptions` instead of a warning.

New art always starts from a raw image in this folder (see `PROMPTS.md` of each story).

`hanami-first/raw_walk_*.png` are real walk-cycle sheets (full-body route B people) made from
`PROMPTS-walk.md`; `standin_walk.py` draws the code stand-ins used before them.
