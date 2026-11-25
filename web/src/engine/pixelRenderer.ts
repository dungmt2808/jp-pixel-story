/**
 * Procedural 320x200 Pixel Art Renderer for "夜のコンビニ (Yoru no Konbini)".
 * Locked strictly to the `midnight_tokyo` retro color palette for cohesive 16-bit JRPG visuals.
 */

export const VIRTUAL_W = 320;
export const VIRTUAL_H = 200;

const C = {
  ink: "#0b0e1a",
  navy: "#151b30",
  slate: "#222c4a",
  skyMid: "#37476e",
  mist: "#5a6f9c",
  moon: "#9ab0d6",
  cream: "#f5f1e6",
  gold: "#ffd875",
  amber: "#f29f3d",
  brick: "#c95c2e",
  woodDark: "#6e2d24",
  outline: "#3b2421",
  coral: "#e86a82",
  purple: "#9b4dca",
  mint: "#46b89d",
  teal: "#226e68",
  skin: "#f5cba7",
  skinShade: "#d99b72",
  brown: "#8c5a3c",
  hair: "#4d3326",
};

function px(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string
): void {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function drawSparkle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
  phase: number,
  color = C.cream
): void {
  const pulse = Math.sin(t * 4.5 + phase);
  if (pulse < -0.2) return;
  const r = pulse > 0.55 ? 2 : 1;
  px(ctx, x, y, 1, 1, color);
  if (r === 2) {
    px(ctx, x - 1, y, 3, 1, color);
    px(ctx, x, y - 1, 1, 3, color);
  }
}

/**
 * Draw crisp pixel art salmon onigiri (`鮭おにぎり`).
 */
export function drawOnigiri(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  scale = 1,
  steaming = false,
  t = 0
): void {
  const s = scale;
  const ox = Math.round(cx - 10 * s);
  const oy = Math.round(cy - 9 * s);

  // Dark outline + triangular rice body
  const rows = [
    { y: 0, x: 8, w: 4 },
    { y: 1, x: 7, w: 6 },
    { y: 2, x: 6, w: 8 },
    { y: 3, x: 5, w: 10 },
    { y: 4, x: 4, w: 12 },
    { y: 5, x: 3, w: 14 },
    { y: 6, x: 2, w: 16 },
    { y: 7, x: 2, w: 16 },
    { y: 8, x: 1, w: 18 },
    { y: 9, x: 1, w: 18 },
    { y: 10, x: 1, w: 18 },
    { y: 11, x: 1, w: 18 },
    { y: 12, x: 2, w: 16 },
    { y: 13, x: 3, w: 14 },
  ];

  // Outline
  for (const r of rows) {
    px(ctx, ox + (r.x - 1) * s, oy + r.y * s, (r.w + 2) * s, s, C.ink);
  }
  px(ctx, ox + 7 * s, oy - s, 6 * s, s, C.ink);
  px(ctx, ox + 3 * s, oy + 14 * s, 14 * s, s, C.ink);

  // White rice fill + subtle shading
  for (const r of rows) {
    px(ctx, ox + r.x * s, oy + r.y * s, r.w * s, s, C.cream);
    if (r.y >= 11) {
      px(ctx, ox + r.x * s, oy + r.y * s, r.w * s, s, C.moon);
    }
  }
  // Salmon peak hint
  px(ctx, ox + 8 * s, oy + 4 * s, 4 * s, 2 * s, C.coral);
  px(ctx, ox + 9 * s, oy + 3 * s, 2 * s, s, C.amber);

  // Crisp nori seaweed wrap at bottom center
  px(ctx, ox + 6 * s, oy + 8 * s, 8 * s, 6 * s, C.ink);
  px(ctx, ox + 7 * s, oy + 9 * s, 6 * s, 4 * s, C.navy);
  px(ctx, ox + 7 * s, oy + 9 * s, 1 * s, 4 * s, C.teal);

  // Warm steam puffs if heated
  if (steaming) {
    for (let i = 0; i < 3; i++) {
      const drift = ((t * 14 + i * 7) % 14);
      const sway = Math.round(Math.sin(t * 4 + i * 2) * 1.5);
      const sx = cx - 5 * s + i * 5 * s + sway;
      const sy = oy - 2 * s - drift;
      px(ctx, sx, sy, 2 * s, 2 * s, C.cream);
      px(ctx, sx + s, sy - 2 * s, s, 2 * s, C.moon);
    }
  }
}

