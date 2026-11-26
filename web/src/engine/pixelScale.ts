/**
 * Pixel-perfect sprite scaling.
 *
 * Drawing a 96px portrait at 122px (or a 36px item at 24px) makes some source pixels 1 screen
 * pixel wide and others 2 — the classic "mixel" artefact. `drawPixelImage` never does that:
 *   - upscales snap to a whole-number factor (1x, 2x, 3x ...), bottom-centred in the requested box;
 *   - downscales are re-sampled once with a MODE filter (most common opaque colour per cell), so
 *     the result stays inside the original palette and every output pixel is 1 texel.
 */

export interface PixelSize {
  w: number;
  h: number;
}

/** Whole-number upscale factor (>= 1) that fits `natural` inside `requested`. */
export function integerUpscale(natural: PixelSize, requested: PixelSize): number {
  return Math.max(1, Math.floor(Math.min(requested.w / natural.w, requested.h / natural.h) + 1e-9));
}

/**
 * Mode-filter downsample of RGBA pixels (row-major, 4 bytes/pixel).
 * A target pixel is opaque when >= `coverage` of its source cell is opaque (alpha >= 128),
 * and takes the most frequent opaque colour of that cell (ties -> first seen), so no new
 * colours are ever invented.
 */
export function downsampleModeRGBA(
  src: Uint8ClampedArray | Uint8Array,
  sw: number,
  sh: number,
  dw: number,
  dh: number,
  coverage = 0.5
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(dw * dh * 4);
  for (let ty = 0; ty < dh; ty++) {
    const y0 = Math.min(sh - 1, Math.floor((ty * sh) / dh));
    const y1 = Math.max(y0 + 1, Math.floor(((ty + 1) * sh) / dh));
    for (let tx = 0; tx < dw; tx++) {
      const x0 = Math.min(sw - 1, Math.floor((tx * sw) / dw));
      const x1 = Math.max(x0 + 1, Math.floor(((tx + 1) * sw) / dw));
      const counts = new Map<number, number>();
      let opaque = 0;
      let total = 0;
      let best = -1;
      let bestCount = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * sw + x) * 4;
          total++;
          if (src[i + 3] < 128) continue;
          opaque++;
          const key = (src[i] << 16) | (src[i + 1] << 8) | src[i + 2];
          const c = (counts.get(key) ?? 0) + 1;
          counts.set(key, c);
          if (c > bestCount) {
            bestCount = c;
            best = key;
          }
        }
      }
      if (best < 0 || opaque / total < coverage) continue;
      const o = (ty * dw + tx) * 4;
      out[o] = (best >> 16) & 255;
      out[o + 1] = (best >> 8) & 255;
      out[o + 2] = best & 255;
      out[o + 3] = 255;
    }
  }
  return out;
}

type Drawable = HTMLImageElement | HTMLCanvasElement;

const downscaleCache = new WeakMap<Drawable, Map<string, HTMLCanvasElement>>();

function naturalSize(img: Drawable): PixelSize {
  if (img instanceof HTMLImageElement) return { w: img.naturalWidth, h: img.naturalHeight };
  return { w: img.width, h: img.height };
}

function getDownscaled(img: Drawable, w: number, h: number): HTMLCanvasElement | null {
  let perImage = downscaleCache.get(img);
  if (!perImage) {
    perImage = new Map();
    downscaleCache.set(img, perImage);
  }
  const key = `${w}x${h}`;
  const hit = perImage.get(key);
  if (hit) return hit;
  const nat = naturalSize(img);
  const srcCanvas = document.createElement("canvas");
  srcCanvas.width = nat.w;
  srcCanvas.height = nat.h;
  const sctx = srcCanvas.getContext("2d");
  if (!sctx) return null;
  sctx.drawImage(img, 0, 0);
  let data: ImageData;
  try {
    data = sctx.getImageData(0, 0, nat.w, nat.h);
  } catch {
    return null; // tainted canvas (cross-origin) -> caller falls back to plain drawImage
  }
  const pixels = downsampleModeRGBA(data.data, nat.w, nat.h, w, h);
  const outCanvas = document.createElement("canvas");
  outCanvas.width = w;
  outCanvas.height = h;
  const octx = outCanvas.getContext("2d");
  if (!octx) return null;
  const outData = octx.createImageData(w, h);
  outData.data.set(pixels);
  octx.putImageData(outData, 0, 0);
  perImage.set(key, outCanvas);
  return outCanvas;
}

