#!/usr/bin/env node
/**
 * Render code-drawn props to PNG item sprites (so drag mini-games can use them like painted items).
 *   node scripts/render_proc_items.mjs   ->  public/stories/konbini-onigiri/assets/items/onigiri.png
 * Uses the same drawing code as the stage (bundled with esbuild, drawn in headless Chromium).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const ITEMS = [
  { out: "konbini-onigiri/assets/items/onigiri.png", code: "drawOnigiri(ctx, 32, 32, 2, false, 0);" },
];

const entry = `import { drawOnigiri } from "./src/engine/pixelRenderer.ts"; window.__draw = { drawOnigiri };`;
const res = await build({ stdin: { contents: entry, resolveDir: path.join(__dirname, ".."), loader: "ts" }, bundle: true, format: "iife", write: false });
const { chromium } = require("playwright");
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent("<html><body></body></html>");
await page.addScriptTag({ content: res.outputFiles[0].text });
for (const it of ITEMS) {
  const url = await page.evaluate((code) => {
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 64;
    const ctx = c.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    const { drawOnigiri } = window.__draw;
    new Function("ctx", "drawOnigiri", code)(ctx, drawOnigiri);
    // trim to the opaque bounds
    const d = ctx.getImageData(0, 0, 64, 64).data;
    let x0 = 64, y0 = 64, x1 = -1, y1 = -1;
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) if (d[(y * 64 + x) * 4 + 3] > 0) {
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
    const o = document.createElement("canvas");
    o.width = x1 - x0 + 1;
    o.height = y1 - y0 + 1;
    o.getContext("2d").drawImage(c, x0, y0, o.width, o.height, 0, 0, o.width, o.height);
    return o.toDataURL("image/png");
  }, it.code);
  const file = path.join(__dirname, "..", "public", "stories", it.out);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const png = Buffer.from(url.split(",")[1], "base64");
  fs.writeFileSync(file, png);
  // provenance: this asset is generated from code, re-running this script rebuilds it exactly
  const manifest = path.join(path.dirname(file), "provenance.json");
  const data = fs.existsSync(manifest) ? JSON.parse(fs.readFileSync(manifest, "utf8")) : { version: 1, assets: {} };
  data.assets[path.basename(file)] = {
    steps: [{ op: "render_proc_item", params: { script: "web/scripts/render_proc_items.mjs", draw: it.code }, input: null,
              source: { kind: "code", note: "drawn by web/src/engine/pixelRenderer.ts" } }],
    output: { sha: crypto.createHash("sha256").update(png).digest("hex").slice(0, 16) },
  };
  fs.writeFileSync(manifest, JSON.stringify(data, null, 2) + "\n");
  console.log(`  ${it.out}`);
}
await browser.close();
