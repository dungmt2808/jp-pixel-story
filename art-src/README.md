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
