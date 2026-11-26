import { useCallback, useEffect, useRef, useState } from "react";
import { retroAudio } from "../audio/chiptune";
import { drawBayerDitherOverlay } from "../engine/bayerDither";
import { VIRTUAL_H, VIRTUAL_W } from "../engine/pixelRenderer";
import type { DialogueLine, MiniGameChoice, StoryData } from "../types/story";
import { resolveAssetUrl } from "../utils/assetUrl";
import { CharacterCardModal } from "./CharacterCardModal";
import { RubyText } from "./RubyText";

interface DepatoStageProps {
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

/** Floating musical notes drifting softly from department store ceiling speakers */
function drawMusicNotes(
  ctx: CanvasRenderingContext2D,
  t: number,
  mode: "sunny" | "rain"
): void {
  const color = mode === "rain" ? "#8ad4ff" : "#ffe38c";
  const accent = mode === "rain" ? "#d9f2ff" : "#fff7d6";
  const notes = [
    { x: 66, phase: 0.0 },
    { x: 146, phase: 0.25 },
    { x: 224, phase: 0.52 },
    { x: 278, phase: 0.78 },
  ];
  for (const n of notes) {
    const p = (t * 0.28 + n.phase) % 1;
    const x = Math.round(n.x + Math.sin(t * 2.4 + n.phase * 10) * 6);
    const y = Math.round(18 + p * 52);
    const alpha = Math.sin(p * Math.PI) * 0.9;
    ctx.save();
    ctx.globalAlpha = clamp01(alpha);
    ctx.fillStyle = color;
    // Pixel eighth-note (♪)
    ctx.fillRect(x, y + 4, 3, 2);
    ctx.fillRect(x + 2, y, 1, 5);
    ctx.fillRect(x + 3, y, 3, 1);
    ctx.fillRect(x + 5, y + 1, 1, 2);
    ctx.fillStyle = accent;
    ctx.fillRect(x, y + 4, 1, 1);
    ctx.restore();
  }
}

/** Living Tokyo afternoon rain streaks + wet sidewalk puddle ripples */
function drawCityRain(ctx: CanvasRenderingContext2D, t: number): void {
  // Diagonal rain streaks
  for (let i = 0; i < 64; i++) {
    const p = (t * (1.2 + (i % 4) * 0.25) + i * 0.17) % 1;
    const x = ((i * 37 - p * 44) % (VIRTUAL_W + 30) + VIRTUAL_W + 30) % (VIRTUAL_W + 30) - 15;
    const y = p * (VIRTUAL_H + 14) - 10;
    ctx.fillStyle = i % 3 === 0 ? "rgba(218, 236, 255, 0.72)" : "rgba(166, 200, 240, 0.45)";
    ctx.fillRect(Math.round(x), Math.round(y), 1, 5);
    ctx.fillRect(Math.round(x - 1), Math.round(y + 4), 1, 3);
  }
  // Puddle ripples on wet stone sidewalk
  const ripples = [
    { x: 140, y: 164, ph: 0 },
    { x: 224, y: 158, ph: 0.35 },
    { x: 268, y: 170, ph: 0.7 },
    { x: 96, y: 172, ph: 0.5 },
  ];
  for (const rp of ripples) {
    const p = (t * 0.9 + rp.ph) % 1;
    const rw = Math.round(3 + p * 12);
    const rh = Math.round(1 + p * 3);
    ctx.strokeStyle = `rgba(255, 224, 152, ${((1 - p) * 0.55).toFixed(2)})`;
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(rp.x - rw / 2), Math.round(rp.y - rh / 2), rw, rh);
  }
}

