#!/usr/bin/env node
/**
 * Automated MP4 Video Exporter for jp-pixel-story.
 *
 * Launches a local static preview (or uses an existing dev URL) at `?story=<id>&autoplay=true`,
 * captures the entire 2D pixel-art animation via Playwright, collects exact millisecond timestamps
 * of every VOICEVOX dialogue line played, and muxes lossless VOICEVOX WAV voiceovers cleanly via FFmpeg.
 *
 * Usage:
 *   node export_video.mjs --story konbini-onigiri [--url http://127.0.0.1:5173] [--out ./out/konbini-onigiri.mp4]
 */

import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

function parseArgs(argv) {
  const args = {
    story: "konbini-onigiri",
    url: "",
    out: "",
    timeoutSec: 120,
  };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--story" && argv[i + 1]) args.story = argv[++i];
    else if (argv[i] === "--url" && argv[i + 1]) args.url = argv[++i];
    else if (argv[i] === "--out" && argv[i + 1]) args.out = argv[++i];
    else if (argv[i] === "--timeout" && argv[i + 1])
      args.timeoutSec = Number(argv[++i]);
  }
  if (!args.out) {
    args.out = path.join(__dirname, "out", `${args.story}.mp4`);
  }
  return args;
}

async function waitForHttp(url, maxMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Timed out waiting for web server at ${url}`);
}

async function main() {
  const opts = parseArgs(process.argv);
  const { chromium } = await import("playwright");

  let serverProc = null;
  let baseUrl = opts.url;

  if (!baseUrl) {
    baseUrl = "http://127.0.0.1:4173";
    console.log("Building web app and starting Vite preview server...");
    execFileSync("npm", ["run", "build"], {
      cwd: path.join(repoRoot, "web"),
      stdio: "inherit",
    });
    serverProc = spawn(
      "npx",
      ["vite", "preview", "--host", "127.0.0.1", "--port", "4173", "--strictPort"],
      {
        cwd: path.join(repoRoot, "web"),
        stdio: "ignore",
      }
    );
    await waitForHttp(baseUrl);
  }

  const outPath = path.resolve(opts.out);
  const tempDir = path.join(path.dirname(outPath), `.tmp_${opts.story}_${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const targetUrl = `${baseUrl}/?story=${encodeURIComponent(opts.story)}&autoplay=true`;
  console.log(`Recording autoplay session: ${targetUrl}`);

  let rawVideoPath = "";
  let events = [];

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 980, height: 700 },
      recordVideo: {
        dir: tempDir,
        size: { width: 980, height: 700 },
      },
    });
    const page = await context.newPage();
    await page.goto(targetUrl, { waitUntil: "networkidle" });

    // Wait until the autoplay director signals completion
    await page.waitForFunction(() => window.__JP_STORY_DONE__ === true, null, {
      timeout: opts.timeoutSec * 1000,
    });
    events = await page.evaluate(() => window.__JP_STORY_EVENTS__ || []);

    const video = page.video();
    await context.close();
    if (video) {
      rawVideoPath = await video.path();
    }
  } finally {
    await browser.close();
    if (serverProc) serverProc.kill();
  }

  if (!rawVideoPath || !fs.existsSync(rawVideoPath)) {
    throw new Error("Playwright failed to save recorded WebM video.");
  }

  // Collect exact VOICEVOX WAV files played at recorded timestamps
  const voiceEvents = events
    .filter((ev) => ev.type === "voice" && ev.audioUrl)
    .map((ev) => ({
      timeMs: Math.max(0, ev.timeMs),
      filePath: path.join(repoRoot, "web", "public", ev.audioUrl.replace(/^\//, "")),
    }))
    .filter((ev) => fs.existsSync(ev.filePath));

  console.log(
    `Muxing video + ${voiceEvents.length} synced VOICEVOX WAV clips with FFmpeg...`
  );

  const ffmpegArgs = ["-y", "-i", rawVideoPath];
  for (const ev of voiceEvents) {
    ffmpegArgs.push("-i", ev.filePath);
  }

  if (voiceEvents.length > 0) {
    const filterParts = voiceEvents.map(
      (ev, idx) =>
        `[${idx + 1}:a]adelay=${ev.timeMs}|${ev.timeMs},aresample=44100[a${idx}]`
    );
    const mixInputs = voiceEvents.map((_, idx) => `[a${idx}]`).join("");
    filterParts.push(
      `${mixInputs}amix=inputs=${voiceEvents.length}:normalize=0:dropout_transition=0[aout]`
    );

    ffmpegArgs.push(
      "-filter_complex",
      filterParts.join(";"),
      "-map",
      "0:v:0",
      "-map",
      "[aout]",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-crf",
      "18",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-shortest",
      outPath
    );
  } else {
    ffmpegArgs.push(
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-crf",
      "18",
      outPath
    );
  }

  execFileSync("ffmpeg", ffmpegArgs, { stdio: "inherit" });
  fs.rmSync(tempDir, { recursive: true, force: true });
  console.log(`Done! Exported MP4: ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
