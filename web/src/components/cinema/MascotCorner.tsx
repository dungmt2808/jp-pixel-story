/**
 * The series mascot popping into the bottom-right corner with a speech bubble (scene `tips`).
 * It sits above the stage canvas (outside the camera), drawn on its own small pixel canvas.
 */
import { useEffect, useRef } from "react";
import { BUST_H, BUST_TOP, BUST_W, drawStackChanBust, type MascotWear } from "../../engine/mascot/stackchan";
import type { MascotTip } from "../../types/story";
import { RubyText } from "../RubyText";

/** Seconds a tip stays: from its length unless the story says. */
export function tipSeconds(tip: Pick<MascotTip, "text" | "ja" | "sec">): number {
  if (tip.sec) return tip.sec;
  const plain = (tip.text + (tip.ja ?? "")).replace(/\{([^|}]*)\|[^}]*\}/g, "$1");
  return Math.min(9, Math.max(3, 2.4 + plain.length * 0.055));
}

export function MascotCorner({
  tip,
  wear,
  showFurigana,
}: {
  tip: MascotTip;
  wear?: MascotWear;
  showFurigana: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    ctx.imageSmoothingEnabled = false;
    const start = performance.now();
    // talks while the bubble "is said", then keeps the mood
    const talkFor = Math.min(2.4, tipSeconds(tip) * 0.5) * 1000;
    let raf = 0;
    const draw = () => {
      const now = performance.now();
      ctx.clearRect(0, 0, c.width, c.height);
      drawStackChanBust(ctx, 0, 0, 1, { mood: tip.mood ?? "happy", t: now / 1000, talking: now - start < talkFor, wear });
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [tip, wear]);

  return (
    <div className="cine-mascot">
      <div className="cine-mascot-bubble">
        <div className="cine-mascot-text">
          <RubyText segments={tip.text} showFurigana={showFurigana} />
        </div>
        {tip.ja && (
          <div className="cine-mascot-ja">
            <RubyText segments={tip.ja} showFurigana={showFurigana} />
          </div>
        )}
      </div>
      <canvas ref={canvasRef} className="cine-mascot-bot" width={BUST_W} height={BUST_TOP + BUST_H} />
    </div>
  );
}

/** The tip said by a character standing in the shot: the bubble sits over its head at `at` (virtual px). */
export function MascotBubble({ tip, at, showFurigana }: { tip: MascotTip; at: [number, number]; showFurigana: boolean }) {
  const xPct = (at[0] / 320) * 100;
  const bottomPct = 100 - (at[1] / 200) * 100;
  // keep the bubble on the stage: anchored left of the speaker near the left edge, right near the right edge
  const align = xPct < 30 ? "left" : xPct > 70 ? "right" : "center";
  return (
    <div className={`cine-mascot-say ${align}`} style={{ left: `${xPct}%`, bottom: `${bottomPct}%` }}>
      <div className="cine-mascot-bubble">
        <div className="cine-mascot-text">
          <RubyText segments={tip.text} showFurigana={showFurigana} />
        </div>
        {tip.ja && (
          <div className="cine-mascot-ja">
            <RubyText segments={tip.ja} showFurigana={showFurigana} />
          </div>
        )}
      </div>
    </div>
  );
}
