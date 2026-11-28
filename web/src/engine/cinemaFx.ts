/**
 * Canvas-side visuals of the cinematic player v2. Everything is drawn on the 320x200 virtual
 * frame with whole pixels and ordered dithering (no blurry gradients), in palette colours.
 */
import { arcDots, pixelLine, VH, VW, type Vec } from "./cinemaUi";

const INK = "#101322";
const OUTLINE = "#241712";
const CREAM = "#f6eed8";
const GOLD = "#ffe38c";
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

let vignetteCanvas: HTMLCanvasElement | null = null;

/** Subtle dithered vignette: only the outer corners get a sparse ordered pattern (cached once). */
export function drawDitherVignette(ctx: CanvasRenderingContext2D, maxDensity = 5): void {
  if (!vignetteCanvas) {
    vignetteCanvas = document.createElement("canvas");
    vignetteCanvas.width = VW;
    vignetteCanvas.height = VH;
    const v = vignetteCanvas.getContext("2d");
    if (!v) return;
    v.fillStyle = INK;
    for (let y = 0; y < VH; y++) {
      for (let x = 0; x < VW; x++) {
        // normalised distance from the centre; only the last 15% towards the corners is touched
        const d = Math.hypot((x - VW / 2) / (VW / 2), (y - VH / 2) / (VH / 2)) / Math.SQRT2;
        const k = Math.max(0, (d - 0.85) / 0.15);
        if (k > 0 && BAYER[(y & 3) * 4 + (x & 3)] < k * maxDensity) v.fillRect(x, y, 1, 1);
      }
    }
  }
  ctx.drawImage(vignetteCanvas, 0, 0);
}

/** Slow diagonal light shafts made of dithered pixels (underwater / forest / window light). */
export function drawLightRays(ctx: CanvasRenderingContext2D, t: number, color = CREAM): void {
  ctx.fillStyle = color;
  const shafts = [
    { x: 40, w: 22, phase: 0 },
    { x: 120, w: 16, phase: 1.7 },
    { x: 205, w: 26, phase: 3.1 },
    { x: 270, w: 14, phase: 4.4 },
  ];
  for (const s of shafts) {
    const density = 3 + Math.round((Math.sin(t * 0.6 + s.phase) + 1) * 1.5); // 3..6 of 16
    for (let y = 0; y < VH * 0.8; y += 1) {
      const fade = 1 - y / (VH * 0.8);
      const x0 = Math.round(s.x + y * 0.35);
      for (let x = x0; x < x0 + s.w; x++) {
        if (x < 0 || x >= VW) continue;
        if (BAYER[(y & 3) * 4 + (x & 3)] < density * fade) ctx.fillRect(x, y, 1, 1);
      }
    }
  }
}

/** Pulsing dithered ring + corner brackets marking a drop target / hotspot. */
export function drawTargetGlow(ctx: CanvasRenderingContext2D, at: Vec, t: number, r = 12): void {
  const pulse = (Math.sin(t * 5) + 1) / 2;
  const rr = Math.round(r + pulse * 2);
  ctx.fillStyle = GOLD;
  for (let a = 0; a < 48; a++) {
    if (a % 2 === Math.floor(t * 6) % 2) continue;
    const ang = (a / 48) * Math.PI * 2;
    ctx.fillRect(Math.round(at[0] + Math.cos(ang) * rr), Math.round(at[1] + Math.sin(ang) * rr * 0.6), 1, 1);
  }
  const b = rr + 3;
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const cx = Math.round(at[0] + sx * b);
    const cy = Math.round(at[1] + sy * b * 0.6);
    ctx.fillRect(cx - (sx > 0 ? 2 : 0), cy, 3, 1);
    ctx.fillRect(cx, cy - (sy > 0 ? 2 : 0), 1, 3);
  }
}

