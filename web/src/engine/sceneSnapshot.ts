/**
 * A still picture of a code-drawn scene (`set:<name>` + people), used as the reading-page chapter
 * illustration where there is no painted background to show. The scene is drawn as it looks at
 * the END of its script: every cue fired, people where they finish (the rain has started, the
 * statue is unveiled...), which is what the chapter text is about.
 */
import type { StoryData } from "../types/story";
import { cueMoves, setStateAt, type CueAnchors } from "./cues";
import { drawPerson, personAt } from "./people";
import { PROC_SETS } from "./proc/sets";

const cache = new Map<string, string>();

/** All anchors at time 0, judged far in the future: the final state of the scene. */
const SETTLED_AT = 600;

export function sceneSnapshotUrl(story: Pick<StoryData, "id" | "scenes">, sceneId: string | undefined): string | undefined {
  if (!sceneId || typeof document === "undefined") return undefined;
  const key = `${story.id}/${sceneId}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const scene = story.scenes.find((s) => s.id === sceneId);
  const ref = scene?.backdrop ?? "";
  if (!scene || !ref.startsWith("set:") || !PROC_SETS[ref.slice(4)]) return undefined;
  const c = document.createElement("canvas");
  c.width = 320;
  c.height = 200;
  const ctx = c.getContext("2d");
  if (!ctx) return undefined;
  ctx.imageSmoothingEnabled = false;
  const nLines = scene.lines.length;
  const inter = scene.interaction;
  const nDone = (inter?.doneLine ? 1 : 0) + (inter?.doneLines?.length ?? 0);
  const anchors: CueAnchors = {
    lines: Array.from({ length: nLines }, () => 0),
    doneLines: Array.from({ length: nDone }, () => 0),
    done: inter ? 0 : undefined,
  };
  try {
    PROC_SETS[ref.slice(4)](ctx, setStateAt(scene.set, scene.cues, anchors, SETTLED_AT));
    const moves = cueMoves(scene.cues, anchors);
    for (const [id, def] of Object.entries(scene.people ?? {})) {
      drawPerson(ctx, def, personAt(def, moves.filter((m) => m.move.who === id), SETTLED_AT), 0, {});
    }
    const url = c.toDataURL("image/png");
    cache.set(key, url);
    return url;
  } catch {
    return undefined;
  }
}
