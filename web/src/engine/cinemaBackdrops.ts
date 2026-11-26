/**
 * Registry of procedural (code-drawn) backdrops and atmospheric overlays for the data-driven
 * CinemaStage. Scenes reference them from story.json:
 *   "backdrop": "proc:airport_train"            (or "bg:<key>" for a palette-locked PNG)
 *   "overlay":  "bath_steam" | "snow" | "rain" | "petals"
 * Add a new entry here once and every story can use it - no per-story stage code.
 */
import { drawLightRays } from "./cinemaFx";
import { VIRTUAL_H, VIRTUAL_W } from "./pixelRenderer";

export type ImageMap = Record<string, HTMLImageElement>;
export type BackdropFn = (ctx: CanvasRenderingContext2D, t: number, imgs: ImageMap) => void;
export type OverlayFn = (ctx: CanvasRenderingContext2D, t: number) => void;

/** Cozy 16-bit Japanese washoku table overlay (sashimi, steaming miso soup, rice, green tea) */
function drawWashokuTableScene(
  ctx: CanvasRenderingContext2D,
  bg: HTMLImageElement | undefined,
  t: number
): void {
  if (bg) {
    ctx.drawImage(bg, 0, 0, VIRTUAL_W, VIRTUAL_H);
    // Warm summer-sunset amber room tint
    ctx.fillStyle = "rgba(255, 198, 118, 0.14)";
    ctx.fillRect(0, 0, VIRTUAL_W, VIRTUAL_H);
  } else {
    ctx.fillStyle = "#2b1c14";
    ctx.fillRect(0, 0, VIRTUAL_W, VIRTUAL_H);
  }
  // Low Japanese wooden dining table (chabudai) framed cleanly ABOVE the subtitle box!
  ctx.fillStyle = "#241712";
  ctx.fillRect(86, 86, 148, 36);
  ctx.fillStyle = "#7a4424";
  ctx.fillRect(88, 88, 144, 32);
  ctx.fillStyle = "#9d5b32";
  ctx.fillRect(90, 90, 140, 20);
  // Table legs
  ctx.fillStyle = "#4d2a16";
  ctx.fillRect(94, 120, 8, 10);
  ctx.fillRect(218, 120, 8, 10);

  // Sashimi plate (center)
  ctx.fillStyle = "#241712";
  ctx.fillRect(136, 93, 48, 14);
  ctx.fillStyle = "#f2eee4";
  ctx.fillRect(137, 94, 46, 12);
  // Pink/coral sashimi slices + green shiso leaf
  ctx.fillStyle = "#3f7d4c";
  ctx.fillRect(140, 97, 10, 6);
  ctx.fillStyle = "#e8786d";
  ctx.fillRect(145, 96, 9, 5);
  ctx.fillRect(156, 96, 9, 5);
  ctx.fillStyle = "#f5a582";
  ctx.fillRect(167, 97, 9, 5);

  // Two bowls of steaming miso soup (left & right)
  for (const bx of [104, 194]) {
    ctx.fillStyle = "#241712";
    ctx.fillRect(bx, 96, 22, 12);
    ctx.fillStyle = "#7d2222";
    ctx.fillRect(bx + 1, 97, 20, 10);
    ctx.fillStyle = "#d99b43";
    ctx.fillRect(bx + 3, 98, 16, 4);
    // Rising soup steam wisps
    for (let i = 0; i < 3; i++) {
      const p = (t * 0.45 + i * 0.33 + bx * 0.01) % 1;
      const sx = bx + 6 + i * 4 + Math.sin(t * 2.8 + i) * 2;
      const sy = 96 - p * 18;
      ctx.fillStyle = `rgba(255, 248, 232, ${(Math.sin(p * Math.PI) * 0.55).toFixed(2)})`;
      ctx.fillRect(Math.round(sx), Math.round(sy), 2, 2);
    }
  }
  // Fluffy rice bowl + green tea cup
  ctx.fillStyle = "#241712";
  ctx.fillRect(126, 106, 16, 9);
  ctx.fillStyle = "#3a4f7a";
  ctx.fillRect(127, 109, 14, 5);
  ctx.fillStyle = "#fffdf6";
  ctx.fillRect(128, 105, 12, 4);
  ctx.fillStyle = "#487042";
  ctx.fillRect(182, 107, 8, 7);
}

