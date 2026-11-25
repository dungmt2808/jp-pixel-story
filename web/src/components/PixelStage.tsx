import { useCallback, useEffect, useRef, useState } from "react";
import { retroAudio } from "../audio/chiptune";
import { drawBayerDitherOverlay } from "../engine/bayerDither";
import {
  VIRTUAL_H,
  VIRTUAL_W,
  drawCloseupChoice,
  drawDragCounter,
  drawExteriorZoom,
  drawKonbiniInterior,
  drawOutroCelebrate,
  drawSkylineIntro,
  type DragSceneState,
} from "../engine/pixelRenderer";
import type { DialogueLine, MiniGameChoice, StoryData } from "../types/story";
import { CharacterCardModal } from "./CharacterCardModal";
import { RubyText } from "./RubyText";
import { resolveAssetUrl } from "../utils/assetUrl";
import { rubySegmentsToRomaji } from "../utils/romaji";

interface PixelStageProps {
  story: StoryData;
  showFurigana: boolean;
  showRomaji: boolean;
  muted: boolean;
  autoplay: boolean;
  onOpenReading: () => void;
}

declare global {
  interface Window {
    __JP_STORY_DONE__?: boolean;
    __JP_STORY_EVENTS__?: Array<{ timeMs: number; type: string; audioUrl?: string }>;
  }
}

