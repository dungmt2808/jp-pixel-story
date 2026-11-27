/**
 * Full-body people in a wide shot (route B, and route A/C with sprite characters).
 *
 *   scene.people = { hachi: { kind: "dog", x: 206, face: "left", pose: "sit" }, ... }
 *   scene.cues   = [{ line: 0, people: [{ who: "hachi", walkTo: 228, speed: 22, then: "sit" }] }]
 *
 * Kinds: "dog" (Akita, palette by `age`, or `bronze` for the statue), "sensei" (old professor),
 * "person" (passer-by: coat colour + seed), or "sprite:<key>" (assets.sprites meta.json with
 * clips idle / walk / sit). A person's state at time t is a pure function of its definition and
 * the moves that already started, so exported videos are deterministic.
 */
import { clamp, mixc, R, SPRF, type Ctx } from "./proc/pixelKit";
import { drawSpriteFrame, frameAt, frameAtDistance, type SpriteSheet } from "./spriteAnimator";

export type Pose = "stand" | "walk" | "sit" | "run" | "jump";
export type Face = "left" | "right";

export interface PersonDef {
  kind: string;
  x: number;
  /** Ground line (feet), default 150. */
  y?: number;
  face?: Face;
  pose?: Pose;
  /** dog: 0 (puppy-gold) .. 1 (old, grey); person: coat colour. */
  age?: number;
  coat?: string;
  seed?: number;
  /** Starts invisible (appears with a cue `show`). */
  hidden?: boolean;
  /** Hidden while the scene's interaction runs (the player drags a stand-in). */
  hideWhileInteract?: boolean;
}

export interface PersonMove {
  who: string;
  /** Walk / run to this x (px per second `speed`, default 24). */
  walkTo?: number;
  /** Optional vertical destination paired with `walkTo` (ground depth change). */
  walkToY?: number;
  speed?: number;
  /** Pose once arrived (default "stand"); "exit" hides the person on arrival. */
  then?: Pose | "exit";
  /** Instant changes. */
  x?: number;
  y?: number;
  face?: Face;
  pose?: Pose;
  show?: boolean;
  /** Fade out over N seconds (a goodbye). */
  fadeOut?: number;
  /** Hop up and down for N seconds (joy). */
  hop?: number;
  /** Shiver ±1px horizontally for N seconds (cold, startled, low battery). */
  shiver?: number;
  /** Polite Japanese bow dip for N seconds. */
  bow?: number;
}

export interface PersonState {
  x: number;
  y: number;
  face: Face;
  pose: Pose;
  visible: boolean;
  alpha: number;
  /** Vertical hop offset in px (negative = up). */
  lift: number;
}

/** State of one person at time t, after the moves that started at `moves[i].time <= t`. */
export function personAt(def: PersonDef, moves: { move: PersonMove; time: number }[], t: number): PersonState {
  const s: PersonState = {
    x: def.x,
    y: def.y ?? 150,
    face: def.face ?? "right",
    pose: def.pose ?? "stand",
    visible: !def.hidden,
    alpha: 1,
    lift: 0,
  };
  for (const { move, time } of [...moves].sort((a, b) => a.time - b.time)) {
    if (time > t) break;
    if (move.show !== undefined) s.visible = move.show;
    if (move.x !== undefined) s.x = move.x;
    if (move.y !== undefined) s.y = move.y;
    if (move.face) s.face = move.face;
    if (move.pose) s.pose = move.pose;
    if (move.walkTo !== undefined || move.walkToY !== undefined) {
      s.visible = true;
      const fromX = s.x;
      const fromY = s.y;
      const toX = move.walkTo ?? fromX;
      const toY = move.walkToY ?? fromY;
      const speed = Math.max(1, move.speed ?? 24);
      const dist = Math.hypot(toX - fromX, toY - fromY);
      const dur = dist / speed;
      const k = dur === 0 ? 1 : clamp((t - time) / dur, 0, 1);
      s.x = fromX + (toX - fromX) * k;
      s.y = fromY + (toY - fromY) * k;
      if (toX !== fromX) s.face = toX > fromX ? "right" : "left";
      if (k < 1) {
        s.pose = speed > 40 ? "run" : "walk";
      } else if (move.then === "exit") {
        s.visible = false;
      } else {
        s.pose = move.then ?? "stand";
      }
    }
    if (move.fadeOut) s.alpha = 1 - clamp((t - time) / move.fadeOut, 0, 1);
    if (move.hop) {
      const age = t - time;
      if (age < move.hop) s.lift = -Math.round(Math.abs(Math.sin(age * 10)) * 4);
    }
    if (move.bow) {
      const age = t - time;
      if (age < move.bow) {
        const u = age / move.bow;
        s.lift = u < 0.2 ? Math.round((u / 0.2) * 2) : u > 0.8 ? Math.round(((1 - u) / 0.2) * 2) : 2;
      }
    }
    if (move.shiver) {
      const age = t - time;
      if (age < move.shiver) s.x += Math.floor(age * 24) % 2 === 0 ? 1 : -1;
    }
  }
  if (s.alpha <= 0) s.visible = false;
  return s;
}

