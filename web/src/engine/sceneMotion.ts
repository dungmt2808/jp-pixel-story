/**
 * Route C — painted scene + motion layers. A scene lists `motion` effects that bring a still
 * pixel background to life, drawn on the 320x200 frame with whole pixels only:
 *
 *  scroll   scenery sliding inside window rects (one continuous strip seen through every rect)
 *  sweep    light / shadow bands passing over a region (train passing poles)
 *  glow     a light source breathing (lamps, lanterns, a TV, the sun) with dithered falloff
 *  shimmer  bright pixels of a reflection sparkling in a travelling wave
 *  steam    puffs rising from points (soup, tea, a bath)
 *  mover    a sprite (assets.items) travelling along a path; `front` rects of the background are
 *           redrawn over it so it passes BEHIND window mullions, bridges...
 *  rumble   the whole world bumps 1 px on a "ta-tan ta-tan" rhythm (trains, buses)
 *
 * Everything is a pure function of time (no hidden state), so exported videos are deterministic.
 */
import type { Vec } from "./cinemaUi";

export const VW = 320;
export const VH = 200;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

export type Rect = [number, number, number, number];

export interface ScrollFx {
  type: "scroll";
  rects: Rect[];
  /** px per second; positive = scenery moves left (the vehicle drives right). */
  speed: number;
  /** Rounded window corners in px (pixels outside the rounding keep the frame). */
  radius?: number;
}
export interface SweepFx {
  type: "sweep";
  rect: Rect;
  speed: number;
  /** Distance between bands (px) and band width (px). */
  spacing: number;
  width: number;
  /** Horizontal shift per pixel of height (diagonal sun), default 0.6. */
  slant?: number;
  color?: string;
  alpha?: number;
}
export interface GlowFx {
  type: "glow";
  at: Vec;
  r: number;
  color?: string;
  /** Breathing period in seconds and strength range (0..1). */
  period?: number;
  min?: number;
  max?: number;
  /** "flicker" adds a fast irregular wobble (candles, old TVs). */
  flicker?: boolean;
}
export interface ShimmerFx {
  type: "shimmer";
  rect: Rect;
  /** Only pixels brighter than this (0..255) sparkle. */
  minLuma?: number;
  speed?: number;
}
export interface SteamFx {
  type: "steam";
  at: Vec[];
  /** Puffs per second per source and rise height (px). */
  rate?: number;
  height?: number;
  color?: string;
}
export interface MoverFx {
  type: "mover";
  item: string;
  /** Top-left positions of the sprite along the way. */
  path: Vec[];
  durationSec: number;
  delaySec?: number;
  loop?: boolean;
  /** "linear" (taxi, pushback) or "in" (accelerate: take-off). */
  ease?: "linear" | "in" | "out";
  flipX?: boolean;
  /** 1 or 0.5 (half-size, far away). */
  scale?: number;
  /** Background rects drawn again over the sprite (it passes behind them). */
  front?: Rect[];
  /** "always" (default: waits at the start, stays at the end) or "moving" (only while travelling). */
  show?: "always" | "moving";
  /** Start counting `delaySec` from a cue anchor (e.g. { "done": true }) instead of the scene start. */
  startOn?: import("./cues").SceneCue;
}
export interface RumbleFx {
  type: "rumble";
  /** Seconds between "ta-tan" bumps. */
  period?: number;
}

export type MotionFx = ScrollFx | SweepFx | GlowFx | ShimmerFx | SteamFx | MoverFx | RumbleFx;

export const MOTION_TYPES = ["scroll", "sweep", "glow", "shimmer", "steam", "mover", "rumble"] as const;

// ------------------------------------------------------------------ pure helpers (unit-tested)

/** Positive modulo. */
export function wrap(v: number, period: number): number {
  return ((v % period) + period) % period;
}

