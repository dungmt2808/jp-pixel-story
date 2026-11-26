/** Unit tests for the deterministic exporter's timeline / audio plan (no browser needed). */
import assert from "node:assert/strict";
import { buildAudioPlan, buildMuxArgs, findOverlaps, frameStepMs, parseArgs } from "../lib/timeline.mjs";

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

console.log("Running exporter timeline tests...");

test("frameStepMs never drifts: 30 steps at 30 fps sum to exactly 1000 ms", () => {
  let sum = 0;
  for (let i = 0; i < 30; i++) sum += frameStepMs(i, 30);
  assert.equal(sum, 1000);
  let sum24 = 0;
  for (let i = 0; i < 24 * 60; i++) sum24 += frameStepMs(i, 24);
  assert.equal(sum24, 60000);
});

test("buildAudioPlan places clips relative to video frame 0 (perfMs - t0)", () => {
  const events = [
    { type: "scene", perfMs: 1000 },
    { type: "voice", perfMs: 1000, audioUrl: "/s/a.mp3", durationSec: 2.5, lineId: "l1" },
    { type: "voice", perfMs: 3920.4, audioUrl: "/s/b.mp3", durationSec: 1.2, lineId: "l2" },
    { type: "voice", perfMs: 5000, audioUrl: "/s/missing.mp3", durationSec: 1 },
    { type: "voice", perfMs: 6000 }, // line without audio (subtitle only)
  ];
  const { clips, missing } = buildAudioPlan(events, 1000, (u) => (u.includes("missing") ? null : `/abs${u}`));
  assert.deepEqual(
    clips.map((c) => [c.lineId, c.offsetMs, c.durationMs, c.file]),
    [
      ["l1", 0, 2500, "/abs/s/a.mp3"],
      ["l2", 2920, 1200, "/abs/s/b.mp3"],
    ]
  );
  assert.deepEqual(missing, ["/s/missing.mp3"]);
});

test("buildAudioPlan refuses legacy events without perfMs (stage not on shared runtime)", () => {
  assert.throws(() => buildAudioPlan([{ type: "voice", timeMs: 5, audioUrl: "/a.mp3" }], 0, () => "/a"));
});

test("findOverlaps catches the old recorder bug (scenes advancing every ~2.4 s over 9-15 s clips)", () => {
  const oldBug = [
    { lineId: "l01", offsetMs: 7, durationMs: 13845 },
    { lineId: "l02", offsetMs: 3899, durationMs: 9003 },
    { lineId: "l03", offsetMs: 6321, durationMs: 14955 },
  ];
  assert.equal(findOverlaps(oldBug).length, 2);
  const fixed = [
    { lineId: "l01", offsetMs: 0, durationMs: 13845 },
    { lineId: "l02", offsetMs: 15726, durationMs: 9003 },
    { lineId: "l03", offsetMs: 25149, durationMs: 14955 },
  ];
  assert.deepEqual(findOverlaps(fixed), []);
  // MP3 encoder padding (a few ms) is tolerated
  assert.deepEqual(findOverlaps([{ offsetMs: 0, durationMs: 1030 }, { offsetMs: 1000, durationMs: 500 }]), []);
});

test("buildMuxArgs delays every clip by its offset and pads audio to the video length", () => {
  const args = buildMuxArgs("v.mp4", [
    { file: "a.mp3", offsetMs: 0 },
    { file: "b.mp3", offsetMs: 2920 },
  ], "out.mp4");
  const filter = args[args.indexOf("-filter_complex") + 1];
  assert.match(filter, /\[1:a\][^;]*adelay=0\|0\[a0\]/);
  assert.match(filter, /\[2:a\][^;]*adelay=2920\|2920\[a1\]/);
  assert.match(filter, /amix=inputs=2:normalize=0[^;]*apad\[aout\]/);
  assert.ok(args.includes("-shortest"));
  assert.equal(args.at(-1), "out.mp4");
  assert.deepEqual(buildMuxArgs("v.mp4", [], "o.mp4").slice(-4), ["-c:v", "copy", "-an", "o.mp4"]);
});

test("parseArgs validates fps/width and rejects unknown flags", () => {
  const a = parseArgs(["node", "x", "--story", "s1", "--fps", "24", "--check"]);
  assert.equal(a.story, "s1");
  assert.equal(a.fps, 24);
  assert.equal(a.check, true);
  assert.throws(() => parseArgs(["node", "x", "--fps", "0"]));
  assert.throws(() => parseArgs(["node", "x", "--width", "100"]));
  assert.throws(() => parseArgs(["node", "x", "--bogus"]));
});

console.log(`\nALL ${passed} EXPORTER TIMELINE TESTS PASSED!`);
