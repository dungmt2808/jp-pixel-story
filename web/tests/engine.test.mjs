/**
 * Unit tests for the shared stage engine (runtime timing, pixel-perfect scaling, sprite
 * animation, data-driven cinema rules, engine routing). Same zero-dependency harness as
 * utils.test.mjs: esbuild bundles each TS module in memory, Node's assert checks it.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, "..");

async function loadTsModule(relPath) {
  const res = await build({
    entryPoints: [path.join(webRoot, relPath)],
    bundle: true,
    format: "esm",
    platform: "node",
    write: false,
  });
  const code = res.outputFiles[0].text;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
}

const rt = await loadTsModule("src/engine/stageRuntime.ts");
const px = await loadTsModule("src/engine/pixelScale.ts");
const sprite = await loadTsModule("src/engine/spriteAnimator.ts");
const cinema = await loadTsModule("src/engine/cinemaModel.ts");
const engines = await loadTsModule("src/engine/stageEngines.ts");

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

console.log("Running jp-pixel-story engine unit tests...");

// --- stage runtime -----------------------------------------------------------------------

test("voiceHoldMs uses the real clip length (no more fixed 2 s skip-ahead)", () => {
  assert.equal(rt.voiceHoldMs(13.845), 13845);
  assert.equal(rt.voiceHoldMs(0.4), 1200); // very short clips still readable
  assert.equal(rt.voiceHoldMs(undefined), 2500);
});

test("isRecordMode reads ?record=1 / ?record=true only", () => {
  assert.equal(rt.isRecordMode("?story=a&record=1"), true);
  assert.equal(rt.isRecordMode("?record=true"), true);
  assert.equal(rt.isRecordMode("?record=0"), false);
  assert.equal(rt.isRecordMode("?autoplay=true"), false);
});

test("logStoryEvent stamps both stage-relative timeMs and absolute perfMs", () => {
  const ev = rt.logStoryEvent({ type: "voice", audioUrl: "/a.mp3" }, 1000, 1500.4);
  assert.equal(ev.timeMs, 500);
  assert.equal(ev.perfMs, 1500.4);
});

test("stepTransition swaps scene exactly once at full coverage, then fades in", () => {
  const tr = { active: true, phase: "out", amount: 0, nextIdx: 3 };
  const swaps = [];
  for (let i = 0; i < 60; i++) {
    const s = rt.stepTransition(tr, 1 / 60, 2.8);
    if (s !== null) swaps.push([i, s, tr.amount]);
  }
  assert.equal(swaps.length, 1);
  assert.equal(swaps[0][1], 3);
  assert.equal(swaps[0][2], 1);
  assert.equal(tr.active, false);
  assert.equal(tr.amount, 0);
  assert.equal(rt.stepTransition(tr, 0.1), null);
});

test("backingScale picks a whole-number canvas multiple covering the CSS width", () => {
  assert.equal(rt.backingScale(960, 320, 1), 3);
  assert.equal(rt.backingScale(952, 320, 1), 3);
  assert.equal(rt.backingScale(961, 320, 1), 4);
  assert.equal(rt.backingScale(480, 320, 2), 3);
  assert.equal(rt.backingScale(100, 320, 1), 1);
});

// --- pixel-perfect scaling -----------------------------------------------------------------

test("integerUpscale never returns a fractional factor (96px into 122px box -> 1x)", () => {
  assert.equal(px.integerUpscale({ w: 96, h: 96 }, { w: 122, h: 122 }), 1);
  assert.equal(px.integerUpscale({ w: 48, h: 48 }, { w: 122, h: 122 }), 2);
  assert.equal(px.integerUpscale({ w: 32, h: 64 }, { w: 200, h: 130 }), 2);
});

test("downsampleModeRGBA keeps only original colours and binary alpha", () => {
  // 4x4 source: left half red, right half blue, one transparent pixel, one green speck
  const R = [255, 0, 0, 255];
  const B = [0, 0, 255, 255];
  const T = [0, 0, 0, 0];
  const G = [0, 255, 0, 255];
  const rows = [
    [R, R, B, B],
    [R, G, B, B],
    [R, R, B, T],
    [R, R, B, B],
  ];
  const src = new Uint8ClampedArray(rows.flat(2));
  const out = px.downsampleModeRGBA(src, 4, 4, 2, 2);
  const pixel = (x, y) => Array.from(out.slice((y * 2 + x) * 4, (y * 2 + x) * 4 + 4));
  assert.deepEqual(pixel(0, 0), R); // green speck loses the vote, no blended colour
  assert.deepEqual(pixel(1, 0), B);
  assert.deepEqual(pixel(1, 1), B); // 3/4 opaque -> opaque
  for (let i = 3; i < out.length; i += 4) assert.ok(out[i] === 0 || out[i] === 255);
});

test("downsampleModeRGBA drops cells that are mostly transparent", () => {
  const T = [0, 0, 0, 0];
  const W = [255, 255, 255, 255];
  const src = new Uint8ClampedArray([W, T, T, T].flat());
  const out = px.downsampleModeRGBA(src, 2, 2, 1, 1);
  assert.equal(out[3], 0);
});

test("quantizeZoom snaps camera zoom to whole numbers", () => {
  assert.equal(px.quantizeZoom(1.055), 1);
  assert.equal(px.quantizeZoom(1.26), 1);
  assert.equal(px.quantizeZoom(1.55), 2);
  assert.equal(px.quantizeZoom(0.5), 1);
});

// --- sprite animation ----------------------------------------------------------------------

const meta = sprite.normalizeSpriteMeta({
  spritesheet: "spritesheet.png",
  frameWidth: 48,
  frameHeight: 64,
  frameCount: 4,
  pivot: { x: 24, y: 63 },
  fps: 8,
  clips: { idle: [0, 1], talk: { frames: [2, 3], fps: 10 }, wave: { frames: [0, 2, 3], loop: false } },
});

test("normalizeSpriteMeta fills fps/loop defaults per clip", () => {
  assert.deepEqual(meta.clips.idle, { frames: [0, 1], fps: 8, loop: true });
  assert.equal(meta.clips.talk.fps, 10);
  assert.equal(meta.clips.wave.loop, false);
});

test("normalizeSpriteMeta defaults pivot to bottom-centre and adds an 'all' clip", () => {
  const m = sprite.normalizeSpriteMeta({ frameWidth: 32, frameHeight: 40, frameCount: 3 });
  assert.deepEqual(m.pivot, { x: 16, y: 40 });
  assert.deepEqual(m.clips.all.frames, [0, 1, 2]);
});

test("normalizeSpriteMeta rejects clips that reference missing frames", () => {
  assert.throws(() =>
    sprite.normalizeSpriteMeta({ frameWidth: 8, frameHeight: 8, frameCount: 2, clips: { bad: [0, 5] } })
  );
});

test("frameAt loops at the clip's own fps", () => {
  assert.equal(sprite.frameAt(meta, "talk", 0), 2);
  assert.equal(sprite.frameAt(meta, "talk", 0.1), 3);
  assert.equal(sprite.frameAt(meta, "talk", 0.2), 2);
  assert.equal(sprite.frameAt(meta, "idle", 0.124), 0);
  assert.equal(sprite.frameAt(meta, "idle", 0.125), 1);
});

test("frameAt holds the last frame of one-shot clips and tolerates unknown clip names", () => {
  assert.equal(sprite.frameAt(meta, "wave", 10), 3);
  assert.equal(sprite.frameAt(meta, "nope", 0), 0);
});

test("spritesheetUrl resolves next to meta.json", () => {
  assert.equal(
    sprite.spritesheetUrl("./stories/x/assets/sprites/yui/meta.json", meta),
    "./stories/x/assets/sprites/yui/spritesheet.png"
  );
});

// --- data-driven cinema rules --------------------------------------------------------------

test("cinemaSceneKind maps legacy and new scene types", () => {
  assert.equal(cinema.cinemaSceneKind("cinema_intro"), "intro");
  assert.equal(cinema.cinemaSceneKind("cinema_checklist"), "checklist");
  assert.equal(cinema.cinemaSceneKind("cinema_explore"), "checklist");
  assert.equal(cinema.cinemaSceneKind("cinema_reveal"), "dialogue");
  assert.equal(cinema.cinemaSceneKind("cinema_dialogue"), "dialogue");
  assert.equal(cinema.cinemaSceneKind("cinema_outro"), "outro");
});

test("resolveCast prefers story.cast, else the first two portraits keyed by voice", () => {
  const legacy = cinema.resolveCast({ assets: { backgrounds: {}, portraits: { lisa: "a", haruko: "b" } } });
  assert.deepEqual(legacy.left, { voice: "lisa", portrait: "lisa" });
  assert.deepEqual(legacy.right, { voice: "haruko", portrait: "haruko" });
  const explicit = cinema.resolveCast({ cast: { left: { voice: "minh", sprite: "minh" } }, assets: undefined });
  assert.equal(explicit.left.sprite, "minh");
  assert.equal(explicit.right, undefined);
});

test("visibleActors: none in intro, left only in outro, explicit override wins", () => {
  assert.deepEqual(cinema.visibleActors({ type: "cinema_intro" }), []);
  assert.deepEqual(cinema.visibleActors({ type: "cinema_outro" }), ["left"]);
  assert.deepEqual(cinema.visibleActors({ type: "cinema_dialogue" }), ["left", "right"]);
  assert.deepEqual(cinema.visibleActors({ type: "cinema_outro", actors: ["left", "right"] }), ["left", "right"]);
});

test("actorFocus dims only the listener during a cast line; narrator keeps both lit", () => {
  const cast = { left: { voice: "minh" }, right: { voice: "yui" } };
  assert.deepEqual(cinema.actorFocus("left", cast, "minh"), { talking: true, active: true });
  assert.deepEqual(cinema.actorFocus("right", cast, "minh"), { talking: false, active: false });
  assert.deepEqual(cinema.actorFocus("right", cast, "narrator"), { talking: false, active: true });
  assert.deepEqual(cinema.actorFocus("left", cast, null), { talking: false, active: true });
});

test("sceneBackdropRef: checklist override > backdrop > legacy locationBadge", () => {
  assert.equal(cinema.sceneBackdropRef({ backdrop: "bg:park", locationBadge: "bg:x" }, null), "bg:park");
  assert.equal(cinema.sceneBackdropRef({ locationBadge: "bg:ofuro" }, null), "bg:ofuro");
  assert.equal(cinema.sceneBackdropRef({ backdrop: "bg:park" }, "proc:washoku_table"), "proc:washoku_table");
});

// --- engine routing ------------------------------------------------------------------------

test("resolveStageEngine routes by story.engine, not by hard-coded story ids", () => {
  assert.equal(engines.resolveStageEngine({ engine: "tsuru", scenes: [] }), "tsuru");
  assert.equal(engines.resolveStageEngine({ engine: "procedural", scenes: [] }), "pixel");
  assert.equal(engines.resolveStageEngine({ scenes: [{ type: "depato_intro" }] }), "depato");
  assert.equal(engines.resolveStageEngine({ scenes: [{ type: "cinema_intro" }] }), "cinema");
  assert.equal(engines.resolveStageEngine({ scenes: [{ type: "skyline_intro" }] }), "pixel");
});

console.log(`\nALL ${passed} ENGINE TESTS PASSED!`);
