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
const rig = await loadTsModule("src/engine/rigAnimator.ts");
const ui = await loadTsModule("src/engine/cinemaUi.ts");

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
  assert.deepEqual(cinema.actorFocus("left", cast, "minh"), { talking: true, active: true, listening: false });
  assert.deepEqual(cinema.actorFocus("right", cast, "minh"), { talking: false, active: false, listening: true });
  assert.deepEqual(cinema.actorFocus("right", cast, "narrator"), { talking: false, active: true, listening: false });
  assert.deepEqual(cinema.actorFocus("left", cast, null), { talking: false, active: true, listening: false });
});

test("sceneBackdropRef: checklist override > backdrop > legacy locationBadge", () => {
  assert.equal(cinema.sceneBackdropRef({ backdrop: "bg:park", locationBadge: "bg:x" }, null), "bg:park");
  assert.equal(cinema.sceneBackdropRef({ locationBadge: "bg:ofuro" }, null), "bg:ofuro");
  assert.equal(cinema.sceneBackdropRef({ backdrop: "bg:park" }, "proc:washoku_table"), "proc:washoku_table");
});

// --- head/body rig ---------------------------------------------------------------------------

const rigData = rig.normalizeRig({
  frameWidth: 96,
  frameHeight: 96,
  neckRow: 57,
  neckExtension: 3,
  pivot: { x: 47, y: 95 },
  body: { image: "body.png" },
  head: { sheet: "head.png", frameHeight: 57, frameCount: 4 },
  fps: 6,
  clips: { idle: { frames: [0, 0, 0, 2], fps: 4 }, talk: { frames: [1, 0], fps: 7 } },
});

test("normalizeRig exposes head frames as a sprite meta and validates the neck", () => {
  assert.equal(rigData.head.frameHeight, 57);
  assert.equal(rigData.head.frameCount, 4);
  assert.deepEqual(rigData.head.clips.talk.frames, [1, 0]);
  assert.throws(() => rig.normalizeRig({ frameWidth: 96, frameHeight: 96, neckRow: 120 }));
});

test("rigPose only ever moves parts by whole pixels, within the hidden neck extension", () => {
  for (let i = 0; i < 400; i++) {
    const t = i * 0.037;
    for (const st of [{ talking: true, listening: false }, { talking: false, listening: true }, { talking: false, listening: false }]) {
      const p = rig.rigPose(st, t);
      for (const v of [p.bodyDy, p.headDx, p.headDy]) assert.ok(Number.isInteger(v));
      assert.ok(p.bodyDy >= -1 && p.bodyDy <= 0);
      assert.ok(p.headDy >= -1 && p.headDy <= 1 && -p.headDy <= rigData.neckExtension);
    }
  }
});

test("rigPose: breathing for everyone, bobbing only when talking, nodding only when listening", () => {
  const ts = Array.from({ length: 300 }, (_, i) => i * 0.01);
  const dys = (st) => new Set(ts.map((t) => rig.rigPose(st, t).headDy));
  assert.deepEqual([...dys({ talking: true, listening: false })].sort(), [-1, 0]);
  assert.deepEqual([...dys({ talking: false, listening: true })].sort(), [0, 1]);
  assert.deepEqual([...dys({ talking: false, listening: false })], [0]);
  assert.ok(new Set(Array.from({ length: 400 }, (_, i) => rig.rigPose({ talking: false, listening: false }, i * 0.01).bodyDy)).size === 2);
  // two actors breathe out of sync thanks to the phase offset
  const same = ts.filter((t) => rig.rigPose({ talking: false, listening: false }, t).bodyDy === rig.rigPose({ talking: false, listening: false }, t, 1.3).bodyDy);
  assert.ok(same.length < ts.length);
});

test("rigHeadFrame plays the talk clip while talking and the idle (blink) clip otherwise", () => {
  assert.equal(rig.rigHeadFrame(rigData, true, 0), 1);
  assert.equal(rig.rigHeadFrame(rigData, true, 0.15), 0);
  assert.equal(rig.rigHeadFrame(rigData, false, 0.8), 2);
  assert.equal(rig.rigHeadFrame(rigData, false, 0.1), 0);
});

