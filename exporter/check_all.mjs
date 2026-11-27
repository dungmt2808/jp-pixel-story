#!/usr/bin/env node
/**
 * Stage E2E gate: play EVERY animated story in stories/index.json to the end on the virtual clock
 * (`export_video.mjs --check`). Fails on page errors, missing audio, overlapping voice lines, or a
 * story that never reaches its last scene.
 *
 * Then a REAL-TIME smoke pass (no virtual clock, like a visitor on GitHub Pages): each story autoplays
 * for a few seconds and any page error / console error fails the gate. The virtual clock alone missed
 * a crash that only happened when requestAnimationFrame timestamps preceded the line start.
 *
 * The real-time pass also measures the average draw time per frame (window.__JP_PERF__) and fails
 * above 2.5 ms: about 6x that on a slow phone still fits the 16.7 ms budget of 60 fps.
 *
 * Usage: node check_all.mjs --url http://127.0.0.1:4173 [--realtime-sec 18] [--no-realtime]
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const urlIdx = process.argv.indexOf("--url");
const url = urlIdx >= 0 ? process.argv[urlIdx + 1] : "";
const catalog = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "web", "public", "stories", "index.json"), "utf8")
);
const stories = catalog.stories.filter((s) => s.kind === "engine").map((s) => s.id);
const outDir = path.join(__dirname, "out");
fs.mkdirSync(outDir, { recursive: true });

const failed = [];
for (const id of stories) {
  const args = [path.join(__dirname, "export_video.mjs"), "--story", id, "--check", "--out", path.join(outDir, `${id}.mp4`)];
  if (url) args.push("--url", url);
  const res = spawnSync("node", args, { stdio: "inherit" });
  if (res.status !== 0) failed.push(id);
}
console.log(`\nStage E2E: ${stories.length - failed.length}/${stories.length} stories played to the end cleanly.`);

const realtimeFailed = [];
if (url && !process.argv.includes("--no-realtime")) {
  const secIdx = process.argv.indexOf("--realtime-sec");
  const seconds = secIdx >= 0 ? Number(process.argv[secIdx + 1]) : 18;
  // average JS draw time per frame on a desktop CPU; ~6x that on a slow phone must stay < 16.7 ms
  const drawBudgetMs = 2.5;
  const { chromium } = createRequire(import.meta.url)("playwright");
  const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
  try {
    for (const id of stories) {
      const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
      const errors = [];
      page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
      page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text()}`));
      await page.goto(`${url}/?story=${encodeURIComponent(id)}&autoplay=true`, { waitUntil: "load" });
      // draw-time probe: the stage adds its per-frame draw cost here (motion layers, FX...)
      await page.evaluate(() => {
        window.__JP_PERF__ = { frames: 0, drawMs: 0 };
      });
      await page.waitForTimeout(seconds * 1000);
      const perf = await page.evaluate(() => window.__JP_PERF__);
      await page.close();
      const avgMs = perf && perf.frames ? perf.drawMs / perf.frames : 0;
      if (avgMs > drawBudgetMs) errors.push(`draw ${avgMs.toFixed(2)} ms/frame > budget ${drawBudgetMs} ms`);
      if (errors.length) {
        realtimeFailed.push(id);
        console.error(`realtime ${id}: ${errors.slice(0, 3).join(" | ")}`);
      } else {
        console.log(`realtime ${id}: ${seconds}s, no errors, draw ${avgMs.toFixed(2)} ms/frame`);
      }
    }
  } finally {
    await browser.close();
  }
  console.log(`Real-time smoke: ${stories.length - realtimeFailed.length}/${stories.length} stories ran without errors.`);
}

if (failed.length || realtimeFailed.length) {
  console.error(`FAILED: ${[...failed, ...realtimeFailed.map((id) => `${id} (realtime)`)].join(", ")}`);
  process.exit(1);
}
