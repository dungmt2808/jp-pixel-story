/**
 * StackChan, the series mascot — the same pixel character as in the ことば畑 Anki add-on
 * (dungmt2808/kotoba-anki: kotoba_batake/web/fx.js and life.js), ported to the stage engine so the
 * videos and the add-on share one mascot: same box body, screen face, moods and wardrobe.
 *
 *  - bust  (20 x 17 art pixels + room above for hats): moods, wardrobe, talking mouth
 *  - mini  (24 x 16, full body): stand / walk / wave / sit, for route B `people` (kind "stackchan")
 *
 * Everything is drawn from pixel maps with fillRect at a whole-number scale and is a pure function of
 * time, so exported videos stay deterministic.
 */

type Ctx = CanvasRenderingContext2D;

export const MASCOT_MOODS = [
  "idle", "happy", "star", "sad", "think", "heart", "wink", "surprise", "cool", "cry", "kira", "pout", "sleep",
] as const;
export type MascotMood = (typeof MASCOT_MOODS)[number];

export interface MascotWear {
  head?: string;
  face?: string;
  neck?: string;
  /** Shell colours: "sky" | "matcha" | "sakura" | "gold". */
  shell?: string;
}

// ------------------------------------------------------------------------------------- palettes

const C: Record<string, string> = {
  k: "#1b1b2f", w: "#ffffff", y: "#ffd23f", o: "#ff9f1c", p: "#ff7fa0", r: "#ff4f6d",
  d: "#3d8bff", l: "#8fd3ff", s: "#e8e8f0", S: "#b8b8c8", g: "#9aa0b5", G: "#6b7088",
};
const WEAR_PAL: Record<string, string> = {
  k: "#1b1b2f", w: "#ffffff", y: "#ffd23f", i: "#e9b949", o: "#ff9f1c", p: "#ff7fa0", P: "#ffc4d6",
  r: "#ff4f6d", R: "#c21f3a", d: "#3d8bff", l: "#8fd3ff", g: "#3ccb5e", G: "#2e8b3a", h: "#f5b971",
  t: "#e2a46a", c: "#fff2b3", n: "#2b2b44", b: "#a0603a",
};
const MINI_PAL: Record<string, string> = {
  k: "#1b1b2f", s: "#e8e8f0", S: "#b8b8c8", n: "#111122", w: "#ffffff", p: "#ff7fa0", a: "#8a8fa8", d: "#3d8bff",
  l: "#8fd3ff", y: "#ffd23f", o: "#ff9f1c", r: "#ff4f6d", g: "#3ccb5e", G: "#2e8b3a", b: "#a0603a", B: "#6b3b1f",
  t: "#e2a46a", c: "#fff2b3", m: "#9aa0b5", P: "#ffc4d6", v: "#c77dff",
  h: "#f5b971", i: "#e9b949", R: "#c21f3a",
};
export const SHELLS: Record<string, [string, string]> = {
  sky: ["#cde9ff", "#86bde8"], matcha: ["#d5edb8", "#93c26c"], sakura: ["#ffd9e6", "#ff9fbf"], gold: ["#ffe58a", "#d9a92e"],
};

// ------------------------------------------------------------------------------------- wardrobe

