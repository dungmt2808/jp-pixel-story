/**
 * Tiny pixel drawing kit for code-drawn worlds (route B). Every primitive snaps to whole pixels
 * of the 320x200 frame, so procedural sets look like hand-placed pixel art.
 */

export type Ctx = CanvasRenderingContext2D;

export function R(c: Ctx, x: number, y: number, w: number, h: number, col: string): void {
  c.fillStyle = col;
  c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

export function PX(c: Ctx, x: number, y: number, col: string): void {
  c.fillStyle = col;
  c.fillRect(Math.round(x), Math.round(y), 1, 1);
}

/** 50% checker dither (classic pixel-art half tone). */
export function DI(c: Ctx, x: number, y: number, w: number, h: number, col: string, ph = 0): void {
  c.fillStyle = col;
  x = Math.round(x);
  y = Math.round(y);
  for (let j = 0; j < h; j++) for (let i = (j + ph) & 1; i < w; i += 2) c.fillRect(x + i, y + j, 1, 1);
}

/** Bresenham line. */
export function LN(c: Ctx, x0: number, y0: number, x1: number, y1: number, col: string): void {
  x0 = Math.round(x0);
  y0 = Math.round(y0);
  x1 = Math.round(x1);
  y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let e = dx + dy;
  c.fillStyle = col;
  for (let g = 0; g < 2000; g++) {
    c.fillRect(x0, y0, 1, 1);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * e;
    if (e2 >= dy) {
      e += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      e += dx;
      y0 += sy;
    }
  }
}

/** Filled pixel circle. */
export function CI(c: Ctx, cx: number, cy: number, r: number, col: string): void {
  c.fillStyle = col;
  for (let y = -r; y <= r; y++) {
    const w = Math.floor(Math.sqrt(Math.max(0, r * r - y * y + r * 0.8)));
    c.fillRect(Math.round(cx - w), Math.round(cy + y), w * 2 + 1, 1);
  }
}

export function RING(c: Ctx, cx: number, cy: number, r: number, col: string): void {
  c.fillStyle = col;
  const n = Math.max(8, Math.round(r * 7));
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    c.fillRect(Math.round(cx + Math.cos(t) * r), Math.round(cy + Math.sin(t) * r), 1, 1);
  }
}

/** Pixel map sprite: each character of `rows` is a key of `map` ('.' / missing = transparent). */
export function SPRF(c: Ctx, rows: string[], x: number, y: number, map: Record<string, string>, flip = false): void {
  x = Math.round(x);
  y = Math.round(y);
  for (let j = 0; j < rows.length; j++) {
    const r = rows[j];
    const n = r.length;
    for (let i = 0; i < n; i++) {
      const col = map[r[flip ? n - 1 - i : i]];
      if (col) {
        c.fillStyle = col;
        c.fillRect(x + i, y + j, 1, 1);
      }
    }
  }
}

/** Seeded PRNG (mulberry32) — procedural sets are identical on every run and in every video. */
export function rng(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
export const easeInOut = (k: number): number => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);

function hex(c: string): number[] {
  return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
}

/** Blend two #rrggbb colours (k = 0 -> a, 1 -> b). */
export function mixc(a: string, b: string, k: number): string {
  const A = hex(a);
  const B = hex(b);
  const u = clamp(k, 0, 1);
  return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * u).toString(16).padStart(2, "0")).join("");
}

export function mixList(a: string[], b: string[], k: number): string[] {
  return a.map((c, i) => mixc(c, b[i] ?? c, k));
}
