/**
 * Pure helpers of the cinematic player v2 (no DOM -> unit-tested in Node):
 * virtual-coordinate mapping, crisp pixel lines, dotted drag-arc hints, interaction state
 * reducers (drag / tap / hold), caption hint text and the dither dissolve between two frames.
 */

export const VW = 320;
export const VH = 200;

export type Vec = [number, number];

/** Virtual 320x200 coordinate -> CSS percentage inside the stage (overlays scale with the canvas). */
export function toPct(x: number, y: number): { left: string; top: string } {
  return { left: `${(x / VW) * 100}%`, top: `${(y / VH) * 100}%` };
}

/** Bresenham line: every integer pixel between two points (for crisp 1px leader lines). */
export function pixelLine(a: Vec, b: Vec): Vec[] {
  let [x0, y0] = [Math.round(a[0]), Math.round(a[1])];
  const [x1, y1] = [Math.round(b[0]), Math.round(b[1])];
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  const out: Vec[] = [];
  for (;;) {
    out.push([x0, y0]);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
  return out;
}

/**
 * Dotted arc from `from` to `to` (the drag hint of the reference player): `n` integer points on a
 * parabola lifted by `lift` px, excluding both ends.
 */
export function arcDots(from: Vec, to: Vec, n = 7, lift = 28): Vec[] {
  const dots: Vec[] = [];
  for (let i = 1; i <= n; i++) {
    const u = i / (n + 1);
    const x = from[0] + (to[0] - from[0]) * u;
    const y = from[1] + (to[1] - from[1]) * u - Math.sin(u * Math.PI) * lift;
    dots.push([Math.round(x), Math.round(y)]);
  }
  return dots;
}

/** Caption hint with progress, e.g. "KÉO HỘP CƠM LÊN TẤM BẠT · 0/1". */
export function hintText(hint: string, done: number, total: number): string {
  const h = hint.toLocaleUpperCase("vi-VN");
  return total > 1 || done > 0 ? `${h} · ${done}/${total}` : h;
}

// ---------------------------------------------------------------------------------------------
// Interaction reducers
// ---------------------------------------------------------------------------------------------

export interface DragItemState {
  id: string;
  home: Vec;
  target: Vec;
  pos: Vec;
  placed: boolean;
}

export function initDrag(items: { id: string; from: Vec; to: Vec }[]): DragItemState[] {
  return items.map((it) => ({ id: it.id, home: it.from, target: it.to, pos: [...it.from] as Vec, placed: false }));
}

/** Index of the unplaced item under the pointer (item centre within `radius`), topmost last. */
export function pickDragItem(items: DragItemState[], p: Vec, radius = 18): number {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (!it.placed && Math.hypot(it.pos[0] - p[0], it.pos[1] - p[1]) <= radius) return i;
  }
  return -1;
}

/** Drop item `i` at `p`: snaps onto its target when close enough, otherwise returns home. */
export function dropDragItem(items: DragItemState[], i: number, p: Vec, snap = 16): { items: DragItemState[]; placed: boolean } {
  const next = items.map((it) => ({ ...it, pos: [...it.pos] as Vec }));
  const it = next[i];
  const ok = Math.hypot(it.target[0] - p[0], it.target[1] - p[1]) <= snap;
  it.pos = ok ? ([...it.target] as Vec) : ([...it.home] as Vec);
  it.placed = ok;
  return { items: next, placed: ok };
}

export interface TapSpot {
  id: string;
  x: number;
  y: number;
  r?: number;
}

/** Id of the not-yet-found spot under the pointer, or null. */
export function hitTapSpot(spots: TapSpot[], found: string[], p: Vec): string | null {
  for (const s of spots) {
    if (found.includes(s.id)) continue;
    if (Math.hypot(s.x - p[0], s.y - p[1]) <= (s.r ?? 12)) return s.id;
  }
  return null;
}

/** Hold-to-fill: progress grows while held, slowly drains when released (never below 0). */
export function stepHold(progress: number, holding: boolean, dt: number, durationSec: number): number {
  const rate = 1 / Math.max(0.2, durationSec);
  const next = holding ? progress + dt * rate : progress - dt * rate * 0.35;
  return Math.max(0, Math.min(1, next));
}

// ---------------------------------------------------------------------------------------------
// Dither dissolve
// ---------------------------------------------------------------------------------------------

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/**
 * Mix the previous scene's frame over the new one with an ordered-dither mask (no black dip):
 * a pixel keeps the OLD colour while its Bayer threshold is below `amount * 16`.
 * Works in place on RGBA data of equal size; `cell` = dither block size in pixels.
 */
export function ditherDissolve(
  current: Uint8ClampedArray,
  previous: Uint8ClampedArray,
  width: number,
  height: number,
  amount: number,
  cell = 2
): void {
  if (amount <= 0) return;
  const threshold = amount * 16;
  for (let y = 0; y < height; y++) {
    const by = (Math.floor(y / cell) & 3) * 4;
    for (let x = 0; x < width; x++) {
      if (BAYER[by + (Math.floor(x / cell) & 3)] < threshold) {
        const i = (y * width + x) * 4;
        current[i] = previous[i];
        current[i + 1] = previous[i + 1];
        current[i + 2] = previous[i + 2];
        current[i + 3] = previous[i + 3];
      }
    }
  }
}
