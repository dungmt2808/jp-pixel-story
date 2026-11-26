/**
 * Pure (DOM-free) helpers shared by every interactive stage.
 * Kept separate from the React hook so they can be unit-tested in Node.
 */

export interface StoryEvent {
  /** ms since the stage mounted (legacy field). */
  timeMs: number;
  /** Raw `performance.now()` when the event happened (the exporter aligns audio with this). */
  perfMs: number;
  type: "voice" | "scene" | "done";
  audioUrl?: string;
  durationSec?: number;
  lineId?: string;
  sceneIdx?: number;
}

declare global {
  interface Window {
    __JP_STORY_EVENTS__?: StoryEvent[];
    __JP_STORY_DONE__?: boolean;
    __JP_STAGE_READY__?: boolean;
    __JP_RECORD__?: boolean;
  }
}

/**
 * Deterministic recording mode (`?record=1`), used by the MP4 exporter together with a virtual
 * clock: voice clips are NOT played through the browser; the stage waits exactly `durationSec`
 * so timing never depends on autoplay policies or audio decoding speed.
 */
export function isRecordMode(search: string = typeof window !== "undefined" ? window.location.search : ""): boolean {
  if (typeof window !== "undefined" && window.__JP_RECORD__) return true;
  const v = new URLSearchParams(search).get("record");
  return v === "1" || v === "true";
}

/**
 * How long a voice line occupies the timeline when the clip cannot be (or is not) played:
 * always the real clip duration, never an arbitrary constant (the old 2 s fallback made
 * scenes advance while 9-15 s clips were still "speaking").
 */
export function voiceHoldMs(durationSec: number | undefined, minMs = 1200): number {
  const ms = Math.round((durationSec ?? 2.5) * 1000);
  return Math.max(minMs, ms);
}

export function logStoryEvent(
  ev: Omit<StoryEvent, "timeMs" | "perfMs">,
  stageStartMs: number,
  now: number = performance.now()
): StoryEvent {
  const full: StoryEvent = { ...ev, timeMs: Math.round(now - stageStartMs), perfMs: now };
  if (typeof window !== "undefined") {
    if (!window.__JP_STORY_EVENTS__) window.__JP_STORY_EVENTS__ = [];
    window.__JP_STORY_EVENTS__.push(full);
  }
  return full;
}

export interface TransitionState {
  active: boolean;
  phase: "out" | "in";
  amount: number;
  nextIdx: number;
}

export function idleTransition(): TransitionState {
  return { active: false, phase: "out", amount: 0, nextIdx: 0 };
}

/**
 * Advance a Bayer dither scene transition by `dt` seconds (mutates `tr`).
 * Returns the scene index to switch to exactly once, at the fully-covered midpoint.
 */
export function stepTransition(tr: TransitionState, dt: number, speed = 2.8): number | null {
  if (!tr.active) return null;
  if (tr.phase === "out") {
    tr.amount += dt * speed;
    if (tr.amount >= 1) {
      tr.amount = 1;
      tr.phase = "in";
      return tr.nextIdx;
    }
    return null;
  }
  tr.amount -= dt * speed;
  if (tr.amount <= 0) {
    tr.amount = 0;
    tr.active = false;
  }
  return null;
}

/** Largest integer upscale of a virtual canvas that covers `cssPx` device pixels (min 1). */
export function backingScale(cssWidth: number, virtualWidth: number, devicePixelRatio = 1): number {
  return Math.max(1, Math.ceil((cssWidth * devicePixelRatio) / virtualWidth));
}