/** Point at fraction u (0..1) of a polyline, by length. */
export function pathPoint(path: Vec[], u: number): Vec {
  if (path.length === 0) return [0, 0];
  if (path.length === 1 || u <= 0) return [path[0][0], path[0][1]];
  const seg: number[] = [];
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const d = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
    seg.push(d);
    total += d;
  }
  if (u >= 1 || total === 0) return [path[path.length - 1][0], path[path.length - 1][1]];
  let left = u * total;
  for (let i = 0; i < seg.length; i++) {
    if (left <= seg[i]) {
      const k = seg[i] === 0 ? 0 : left / seg[i];
      return [path[i][0] + (path[i + 1][0] - path[i][0]) * k, path[i][1] + (path[i + 1][1] - path[i][1]) * k];
    }
    left -= seg[i];
  }
  return [path[path.length - 1][0], path[path.length - 1][1]];
}

/** Where a mover is `t` seconds into the scene; before its delay it waits at the start. */
/** Is the mover drawn at time t? ("moving" movers only appear while they travel). */
export function moverVisible(fx: Pick<MoverFx, "durationSec" | "delaySec" | "loop" | "show">, t: number): boolean {
  if (fx.show !== "moving") return true;
  const k = (t - (fx.delaySec ?? 0)) / Math.max(0.01, fx.durationSec);
  return fx.loop ? k >= 0 : k >= 0 && k <= 1;
}

export function moverAt(fx: Pick<MoverFx, "path" | "durationSec" | "delaySec" | "loop" | "ease">, t: number): Vec {
  const dur = Math.max(0.01, fx.durationSec);
  let k = (t - (fx.delaySec ?? 0)) / dur;
  if (fx.loop) k = k < 0 ? 0 : wrap(k, 1);
  k = Math.max(0, Math.min(1, k));
  const u = fx.ease === "in" ? k * k : fx.ease === "out" ? 1 - (1 - k) * (1 - k) : k;
  const [x, y] = pathPoint(fx.path, u);
  return [Math.round(x), Math.round(y)];
}

/** 1 px bump pattern: two short bumps ("ta-tan") at the start of every period. */
export function rumbleOffset(t: number, period = 0.9): number {
  const p = wrap(t, period);
  return p < 0.06 || (p > 0.16 && p < 0.22) ? 1 : 0;
}

/** Inside a rounded rect (pixel centre test), radius in px. */
export function inRoundedRect(px: number, py: number, r: Rect, radius: number): boolean {
  const [x, y, w, h] = r;
  if (px < x || py < y || px >= x + w || py >= y + h) return false;
  if (radius <= 0) return true;
  const cx = px + 0.5 < x + radius ? x + radius : px + 0.5 > x + w - radius ? x + w - radius : px + 0.5;
  const cy = py + 0.5 < y + radius ? y + radius : py + 0.5 > y + h - radius ? y + h - radius : py + 0.5;
  return Math.hypot(px + 0.5 - cx, py + 0.5 - cy) <= radius;
}

// ------------------------------------------------------------------ drawing

interface ScrollCache {
  strip: HTMLCanvasElement;
  period: number;
}
const scrollCache = new WeakMap<HTMLImageElement, Map<string, ScrollCache>>();

function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

/** Build (once) a strip: every rect's own pixels side by side, then mirrored -> seamless loop. */
function scrollData(bg: HTMLImageElement, fx: ScrollFx): ScrollCache | null {
  const key = JSON.stringify(fx.rects);
  let byImg = scrollCache.get(bg);
  if (!byImg) {
    byImg = new Map();
    scrollCache.set(bg, byImg);
  }
  const hit = byImg.get(key);
  if (hit) return hit;
  const h = Math.max(...fx.rects.map((r) => r[3]));
  const len = fx.rects.reduce((s, r) => s + r[2], 0);
  if (!(len > 0 && h > 0)) return null;
  const strip = canvas(len * 2, h);
  const sc = strip.getContext("2d");
  if (!sc) return null;
  sc.imageSmoothingEnabled = false;
  let x = 0;
  for (const [rx, ry, rw, rh] of fx.rects) {
    sc.drawImage(bg, rx, ry, rw, rh, x, 0, rw, h);
    x += rw;
  }
  // mirrored copy: the loop has no hard seam
  sc.save();
  sc.translate(len * 2, 0);
  sc.scale(-1, 1);
  sc.drawImage(strip, 0, 0, len, h, 0, 0, len, h);
  sc.restore();
  const data = { strip, period: len * 2 };
  byImg.set(key, data);
  return data;
}

