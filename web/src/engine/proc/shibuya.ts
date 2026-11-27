/**
 * Code-drawn sets for route B (ported from the standalone Hachikō story, widened to 320x200).
 *
 *   "backdrop": "set:shibuya",  "set": { "sky": "dusk", "lamp": 1, "lit": 1, "clock": 4.8 }
 *
 * shibuya keys: sky (morning | dusk | night | grey | winter, blends 1.5 s when a cue changes it),
 * sun, moon, stars, far (skyline colour), ground, wall, tree (colours, a season), snow, lit, lamp,
 * clock (hour; hands ease 1.2 s), train ("go": arrive, stop, leave | "loop"), weather (sakura |
 * rain | leaves | snow), crowd ({ n, seed } passers-by leaving the station when set),
 * statue ({ x }), cloth (1 covered / 0 unveiled: fades 1 s), paper ([x, y]: a newspaper flutters down).
 * shibuya_today: the modern scramble at night (statue + neon + crowd).
 */
import type { SetState } from "../cues";
import { CI, clamp, DI, easeInOut, LN, mixList, PX, R, RING, rng, SPRF, type Ctx } from "./pixelKit";
import { BRONZE } from "../people";

export const LW = 320;
export const LH = 200;
/** The station block sits at the right edge of the wider frame. */
const DX = 80;
/** The world sits 20 px lower than in the 240x180 original: horizon near the middle, less empty
 *  ground. Set-drawn things use set coordinates; people, tap spots, labels use screen ones
 *  (screen y = set y + DY): people stand on y = 150, the clock face is at (272, 78). */
export const DY = 20;

export const SKIES: Record<string, string[]> = {
  morning: ["#8fbfe0", "#a9cfe8", "#c6def0", "#e6eef0"],
  dusk: ["#3a3160", "#7a4a6a", "#d0745a", "#f0a860"],
  night: ["#0b1326", "#111c36", "#172443", "#1d2c50"],
  grey: ["#5a6478", "#6a7488", "#7a8498", "#8a94a4"],
  winter: ["#8a96a8", "#9aa6b6", "#b0bac6", "#c8d0da"],
};
export const SEASON_TREES: Record<string, string[]> = {
  spring: ["#f4b6c8", "#f9d4de", "#e89ab0"],
  summer: ["#3f7a4c", "#2f5d3a", "#4a8a58"],
  autumn: ["#d8642a", "#e8a030", "#b8402a"],
  winter: ["#e8eef2", "#c8d0d8", "#b0bac4"],
};
const COATS = ["#3b3f4a", "#4a4038", "#2f3a46", "#5a4b3b", "#3a3326", "#40363a", "#4b5560"];
const DOG_SIT = ["........DD.D..", "........DCDCD.", "........CCCCCC", "........CCECCn", ".......CCCCWWW", "..DD..CCCCWW..", ".D..DCCCCCWW..", ".D..CCCCCCW...", "..DCCCCCCCW...", "...CCCCCCCC...", "...CCCCC.CC...", "...kkkkk.kk..."];

const FAR = (() => {
  const r = rng(31);
  const out: { x: number; w: number; h: number }[] = [];
  let x = 0;
  while (x < LW) {
    const w = 6 + ((r() * 12) | 0);
    const h = 6 + ((r() * 14) | 0);
    out.push({ x, w, h });
    x += w;
  }
  return out;
})();

const num = (v: unknown, d = 0) => (typeof v === "number" ? v : v === true ? 1 : d);
const on = (v: unknown) => v === true || (typeof v === "number" && v > 0);

function skyOf(st: SetState): string[] {
  const name = (st.values.sky as string) ?? "morning";
  const cur = SKIES[name] ?? SKIES.morning;
  const since = st.since.sky;
  const prevName = st.prev.sky as string | undefined;
  if (since === undefined || !prevName || !SKIES[prevName]) return cur;
  return mixList(SKIES[prevName], cur, clamp((st.t - since) / 1.5, 0, 1));
}

function clockOf(st: SetState): number {
  const to = num(st.values.clock, 8);
  const since = st.since.clock;
  if (since === undefined) return to;
  const from = num(st.prev.clock, to);
  return from + (to - from) * easeInOut(clamp((st.t - since) / 1.2, 0, 1));
}