/** Dotted arc + arrow head from an item to its target (the drag hint). */
export function drawArcHint(ctx: CanvasRenderingContext2D, from: Vec, to: Vec, t: number): void {
  const dots = arcDots(from, to, 8, Math.max(18, Math.abs(to[0] - from[0]) * 0.3));
  const lit = Math.floor(t * 8) % (dots.length + 3);
  dots.forEach(([x, y], i) => {
    ctx.fillStyle = i === lit ? GOLD : CREAM;
    ctx.fillRect(x - 1, y - 1, 2, 2);
  });
  // arrow head pointing down at the target
  const [tx, ty] = [Math.round(to[0]), Math.round(to[1] - 16)];
  ctx.fillStyle = CREAM;
  ctx.fillRect(tx, ty - 6, 1, 7);
  ctx.fillRect(tx - 2, ty - 2, 5, 1);
  ctx.fillRect(tx - 1, ty - 1, 3, 1);
}

/** Crisp 1px leader line with a small square end (tag -> object). */
export function drawLeaderLine(ctx: CanvasRenderingContext2D, from: Vec, to: Vec): void {
  ctx.fillStyle = CREAM;
  for (const [x, y] of pixelLine(from, to)) ctx.fillRect(x, y, 1, 1);
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(Math.round(to[0]) - 1, Math.round(to[1]) - 1, 3, 3);
  ctx.fillStyle = GOLD;
  ctx.fillRect(Math.round(to[0]), Math.round(to[1]), 1, 1);
}

/** Pixel meter (hold gauge): outlined bar with stepped fill. */
export function drawMeter(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, value: number): void {
  const h = 6;
  const X = Math.round(x - w / 2);
  const Y = Math.round(y);
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(X - 1, Y - 1, w + 2, h + 2);
  ctx.fillStyle = INK;
  ctx.fillRect(X, Y, w, h);
  const fill = Math.round((w - 2) * Math.max(0, Math.min(1, value)));
  ctx.fillStyle = value >= 1 ? "#93b85a" : GOLD;
  ctx.fillRect(X + 1, Y + 1, fill, h - 2);
  ctx.fillStyle = CREAM;
  for (let i = 1; i < 4; i++) ctx.fillRect(X + Math.round((w * i) / 4), Y + h - 2, 1, 2);
}

/** Pixel arrow cursor (autoplay / exported videos), pressed state darkens the tip. */
export function drawCursor(ctx: CanvasRenderingContext2D, x: number, y: number, down: boolean): void {
  const rows = ["X", "XX", "X.X", "X..X", "X...X", "X....X", "X..XXX", "X.X", "XX", "X"];
  const X = Math.round(x);
  const Y = Math.round(y);
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      if (row[i] === "X") {
        ctx.fillStyle = OUTLINE;
        ctx.fillRect(X + i, Y + j, 1, 1);
      } else if (row[i] === ".") {
        ctx.fillStyle = down ? GOLD : CREAM;
        ctx.fillRect(X + i, Y + j, 1, 1);
      }
    }
  });
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
}

/** Deterministic burst (seeded by position) so exported videos are reproducible. */
export function spawnBurst(list: Particle[], at: Vec, colors: string[], n = 10, speed = 40): void {
  for (let i = 0; i < n; i++) {
    const ang = (Math.PI * 2 * i) / n + ((at[0] * 13 + at[1] * 7 + i * 5) % 10) * 0.05;
    const sp = speed * (0.55 + (((at[0] + i * 31) % 17) / 17) * 0.6);
    list.push({ x: at[0], y: at[1], vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 18, life: 0, max: 0.55, color: colors[i % colors.length] });
  }
}

export function stepAndDrawParticles(ctx: CanvasRenderingContext2D, list: Particle[], dt: number, gravity = 90): Particle[] {
  const alive: Particle[] = [];
  for (const p of list) {
    const q = { ...p, x: p.x + p.vx * dt, y: p.y + p.vy * dt, vy: p.vy + gravity * dt, life: p.life + dt };
    if (q.life < q.max) {
      ctx.fillStyle = q.color;
      ctx.fillRect(Math.round(q.x), Math.round(q.y), q.life < q.max * 0.6 ? 2 : 1, q.life < q.max * 0.6 ? 2 : 1);
      alive.push(q);
    }
  }
  return alive;
}

