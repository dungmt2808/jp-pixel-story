/**
 * End-to-end A/V sync test: export a real story to MP4, then prove every voice clip starts
 * speaking in the video exactly when the timeline says it does.
 *
 * For each clip: expected = planned offset + the clip's own lead-in silence (measured in the
 * source file); actual = first non-silent instant found in the MP4 around that offset.
 * The old real-time recorder was ~670 ms early and overlapped lines; this must be <= 50 ms.
 *
 * Usage: node tests/sync.e2e.mjs [--story konbini-onigiri] [--url http://127.0.0.1:4173] [--fps 5]
 */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (name, def) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : def;
};
const story = arg("--story", "konbini-onigiri");
const url = arg("--url", "");
const fps = arg("--fps", "5");
const TOLERANCE_MS = 50;

/** Seconds from `startSec` until the first non-silent audio in `file` (0 if sound at once). */
function onsetSec(file, startSec = 0, durSec = 3) {
  const { stderr } = spawnSync(
    "ffmpeg",
    ["-v", "info", "-ss", String(Math.max(0, startSec)), "-t", String(durSec), "-i", file,
      "-af", "silencedetect=noise=-40dB:d=0.04", "-f", "null", "-"],
    { encoding: "utf8" }
  );
  const starts = [...stderr.matchAll(/silence_start: (-?[0-9.]+)/g)].map((m) => Number(m[1]));
  const ends = [...stderr.matchAll(/silence_end: ([0-9.]+)/g)].map((m) => Number(m[1]));
  return starts.length && starts[0] <= 0.001 ? ends[0] ?? durSec : 0;
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jp-sync-"));
const out = path.join(tmp, `${story}.mp4`);
const args = [path.join(__dirname, "..", "export_video.mjs"), "--story", story, "--fps", fps, "--out", out];
if (url) args.push("--url", url);
console.log(`Exporting ${story} at ${fps} fps for the sync test...`);
execFileSync("node", args, { stdio: "inherit" });

const timeline = JSON.parse(fs.readFileSync(`${out}.timeline.json`, "utf8"));
const probe = execFileSync(
  "ffprobe",
  ["-v", "error", "-show_entries", "stream=codec_type,width,height,duration", "-of", "json", out],
  { encoding: "utf8" }
);
const streams = JSON.parse(probe).streams;
const video = streams.find((s) => s.codec_type === "video");
const audio = streams.find((s) => s.codec_type === "audio");
assert.ok(video && audio, "MP4 must contain both video and audio");
assert.equal(video.width, 960, "stage must be pinned to an exact 3x (960px) width");
assert.equal(video.height, 600);
assert.ok(Math.abs(Number(video.duration) - Number(audio.duration)) < 0.1, "audio must span the whole video");
assert.deepEqual(timeline.overlaps, [], "voice lines must never overlap");
assert.ok(timeline.clips.length > 0, "story must have voiced lines");

let worst = 0;
for (const clip of timeline.clips) {
  const leadIn = onsetSec(clip.file, 0, 2);
  const planned = clip.offsetMs / 1000;
  const windowStart = Math.max(0, planned - 0.3); // >= 0.6 s of silence precede every line
  const actual = windowStart + onsetSec(out, windowStart, 1.5);
  const diffMs = Math.round((actual - (planned + leadIn)) * 1000);
  worst = Math.max(worst, Math.abs(diffMs));
  console.log(`  ${String(clip.lineId).padEnd(10)} planned ${planned.toFixed(3)}s  lead-in ${(leadIn * 1000).toFixed(0)}ms  diff ${diffMs}ms`);
  assert.ok(Math.abs(diffMs) <= TOLERANCE_MS, `${clip.lineId}: A/V offset ${diffMs}ms > ${TOLERANCE_MS}ms`);
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\nSYNC E2E PASSED: ${timeline.clips.length} clips, worst offset ${worst} ms (tolerance ${TOLERANCE_MS} ms)`);
