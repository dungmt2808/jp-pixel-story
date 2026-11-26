#!/usr/bin/env node
/**
 * Deterministic MP4 exporter for jp-pixel-story.
 *
 * Old approach (real-time Playwright recordVideo) had two bugs: headless Chromium blocked
 * `audio.play()`, so every line "lasted" a fixed 2 s and the muxed voices piled on top of each
 * other; and the audio offsets were measured from component mount, not from the first video
 * frame (~0.7 s early).
 *
 * New approach:
 *   1. open `?story=<id>&autoplay=true&record=1` with Playwright's VIRTUAL clock paused;
 *   2. in record mode the stage never plays audio - each line holds exactly `durationSec`;
 *   3. step the clock 1 frame at a time and screenshot `.canvas-viewport` (canvas + subtitles);
 *   4. voice events carry `perfMs` on the same virtual clock -> exact video offsets for FFmpeg.
 * The result is frame-exact and independent of machine speed.
 *
 * Usage:
 *   node export_video.mjs --story jlpt-n4-2025-12-japan-life [--fps 30] [--width 960] [--out out.mp4]
 *   node export_video.mjs --story konbini-onigiri --check      # fast timeline check, no video (CI)
 */

import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildAudioPlan, buildMuxArgs, findOverlaps, frameStepMs, parseArgs } from "./lib/timeline.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const webPublic = path.join(repoRoot, "web", "public");
const require = createRequire(import.meta.url);

const realSleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForHttp(url, maxMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // retry
    }
    await realSleep(250);
  }
  throw new Error(`Timed out waiting for web server at ${url}`);
}

async function startPreview() {
  console.log("Building web app and starting Vite preview server...");
  execFileSync("npm", ["run", "build"], { cwd: path.join(repoRoot, "web"), stdio: "inherit" });
  const port = 4300 + Math.floor(Math.random() * 500);
  const proc = spawn("npx", ["vite", "preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    cwd: path.join(repoRoot, "web"),
    stdio: "ignore",
  });
  const url = `http://127.0.0.1:${port}`;
  await waitForHttp(url);
  return { proc, url };
}

/**
 * Pin `.canvas-viewport` to an exact integer multiple of the 320x200 virtual canvas
 * (960x600 = 3x by default) so every virtual pixel becomes the same number of video pixels.
 */
async function pinStageSize(page, width) {
  const height = Math.round((width * 200) / 320);
  // Player v2 (cine-player): pin the whole player width; the stage inside keeps 16:10 = exact 3x.
  await page.addStyleTag({
    content:
      `.cine-player{width:${width}px!important;max-width:none!important}` +
      `.canvas-viewport{width:${width}px!important;height:${height}px!important;max-width:none!important;aspect-ratio:auto!important;flex:none!important}`,
  });
  const box = await page.evaluate(() => {
    const r = document.querySelector(".canvas-viewport")?.getBoundingClientRect();
    return r ? { w: r.width, h: r.height } : null;
  });
  if (!box || Math.round(box.w) !== width || Math.round(box.h) !== height) {
    console.warn(`! stage is ${JSON.stringify(box)}, wanted ${width}x${height}`);
  }
}

function resolveAudio(audioUrl) {
  const f = path.join(webPublic, audioUrl.replace(/^\/+/, ""));
  return fs.existsSync(f) ? f : null;
}

