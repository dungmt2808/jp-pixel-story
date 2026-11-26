/**
 * Pure rules of the data-driven CinemaStage (no DOM, unit-tested in Node):
 * scene kinds, cast resolution, which actors are visible and which one is "active".
 */
import type { CinemaActor, StoryData, StoryScene } from "../types/story";

export type CinemaSceneKind = "intro" | "checklist" | "dialogue" | "outro";
export type Side = "left" | "right";

export function cinemaSceneKind(type: StoryScene["type"]): CinemaSceneKind {
  switch (type) {
    case "cinema_intro":
      return "intro";
    case "cinema_checklist":
    case "cinema_explore":
      return "checklist";
    case "cinema_outro":
      return "outro";
    default:
      return "dialogue";
  }
}

/** Explicit `story.cast`, else the legacy convention: first two portraits, voice == portrait key. */
export function resolveCast(story: Pick<StoryData, "cast" | "assets">): Partial<Record<Side, CinemaActor>> {
  if (story.cast && (story.cast.left || story.cast.right)) return story.cast;
  const keys = Object.keys(story.assets?.portraits ?? {});
  const cast: Partial<Record<Side, CinemaActor>> = {};
  if (keys[0]) cast.left = { voice: keys[0], portrait: keys[0] };
  if (keys[1]) cast.right = { voice: keys[1], portrait: keys[1] };
  return cast;
}

export function visibleActors(scene: Pick<StoryScene, "type" | "actors">): Side[] {
  if (scene.actors) return scene.actors;
  const kind = cinemaSceneKind(scene.type);
  if (kind === "intro") return [];
  return kind === "outro" ? ["left"] : ["left", "right"];
}

/**
 * Talking / highlighted state of one actor. The listener stays lit while a narrator speaks;
 * whoever is not speaking during an on-stage cast member's line is dimmed. `onStage` lists the
 * sides currently visible: a line spoken by an off-stage character never dims the one on screen.
 */
export function actorFocus(
  side: Side,
  cast: Partial<Record<Side, CinemaActor>>,
  speakingVoice: string | null,
  onStage: Side[] = ["left", "right"]
): { talking: boolean; active: boolean; listening: boolean } {
  const me = cast[side];
  if (!me) return { talking: false, active: false, listening: false };
  const talking = speakingVoice !== null && speakingVoice === me.voice;
  const castVoices = onStage.map((s) => cast[s]?.voice).filter(Boolean);
  const castSpeaking = speakingVoice !== null && castVoices.includes(speakingVoice);
  return { talking, active: talking || !castSpeaking, listening: castSpeaking && !talking };
}

/** Backdrop reference for a scene: checklist override > scene.backdrop > legacy locationBadge. */
export function sceneBackdropRef(scene: Pick<StoryScene, "backdrop" | "locationBadge">, override: string | null): string {
  return override ?? scene.backdrop ?? scene.locationBadge ?? "";
}

/** Default stage x (pivot) for each side on the 320px virtual canvas. */
export function actorX(side: Side, actor: CinemaActor): number {
  return actor.x ?? (side === "left" ? 58 : 262);
}