// --- cinematic player v2 -------------------------------------------------------------------

test("toPct maps virtual 320x200 coordinates onto the stage", () => {
  assert.deepEqual(ui.toPct(160, 100), { left: "50%", top: "50%" });
  assert.deepEqual(ui.toPct(0, 200), { left: "0%", top: "100%" });
});

test("pixelLine is a gap-free 1px line including both ends", () => {
  const pts = ui.pixelLine([2, 3], [9, 6]);
  assert.deepEqual(pts[0], [2, 3]);
  assert.deepEqual(pts.at(-1), [9, 6]);
  for (let i = 1; i < pts.length; i++) {
    assert.ok(Math.abs(pts[i][0] - pts[i - 1][0]) <= 1 && Math.abs(pts[i][1] - pts[i - 1][1]) <= 1);
  }
  assert.equal(new Set(pts.map((p) => p[0])).size, 8); // one pixel per column on a shallow line
});

test("arcDots draws an integer arc above the straight path, excluding the ends", () => {
  const dots = ui.arcDots([10, 100], [90, 100], 7, 20);
  assert.equal(dots.length, 7);
  assert.ok(dots.every(([x, y]) => Number.isInteger(x) && Number.isInteger(y) && y < 100 && x > 10 && x < 90));
  assert.equal(Math.min(...dots.map((d) => d[1])), 80); // apex lifted by `lift`
});

test("hintText uppercases Vietnamese and appends progress", () => {
  assert.equal(ui.hintText("kéo hộp cơm lên tấm bạt", 0, 1), "KÉO HỘP CƠM LÊN TẤM BẠT");
  assert.equal(ui.hintText("tìm cánh hoa", 1, 3), "TÌM CÁNH HOA · 1/3");
});

test("drag: pick the item under the pointer, snap onto the target or return home", () => {
  let items = ui.initDrag([{ id: "a", from: [40, 150], to: [160, 130] }, { id: "b", from: [80, 150], to: [200, 130] }]);
  assert.equal(ui.pickDragItem(items, [42, 148]), 0);
  assert.equal(ui.pickDragItem(items, [300, 10]), -1);
  let r = ui.dropDragItem(items, 0, [100, 100]);
  assert.equal(r.placed, false);
  assert.deepEqual(r.items[0].pos, [40, 150]);
  r = ui.dropDragItem(items, 0, [165, 134]);
  assert.equal(r.placed, true);
  assert.deepEqual(r.items[0].pos, [160, 130]);
  items = r.items;
  assert.equal(ui.pickDragItem(items, [160, 130]), -1); // placed items can't be picked again
});

test("tap spots are found once, hold gauge fills while held and drains slowly", () => {
  const spots = [{ id: "p1", x: 50, y: 50 }, { id: "p2", x: 100, y: 60, r: 6 }];
  assert.equal(ui.hitTapSpot(spots, [], [55, 52]), "p1");
  assert.equal(ui.hitTapSpot(spots, ["p1"], [55, 52]), null);
  assert.equal(ui.hitTapSpot(spots, [], [108, 60]), null);
  let p = 0;
  for (let i = 0; i < 30; i++) p = ui.stepHold(p, true, 0.1, 2);
  assert.equal(p, 1);
  const after = ui.stepHold(0.5, false, 0.1, 2);
  assert.ok(after < 0.5 && after > 0.45);
  assert.equal(ui.stepHold(0, false, 1, 2), 0);
});

test("ditherDissolve keeps more of the old frame as amount grows, none at 0, all at 1", () => {
  const w = 8, h = 8;
  const mk = (v) => new Uint8ClampedArray(w * h * 4).fill(v);
  const count = (a) => { let n = 0; for (let i = 0; i < a.length; i += 4) if (a[i] === 200) n++; return n; };
  const results = [0, 0.25, 0.5, 1].map((amt) => { const cur = mk(10); ui.ditherDissolve(cur, mk(200), w, h, amt, 1); return count(cur); });
  assert.deepEqual(results, [0, 16, 32, 64]);
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