/**
 * Draw Minh walking/standing full-body pixel sprite (facing right).
 */
function drawMinhSprite(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
  walking: boolean,
  thinking: boolean
): void {
  const bob = walking ? Math.round(Math.abs(Math.sin(t * 10)) * -2) : 0;
  const legSwing = walking ? Math.round(Math.sin(t * 10) * 4) : 0;
  const bx = Math.round(x);
  const by = Math.round(y + bob);

  // Shadow
  px(ctx, bx - 10, y + 48, 22, 4, "rgba(11,14,26,0.55)");

  // Legs (dark slacks)
  px(ctx, bx - 5 + legSwing, by + 34, 5, 13, C.navy);
  px(ctx, bx + 2 - legSwing, by + 34, 5, 13, C.slate);
  // Sneakers
  px(ctx, bx - 6 + legSwing, by + 46, 7, 3, C.cream);
  px(ctx, bx + 1 - legSwing, by + 46, 7, 3, C.cream);

  // Casual jacket & backpack strap
  px(ctx, bx - 8, by + 18, 17, 17, C.slate);
  px(ctx, bx - 7, by + 19, 15, 15, C.skyMid);
  // White shirt front
  px(ctx, bx + 1, by + 19, 5, 14, C.cream);
  // Backpack on back (left side)
  px(ctx, bx - 12, by + 19, 5, 13, C.woodDark);
  px(ctx, bx - 11, by + 20, 3, 11, C.brick);

  // Arm
  if (thinking) {
    // Hand on chin pose
    px(ctx, bx + 3, by + 20, 4, 8, C.skyMid);
    px(ctx, bx + 5, by + 16, 4, 5, C.skin);
  } else {
    const armSwing = walking ? -legSwing : 0;
    px(ctx, bx - 2 + armSwing, by + 20, 4, 11, C.skyMid);
    px(ctx, bx - 2 + armSwing, by + 30, 4, 3, C.skin);
  }

  // Neck & Head
  px(ctx, bx - 2, by + 14, 5, 5, C.skinShade);
  px(ctx, bx - 7, by + 1, 15, 14, C.skin);
  px(ctx, bx - 7, by + 12, 15, 3, C.skinShade);

  // Fluffy dark brown hair
  px(ctx, bx - 9, by - 2, 18, 6, C.hair);
  px(ctx, bx - 10, by + 1, 5, 9, C.hair);
  px(ctx, bx - 8, by - 3, 14, 3, C.brown);
  px(ctx, bx + 5, by + 2, 4, 3, C.hair);

  // Eye (blinks occasionally)
  const blink = Math.sin(t * 1.6) > 0.96;
  if (blink) {
    px(ctx, bx + 3, by + 8, 3, 1, C.ink);
  } else {
    px(ctx, bx + 3, by + 6, 3, 4, C.ink);
    px(ctx, bx + 4, by + 6, 1, 1, C.cream);
  }
  // Mouth
  px(ctx, bx + 4, by + 12, 3, 1, C.outline);
}

/**
 * Draw friendly konbini clerk behind the counter.
 */
function drawClerkSprite(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number
): void {
  const bx = Math.round(x);
  const by = Math.round(y);
  const nod = Math.round(Math.sin(t * 2.4) * 1);

  // Green konbini uniform vest + white collar
  px(ctx, bx - 8, by + 16, 16, 16, C.teal);
  px(ctx, bx - 7, by + 17, 14, 14, C.mint);
  px(ctx, bx - 3, by + 17, 6, 6, C.cream);
  // Name tag
  px(ctx, bx + 2, by + 22, 4, 2, C.gold);

  // Head
  px(ctx, bx - 6, by + 2 + nod, 12, 13, C.skin);
  // Bob haircut
  px(ctx, bx - 8, by - 1 + nod, 16, 6, C.outline);
  px(ctx, bx - 8, by + 3 + nod, 3, 10, C.outline);
  px(ctx, bx + 5, by + 3 + nod, 3, 10, C.outline);
  // Visor cap
  px(ctx, bx - 8, by - 2 + nod, 16, 3, C.mint);
  px(ctx, bx - 10, by + 1 + nod, 8, 2, C.teal);

  // Eyes (facing left toward customer)
  px(ctx, bx - 4, by + 7 + nod, 2, 3, C.ink);
  px(ctx, bx + 1, by + 7 + nod, 2, 3, C.ink);
  // Warm smile
  px(ctx, bx - 2, by + 12 + nod, 4, 1, C.brick);
}

