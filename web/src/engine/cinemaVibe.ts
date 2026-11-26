/**
 * "Vibe kit" of the cinema player: manga emotes, camera moves, light grades and default SFX.
 * Pure helpers (camera maths, sfx choice) are unit-tested; drawing uses whole pixels only.
 */
import type { Vec } from "./cinemaUi";

export const VW = 320;
export const VH = 200;

// ---------------------------------------------------------------------------------------------
// Emotes (manga symbols) — tiny pixel bitmaps, 2 animation frames each.
// o outline, b drop blue, w white, r red, p pink, y gold, k ink, g gloom blue
// ---------------------------------------------------------------------------------------------
const C: Record<string, string> = {
  o: "#241712",
  b: "#7ec8f0",
  w: "#ffffff",
  r: "#e0443a",
  p: "#ff8fb1",
  y: "#ffe38c",
  k: "#101322",
  g: "#5c6ea8",
};

const BITMAPS: Record<string, string[][]> = {
  sweat: [
    ["...o...", "..obo..", "..obo..", ".obbbo.", ".obwbo.", "obwbbbo", "obbbbbo", ".obbbo.", "..ooo.."],
  ],
  anger: [
    [".rr...rr.", "r.r...r.r", "rr.....rr", ".........", ".........", "rr.....rr", "r.r...r.r", ".rr...rr."],
    ["..r...r..", ".rr...rr.", "r.r...r.r", "rr.....rr", "rr.....rr", "r.r...r.r", ".rr...rr.", "..r...r.."],
  ],
  heart: [
    [".oo...oo.", "oppo.oppo", "opwpopppo", "opppppppo", ".opppppo.", "..opppo..", "...opo...", "....o...."],
    ["........", ".oo.oo..", "opwoppo.", "oppppppo", ".oppppo.", "..oppo..", "...oo...", "........"],
  ],
  sparkle: [
    ["...y...", "...y...", "..yyy..", "yyywyyy", "..yyy..", "...y...", "...y..."],
    [".......", "...y...", "...y...", ".yywyy.", "...y...", "...y...", "......."],
  ],
  shock: [
    [".ooo.", "oyyyo", "oyyyo", "oyyyo", "oyyyo", ".oyo.", ".oyo.", "..o..", ".ooo.", "oyyyo", ".ooo."],
  ],
  question: [
    [".ooooo.", "owwwwwo", "owooowo", "ooo.owo", "...owwo", "..owwo.", "..owo..", "..ooo..", "..ooo..", "..owo..", "..ooo.."],
  ],
  note: [
    ["..oooo", "..oyyo", "..oyo.", "..oyo.", "..oyo.", ".ooyo.", "oyyyo.", "oyyyo.", ".ooo.."],
  ],
};

export const EMOTE_NAMES = ["sweat", "anger", "heart", "sparkle", "shock", "question", "note", "dots", "gloom"] as const;

function drawBitmap(ctx: CanvasRenderingContext2D, rows: string[], x: number, y: number): void {
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const col = C[row[i]];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(x + i, y + j, 1, 1);
    }
  });
}

/**
 * Draw an emote whose bottom-centre sits at (x, y). `age` = seconds since the line started:
 * a 0.18 s pop-in (rises 3 px), then a 2-frame loop; sweat slides down, gloom lines fall.
 * `scale` is a whole number (2 for big portraits) so the symbol stays pixel-crisp.
 */
export function drawEmote(
  ctx: CanvasRenderingContext2D,
  name: string,
  x: number,
  y: number,
  age: number,
  scale = 1
): void {
  const k = Math.max(1, Math.round(scale));
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.scale(k, k);
  drawEmoteAt(ctx, name, age);
  ctx.restore();
}

/** Emote with its bottom-centre at the origin. */
function drawEmoteAt(ctx: CanvasRenderingContext2D, name: string, age: number): void {
  const X = 0;
  const Y = 0;
  const pop = age < 0.18 ? Math.round((1 - age / 0.18) * 3) : 0;
  if (name === "dots") {
    const n = Math.min(3, Math.floor(age / 0.3) + 1);
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = C.o;
      ctx.fillRect(X - 7 + i * 5, Y - 4, 4, 4);
      ctx.fillStyle = C.w;
      ctx.fillRect(X - 6 + i * 5, Y - 3, 2, 2);
    }
    return;
  }
  if (name === "gloom") {
    ctx.fillStyle = C.g;
    for (let i = 0; i < 5; i++) {
      const len = 6 + ((i * 7) % 5);
      const fall = Math.floor((age * 14 + i * 3) % 6);
      for (let k = 0; k < len; k += 2) ctx.fillRect(X - 10 + i * 5, Y - 18 + fall + k, 1, 1);
    }
    return;
  }
  const frames = BITMAPS[name];
  if (!frames) return;
  const rows = frames[Math.floor(age * 3) % frames.length];
  const w = rows[0].length;
  const h = rows.length;
  const slide = name === "sweat" ? Math.min(4, Math.floor(age * 3)) : 0;
  const shake = name === "shock" && age < 0.5 ? (Math.floor(age * 20) % 2 ? 1 : -1) : 0;
  drawBitmap(ctx, rows, X - Math.floor(w / 2) + shake, Y - h - pop + slide);
}

