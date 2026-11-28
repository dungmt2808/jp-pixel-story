/**
 * Unit tests for the shared stage engine (runtime timing, pixel-perfect scaling, sprite
 * animation, data-driven cinema rules, engine routing). Same zero-dependency harness as
 * utils.test.mjs: esbuild bundles each TS module in memory, Node's assert checks it.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
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
const mascot = await loadTsModule("src/engine/mascot/stackchan.ts");
const vibe = await loadTsModule("src/engine/cinemaVibe.ts");
const themes = await loadTsModule("src/audio/themes.ts");
const motion = await loadTsModule("src/engine/sceneMotion.ts");
const people = await loadTsModule("src/engine/people.ts");
const cues = await loadTsModule("src/engine/cues.ts");
const shibuya = await loadTsModule("src/engine/proc/shibuya.ts");
const sets = await loadTsModule("src/engine/proc/sets.ts");
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

test("walk clips with stridePx follow distance, so the feet never slide; facing is parsed", () => {
  const walker = sprite.normalizeSpriteMeta({
    frameWidth: 32, frameHeight: 48, frameCount: 10, facing: "right",
    clips: { walk: { frames: [0, 1, 2, 3, 4, 5, 6, 7], fps: 10, stridePx: 24 }, idle: [8, 9] },
  });
  assert.equal(walker.facing, "right");
  assert.equal(walker.clips.walk.stridePx, 24);
  assert.equal(walker.clips.idle.stridePx, undefined);
  // 8 frames per 24 px = one frame every 3 px, whatever the time
  assert.equal(sprite.frameAtDistance(walker, "walk", 0, 5), 0);
  assert.equal(sprite.frameAtDistance(walker, "walk", 2.9, 0), 0);
  assert.equal(sprite.frameAtDistance(walker, "walk", 3, 0), 1);
  assert.equal(sprite.frameAtDistance(walker, "walk", 24 + 7, 0), 2);
  assert.equal(sprite.frameAtDistance(walker, "walk", -6, 0), 2);
  // no stride -> time-based like frameAt
  assert.equal(sprite.frameAtDistance(walker, "idle", 100, 0.6), sprite.frameAt(walker, "idle", 0.6));
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
  // an off-stage speaker (e.g. a voice-over from the left while only the right actor is shown) dims nobody
  assert.deepEqual(cinema.actorFocus("right", cast, "minh", ["right"]), { talking: false, active: true, listening: false });
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


test("camera: identity by default, push eases in toward the speaker, crops stay inside the frame", () => {
  assert.deepEqual(vibe.cameraAt(undefined, 1, [60, 80]), vibe.IDENTITY_VIEW);
  const start = vibe.cameraAt("push", 0, [60, 80]);
  const end = vibe.cameraAt("push", 5, [60, 80]);
  assert.equal(start.zoom, 1);
  assert.ok(end.zoom > 1.15 && end.zoom <= 1.2);
  assert.ok(end.cx < 160, "moves toward the left speaker");
  for (const view of [end, vibe.cameraAt("close", 0, [2, 2]), vibe.cameraAt("punch", 0.05, [318, 198])]) {
    const r = vibe.cameraSourceRect(view);
    assert.ok(r.sx >= 0 && r.sy >= 0 && r.sx + r.sw <= 320.0001 && r.sy + r.sh <= 200.0001, JSON.stringify(r));
  }
  // shake settles back to the centre with whole-pixel offsets
  const shaking = vibe.cameraAt("shake", 0.1, [0, 0]);
  assert.ok(Number.isInteger(shaking.cx - 160) && Number.isInteger(shaking.cy - 100));
  assert.deepEqual([vibe.cameraAt("shake", 2, [0, 0]).cx, vibe.cameraAt("shake", 2, [0, 0]).cy], [160, 100]);
});

test("drawEmote never throws, even when the frame timestamp is older than the line start", () => {
  // regression: rAF `now` can precede the line start -> negative age -> frames[-1] -> TypeError,
  // which killed the render loop and froze the backgrounds on the live site
  const calls = [];
  const ctx = {
    fillStyle: "",
    save() {}, restore() {}, translate() {}, scale() {},
    fillRect(x, y, w, h) { calls.push([x, y, w, h]); },
  };
  for (const name of vibe.EMOTE_NAMES) {
    for (const age of [-0.25, -0.004, 0, 0.1, 0.5, 3.3, 60]) {
      assert.doesNotThrow(() => vibe.drawEmote(ctx, name, 100, 80, age, 2), `${name} @ ${age}`);
    }
  }
  assert.ok(calls.length > 0);
});

test("lineSfx: explicit sfx wins, 'none' silences, emotes bring a default sound", () => {
  assert.equal(vibe.lineSfx({ emote: "shock" }), "shock");
  assert.equal(vibe.lineSfx({ emote: "shock", sfx: "ding" }), "ding");
  assert.equal(vibe.lineSfx({ emote: "shock", sfx: "none" }), null);
  assert.equal(vibe.lineSfx({ emote: "dots" }), null);
  assert.equal(vibe.lineSfx(null), null);
  // every default sound exists in the shared SFX set
  for (const e of vibe.EMOTE_NAMES) {
    const name = vibe.lineSfx({ emote: e });
    if (name) assert.ok(themes.sfxUrl(name), `${e} -> ${name}`);
  }
});

test("BGM moods resolve to real themes; unknown names fall back to default", () => {
  assert.equal(themes.resolveBgmTheme("happy"), "depato_sunny");
  assert.equal(themes.resolveBgmTheme("tender"), "depato_rain");
  assert.equal(themes.resolveBgmTheme("none"), "none");
  assert.equal(themes.resolveBgmTheme("polka"), "default");
  assert.equal(themes.resolveBgmTheme(undefined), "default");
  for (const th of Object.values(themes.BGM_THEMES)) assert.equal(th.melody.length, th.bass.length);
});


test("route C motion: paths, movers with delay/ease/loop, visibility, rumble beat, rounded windows", () => {
  assert.equal(motion.wrap(-1, 10), 9);
  assert.deepEqual(motion.pathPoint([[0, 0], [10, 0], [10, 10]], 0.75), [10, 5]);
  assert.deepEqual(motion.pathPoint([[0, 0], [10, 0]], 2), [10, 0]);
  const taxi = { path: [[196, 95], [140, 95]], durationSec: 14, delaySec: 2 };
  assert.deepEqual(motion.moverAt(taxi, 0), [196, 95], "waits at the start before its delay");
  assert.deepEqual(motion.moverAt(taxi, 9), [168, 95]);
  assert.deepEqual(motion.moverAt(taxi, 99), [140, 95], "stays at the end");
  const takeoff = { path: [[0, 0], [100, 0]], durationSec: 10, ease: "in" };
  assert.ok(motion.moverAt(takeoff, 5)[0] < 50, "accelerates");
  assert.deepEqual(motion.moverAt({ path: [[0, 0], [100, 0]], durationSec: 10, loop: true }, 12), [20, 0]);
  const plane = { durationSec: 10, delaySec: 5, show: "moving" };
  assert.equal(motion.moverVisible(plane, 4), false);
  assert.equal(motion.moverVisible(plane, 9), true);
  assert.equal(motion.moverVisible(plane, 16), false);
  assert.equal(motion.moverVisible({ durationSec: 10 }, 99), true);
  assert.equal(motion.rumbleOffset(0.02), 1);
  assert.equal(motion.rumbleOffset(0.1), 0);
  assert.equal(motion.rumbleOffset(0.9 + 0.18), 1);
  // rounded window: corners keep the frame, the middle shows the scenery
  assert.equal(motion.inRoundedRect(16, 56, [16, 56, 60, 56], 3), false);
  assert.equal(motion.inRoundedRect(19, 56, [16, 56, 60, 56], 3), true);
  assert.equal(motion.inRoundedRect(40, 80, [16, 56, 60, 56], 3), true);
  assert.equal(motion.inRoundedRect(76, 80, [16, 56, 60, 56], 3), false);
  assert.deepEqual([...motion.MOTION_TYPES].sort(), ["glow", "mover", "rumble", "scroll", "shimmer", "steam", "sweep"]);
});


test("route B people: walk at a speed, face the way they go, then sit / exit; fades and hops", () => {
  const def = { kind: "dog", x: 100, y: 150, face: "left", pose: "sit" };
  const moves = [{ move: { who: "h", walkTo: 160, speed: 20, then: "sit" }, time: 2 }];
  assert.deepEqual(people.personAt(def, moves, 1), { x: 100, y: 150, face: "left", pose: "sit", visible: true, alpha: 1, lift: 0 });
  const mid = people.personAt(def, moves, 3.5);
  assert.equal(mid.x, 130);
  assert.equal(mid.pose, "walk");
  assert.equal(mid.face, "right");
  assert.equal(people.personAt(def, moves, 9).pose, "sit");
  assert.equal(people.personAt(def, [{ move: { who: "h", walkTo: 200, speed: 50 }, time: 0 }], 1).pose, "run");
  const exit = [{ move: { who: "s", walkTo: 268, speed: 26, then: "exit" }, time: 0 }];
  assert.equal(people.personAt({ kind: "sensei", x: 200 }, exit, 1).visible, true);
  assert.equal(people.personAt({ kind: "sensei", x: 200 }, exit, 9).visible, false);
  const gone = people.personAt(def, [{ move: { who: "h", fadeOut: 2 }, time: 1 }], 2);
  assert.equal(gone.alpha, 0.5);
  assert.equal(people.personAt(def, [{ move: { who: "h", fadeOut: 2 }, time: 1 }], 5).visible, false);
  assert.ok(people.personAt(def, [{ move: { who: "h", hop: 1 }, time: 0 }], 0.15).lift < 0);
  assert.equal(people.personAt({ ...def, hidden: true }, [], 0).visible, false);
  // 2D walk (walkToY), shiver, and polite bow
  const diag = people.personAt(def, [{ move: { who: "h", walkTo: 130, walkToY: 190, speed: 50 }, time: 0 }], 0.5);
  assert.equal(diag.x, 115);
  assert.equal(diag.y, 170);
  assert.equal(diag.pose, "run");
  assert.notEqual(people.personAt(def, [{ move: { who: "h", shiver: 1 }, time: 0 }], 0.05).x, 100);
  assert.equal(people.personAt(def, [{ move: { who: "h", bow: 1 }, time: 0 }], 0.5).lift, 2);
});

test("actorActionOffset moves bust actors by whole pixels only", () => {
  for (const act of vibe.ACTION_NAMES) {
    for (let i = 0; i < 40; i++) {
      const o = vibe.actorActionOffset(act, i * 0.05, "left");
      assert.ok(Number.isInteger(o.dx) && Number.isInteger(o.dy) && Number.isInteger(o.headDy), act);
    }
  }
  assert.ok(vibe.actorActionOffset("hop", 0.18, "left").dy < 0);
  assert.equal(vibe.actorActionOffset("hop", 1.0, "left").dy, 0);
  assert.ok(vibe.actorActionOffset("bow", 0.5, "right").dy > 0);
  assert.ok(vibe.actorActionOffset("bow", 0.5, "right").headDy > 0);
  assert.ok(vibe.actorActionOffset("lean", 0.4, "left").dx > 0);
  assert.ok(vibe.actorActionOffset("lean", 0.4, "right").dx < 0);
  assert.deepEqual(vibe.actorActionOffset("unknown", 0.2, "left"), { dx: 0, dy: 0, headDy: 0 });
});

test("cues fire from line / done-line / interaction anchors; set state remembers when and what changed", () => {
  const list = [
    { at: 1, set: { sky: "morning" } },
    { line: 1, delay: 0.5, set: { train: "go" } },
    { done: true, set: { sky: "night", clock: 6 } },
    { doneLine: 0, people: [{ who: "hachi", walkTo: 50 }] },
  ];
  const anchors = { lines: [0, 4], doneLines: [] };
  assert.equal(cues.cueTime(list[1], anchors), 4.5);
  assert.equal(cues.cueTime(list[2], anchors), null, "not completed yet");
  const st = cues.setStateAt({ sky: "dusk", clock: 5 }, list, anchors, 5);
  assert.equal(st.values.sky, "morning");
  assert.equal(st.prev.sky, "dusk");
  assert.equal(st.since.train, 4.5);
  assert.equal(st.values.clock, 5);
  const later = cues.setStateAt({ sky: "dusk", clock: 5 }, list, { ...anchors, done: 6 }, 7);
  assert.deepEqual([later.values.sky, later.prev.sky, later.since.sky, later.values.clock], ["night", "morning", 6, 6]);
  assert.deepEqual(cues.cueMoves(list, anchors), []);
  assert.deepEqual(cues.cueMoves(list, { ...anchors, doneLines: [8] }), [{ move: { who: "hachi", walkTo: 50 }, time: 8 }]);
});

test("shibuya train: arrives, waits at the platform, leaves; nothing before its cue", () => {
  assert.equal(shibuya.trainX("go", undefined, 3), null);
  assert.equal(shibuya.trainX("go", 10, 9), null);
  assert.equal(shibuya.trainX("go", 10, 13), 120, "stopped at the platform");
  assert.ok(shibuya.trainX("go", 10, 15.5) > 120, "leaving");
  assert.equal(shibuya.trainX("go", 10, 17), null, "gone");
  assert.equal(typeof shibuya.trainX("loop", undefined, 3), "number");
  assert.deepEqual(Object.keys(shibuya.SHIBUYA_SETS).sort(), ["shibuya", "shibuya_today"]);
  for (const k of ["shibuya", "konbini_counter", "konbini_outro"]) assert.ok(sets.PROC_SETS[k], k);
});

test("StackChan mascot: full-body frames, talking mouth, moods from emotes, wardrobe", () => {
  const stand = mascot.miniRows("stand", 0);
  assert.equal(stand.length, mascot.MINI_H);
  assert.ok(stand.every((r) => r.length === mascot.MINI_W));
  assert.notDeepEqual(mascot.miniRows("walk", 0), mascot.miniRows("walk", 1));
  assert.equal(mascot.miniRows("sit", 0).length, 14);
  const mouths = new Set(Array.from({ length: 12 }, (_, i) => mascot.talkMouth(i / 9)));
  assert.deepEqual([...mouths].sort(), ["closed", "half", "open"]);
  assert.equal(mascot.moodForEmote("heart"), "heart");
  assert.equal(mascot.moodForEmote("question"), "think");
  assert.equal(mascot.moodForEmote(undefined), undefined);
  assert.ok(mascot.WEAR_IDS.includes("nonla") && mascot.SHELL_IDS.includes("sakura"));
});

test("interaction.drive picks key-pose frames: loop while held, step with progress, one-shot per step", () => {
  const f = [3, 4];
  const base = { active: false, progress: 0, t: 0, stepAge: null };
  // holding: base frame at rest, the loop while the player holds
  assert.equal(ui.driveFrame(f, "holding", base), 3);
  assert.deepEqual([0, 0.25, 0.5].map((t) => ui.driveFrame(f, "holding", { ...base, active: true, t, fps: 4 })), [3, 4, 3]);
  // progress: a lever only flips when complete; 3 frames split the range
  assert.equal(ui.driveFrame(f, "progress", { ...base, progress: 0.99 }), 3);
  assert.equal(ui.driveFrame(f, "progress", { ...base, progress: 1 }), 4);
  assert.equal(ui.driveFrame([0, 1, 2], "progress", { ...base, progress: 0.5 }), 1);
  // step: the other frames once after each step, then back to the base
  assert.equal(ui.driveFrame(f, "step", { ...base, stepAge: 0.1 }), 4);
  assert.equal(ui.driveFrame(f, "step", { ...base, stepAge: 0.7 }), 3);
  assert.equal(ui.driveFrame([7], "step", { ...base, stepAge: 0.1 }), 7);
});

test("key-pose sheets: meta poses are validated and give each pose its frames", () => {
  const meta = sprite.normalizeSpriteMeta({
    frameWidth: 10, frameHeight: 10, frameCount: 5,
    clips: { idle: [0], weave: [0], weave_loop: [0, 1], bow: [4] },
    poses: { weave: [0, 1], place_hat: [2, 3], bow: [4] },
  });
  assert.deepEqual(sprite.poseFrames(meta, "place_hat"), [2, 3]);
  assert.deepEqual(sprite.poseFrames({ ...meta, poses: undefined }, "weave"), [0, 1]);
  assert.throws(() => sprite.normalizeSpriteMeta({ frameWidth: 10, frameHeight: 10, frameCount: 2, poses: { x: [5] } }));
  // any clip name is a pose for a sprite person (cue `pose: "bow"`)
  const st = people.personAt({ kind: "sprite:o", x: 10 }, [{ move: { who: "o", pose: "bow" }, time: 1 }], 2);
  assert.equal(st.pose, "bow");
});

test("cue `spot` anchors on a found tap spot; cue `actors` cuts the shot; people fade in", () => {
  const cueList = [
    { spot: "shoji", people: [{ who: "oba", pose: "peek_b" }] },
    { choice: "tea", actors: [], people: [{ who: "oba", show: true, fadeIn: 0.5 }] },
  ];
  const a = { lines: [], doneLines: [], choices: {}, spots: {} };
  assert.equal(cues.cueTime(cueList[0], a), null); // not found yet
  assert.deepEqual(cues.actorsAt(["left", "right"], cueList, a, 9), ["left", "right"]);
  a.spots.shoji = 3.2;
  a.choices.tea = 5;
  assert.equal(cues.cueTime(cueList[0], a), 3.2);
  assert.deepEqual(cues.actorsAt(["left", "right"], cueList, a, 4.9), ["left", "right"]);
  assert.deepEqual(cues.actorsAt(["left", "right"], cueList, a, 5), []); // the cut
  const moves = cues.cueMoves(cueList, a);
  const def = { kind: "sprite:oba", x: 10, hidden: true };
  assert.equal(people.personAt(def, moves, 4).visible, false);
  assert.equal(people.personAt(def, moves, 4).pose, "peek_b");
  assert.equal(people.personAt(def, moves, 5.25).alpha, 0.5);
  assert.equal(people.personAt(def, moves, 6).alpha, 1);
});

test("tags near the frame edge hang inwards instead of being cut off", () => {
  assert.equal(ui.tagEdge(20), "edge-l");
  assert.equal(ui.tagEdge(160), "");
  assert.equal(ui.tagEdge(302), "edge-r");
});

// --- authoring guardrail: interactions never cover a face (AGENTS.md rule 5) --------------------

test("no hold / drag / tap target of any cinema story covers an on-stage character's face", () => {
  const publicDir = path.join(webRoot, "public");
  const pngSize = (url) => {
    const b = fs.readFileSync(path.join(publicDir, url.replace(/^\//, "")));
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  };
  const problems = [];
  let checked = 0;
  for (const id of fs.readdirSync(path.join(publicDir, "stories"))) {
    const file = path.join(publicDir, "stories", id, "story.json");
    if (!fs.existsSync(file)) continue;
    const story = JSON.parse(fs.readFileSync(file, "utf8"));
    if (story.engine !== "cinema") continue;
    const cast = cinema.resolveCast(story);
    for (const scene of story.scenes ?? []) {
      const inter = scene.interaction;
      if (!inter) continue;
      const faces = [];
      // busts on stage while the player acts (interaction.actors overrides the scene's; else any cue cut)
      const cutSides = (scene.cues ?? []).flatMap((c) => c.actors ?? []);
      for (const side of inter.actors ?? [...new Set([...cinema.visibleActors(scene), ...cutSides])]) {
        const actor = cast[side];
        const key = actor && (actor.sprite ?? actor.rig ?? actor.portrait);
        const metaUrl = key && story.assets?.sprites?.[key];
        if (!metaUrl || actor.mascot) continue;
        const meta = JSON.parse(fs.readFileSync(path.join(publicDir, metaUrl.replace(/^\//, "")), "utf8"));
        const face = ui.bustFaceBox(cinema.actorX(side, actor), meta, actor.scale ?? 1, actor.flipX);
        // inactive actors step 4 px outward, so keep 4 px of slack on both sides
        if (face) faces.push({ side, box: [face[0] - 4, face[1], face[2] + 4, face[3]] });
      }
      const targets = [];
      const itemSize = (k) => (k && story.assets?.items?.[k] ? pngSize(story.assets.items[k]) : { w: 16, h: 16 });
      if (inter.hold) ui.holdBoxes(inter.hold, inter.hold.item ? itemSize(inter.hold.item) : undefined).forEach((b) => targets.push(["hold", b]));
      for (const it of inter.items ?? []) ui.dragBoxes(it, itemSize(it.item)).forEach((b) => targets.push([`drag ${it.id}`, b]));
      for (const sp of inter.spots ?? []) targets.push([`tap ${sp.id}`, ui.tapBox(sp)]);
      for (const f of faces) {
        for (const [what, b] of targets) {
          checked += 1;
          if (ui.boxesOverlap(f.box, b)) problems.push(`${id}/${scene.id}: ${what} [${b}] covers the ${f.side} face [${f.box}]`);
        }
      }
    }
  }
  assert.ok(checked > 0, "no interaction was checked");
  assert.deepEqual(problems, []);
});

console.log(`\nALL ${passed} ENGINE TESTS PASSED!`);