interface WearArt {
  dy: number;
  rows: string[];
  flat?: boolean;
  shellColor?: boolean;
}
/** Bust wardrobe: 20 columns aligned with the box; `dy` = rows from the box top. */
const WEAR_ART: Record<string, WearArt> = {
  leaf: { dy: -5, rows: ["..........gg........", "......gg..gGg.......", ".....gGgg.g.........", "........ggg.........", ".........g.........."] },
  hachimaki: { dy: -2, rows: [".ww.................", "..ww................", "....................", "wwwwwwwwwrrwwwwwwwww", "wwwwwwwwwrrwwwwwwwww"] },
  catears: { dy: -4, rows: ["..s..............s..", "..ss............ss..", "..sPs..........sPs..", "..sPPs........sPPs.."], shellColor: true },
  straw: { dy: -5, rows: ["......hhthhhhh......", ".....hhhhhhthhh.....", ".....hthhhhhhhh.....", ".....rrrrrrrrrr.....", "hhhhhthhhhhhhthhhhhh", ".hhhhhhhhthhhhhhhhh."] },
  santa: { dy: -6, rows: ["...............ww...", "............rrrww...", "..........rrrrr.....", ".......rrrrrrrr.....", ".....rrrrrrrrrrr....", "..wwwwwwwwwwwwwwww..", "..wwwwwwwwwwwwwwww.."] },
  nonla: { dy: -5, rows: [".........cc.........", "........cccc........", "......cchccccc......", ".....ccccccchcc.....", "...cchccccccccccc...", ".ccccccchccccccchcc.", "cccccccccccccccccccc"] },
  grad: { dy: -5, rows: ["........nnnn........", "..nnnnnnnnnnnnnnnn..", "....nnnnnnnnnnnnnny.", ".....nnnnnnnnnn...y.", ".....nnnnnnnnnn...y.", "..................yy"] },
  crown: { dy: -5, rows: ["....y....yy....y....", "....yy..yyyy..yy....", "....yyyyyyyyyyyy....", "....yryyydyyyyry....", "....iiiiiiiiiiii...."] },
  glasses: { dy: 4, flat: true, rows: ["....iiiiii.iiiiii...", "....i....iii....i...", "....i....i.i....i...", "....i....i.i....i...", "....iiiiii.iiiiii..."] },
  bandaid: { dy: 8, flat: true, rows: ["..............hh....", ".............hch....", "............hh......"] },
  bow: { dy: 12, rows: ["......rr....rr......", "......rrrRRrrr......", "......rr....rr......"] },
  scarf: { dy: 12, rows: ["rrrrrrrrrrrrrrrrrrrr", "RRrRRrRRrRRrRRrRRrRR", "...rr...............", "...rR...............", "...rr..............."] },
  bell: { dy: 13, rows: ["rrrrrrrrrrrrrrrrrrrr", ".........yy.........", "........yyyy........", ".........kk........."] },
};
/** Mini wardrobe: 16 columns, column 0 = one column left of the head; `dy` = rows from the head top. */
const MINI_WEAR: Record<string, WearArt> = {
  leaf: { dy: -4, rows: ["........gg......", "......ggGg......", ".......gg.......", "........g......."] },
  hachimaki: { dy: -2, rows: ["..w.............", "...w............", "................", ".wwwwwwrrwwwwww."] },
  catears: { dy: -3, rows: ["..s..........s..", "..ss........ss..", "..sPs......sPs.."], shellColor: true },
  straw: { dy: -4, rows: ["......hhth......", ".....hhhhhh.....", ".....rrrrrr.....", ".hhhhthhhhhhth.."] },
  santa: { dy: -5, rows: ["............ww..", "..........rrww..", ".......rrrrr....", ".....rrrrrrrr...", "..wwwwwwwwwwww.."] },
  nonla: { dy: -4, rows: [".......cc.......", ".....cchccc.....", "...cccccchccc...", ".cccccccccccccc."] },
  grad: { dy: -4, rows: ["......nnnn......", ".nnnnnnnnnnnnny.", "...nnnnnnnnn.y..", "...nnnnnnnnn.yy."] },
  crown: { dy: -3, rows: ["....y..yy..y....", "....yyyyyyyy....", "....yryydyry...."] },
  glasses: { dy: 2, flat: true, rows: ["....iiiiiiii....", "....i..ii..i....", "....i..ii..i....", "....iiiiiiii...."] },
  bandaid: { dy: 5, flat: true, rows: ["..........hh....", ".........hch...."] },
  bow: { dy: 9, rows: [".....rr..rr.....", ".....rrRRrr.....", ".....rr..rr....."] },
  scarf: { dy: 9, rows: ["..rrrrrrrrrrrr..", "..RRrRRrRRrRRr..", "...rr...........", "...rR..........."] },
  bell: { dy: 9, rows: ["...rrrrrrrrrr...", ".......yy.......", "......yyyy......", ".......kk......."] },
};
export const WEAR_IDS = Object.keys(WEAR_ART);
export const SHELL_IDS = Object.keys(SHELLS);