/**
 * Draw Minh's portrait avatar onto any small canvas (used by CharacterCardModal & ReadingView).
 */
export function drawMinhPortrait(ctx: CanvasRenderingContext2D): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  px(ctx, 0, 0, w, h, C.slate);

  // Subtle Tokyo night window glow behind portrait
  px(ctx, 4, 4, w - 8, h - 8, C.navy);
  px(ctx, 8, 8, 5, 5, C.gold);
  px(ctx, w - 14, 12, 2, 2, C.cream);

  // Scale coordinates to 48x48 virtual grid
  const s = w / 48;
  const p = (x: number, y: number, rw: number, rh: number, c: string) =>
    px(ctx, x * s, y * s, rw * s, rh * s, c);

  // Shoulders
  p(10, 36, 28, 12, C.skyMid);
  p(19, 36, 10, 12, C.cream);
  p(10, 36, 3, 12, C.brick);

  // Neck & Head
  p(20, 31, 8, 6, C.skinShade);
  p(13, 11, 22, 22, C.skin);
  p(13, 29, 22, 4, C.skinShade);

  // Hair
  p(10, 6, 28, 8, C.hair);
  p(12, 4, 22, 4, C.brown);
  p(9, 10, 6, 14, C.hair);
  p(33, 10, 5, 11, C.hair);
  p(15, 12, 6, 4, C.hair);
  p(26, 11, 6, 3, C.hair);

  // Eyes
  p(17, 19, 4, 5, C.ink);
  p(18, 20, 1, 2, C.cream);
  p(28, 19, 4, 5, C.ink);
  p(29, 20, 1, 2, C.cream);

  // Eyebrows
  p(16, 16, 6, 2, C.outline);
  p(27, 16, 6, 2, C.outline);

  // Smile
  p(21, 27, 7, 2, C.brick);
}

// ============================================================================
// SCENE 1: TOKYO SKYLINE INTRO
// ============================================================================
export function drawSkylineIntro(
  ctx: CanvasRenderingContext2D,
  t: number,
  bannerTitle = "TOKYO 23:45"
): void {
  // Deep night sky gradient bands
  px(ctx, 0, 0, VIRTUAL_W, 50, C.ink);
  px(ctx, 0, 50, VIRTUAL_W, 45, C.navy);
  px(ctx, 0, 95, VIRTUAL_W, 45, C.slate);

  // Crescent Moon
  px(ctx, 28, 20, 14, 14, C.gold);
  px(ctx, 33, 18, 12, 12, C.ink);

  // Twinkling pixel stars
  const stars = [
    [68, 18], [110, 28], [156, 14], [218, 22], [268, 16], [295, 34], [86, 42], [244, 40],
  ];
  stars.forEach(([sx, sy], idx) => drawSparkle(ctx, sx, sy, t, idx * 1.1));

  // Distant Tokyo Tower silhouette
  const tx = 215;
  px(ctx, tx, 40, 2, 16, C.coral);
  px(ctx, tx - 2, 56, 6, 18, C.brick);
  px(ctx, tx - 5, 74, 12, 4, C.gold); // main observation deck glow
  px(ctx, tx - 6, 78, 14, 24, C.brick);
  px(ctx, tx - 11, 102, 24, 26, C.woodDark);
  px(ctx, tx - 4, 108, 10, 20, C.slate); // tower arch
  // Blinking red aviation beacon at top
  if (Math.sin(t * 4) > 0) {
    px(ctx, tx, 38, 2, 2, C.coral);
  }

  // Far city buildings
  const farBuildings = [
    [0, 92, 28, 50], [26, 82, 24, 60], [50, 96, 30, 46],
    [82, 76, 26, 66], [110, 88, 34, 54], [148, 84, 28, 58],
    [180, 96, 22, 46], [240, 80, 28, 62], [270, 90, 26, 52], [294, 78, 26, 64],
  ];
  farBuildings.forEach(([bx, by, bw, bh]) => {
    px(ctx, bx, by, bw, bh, C.skyMid);
    for (let wy = by + 6; wy < by + bh - 8; wy += 8) {
      for (let wx = bx + 4; wx < bx + bw - 5; wx += 7) {
        if ((wx + wy) % 3 === 0) {
          px(ctx, wx, wy, 3, 3, C.moon);
        }
      }
    }
  });

  // Foreground Tokyo rooftops + warm lit windows + glowing konbini strip
  const fgRoofs = [
    [0, 142, 60, 58], [56, 152, 54, 48], [108, 146, 62, 54],
    [168, 156, 56, 44], [222, 144, 52, 56], [272, 150, 48, 50],
  ];
  fgRoofs.forEach(([rx, ry, rw, rh], idx) => {
    px(ctx, rx, ry, rw, rh, C.ink);
    px(ctx, rx, ry, rw, 2, C.slate);
    // Warm apartment window
    px(ctx, rx + 10, ry + 14, 10, 10, idx % 2 === 0 ? C.gold : C.amber);
    px(ctx, rx + 14, ry + 14, 2, 10, C.ink);
    px(ctx, rx + 10, ry + 18, 10, 2, C.ink);
  });

  // Neon Konbini glow down on the street
  px(ctx, 118, 178, 42, 4, C.mint);
  px(ctx, 118, 182, 42, 3, C.amber);
  px(ctx, 118, 185, 42, 3, C.coral);

  // Crisp pixel title banner
  ctx.save();
  ctx.font = 'bold 18px "Press Start 2P", monospace';
  ctx.textAlign = "center";
  ctx.fillStyle = C.ink;
  ctx.fillText(bannerTitle, VIRTUAL_W / 2 + 2, 66);
  ctx.fillStyle = C.cream;
  ctx.fillText(bannerTitle, VIRTUAL_W / 2, 64);
  ctx.restore();
}

