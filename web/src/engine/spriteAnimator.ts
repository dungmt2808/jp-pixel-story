/**
 * Frame-based sprite animation driven by the `meta.json` that `pixellab_slice_spritesheet`
 * writes next to `spritesheet.png`:
 *
 *   { frameWidth, frameHeight, frameCount, pivot: {x, y}, fps,
 *     clips: { idle: { frames: [0, 2], fps: 4, loop: true }, talk: {...} } }
 *
 * The pivot (usually the feet / bottom-centre) is what gets placed at (x, y) on the stage,
 * so every frame of every clip stays registered.
 */

export interface SpriteClip {
  frames: number[];
  fps: number;
  loop: boolean;
}

export interface SpriteMeta {
  spritesheet: string;
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
  pivot: { x: number; y: number };
  fps: number;
  clips: Record<string, SpriteClip>;
  palette?: string;
}

export interface SpriteSheet {
  meta: SpriteMeta;
  image: HTMLImageElement;
}

type RawClip = number[] | { frames: number[]; fps?: number; loop?: boolean };

/** Fill defaults and validate a raw meta.json object. Throws on inconsistent data. */
export function normalizeSpriteMeta(raw: Record<string, unknown>): SpriteMeta {
  const frameWidth = Number(raw.frameWidth);
  const frameHeight = Number(raw.frameHeight);
  const frameCount = Number(raw.frameCount);
  if (!(frameWidth > 0 && frameHeight > 0 && frameCount > 0)) {
    throw new Error("sprite meta needs positive frameWidth, frameHeight and frameCount");
  }
  const fps = Number(raw.fps ?? 8) || 8;
  const pivotRaw = (raw.pivot ?? {}) as { x?: number; y?: number };
  const pivot = {
    x: Number.isFinite(pivotRaw.x) ? Number(pivotRaw.x) : Math.floor(frameWidth / 2),
    y: Number.isFinite(pivotRaw.y) ? Number(pivotRaw.y) : frameHeight,
  };
  const clipsRaw = (raw.clips ?? {}) as Record<string, RawClip>;
  const clips: Record<string, SpriteClip> = {};
  for (const [name, spec] of Object.entries(clipsRaw)) {
    const obj = Array.isArray(spec) ? { frames: spec } : spec;
    const frames = (obj.frames ?? []).map(Number);
    if (frames.length === 0 || frames.some((f) => !(f >= 0 && f < frameCount))) {
      throw new Error(`clip "${name}" has frames outside 0..${frameCount - 1}`);
    }
    clips[name] = { frames, fps: Number(obj.fps ?? fps) || fps, loop: obj.loop ?? true };
  }
  if (Object.keys(clips).length === 0) {
    clips.all = { frames: Array.from({ length: frameCount }, (_, i) => i), fps, loop: true };
  }
  return {
    spritesheet: String(raw.spritesheet ?? "spritesheet.png"),
    frameWidth,
    frameHeight,
    frameCount,
    pivot,
    fps,
    clips,
    palette: raw.palette ? String(raw.palette) : undefined,
  };
}

/**
 * Sheet frame index to show for `clipName` after `tSec` seconds of playing that clip.
 * Looping clips wrap; one-shot clips hold their last frame. Unknown clips fall back to the
 * first defined clip so a typo never crashes the render loop.
 */
export function frameAt(meta: SpriteMeta, clipName: string, tSec: number): number {
  const clip = meta.clips[clipName] ?? Object.values(meta.clips)[0];
  const n = clip.frames.length;
  const step = Math.floor(Math.max(0, tSec) * clip.fps + 1e-9);
  const i = clip.loop ? step % n : Math.min(step, n - 1);
  return clip.frames[i];
}

/** Resolve the spritesheet image URL relative to the meta.json URL. */
export function spritesheetUrl(metaUrl: string, meta: SpriteMeta): string {
  const slash = metaUrl.lastIndexOf("/");
  return slash >= 0 ? `${metaUrl.slice(0, slash + 1)}${meta.spritesheet}` : meta.spritesheet;
}

export async function loadSpriteSheet(metaUrl: string): Promise<SpriteSheet> {
  const res = await fetch(metaUrl);
  if (!res.ok) throw new Error(`sprite meta ${metaUrl}: HTTP ${res.status}`);
  const meta = normalizeSpriteMeta((await res.json()) as Record<string, unknown>);
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error(`spritesheet ${meta.spritesheet} failed to load`));
    im.src = spritesheetUrl(metaUrl, meta);
  });
  return { meta, image };
}

/**
 * Draw one frame so that the sprite's pivot lands on (x, y). `scale` must be a whole number
 * (fractional scales would create uneven pixels) and is floored to one.
 */
export function drawSpriteFrame(
  ctx: CanvasRenderingContext2D,
  sheet: SpriteSheet,
  frameIndex: number,
  x: number,
  y: number,
  opts: { scale?: number; flipX?: boolean } = {}
): void {
  const { meta, image } = sheet;
  const k = Math.max(1, Math.floor(opts.scale ?? 1));
  const fw = meta.frameWidth;
  const fh = meta.frameHeight;
  const sx = (((frameIndex % meta.frameCount) + meta.frameCount) % meta.frameCount) * fw;
  const dx = Math.round(x - meta.pivot.x * k);
  const dy = Math.round(y - meta.pivot.y * k);
  if (opts.flipX) {
    ctx.save();
    ctx.translate(Math.round(x) * 2, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(image, sx, 0, fw, fh, dx, dy, fw * k, fh * k);
    ctx.restore();
    return;
  }
  ctx.drawImage(image, sx, 0, fw, fh, dx, dy, fw * k, fh * k);
}