/** Ink outline around a wear item (one row more above and below), like the add-on does. */
function outlined(a: WearArt): { dy: number; rows: string[]; shellColor?: boolean } {
  if (a.flat) return { dy: a.dy, rows: a.rows, shellColor: a.shellColor };
  const w = a.rows[0].length;
  const g = [".".repeat(w), ...a.rows, ".".repeat(w)].map((r) => r.split(""));
  const out = g.map((r) => r.slice());
  for (let j = 0; j < g.length; j++) {
    for (let i = 0; i < w; i++) {
      if (g[j][i] !== ".") continue;
      const near =
        (g[j - 1] && g[j - 1][i] !== ".") || (g[j + 1] && g[j + 1][i] !== ".") ||
        (i > 0 && g[j][i - 1] !== ".") || (i < w - 1 && g[j][i + 1] !== ".");
      if (near) out[j][i] = "k";
    }
  }
  return { dy: a.dy - 1, rows: out.map((r) => r.join("")), shellColor: a.shellColor };
}
const wearCache = new Map<string, { dy: number; rows: string[]; shellColor?: boolean }>();
function wearRows(table: Record<string, WearArt>, tag: string, id: string | undefined) {
  if (!id || !table[id]) return null;
  const key = `${tag}:${id}`;
  let hit = wearCache.get(key);
  if (!hit) {
    hit = outlined(table[id]);
    wearCache.set(key, hit);
  }
  return hit;
}

function spr(ctx: Ctx, rows: string[], x: number, y: number, s: number, pal: Record<string, string>, flip = false): void {
  const w = rows[0]?.length ?? 0;
  for (let j = 0; j < rows.length; j++) {
    for (let i = 0; i < rows[j].length; i++) {
      const c = rows[j][i];
      if (c === ".") continue;
      ctx.fillStyle = pal[c] ?? c;
      const col = flip ? w - 1 - i : i;
      ctx.fillRect(Math.round((x + col) * s), Math.round((y + j) * s), s, s);
    }
  }
}

// ------------------------------------------------------------------------------------- bust

export const BUST_W = 20;
export const BUST_H = 17;
/** Rows kept free above the box for hats. */
export const BUST_TOP = 7;

const BOUNCY = new Set<MascotMood>(["happy", "star", "heart", "wink", "kira", "cool"]);

/** Talking mouth frame at time t: open, half, closed (a little irregular so it reads as speech). */
export function talkMouth(t: number): "open" | "half" | "closed" {
  const seq = ["open", "half", "closed", "open", "closed", "half"] as const;
  return seq[Math.floor(t * 9) % seq.length];
}

/**
 * The bust at (x, y) = top-left of the hat area, `s` screen px per art pixel. The whole drawing is
 * BUST_W x (BUST_TOP + BUST_H) art pixels.
 */