/**
 * Draw `img` into the box (x, y, w, h) without ever creating uneven pixels.
 * Returns the rectangle actually drawn (upscales may be smaller than the box: they are
 * bottom-centred inside it so characters keep standing on the same ground line).
 */
export function drawPixelImage(
  ctx: CanvasRenderingContext2D,
  img: Drawable | undefined,
  x: number,
  y: number,
  w: number,
  h: number = w,
  align: "bottom" | "center" = "bottom"
): { x: number; y: number; w: number; h: number } | null {
  if (!img) return null;
  const nat = naturalSize(img);
  if (nat.w === 0 || nat.h === 0) return null;
  const rw = Math.max(1, Math.round(w));
  const rh = Math.max(1, Math.round(h));
  if (rw >= nat.w && rh >= nat.h) {
    const k = integerUpscale(nat, { w: rw, h: rh });
    const dw = nat.w * k;
    const dh = nat.h * k;
    const dx = Math.round(x + (rw - dw) / 2);
    const dy = Math.round(align === "bottom" ? y + (rh - dh) : y + (rh - dh) / 2);
    ctx.drawImage(img, dx, dy, dw, dh);
    return { x: dx, y: dy, w: dw, h: dh };
  }
  const small = getDownscaled(img, rw, rh);
  const dx = Math.round(x);
  const dy = Math.round(y);
  ctx.drawImage(small ?? img, dx, dy, rw, rh);
  return { x: dx, y: dy, w: rw, h: rh };
}

/** Zoom factor actually used for pixel art: the nearest whole number (never below 1). */
export function quantizeZoom(zoom: number): number {
  return Math.max(1, Math.round(zoom));
}

/**
 * Integer-only camera zoom on a full-screen backdrop: crops the source around the focus point
 * (fx, fy as 0..1 fractions) and blows it up by a WHOLE factor, so a "push-in" snaps 1x -> 2x
 * instead of smearing pixels through 1.13x, 1.27x ...
 */
export function drawPixelZoom(
  ctx: CanvasRenderingContext2D,
  img: Drawable | undefined,
  zoom: number,
  fx: number,
  fy: number,
  viewW: number,
  viewH: number
): number {
  if (!img) return 1;
  const k = quantizeZoom(zoom);
  const nat = naturalSize(img);
  // ceil: the crop may overflow the view by < k pixels (clipped), never stretched unevenly
  const sw = Math.min(nat.w, Math.ceil(viewW / k));
  const sh = Math.min(nat.h, Math.ceil(viewH / k));
  const sx = Math.max(0, Math.min(nat.w - sw, Math.round(fx * nat.w * (1 - 1 / k))));
  const sy = Math.max(0, Math.min(nat.h - sh, Math.round(fy * nat.h * (1 - 1 / k))));
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw * k, sh * k);
  return k;
}

const cropCache = new WeakMap<Drawable, Map<string, HTMLCanvasElement>>();

/** Cached sub-rectangle of an image as its own canvas (so it can be scaled pixel-perfectly). */
export function cropPixelImage(img: Drawable | undefined, sx: number, sy: number, sw: number, sh: number): HTMLCanvasElement | undefined {
  if (!img) return undefined;
  let perImage = cropCache.get(img);
  if (!perImage) {
    perImage = new Map();
    cropCache.set(img, perImage);
  }
  const key = `${sx},${sy},${sw},${sh}`;
  const hit = perImage.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = sw;
  c.height = sh;
  const cctx = c.getContext("2d");
  if (!cctx) return undefined;
  cctx.imageSmoothingEnabled = false;
  cctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  perImage.set(key, c);
  return c;
}
