import { useCallback, useEffect, useRef, useState } from "react";
import { retroAudio } from "../audio/chiptune";
import { drawBayerDitherOverlay } from "../engine/bayerDither";
import { VIRTUAL_H, VIRTUAL_W } from "../engine/pixelRenderer";
import type { DialogueLine, StoryData } from "../types/story";
import { resolveAssetUrl } from "../utils/assetUrl";
import { CharacterCardModal } from "./CharacterCardModal";
import { RubyText } from "./RubyText";

interface CinemaStageProps {
  story: StoryData;
  showFurigana: boolean;
  muted: boolean;
  autoplay: boolean;
  onOpenReading: () => void;
  onOpenDictation: () => void;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function easeOutCubic(t: number): number {
  const u = clamp01(t);
  return 1 - Math.pow(1 - u, 3);
}

/** Cozy 16-bit Japanese washoku table overlay (sashimi, steaming miso soup, rice, green tea) */
function drawWashokuTableScene(
  ctx: CanvasRenderingContext2D,
  bg: HTMLImageElement | undefined,
  t: number
): void {
  if (bg) {
    ctx.drawImage(bg, 0, 0, VIRTUAL_W, VIRTUAL_H);
    // Warm summer-sunset amber room tint
    ctx.fillStyle = "rgba(255, 198, 118, 0.14)";
    ctx.fillRect(0, 0, VIRTUAL_W, VIRTUAL_H);
  } else {
    ctx.fillStyle = "#2b1c14";
    ctx.fillRect(0, 0, VIRTUAL_W, VIRTUAL_H);
  }
  // Low Japanese wooden dining table (chabudai) framed cleanly ABOVE the subtitle box!
  ctx.fillStyle = "#241712";
  ctx.fillRect(86, 86, 148, 36);
  ctx.fillStyle = "#7a4424";
  ctx.fillRect(88, 88, 144, 32);
  ctx.fillStyle = "#9d5b32";
  ctx.fillRect(90, 90, 140, 20);
  // Table legs
  ctx.fillStyle = "#4d2a16";
  ctx.fillRect(94, 120, 8, 10);
  ctx.fillRect(218, 120, 8, 10);

  // Sashimi plate (center)
  ctx.fillStyle = "#241712";
  ctx.fillRect(136, 93, 48, 14);
  ctx.fillStyle = "#f2eee4";
  ctx.fillRect(137, 94, 46, 12);
  // Pink/coral sashimi slices + green shiso leaf
  ctx.fillStyle = "#3f7d4c";
  ctx.fillRect(140, 97, 10, 6);
  ctx.fillStyle = "#e8786d";
  ctx.fillRect(145, 96, 9, 5);
  ctx.fillRect(156, 96, 9, 5);
  ctx.fillStyle = "#f5a582";
  ctx.fillRect(167, 97, 9, 5);

  // Two bowls of steaming miso soup (left & right)
  for (const bx of [104, 194]) {
    ctx.fillStyle = "#241712";
    ctx.fillRect(bx, 96, 22, 12);
    ctx.fillStyle = "#7d2222";
    ctx.fillRect(bx + 1, 97, 20, 10);
    ctx.fillStyle = "#d99b43";
    ctx.fillRect(bx + 3, 98, 16, 4);
    // Rising soup steam wisps
    for (let i = 0; i < 3; i++) {
      const p = (t * 0.45 + i * 0.33 + bx * 0.01) % 1;
      const sx = bx + 6 + i * 4 + Math.sin(t * 2.8 + i) * 2;
      const sy = 96 - p * 18;
      ctx.fillStyle = `rgba(255, 248, 232, ${(Math.sin(p * Math.PI) * 0.55).toFixed(2)})`;
      ctx.fillRect(Math.round(sx), Math.round(sy), 2, 2);
    }
  }
  // Fluffy rice bowl + green tea cup
  ctx.fillStyle = "#241712";
  ctx.fillRect(126, 106, 16, 9);
  ctx.fillStyle = "#3a4f7a";
  ctx.fillRect(127, 109, 14, 5);
  ctx.fillStyle = "#fffdf6";
  ctx.fillRect(128, 105, 12, 4);
  ctx.fillStyle = "#487042";
  ctx.fillRect(182, 107, 8, 7);
}

/** Sunlit moving Japanese Airport Express Train with live scrolling Tokyo skyline & summer clouds! */
function drawAirportTrainScene(ctx: CanvasRenderingContext2D, t: number): void {
  // 1. Bright summer azure sky outside panoramic train windows
  ctx.fillStyle = "#5ba4e5";
  ctx.fillRect(0, 18, VIRTUAL_W, 92);
  ctx.fillStyle = "#8bc6f5";
  ctx.fillRect(0, 62, VIRTUAL_W, 48);

  // Drifting summer clouds (slow parallax)
  for (let i = 0; i < 5; i++) {
    const cx = ((i * 78 - t * 12) % (VIRTUAL_W + 60) + VIRTUAL_W + 60) % (VIRTUAL_W + 60) - 40;
    const cy = 28 + (i % 3) * 12;
    ctx.fillStyle = "#f8fbff";
    ctx.fillRect(Math.round(cx), cy, 34, 10);
    ctx.fillRect(Math.round(cx + 6), cy - 5, 20, 6);
  }

  // Scrolling distant Tokyo skyline & green riverside trees (medium parallax)
  for (let i = 0; i < 14; i++) {
    const bx = ((i * 30 - t * 44) % (VIRTUAL_W + 40) + VIRTUAL_W + 40) % (VIRTUAL_W + 40) - 25;
    const bh = 18 + ((i * 17) % 28);
    ctx.fillStyle = i % 3 === 0 ? "#6680a8" : "#7b93b8";
    ctx.fillRect(Math.round(bx), 104 - bh, 22, bh);
    // Tiny sunlit building windows
    ctx.fillStyle = "#dbeeff";
    ctx.fillRect(Math.round(bx + 4), 104 - bh + 4, 4, 4);
    ctx.fillRect(Math.round(bx + 12), 104 - bh + 4, 4, 4);
  }
  // Passing green summer tree line (fast parallax)
  for (let i = 0; i < 18; i++) {
    const tx = ((i * 24 - t * 88) % (VIRTUAL_W + 30) + VIRTUAL_W + 30) % (VIRTUAL_W + 30) - 16;
    ctx.fillStyle = i % 2 === 0 ? "#3f7d4b" : "#51995d";
    ctx.fillRect(Math.round(tx), 92 + (i % 3) * 3, 18, 18);
  }
  // Passing electric catenary poles (very fast foreground rush)
  for (let i = 0; i < 3; i++) {
    const px = ((i * 150 - t * 170) % (VIRTUAL_W + 120) + VIRTUAL_W + 120) % (VIRTUAL_W + 120) - 40;
    ctx.fillStyle = "rgba(42, 52, 74, 0.55)";
    ctx.fillRect(Math.round(px), 18, 4, 92);
  }

  // 2. Crisp Japanese express train interior framing
  ctx.fillStyle = "#d9d2c3";
  ctx.fillRect(0, 0, VIRTUAL_W, 20);
  ctx.fillStyle = "#241712";
  ctx.fillRect(0, 20, VIRTUAL_W, 2);
  // Window pillar dividers
  for (const wx of [0, 104, 212, 314]) {
    ctx.fillStyle = "#cfc7b6";
    ctx.fillRect(wx, 20, 8, 92);
    ctx.fillStyle = "#241712";
    ctx.fillRect(wx, 20, 1, 92);
    ctx.fillRect(wx + 7, 20, 1, 92);
  }
  // Silver luggage rack & hanging straps
  ctx.fillStyle = "#8a92a4";
  ctx.fillRect(0, 12, VIRTUAL_W, 3);
  for (const sx of [56, 158, 260]) {
    ctx.fillStyle = "#3c4254";
    ctx.fillRect(sx, 15, 2, 12);
    ctx.strokeStyle = "#f2eee4";
    ctx.lineWidth = 2;
    ctx.strokeRect(sx - 3, 27, 8, 8);
  }

  // Lower train wall & plush blue seats
  ctx.fillStyle = "#241712";
  ctx.fillRect(0, 108, VIRTUAL_W, 2);
  ctx.fillStyle = "#c7bea9";
  ctx.fillRect(0, 110, VIRTUAL_W, 90);
  // Plush blue seats
  ctx.fillStyle = "#2b4d82";
  ctx.fillRect(14, 116, VIRTUAL_W - 28, 34);
  ctx.fillStyle = "#3a65a6";
  ctx.fillRect(18, 118, VIRTUAL_W - 36, 18);
  // Subtle train aisle floor
  ctx.fillStyle = "#4d5569";
  ctx.fillRect(0, 150, VIRTUAL_W, 50);

  // Rolling travel suitcase resting neatly by seat
  ctx.fillStyle = "#241712";
  ctx.fillRect(146, 118, 28, 34);
  ctx.fillStyle = "#c94c4c";
  ctx.fillRect(148, 120, 24, 30);
  ctx.fillStyle = "#a33535";
  ctx.fillRect(152, 124, 16, 2);
  ctx.fillRect(152, 130, 16, 2);
  ctx.fillStyle = "#d9dee8";
  ctx.fillRect(156, 112, 8, 6);

  // Warm golden afternoon sunbeams slanting across the carriage
  ctx.save();
  ctx.fillStyle = "rgba(255, 238, 176, 0.14)";
  ctx.beginPath();
  ctx.moveTo(24, 22);
  ctx.lineTo(96, 22);
  ctx.lineTo(144, 180);
  ctx.lineTo(64, 180);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Gentle rising bath steam for ofuro background */
function drawBathSteam(ctx: CanvasRenderingContext2D, t: number): void {
  for (let i = 0; i < 12; i++) {
    const p = (t * 0.25 + i / 12) % 1;
    const x = 164 + ((i * 23) % 136) + Math.sin(t * 1.9 + i * 1.3) * 6;
    const y = 150 - p * 56;
    const a = Math.sin(p * Math.PI) * 0.34;
    const w = 6 + Math.floor(p * 8);
    ctx.fillStyle = `rgba(242, 248, 255, ${a.toFixed(3)})`;
    ctx.fillRect(Math.round(x), Math.round(y), w, 3);
  }
}

function drawCinemaBottomFade(ctx: CanvasRenderingContext2D, strength = 0.78): void {
  const grad = ctx.createLinearGradient(0, 128, 0, VIRTUAL_H);
  grad.addColorStop(0, "rgba(10, 13, 24, 0)");
  grad.addColorStop(0.65, `rgba(10, 13, 24, ${(strength * 0.55).toFixed(2)})`);
  grad.addColorStop(1, `rgba(10, 13, 24, ${strength.toFixed(2)})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 128, VIRTUAL_W, VIRTUAL_H - 128);
}

function drawFramelessCharacter(
  ctx: CanvasRenderingContext2D,
  im: HTMLImageElement | undefined,
  side: "left" | "right",
  options: { talking: boolean; active: boolean; enterProgress: number; t: number }
): void {
  if (!im) return;
  const size = 122;
  const ease = easeOutCubic(options.enterProgress);
  const slideDist = 28 * (1 - ease);
  const focusShift = options.active ? 0 : side === "left" ? -5 : 5;
  const baseX = side === "left" ? 4 : VIRTUAL_W - size - 4;
  const x = Math.round(baseX + (side === "left" ? -slideDist : slideDist) + focusShift);
  const breath = Math.round(Math.sin(options.t * 2.2 + (side === "left" ? 0 : 1.7)) * 0.8);
  const talkBob = options.talking ? Math.round(Math.abs(Math.sin(options.t * 9.5)) * -1.8) : 0;
  const y = Math.round(VIRTUAL_H - size + breath + talkBob);

  ctx.save();
  if (!options.active) {
    ctx.filter = "brightness(0.64) saturate(0.86)";
  }
  ctx.globalAlpha = clamp01(ease);
  ctx.drawImage(im, x, y, size, size);
  ctx.restore();
}

export function CinemaStage({
  story,
  showFurigana,
  muted,
  autoplay,
  onOpenReading,
  onOpenDictation,
}: CinemaStageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const imagesRef = useRef<Record<string, HTMLImageElement>>({});

  const [assetsReady, setAssetsReady] = useState(false);
  const [sceneIdx, setSceneIdx] = useState(0);
  const [activeLine, setActiveLine] = useState<DialogueLine | null>(null);
  const [lineFinished, setLineFinished] = useState(false);
  const [showCard, setShowCard] = useState(false);

  // Reusable checklist interactive state + visual scene switcher (e.g. washoku vs ofuro!)
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [activeSubView, setActiveSubView] = useState<"default" | "alt">("default");

  const transitionRef = useRef<{
    active: boolean;
    phase: "out" | "in";
    amount: number;
    nextIdx: number;
  }>({ active: false, phase: "out", amount: 0, nextIdx: 0 });

  const sceneStartRef = useRef<number>(performance.now());
  const speakingRef = useRef<string | null>(null);
  const currentScene = story.scenes[sceneIdx];

  const portraitKeys = Object.keys(story.assets?.portraits ?? {});
  const leftCharKey = portraitKeys[0] ?? "lisa";
  const rightCharKey = portraitKeys[1] ?? "haruko";

  useEffect(() => {
    let cancelled = false;
    const entries: Array<[string, string]> = [];
    if (story.assets) {
      for (const [k, v] of Object.entries(story.assets.backgrounds)) {
        entries.push([`bg:${k}`, resolveAssetUrl(v)]);
      }
      for (const [k, v] of Object.entries(story.assets.portraits)) {
        entries.push([`p:${k}`, resolveAssetUrl(v)]);
      }
    }
    if (entries.length === 0) {
      setAssetsReady(true);
      return;
    }
    let loaded = 0;
    const map: Record<string, HTMLImageElement> = {};
    entries.forEach(([key, url]) => {
      const im = new Image();
      im.onload = () => {
        map[key] = im;
        loaded += 1;
        if (!cancelled && loaded === entries.length) {
          imagesRef.current = map;
          setAssetsReady(true);
        }
      };
      im.onerror = () => {
        loaded += 1;
        if (!cancelled && loaded === entries.length) {
          imagesRef.current = map;
          setAssetsReady(true);
        }
      };
      im.src = url;
    });
    return () => {
      cancelled = true;
    };
  }, [story]);

  const stopVoice = useCallback(() => {
    if (audioElRef.current) {
      audioElRef.current.pause();
      audioElRef.current.currentTime = 0;
    }
    speakingRef.current = null;
    retroAudio.setDucked(false);
  }, []);

  const playVoiceLine = useCallback(
    (line: DialogueLine): Promise<void> => {
      return new Promise((resolve) => {
        setActiveLine(line);
        speakingRef.current = line.voice;
        if (!line.audioUrl) {
          window.setTimeout(() => {
            speakingRef.current = null;
            resolve();
          }, Math.max(1800, (line.durationSec ?? 2.5) * 1000));
          return;
        }
        stopVoice();
        speakingRef.current = line.voice;
        const audio = new Audio(resolveAssetUrl(line.audioUrl));
        audio.muted = muted;
        audioElRef.current = audio;
        retroAudio.setDucked(true);
        let settled = false;
        const done = () => {
          if (settled) return;
          settled = true;
          speakingRef.current = null;
          retroAudio.setDucked(false);
          resolve();
        };
        audio.addEventListener("ended", done, { once: true });
        audio.addEventListener("error", () => window.setTimeout(done, 2000));
        audio.play().catch(() => window.setTimeout(done, 2000));
      });
    },
    [muted, stopVoice]
  );

  useEffect(() => {
    if (audioElRef.current) audioElRef.current.muted = muted;
    retroAudio.setMuted(muted);
  }, [muted]);

  const goToScene = useCallback(
    (targetIdx: number) => {
      if (transitionRef.current.active) return;
      stopVoice();
      retroAudio.playTransition();
      transitionRef.current = {
        active: true,
        phase: "out",
        amount: 0,
        nextIdx: targetIdx,
      };
    },
    [stopVoice]
  );

  useEffect(() => {
    if (!assetsReady) return;
    let cancelled = false;
    sceneStartRef.current = performance.now();
    setLineFinished(false);
    setActiveLine(null);
    setCheckedIds([]);
    setActiveSubView("default");

    const run = async () => {
      for (let i = 0; i < currentScene.lines.length; i++) {
        if (cancelled) return;
        await playVoiceLine(currentScene.lines[i]);
        if (cancelled) return;
        await new Promise((r) => window.setTimeout(r, 420));
      }
      if (cancelled) return;
      setLineFinished(true);
      if (currentScene.type === "cinema_outro") {
        retroAudio.playKotoChime();
      }
    };
    void run();
    return () => {
      cancelled = true;
      stopVoice();
    };
  }, [assetsReady, currentScene, playVoiceLine, stopVoice]);

  // Autoplay director
  useEffect(() => {
    if (!autoplay || !assetsReady || !lineFinished) return;
    let cancelled = false;
    const tmr = window.setTimeout(() => {
      if (cancelled) return;
      if (sceneIdx + 1 < story.scenes.length) {
        goToScene(sceneIdx + 1);
      } else {
        window.__JP_STORY_DONE__ = true;
      }
    }, 1100);
    return () => {
      cancelled = true;
      window.clearTimeout(tmr);
    };
  }, [assetsReady, autoplay, goToScene, lineFinished, sceneIdx, story.scenes.length]);

  // 60fps Canvas Render Loop driven declaratively by `currentScene.locationBadge`!
  useEffect(() => {
    if (!assetsReady) return;
    let rafId = 0;
    let lastTime = performance.now();

    const render = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx) {
        ctx.imageSmoothingEnabled = false;
        const t = now / 1000;
        const elapsed = (now - sceneStartRef.current) / 1000;
        const imgs = imagesRef.current;
        const badge = currentScene.locationBadge ?? "bg:ofuro";

        // 1. Background layer (switches dynamically when user clicks checklist items!)
        const showWashoku =
          badge === "bg:washoku_table" ||
          (currentScene.type === "cinema_checklist" && activeSubView === "alt");

        if (badge === "bg:airport_train") {
          drawAirportTrainScene(ctx, t);
        } else if (showWashoku) {
          drawWashokuTableScene(ctx, imgs["bg:washitsu"], t);
        } else if (imgs[badge]) {
          const zoom = 1 + Math.min(elapsed * 0.006, 0.045);
          ctx.save();
          ctx.translate(VIRTUAL_W * 0.5, VIRTUAL_H * 0.5);
          ctx.scale(zoom, zoom);
          ctx.translate(-VIRTUAL_W * 0.5, -VIRTUAL_H * 0.5);
          ctx.drawImage(imgs[badge], 0, 0, VIRTUAL_W, VIRTUAL_H);
          ctx.restore();
          if (badge === "bg:ofuro") drawBathSteam(ctx, t);
        }

        // 2. Foreground characters (frameless!) & title banner
        if (currentScene.type === "cinema_intro") {
          drawCinemaBottomFade(ctx, 0.65);
          ctx.save();
          ctx.font = 'bold 21px "DotGothic16", monospace';
          ctx.textAlign = "center";
          ctx.fillStyle = "rgba(12, 15, 28, 0.85)";
          ctx.fillText(currentScene.bannerTitle ?? story.titleJa, VIRTUAL_W / 2 + 1, 56);
          ctx.fillStyle = "#ffe69c";
          ctx.fillText(currentScene.bannerTitle ?? story.titleJa, VIRTUAL_W / 2, 54);
          ctx.font = 'bold 9px "DotGothic16", monospace';
          ctx.fillStyle = "#8ad4ff";
          ctx.fillText("JLPT N4 12/2025 · 問題５", VIRTUAL_W / 2, 69);
          ctx.restore();
        } else {
          drawCinemaBottomFade(ctx, 0.8);
          const showRight = currentScene.type !== "cinema_outro";
          drawFramelessCharacter(ctx, imgs[`p:${leftCharKey}`], "left", {
            talking: speakingRef.current === leftCharKey,
            active: speakingRef.current !== rightCharKey,
            enterProgress: Math.min(elapsed / 0.5, 1),
            t,
          });
          if (showRight) {
            drawFramelessCharacter(ctx, imgs[`p:${rightCharKey}`], "right", {
              talking: speakingRef.current === rightCharKey,
              active: speakingRef.current === rightCharKey,
              enterProgress: Math.min(elapsed / 0.6, 1),
              t,
            });
          }
        }

        // Bayer transition
        const tr = transitionRef.current;
        if (tr.active) {
          if (tr.phase === "out") {
            tr.amount += dt * 2.8;
            if (tr.amount >= 1) {
              tr.amount = 1;
              tr.phase = "in";
              setSceneIdx(tr.nextIdx);
            }
          } else {
            tr.amount -= dt * 2.8;
            if (tr.amount <= 0) {
              tr.amount = 0;
              tr.active = false;
            }
          }
          drawBayerDitherOverlay(ctx, tr.amount, "#101322");
        }
      }
      rafId = window.requestAnimationFrame(render);
    };
    rafId = window.requestAnimationFrame(render);
    return () => window.cancelAnimationFrame(rafId);
  }, [activeSubView, assetsReady, currentScene, leftCharKey, rightCharKey, story.titleJa]);

  const checklistChoices = currentScene.minigame?.choices ?? [];
  const allChecked =
    checklistChoices.length === 0 ||
    checklistChoices.every((c) => checkedIds.includes(c.id));

  return (
    <div className="canvas-viewport">
      <canvas
        ref={canvasRef}
        width={VIRTUAL_W}
        height={VIRTUAL_H}
        className="pixel-canvas"
      />

      {currentScene.instruction && currentScene.type !== "cinema_intro" && (
        <div className="scene-hud-top">{currentScene.instruction}</div>
      )}

      {currentScene.whoButtonLabel && (
        <button
          type="button"
          className="pixel-btn pixel-btn-dark"
          style={{
            position: "absolute",
            right: "14px",
            top: "12px",
            padding: "6px 12px",
            fontSize: "12px",
          }}
          onClick={() => {
            retroAudio.playClick();
            setShowCard(true);
          }}
        >
          {currentScene.whoButtonLabel}
        </button>
      )}

      {/* Scene 3 Interactive Reality Comparison Toggle */}
      {currentScene.type === "cinema_reveal" && lineFinished && (
        <div
          style={{
            position: "absolute",
            top: "52px",
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            gap: "8px",
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          <div className="subtitle-box" style={{ padding: "7px 12px", fontSize: "12px" }}>
            <b style={{ color: "#ffd875" }}>Thường ngày nhà Haruko:</b> Ít ăn washoku · Chủ yếu tắm vòi sen 🚿
            <br />
            <b style={{ color: "#63d9b4" }}>Tuần Lisa sang chơi:</b> Ngày nào cũng ăn washoku 🥢 &amp; pha bồn nước nóng ♨️ (Để Lisa vui!)
          </div>
        </div>
      )}

      <div className="overlay-center-bottom">
        {activeLine && (
          <div className="subtitle-box">
            {activeLine.speakerLabel && (
              <div className="subtitle-speaker">{activeLine.speakerLabel}</div>
            )}
            <div className="subtitle-ja">
              <RubyText segments={activeLine.jaRuby} showFurigana={showFurigana} />
            </div>
            <div className="subtitle-vi">{activeLine.vi}</div>
          </div>
        )}

        {currentScene.type === "cinema_intro" && (
          <button
            type="button"
            className="pixel-btn pixel-btn-cream"
            onClick={() => {
              retroAudio.startBgm("depato_sunny");
              retroAudio.playClick();
              goToScene(1);
            }}
          >
            ▶ {currentScene.actionLabel ?? "はじめる · BẮT ĐẦU"}
          </button>
        )}

        {currentScene.type === "cinema_checklist" && lineFinished && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <div className="choice-row">
              {checklistChoices.map((ch) => {
                const done = checkedIds.includes(ch.id);
                return (
                  <button
                    key={ch.id}
                    type="button"
                    className={`pixel-icon-btn ${done ? "active" : ""}`}
                    onClick={() => {
                      retroAudio.playClick();
                      setActiveSubView(ch.id === "exp_washoku" ? "alt" : "default");
                      setCheckedIds((prev) =>
                        prev.includes(ch.id) ? prev : [...prev, ch.id]
                      );
                      void playVoiceLine(ch.responseLine);
                    }}
                  >
                    {done ? "✓ " : ""}
                    {ch.labelJa}
                  </button>
                );
              })}
            </div>
            {allChecked && (
              <button
                type="button"
                className="pixel-btn pixel-btn-purple"
                onClick={() => {
                  retroAudio.playClick();
                  goToScene(sceneIdx + 1);
                }}
              >
                {currentScene.actionLabel ?? "Tiếp tục →"}
              </button>
            )}
          </div>
        )}

        {currentScene.type === "cinema_reveal" && lineFinished && (
          <button
            type="button"
            className="pixel-btn pixel-btn-purple"
            onClick={() => {
              retroAudio.playClick();
              goToScene(sceneIdx + 1);
            }}
          >
            {currentScene.actionLabel ?? "Tiếp tục →"}
          </button>
        )}

        {currentScene.type === "cinema_outro" && lineFinished && (
          <div className="action-row">
            <button
              type="button"
              className="pixel-btn pixel-btn-purple"
              onClick={() => {
                retroAudio.playClick();
                onOpenReading();
              }}
            >
              📖 ĐỌC BÀI &amp; LÀM CÂU 25–27 →
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
              THẺ ĐỀ THI
            </button>
            <button
              type="button"
              className="pixel-btn pixel-btn-dark"
              onClick={() => {
                retroAudio.playClick();
                goToScene(0);
              }}
            >
              ↺ XEM LẠI
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
    </div>
  );
}