export function drawStackChanBust(
  ctx: Ctx,
  x: number,
  y: number,
  s: number,
  o: { mood?: string; t: number; talking?: boolean; wear?: MascotWear; lookX?: number }
): void {
  const mood = (MASCOT_MOODS as readonly string[]).includes(o.mood ?? "") ? (o.mood as MascotMood) : "idle";
  const now = o.t * 1000;
  const lx = o.lookX ?? 0;
  const wear = o.wear ?? {};
  const shell = wear.shell ? SHELLS[wear.shell] : undefined;
  const dot = (px: number, py: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(px * s), Math.round(py * s), s, s);
  };
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y + BUST_TOP * s));

  let bob = 0;
  if (BOUNCY.has(mood) || o.talking) bob = Math.floor(now / 160) % 2;
  else if (mood === "sleep") bob = Math.floor(now / 900) % 2;
  const oy = 1 - bob;

  // box
  ctx.fillStyle = C.k;
  ctx.fillRect(1 * s, oy * s, (BUST_W - 2) * s, BUST_H * s - s);
  ctx.fillRect(0, (oy + 1) * s, BUST_W * s, (BUST_H - 3) * s);
  ctx.fillStyle = shell ? shell[0] : C.s;
  ctx.fillRect(1 * s, (oy + 1) * s, (BUST_W - 2) * s, (BUST_H - 3) * s);
  ctx.fillStyle = shell ? shell[1] : C.S;
  ctx.fillRect(1 * s, (oy + BUST_H - 3) * s, (BUST_W - 2) * s, s);
  // screen
  const SCREEN = "#111122";
  ctx.fillStyle = SCREEN;
  ctx.fillRect(3 * s, (oy + 3) * s, (BUST_W - 6) * s, (BUST_H - 8) * s);

  const W = C.w;
  const e1 = 6 + lx;
  const e2 = 12 + lx;
  const ey = oy + 5;
  const blink = mood === "idle" && now % 4200 < 140;

  if (mood === "sleep") {
    for (let i = 0; i < 3; i++) {
      dot(e1 - 1 + i, ey + 2, W);
      dot(e2 - 1 + i, ey + 2, W);
    }
    dot(9, ey + 5, W);
    dot(10, ey + 5, W);
  } else if (mood === "happy") {
    for (const ex of [e1, e2]) {
      dot(ex - 1, ey + 2, W);
      dot(ex, ey + 1, W);
      dot(ex + 1, ey + 2, W);
    }
    dot(8, ey + 5, W); dot(11, ey + 5, W); dot(9, ey + 6, W); dot(10, ey + 6, W);
    dot(4, ey + 4, C.p); dot(15, ey + 4, C.p);
  } else if (mood === "star" || mood === "kira") {
    for (const ex of [e1, e2]) {
      dot(ex, ey, C.y); dot(ex - 1, ey + 1, C.y); dot(ex, ey + 1, W); dot(ex + 1, ey + 1, C.y); dot(ex, ey + 2, C.y);
    }
    if (mood === "star") {
      for (let m = 8; m <= 11; m++) dot(m, ey + 5, W);
      dot(9, ey + 6, C.p); dot(10, ey + 6, C.p);
      dot(4, ey + 4, C.p); dot(15, ey + 4, C.p);
    } else {
      dot(8, ey + 5, W); dot(11, ey + 5, W); dot(9, ey + 6, W); dot(10, ey + 6, W);
      const tw = Math.floor(now / 220) % 4;
      dot([3, 16, 16, 3][tw], oy + [3, 3, 11, 11][tw], C.y);
    }
  } else if (mood === "sad") {
    dot(5, ey, W); dot(6, ey + 1, W); dot(5, ey + 2, W);
    dot(13, ey, W); dot(12, ey + 1, W); dot(13, ey + 2, W);
    dot(8, ey + 6, W); dot(9, ey + 5, W); dot(10, ey + 6, W); dot(11, ey + 5, W);
    dot(17, oy + 2, C.l); dot(17, oy + 3, C.d);
  } else if (mood === "think") {
    dot(e1, ey + 2, W); dot(e1 + 1, ey + 2, W);
    dot(e2, ey + 1, W); dot(e2 + 1, ey + 1, W); dot(e2, ey + 2, W); dot(e2 + 1, ey + 2, W);
    dot(9, ey + 5, W);
  } else if (mood === "heart") {
    for (const ex of [e1, e2]) {
      dot(ex - 1, ey, C.p); dot(ex + 1, ey, C.p);
      for (let hx = -1; hx <= 1; hx++) dot(ex + hx, ey + 1, C.r);
      dot(ex, ey + 2, C.r);
    }
    dot(8, ey + 5, W); dot(11, ey + 5, W); dot(9, ey + 6, W); dot(10, ey + 6, W);
    dot(4, ey + 4, C.p); dot(15, ey + 4, C.p);
  } else if (mood === "wink") {
    dot(e1 - 1, ey + 2, W); dot(e1, ey + 1, W); dot(e1 + 1, ey + 2, W);
    for (let wr = 0; wr < 3; wr++) {
      dot(e2, ey + wr, W);
      dot(e2 + 1, ey + wr, W);
    }
    dot(8, ey + 5, W); dot(11, ey + 5, W); dot(9, ey + 6, W); dot(10, ey + 6, W);
    if (Math.floor(now / 300) % 2) dot(16, oy + 3, C.y);
  } else if (mood === "surprise") {
    for (const ex of [e1, e2]) {
      for (let sx = -1; sx <= 1; sx++) {
        dot(ex + sx, ey - 1, W);
        dot(ex + sx, ey + 2, W);
      }
      dot(ex - 1, ey, W); dot(ex - 1, ey + 1, W); dot(ex + 1, ey, W); dot(ex + 1, ey + 1, W);
    }
    dot(9, ey + 4, W); dot(10, ey + 4, W); dot(8, ey + 5, W); dot(11, ey + 5, W); dot(9, ey + 6, W); dot(10, ey + 6, W);
  } else if (mood === "cool") {
    for (let cx = 4; cx <= 15; cx++) dot(cx, ey, C.k);
    for (let cg = 4; cg <= 8; cg++) {
      dot(cg, ey + 1, C.k);
      dot(cg + 7, ey + 1, C.k);
    }
    dot(5, ey, "#5a5a7a"); dot(12, ey, "#5a5a7a");
    for (let cz = 4; cz <= 15; cz++) dot(cz, ey - 1, "#3a3a55");
    dot(9, ey + 5, W); dot(10, ey + 5, W); dot(11, ey + 4, W);
  } else if (mood === "cry") {
    for (let ci = 0; ci < 3; ci++) {
      dot(e1 - 1 + ci, ey + 1, W);
      dot(e2 - 1 + ci, ey + 1, W);
    }
    const tf = Math.floor(now / 140) % 3;
    for (const ex of [e1, e2 + 1]) {
      dot(ex, ey + 2, C.l);
      dot(ex, ey + 3 + tf, C.d);
    }
    dot(8, ey + 6, W); dot(9, ey + 5, W); dot(10, ey + 5, W); dot(11, ey + 6, W);
  } else if (mood === "pout") {
    dot(e1 - 1, ey, W); dot(e1, ey + 1, W); dot(e1 - 1, ey + 2, W);
    dot(e2 + 2, ey, W); dot(e2 + 1, ey + 1, W); dot(e2 + 2, ey + 2, W);
    dot(8, ey + 5, W); dot(9, ey + 6, W); dot(10, ey + 5, W); dot(11, ey + 6, W);
    dot(4, ey + 4, C.r); dot(15, ey + 4, C.r);
  } else if (blink) {
    for (let b = 0; b < 2; b++) {
      dot(e1 + b, ey + 2, W);
      dot(e2 + b, ey + 2, W);
    }
    for (let q = 8; q <= 11; q++) dot(q, ey + 5, W);
  } else {
    for (let r = 0; r < 3; r++) {
      dot(e1, ey + r, W); dot(e1 + 1, ey + r, W);
      dot(e2, ey + r, W); dot(e2 + 1, ey + r, W);
    }
    for (let n = 8; n <= 11; n++) dot(n, ey + 5, W);
  }

  // talking: the mouth area of the screen flaps (eyes keep the mood)
  if (o.talking && mood !== "sleep" && mood !== "cool") {
    ctx.fillStyle = SCREEN;
    ctx.fillRect(7 * s, (ey + 4) * s, 6 * s, 3 * s);
    const m = talkMouth(o.t);
    if (m === "open") {
      for (let mx = 8; mx <= 11; mx++) {
        dot(mx, ey + 4, W);
        dot(mx, ey + 6, W);
      }
      dot(8, ey + 5, W); dot(11, ey + 5, W);
      dot(9, ey + 5, C.p); dot(10, ey + 5, C.p);
    } else if (m === "half") {
      dot(9, ey + 5, W); dot(10, ey + 5, W); dot(9, ey + 6, W); dot(10, ey + 6, W);
    } else {
      for (let mx = 8; mx <= 11; mx++) dot(mx, ey + 5, W);
    }
  }

  // wardrobe: neck -> face -> head
  for (const slot of ["neck", "face", "head"] as const) {
    if (slot === "face" && mood === "cool") continue;
    const a = wearRows(WEAR_ART, "bust", wear[slot]);
    if (!a) continue;
    const pal = a.shellColor ? { ...WEAR_PAL, s: shell ? shell[0] : C.s } : WEAR_PAL;
    spr(ctx, a.rows, 0, oy + a.dy, s, pal);
  }
  ctx.restore();
}