// ------------------------------------------------------------------ code-drawn cast (from Hachi)

const DOG_STAND = ["...........DD.D..", "...........DCDCD.", "..DD.......CCCCCC", ".D..D......CCECCn", ".D..D.....CCCCWWW", "..DCCCCCCCCCCWW..", "...CCCCCCCCCCWW..", "...CCCCCCCCCCW...", "...CC.C....CC.C..", "...CC.C....CC.C..", "...kk.k....kk.k.."];
const DOG_WALK = ["...........DD.D..", "...........DCDCD.", "..DD.......CCCCCC", ".D..D......CCECCn", ".D..D.....CCCCWWW", "..DCCCCCCCCCCWW..", "...CCCCCCCCCCWW..", "...CCCCCCCCCCW...", "....CC.C..CC.C...", "...C..C..C...C...", "..kk..k..kk..k..."];
const DOG_SIT = ["........DD.D..", "........DCDCD.", "........CCCCCC", "........CCECCn", ".......CCCCWWW", "..DD..CCCCWW..", ".D..DCCCCCWW..", ".D..CCCCCCW...", "..DCCCCCCCW...", "...CCCCCCCC...", "...CCCCC.CC...", "...kkkkk.kk..."];
export const BRONZE = { C: "#7a8f6a", D: "#55684c", W: "#9aae8a", k: "#3a4634", E: "#2a3428", n: "#2a3428" };
const dogPal = (age: number) => ({
  C: mixc("#e3b77e", "#d9cdb8", age),
  D: mixc("#b9854a", "#a89a84", age),
  W: "#f6eedd",
  k: "#2a1d16",
  E: "#1b1410",
  n: "#1b1410",
});
const PROF = ["..kkkk..", ".kkkkkk.", "kkkkkkkk", "..SSSS..", "..SESS..", "..SSSS..", "...SS...", "..SSSS..", ".GGWWGG.", "GGGWWGGG", "GGGWRGGG", "GGGWWGGG", "GGGGGGGG", "SGGGGGGS", ".GGGGGG.", ".GG..GG.", ".GG..GG.", ".GG..GG.", ".GG..GG.", ".kk..kk."];
const PPAL = { k: "#1b1c22", S: "#d9a27c", E: "#2a1d16", G: "#3b3f4a", W: "#efe6d4", R: "#8e1f18" };

/** Approximate size of a person (for emotes, camera focus, tap spots). */
export function personBox(kind: string, sprites?: Record<string, SpriteSheet>): { w: number; h: number } {
  if (kind === "dog") return { w: 17, h: 12 };
  if (kind === "sensei") return { w: 9, h: 21 };
  if (kind === "person") return { w: 8, h: 23 };
  const sheet = kind.startsWith("sprite:") ? sprites?.[kind.slice(7)] : undefined;
  // a sprite's feet are its pivot: the figure fills the frame above it
  if (sheet) return { w: sheet.meta.frameWidth, h: sheet.meta.pivot.y };
  return { w: 24, h: 40 };
}