export function PixelStage({
  story,
  showFurigana,
  showRomaji,
  muted,
  autoplay,
  onOpenReading,
}: PixelStageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);

  const [sceneIdx, setSceneIdx] = useState(0);
  const [activeLine, setActiveLine] = useState<DialogueLine | null>(null);
  const [lineFinished, setLineFinished] = useState(false);
  const [showCard, setShowCard] = useState(false);

  // Scene 4 drag state
  const dragRef = useRef<DragSceneState>({
    onigiriX: 64,
    onigiriY: 136,
    isDragging: false,
    scanned: false,
    scanFlash: 0,
  });
  const [dragScanned, setDragScanned] = useState(false);

  // Scene 5 choice state
  const [chosenEffect, setChosenEffect] = useState<string | null>(null);
  const effectStartRef = useRef<number>(0);
  const [warmedResult, setWarmedResult] = useState(true);

  // Bayer dither transition state (0..1)
  const transitionRef = useRef<{
    active: boolean;
    phase: "out" | "in";
    amount: number;
    nextIdx: number;
  }>({ active: false, phase: "out", amount: 0, nextIdx: 0 });

  const sceneStartRef = useRef<number>(performance.now());
  const stageStartRef = useRef<number>(performance.now());

  // Virtual cursor for ?autoplay=true
  const [cursorPos, setCursorPos] = useState({ x: 50, y: 55, clicking: false });

  const currentScene = story.scenes[sceneIdx];

  const logEvent = useCallback((type: string, audioUrl?: string) => {
    if (!window.__JP_STORY_EVENTS__) window.__JP_STORY_EVENTS__ = [];
    window.__JP_STORY_EVENTS__.push({
      timeMs: Math.round(performance.now() - stageStartRef.current),
      type,
      audioUrl,
    });
  }, []);

  const stopVoice = useCallback(() => {
    if (audioElRef.current) {
      audioElRef.current.pause();
      audioElRef.current.currentTime = 0;
    }
    retroAudio.setDucked(false);
  }, []);

  const playVoiceLine = useCallback(
    (line: DialogueLine): Promise<void> => {
      return new Promise((resolve) => {
        setActiveLine(line);
        logEvent("voice", line.audioUrl);

        if (!line.audioUrl) {
          const fallbackMs = Math.max(1800, (line.durationSec ?? 2.5) * 1000);
          window.setTimeout(resolve, fallbackMs);
          return;
        }

        stopVoice();
        const audio = new Audio(resolveAssetUrl(line.audioUrl));
        audio.muted = muted;
        audioElRef.current = audio;
        retroAudio.setDucked(true);

        let settled = false;
        const done = () => {
          if (settled) return;
          settled = true;
          retroAudio.setDucked(false);
          resolve();
        };

        audio.addEventListener("ended", done, { once: true });
        audio.addEventListener("error", () => {
          window.setTimeout(done, Math.max(1500, (line.durationSec ?? 2.2) * 1000));
        });

        audio.play().catch(() => {
          // Browser autoplay policy fallback (wait for expected duration)
          window.setTimeout(done, Math.max(1500, (line.durationSec ?? 2.4) * 1000));
        });
      });
    },
    [logEvent, muted, stopVoice]
  );

  useEffect(() => {
    if (audioElRef.current) {
      audioElRef.current.muted = muted;
    }
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

  // Run scene narration sequence whenever sceneIdx changes
  useEffect(() => {
    let cancelled = false;
    sceneStartRef.current = performance.now();
    setLineFinished(false);
    setActiveLine(null);

    if (currentScene.type === "drag_counter") {
      dragRef.current = {
        onigiriX: 64,
        onigiriY: 136,
        isDragging: false,
        scanned: false,
        scanFlash: 0,
      };
      setDragScanned(false);
    }
    if (currentScene.type === "closeup_choice") {
      setChosenEffect(null);
    }

    const runLines = async () => {
      // Scene 4 plays its line AFTER user drags onigiri onto counter
      if (currentScene.type === "drag_counter") {
        return;
      }

      if (currentScene.type === "konbini_walkin") {
        // Wait briefly for Minh to walk into frame
        await new Promise((r) => window.setTimeout(r, 900));
      }

      for (const line of currentScene.lines) {
        if (cancelled) return;
        await playVoiceLine(line);
        if (cancelled) return;
        await new Promise((r) => window.setTimeout(r, 380));
      }

      if (cancelled) return;
      setLineFinished(true);

      // Scene 2 (exterior zoom) automatically transitions inside after narration
      if (currentScene.type === "exterior_zoom") {
        await new Promise((r) => window.setTimeout(r, 500));
        if (!cancelled) goToScene(sceneIdx + 1);
      }

      if (currentScene.type === "outro_celebrate") {
        retroAudio.playFanfare();
      }
    };

    void runLines();
    return () => {
      cancelled = true;
      stopVoice();
    };
  }, [sceneIdx, currentScene, playVoiceLine, goToScene, stopVoice]);

  // Handle Drag Completion (Scene 4)
  const completeDragScan = useCallback(async () => {
    if (dragRef.current.scanned) return;
    dragRef.current.scanned = true;
    dragRef.current.isDragging = false;
    dragRef.current.onigiriX = 212;
    dragRef.current.onigiriY = 122;
    dragRef.current.scanFlash = 1;
    setDragScanned(true);
    retroAudio.playBeepScan();

    const line = currentScene.lines[0];
    if (line) {
      await playVoiceLine(line);
    }
    await new Promise((r) => window.setTimeout(r, 650));
    goToScene(sceneIdx + 1);
  }, [currentScene, goToScene, playVoiceLine, sceneIdx]);

  // Handle Choice Selection (Scene 5)
  const handleSelectChoice = useCallback(
    async (choice: MiniGameChoice) => {
      if (chosenEffect) return;
      retroAudio.playClick();
      setChosenEffect(choice.effect);
      effectStartRef.current = performance.now();
      setWarmedResult(choice.effect === "microwave");

      await playVoiceLine(choice.responseLine);

      if (choice.effect === "microwave") {
        await new Promise((r) => window.setTimeout(r, 1200));
        retroAudio.playMicrowaveDing();
        await new Promise((r) => window.setTimeout(r, 950));
      } else {
        await new Promise((r) => window.setTimeout(r, 900));
      }

      goToScene(sceneIdx + 1);
    },
    [chosenEffect, goToScene, playVoiceLine, sceneIdx]
  );

  // Autoplay director for hands-free demo & Playwright MP4 recording (?autoplay=true)
  useEffect(() => {
    if (!autoplay) return;
    let cancelled = false;
    const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

    const clickAt = async (xPct: number, yPct: number) => {
      setCursorPos({ x: xPct, y: yPct, clicking: false });
      await sleep(520);
      if (cancelled) return;
      setCursorPos({ x: xPct, y: yPct, clicking: true });
      await sleep(160);
      if (cancelled) return;
      setCursorPos({ x: xPct, y: yPct, clicking: false });
    };

    const directScene = async () => {
      if (currentScene.type === "skyline_intro" && lineFinished) {
        await sleep(500);
        if (cancelled) return;
        await clickAt(50, 86);
        if (!cancelled) {
          retroAudio.startBgm();
          retroAudio.playClick();
          goToScene(1);
        }
      } else if (currentScene.type === "konbini_walkin" && lineFinished) {
        await sleep(400);
        if (cancelled) return;
        await clickAt(25, 29);
        if (cancelled) return;
        setShowCard(true);
        retroAudio.playClick();
        await sleep(2400);
        if (cancelled) return;
        setShowCard(false);
        await sleep(300);
        await clickAt(50, 88);
        if (!cancelled) {
          retroAudio.playClick();
          goToScene(sceneIdx + 1);
        }
      } else if (currentScene.type === "drag_counter" && !dragScanned) {
        await sleep(800);
        if (cancelled) return;
        // Move virtual cursor to Onigiri A (20%, 68%) then drag smoothly along arc to Tray B (66%, 61%)
        setCursorPos({ x: 20, y: 68, clicking: false });
        await sleep(550);
        if (cancelled) return;
        setCursorPos({ x: 20, y: 68, clicking: true });
        dragRef.current.isDragging = true;

        const steps = 28;
        for (let i = 0; i <= steps; i++) {
          if (cancelled) return;
          const u = i / steps;
          const ox = 64 + (212 - 64) * u;
          const oy = 136 - Math.sin(u * Math.PI) * 58 - u * 14;
          dragRef.current.onigiriX = ox;
          dragRef.current.onigiriY = oy;
          setCursorPos({
            x: (ox / VIRTUAL_W) * 100,
            y: (oy / VIRTUAL_H) * 100,
            clicking: true,
          });
          await sleep(32);
        }
        setCursorPos({ x: 66, y: 61, clicking: false });
        if (!cancelled) void completeDragScan();
      } else if (
        currentScene.type === "closeup_choice" &&
        lineFinished &&
        !chosenEffect &&
        currentScene.minigame
      ) {
        await sleep(600);
        if (cancelled) return;
        await clickAt(36, 86);
        if (!cancelled) {
          void handleSelectChoice(currentScene.minigame.choices[0]);
        }
      } else if (currentScene.type === "outro_celebrate" && lineFinished) {
        await sleep(1400);
        if (!cancelled) {
          window.__JP_STORY_DONE__ = true;
          logEvent("done");
        }
      }
    };

    void directScene();
    return () => {
      cancelled = true;
    };
  }, [
    autoplay,
    chosenEffect,
    completeDragScan,
    currentScene,
    dragScanned,
    goToScene,
    handleSelectChoice,
    lineFinished,
    logEvent,
    sceneIdx,
  ]);

  // Main 60fps Canvas Render Loop
  useEffect(() => {
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

        if (dragRef.current.scanFlash > 0) {
          dragRef.current.scanFlash = Math.max(0, dragRef.current.scanFlash - dt * 2.5);
        }

        switch (currentScene.type) {
          case "skyline_intro":
            drawSkylineIntro(ctx, t, currentScene.bannerTitle);
            break;
          case "exterior_zoom":
            drawExteriorZoom(ctx, t, elapsed);
            break;
          case "konbini_walkin":
            drawKonbiniInterior(ctx, t, elapsed);
            break;
          case "drag_counter":
            drawDragCounter(ctx, t, dragRef.current);
            break;
          case "closeup_choice":
            drawCloseupChoice(
              ctx,
              t,
              chosenEffect,
              chosenEffect ? (now - effectStartRef.current) / 1000 : 0
            );
            break;
          case "outro_celebrate":
            drawOutroCelebrate(ctx, t, warmedResult);
            break;
        }

        // Update & draw Bayer Dither scene transition
        const tr = transitionRef.current;
        if (tr.active) {
          if (tr.phase === "out") {
            tr.amount += dt * 3.1;
            if (tr.amount >= 1) {
              tr.amount = 1;
              tr.phase = "in";
              setSceneIdx(tr.nextIdx);
            }
          } else {
            tr.amount -= dt * 3.1;
            if (tr.amount <= 0) {
              tr.amount = 0;
              tr.active = false;
            }
          }
          drawBayerDitherOverlay(ctx, tr.amount);
        }
      }

      rafId = window.requestAnimationFrame(render);
    };

    rafId = window.requestAnimationFrame(render);
    return () => window.cancelAnimationFrame(rafId);
  }, [chosenEffect, currentScene, warmedResult]);

  // Pointer helpers for Scene 4 Drag & Drop
  const toVirtualCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      vx: ((e.clientX - rect.left) / rect.width) * VIRTUAL_W,
      vy: ((e.clientY - rect.top) / rect.height) * VIRTUAL_H,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (currentScene.type !== "drag_counter" || dragRef.current.scanned) return;
    const { vx, vy } = toVirtualCoords(e);
    const dx = vx - dragRef.current.onigiriX;
    const dy = vy - dragRef.current.onigiriY;
    if (Math.hypot(dx, dy) <= 32) {
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current.isDragging = true;
      retroAudio.playClick();
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (currentScene.type !== "drag_counter" || !dragRef.current.isDragging) return;
    const { vx, vy } = toVirtualCoords(e);
    dragRef.current.onigiriX = Math.max(24, Math.min(VIRTUAL_W - 24, vx));
    dragRef.current.onigiriY = Math.max(24, Math.min(VIRTUAL_H - 24, vy));

    // Check drop zone over Checkout Scanner Tray B (212, 130)
    if (Math.hypot(vx - 212, vy - 130) <= 44) {
      void completeDragScan();
    }
  };

  const handlePointerUp = () => {
    if (currentScene.type !== "drag_counter" || dragRef.current.scanned) return;
    if (dragRef.current.isDragging) {
      dragRef.current.isDragging = false;
      // Snap back gently if dropped outside Tray B
      dragRef.current.onigiriX = 64;
      dragRef.current.onigiriY = 136;
    }
  };

  const handleBeginClick = () => {
    retroAudio.startBgm();
    retroAudio.playClick();
    goToScene(1);
  };

  const handleReplay = () => {
    retroAudio.playClick();
    goToScene(0);
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
            currentScene.type === "drag_counter" && !dragScanned
              ? "grab"
              : "default",
        }}
      />

      {/* Scene-specific top HUD banner */}
      {currentScene.type === "exterior_zoom" && currentScene.locationBadge && (
        <div className="scene-hud-top">{currentScene.locationBadge}</div>
      )}

      {currentScene.type === "drag_counter" && !dragScanned && (
        <div className="scene-hud-top">
          {currentScene.instruction ?? "DRAG ONIGIRI A TO REGISTER TRAY B"}
        </div>
      )}

      {/* Scene 3 floating "? WHO IS HE" button */}
      {currentScene.type === "konbini_walkin" && (
        <button
          type="button"
          className="pixel-btn pixel-btn-cream who-btn-floating"
          onClick={() => {
            retroAudio.playClick();
            setShowCard(true);
          }}
        >
          {currentScene.whoButtonLabel ?? "? この人はだれ"}
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
            {showRomaji && (
              <div className="subtitle-romaji">
                {activeLine.romaji ?? rubySegmentsToRomaji(activeLine.jaRuby)}
              </div>
            )}
            <div className="subtitle-vi">{activeLine.vi}</div>
          </div>
        )}

        {/* Scene 1: BEGIN button */}
        {currentScene.type === "skyline_intro" && (
          <button
            type="button"
            className="pixel-btn pixel-btn-cream"
            onClick={handleBeginClick}
          >
            ▶ {currentScene.actionLabel ?? "はじめる · BEGIN"}
          </button>
        )}

        {/* Scene 3: BUY ONIGIRI button */}
        {currentScene.type === "konbini_walkin" && lineFinished && (
          <button
            type="button"
            className="pixel-btn pixel-btn-purple"
            onClick={() => {
              retroAudio.playClick();
              goToScene(sceneIdx + 1);
            }}
          >
            {currentScene.actionLabel ?? "おにぎりを買う →"}
          </button>
        )}

        {/* Scene 5: Japanese response choices */}
        {currentScene.type === "closeup_choice" &&
          lineFinished &&
          !chosenEffect &&
          currentScene.minigame && (
            <div className="choice-row">
              {currentScene.minigame.choices.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="choice-card-btn"
                  onClick={() => void handleSelectChoice(c)}
                >
                  <span className="choice-ja">{c.labelJa}</span>
                  <span className="choice-vi">{c.labelVi}</span>
                </button>
              ))}
            </div>
          )}

        {/* Scene 6: Outro buttons -> Reading View / Card / Replay */}
        {currentScene.type === "outro_celebrate" && lineFinished && (
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
              className="pixel-btn pixel-btn-cream"
              onClick={() => {
                retroAudio.playClick();
                setShowCard(true);
              }}
            >
              THẺ NHÂN VẬT
            </button>
            <button
              type="button"
              className="pixel-btn pixel-btn-dark"
              onClick={handleReplay}
            >
              ↺ CHƠI LẠI
            </button>
          </div>
        )}
      </div>

      {currentScene.type === "skyline_intro" && (
        <div className="credit-footer">by {story.author} · VOICEVOX</div>
      )}

      {/* Character Card Modal */}
      {showCard && (
        <CharacterCardModal
          card={story.characterCard}
          onClose={() => {
            retroAudio.playClick();
            setShowCard(false);
          }}
        />
      )}

      {/* Crisp SVG pixel cursor for ?autoplay=true recording */}
      {autoplay && (
        <svg
          className={`virtual-cursor ${cursorPos.clicking ? "clicking" : ""}`}
          style={{ left: `${cursorPos.x}%`, top: `${cursorPos.y}%` }}
          viewBox="0 0 16 16"
        >
          <path
            d="M1 1 L1 13 L4.5 9.5 L7.5 15 L9.5 14 L6.5 8.5 L11.5 8.5 Z"
            fill="#f5f1e6"
            stroke="#0b0e1a"
            strokeWidth="1.4"
          />
        </svg>
      )}
    </div>
  );
}
