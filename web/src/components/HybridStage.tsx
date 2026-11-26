import { useCallback, useEffect, useRef, useState } from "react";
import { retroAudio } from "../audio/chiptune";
import { VIRTUAL_H, VIRTUAL_W } from "../engine/pixelRenderer";
import { drawPixelImage, drawPixelZoom } from "../engine/pixelScale";
import { useStageRuntime } from "../engine/useStageRuntime";
import type { MiniGameChoice, StoryData } from "../types/story";
import { CharacterCardModal } from "./CharacterCardModal";
import { RubyText } from "./RubyText";

interface HybridStageProps {
  story: StoryData;
  showFurigana: boolean;
  muted: boolean;
  autoplay: boolean;
  onOpenReading: () => void;
  onOpenDictation: () => void;
}

interface ToppingState {
  id: "chashu" | "egg" | "nori";
  labelJa: string;
  homeX: number;
  homeY: number;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  placed: boolean;
}

function createInitialToppings(): ToppingState[] {
  return [
    {
      id: "chashu",
      labelJa: "チャーシュー",
      homeX: 46,
      homeY: 96,
      x: 46,
      y: 96,
      targetX: 146,
      targetY: 112,
      placed: false,
    },
    {
      id: "egg",
      labelJa: "味玉",
      homeX: 46,
      homeY: 142,
      x: 46,
      y: 142,
      targetX: 175,
      targetY: 114,
      placed: false,
    },
    {
      id: "nori",
      labelJa: "のり",
      homeX: 272,
      homeY: 102,
      x: 272,
      y: 102,
      targetX: 162,
      targetY: 96,
      placed: false,
    },
  ];
}

function drawRainOverlay(ctx: CanvasRenderingContext2D, t: number): void {
  ctx.fillStyle = "rgba(167, 186, 217, 0.55)";
  for (let i = 0; i < 42; i++) {
    const sx = (i * 73) % VIRTUAL_W;
    const sy = (i * 41) % VIRTUAL_H;
    const y = (sy + t * 145) % VIRTUAL_H;
    const x = ((sx - t * 28) % VIRTUAL_W + VIRTUAL_W) % VIRTUAL_W;
    ctx.fillRect(Math.round(x), Math.round(y), 1, 5);
  }
  // Tiny puddle splash rings on cobblestone street
  ctx.fillStyle = "rgba(255, 227, 140, 0.45)";
  for (let i = 0; i < 5; i++) {
    const phase = (t * 2.2 + i * 0.7) % 1;
    const rx = 86 + ((i * 39) % 148);
    const ry = 160 + ((i * 11) % 24);
    const w = Math.round(2 + phase * 6);
    if (phase < 0.7) {
      ctx.fillRect(rx - Math.floor(w / 2), ry, w, 1);
    }
  }
}

function drawSteamWisps(
  ctx: CanvasRenderingContext2D,
  cx: number,
  baseY: number,
  t: number,
  count = 4,
  spread = 18
): void {
  for (let i = 0; i < count; i++) {
    const prog = (t * 0.55 + i * (1 / count)) % 1;
    const x =
      cx +
      (i - (count - 1) / 2) * (spread / Math.max(1, count - 1)) +
      Math.sin(t * 3.5 + i * 2) * 3;
    const y = baseY - prog * 28;
    const alpha = Math.sin(prog * Math.PI) * 0.65;
    ctx.fillStyle = `rgba(246, 238, 216, ${alpha.toFixed(2)})`;
    ctx.fillRect(Math.round(x), Math.round(y), 3, 3);
    ctx.fillRect(Math.round(x + 1), Math.round(y - 2), 2, 2);
  }
}

function drawSparkle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
  phase: number,
  color = "#ffe38c"
): void {
  const pulse = Math.sin(t * 5 + phase);
  if (pulse < 0) return;
  ctx.fillStyle = color;
  const rx = Math.round(x);
  const ry = Math.round(y);
  ctx.fillRect(rx, ry, 1, 1);
  if (pulse > 0.45) {
    ctx.fillRect(rx - 2, ry, 5, 1);
    ctx.fillRect(rx, ry - 2, 1, 5);
  }
}

