/** Registry of code-drawn sets (`backdrop: "set:<name>"`). Add a new world here once. */
import type { SetState } from "../cues";
import { KONBINI_SETS } from "./konbini";
import type { Ctx } from "./pixelKit";
import { SHIBUYA_SETS } from "./shibuya";

export const PROC_SETS: Record<string, (c: Ctx, st: SetState) => void> = {
  ...SHIBUYA_SETS,
  ...KONBINI_SETS,
};