/**
 * Scenery straight into each window (one or two drawImage calls, no per-frame compositing), then
 * the rounded corners of the frame are copied back from the painting (radius x radius each).
 */
function drawScroll(ctx: CanvasRenderingContext2D, fx: ScrollFx, t: number, bg: HTMLImageElement | undefined): void {
  if (!bg) return;
  const d = scrollData(bg, fx);
  if (!d) return;
  const shift = Math.round(t * fx.speed);
  const rad = Math.max(0, Math.round(fx.radius ?? 0));
  for (const [rx, ry, rw, rh] of fx.rects) {
    // the strip is indexed by SCREEN x, so the scenery runs continuously from window to window
    const sx = wrap(rx + shift, d.period);
    const first = Math.min(rw, d.period - sx);
    ctx.drawImage(d.strip, sx, 0, first, rh, rx, ry, first, rh);
    if (first < rw) ctx.drawImage(d.strip, 0, 0, rw - first, rh, rx + first, ry, rw - first, rh);
    if (rad > 0) {
      for (const [cx, cy] of [[rx, ry], [rx + rw - rad, ry], [rx, ry + rh - rad], [rx + rw - rad, ry + rh - rad]]) {
        ctx.drawImage(bg, cx, cy, rad, rad, cx, cy, rad, rad);
      }
    }
  }
}

// pre-rendered band pattern (one period wide), so a frame costs one or two drawImage calls
const sweepCache = new Map<string, HTMLCanvasElement>();
function sweepPattern(fx: SweepFx): HTMLCanvasElement {
  const [, , w, h] = fx.rect;
  const slant = fx.slant ?? 0.6;
  const key = JSON.stringify([w, h, slant, fx.spacing, fx.width, fx.color ?? "#2a1a10"]);
  const hit = sweepCache.get(key);
  if (hit) return hit;
  const c = canvas(w + fx.spacing * 2, h);
  const g = c.getContext("2d");
  if (g) {
    g.fillStyle = fx.color ?? "#2a1a10";
    for (let py = 0; py < h; py++) {
      const rowShift = Math.round(py * slant);
      for (let bx = -fx.spacing * 2 - rowShift; bx < c.width; bx += fx.spacing) {
        const a = Math.max(0, Math.round(bx));
        const b = Math.min(c.width, Math.round(bx + fx.width));
        if (b > a) g.fillRect(a, py, b - a, 1);
      }
    }
  }
  sweepCache.set(key, c);
  return c;
}

function drawSweep(ctx: CanvasRenderingContext2D, fx: SweepFx, t: number): void {
  const [x, y, w, h] = fx.rect;
  const pattern = sweepPattern(fx);
  const off = Math.round(wrap(-t * fx.speed, fx.spacing));
  ctx.save();
  ctx.globalAlpha = fx.alpha ?? 0.22;
  ctx.drawImage(pattern, fx.spacing - off, 0, w, h, x, y, w, h);
  ctx.restore();
}

// dithered halo sprites cached per light and per strength step (13 steps are plenty for pixel art)
const glowCache = new Map<string, HTMLCanvasElement>();
function glowSprite(fx: GlowFx, step: number): HTMLCanvasElement {
  const [cx, cy] = fx.at;
  const r = fx.r;
  const key = JSON.stringify([cx, cy, r, fx.color ?? "#ffd9a0", step]);
  const hit = glowCache.get(key);
  if (hit) return hit;
  const x0 = Math.floor(cx - r);
  const y0 = Math.floor(cy - r);
  const c = canvas(2 * r + 2, 2 * r + 2);
  const g = c.getContext("2d");
  if (g) {
    g.fillStyle = fx.color ?? "#ffd9a0";
    const k = step / 12;
    for (let y = y0; y <= cy + r; y++) {
      for (let x = x0; x <= cx + r; x++) {
        const d = Math.hypot(x - cx, y - cy) / r;
        if (d >= 1) continue;
        // Bayer cell from SCREEN coordinates so the dots line up with every other dithered layer
        if (BAYER[(y & 3) * 4 + (x & 3)] < (1 - d) * k * 16) g.fillRect(x - x0, y - y0, 1, 1);
      }
    }
  }
  glowCache.set(key, c);
  return c;
}