/** Default sound per emote (a line's own `sfx` wins; `"none"` silences). */
const EMOTE_SFX: Record<string, string> = {
  shock: "shock",
  anger: "thud",
  heart: "heart",
  sparkle: "sparkle",
  question: "pop",
  gloom: "gloom",
  sweat: "boing",
  note: "sparkle",
};

export function lineSfx(line: { sfx?: string; emote?: string } | null | undefined): string | null {
  if (!line) return null;
  if (line.sfx) return line.sfx === "none" ? null : line.sfx;
  return line.emote ? EMOTE_SFX[line.emote] ?? null : null;
}

// ---------------------------------------------------------------------------------------------
// Camera: applied when the 320x200 frame is presented (zoom > 1 crops the frame; the stage
// itself is never resampled, so pixel art stays crisp at its virtual resolution).
// ---------------------------------------------------------------------------------------------
export type CameraMove = "push" | "punch" | "close" | "shake" | "pan_left" | "pan_right";

export interface CameraView {
  zoom: number;
  cx: number;
  cy: number;
}

export const IDENTITY_VIEW: CameraView = { zoom: 1, cx: VW / 2, cy: VH / 2 };

const easeOut = (u: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, u)), 3);
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;

/**
 * Camera view `age` seconds into a line. `focus` is the speaker's head (virtual px), `dur` the
 * line length (pans travel across it). Unknown moves give the identity view.
 */
export function cameraAt(move: string | undefined, age: number, focus: Vec, dur = 3): CameraView {
  const fx = focus[0];
  const fy = focus[1];
  switch (move) {
    case "push": {
      const u = easeOut(age / 1.2);
      return { zoom: lerp(1, 1.2, u), cx: lerp(VW / 2, fx, u * 0.8), cy: lerp(VH / 2, fy + 30, u * 0.8) };
    }
    case "punch": {
      // snap in, settle back a little: the comedic "zoom on the reaction"
      const z = age < 0.08 ? lerp(1, 1.35, age / 0.08) : lerp(1.35, 1.22, easeOut((age - 0.08) / 0.4));
      return { zoom: z, cx: fx, cy: fy + 22 };
    }
    case "close":
      return { zoom: 1.4, cx: fx, cy: fy + 20 };
    case "shake": {
      const decay = Math.max(0, 1 - age / 0.7);
      const ox = Math.round(Math.sin(age * 55) * 3 * decay);
      const oy = Math.round(Math.cos(age * 47) * 2 * decay);
      return { zoom: 1.05, cx: VW / 2 + ox, cy: VH / 2 + oy };
    }
    case "pan_left":
    case "pan_right": {
      const u = Math.max(0, Math.min(1, age / Math.max(1, dur)));
      const from = move === "pan_left" ? VW * 0.6 : VW * 0.4;
      const to = move === "pan_left" ? VW * 0.4 : VW * 0.6;
      return { zoom: 1.15, cx: lerp(from, to, u), cy: VH / 2 };
    }
    default:
      return IDENTITY_VIEW;
  }
}

/** Source rectangle of the buffer to present for a view (always inside the 320x200 frame). */
export function cameraSourceRect(view: CameraView): { sx: number; sy: number; sw: number; sh: number } {
  const zoom = Math.max(1, view.zoom);
  const sw = VW / zoom;
  const sh = VH / zoom;
  const sx = Math.max(0, Math.min(VW - sw, view.cx - sw / 2));
  const sy = Math.max(0, Math.min(VH - sh, view.cy - sh / 2));
  return { sx, sy, sw, sh };
}

// ---------------------------------------------------------------------------------------------
// Light grades: one tint over EVERYTHING in the frame (backdrop, actors, items, weather), so
// art from different sources reads as one place and one time of day.
// ---------------------------------------------------------------------------------------------
interface Grade {
  multiply?: [string, number];
  screen?: [string, number];
}

export const LIGHTS: Record<string, Grade> = {
  day: {},
  morning: { screen: ["#fff1d6", 0.1], multiply: ["#f3f0ff", 0.25] },
  golden: { multiply: ["#ffd49a", 0.38], screen: ["#ff9a4d", 0.07] },
  dusk: { multiply: ["#b48ed0", 0.48], screen: ["#ff8a5c", 0.06] },
  night: { multiply: ["#3d4f94", 0.58], screen: ["#1b2550", 0.05] },
  rain: { multiply: ["#93a6bd", 0.4] },
  warm: { multiply: ["#ffc98f", 0.28], screen: ["#ffb070", 0.04] },
};

export function drawLightGrade(ctx: CanvasRenderingContext2D, name: string | undefined): void {
  const g = name ? LIGHTS[name] : undefined;
  if (!g || (!g.multiply && !g.screen)) return;
  ctx.save();
  if (g.multiply) {
    ctx.globalCompositeOperation = "multiply";
    ctx.globalAlpha = g.multiply[1];
    ctx.fillStyle = g.multiply[0];
    ctx.fillRect(0, 0, VW, VH);
  }
  if (g.screen) {
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = g.screen[1];
    ctx.fillStyle = g.screen[0];
    ctx.fillRect(0, 0, VW, VH);
  }
  ctx.restore();
}