async function main() {
  const opts = parseArgs(process.argv);
  const { chromium } = require("playwright");
  const outPath = path.resolve(opts.out || path.join(__dirname, "out", `${opts.story}.mp4`));
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  let server = null;
  let baseUrl = opts.url;
  if (!baseUrl) {
    server = await startPreview();
    baseUrl = server.url;
  }

  const errors = [];
  const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
  let report;
  try {
    const context = await browser.newContext({ viewport: { width: 1100, height: 1000 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(`console: ${m.text()}`);
    });

    // Freeze time BEFORE the app runs: nothing animates until we step the clock.
    await page.clock.install({ time: 0 });
    await page.clock.pauseAt(1000);
    const target = `${baseUrl}/?story=${encodeURIComponent(opts.story)}&autoplay=true&record=1`;
    console.log(`Rendering ${target} (${opts.check ? "check mode" : `${opts.fps} fps`})`);
    await page.goto(target, { waitUntil: "load" });

    const readyBy = Date.now() + 30000;
    while (!(await page.evaluate(() => window.__JP_STAGE_READY__ === true))) {
      if (Date.now() > readyBy) throw new Error("Stage never became ready (assets failed to load?)");
      await realSleep(100);
    }
    await page.evaluate(() => document.fonts.ready.then(() => true));
    if (!opts.check) await pinStageSize(page, opts.width);
    const t0 = await page.evaluate(() => performance.now());

    // record the whole cinematic player (tool bar + stage + caption bar) when present
    const el = (await page.$(".cine-player")) ?? (await page.$(".canvas-viewport"));
    let ffmpeg = null;
    const tmpVideo = `${outPath}.video.mp4`;
    if (!opts.check) {
      ffmpeg = spawn(
        "ffmpeg",
        ["-y", "-v", "error", "-f", "image2pipe", "-framerate", String(opts.fps), "-c:v", "png", "-i", "-",
          // yuv420p needs even dimensions (a 599px-high element made the old encoder exit instantly)
          "-vf", "crop=trunc(iw/2)*2:trunc(ih/2)*2",
          "-c:v", "libx264", "-preset", "medium", "-crf", "16", "-pix_fmt", "yuv420p", "-r", String(opts.fps), tmpVideo],
        { stdio: ["pipe", "inherit", "inherit"] }
      );
      ffmpeg.exitCode_ = null;
      ffmpeg.on("close", (code) => {
        ffmpeg.exitCode_ = code;
      });
      ffmpeg.stdin.on("error", () => {}); // surfaced through exitCode_ below
    }

    const stepFps = opts.check ? 20 : opts.fps; // check mode only needs coarse steps
    const maxFrames = Math.ceil(opts.maxSec * stepFps);
    const tailFrames = Math.round(opts.tailSec * stepFps);
    let frames = 0;
    let doneAt = -1;
    const started = Date.now();
    for (let i = 0; ; i++) {
      if (ffmpeg) {
        if (ffmpeg.exitCode_ !== null) throw new Error(`ffmpeg exited early with code ${ffmpeg.exitCode_}`);
        const png = await el.screenshot({ type: "png", animations: "disabled", caret: "hide" });
        if (!ffmpeg.stdin.write(png)) {
          // wait for drain OR an ffmpeg crash (never hang forever on a dead pipe)
          await new Promise((r) => {
            ffmpeg.stdin.once("drain", r);
            ffmpeg.once("close", r);
          });
        }
      }
      frames++;
      await page.clock.runFor(frameStepMs(i, stepFps));
      if (doneAt < 0 && (await page.evaluate(() => window.__JP_STORY_DONE__ === true))) doneAt = i;
      if (doneAt >= 0 && i - doneAt >= tailFrames) break;
      if (i >= maxFrames) throw new Error(`Story did not finish within ${opts.maxSec}s of virtual time`);
      if (!opts.check && i % (opts.fps * 5) === 0 && i > 0) {
        console.log(`  ${(i / opts.fps).toFixed(0)}s rendered (${((Date.now() - started) / 1000).toFixed(0)}s wall)`);
      }
    }

    const events = await page.evaluate(() => window.__JP_STORY_EVENTS__ ?? []);
    const { clips, missing } = buildAudioPlan(events, t0, resolveAudio);
    const overlaps = findOverlaps(clips);
    const durationSec = frames / stepFps;

    if (ffmpeg) {
      ffmpeg.stdin.end();
      const code = ffmpeg.exitCode_ !== null ? ffmpeg.exitCode_ : await new Promise((r) => ffmpeg.on("close", r));
      if (code !== 0) throw new Error(`ffmpeg (video) exited with ${code}`);
      execFileSync("ffmpeg", buildMuxArgs(tmpVideo, clips, outPath), { stdio: "inherit" });
      fs.rmSync(tmpVideo, { force: true });
    }

    report = {
      story: opts.story,
      mode: opts.check ? "check" : "video",
      fps: stepFps,
      frames,
      durationSec: Number(durationSec.toFixed(3)),
      voiceClips: clips.length,
      clips,
      missingAudio: missing,
      overlaps,
      errors,
      output: opts.check ? null : outPath,
    };
    const reportPath = opts.check
      ? path.join(path.dirname(outPath), `${opts.story}.check.json`)
      : `${outPath}.timeline.json`;
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
    await context.close();
  } finally {
    await browser.close();
    if (server) server.proc.kill();
  }

  const problems = [
    ...report.errors,
    ...report.missingAudio.map((u) => `missing audio file: ${u}`),
    ...report.overlaps.map((o) => `voices overlap: ${o.a} / ${o.b} by ${o.overlapMs}ms`),
  ];
  console.log(
    `${report.story}: ${report.durationSec}s, ${report.frames} frames, ${report.voiceClips} voice clips` +
      (report.output ? ` -> ${report.output}` : "")
  );
  if (problems.length) {
    console.error(`FAILED (${problems.length} problem(s)):\n  - ${problems.join("\n  - ")}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