/** Sunlit moving Japanese Airport Express Train with live scrolling Tokyo skyline & summer clouds! */
function drawAirportTrainScene(ctx: CanvasRenderingContext2D, t: number): void {
  // 1. Bright summer azure sky outside panoramic train windows
  ctx.fillStyle = "#5ba4e5";
  ctx.fillRect(0, 18, VIRTUAL_W, 92);
  ctx.fillStyle = "#8bc6f5";
  ctx.fillRect(0, 62, VIRTUAL_W, 48);

  // Drifting summer clouds (slow parallax)
  for (let i = 0; i < 5; i++) {
    const cx = ((i * 78 - t * 12) % (VIRTUAL_W + 60) + VIRTUAL_W + 60) % (VIRTUAL_W + 60) - 40;
    const cy = 28 + (i % 3) * 12;
    ctx.fillStyle = "#f8fbff";
    ctx.fillRect(Math.round(cx), cy, 34, 10);
    ctx.fillRect(Math.round(cx + 6), cy - 5, 20, 6);
  }

  // Scrolling distant Tokyo skyline & green riverside trees (medium parallax)
  for (let i = 0; i < 14; i++) {
    const bx = ((i * 30 - t * 44) % (VIRTUAL_W + 40) + VIRTUAL_W + 40) % (VIRTUAL_W + 40) - 25;
    const bh = 18 + ((i * 17) % 28);
    ctx.fillStyle = i % 3 === 0 ? "#6680a8" : "#7b93b8";
    ctx.fillRect(Math.round(bx), 104 - bh, 22, bh);
    // Tiny sunlit building windows
    ctx.fillStyle = "#dbeeff";
    ctx.fillRect(Math.round(bx + 4), 104 - bh + 4, 4, 4);
    ctx.fillRect(Math.round(bx + 12), 104 - bh + 4, 4, 4);
  }
  // Passing green summer tree line (fast parallax)
  for (let i = 0; i < 18; i++) {
    const tx = ((i * 24 - t * 88) % (VIRTUAL_W + 30) + VIRTUAL_W + 30) % (VIRTUAL_W + 30) - 16;
    ctx.fillStyle = i % 2 === 0 ? "#3f7d4b" : "#51995d";
    ctx.fillRect(Math.round(tx), 92 + (i % 3) * 3, 18, 18);
  }
  // Passing electric catenary poles (very fast foreground rush)
  for (let i = 0; i < 3; i++) {
    const px = ((i * 150 - t * 170) % (VIRTUAL_W + 120) + VIRTUAL_W + 120) % (VIRTUAL_W + 120) - 40;
    ctx.fillStyle = "rgba(42, 52, 74, 0.55)";
    ctx.fillRect(Math.round(px), 18, 4, 92);
  }

  // 2. Crisp Japanese express train interior framing
  ctx.fillStyle = "#d9d2c3";
  ctx.fillRect(0, 0, VIRTUAL_W, 20);
  ctx.fillStyle = "#241712";
  ctx.fillRect(0, 20, VIRTUAL_W, 2);
  // Window pillar dividers
  for (const wx of [0, 104, 212, 314]) {
    ctx.fillStyle = "#cfc7b6";
    ctx.fillRect(wx, 20, 8, 92);
    ctx.fillStyle = "#241712";
    ctx.fillRect(wx, 20, 1, 92);
    ctx.fillRect(wx + 7, 20, 1, 92);
  }
  // Silver luggage rack & hanging straps
  ctx.fillStyle = "#8a92a4";
  ctx.fillRect(0, 12, VIRTUAL_W, 3);
  for (const sx of [56, 158, 260]) {
    ctx.fillStyle = "#3c4254";
    ctx.fillRect(sx, 15, 2, 12);
    ctx.strokeStyle = "#f2eee4";
    ctx.lineWidth = 2;
    ctx.strokeRect(sx - 3, 27, 8, 8);
  }

  // Lower train wall & plush blue seats
  ctx.fillStyle = "#241712";
  ctx.fillRect(0, 108, VIRTUAL_W, 2);
  ctx.fillStyle = "#c7bea9";
  ctx.fillRect(0, 110, VIRTUAL_W, 90);
  // Plush blue seats
  ctx.fillStyle = "#2b4d82";
  ctx.fillRect(14, 116, VIRTUAL_W - 28, 34);
  ctx.fillStyle = "#3a65a6";
  ctx.fillRect(18, 118, VIRTUAL_W - 36, 18);
  // Subtle train aisle floor
  ctx.fillStyle = "#4d5569";
  ctx.fillRect(0, 150, VIRTUAL_W, 50);

  // Rolling travel suitcase resting neatly by seat
  ctx.fillStyle = "#241712";
  ctx.fillRect(146, 118, 28, 34);
  ctx.fillStyle = "#c94c4c";
  ctx.fillRect(148, 120, 24, 30);
  ctx.fillStyle = "#a33535";
  ctx.fillRect(152, 124, 16, 2);
  ctx.fillRect(152, 130, 16, 2);
  ctx.fillStyle = "#d9dee8";
  ctx.fillRect(156, 112, 8, 6);

  // Warm golden afternoon sunbeams slanting across the carriage
  ctx.save();
  ctx.fillStyle = "rgba(255, 238, 176, 0.14)";
  ctx.beginPath();
  ctx.moveTo(24, 22);
  ctx.lineTo(96, 22);
  ctx.lineTo(144, 180);
  ctx.lineTo(64, 180);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Gentle rising bath steam for ofuro background */
function drawBathSteam(ctx: CanvasRenderingContext2D, t: number): void {
  for (let i = 0; i < 12; i++) {
    const p = (t * 0.25 + i / 12) % 1;
    const x = 164 + ((i * 23) % 136) + Math.sin(t * 1.9 + i * 1.3) * 6;
    const y = 150 - p * 56;
    const a = Math.sin(p * Math.PI) * 0.34;
    const w = 6 + Math.floor(p * 8);
    ctx.fillStyle = `rgba(242, 248, 255, ${a.toFixed(3)})`;
    ctx.fillRect(Math.round(x), Math.round(y), w, 3);
  }
}


function drawSnow(ctx: CanvasRenderingContext2D, t: number): void {
  ctx.fillStyle = "#f6eed8";
  for (let i = 0; i < 48; i++) {
    const sx = (i * 67) % VIRTUAL_W;
    const sy = (i * 29) % VIRTUAL_H;
    const y = (sy + t * (14 + (i % 5) * 4)) % VIRTUAL_H;
    const x = (sx + Math.round(Math.sin(t * 1.3 + i) * 3) + VIRTUAL_W) % VIRTUAL_W;
    const s = i % 7 === 0 ? 2 : 1;
    ctx.fillRect(Math.round(x), Math.round(y), s, s);
  }
}

function drawRain(ctx: CanvasRenderingContext2D, t: number): void {
  ctx.fillStyle = "#a7bad9";
  for (let i = 0; i < 46; i++) {
    const sx = (i * 73) % VIRTUAL_W;
    const sy = (i * 41) % VIRTUAL_H;
    const y = (sy + t * 150) % VIRTUAL_H;
    const x = ((sx - t * 26) % VIRTUAL_W + VIRTUAL_W) % VIRTUAL_W;
    ctx.fillRect(Math.round(x), Math.round(y), 1, 4);
  }
}

/** Drifting cherry-blossom petals (2-tone, palette colours only). */
function drawPetals(ctx: CanvasRenderingContext2D, t: number): void {
  for (let i = 0; i < 26; i++) {
    const speed = 10 + (i % 4) * 4;
    const y = ((i * 37) % VIRTUAL_H + t * speed) % (VIRTUAL_H + 10) - 5;
    const x = (((i * 53) % VIRTUAL_W) - t * (8 + (i % 3) * 3) + Math.sin(t * 1.7 + i) * 6 + VIRTUAL_W * 4) % VIRTUAL_W;
    ctx.fillStyle = i % 3 === 0 ? "#f2c6a0" : "#f6eed8";
    ctx.fillRect(Math.round(x), Math.round(y), 2, 1);
    if (Math.sin(t * 3 + i) > 0) ctx.fillRect(Math.round(x) + 1, Math.round(y) + 1, 1, 1);
  }
}

export const PROCEDURAL_BACKDROPS: Record<string, BackdropFn> = {
  washoku_table: (ctx, t, imgs) => drawWashokuTableScene(ctx, imgs["bg:washitsu"], t),
  airport_train: (ctx, t) => drawAirportTrainScene(ctx, t),
};

export const OVERLAYS: Record<string, OverlayFn> = {
  bath_steam: drawBathSteam,
  snow: drawSnow,
  rain: drawRain,
  petals: drawPetals,
  light_rays: (ctx, t) => drawLightRays(ctx, t),
};

/** Legacy `locationBadge` values that implied an overlay before `overlay` existed. */
export const LEGACY_BADGE_OVERLAY: Record<string, string> = { "bg:ofuro": "bath_steam" };

/**
 * Draw a scene backdrop reference. Returns false when nothing could be drawn
 * (unknown procedural name or missing image) so the caller can paint a fallback.
 */
export function drawBackdrop(ctx: CanvasRenderingContext2D, ref: string, t: number, imgs: ImageMap): boolean {
  if (ref.startsWith("proc:")) {
    const fn = PROCEDURAL_BACKDROPS[ref.slice(5)];
    if (!fn) return false;
    fn(ctx, t, imgs);
    return true;
  }
  const key = ref.startsWith("bg:") ? ref : `bg:${ref}`;
  const im = imgs[key];
  if (!im) {
    // Legacy stories used "bg:<procedural name>" in locationBadge.
    const legacy = PROCEDURAL_BACKDROPS[key.slice(3)];
    if (!legacy) return false;
    legacy(ctx, t, imgs);
    return true;
  }
  ctx.drawImage(im, 0, 0, VIRTUAL_W, VIRTUAL_H);
  return true;
}