/** Train x along the elevated track, or null when no train is on screen. */
export function trainX(mode: unknown, since: number | undefined, t: number): number | null {
  if (mode === "loop") return ((t * 40) % 500) - 120;
  if (mode !== "go" || since === undefined || t < since) return null;
  const k = t - since;
  if (k < 2) return -90 + (130 + DX) * easeInOut(k / 2);
  if (k < 4.5) return 40 + DX;
  if (k < 6.5) return 40 + DX + 300 * Math.pow((k - 4.5) / 2, 2);
  return null;
}

function walker(c: Ctx, x: number, baseY: number, coat: string, seed: number, t: number): void {
  const bob = Math.round(Math.abs(Math.sin(t * 9 + seed * 4)));
  const y = baseY - 23 - bob;
  const hat = seed < 0.5 ? "#15171c" : "#2b2420";
  R(c, x - 2, y, 6, 2, hat);
  R(c, x - 3, y + 2, 8, 1, hat);
  R(c, x - 1, y + 3, 4, 4, "#b88a6a");
  PX(c, x, y + 5, "#7a5a44");
  R(c, x - 3, y + 7, 8, 10, coat);
  R(c, x - 3, y + 7, 1, 10, "rgba(0,0,0,.25)");
  R(c, x - 2, y + 17, 2, 6, "#1b1c22");
  R(c, x + 1, y + 17, 2, 6, "#1b1c22");
}

/** Pixel weather over a set (also used by other code-drawn sets). */
export function weather(c: Ctx, t: number, kind: unknown): void {
  if (!kind) return;
  const n = kind === "rain" ? 90 : 60;
  for (let i = 0; i < n; i++) {
    const s = (i * 97) % LW;
    const u = (i * 61) % LH;
    if (kind === "rain") {
      const y = (u + t * 160) % LH;
      const x = (((s - t * 30) % LW) + LW) % LW;
      LN(c, x, y, x - 1, y + 3, "#b4c8e6");
    } else if (kind === "snow") {
      const y = (u + t * 14) % LH;
      const x = (((s + Math.sin(t + i) * 4) % LW) + LW) % LW;
      PX(c, x, y, "#f6f6f6");
    } else {
      const y = (u + t * 20) % LH;
      const x = (((s + t * 12 + Math.sin(t * 2 + i) * 5) % LW) + LW) % LW;
      PX(c, x, y, kind === "sakura" ? (i % 2 ? "#f4b6c8" : "#f9d4de") : i % 2 ? "#d8642a" : "#e8a030");
    }
  }
}

function statue(c: Ctx, x: number, cloth: number): void {
  R(c, x, 116, 30, 14, "#8a8a90");
  R(c, x - 2, 114, 34, 3, "#a0a0a8");
  SPRF(c, DOG_SIT, x + 8, 115 - DOG_SIT.length, BRONZE, false);
  if (cloth > 0) {
    c.save();
    c.globalAlpha = cloth;
    const drop = Math.round((1 - cloth) * 30);
    R(c, x + 2, 100 + drop, 26, 16, "#f2ede0");
    DI(c, x + 2, 100 + drop, 26, 16, "#d8d0c0", 1);
    R(c, x + 2, 115 + drop, 26, 1, "#c0b8a8");
    R(c, x + 13, 98 + drop, 4, 3, "#c0392b");
    c.restore();
  }
}

