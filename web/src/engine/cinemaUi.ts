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

/**
 * Centred tags near the frame edge would be cut off: anchor them by their inner side instead
 * (class for `.cine-tag`): "edge-l" left of x = 48, "edge-r" right of x = 272, else "".
 */
export function tagEdge(x: number): "" | "edge-l" | "edge-r" {
  if (x < 48) return "edge-l";
  if (x > VW - 48) return "edge-r";
  return "";
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

/**
 * Frame of a driven key pose (`interaction.drive`) at this moment.
 * - holding: loop `frames` at `fps` while `active` (held / dragged), else the base frame;
 * - progress: step through `frames` with progress 0..1 (the last frame only when complete);
 * - step: for `stepSec` after a step, play the frames after the base once, then rest on the base.
 */
export function driveFrame(
  frames: number[],
  by: "holding" | "progress" | "step",
  s: { active: boolean; progress: number; t: number; stepAge: number | null; fps?: number; stepSec?: number }
): number {
  const n = frames.length;
  if (n <= 1) return frames[0] ?? 0;
  if (by === "holding") return s.active ? frames[Math.floor(s.t * (s.fps ?? 4)) % n] : frames[0];
  if (by === "progress") return frames[Math.min(n - 1, Math.floor(Math.max(0, s.progress) * (n - 1) + 1e-6))];
  const len = s.stepSec ?? 0.6;
  if (s.stepAge === null || s.stepAge < 0 || s.stepAge >= len) return frames[0];
  return frames[1 + Math.min(n - 2, Math.floor((s.stepAge / len) * (n - 1)))];
}

// ---------------------------------------------------------------------------------------------
// Stage layout boxes (shared by the stage drawing and the "never cover a face" test)
// ---------------------------------------------------------------------------------------------

/** [x0, y0, x1, y1] in virtual pixels, x1/y1 exclusive. */
export type Box = [number, number, number, number];

/** The hold item is drawn this far below `hold.y`; the meter sits at `hold.y`, this wide. */
export const HOLD_ITEM_DY = 18;
export const HOLD_METER_W = 56;
const HOLD_METER_H = 6;

export function boxesOverlap(a: Box, b: Box): boolean {
  return a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
}

/**
 * Face of a frameless bust actor on the stage: its sprite's expression region (eyes + mouth, from
 * art.json `expression_region` / `frame_regions`) placed where `drawActor` puts the frame
 * (pivot on `pivotX`, feet on the stage bottom, whole-pixel scale). Null without a region.
 */
export function bustFaceBox(
  pivotX: number,
  meta: { pivot?: { x: number; y: number }; frameWidth: number; frameHeight: number; expressionRegion?: number[] | null; frameExpressionRegions?: Record<string, number[]> },
  scale = 1,
  flipX = false
): Box | null {
  const regions = [meta.expressionRegion, ...Object.values(meta.frameExpressionRegions ?? {})].filter(
    (r): r is number[] => Array.isArray(r) && r.length === 4
  );
  if (!regions.length) return null;
  const rx0 = Math.min(...regions.map((r) => r[0]));
  const ry0 = Math.min(...regions.map((r) => r[1]));
  const rx1 = Math.max(...regions.map((r) => r[2]));
  const ry1 = Math.max(...regions.map((r) => r[3]));
  const k = Math.max(1, Math.floor(scale));
  const px = meta.pivot?.x ?? Math.floor(meta.frameWidth / 2);
  const py = meta.pivot?.y ?? meta.frameHeight;
  const left = pivotX - px * k;
  const top = VH - py * k;
  const [fx0, fx1] = flipX ? [meta.frameWidth - rx1, meta.frameWidth - rx0] : [rx0, rx1];
  return [left + fx0 * k, top + ry0 * k, left + fx1 * k, top + ry1 * k];
}

/** Everything a hold interaction draws: the held item (if any) and the progress meter. */
export function holdBoxes(hold: { x: number; y: number }, item?: { w: number; h: number }): Box[] {
  const mx = Math.round(hold.x - HOLD_METER_W / 2);
  const my = Math.round(hold.y);
  const out: Box[] = [[mx - 1, my - 1, mx + HOLD_METER_W + 1, my + HOLD_METER_H + 1]];
  if (item) {
    const cx = Math.round(hold.x);
    const cy = Math.round(hold.y + HOLD_ITEM_DY);
    // the item tilts and bobs while held: keep 2 px of slack around it
    out.push([cx - Math.floor(item.w / 2) - 2, cy - Math.floor(item.h / 2) - 2, cx + Math.ceil(item.w / 2) + 2, cy + Math.ceil(item.h / 2) + 2]);
  }
  return out;
}

/** A drag item at its start and at its target. */
export function dragBoxes(drag: { from: Vec; to: Vec }, item: { w: number; h: number }): Box[] {
  return [drag.from, drag.to].map(([x, y]) => [
    Math.round(x - item.w / 2),
    Math.round(y - item.h / 2),
    Math.round(x + item.w / 2),
    Math.round(y + item.h / 2),
  ]);
}

/** The tappable circle of a tap spot, as a box. */
export function tapBox(spot: TapSpot): Box {
  const r = spot.r ?? 12;
  return [spot.x - r, spot.y - r, spot.x + r, spot.y + r];
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