// ============================================================================
// SCENE 2: KONBINI EXTERIOR ZOOM
// ============================================================================
export function drawExteriorZoom(
  ctx: CanvasRenderingContext2D,
  t: number,
  elapsed: number
): void {
  // Smooth retro camera zoom toward the glowing entrance
  const zoom = 1 + Math.min(elapsed / 5.2, 1) * 0.45;
  ctx.save();
  ctx.translate(VIRTUAL_W / 2, VIRTUAL_H * 0.56);
  ctx.scale(zoom, zoom);
  ctx.translate(-VIRTUAL_W / 2, -VIRTUAL_H * 0.56);

  // Night sky
  px(ctx, 0, 0, VIRTUAL_W, 140, C.ink);
  px(ctx, 0, 140, VIRTUAL_W, 60, C.navy);
  drawSparkle(ctx, 42, 24, t, 0.3);
  drawSparkle(ctx, 276, 30, t, 2.1);

  // Sidewalk
  px(ctx, 0, 152, VIRTUAL_W, 48, C.slate);
  px(ctx, 0, 152, VIRTUAL_W, 3, C.mist);

  // Konbini building
  const bx = 76;
  const by = 48;
  const bw = 168;
  const bh = 104;
  px(ctx, bx, by, bw, bh, C.cream);
  px(ctx, bx, by, bw, 4, C.mist);

  // Iconic 3-stripe convenience store fascia (Mint / Amber / Coral)
  px(ctx, bx - 4, by + 6, bw + 8, 22, C.cream);
  px(ctx, bx - 4, by + 8, bw + 8, 4, C.mint);
  px(ctx, bx - 4, by + 14, bw + 8, 4, C.amber);
  px(ctx, bx - 4, by + 20, bw + 8, 4, C.coral);

  // Sign box
  px(ctx, bx + 44, by + 6, 80, 22, C.navy);
  px(ctx, bx + 45, by + 7, 78, 20, C.cream);
  ctx.fillStyle = C.teal;
  ctx.font = 'bold 10px "DotGothic16", monospace';
  ctx.textAlign = "center";
  ctx.fillText("24H コンビニ", bx + bw / 2, by + 21);

  // Glowing glass windows & automatic doors
  px(ctx, bx + 10, by + 38, 44, 52, C.gold);
  px(ctx, bx + 12, by + 40, 40, 48, C.amber);
  // Shelves silhouette visible inside window
  px(ctx, bx + 16, by + 56, 32, 4, C.woodDark);
  px(ctx, bx + 16, by + 70, 32, 4, C.woodDark);

  // Center sliding glass doors
  px(ctx, bx + 62, by + 38, 44, 66, C.navy);
  px(ctx, bx + 65, by + 41, 18, 60, C.gold);
  px(ctx, bx + 85, by + 41, 18, 60, C.gold);
  px(ctx, bx + 68, by + 46, 12, 48, C.cream);
  px(ctx, bx + 88, by + 46, 12, 48, C.cream);

  // Right window
  px(ctx, bx + 114, by + 38, 44, 52, C.gold);
  px(ctx, bx + 116, by + 40, 40, 48, C.amber);
  px(ctx, bx + 120, by + 56, 32, 4, C.woodDark);
  px(ctx, bx + 120, by + 70, 32, 4, C.woodDark);

  // Warm spill light onto sidewalk
  px(ctx, bx + 48, 155, 72, 18, "rgba(255,216,117,0.22)");

  // Street lamp on left with warm pixel halo
  px(ctx, 36, 68, 4, 88, C.ink);
  px(ctx, 32, 62, 12, 8, C.gold);
  px(ctx, 26, 56, 24, 20, "rgba(255,216,117,0.16)");

  // Glowing Japanese drink vending machine on right
  px(ctx, 258, 98, 28, 54, C.coral);
  px(ctx, 261, 102, 22, 24, C.cream);
  px(ctx, 263, 106, 4, 6, C.mint);
  px(ctx, 269, 106, 4, 6, C.amber);
  px(ctx, 275, 106, 4, 6, C.purple);
  px(ctx, 263, 116, 18, 4, C.skyMid);
  px(ctx, 263, 134, 18, 10, C.ink);

  ctx.restore();
}

