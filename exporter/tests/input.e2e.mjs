#!/usr/bin/env node
/**
 * Real-input E2E: the other stage checks drive interactions through the autoplay cursor, which calls
 * the stage's handlers directly. This one plays like a visitor: mouse events on the canvas, on a desktop
 * and a phone-sized viewport (touch enabled), and checks each interaction completes (its done line shows).
 *
 *   - hachiko every_evening: turn the station clock's minute hand from 4:48 to 5:30 (interaction `turn`);
 *   - tsuru-ongaeshi slide_fusuma: slide the fusuma open (interaction `slide`).
 *
 * Usage: node tests/input.e2e.mjs --url http://127.0.0.1:4173 [--shots out/input]
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);
const base = arg("--url", "http://127.0.0.1:4173");
const shots = arg("--shots", path.join(__dirname, "..", "out", "input"));
fs.mkdirSync(shots, { recursive: true });
const { chromium } = createRequire(import.meta.url)("playwright");

async function stagePoint(page, x, y) {
  const box = await page.locator(".cine-stage canvas").first().boundingBox();
  return [box.x + (x / 320) * box.width, box.y + (y / 200) * box.height];
}

const turnClock = async (page) => {
  // grab the minute hand at 4:48 (0.8 of a turn) and drag it clockwise 0.7 turn (+ a little) around (252, 64)
  const [cx, cy, r] = [252, 64, 25];
  const at = (a) => stagePoint(page, cx + Math.sin(a) * r, cy - Math.cos(a) * r);
  const a0 = 0.8 * 2 * Math.PI;
  let [x, y] = await at(a0);
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 60; i++) {
    [x, y] = await at(a0 + (0.75 * 2 * Math.PI * i) / 60);
    await page.mouse.move(x, y, { steps: 2 });
  }
  await page.mouse.up();
};

const slideDoor = async (page) => {
  let [x, y] = await stagePoint(page, 242, 98);
  await page.mouse.move(x, y);
  await page.mouse.down();
  [x, y] = await stagePoint(page, 204, 99);
  await page.mouse.move(x, y, { steps: 25 });
  await page.mouse.up();
};

// done-line text to wait for: kana only (ruby puts the reading inside the text of a kanji)
const CASES = [
  ["hachiko-turn", "?story=hachiko&scene=3", turnClock, "おかえりなさい"],
  ["tsuru-slide", "?story=tsuru-ongaeshi&scene=4", slideDoor, "なんと"],
];
const VIEWPORTS = [
  ["desktop", { viewport: { width: 1100, height: 900 } }],
  ["phone", { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }],
];

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const failed = [];
try {
  for (const [vpName, opts] of VIEWPORTS) {
    for (const [label, query, act, doneText] of CASES) {
      const page = await browser.newPage(opts);
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(`${base}/${query}`, { waitUntil: "load" });
      await page.locator(".cine-hint").waitFor({ timeout: 60000 }); // the lines are over, the game is on
      await page.waitForTimeout(400);
      await act(page);
      const done = await page
        .locator(".cine-caption")
        .filter({ hasText: doneText })
        .waitFor({ timeout: 20000 })
        .then(() => true, () => false);
      await page.screenshot({ path: path.join(shots, `${label}-${vpName}.png`) });
      const ok = done && !errors.length;
      console.log(`${ok ? "✓" : "✗"} ${label} (${vpName})${errors.length ? ": " + errors.join(" | ") : done ? "" : ": not completed"}`);
      if (!ok) failed.push(`${label}-${vpName}`);
      await page.close();
    }
  }
} finally {
  await browser.close();
}
if (failed.length) {
  console.error(`INPUT E2E FAILED: ${failed.join(", ")}`);
  process.exit(1);
}
console.log(`\nINPUT E2E PASSED: ${CASES.length * VIEWPORTS.length} interactions completed with real mouse input.`);