/** Falling shower/stream of pixels (pouring tea, watering plants...) from a source to a target. */
export function drawStream(ctx: CanvasRenderingContext2D, from: Vec, to: Vec, t: number, color = "#93b85a"): void {
  // 3 parallel curved streams fanning slightly like a watering rose / spout + splashes on impact
  const jets = [-4, 0, 5];
  const n = 7;
  for (let j = 0; j < jets.length; j++) {
    const spread = jets[j];
    for (let i = 0; i < n; i++) {
      const u = (i / n + t * 2.4 + j * 0.23) % 1;
      const x = from[0] + (to[0] + spread - from[0]) * u;
      // parabolic arc: pops gently out of spout then falls downward under gravity
      const y = from[1] + (to[1] - from[1]) * (u * u * 0.75 + u * 0.25) - Math.sin(u * Math.PI) * 5;
      ctx.fillStyle = i % 3 === 0 ? CREAM : color;
      ctx.fillRect(Math.round(x), Math.round(y), 2, u > 0.35 ? 3 : 2);
    }
  }
  // Sparkling splash droplets bouncing where the water lands on the soil/leaves
  for (let s = 0; s < 5; s++) {
    const phase = (t * 4.2 + s * 0.21) % 1;
    const sx = to[0] + (s - 2) * 5 + Math.round(Math.cos(s * 2.1) * phase * 4);
    const sy = to[1] - Math.round(Math.sin(phase * Math.PI) * 5);
    ctx.fillStyle = s % 2 === 0 ? CREAM : color;
    ctx.fillRect(Math.round(sx), Math.round(sy), 1, 1);
  }
}

// ---------------------------------------------------------------------------------------------
// Slide track and turn dial (interaction types "slide" / "turn")
// ---------------------------------------------------------------------------------------------

/** Filled pixel disc (midpoint rows, no anti-aliasing). */
function disc(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string): void {
  ctx.fillStyle = color;
  for (let dy = -r; dy <= r; dy++) {
    const w = Math.floor(Math.sqrt(r * r - dy * dy + r * 0.8));
    ctx.fillRect(cx - w, cy + dy, 2 * w + 1, 1);
  }
}

function thickLine(ctx: CanvasRenderingContext2D, a: Vec, b: Vec, color: string, w = 1): void {
  ctx.fillStyle = color;
  for (const [x, y] of pixelLine(a, b)) ctx.fillRect(x - Math.floor((w - 1) / 2), y - Math.floor((w - 1) / 2), w, w);
}

/** Dotted track + a round handle at u (0..1). Lit dots run ahead of the handle while it is idle. */
export function drawSlideTrack(ctx: CanvasRenderingContext2D, from: Vec, to: Vec, u: number, t: number, dragging: boolean): void {
  const n = Math.max(4, Math.round(Math.hypot(to[0] - from[0], to[1] - from[1]) / 5));
  const lit = Math.floor(t * 8) % (n + 3);
  for (let i = 1; i < n; i++) {
    const k = i / n;
    if (k < u) continue;
    const x = Math.round(from[0] + (to[0] - from[0]) * k);
    const y = Math.round(from[1] + (to[1] - from[1]) * k);
    ctx.fillStyle = !dragging && i === lit ? GOLD : CREAM;
    ctx.fillRect(x - 1, y - 1, 2, 2);
  }
  // target bracket
  const [tx, ty] = [Math.round(to[0]), Math.round(to[1])];
  ctx.fillStyle = GOLD;
  ctx.fillRect(tx - 1, ty - 5, 3, 1);
  ctx.fillRect(tx - 1, ty + 5, 3, 1);
  ctx.fillRect(tx, ty - 5, 1, 11);
  const hx = Math.round(from[0] + (to[0] - from[0]) * u);
  const hy = Math.round(from[1] + (to[1] - from[1]) * u);
  const pulse = dragging ? 0 : Math.round((Math.sin(t * 6) + 1) / 2);
  disc(ctx, hx, hy, 5 + pulse, OUTLINE);
  disc(ctx, hx, hy, 4 + pulse, dragging ? GOLD : CREAM);
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(hx - 1, hy - 2, 1, 5);
  ctx.fillRect(hx + 1, hy - 2, 1, 5);
}

/**
 * A big dial: a clock face (12 ticks, short hour hand, long red minute hand) or a knob (ticks over its
 * sweep, one pointer). `angle` is the hand / pointer angle (0 = 12 o'clock, clockwise). A gold knob
 * at the tip shows where to grab; dotted marks ahead of it show the way to turn.
 */