// ============================================================================
// SCENE 3: INSIDE THE KONBINI (WALK-IN & DIALOGUE)
// ============================================================================
export function drawKonbiniInterior(
  ctx: CanvasRenderingContext2D,
  t: number,
  elapsed: number
): void {
  // Cozy warm interior wall
  px(ctx, 0, 0, VIRTUAL_W, 134, C.slate);
  px(ctx, 0, 0, VIRTUAL_W, 18, C.navy);
  // Hanging fluorescent ceiling lights
  px(ctx, 52, 14, 48, 4, C.cream);
  px(ctx, 180, 14, 62, 4, C.cream);
  px(ctx, 48, 18, 56, 14, "rgba(255,230,153,0.10)");
  px(ctx, 174, 18, 74, 14, "rgba(255,230,153,0.12)");

  // Checkered konbini floor
  px(ctx, 0, 134, VIRTUAL_W, 66, C.woodDark);
  for (let fy = 134; fy < 200; fy += 12) {
    for (let fx = 0; fx < VIRTUAL_W; fx += 16) {
      if (((fx / 16) + (fy / 12)) % 2 === 0) {
        px(ctx, fx, fy, 16, 12, C.brown);
      }
    }
  }

  // Night window on left showing distant Tokyo skyline
  px(ctx, 12, 32, 64, 62, C.outline);
  px(ctx, 15, 35, 58, 56, C.ink);
  px(ctx, 22, 44, 8, 8, C.gold);
  px(ctx, 25, 43, 6, 6, C.ink);
  px(ctx, 15, 68, 58, 23, C.navy);
  px(ctx, 36, 56, 14, 35, C.skyMid);
  px(ctx, 42, 64, 3, 3, C.gold);
  // Window mullions
  px(ctx, 43, 35, 2, 56, C.outline);
  px(ctx, 15, 62, 58, 2, C.outline);

  // Refrigerated Onigiri Shelf (center-left)
  px(ctx, 90, 44, 66, 90, C.cream);
  px(ctx, 93, 47, 60, 84, C.navy);
  // Shelf header
  px(ctx, 93, 47, 60, 10, C.mint);
  for (let sy = 68; sy <= 112; sy += 22) {
    px(ctx, 95, sy, 56, 3, C.cream);
    // Mini pixel onigiris lined up!
    for (let ox = 103; ox <= 143; ox += 14) {
      px(ctx, ox, sy - 9, 8, 8, C.cream);
      px(ctx, ox + 2, sy - 4, 4, 3, C.ink);
      px(ctx, ox + 3, sy - 7, 2, 2, C.coral);
    }
  }

  // Back microwave behind cashier
  px(ctx, 246, 66, 48, 30, C.cream);
  px(ctx, 250, 70, 28, 20, C.navy);
  px(ctx, 282, 72, 8, 14, C.slate);
  px(ctx, 284, 74, 4, 3, C.mint);

  // Clerk behind counter
  drawClerkSprite(ctx, 220, 74, t);

  // Cashier counter
  px(ctx, 174, 104, 134, 36, C.brown);
  px(ctx, 172, 102, 138, 6, C.gold);
  px(ctx, 174, 136, 134, 4, C.outline);
  // Register monitor
  px(ctx, 188, 84, 24, 18, C.ink);
  px(ctx, 190, 86, 20, 12, C.mint);
  px(ctx, 196, 100, 8, 3, C.slate);

  // Minh walks in smoothly from left and stops near counter
  const walkDuration = 1.65;
  const walkProgress = Math.min(elapsed / walkDuration, 1);
  const startX = -18;
  const endX = 114;
  const minhX = startX + (endX - startX) * walkProgress;
  const isWalking = walkProgress < 1;
  drawMinhSprite(ctx, minhX, 94, t, isWalking, !isWalking);
}