// ------------------------------------------------------------------------------------- mini (full body)

export const MINI_W = 24;
export const MINI_H = 16;
const HX = 5;
const BX = 8;
export type MiniPose = "stand" | "walk" | "wave" | "sit";
type MiniFace = "idle" | "blink" | "happy" | "o" | "sleep";

type Grid = string[][];
const grid = (w: number, h: number): Grid => Array.from({ length: h }, () => new Array<string>(w).fill("."));
function R(g: Grid, x: number, y: number, w: number, h: number, c: string): void {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (g[j] && i >= 0 && i < g[j].length) g[j][i] = c;
}
const D = (g: Grid, x: number, y: number, c: string) => R(g, x, y, 1, 1, c);

function miniHead(g: Grid, ox: number, oy: number, face: MiniFace): void {
  R(g, ox + 1, oy, 12, 1, "k"); R(g, ox, oy + 1, 14, 8, "k"); R(g, ox + 1, oy + 9, 12, 1, "k");
  R(g, ox + 1, oy + 1, 12, 7, "s"); R(g, ox + 1, oy + 8, 12, 1, "S");
  R(g, ox + 2, oy + 2, 10, 6, "n");
  const sx = ox + 2;
  const sy = oy + 2;
  if (face === "sleep") {
    R(g, sx + 1, sy + 2, 3, 1, "w"); R(g, sx + 6, sy + 2, 3, 1, "w"); R(g, sx + 4, sy + 4, 2, 1, "w");
  } else if (face === "blink") {
    R(g, sx + 2, sy + 2, 2, 1, "w"); R(g, sx + 6, sy + 2, 2, 1, "w"); R(g, sx + 4, sy + 4, 2, 1, "w");
  } else if (face === "happy") {
    for (const [x, y] of [[1, 2], [2, 1], [3, 2], [6, 2], [7, 1], [8, 2]]) D(g, sx + x, sy + y, "w");
    R(g, sx + 4, sy + 4, 2, 1, "w"); D(g, sx, sy + 3, "p"); D(g, sx + 9, sy + 3, "p");
  } else if (face === "o") {
    R(g, sx + 2, sy + 1, 2, 2, "w"); R(g, sx + 6, sy + 1, 2, 2, "w"); R(g, sx + 4, sy + 3, 2, 2, "w");
  } else {
    R(g, sx + 2, sy + 1, 2, 2, "w"); R(g, sx + 6, sy + 1, 2, 2, "w"); R(g, sx + 4, sy + 4, 2, 1, "w");
  }
}
function miniBody(g: Grid, oy: number): void {
  R(g, BX, oy, 8, 4, "k"); R(g, BX + 1, oy, 6, 2, "s"); R(g, BX + 1, oy + 2, 6, 1, "S");
}
function miniArm(g: Grid, side: -1 | 1, oy: number, pose: "down" | "mid" | "fwd" | "up"): void {
  const x = side < 0 ? BX - 1 : BX + 8;
  const xo = x + side;
  const tip = xo + side;
  let hand: [number, number];
  if (pose === "up") { D(g, x, oy, "a"); D(g, xo, oy - 1, "a"); hand = [tip, oy - 2]; }
  else if (pose === "mid") { D(g, x, oy, "a"); D(g, xo, oy, "a"); hand = [tip, oy - 1]; }
  else if (pose === "fwd") { D(g, x, oy + 1, "a"); D(g, xo, oy + 1, "a"); hand = [tip, oy + 1]; }
  else { D(g, x, oy, "a"); D(g, x, oy + 1, "a"); hand = [x, oy + 2]; }
  D(g, hand[0], hand[1], "k");
}
function miniFeet(g: Grid, oy: number, step: 0 | 1 | 2): void {
  const L = (x: number, dy: number) => { R(g, x, oy + dy, 4, 2, "k"); R(g, x + 1, oy + dy, 2, 1, "S"); };
  if (step === 1) { L(BX - 1, 0); L(BX + 4, -1); }
  else if (step === 2) { L(BX, -1); L(BX + 5, 0); }
  else { L(BX, 0); L(BX + 4, 0); }
}