function drawDog(c: Ctx, s: PersonState, def: PersonDef, t: number, bronze: boolean): void {
  const walking = s.pose === "walk" || s.pose === "run";
  const fr = Math.floor(t * (s.pose === "run" ? 12 : 8));
  const rows = s.pose === "sit" ? DOG_SIT : walking && fr % 2 ? DOG_WALK : DOG_STAND;
  const w = rows[0].length;
  const x = Math.round(s.x - w / 2);
  const base = Math.round(s.y + s.lift);
  if (!bronze) R(c, x + 2, s.y, w - 3, 1, "rgba(0,0,0,.25)");
  SPRF(c, rows, x, base - rows.length, bronze ? BRONZE : dogPal(def.age ?? 0), s.face === "left");
}

function drawSensei(c: Ctx, s: PersonState, t: number): void {
  const walking = s.pose === "walk" || s.pose === "run";
  const bob = walking ? Math.round(Math.abs(Math.sin(t * 10))) : 0;
  const x = Math.round(s.x - 4);
  const base = Math.round(s.y + s.lift);
  R(c, x, s.y, 9, 1, "rgba(0,0,0,.25)");
  SPRF(c, PROF, x, base - 20 - bob, PPAL, s.face === "right");
  // briefcase in the leading hand
  R(c, s.face === "right" ? x + 8 : x - 3, base - 8 - bob, 3, 4, "#6b4428");
}

function drawPasserby(c: Ctx, s: PersonState, def: PersonDef, t: number): void {
  const walking = s.pose === "walk" || s.pose === "run";
  const seed = def.seed ?? 0.3;
  const bob = walking ? Math.round(Math.abs(Math.sin(t * 9 + seed * 4))) : 0;
  const x = Math.round(s.x);
  const y = Math.round(s.y + s.lift) - 23 - bob;
  const hat = seed < 0.5 ? "#15171c" : "#2b2420";
  R(c, x - 2, y, 6, 2, hat);
  R(c, x - 3, y + 2, 8, 1, hat);
  R(c, x - 1, y + 3, 4, 4, "#b88a6a");
  R(c, x, y + 5, 1, 1, "#7a5a44");
  R(c, x - 3, y + 7, 8, 10, def.coat ?? "#3b3f4a");
  R(c, x - 3, y + 7, 1, 10, "rgba(0,0,0,.25)");
  const step = walking ? Math.round(Math.sin(t * 9 + seed * 4)) : 0;
  R(c, x - 2 + step, y + 17, 2, 6, "#1b1c22");
  R(c, x + 1 - step, y + 17, 2, 6, "#1b1c22");
}

/** Draw one person (sprite people use their meta clips: idle / walk / sit / run). */
export function drawPerson(
  c: Ctx,
  def: PersonDef,
  s: PersonState,
  t: number,
  sprites: Record<string, SpriteSheet>
): void {
  if (!s.visible) return;
  c.save();
  c.globalAlpha = s.alpha;
  if (def.kind === "dog" || def.kind === "bronze-dog") drawDog(c, s, def, t, def.kind === "bronze-dog");
  else if (def.kind === "sensei") drawSensei(c, s, t);
  else if (def.kind === "person") drawPasserby(c, s, def, t);
  else if (def.kind.startsWith("sprite:")) {
    const sheet = sprites[def.kind.slice(7)];
    if (sheet) {
      const clip = s.pose === "stand" ? "idle" : s.pose;
      const name = sheet.meta.clips[clip] ? clip : "idle";
      const moving = s.pose === "walk" || s.pose === "run";
      const frame = moving ? frameAtDistance(sheet.meta, name, s.x, t) : frameAt(sheet.meta, name, t);
      drawSpriteFrame(c, sheet, frame, Math.round(s.x), Math.round(s.y + s.lift), {
        flipX: s.face !== (sheet.meta.facing ?? "right"),
      });
    }
  }
  c.restore();
}