// ============================================================================
// SCENE 4: DRAG & DROP ONIGIRI TO REGISTER COUNTER
// ============================================================================
export interface DragSceneState {
  onigiriX: number;
  onigiriY: number;
  isDragging: boolean;
  scanned: boolean;
  scanFlash: number;
}

export function drawDragCounter(
  ctx: CanvasRenderingContext2D,
  t: number,
  state: DragSceneState
): void {
  // Deep teal-slate focus backdrop (homage to thầy Sang's experiment table!)
  px(ctx, 0, 0, VIRTUAL_W, 152, "#132c33");
  // Subtle pixel grid wallpaper dots
  for (let y = 16; y < 146; y += 16) {
    for (let x = 16; x < VIRTUAL_W; x += 16) {
      px(ctx, x, y, 1, 1, "#1e414a");
    }
  }

  // Wooden checkout counter surface
  px(ctx, 0, 150, VIRTUAL_W, 50, C.brown);
  px(ctx, 0, 150, VIRTUAL_W, 4, C.amber);
  px(ctx, 0, 166, VIRTUAL_W, 4, C.woodDark);

  // Left Shelf Label "A"
  px(ctx, 56, 98, 16, 16, C.cream);
  px(ctx, 57, 99, 14, 14, C.ink);
  ctx.fillStyle = C.cream;
  ctx.font = 'bold 10px "Press Start 2P", monospace';
  ctx.textAlign = "center";
  ctx.fillText("A", 64, 110);

  // Tray B (Checkout Register Scanner Pad)
  const bx = 212;
  const by = 136;
  // Scanner base
  px(ctx, bx - 44, by, 88, 16, C.slate);
  px(ctx, bx - 40, by + 2, 80, 10, state.scanned ? C.mint : C.navy);
  // Glowing red/mint scan line
  const scanColor = state.scanned
    ? C.mint
    : Math.sin(t * 7) > 0
      ? C.coral
      : C.amber;
  px(ctx, bx - 28, by + 6, 56, 2, scanColor);

  // Label "B · レジ"
  px(ctx, bx + 48, 86, 16, 16, C.cream);
  px(ctx, bx + 49, 87, 14, 14, C.ink);
  ctx.fillStyle = C.cream;
  ctx.fillText("B", bx + 56, 98);

  // Animated dotted arc guide from A to B (before scanned)
  if (!state.scanned) {
    for (let i = 0; i <= 10; i++) {
      const u = i / 10;
      const ax = 68 + (bx - 68) * u;
      const ay = 114 - Math.sin(u * Math.PI) * 58;
      const bright = Math.floor((t * 8 - i) % 10) === 0;
      px(ctx, ax, ay, 3, 3, bright ? C.gold : C.cream);
    }
    // Down arrow above Tray B
    const bob = Math.round(Math.sin(t * 6) * 2);
    px(ctx, bx - 1, 96 + bob, 2, 10, C.gold);
    px(ctx, bx - 4, 103 + bob, 8, 2, C.gold);
    px(ctx, bx - 2, 105 + bob, 4, 2, C.gold);
  }

  // Draw draggable Onigiri
  drawOnigiri(ctx, state.onigiriX, state.onigiriY, 2, false, t);

  // Scan flash + "ピッ！" retro feedback
  if (state.scanned) {
    if (state.scanFlash > 0) {
      px(ctx, 0, 0, VIRTUAL_W, VIRTUAL_H, `rgba(70,184,157,${state.scanFlash * 0.35})`);
    }
    drawSparkle(ctx, bx - 30, by - 28, t, 0.2, C.gold);
    drawSparkle(ctx, bx + 32, by - 24, t, 1.4, C.mint);
    ctx.fillStyle = C.gold;
    ctx.font = 'bold 14px "DotGothic16", monospace';
    ctx.textAlign = "center";
    ctx.fillText("ピッ！ ¥160", bx, by - 36);
  }
}

