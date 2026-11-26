import { useCallback, useEffect, useRef, useState } from "react";
import { retroAudio } from "../audio/chiptune";
import type { DialogueLine, StoryData } from "../types/story";
import { resolveAssetUrl } from "../utils/assetUrl";
import { drawBayerDitherOverlay } from "./bayerDither";
import { VIRTUAL_H, VIRTUAL_W } from "./pixelRenderer";
import { loadSpriteSheet, type SpriteSheet } from "./spriteAnimator";
import {
  backingScale,
  idleTransition,
  isRecordMode,
  logStoryEvent,
  stepTransition,
  voiceHoldMs,
  type TransitionState,
} from "./stageRuntime";

export type StageDrawFn = (ctx: CanvasRenderingContext2D, now: number, dt: number) => void;

/**
 * Blit the 320x200 virtual frame onto the visible canvas at a WHOLE-NUMBER scale.
 * The browser then only has to shrink that slightly (smoothly) to the CSS size, so every
 * virtual pixel ends up the same size on screen (no 3px/4px column banding at odd widths).
 */
function present(canvas: HTMLCanvasElement, buffer: HTMLCanvasElement): void {
  const cssW = canvas.getBoundingClientRect().width || VIRTUAL_W;
  const k = backingScale(cssW, VIRTUAL_W, window.devicePixelRatio || 1);
  if (canvas.width !== VIRTUAL_W * k || canvas.height !== VIRTUAL_H * k) {
    canvas.width = VIRTUAL_W * k;
    canvas.height = VIRTUAL_H * k;
    canvas.style.imageRendering = "auto";
  }
  const out = canvas.getContext("2d");
  if (!out) return;
  out.imageSmoothingEnabled = false;
  out.drawImage(buffer, 0, 0, canvas.width, canvas.height);
}

/**
 * Everything the interactive stages used to copy-paste: asset + sprite preloading, VOICEVOX
 * line playback (with autoplay-safe timing and deterministic record mode), Bayer scene
 * transitions, the render loop with integer-scaled presentation, and exporter signals.
 */