const miniCache = new Map<string, string[]>();
/** Pixel rows of the mini StackChan (feet on the last row), facing right. */
export function miniRows(pose: MiniPose, frame: 0 | 1, face?: MiniFace): string[] {
  const key = `${pose}|${frame}|${face ?? ""}`;
  const hit = miniCache.get(key);
  if (hit) return hit;
  let g: Grid;
  if (pose === "sit") {
    g = grid(MINI_W, 14);
    miniHead(g, HX, 0, face ?? (frame ? "blink" : "idle"));
    miniBody(g, 10);
    R(g, BX + 6, 12, 5, 2, "k"); R(g, BX + 7, 12, 3, 1, "S");
    miniArm(g, -1, 10, "down"); miniArm(g, 1, 10, "down");
  } else {
    g = grid(MINI_W, MINI_H);
    const f: MiniFace = face ?? (pose === "wave" ? "happy" : frame && pose === "stand" ? "blink" : "idle");
    miniHead(g, HX, 0, f);
    miniBody(g, 10);
    miniFeet(g, 14, pose === "walk" ? (frame ? 1 : 2) : 0);
    if (pose === "wave") { miniArm(g, -1, 10, "down"); miniArm(g, 1, 10, frame ? "up" : "mid"); }
    else if (pose === "walk") { miniArm(g, -1, 10, frame ? "down" : "fwd"); miniArm(g, 1, 10, frame ? "fwd" : "down"); }
    else { miniArm(g, -1, 10, "down"); miniArm(g, 1, 10, "down"); }
  }
  const rows = g.map((r) => r.join(""));
  miniCache.set(key, rows);
  return rows;
}