// ============================================================================
// SCENE 5: CLOSE-UP EXPRESSION & MICROWAVE ANIMATION
// ============================================================================
export function drawCloseupChoice(
  ctx: CanvasRenderingContext2D,
  t: number,
  effect: string | null,
  effectElapsed: number
): void {
  px(ctx, 0, 0, VIRTUAL_W, VIRTUAL_H, "#132934");

  if (effect === "microwave") {
    // Cute pixel microwave animation!
    const mx = 74;
    const my = 32;
    const mw = 172;
    const mh = 104;
    px(ctx, mx - 4, my - 4, mw + 8, mh + 8, C.ink);
    px(ctx, mx, my, mw, mh, C.cream);
    // Warm glowing interior window
    const pulse = 0.78 + Math.sin(t * 16) * 0.15;
    px(ctx, mx + 10, my + 12, 114, 78, C.ink);
    px(ctx, mx + 12, my + 14, 110, 74, `rgba(242,159,61,${pulse})`);
    // Turntable & rotating onigiri
    px(ctx, mx + 32, my + 74, 70, 6, C.woodDark);
    const sway = Math.round(Math.sin(t * 5) * 4);
    drawOnigiri(ctx, mx + 67 + sway, my + 56, 2, effectElapsed > 1.0, t);

    // Control panel on right
    px(ctx, mx + 132, my + 14, 30, 74, C.navy);
    const secsLeft = Math.max(0, 20 - Math.floor(effectElapsed * 10));
    ctx.fillStyle = C.mint;
    ctx.font = 'bold 9px "Press Start 2P", monospace';
    ctx.textAlign = "center";
    ctx.fillText(`0:${secsLeft.toString().padStart(2, "0")}`, mx + 147, my + 32);

    // Dial buttons
    px(ctx, mx + 138, my + 44, 18, 6, C.amber);
    px(ctx, mx + 138, my + 56, 18, 6, C.coral);
    px(ctx, mx + 138, my + 68, 18, 12, C.mint);

    // Heating progress bar
    const prog = Math.min(effectElapsed / 2.2, 1);
    px(ctx, 84, 146, 152, 8, C.ink);
    px(ctx, 86, 148, Math.round(148 * prog), 4, prog >= 1 ? C.mint : C.amber);

    if (prog >= 1) {
      drawSparkle(ctx, 64, 42, t, 0, C.gold);
      drawSparkle(ctx, 256, 48, t, 1.2, C.gold);
      ctx.fillStyle = C.gold;
      ctx.font = 'bold 14px "DotGothic16", monospace';
      ctx.fillText("チン！ あつあつ！", VIRTUAL_W / 2, 24);
    }
    return;
  }

  // Expressive Close-up Pixel Minh (homage to Perkin's surprised/thinking close-up!)
  const ox = 48;
  const oy = 18;
  // Shoulders
  px(ctx, ox - 10, oy + 124, 108, 60, C.skyMid);
  px(ctx, ox + 28, oy + 124, 34, 60, C.cream);
  px(ctx, ox - 6, oy + 124, 14, 60, C.brick);

  // Neck & Head
  px(ctx, ox + 28, oy + 104, 28, 22, C.skinShade);
  px(ctx, ox + 10, oy + 34, 72, 74, C.skin);
  px(ctx, ox + 10, oy + 96, 72, 12, C.skinShade);

  // Expressive hair locks
  px(ctx, ox + 2, oy + 14, 88, 28, C.hair);
  px(ctx, ox + 10, oy + 6, 70, 14, C.brown);
  px(ctx, ox - 2, oy + 26, 20, 48, C.hair);
  px(ctx, ox + 74, oy + 28, 18, 36, C.hair);
  px(ctx, ox + 18, oy + 36, 18, 14, C.hair);
  px(ctx, ox + 52, oy + 34, 20, 12, C.hair);

  // Eyes (wide & focused, with blink)
  const blink = Math.sin(t * 1.9) > 0.96;
  if (blink) {
    px(ctx, ox + 24, oy + 66, 14, 3, C.ink);
    px(ctx, ox + 58, oy + 66, 14, 3, C.ink);
  } else {
    px(ctx, ox + 24, oy + 56, 14, 16, C.cream);
    px(ctx, ox + 28, oy + 58, 10, 14, C.ink);
    px(ctx, ox + 30, oy + 60, 4, 4, C.cream);

    px(ctx, ox + 56, oy + 56, 14, 16, C.cream);
    px(ctx, ox + 60, oy + 58, 10, 14, C.ink);
    px(ctx, ox + 62, oy + 60, 4, 4, C.cream);
  }
  // Eyebrows
  px(ctx, ox + 22, oy + 48, 18, 4, C.outline);
  px(ctx, ox + 56, oy + 46, 18, 4, C.outline);

  // Cute anime sweat drop while thinking
  const dropY = Math.round((t * 8) % 6);
  px(ctx, ox + 82, oy + 44 + dropY, 4, 8, C.moon);
  px(ctx, ox + 83, oy + 42 + dropY, 2, 2, C.cream);

  // Mouth (surprised "o" or polite smile)
  if (effect === "polite_bow") {
    px(ctx, ox + 42, oy + 86, 16, 4, C.brick);
  } else {
    px(ctx, ox + 46, oy + 84, 10, 8, C.outline);
    px(ctx, ox + 48, oy + 86, 6, 4, C.coral);
  }

  // Thought bubble on the right with steaming onigiri + "?"
  px(ctx, 186, 22, 106, 62, C.ink);
  px(ctx, 189, 25, 100, 56, C.cream);
  drawOnigiri(ctx, 226, 56, 1.8, true, t);
  ctx.fillStyle = C.purple;
  ctx.font = 'bold 22px "Press Start 2P", monospace';
  ctx.textAlign = "center";
  ctx.fillText("?", 268, 64);

  // Small bubble dots leading to Minh
  px(ctx, 174, 86, 8, 8, C.cream);
  px(ctx, 162, 96, 5, 5, C.cream);
}

