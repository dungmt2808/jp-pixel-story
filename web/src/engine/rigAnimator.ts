/**
 * Head/body cutout rigs built by `pixellab_build_rig` (rig.json + body.png + head.png).
 *
 * The head sheet carries the expression frames (talk / blink / happy clips); the body is one
 * image with a hidden neck extension. Motion is ALWAYS whole pixels (no rotation, no sub-pixel
 * offsets), so the art never smears:
 *   - breathing: body + head rise 1px for part of a 3.2 s cycle
 *   - talking:   the head bobs 1px while the talk clip plays
 *   - listening: a small double nod every 2.8 s while another cast member speaks
 */
import { frameAt, normalizeSpriteMeta, type SpriteMeta } from "./spriteAnimator";

export interface RigData {
  frameWidth: number;
  frameHeight: number;
  neckRow: number;
  neckExtension: number;
  pivot: { x: number; y: number };
  bodyImage: string;
  headSheet: string;
  /** Head frames as a sprite meta (frameHeight = neckRow) so clips reuse frameAt(). */
  head: SpriteMeta;
}

export interface Rig {
  data: RigData;
  body: HTMLImageElement;
  headSheet: HTMLImageElement;
}

export interface RigPose {
  bodyDy: number;
  headDx: number;
  headDy: number;
}

export function normalizeRig(raw: Record<string, unknown>): RigData {
  const frameWidth = Number(raw.frameWidth);
  const frameHeight = Number(raw.frameHeight);
  const neckRow = Number(raw.neckRow);
  const headRaw = (raw.head ?? {}) as { sheet?: string; frameHeight?: number; frameCount?: number };
  const bodyRaw = (raw.body ?? {}) as { image?: string };
  if (!(frameWidth > 0 && frameHeight > 0 && neckRow > 0 && neckRow < frameHeight)) {
    throw new Error("rig needs frameWidth, frameHeight and a neckRow inside the frame");
  }
  const pivotRaw = (raw.pivot ?? {}) as { x?: number; y?: number };
  const pivot = {
    x: Number.isFinite(pivotRaw.x) ? Number(pivotRaw.x) : Math.floor(frameWidth / 2),
    y: Number.isFinite(pivotRaw.y) ? Number(pivotRaw.y) : frameHeight,
  };
  const head = normalizeSpriteMeta({
    spritesheet: headRaw.sheet ?? "head.png",
    frameWidth,
    frameHeight: Number(headRaw.frameHeight ?? neckRow),
    frameCount: Number(headRaw.frameCount ?? 1),
    pivot,
    fps: raw.fps ?? 8,
    clips: raw.clips ?? {},
  });
  return {
    frameWidth,
    frameHeight,
    neckRow,
    neckExtension: Number(raw.neckExtension ?? 0),
    pivot,
    bodyImage: bodyRaw.image ?? "body.png",
    headSheet: headRaw.sheet ?? "head.png",
    head,
  };
}

/** Deterministic whole-pixel pose for time `t` (seconds). `phase` desynchronises two actors. */
export function rigPose(state: { talking: boolean; listening: boolean }, t: number, phase = 0): RigPose {
  const tt = t + phase;
  const bodyDy = Math.sin((tt * 2 * Math.PI) / 3.2) > 0.35 ? -1 : 0;
  let headDy = 0;
  if (state.talking) {
    headDy = Math.floor(tt * 3.5) % 2 === 0 ? -1 : 0;
  } else if (state.listening) {
    const c = ((tt % 2.8) + 2.8) % 2.8;
    if ((c > 0.2 && c < 0.38) || (c > 0.56 && c < 0.74)) headDy = 1;
  }
  return { bodyDy, headDx: 0, headDy };
}

/** Head frame to show: talk clip while talking, otherwise the idle (blink) clip. */
export function rigHeadFrame(data: RigData, talking: boolean, t: number, talkClip = "talk", idleClip = "idle"): number {
  return frameAt(data.head, talking ? talkClip : idleClip, t);
}

function dirOf(url: string): string {
  const i = url.lastIndexOf("/");
  return i >= 0 ? url.slice(0, i + 1) : "";
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error(`rig image failed: ${src}`));
    im.src = src;
  });
}

export async function loadRig(url: string): Promise<Rig> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`rig ${url}: HTTP ${res.status}`);
  const data = normalizeRig((await res.json()) as Record<string, unknown>);
  const base = dirOf(url);
  const [body, headSheet] = await Promise.all([loadImage(base + data.bodyImage), loadImage(base + data.headSheet)]);
  return { data, body, headSheet };
}

/** Draw the rig with its pivot on (x, groundY). `scale` is floored to a whole number. */
export function drawRig(
  ctx: CanvasRenderingContext2D,
  rig: Rig,
  headFrame: number,
  x: number,
  groundY: number,
  pose: RigPose,
  opts: { scale?: number; flipX?: boolean } = {}
): void {
  const { data } = rig;
  const k = Math.max(1, Math.floor(opts.scale ?? 1));
  const fw = data.frameWidth;
  const ox = Math.round(x - data.pivot.x * k);
  const oy = Math.round(groundY - data.pivot.y * k);
  const n = data.head.frameCount;
  const sx = (((headFrame % n) + n) % n) * fw;
  ctx.save();
  if (opts.flipX) {
    ctx.translate(Math.round(x) * 2, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(rig.body, ox, oy + pose.bodyDy * k, fw * k, data.frameHeight * k);
  ctx.drawImage(
    rig.headSheet,
    sx,
    0,
    fw,
    data.head.frameHeight,
    ox + pose.headDx * k,
    oy + (pose.bodyDy + pose.headDy) * k,
    fw * k,
    data.head.frameHeight * k
  );
  ctx.restore();
}