/**
 * Full-body StackChan with its feet at (footX, footY), `s` px per art pixel. Faces right unless
 * `flipX`. Walk frames should come from the distance travelled (see people.ts).
 */
export function drawStackChanMini(
  ctx: Ctx,
  footX: number,
  footY: number,
  s: number,
  o: { pose: MiniPose; frame: 0 | 1; flipX?: boolean; wear?: MascotWear; face?: MiniFace }
): void {
  const rows = miniRows(o.pose, o.frame, o.face);
  const shell = o.wear?.shell ? SHELLS[o.wear.shell] : undefined;
  const pal = shell ? { ...MINI_PAL, s: shell[0], S: shell[1] } : MINI_PAL;
  const x0 = Math.round(footX / s - MINI_W / 2);
  const y0 = Math.round(footY / s - rows.length);
  const flip = !!o.flipX;
  spr(ctx, rows, x0, y0, s, pal, flip);
  // wardrobe over the head (head top-left = (HX, 0) in the grid; wear column 0 = HX - 1)
  for (const slot of ["neck", "face", "head"] as const) {
    const a = wearRows(MINI_WEAR, "mini", o.wear?.[slot]);
    if (!a) continue;
    const wpal = a.shellColor ? { ...MINI_PAL, s: pal.s } : MINI_PAL;
    const w = a.rows[0].length;
    // mirror the item around the head when the robot faces left
    const wx = flip ? x0 + MINI_W - (HX - 1) - w : x0 + HX - 1;
    spr(ctx, a.rows, wx, y0 + a.dy, s, wpal, flip);
  }
}

/** Line emote -> a fitting mascot mood (the line can also set `mascotMood` itself). */
export function moodForEmote(emote: string | undefined): MascotMood | undefined {
  const map: Record<string, MascotMood> = {
    sparkle: "kira", heart: "heart", question: "think", dots: "think", shock: "surprise",
    sweat: "sad", gloom: "cry", anger: "pout", note: "happy",
  };
  return emote ? map[emote] : undefined;
}