/** Strength 0..1 of a glow at time t (pure, so it can be tested and cached by step). */
export function glowStrength(fx: Pick<GlowFx, "period" | "min" | "max" | "flicker">, t: number): number {
  const period = fx.period ?? 3;
  const lo = fx.min ?? 0.25;
  const hi = fx.max ?? 0.55;
  let k = lo + (hi - lo) * (0.5 + 0.5 * Math.sin((t / period) * Math.PI * 2));
  if (fx.flicker) k *= 0.85 + 0.15 * Math.sin(t * 23.1) * Math.sin(t * 7.3);
  return Math.max(0, Math.min(1, k));
}

function drawGlow(ctx: CanvasRenderingContext2D, fx: GlowFx, t: number): void {
  const step = Math.round(glowStrength(fx, t) * 12);
  if (step <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = 0.55; // half-strength dots: a soft dithered halo, not a visible dot grid
  ctx.drawImage(glowSprite(fx, step), Math.floor(fx.at[0] - fx.r), Math.floor(fx.at[1] - fx.r));
  ctx.restore();
}

interface ShimmerCache {
  idx: Int32Array; // pixel index inside the rect
  phase: Float32Array; // wave phase of that pixel
  rgba: Uint32Array; // its brightened colour (little-endian RGBA)
  layer: HTMLCanvasElement;
  data: ImageData | null;
}
const shimmerCache = new WeakMap<HTMLImageElement, Map<string, ShimmerCache>>();

/** Bright pixels of the PAINTING inside the rect, found once; each frame only lights a subset. */
function shimmerData(fx: ShimmerFx, bg: HTMLImageElement): ShimmerCache | null {
  const key = JSON.stringify([fx.rect, fx.minLuma ?? 150]);
  let byImg = shimmerCache.get(bg);
  if (!byImg) {
    byImg = new Map();
    shimmerCache.set(bg, byImg);
  }
  const hit = byImg.get(key);
  if (hit) return hit;
  const [x, y, w, h] = fx.rect;
  const probe = canvas(w, h);
  const pc = probe.getContext("2d", { willReadFrequently: true });
  if (!pc) return null;
  pc.drawImage(bg, x, y, w, h, 0, 0, w, h);
  let src: ImageData;
  try {
    src = pc.getImageData(0, 0, w, h);
  } catch {
    return null;
  }
  const minLuma = fx.minLuma ?? 150;
  const idx: number[] = [];
  const phase: number[] = [];
  const rgba: number[] = [];
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const i = (py * w + px) * 4;
      const [r, g, b] = [src.data[i], src.data[i + 1], src.data[i + 2]];
      if ((r * 299 + g * 587 + b * 114) / 1000 < minLuma) continue;
      idx.push(py * w + px);
      phase.push(py * 0.9 + px * 0.15);
      const R = Math.min(255, r + 38);
      const G = Math.min(255, g + 34);
      const B = Math.min(255, b + 22);
      rgba.push(((255 << 24) | (B << 16) | (G << 8) | R) >>> 0);
    }
  }
  const layer = canvas(w, h);
  const lc = layer.getContext("2d");
  const data = lc ? lc.createImageData(w, h) : null;
  const out = { idx: Int32Array.from(idx), phase: Float32Array.from(phase), rgba: Uint32Array.from(rgba), layer, data };
  byImg.set(key, out);
  return out;
}

const TWO_PI = Math.PI * 2;
// sin(v) > 0.72  <=>  v (mod 2*pi) lies in (asin 0.72, pi - asin 0.72): no Math.sin per pixel
const SHIMMER_LO = Math.asin(0.72);
const SHIMMER_HI = Math.PI - SHIMMER_LO;

