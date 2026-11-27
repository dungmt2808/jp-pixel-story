/**
 * Code-drawn sets of the late-night konbini story (the drawings of the former PixelStage, now
 * driven by `set` parameters and cues like every other route-B world).
 *
 *   set:konbini_skyline   Tokyo at 23:45            { title?: string }
 *   set:konbini_exterior  the shop front, slow push { }
 *   set:konbini_interior  aisles, the clerk, Minh   { }
 *   set:konbini_counter   checkout + scanner        { scanned: 1 (a cue after the drag) }
 *   set:konbini_closeup   the clerk's question      { effect: "microwave" | "polite_bow" (cue on a choice) }
 *   set:konbini_outro     happy ending              { warmed: 1 (cue `ifChoice: "warm_yes"`) }
 */
import type { SetState } from "../cues";
import {
  drawCloseupChoice,
  drawDragCounter,
  drawExteriorZoom,
  drawKonbiniInterior,
  drawOutroCelebrate,
  drawSkylineIntro,
} from "../pixelRenderer";
import type { Ctx } from "./pixelKit";

const on = (v: unknown) => v === true || (typeof v === "number" && v > 0);

export const KONBINI_SETS: Record<string, (c: Ctx, st: SetState) => void> = {
  konbini_skyline: (c, st) => drawSkylineIntro(c, st.t, typeof st.values.title === "string" ? st.values.title : ""),
  konbini_exterior: (c, st) => drawExteriorZoom(c, st.t, st.t),
  konbini_interior: (c, st) => drawKonbiniInterior(c, st.t, st.t),
  konbini_counter: (c, st) => {
    const scanned = on(st.values.scanned);
    const since = st.since.scanned;
    // the onigiri itself is the drag item of the scene's interaction, so the set keeps it off-frame
    drawDragCounter(c, st.t, {
      onigiriX: -100,
      onigiriY: -100,
      isDragging: false,
      scanned,
      scanFlash: scanned && since !== undefined ? Math.max(0, 1 - (st.t - since) * 1.6) : 0,
    });
  },
  konbini_closeup: (c, st) => {
    const effect = typeof st.values.effect === "string" ? st.values.effect : null;
    const since = st.since.effect;
    drawCloseupChoice(c, st.t, effect, effect && since !== undefined ? st.t - since : 0);
  },
  konbini_outro: (c, st) => drawOutroCelebrate(c, st.t, on(st.values.warmed)),
};
