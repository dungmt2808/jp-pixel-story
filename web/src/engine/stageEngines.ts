import type { StageEngine, StoryData } from "../types/story";

/** Pick the stage component from `story.engine` (legacy stories are inferred from scene types). */
export function resolveStageEngine(story: Pick<StoryData, "engine" | "scenes">): StageEngine {
  if (story.engine) return story.engine === "procedural" ? "pixel" : story.engine;
  const first = story.scenes[0]?.type ?? "";
  if (first.startsWith("tsuru_")) return "tsuru";
  if (first.startsWith("depato_")) return "depato";
  if (first.startsWith("cinema_")) return "cinema";
  if (first.startsWith("hybrid_")) return "hybrid";
  return "pixel";
}