function drawShimmer(ctx: CanvasRenderingContext2D, fx: ShimmerFx, t: number, bg: HTMLImageElement | undefined): void {
  if (!bg) return;
  const d = shimmerData(fx, bg);
  const lc = d?.layer.getContext("2d");
  if (!d || !d.data || !lc) return;
  const px32 = new Uint32Array(d.data.data.buffer);
  px32.fill(0);
  const shift = t * (fx.speed ?? 2.2) * 3;
  for (let n = 0; n < d.idx.length; n++) {
    const m = wrap(d.phase[n] - shift, TWO_PI);
    if (m > SHIMMER_LO && m < SHIMMER_HI) px32[d.idx[n]] = d.rgba[n];
  }
  lc.putImageData(d.data, 0, 0);
  ctx.drawImage(d.layer, fx.rect[0], fx.rect[1]);
}

function drawSteam(ctx: CanvasRenderingContext2D, fx: SteamFx, t: number): void {
  const rate = fx.rate ?? 1.6;
  const height = fx.height ?? 16;
  const life = 2.4;
  ctx.save();
  ctx.fillStyle = fx.color ?? "#f6eed8";
  fx.at.forEach(([sx, sy], s) => {
    const every = 1 / rate;
    const phase = (s * 0.37) % every;
    const newest = Math.floor((t - phase) / every);
    for (let n = newest; n > newest - Math.ceil(life * rate) - 1; n--) {
      const born = n * every + phase;
      const age = t - born;
      if (age < 0 || age > life) continue;
      const u = age / life;
      const px = Math.round(sx + Math.sin(age * 2.6 + n * 1.7) * (1 + u * 2));
      const py = Math.round(sy - u * height);
      // fade out with ordered dithering instead of alpha (stays pixel-crisp)
      const keep = (1 - u) * 16;
      const size = u < 0.45 ? 2 : 1;
      if (BAYER[(py & 3) * 4 + (px & 3)] < keep) {
        ctx.globalAlpha = 0.55;
        ctx.fillRect(px, py, size, size);
      }
    }
  });
  ctx.restore();
}

function drawMover(
  ctx: CanvasRenderingContext2D,
  fx: MoverFx,
  t: number,
  items: Record<string, HTMLImageElement>,
  bg: HTMLImageElement | undefined
): void {
  const im = items[`i:${fx.item}`];
  if (!im || !moverVisible(fx, t)) return;
  const [x, y] = moverAt(fx, t);
  const s = fx.scale === 0.5 ? 0.5 : 1;
  const w = Math.max(1, Math.round(im.naturalWidth * s));
  const h = Math.max(1, Math.round(im.naturalHeight * s));
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (fx.flipX) {
    ctx.translate(x * 2 + w, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(im, x, y, w, h);
  ctx.restore();
  if (bg) for (const [fx0, fy0, fw, fh] of fx.front ?? []) ctx.drawImage(bg, fx0, fy0, fw, fh, fx0, fy0, fw, fh);
}

/** Background-level motion (after the backdrop, before overlays and actors). */
export function drawSceneMotion(
  ctx: CanvasRenderingContext2D,
  fxs: MotionFx[] | undefined,
  t: number,
  imgs: Record<string, HTMLImageElement>,
  bg: HTMLImageElement | undefined
): void {
  for (const fx of fxs ?? []) {
    switch (fx.type) {
      case "scroll":
        drawScroll(ctx, fx, t, bg);
        break;
      case "sweep":
        drawSweep(ctx, fx, t);
        break;
      case "glow":
        drawGlow(ctx, fx, t);
        break;
      case "shimmer":
        drawShimmer(ctx, fx, t, bg);
        break;
      case "steam":
        drawSteam(ctx, fx, t);
        break;
      case "mover":
        drawMover(ctx, fx, t, imgs, bg);
        break;
      default:
        break;
    }
  }
}

/** Vertical 1 px world offset for this frame (rumble), 0 when the scene has none. */
export function sceneRumble(fxs: MotionFx[] | undefined, t: number): number {
  const r = (fxs ?? []).find((f): f is RumbleFx => f.type === "rumble");
  return r ? rumbleOffset(t, r.period) : 0;
}