export function drawShibuya(c: Ctx, st: SetState): void {
  const v = st.values;
  const t = st.t;
  const sky = skyOf(st);
  // taller sky bands fill the extra 20 px, then the world is drawn shifted down by DY
  for (let i = 0; i < 4; i++) R(c, 0, i * 21, LW, 21, sky[i]);
  for (let i = 1; i < 4; i++) DI(c, 0, i * 21, LW, 2, sky[i - 1]);
  c.save();
  c.translate(0, DY);
  if (on(v.stars)) for (let i = 0; i < 52; i++) {
    const x = (i * 53) % LW;
    const y = (i * 29) % 44;
    if (Math.sin(t * 2 + i) > -0.2) PX(c, x, y, "#e8e4d0");
  }
  if (on(v.moon)) {
    CI(c, 40, 16, 5, "#efe3bf");
    CI(c, 43, 14, 4, sky[0]);
  }
  if (on(v.sun)) CI(c, 36, 18, 6, "#fff0b0");
  for (const b of FAR) R(c, b.x, 62 - b.h, b.w, b.h, (v.far as string) || "#5a6478");
  const tx = trainX(v.train, st.since.train, t);
  if (tx !== null) {
    const x = Math.round(tx);
    R(c, x, 46, 86, 16, "#4b6b4a");
    R(c, x, 44, 86, 3, "#2f3a32");
    R(c, x + 2, 58, 82, 2, "#3a5a3a");
    for (let i = 0; i < 6; i++) R(c, x + 5 + i * 13, 49, 8, 6, on(v.lit) ? "#ffd27a" : "#b5cad0");
    R(c, x + 84, 46, 2, 16, "#2f3a32");
  }
  R(c, 0, 62, LW, 6, "#3a2e26");
  for (let x = 0; x < LW; x += 7) R(c, x, 58, 2, 10, "#4a3a2e");
  R(c, 0, 58, LW, 1, "#5a4a3a");
  R(c, 0, 68, LW, LH - 68, (v.ground as string) || "#8d7d68");
  for (let y = 74; y < LH; y += 7) R(c, 0, y, LW, 1, "rgba(0,0,0,.07)");
  if (on(v.snow)) DI(c, 0, 68, LW, LH - 68, "rgba(255,255,255,.55)");
  const tree = v.tree as string[] | string | undefined;
  const leaves = typeof tree === "string" ? SEASON_TREES[tree] : tree;
  if (leaves?.length) {
    const tX = 24;
    R(c, tX - 2, 64, 4, 66, "#4a3426");
    for (let i = 0; i < 26; i++) {
      const ang = i * 2.4;
      const rr = 3 + ((i * 7) % 15);
      CI(c, tX + Math.cos(ang) * rr * 1.3, 52 + Math.sin(ang) * rr * 0.75, 4, leaves[i % leaves.length]);
    }
  }
  // station block (shifted to the right edge)
  R(c, 146 + DX, 40, 94, 90, (v.wall as string) || "#d8c8a2");
  for (let j = 0; j < 12; j++) R(c, 150 + DX - j, 28 + j, 96 + j * 2, 1, j % 3 ? "#3a4250" : "#2e3542");
  if (on(v.snow)) R(c, 138 + DX, 28, 102, 3, "#f2f4f6");
  for (const bx of [146, 170, 214, 236]) R(c, bx + DX, 40, 3, 90, "#6b4a2e");
  R(c, 146 + DX, 76, 94, 2, "#6b4a2e");
  R(c, 146 + DX, 128, 94, 2, "#5a3d26");
  for (const wx of [152, 220]) {
    R(c, wx + DX, 50, 14, 20, "#5a3d26");
    R(c, wx + DX + 1, 51, 12, 18, on(v.lit) ? "#e6b24a" : "#2a3040");
    R(c, wx + DX + 6, 51, 1, 18, "#5a3d26");
  }
  R(c, 176 + DX, 92, 32, 38, "#1d1a18");
  if (on(v.lit)) R(c, 178 + DX, 94, 28, 36, "#4a3a24");
  R(c, 172 + DX, 80, 40, 10, "#2a1c12");
  // the clock: hour hand + red minute hand
  const cx = 192 + DX;
  CI(c, cx, 58, 7, "#efe6d4");
  RING(c, cx, 58, 7, "#2a1c12");
  const hr = clockOf(st);
  const ah = ((hr % 12) / 12) * Math.PI * 2 - Math.PI / 2;
  const am = (hr % 1) * Math.PI * 2 - Math.PI / 2;
  LN(c, cx, 58, cx + Math.cos(ah) * 3.5, 58 + Math.sin(ah) * 3.5, "#2a1c12");
  LN(c, cx, 58, cx + Math.cos(am) * 5.5, 58 + Math.sin(am) * 5.5, "#8e1f18");
  // street lamp
  const lx = 118 + DX;
  R(c, lx, 72, 2, 58, "#2a2a30");
  R(c, lx - 4, 68, 10, 5, "#2a2a30");
  if (on(v.lamp)) {
    R(c, lx - 2, 72, 6, 2, "#ffe08a");
    DI(c, lx - 12, 62, 28, 34, "rgba(255,220,140,.16)");
  }
  // statue, cloth fades off when a cue sets cloth: 0
  const sv = v.statue as { x?: number } | undefined;
  if (sv) {
    let cloth = num(v.cloth, 0);
    if (st.since.cloth !== undefined && cloth === 0) cloth = 1 - clamp((t - st.since.cloth) / 1, 0, 1);
    statue(c, sv.x ?? 150, cloth);
  }
  c.restore();
  // a newspaper that flutters down to `paper: [x, y]` (screen coordinates) when a cue sets it
  const paper = v.paper as number[] | undefined;
  if (paper && paper.length === 2) {
    const k = st.since.paper !== undefined ? clamp((t - st.since.paper) / 1.6, 0, 1) : 1;
    const px = Math.round(140 + (paper[0] - 140) * k);
    const py = Math.round(40 + (paper[1] - 40) * k + Math.sin(k * 9) * 4 * (1 - k));
    R(c, px, py, 12, 8, "#efe6d4");
    R(c, px + 1, py + 2, 10, 1, "#8a8070");
    R(c, px + 1, py + 4, 7, 1, "#8a8070");
    if (k >= 1 && Math.sin(t * 6) > 0) RING(c, px + 6, py + 4, 9, "#f2cf6b");
  }
  // passers-by leaving the station door when a cue sets `crowd`
  const crowd = v.crowd as { n?: number; seed?: number } | undefined;
  if (crowd && st.since.crowd !== undefined) {
    const r = rng(crowd.seed ?? 3);
    for (let i = 0; i < (crowd.n ?? 3); i++) {
      const t0 = st.since.crowd + i * 0.6;
      const spd = 16 + r() * 8;
      const seed = r();
      if (t < t0) continue;
      const x = 192 + DX - (t - t0) * spd;
      if (x < -12) continue;
      walker(c, Math.round(x), 130 + DY, COATS[((crowd.seed ?? 3) + i) % COATS.length], seed, t - t0);
    }
  }
  weather(c, t, v.weather);
}