export function drawDial(
  ctx: CanvasRenderingContext2D,
  c: Vec,
  r: number,
  opts: { kind: "clock" | "knob"; hours?: number; angle: number; targetAngle?: number; t: number; dragging: boolean }
): void {
  const [cx, cy] = [Math.round(c[0]), Math.round(c[1])];
  disc(ctx, cx + 1, cy + 2, r + 2, "rgba(16,19,34,0.55)"); // drop shadow
  disc(ctx, cx, cy, r + 2, OUTLINE);
  disc(ctx, cx, cy, r + 1, "#c78b56"); // brass rim
  disc(ctx, cx, cy, r - 1, CREAM);
  const at = (ang: number, rr: number): Vec => [Math.round(cx + Math.sin(ang) * rr), Math.round(cy - Math.cos(ang) * rr)];
  const ticks = opts.kind === "clock" ? 12 : 8;
  for (let i = 0; i < ticks; i++) {
    const ang = (i / ticks) * Math.PI * 2;
    thickLine(ctx, at(ang, r - 2), at(ang, r - (i % 3 === 0 ? 6 : 4)), OUTLINE, 1);
  }
  // the way to go: dotted arc from the hand to the target
  if (opts.targetAngle !== undefined && !opts.dragging) {
    const span = opts.targetAngle - opts.angle;
    const steps = Math.max(2, Math.round(Math.abs(span) / 0.22));
    const lit = Math.floor(opts.t * 8) % (steps + 2);
    for (let i = 1; i <= steps; i++) {
      const [x, y] = at(opts.angle + (span * i) / steps, r + 6);
      ctx.fillStyle = i === lit ? GOLD : CREAM;
      ctx.fillRect(x - 1, y - 1, 2, 2);
    }
  }
  if (opts.kind === "clock") {
    const hourAng = (((opts.hours ?? 0) % 12) / 12) * Math.PI * 2;
    thickLine(ctx, [cx, cy], at(hourAng, Math.round(r * 0.5)), OUTLINE, 2);
    thickLine(ctx, [cx, cy], at(opts.angle, r - 5), "#b8382c", 2);
  } else {
    thickLine(ctx, [cx, cy], at(opts.angle, r - 5), OUTLINE, 2);
  }
  disc(ctx, cx, cy, 2, OUTLINE);
  // grab knob at the tip
  const [kx, ky] = at(opts.angle, r - 5);
  const pulse = opts.dragging ? 0 : Math.round((Math.sin(opts.t * 6) + 1) / 2);
  disc(ctx, kx, ky, 3 + pulse, OUTLINE);
  disc(ctx, kx, ky, 2 + pulse, GOLD);
}

/**
 * Thought bubble frame: trail dots appear one by one (age 0 / 0.1 / 0.2 s), then the panel (0.3 s).
 * Returns the inner content origin once the panel is up (the caller draws the pictures), else null.
 */
export function drawThoughtFrame(
  ctx: CanvasRenderingContext2D,
  layout: { box: [number, number, number, number]; dots: { at: Vec; r: number }[] },
  age: number,
  bg = "#fff8ea"
): Vec | null {
  layout.dots.forEach((d, i) => {
    if (age < i * 0.1) return;
    disc(ctx, d.at[0], d.at[1], d.r + 1, OUTLINE);
    disc(ctx, d.at[0], d.at[1], d.r, CREAM);
  });
  if (age < 0.3) return null;
  const [x0, y0, x1, y1] = layout.box;
  const W = x1 - x0;
  const H = y1 - y0;
  // a rect with its 4 corner pixels left out (rounded look, nothing cleared from the frame)
  const rounded = (x: number, y: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(x + 1, y, w - 2, h);
    ctx.fillRect(x, y + 1, w, h - 2);
  };
  rounded(x0 + 2, y0 + 2, W, H, "rgba(16,19,34,0.55)");
  rounded(x0, y0, W, H, OUTLINE);
  ctx.fillStyle = CREAM;
  ctx.fillRect(x0 + 1, y0 + 1, W - 2, H - 2);
  ctx.fillStyle = bg;
  ctx.fillRect(x0 + 2, y0 + 2, W - 4, H - 4);
  return [x0 + 2, y0 + 2];
}