// ============================================================================
// SCENE 6: OUTRO CELEBRATION
// ============================================================================
export function drawOutroCelebrate(
  ctx: CanvasRenderingContext2D,
  t: number,
  warmed: boolean
): void {
  px(ctx, 0, 0, VIRTUAL_W, 146, "#142936");
  // Warm radial pixel halo behind the steaming onigiri
  const haloR = 44 + Math.round(Math.sin(t * 4) * 3);
  px(
    ctx,
    VIRTUAL_W / 2 - haloR,
    78 - haloR,
    haloR * 2,
    haloR * 2,
    "rgba(255,216,117,0.12)"
  );
  px(ctx, VIRTUAL_W / 2 - 28, 50, 56, 56, "rgba(255,216,117,0.18)");

  // Counter bottom
  px(ctx, 0, 146, VIRTUAL_W, 54, C.brown);
  px(ctx, 0, 146, VIRTUAL_W, 4, C.amber);

  // Happy Minh on left
  drawMinhSprite(ctx, 64, 96, t, false, false);

  // Big hero Onigiri center-stage with steam & sparkles!
  const bob = Math.round(Math.sin(t * 3.5) * 2);
  drawOnigiri(ctx, VIRTUAL_W / 2, 92 + bob, 2.8, warmed, t);

  // Happy clerk on right
  drawClerkSprite(ctx, 254, 114, t);

  // Celebratory pixel sparkles
  const pts = [
    [108, 42], [212, 38], [122, 108], [202, 102], [160, 26],
  ];
  pts.forEach(([sx, sy], idx) =>
    drawSparkle(ctx, sx, sy, t, idx * 0.9, idx % 2 === 0 ? C.gold : C.cream)
  );
}
