/**
 * Scene cues: the world changes WITH the story, declared in data.
 *
 *   "cues": [
 *     { "line": 1, "set": { "train": "go" } },                     // when line 1 starts
 *     { "done": true, "delay": 1.0, "set": { "clock": 5.5 } },     // 1 s after the mini-game
 *     { "doneLine": 2, "set": { "weather": "rain" } },             // when the 3rd done-line starts
 *     { "at": 2.5, "people": [{ "who": "hachi", "walkTo": 228 }] } // 2.5 s into the scene
 *   ]
 *
 * Anchor times are recorded by the stage as they happen (scene clock), so the same data gives the
 * same timeline live and in exported videos. `set` values merge over `scene.set`; every key keeps
 * the time it changed and its previous value, so sets can blend (sky) or ease (clock hands).
 */
import type { PersonMove } from "./people";

export interface SceneCue {
  at?: number;
  line?: number;
  doneLine?: number;
  done?: boolean;
  /** Anchor: when this choice of the scene's mini-game was picked. */
  choice?: string;
  /** Filter: only when this choice was picked (in any scene so far). */
  ifChoice?: string;
  delay?: number;
  set?: Record<string, unknown>;
  people?: PersonMove[];
  /** Switch the scene backdrop ("bg:<key>" / "set:<name>" / "proc:<name>") at this moment. */
  backdrop?: string;
}

export interface CueAnchors {
  /** Scene time at which line i started. */
  lines: number[];
  /** Scene time at which done-line i started. */
  doneLines: number[];
  /** Scene time at which the interaction completed. */
  done?: number;
  /** Scene time each choice of this scene was picked. */
  choices?: Record<string, number>;
  /** Every choice id picked so far in the story (for `ifChoice`). */
  picked?: string[];
}

/** When a cue fires (scene seconds), or null while its anchor has not happened yet. */
export function cueTime(cue: SceneCue, a: CueAnchors): number | null {
  if (cue.ifChoice && !(a.picked ?? []).includes(cue.ifChoice)) return null;
  let base: number | undefined;
  if (cue.choice !== undefined) base = a.choices?.[cue.choice];
  else if (cue.line !== undefined) base = a.lines[cue.line];
  else if (cue.doneLine !== undefined) base = a.doneLines[cue.doneLine];
  else if (cue.done) base = a.done;
  else base = cue.at ?? 0;
  return base === undefined ? null : base + (cue.delay ?? 0);
}

export interface SetState {
  /** Current value of every key. */
  values: Record<string, unknown>;
  /** Scene time each key last changed (absent = from the start). */
  since: Record<string, number>;
  /** Value before the last change. */
  prev: Record<string, unknown>;
  /** Scene time. */
  t: number;
}

/** The set at scene time t: base values, then every fired cue's `set` in time order. */
export function setStateAt(base: Record<string, unknown> | undefined, cues: SceneCue[] | undefined, a: CueAnchors, t: number): SetState {
  const st: SetState = { values: { ...(base ?? {}) }, since: {}, prev: {}, t };
  const fired = (cues ?? [])
    .map((cue) => ({ cue, time: cueTime(cue, a) }))
    .filter((c): c is { cue: SceneCue; time: number } => c.time !== null && c.time <= t && !!c.cue.set)
    .sort((x, y) => x.time - y.time);
  for (const { cue, time } of fired) {
    for (const [k, v] of Object.entries(cue.set ?? {})) {
      st.prev[k] = st.values[k];
      st.values[k] = v;
      st.since[k] = time;
    }
  }
  return st;
}

/** Person moves of every resolvable cue (fired or not: `personAt` ignores future ones). */
export function cueMoves(cues: SceneCue[] | undefined, a: CueAnchors): { move: PersonMove; time: number }[] {
  const out: { move: PersonMove; time: number }[] = [];
  for (const cue of cues ?? []) {
    const time = cueTime(cue, a);
    if (time === null) continue;
    for (const move of cue.people ?? []) out.push({ move, time });
  }
  return out;
}

/** The backdrop at scene time t: the latest fired cue `backdrop`, else the scene's own. */
export function backdropAt(base: string, cues: SceneCue[] | undefined, a: CueAnchors, t: number): string {
  let best: { ref: string; time: number } | null = null;
  for (const cue of cues ?? []) {
    if (!cue.backdrop) continue;
    const time = cueTime(cue, a);
    if (time !== null && time <= t && (!best || time >= best.time)) best = { ref: cue.backdrop, time };
  }
  return best ? best.ref : base;
}
