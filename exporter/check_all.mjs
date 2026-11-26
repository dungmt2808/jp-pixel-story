#!/usr/bin/env node
/**
 * Stage E2E gate: play EVERY animated story in stories/index.json to the end on the virtual clock
 * (`export_video.mjs --check`). Fails on page errors, missing audio, overlapping voice lines, or a
 * story that never reaches its last scene.
 *
 * Usage: node check_all.mjs --url http://127.0.0.1:4173
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
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
if (failed.length) {
  console.error(`FAILED: ${failed.join(", ")}`);
  process.exit(1);
}