export function drawShibuyaToday(c: Ctx, st: SetState): void {
  const t = st.t;
  const sk = ["#140f2a", "#1a1434", "#22183e", "#2a1c46"];
  for (let i = 0; i < 4; i++) R(c, 0, i * 19, LW, 19, sk[i]);
  R(c, 0, 76, LW, 70, "#2a1c46");
  c.save();
  c.translate(0, DY);
  const r = rng(77);
  let x = 0;
  while (x < LW) {
    const w = 14 + ((r() * 22) | 0);
    const h = 50 + ((r() * 64) | 0);
    R(c, x, 122 - h, w, h, "#1b1a2c");
    for (let wy = 126 - h; wy < 118; wy += 5)
      for (let wx = x + 2; wx < x + w - 2; wx += 4) if (r() < 0.45) PX(c, wx, wy, r() < 0.5 ? "#e6c86a" : "#6a8ac8");
    if (r() < 0.45) {
      const cols = ["#ff4a7a", "#3ae0ff", "#ffd03a", "#8aff6a"];
      const col = cols[(r() * 4) | 0];
      R(c, x + 2, 126 - h, w - 4, 9, Math.sin(t * 3 + x) > -0.6 ? col : "#3a2a4a");
    }
    x += w + 1;
  }
  R(c, 0, 122, LW, LH - 122, "#34323e");
  for (let i = 0; i < 12; i++) R(c, 8 + i * 26, 160, 16, 4, "#cfd0d8");
  R(c, 0, 122, LW, 1, "#4a4858");
  const sx = num((st.values.statue as { x?: number } | undefined)?.x, 138);
  R(c, sx, 116, 30, 16, "#8a8a90");
  R(c, sx - 2, 114, 34, 3, "#a0a0a8");
  SPRF(c, DOG_SIT, sx + 6, 115 - DOG_SIT.length, BRONZE, false);
  const cr = rng(5);
  for (let i = 0; i < 18; i++) {
    const bx = 6 + i * 17 + ((cr() * 6) | 0);
    if (bx > sx - 8 && bx < sx + 36) continue;
    const mv = i % 3 === 0 ? Math.sin(t * 0.8 + i) * 6 : 0;
    walker(c, Math.round(bx + mv), 133 + (i % 2) * 4, ["#5a4a6a", "#2f3a46", "#7a3a3a", "#3a5a6a", "#6a6a4a"][i % 5], cr(), i % 3 === 0 ? t : 0);
  }
  c.restore();
}

export const PROC_SETS: Record<string, (c: Ctx, st: SetState) => void> = {
  shibuya: drawShibuya,
  shibuya_today: drawShibuyaToday,
};