/** Sunbeams and gentle floating dust motes in the sunny campus café */
function drawSunlitMotes(ctx: CanvasRenderingContext2D, t: number): void {
  for (let i = 0; i < 16; i++) {
    const p = (t * 0.14 + i * 0.09) % 1;
    const x = 60 + ((i * 53) % 210) + Math.sin(t * 1.4 + i) * 5;
    const y = 30 + ((i * 29) % 115) - p * 12;
    const a = Math.sin(p * Math.PI) * 0.55;
    ctx.fillStyle = `rgba(255, 246, 204, ${a.toFixed(2)})`;
    ctx.fillRect(Math.round(x), Math.round(y), i % 3 === 0 ? 2 : 1, 1);
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

/** Frameless flush-bottom character staging (zero floating boxes, zero ghosting!) */
function drawFramelessCharacter(
  ctx: CanvasRenderingContext2D,
  im: HTMLImageElement | undefined,
  side: "left" | "right",
  options: {
    talking: boolean;
    active: boolean;
    enterProgress: number;
    t: number;
    size?: number;
  }
): void {
  if (!im) return;
  const { talking, active, enterProgress, t, size = 122 } = options;
  const ease = easeOutCubic(enterProgress);
  const slideDist = 28 * (1 - ease);
  const focusShift = active ? 0 : side === "left" ? -5 : 5;
  const baseX = side === "left" ? 4 : VIRTUAL_W - size - 4;
  const x = Math.round(baseX + (side === "left" ? -slideDist : slideDist) + focusShift);
  const breath = Math.round(Math.sin(t * 2.2 + (side === "left" ? 0 : 1.7)) * 0.8);
  const talkBob = talking ? Math.round(Math.abs(Math.sin(t * 9.5)) * -1.8) : 0;
  const y = Math.round(VIRTUAL_H - size + breath + talkBob);

  ctx.save();
  if (!active) {
    ctx.filter = "brightness(0.64) saturate(0.86)";
  }
  ctx.globalAlpha = clamp01(ease);
  ctx.drawImage(im, x, y, size, size);
  ctx.restore();
}

export function DepatoStage({
  story,
  showFurigana,
  muted,
  autoplay,
  onOpenReading,
  onOpenDictation,
}: DepatoStageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const imagesRef = useRef<Record<string, HTMLImageElement>>({});

  const [assetsReady, setAssetsReady] = useState(false);
  const [sceneIdx, setSceneIdx] = useState(0);
  const [activeLine, setActiveLine] = useState<DialogueLine | null>(null);
  const [lineIndex, setLineIndex] = useState(0);
  const [lineFinished, setLineFinished] = useState(false);
  const [showCard, setShowCard] = useState(false);
  const [choiceTaken, setChoiceTaken] = useState<string | null>(null);

  // Dynamic Department Store BGM indicator ("sunny" vs "rain")
  const [bgmMode, setBgmMode] = useState<"sunny" | "rain">("sunny");
  // Scene 2 interactive clue check
  const [checkedWindow, setCheckedWindow] = useState(false);
  const [checkedUmbrella, setCheckedUmbrella] = useState(false);

  const transitionRef = useRef<{
    active: boolean;
    phase: "out" | "in";
    amount: number;
    nextIdx: number;
  }>({ active: false, phase: "out", amount: 0, nextIdx: 0 });

  const sceneStartRef = useRef<number>(performance.now());
  const stageStartRef = useRef<number>(performance.now());
  const speakingRef = useRef<string | null>(null);
  const [cursorPos, setCursorPos] = useState({ x: 50, y: 55, clicking: false });

  const currentScene = story.scenes[sceneIdx];

  // Preload AI pixel art
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
        if (!window.__JP_STORY_EVENTS__) window.__JP_STORY_EVENTS__ = [];
        window.__JP_STORY_EVENTS__.push({
          timeMs: Math.round(performance.now() - stageStartRef.current),
          type: "voice",
          audioUrl: line.audioUrl,
        });

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
        audio.addEventListener("error", () => {
          window.setTimeout(done, Math.max(1600, (line.durationSec ?? 2.5) * 1000));
        });
        audio.play().catch(() => {
          window.setTimeout(done, Math.max(1600, (line.durationSec ?? 2.6) * 1000));
        });
      });
    },
    [muted, stopVoice]
  );

  useEffect(() => {
    if (audioElRef.current) audioElRef.current.muted = muted;
    retroAudio.setMuted(muted);
  }, [muted]);

  const switchStoreBgm = useCallback((nextMode: "sunny" | "rain") => {
    setBgmMode(nextMode);
    retroAudio.setBgmTheme(nextMode === "rain" ? "depato_rain" : "depato_sunny");
    retroAudio.startBgm(nextMode === "rain" ? "depato_rain" : "depato_sunny");
  }, []);

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

  // Scene script runner
  useEffect(() => {
    if (!assetsReady) return;
    let cancelled = false;
    sceneStartRef.current = performance.now();
    setLineFinished(false);
    setActiveLine(null);
    setLineIndex(0);
    setChoiceTaken(null);

    if (currentScene.type === "depato_intro") {
      setBgmMode("sunny");
      retroAudio.setBgmTheme("depato_sunny");
    } else if (currentScene.type === "depato_counter_clue") {
      setCheckedWindow(false);
      setCheckedUmbrella(false);
      setBgmMode("sunny");
      retroAudio.setBgmTheme("depato_sunny");
    } else if (currentScene.type === "depato_step_rain") {
      setBgmMode("rain");
      retroAudio.setBgmTheme("depato_rain");
    } else if (currentScene.type === "depato_campus_reveal") {
      setBgmMode("sunny");
      retroAudio.setBgmTheme("depato_sunny");
    }

    const run = async () => {
      for (let i = 0; i < currentScene.lines.length; i++) {
        if (cancelled) return;
        setLineIndex(i);
        // Right when clerk speaks Line 1 in Scene 2, secretly shift the store BGM to Rain Signal!
        if (currentScene.type === "depato_counter_clue" && i === 1) {
          setBgmMode("rain");
          retroAudio.setBgmTheme("depato_rain");
        }
        // Right when Kitamura explains the secret in Scene 4, demo the Rain Signal melody!
        if (currentScene.type === "depato_campus_reveal" && i === 1) {
          setBgmMode("rain");
          retroAudio.setBgmTheme("depato_rain");
        }
        await playVoiceLine(currentScene.lines[i]);
        if (cancelled) return;
        await new Promise((r) => window.setTimeout(r, 420));
      }

      if (cancelled) return;
      setLineFinished(true);
      if (currentScene.type === "depato_outro") {
        retroAudio.playKotoChime();
      }
    };

    void run();
    return () => {
      cancelled = true;
      stopVoice();
    };
  }, [assetsReady, currentScene, playVoiceLine, stopVoice]);

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

  // Autoplay director
  useEffect(() => {
    if (!autoplay || !assetsReady) return;
    let cancelled = false;
    const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms));
    const clickAt = async (xPct: number, yPct: number) => {
      setCursorPos({ x: xPct, y: yPct, clicking: false });
      await sleep(420);
      if (cancelled) return;
      setCursorPos({ x: xPct, y: yPct, clicking: true });
      await sleep(160);
      if (cancelled) return;
      setCursorPos({ x: xPct, y: yPct, clicking: false });
    };

    const direct = async () => {
      if (currentScene.type === "depato_intro" && lineFinished) {
        await sleep(450);
        await clickAt(50, 86);
        if (!cancelled) {
          retroAudio.startBgm("depato_sunny");
          goToScene(1);
        }
      } else if (currentScene.type === "depato_counter_clue" && lineFinished && !choiceTaken) {
        if (!checkedWindow) {
          await sleep(450);
          setCheckedWindow(true);
          retroAudio.playClick();
        } else if (!checkedUmbrella) {
          await sleep(450);
          setCheckedUmbrella(true);
          retroAudio.playClick();
        } else if (currentScene.minigame) {
          await sleep(550);
          await clickAt(50, 86);
          if (!cancelled) void handleSelectChoice(currentScene.minigame.choices[0]);
        }
      } else if (
        (currentScene.type === "depato_step_rain" || currentScene.type === "depato_campus_reveal") &&
        lineFinished
      ) {
        await sleep(750);
        await clickAt(50, 86);
        if (!cancelled) goToScene(sceneIdx + 1);
      } else if (currentScene.type === "depato_outro" && lineFinished) {
        await sleep(1200);
        if (!cancelled) window.__JP_STORY_DONE__ = true;
      }
    };
    void direct();
    return () => {
      cancelled = true;
    };
  }, [
    assetsReady,
    autoplay,
    checkedUmbrella,
    checkedWindow,
    choiceTaken,
    currentScene,
    goToScene,
    handleSelectChoice,
    lineFinished,
    sceneIdx,
  ]);

  // Main 60fps Canvas Render Loop
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

        switch (currentScene.type) {
          case "depato_intro": {
            const zoom = 1 + Math.min(elapsed * 0.007, 0.05);
            ctx.save();
            ctx.translate(VIRTUAL_W * 0.5, VIRTUAL_H * 0.45);
            ctx.scale(zoom, zoom);
            ctx.translate(-VIRTUAL_W * 0.5, -VIRTUAL_H * 0.45);
            if (imgs["bg:counter"]) ctx.drawImage(imgs["bg:counter"], 0, 0, VIRTUAL_W, VIRTUAL_H);
            ctx.restore();

            drawMusicNotes(ctx, t, "sunny");
            drawCinemaBottomFade(ctx, 0.65);

            // Title banner
            ctx.save();
            ctx.font = 'bold 19px "DotGothic16", monospace';
            ctx.textAlign = "center";
            ctx.fillStyle = "rgba(12, 15, 28, 0.85)";
            ctx.fillText(currentScene.bannerTitle ?? "デパートの雨の音楽", VIRTUAL_W / 2 + 1, 56);
            ctx.fillStyle = "#ffe69c";
            ctx.fillText(currentScene.bannerTitle ?? "デパートの雨の音楽", VIRTUAL_W / 2, 54);
            ctx.font = 'bold 9px "DotGothic16", monospace';
            ctx.fillStyle = "#8ad4ff";
            ctx.fillText("JLPT N4 07/2025 · 問題５", VIRTUAL_W / 2, 68);
            ctx.restore();
            break;
          }

          case "depato_counter_clue": {
            if (imgs["bg:counter"]) ctx.drawImage(imgs["bg:counter"], 0, 0, VIRTUAL_W, VIRTUAL_H);
            // Subtle cool mood tint when Rain Signal BGM starts playing from ceiling speakers
            if (bgmMode === "rain") {
              ctx.fillStyle = "rgba(38, 76, 128, 0.16)";
              ctx.fillRect(0, 0, VIRTUAL_W, VIRTUAL_H);
            }
            drawMusicNotes(ctx, t, bgmMode);
            drawCinemaBottomFade(ctx, 0.8);

            // Frameless Student (left) & Department Store Clerk (right)
            drawFramelessCharacter(ctx, imgs["p:student"], "left", {
              talking: speakingRef.current === "student",
              active: speakingRef.current !== "clerk",
              enterProgress: Math.min(elapsed / 0.5, 1),
              t,
            });
            drawFramelessCharacter(ctx, imgs["p:clerk"], "right", {
              talking: speakingRef.current === "clerk",
              active: speakingRef.current === "clerk",
              enterProgress: Math.min(elapsed / 0.6, 1),
              t,
            });
            break;
          }

          case "depato_step_rain": {
            const zoom = 1 + Math.min(elapsed * 0.008, 0.05);
            ctx.save();
            ctx.translate(VIRTUAL_W * 0.48, VIRTUAL_H * 0.5);
            ctx.scale(zoom, zoom);
            ctx.translate(-VIRTUAL_W * 0.48, -VIRTUAL_H * 0.5);
            if (imgs["bg:rain"]) ctx.drawImage(imgs["bg:rain"], 0, 0, VIRTUAL_W, VIRTUAL_H);
            ctx.restore();

            drawCityRain(ctx, t);
            drawCinemaBottomFade(ctx, 0.78);
            drawFramelessCharacter(ctx, imgs["p:student"], "left", {
              talking: speakingRef.current === "student",
              active: true,
              enterProgress: Math.min(elapsed / 0.5, 1),
              t,
            });
            break;
          }

          case "depato_campus_reveal": {
            if (imgs["bg:campus"]) ctx.drawImage(imgs["bg:campus"], 0, 0, VIRTUAL_W, VIRTUAL_H);
            drawSunlitMotes(ctx, t);
            drawMusicNotes(ctx, t, bgmMode);
            drawCinemaBottomFade(ctx, 0.8);

            drawFramelessCharacter(ctx, imgs["p:student"], "left", {
              talking: speakingRef.current === "student",
              active: speakingRef.current !== "kitamura",
              enterProgress: Math.min(elapsed / 0.5, 1),
              t,
            });
            drawFramelessCharacter(ctx, imgs["p:kitamura"], "right", {
              talking: speakingRef.current === "kitamura",
              active: speakingRef.current === "kitamura",
              enterProgress: Math.min(elapsed / 0.6, 1),
              t,
            });
            break;
          }

          case "depato_outro": {
            const zoom = 1 + Math.min(elapsed * 0.005, 0.04);
            ctx.save();
            ctx.translate(VIRTUAL_W * 0.52, VIRTUAL_H * 0.45);
            ctx.scale(zoom, zoom);
            ctx.translate(-VIRTUAL_W * 0.52, -VIRTUAL_H * 0.45);
            if (imgs["bg:campus"]) ctx.drawImage(imgs["bg:campus"], 0, 0, VIRTUAL_W, VIRTUAL_H);
            ctx.restore();

            drawSunlitMotes(ctx, t);
            drawMusicNotes(ctx, t, "rain");
            drawCinemaBottomFade(ctx, 0.72);
            break;
          }
        }

        // Bayer 4x4 transition
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
  }, [assetsReady, bgmMode, currentScene]);

  const cluesDone = checkedWindow && checkedUmbrella;

  return (
    <div className="canvas-viewport">
      <canvas
        ref={canvasRef}
        width={VIRTUAL_W}
        height={VIRTUAL_H}
        className="pixel-canvas"
      />

      {/* Live BGM status pill in Scene 2 & Scene 4 */}
      {(currentScene.type === "depato_counter_clue" ||
        currentScene.type === "depato_campus_reveal") && (
        <div
          className="scene-hud-top"
          style={{
            borderColor: bgmMode === "rain" ? "#8ad4ff" : "#ffd875",
            color: bgmMode === "rain" ? "#8ad4ff" : "#ffd875",
          }}
        >
          {bgmMode === "rain"
            ? "♪ BGM SIÊU THỊ: ☔ Giai điệu báo trời mưa (特別な音楽)"
            : "♪ BGM SIÊU THỊ: ☀️ Nhạc mua sắm thông thường"}
        </div>
      )}

      {currentScene.type === "depato_counter_clue" && (
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
          {currentScene.whoButtonLabel ?? "? Đề thi JLPT"}
        </button>
      )}

      {/* Interactive BGM Switcher in Scene 4 so learners hear the real secret! */}
      {currentScene.type === "depato_campus_reveal" && (
        <div
          style={{
            position: "absolute",
            top: "52px",
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            gap: "8px",
          }}
        >
          <button
            type="button"
            className={`pixel-icon-btn ${bgmMode === "sunny" ? "active" : ""}`}
            onClick={() => switchStoreBgm("sunny")}
          >
            ☀️ Nghe nhạc nắng
          </button>
          <button
            type="button"
            className={`pixel-icon-btn ${bgmMode === "rain" ? "active" : ""}`}
            onClick={() => switchStoreBgm("rain")}
          >
            ☔ Nghe nhạc báo mưa
          </button>
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

        {currentScene.type === "depato_intro" && (
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

        {/* Scene 2: Interactive room clue check -> then reply to clerk */}
        {currentScene.type === "depato_counter_clue" && lineFinished && !choiceTaken && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <div className="choice-row">
              <button
                type="button"
                className={`pixel-icon-btn ${checkedWindow ? "active" : ""}`}
                onClick={() => {
                  retroAudio.playClick();
                  setCheckedWindow(true);
                }}
              >
                {checkedWindow
                  ? "✓ Xung quanh KHÔNG có cửa sổ (窓もない)"
                  : "🔍 Kiểm tra xung quanh quầy"}
              </button>
              <button
                type="button"
                className={`pixel-icon-btn ${checkedUmbrella ? "active" : ""}`}
                onClick={() => {
                  retroAudio.playClick();
                  setCheckedUmbrella(true);
                }}
              >
                {checkedUmbrella
                  ? "✓ KHÔNG có ai cầm ô (傘の人もいない)"
                  : "☂️ Quan sát khách mua hàng"}
              </button>
            </div>
            {cluesDone && currentScene.minigame && (
              <button
                type="button"
                className="pixel-btn pixel-btn-purple"
                onClick={() => void handleSelectChoice(currentScene.minigame!.choices[0])}
              >
                💬 「お願いします。」→ Ra cửa xem trời có mưa thật không!
              </button>
            )}
          </div>
        )}

        {(currentScene.type === "depato_step_rain" ||
          currentScene.type === "depato_campus_reveal") &&
          lineFinished && (
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

        {currentScene.type === "depato_outro" && lineFinished && (
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