export function useStageRuntime({ story, muted }: { story: StoryData; muted: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bufferRef = useRef<HTMLCanvasElement | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const voiceTimerRef = useRef<number | null>(null);
  const imagesRef = useRef<Record<string, HTMLImageElement>>({});
  const spritesRef = useRef<Record<string, SpriteSheet>>({});
  const mutedRef = useRef(muted);

  const [assetsReady, setAssetsReady] = useState(false);
  const [sceneIdx, setSceneIdx] = useState(0);
  const [activeLine, setActiveLine] = useState<DialogueLine | null>(null);

  const transitionRef = useRef<TransitionState>(idleTransition());
  const sceneStartRef = useRef<number>(performance.now());
  const stageStartRef = useRef<number>(performance.now());
  const speakingRef = useRef<string | null>(null);
  const recordMode = useRef(isRecordMode()).current;

  // Preload every PNG + spritesheet declared in story.assets
  useEffect(() => {
    let cancelled = false;
    window.__JP_STAGE_READY__ = false;
    const images: Record<string, HTMLImageElement> = {};
    const sprites: Record<string, SpriteSheet> = {};
    const jobs: Promise<void>[] = [];
    const addImage = (key: string, url: string) =>
      jobs.push(
        new Promise<void>((resolve) => {
          const im = new Image();
          im.onload = () => {
            images[key] = im;
            resolve();
          };
          im.onerror = () => {
            console.warn(`[stage] image failed to load: ${url}`);
            resolve();
          };
          im.src = resolveAssetUrl(url);
        })
      );
    const a = story.assets;
    if (a) {
      for (const [k, v] of Object.entries(a.backgrounds ?? {})) addImage(`bg:${k}`, v);
      for (const [k, v] of Object.entries(a.portraits ?? {})) addImage(`p:${k}`, v);
      for (const [k, v] of Object.entries(a.items ?? {})) addImage(`i:${k}`, v);
      for (const [k, v] of Object.entries(a.sprites ?? {})) {
        jobs.push(
          loadSpriteSheet(resolveAssetUrl(v))
            .then((s) => {
              sprites[k] = s;
            })
            .catch((err) => console.warn(`[stage] sprite "${k}" failed: ${String(err)}`))
        );
      }
    }
    void Promise.all(jobs).then(() => {
      if (cancelled) return;
      imagesRef.current = images;
      spritesRef.current = sprites;
      stageStartRef.current = performance.now();
      setAssetsReady(true);
      window.__JP_STAGE_READY__ = true;
    });
    return () => {
      cancelled = true;
    };
  }, [story]);

  useEffect(() => {
    mutedRef.current = muted;
    if (audioElRef.current) audioElRef.current.muted = muted;
    retroAudio.setMuted(muted);
  }, [muted]);

  const stopVoice = useCallback(() => {
    if (audioElRef.current) {
      audioElRef.current.pause();
      audioElRef.current.currentTime = 0;
      audioElRef.current = null;
    }
    if (voiceTimerRef.current !== null) {
      window.clearTimeout(voiceTimerRef.current);
      voiceTimerRef.current = null;
    }
    speakingRef.current = null;
    retroAudio.setDucked(false);
  }, []);

  /**
   * Show the subtitle and speak `line`; resolves when the line is finished.
   * - record mode: no browser audio, waits exactly `durationSec` (exporter muxes the clip);
   * - autoplay blocked / decode error: waits the real `durationSec` instead of skipping ahead.
   */
  const playVoiceLine = useCallback(
    (line: DialogueLine): Promise<void> =>
      new Promise((resolve) => {
        stopVoice();
        setActiveLine(line);
        speakingRef.current = line.voice;
        logStoryEvent(
          { type: "voice", audioUrl: line.audioUrl, durationSec: line.durationSec, lineId: line.id },
          stageStartRef.current
        );
        const finish = () => {
          speakingRef.current = null;
          retroAudio.setDucked(false);
          resolve();
        };
        const holdFor = (ms: number) => {
          voiceTimerRef.current = window.setTimeout(() => {
            voiceTimerRef.current = null;
            finish();
          }, ms);
        };

        if (!line.audioUrl) {
          holdFor(Math.max(1800, voiceHoldMs(line.durationSec)));
          return;
        }
        retroAudio.setDucked(true);
        if (recordMode) {
          holdFor(Math.round((line.durationSec ?? 2.5) * 1000));
          return;
        }
        const audio = new Audio(resolveAssetUrl(line.audioUrl));
        audio.muted = mutedRef.current;
        audioElRef.current = audio;
        let settled = false;
        let fellBack = false;
        const done = () => {
          if (settled) return;
          settled = true;
          if (audioElRef.current === audio) audioElRef.current = null;
          finish();
        };
        const fallback = () => {
          if (fellBack || settled) return;
          fellBack = true;
          voiceTimerRef.current = window.setTimeout(() => {
            voiceTimerRef.current = null;
            done();
          }, voiceHoldMs(line.durationSec));
        };
        audio.addEventListener("ended", done, { once: true });
        audio.addEventListener("error", fallback, { once: true });
        audio.play().catch(fallback);
      }),
    [recordMode, stopVoice]
  );

  const goToScene = useCallback(
    (targetIdx: number) => {
      if (transitionRef.current.active) return;
      stopVoice();
      retroAudio.playTransition();
      transitionRef.current = { active: true, phase: "out", amount: 0, nextIdx: targetIdx };
    },
    [stopVoice]
  );

  useEffect(() => {
    if (!assetsReady) return;
    logStoryEvent({ type: "scene", sceneIdx }, stageStartRef.current);
  }, [assetsReady, sceneIdx]);

  const markDone = useCallback(() => {
    logStoryEvent({ type: "done" }, stageStartRef.current);
    window.__JP_STORY_DONE__ = true;
  }, []);

  /**
   * Start the 60 fps loop. `draw` paints the 320x200 virtual frame; the runtime then advances
   * and paints the Bayer transition and presents the frame at an integer scale.
   * Returns the cleanup function (use it as the effect's return value).
   */
  const startLoop = useCallback((draw: StageDrawFn, transitionColor = "#101322", transitionSpeed = 2.8) => {
    let rafId = 0;
    let stopped = false;
    let last = performance.now();
    const frame = (now: number) => {
      if (stopped) return;
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      const canvas = canvasRef.current;
      if (canvas) {
        let buffer = bufferRef.current;
        if (!buffer) {
          buffer = document.createElement("canvas");
          buffer.width = VIRTUAL_W;
          buffer.height = VIRTUAL_H;
          bufferRef.current = buffer;
        }
        const ctx = buffer.getContext("2d");
        if (ctx) {
          ctx.imageSmoothingEnabled = false;
          draw(ctx, now, dt);
          const tr = transitionRef.current;
          const swapTo = stepTransition(tr, dt, transitionSpeed);
          if (swapTo !== null) setSceneIdx(swapTo);
          if (tr.active) drawBayerDitherOverlay(ctx, tr.amount, transitionColor);
          present(canvas, buffer);
        }
      }
      rafId = window.requestAnimationFrame(frame);
    };
    rafId = window.requestAnimationFrame(frame);
    return () => {
      stopped = true;
      window.cancelAnimationFrame(rafId);
    };
  }, []);

  return {
    canvasRef,
    imagesRef,
    spritesRef,
    assetsReady,
    sceneIdx,
    setSceneIdx,
    activeLine,
    setActiveLine,
    transitionRef,
    sceneStartRef,
    stageStartRef,
    speakingRef,
    recordMode,
    playVoiceLine,
    stopVoice,
    goToScene,
    markDone,
    startLoop,
  };
}