export function HybridStage({
  story,
  showFurigana,
  muted,
  autoplay,
  onOpenReading,
  onOpenDictation,
}: HybridStageProps) {
  const {
    canvasRef,
    imagesRef,
    assetsReady,
    sceneIdx,
    activeLine,
    setActiveLine,
    sceneStartRef,
    speakingRef,
    playVoiceLine,
    stopVoice,
    goToScene,
    markDone,
    startLoop,
  } = useStageRuntime({ story, muted });
  const [lineFinished, setLineFinished] = useState(false);
  const [showCard, setShowCard] = useState(false);
  const [choiceTaken, setChoiceTaken] = useState<string | null>(null);

  // Scene 5 interactive draggable toppings state
  const toppingsRef = useRef<ToppingState[]>(createInitialToppings());
  const draggingIdRef = useRef<ToppingState["id"] | null>(null);
  const [placedCount, setPlacedCount] = useState(0);
  const [allToppingsDone, setAllToppingsDone] = useState(false);

  const [cursorPos, setCursorPos] = useState({ x: 50, y: 55, clicking: false });

  const currentScene = story.scenes[sceneIdx];

  // Scene script runner
  useEffect(() => {
    if (!assetsReady) return;
    let cancelled = false;
    sceneStartRef.current = performance.now();
    setLineFinished(false);
    setActiveLine(null);
    setChoiceTaken(null);

    if (currentScene.type === "hybrid_drag_toppings") {
      toppingsRef.current = createInitialToppings();
      draggingIdRef.current = null;
      setPlacedCount(0);
      setAllToppingsDone(false);
    }

    const run = async () => {
      if (currentScene.type === "hybrid_drag_toppings") {
        // Line plays after user drops all 3 toppings onto the bowl
        return;
      }

      for (const ln of currentScene.lines) {
        if (cancelled) return;
        await playVoiceLine(ln);
        if (cancelled) return;
        await new Promise((r) => window.setTimeout(r, 380));
      }

      if (cancelled) return;
      setLineFinished(true);

      if (currentScene.type === "hybrid_alley_zoom") {
        await new Promise((r) => window.setTimeout(r, 450));
        if (!cancelled) goToScene(sceneIdx + 1);
      }

      if (currentScene.type === "hybrid_outro_ramen") {
        retroAudio.playFanfare();
      }
    };

    void run();
    return () => {
      cancelled = true;
      stopVoice();
    };
  }, [assetsReady, currentScene, goToScene, playVoiceLine, sceneIdx, sceneStartRef, setActiveLine, stopVoice]);

  // Complete Drag Toppings mini-game (Scene 5)
  const triggerToppingsComplete = useCallback(async () => {
    setAllToppingsDone(true);
    retroAudio.playFanfare();
    const ln = currentScene.lines[0];
    if (ln) {
      await playVoiceLine(ln);
    }
    await new Promise((r) => window.setTimeout(r, 700));
    goToScene(sceneIdx + 1);
  }, [currentScene, goToScene, playVoiceLine, sceneIdx]);

  const placeTopping = useCallback(
    (tItem: ToppingState) => {
      if (tItem.placed) return;
      tItem.placed = true;
      tItem.x = tItem.targetX;
      tItem.y = tItem.targetY;
      draggingIdRef.current = null;
      retroAudio.playBeepScan();

      const count = toppingsRef.current.filter((x) => x.placed).length;
      setPlacedCount(count);
      if (count === toppingsRef.current.length) {
        void triggerToppingsComplete();
      }
    },
    [triggerToppingsComplete]
  );

  const handleSelectChoice = useCallback(
    async (choice: MiniGameChoice) => {
      if (choiceTaken) return;
      retroAudio.playClick();
      setChoiceTaken(choice.id);
      await playVoiceLine(choice.responseLine);
      await new Promise((r) => window.setTimeout(r, 650));
      goToScene(sceneIdx + 1);
    },
    [choiceTaken, goToScene, playVoiceLine, sceneIdx]
  );

  // Autoplay director for hands-free demo & Playwright MP4 recording
  useEffect(() => {
    if (!autoplay || !assetsReady) return;
    let cancelled = false;
    const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

    const clickAt = async (xPct: number, yPct: number) => {
      setCursorPos({ x: xPct, y: yPct, clicking: false });
      await sleep(500);
      if (cancelled) return;
      setCursorPos({ x: xPct, y: yPct, clicking: true });
      await sleep(160);
      if (cancelled) return;
      setCursorPos({ x: xPct, y: yPct, clicking: false });
    };

    const direct = async () => {
      if (currentScene.type === "hybrid_alley_intro" && lineFinished) {
        await sleep(500);
        if (cancelled) return;
        await clickAt(50, 86);
        if (!cancelled) {
          retroAudio.startBgm();
          retroAudio.playClick();
          goToScene(1);
        }
      } else if (
        (currentScene.type === "hybrid_counter_order" ||
          currentScene.type === "hybrid_noodle_firmness") &&
        lineFinished &&
        !choiceTaken &&
        currentScene.minigame
      ) {
        await sleep(550);
        if (cancelled) return;
        await clickAt(35, 86);
        if (!cancelled) {
          void handleSelectChoice(currentScene.minigame.choices[0]);
        }
      } else if (currentScene.type === "hybrid_drag_toppings" && !allToppingsDone) {
        await sleep(700);
        for (const tItem of toppingsRef.current) {
          if (cancelled || tItem.placed) continue;
          setCursorPos({
            x: (tItem.homeX / VIRTUAL_W) * 100,
            y: (tItem.homeY / VIRTUAL_H) * 100,
            clicking: false,
          });
          await sleep(450);
          if (cancelled) return;
          setCursorPos({
            x: (tItem.homeX / VIRTUAL_W) * 100,
            y: (tItem.homeY / VIRTUAL_H) * 100,
            clicking: true,
          });
          const steps = 18;
          for (let s = 0; s <= steps; s++) {
            if (cancelled) return;
            const u = s / steps;
            tItem.x = tItem.homeX + (tItem.targetX - tItem.homeX) * u;
            tItem.y =
              tItem.homeY +
              (tItem.targetY - tItem.homeY) * u -
              Math.sin(u * Math.PI) * 26;
            setCursorPos({
              x: (tItem.x / VIRTUAL_W) * 100,
              y: (tItem.y / VIRTUAL_H) * 100,
              clicking: true,
            });
            await sleep(28);
          }
          setCursorPos({
            x: (tItem.targetX / VIRTUAL_W) * 100,
            y: (tItem.targetY / VIRTUAL_H) * 100,
            clicking: false,
          });
          placeTopping(tItem);
          await sleep(320);
        }
      } else if (currentScene.type === "hybrid_outro_ramen" && lineFinished) {
        await sleep(1400);
        if (!cancelled) markDone();
      }
    };

    void direct();
    return () => {
      cancelled = true;
    };
  }, [
    allToppingsDone,
    assetsReady,
    autoplay,
    choiceTaken,
    currentScene,
    goToScene,
    handleSelectChoice,
    lineFinished,
    markDone,
    placeTopping,
  ]);

  // Main 60fps Hybrid Render Loop (AI/Mini-PixelLab PNGs + Live Canvas Atmospheric FX!)
  useEffect(() => {
    if (!assetsReady) return;

    const drawPortrait = (
      ctx: CanvasRenderingContext2D,
      key: string,
      x: number,
      y: number,
      size: number,
      talking: boolean,
      t: number
    ) => {
      const im = imagesRef.current[`p:${key}`];
      if (!im) return;
      const bounce = talking ? Math.round(Math.abs(Math.sin(t * 11)) * -2) : 0;
      drawPixelImage(ctx, im, Math.round(x), Math.round(y + bounce), size, size);
    };

    const drawChefBehindCounter = (
      ctx: CanvasRenderingContext2D,
      chefKey: string,
      t: number,
      talking: boolean
    ) => {
      const bgCounter = imagesRef.current["bg:counter"];
      if (bgCounter) {
        ctx.drawImage(bgCounter, 0, 0, VIRTUAL_W, VIRTUAL_H);
      }
      // Steam rising gently from copper broth pot on back stove
      drawSteamWisps(ctx, 124, 90, t, 3, 18);

      // Draw Master Chef standing behind counter top (y=124)
      const chefIm = imagesRef.current[`p:${chefKey}`];
      if (chefIm) {
        const bounce = talking ? Math.round(Math.abs(Math.sin(t * 10)) * -2) : 0;
        drawPixelImage(ctx, chefIm, 134, 48 + bounce, 86, 86);
      }

      // Re-draw foreground oak counter strip over Chef's lower torso so he sits naturally BEHIND it!
      if (bgCounter) {
        ctx.drawImage(
          bgCounter,
          0,
          123,
          VIRTUAL_W,
          VIRTUAL_H - 123,
          0,
          123,
          VIRTUAL_W,
          VIRTUAL_H - 123
        );
      }
    };

    return startLoop((ctx, now) => {
        const t = now / 1000;
        const elapsed = (now - sceneStartRef.current) / 1000;
        const imgs = imagesRef.current;

        switch (currentScene.type) {
          case "hybrid_alley_intro": {
            if (imgs["bg:alley"]) {
              ctx.drawImage(imgs["bg:alley"], 0, 0, VIRTUAL_W, VIRTUAL_H);
            }
            // Pulsing lantern warm halo
            const pulse = 0.08 + Math.sin(t * 3.2) * 0.04;
            ctx.fillStyle = `rgba(255, 212, 120, ${pulse.toFixed(3)})`;
            ctx.fillRect(204, 96, 36, 36);
            drawRainOverlay(ctx, t);
            drawSparkle(ctx, 82, 14, t, 0.3, "#f6eed8");
            drawSparkle(ctx, 255, 22, t, 1.9, "#ffe38c");

            // Crisp retro title banner
            ctx.save();
            ctx.font = 'bold 16px "Press Start 2P", monospace';
            ctx.textAlign = "center";
            ctx.fillStyle = "#101322";
            ctx.fillText(currentScene.bannerTitle ?? "TOKYO 00:15", VIRTUAL_W / 2 + 2, 34);
            ctx.fillStyle = "#ffe38c";
            ctx.fillText(currentScene.bannerTitle ?? "TOKYO 00:15", VIRTUAL_W / 2, 32);
            ctx.restore();
            break;
          }

          case "hybrid_alley_zoom": {
            // Pixel-perfect push-in: holds 1x, then snaps to a crisp 2x close-up of the shop.
            const zoom = 1 + Math.min(elapsed / 4.2, 1) * 0.55;
            drawPixelZoom(ctx, imgs["bg:alley"], zoom, 0.52, 0.6, VIRTUAL_W, VIRTUAL_H);
            drawRainOverlay(ctx, t);
            break;
          }

          case "hybrid_counter_order": {
            drawChefBehindCounter(
              ctx,
              choiceTaken ? "chef_happy" : "chef_warm",
              t,
              speakingRef.current === "chef"
            );
            // Minh portrait cleanly framed on lower-left speaking side
            drawPortrait(
              ctx,
              choiceTaken ? "minh_happy" : "minh_neutral",
              16,
              76,
              76,
              speakingRef.current === "minh",
              t
            );
            break;
          }

          case "hybrid_noodle_firmness": {
            drawChefBehindCounter(
              ctx,
              choiceTaken ? "chef_happy" : "chef_warm",
              t,
              speakingRef.current === "chef"
            );
            drawPortrait(
              ctx,
              choiceTaken ? "minh_happy" : "minh_thinking",
              16,
              74,
              78,
              speakingRef.current === "minh",
              t
            );
            break;
          }

          case "hybrid_drag_toppings": {
            if (imgs["bg:table"]) {
              ctx.drawImage(imgs["bg:table"], 0, 0, VIRTUAL_W, VIRTUAL_H);
            }
            // Center steaming ramen bowl on red lacquer tray
            const bowl = imgs["i:ramen_base"];
            if (bowl) {
              drawPixelImage(ctx, bowl, 118, 76, 84, 84);
            }

            // Dotted guide curves for unplaced toppings
            for (const tp of toppingsRef.current) {
              if (!tp.placed && draggingIdRef.current !== tp.id) {
                for (let k = 1; k <= 5; k++) {
                  const u = k / 6;
                  const gx = tp.homeX + (160 - tp.homeX) * u;
                  const gy = tp.homeY + (112 - tp.homeY) * u - Math.sin(u * Math.PI) * 18;
                  ctx.fillStyle =
                    Math.floor((t * 6 - k) % 5) === 0 ? "#ffe38c" : "rgba(246,238,216,0.5)";
                  ctx.fillRect(Math.round(gx), Math.round(gy), 2, 2);
                }
              }
            }

            // Draw placed toppings inside bowl first, then unplaced/dragging toppings on top
            const ordered = [
              ...toppingsRef.current.filter((x) => x.placed),
              ...toppingsRef.current.filter((x) => !x.placed && draggingIdRef.current !== x.id),
              ...toppingsRef.current.filter((x) => draggingIdRef.current === x.id),
            ];
            for (const tp of ordered) {
              const tim = imgs[`i:${tp.id}`];
              if (!tim) continue;
              const sz = tp.placed ? 30 : 34;
              drawPixelImage(ctx, tim, Math.round(tp.x - sz / 2), Math.round(tp.y - sz / 2), sz, sz);
              if (!tp.placed && draggingIdRef.current !== tp.id) {
                ctx.fillStyle = "#101322";
                ctx.fillRect(Math.round(tp.x - 24), Math.round(tp.y + 16), 48, 11);
                ctx.fillStyle = "#ffe38c";
                ctx.font = '8px "DotGothic16", monospace';
                ctx.textAlign = "center";
                ctx.fillText(tp.labelJa, Math.round(tp.x), Math.round(tp.y + 24));
              }
            }

            // Rising aromatic steam wisps above the ramen bowl!
            drawSteamWisps(ctx, 160, 96, t, allToppingsDone ? 6 : 4, 34);
            if (allToppingsDone) {
              drawSparkle(ctx, 118, 80, t, 0.2);
              drawSparkle(ctx, 204, 84, t, 1.4);
              drawSparkle(ctx, 160, 66, t, 2.5);
            }
            break;
          }

          case "hybrid_outro_ramen": {
            drawChefBehindCounter(
              ctx,
              "chef_happy",
              t,
              speakingRef.current === "chef"
            );
            // Happy Minh portrait on left
            drawPortrait(
              ctx,
              "minh_happy",
              16,
              74,
              78,
              speakingRef.current === "minh",
              t
            );
            // Completed Deluxe Ramen Bowl (base + all 3 toppings!) steaming right on oak counter!
            const bx = 138;
            const by = 92;
            drawPixelImage(ctx, imgs["i:ramen_base"], bx, by, 70, 70);
            drawPixelImage(ctx, imgs["i:nori"], bx + 24, by + 4, 24, 24);
            drawPixelImage(ctx, imgs["i:chashu"], bx + 10, by + 16, 24, 24);
            drawPixelImage(ctx, imgs["i:egg"], bx + 35, by + 17, 24, 24);
            drawSteamWisps(ctx, bx + 35, by + 12, t, 5, 28);
            drawSparkle(ctx, bx - 4, by + 6, t, 0.1);
            drawSparkle(ctx, bx + 72, by + 10, t, 1.5);
            drawSparkle(ctx, bx + 35, by - 8, t, 2.7);
            break;
          }
        }

    }, "#101322", 3.0);
  }, [allToppingsDone, assetsReady, choiceTaken, currentScene, imagesRef, sceneStartRef, speakingRef, startLoop]);

  // Pointer handlers for Scene 5 Drag & Drop Toppings (supports drag OR tap-to-drop!)
  const toVirtual = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      vx: ((e.clientX - rect.left) / rect.width) * VIRTUAL_W,
      vy: ((e.clientY - rect.top) / rect.height) * VIRTUAL_H,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (currentScene.type !== "hybrid_drag_toppings" || allToppingsDone) return;
    const { vx, vy } = toVirtual(e);
    for (const tp of toppingsRef.current) {
      if (!tp.placed && Math.hypot(vx - tp.x, vy - tp.y) <= 24) {
        e.currentTarget.setPointerCapture(e.pointerId);
        draggingIdRef.current = tp.id;
        retroAudio.playClick();
        return;
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (currentScene.type !== "hybrid_drag_toppings" || !draggingIdRef.current) return;
    const { vx, vy } = toVirtual(e);
    const tp = toppingsRef.current.find((x) => x.id === draggingIdRef.current);
    if (!tp || tp.placed) return;
    tp.x = Math.max(18, Math.min(VIRTUAL_W - 18, vx));
    tp.y = Math.max(18, Math.min(VIRTUAL_H - 18, vy));

    // Check drop zone over center Ramen Bowl (160, 114)
    if (Math.hypot(vx - 160, vy - 114) <= 42) {
      placeTopping(tp);
    }
  };

  const handlePointerUp = () => {
    if (!draggingIdRef.current) return;
    const tp = toppingsRef.current.find((x) => x.id === draggingIdRef.current);
    draggingIdRef.current = null;
    if (tp && !tp.placed) {
      // Quick tap helper: if barely dragged (<6px), snap directly into bowl for effortless mobile UX!
      if (Math.hypot(tp.x - tp.homeX, tp.y - tp.homeY) < 6) {
        placeTopping(tp);
      } else {
        tp.x = tp.homeX;
        tp.y = tp.homeY;
      }
    }
  };

  return (
    <div className="canvas-viewport">
      <canvas
        ref={canvasRef}
        width={VIRTUAL_W}
        height={VIRTUAL_H}
        className="pixel-canvas"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{
          cursor:
            currentScene.type === "hybrid_drag_toppings" && !allToppingsDone
              ? "grab"
              : "default",
        }}
      />

      {/* Top scene HUD badge */}
      {currentScene.type === "hybrid_alley_zoom" && currentScene.locationBadge && (
        <div className="scene-hud-top">{currentScene.locationBadge}</div>
      )}

      {currentScene.type === "hybrid_drag_toppings" && !allToppingsDone && (
        <div className="scene-hud-top">
          {currentScene.instruction} ({placedCount}/3)
        </div>
      )}

      {/* Scene 3 floating "? 大将ってだれ" button */}
      {currentScene.type === "hybrid_counter_order" && (
        <button
          type="button"
          className="pixel-btn pixel-btn-cream"
          style={{ position: "absolute", right: "14%", top: "14%" }}
          onClick={() => {
            retroAudio.playClick();
            setShowCard(true);
          }}
        >
          {currentScene.whoButtonLabel ?? "? 大将ってだれ"}
        </button>
      )}

      {/* Bottom subtitle + interactive actions */}
      <div className="overlay-center-bottom">
        {activeLine && (
          <div className="subtitle-box">
            {activeLine.speakerLabel && (
              <div className="subtitle-speaker">{activeLine.speakerLabel}</div>
            )}
            <div className="subtitle-ja">
              <RubyText
                segments={activeLine.jaRuby}
                showFurigana={showFurigana}
              />
            </div>
            <div className="subtitle-vi">{activeLine.vi}</div>
          </div>
        )}

        {currentScene.type === "hybrid_alley_intro" && (
          <button
            type="button"
            className="pixel-btn pixel-btn-cream"
            onClick={() => {
              retroAudio.startBgm();
              retroAudio.playClick();
              goToScene(1);
            }}
          >
            ▶ {currentScene.actionLabel ?? "のれんをくぐる · VÀO QUÁN"}
          </button>
        )}

        {(currentScene.type === "hybrid_counter_order" ||
          currentScene.type === "hybrid_noodle_firmness") &&
          lineFinished &&
          !choiceTaken &&
          currentScene.minigame && (
            <div className="choice-row">
              {currentScene.minigame.choices.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="choice-card-btn"
                  onClick={() => void handleSelectChoice(c)}
                >
                  <span className="choice-ja">
                    {c.labelRuby ? (
                      <RubyText
                        segments={c.labelRuby}
                        showFurigana={showFurigana}
                      />
                    ) : (
                      c.labelJa
                    )}
                  </span>
                  <span className="choice-vi">{c.labelVi}</span>
                </button>
              ))}
            </div>
          )}

        {currentScene.type === "hybrid_outro_ramen" && lineFinished && (
          <div className="action-row">
            <button
              type="button"
              className="pixel-btn pixel-btn-purple"
              onClick={() => {
                retroAudio.playClick();
                onOpenReading();
              }}
            >
              VÀO BÀI ĐỌC →
            </button>
            <button
              type="button"
              className="pixel-btn pixel-btn-mint"
              onClick={() => {
                retroAudio.playClick();
                onOpenDictation();
              }}
            >
              🎧 NGHE CHÉP
            </button>
            <button
              type="button"
              className="pixel-btn pixel-btn-cream"
              onClick={() => {
                retroAudio.playClick();
                setShowCard(true);
              }}
            >
              THẺ QUÁN MÌ
            </button>
            <button
              type="button"
              className="pixel-btn pixel-btn-dark"
              onClick={() => {
                retroAudio.playClick();
                goToScene(0);
              }}
            >
              ↺ CHƠI LẠI
            </button>
          </div>
        )}
      </div>

      {showCard && (
        <CharacterCardModal
          card={story.characterCard}
          portraitUrl={story.assets?.cardPortrait}
          onClose={() => {
            retroAudio.playClick();
            setShowCard(false);
          }}
        />
      )}

      {autoplay && (
        <svg
          className={`virtual-cursor ${cursorPos.clicking ? "clicking" : ""}`}
          style={{ left: `${cursorPos.x}%`, top: `${cursorPos.y}%` }}
          viewBox="0 0 16 16"
        >
          <path
            d="M1 1 L1 13 L4.5 9.5 L7.5 15 L9.5 14 L6.5 8.5 L11.5 8.5 Z"
            fill="#f6eed8"
            stroke="#101322"
            strokeWidth="1.4"
          />
        </svg>
      )}
    </div>
  );
}
