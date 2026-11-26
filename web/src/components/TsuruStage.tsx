import { useCallback, useEffect, useRef, useState } from "react";
import { retroAudio } from "../audio/chiptune";
import { VIRTUAL_H, VIRTUAL_W } from "../engine/pixelRenderer";
import { cropPixelImage, drawPixelImage } from "../engine/pixelScale";
import { useStageRuntime } from "../engine/useStageRuntime";
import type { DialogueLine, MiniGameChoice, StoryData } from "../types/story";
import { CharacterCardModal } from "./CharacterCardModal";
import { RubyText } from "./RubyText";

interface TsuruStageProps {
  story: StoryData;
  showFurigana: boolean;
  muted: boolean;
  autoplay: boolean;
  onOpenReading: () => void;
  onOpenDictation: () => void;
}

interface BurstParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function easeOutCubic(t: number): number {
  const u = clamp01(t);
  return 1 - Math.pow(1 - u, 3);
}

/** Two-layer depth-parallax snowfall */
function drawSnowflakes(
  ctx: CanvasRenderingContext2D,
  t: number,
  count = 54,
  intensity = 1
): void {
  const n = Math.round(count * intensity);
  for (let i = 0; i < n; i++) {
    const far = i % 3 !== 0;
    const speedY = far ? 11 + (i % 3) * 3 : 22 + (i % 4) * 4;
    const driftX = far ? -4 : -9;
    const sx = (i * 73) % VIRTUAL_W;
    const sy = (i * 47) % VIRTUAL_H;
    const y = (sy + t * speedY) % VIRTUAL_H;
    const x =
      ((sx + Math.sin(t * (far ? 1.1 : 1.9) + i * 1.3) * (far ? 4 : 7) + t * driftX) %
        VIRTUAL_W +
        VIRTUAL_W) %
      VIRTUAL_W;
    ctx.fillStyle = far
      ? "rgba(232, 238, 250, 0.55)"
      : "rgba(255, 252, 240, 0.92)";
    const sz = far ? 1 : i % 6 === 0 ? 2 : 1;
    ctx.fillRect(Math.round(x), Math.round(y), sz, sz);
  }
}

/** Soft snow drifting strictly inside a clipped window rect */
function drawWindowSnow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  t: number,
  intensity = 1
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  const count = Math.round(14 * intensity);
  for (let i = 0; i < count; i++) {
    const fx = x + (((i * 19 - t * 6 + Math.sin(t * 2 + i) * 3) % w) + w) % w;
    const fy = y + ((i * 13 + t * (12 + (i % 3) * 4)) % h);
    ctx.fillStyle = i % 2 === 0 ? "rgba(246, 244, 235, 0.85)" : "rgba(204, 220, 248, 0.65)";
    ctx.fillRect(Math.round(fx), Math.round(fy), 1, 1);
  }
  ctx.restore();
}

/** Curling pixel chimney smoke rising gently from the thatched minka roof */
function drawChimneySmoke(ctx: CanvasRenderingContext2D, t: number): void {
  for (let i = 0; i < 7; i++) {
    const p = (t * 0.24 + i / 7) % 1;
    const x = 246 + p * 26 + Math.sin(t * 1.8 + i * 1.4) * 3;
    const y = 41 - p * 44;
    const size = 2 + Math.floor(p * 4);
    const alpha = Math.sin(p * Math.PI) * 0.34;
    ctx.fillStyle = `rgba(218, 224, 242, ${alpha.toFixed(3)})`;
    ctx.fillRect(Math.round(x), Math.round(y), size, Math.max(2, size - 1));
  }
}

/** Warm breathing cottage shoji window glow in snowy night scenes */
function drawCottageWindowGlow(ctx: CanvasRenderingContext2D, t: number): void {
  const pulse = 0.14 + Math.sin(t * 3.1) * 0.05;
  ctx.fillStyle = `rgba(255, 206, 110, ${pulse.toFixed(3)})`;
  ctx.fillRect(235, 105, 21, 17);
  ctx.fillRect(281, 105, 23, 16);
  ctx.fillRect(284, 74, 13, 14);
}

/** Living hearth firelight, drifting embers, and curling iron-kettle steam */
function drawHearthLife(
  ctx: CanvasRenderingContext2D,
  t: number,
  fireStrength = 1
): void {
  // Subtle flickering fire glow on coals + warm bounce onto tatami
  const pulse = (0.12 + Math.sin(t * 7.2) * 0.045 + Math.sin(t * 13.1) * 0.02) * fireStrength;
  ctx.fillStyle = `rgba(255, 168, 68, ${pulse.toFixed(3)})`;
  ctx.fillRect(84, 136, 40, 22);

  const bounce = pulse * 0.4;
  ctx.fillStyle = `rgba(255, 178, 86, ${bounce.toFixed(3)})`;
  ctx.fillRect(62, 138, 86, 26);

  // Tiny rising hearth embers
  for (let i = 0; i < 5; i++) {
    const p = (t * 0.62 + i * 0.21) % 1;
    const ex = 95 + i * 5 + Math.sin(t * 4.5 + i * 1.9) * 3;
    const ey = 148 - p * 26;
    const a = (1 - p) * 0.85 * fireStrength;
    ctx.fillStyle =
      p > 0.5
        ? `rgba(244, 152, 58, ${a.toFixed(2)})`
        : `rgba(255, 232, 142, ${a.toFixed(2)})`;
    ctx.fillRect(Math.round(ex), Math.round(ey), 1, 1);
  }

  // Soft curling steam rising from the hanging black iron tetsubin kettle
  for (let i = 0; i < 6; i++) {
    const p = (t * 0.36 + i / 6) % 1;
    const sx = 98 + Math.sin(t * 2.4 + i * 1.3) * 4 + p * 3;
    const sy = 119 - p * 30;
    const a = Math.sin(p * Math.PI) * 0.28;
    const sz = p > 0.55 ? 3 : 2;
    ctx.fillStyle = `rgba(246, 238, 222, ${a.toFixed(3)})`;
    ctx.fillRect(Math.round(sx), Math.round(sy), sz, 2);
  }
}

/** Luminous drifting white crane feathers */
function drawDriftingFeathers(
  ctx: CanvasRenderingContext2D,
  t: number,
  count = 8,
  alphaScale = 1
): void {
  for (let i = 0; i < count; i++) {
    const prog = (t * 0.16 + i * (1 / count)) % 1;
    const x = 32 + ((i * 41) % (VIRTUAL_W - 64)) + Math.sin(t * 2.1 + i * 1.7) * 16;
    const y = -8 + prog * (VIRTUAL_H + 16);
    const tilt = Math.sin(t * 3 + i) > 0 ? 1 : -1;
    ctx.fillStyle = `rgba(250, 246, 234, ${(0.9 * alphaScale).toFixed(2)})`;
    ctx.fillRect(Math.round(x), Math.round(y), 4, 2);
    ctx.fillStyle = `rgba(255, 227, 140, ${(0.75 * alphaScale).toFixed(2)})`;
    ctx.fillRect(Math.round(x + 3), Math.round(y + tilt), 2, 1);
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
  const pulse = Math.sin(t * 4.6 + phase);
  if (pulse < 0.05) return;
  ctx.fillStyle = color;
  const rx = Math.round(x);
  const ry = Math.round(y);
  ctx.fillRect(rx, ry, 1, 1);
  if (pulse > 0.45) {
    ctx.fillRect(rx - 2, ry, 5, 1);
    ctx.fillRect(rx, ry - 2, 1, 5);
  }
}

/** Soft cinematic dark vignette at bottom so frameless portraits blend cleanly into the stage */
function drawCinemaBottomFade(ctx: CanvasRenderingContext2D, strength = 0.82): void {
  const grad = ctx.createLinearGradient(0, 128, 0, VIRTUAL_H);
  grad.addColorStop(0, "rgba(10, 13, 24, 0)");
  grad.addColorStop(0.65, `rgba(10, 13, 24, ${(strength * 0.55).toFixed(2)})`);
  grad.addColorStop(1, `rgba(10, 13, 24, ${strength.toFixed(2)})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 128, VIRTUAL_W, VIRTUAL_H - 128);
}

/**
 * Frameless cinematic bust staging (NO ugly floating portrait boxes!).
 * Slides seamlessly in from the side, breathes gently, dims softly when listening,
 * and crossfades cleanly between expressions.
 */
function drawFramelessCharacter(
  ctx: CanvasRenderingContext2D,
  im: HTMLImageElement | undefined,
  side: "left" | "right",
  options: {
    talking: boolean;
    active: boolean;
    enterProgress: number;
    opacity?: number;
    t: number;
    size?: number;
    bottomY?: number;
  }
): void {
  if (!im) return;
  const {
    talking,
    active,
    enterProgress,
    opacity = 1,
    t,
    size = im.naturalWidth,
    bottomY = VIRTUAL_H,
  } = options;
  const ease = easeOutCubic(enterProgress);
  const slideDist = 28 * (1 - ease);
  const focusShift = active ? 0 : side === "left" ? -5 : 5;
  const baseX = side === "left" ? 58 - Math.floor(size / 2) : 262 - Math.floor(size / 2);
  const x = Math.round(baseX + (side === "left" ? -slideDist : slideDist) + focusShift);

  const breath = Math.round(Math.sin(t * 2.2 + (side === "left" ? 0 : 1.7)) * 0.8);
  const talkBob = talking ? Math.round(Math.abs(Math.sin(t * 9.5)) * -1.8) : 0;
  const y = Math.round(bottomY - size + breath + talkBob);

  ctx.save();
  // Use brightness filter instead of low alpha for listening state so background never ghosts through!
  if (!active) {
    ctx.filter = "brightness(0.64) saturate(0.85)";
  }
  ctx.globalAlpha = clamp01(ease * opacity);
  drawPixelImage(ctx, im, x, y, size, size);
  ctx.restore();
}

export function TsuruStage({
  story,
  showFurigana,
  muted,
  autoplay,
  onOpenReading,
  onOpenDictation,
}: TsuruStageProps) {
  const rt = useStageRuntime({ story, muted });
  const {
    canvasRef,
    imagesRef,
    assetsReady,
    sceneIdx,
    activeLine,
    setActiveLine,
    sceneStartRef,
    speakingRef,
    stopVoice,
    goToScene,
    markDone,
    startLoop,
  } = rt;
  const particlesRef = useRef<BurstParticle[]>([]);

  const [lineIndex, setLineIndex] = useState(0);
  const [lineFinished, setLineFinished] = useState(false);
  const [showCard, setShowCard] = useState(false);
  const [choiceTaken, setChoiceTaken] = useState<string | null>(null);

  // Scene 2: Smooth Hold-or-Tap Snare Untie (0 -> 1)
  const untieProgressRef = useRef<number>(0);
  const holdingUntieRef = useRef<boolean>(false);
  const [untiePct, setUntiePct] = useState(0);
  const [craneFreed, setCraneFreed] = useState(false);
  const craneFreedAtRef = useRef<number | null>(null);
  const lastTickStepRef = useRef<number>(0);

  // Scene 3: Smooth expression crossfade timing for Otsū
  const lineChangedAtRef = useRef<number>(performance.now());

  // Scene 4: Interactive 3-Night Weaving Progression (1 -> 2 -> 3)
  const [nightCount, setNightCount] = useState<1 | 2 | 3>(1);
  const nightChangedAtRef = useRef<number>(performance.now());
  const nightScriptStartedRef = useRef<boolean>(false);

  // Scene 5: Real AI Pine-Painted Fusuma Double Sliding Doors (0 = closed, 1 = fully parted)
  const doorOpenRef = useRef<number>(0);
  const doorAutoGlideRef = useRef<boolean>(false);
  const doorDraggingRef = useRef<boolean>(false);
  const doorDragStartXRef = useRef<number>(0);
  const doorDragStartOpenRef = useRef<number>(0);
  const [doorRevealed, setDoorRevealed] = useState(false);

  // Bayer dither scene transition

  const [cursorPos, setCursorPos] = useState({ x: 50, y: 55, clicking: false });

  const currentScene = story.scenes[sceneIdx];

  // Stamp the line-change time so expression crossfades keep working on the shared runtime.
  const playVoiceLine = useCallback(
    (line: DialogueLine) => {
      lineChangedAtRef.current = performance.now();
      return rt.playVoiceLine(line);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rt.playVoiceLine]
  );

  const spawnBurst = useCallback(
    (x: number, y: number, count: number, colors: string[]) => {
      for (let i = 0; i < count; i++) {
        const ang = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
        const spd = 16 + Math.random() * 38;
        particlesRef.current.push({
          x,
          y,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd - 14,
          life: 0,
          maxLife: 0.45 + Math.random() * 0.45,
          color: colors[i % colors.length],
          size: Math.random() > 0.5 ? 2 : 1,
        });
      }
    },
    []
  );

  // Scene 2: Complete rescuing the white crane
  const completeCraneRescue = useCallback(async () => {
    if (craneFreedAtRef.current !== null) return;
    craneFreedAtRef.current = performance.now();
    holdingUntieRef.current = false;
    untieProgressRef.current = 1;
    setUntiePct(100);
    setCraneFreed(true);
    spawnBurst(154, 134, 16, ["#ffe38c", "#f6eed8", "#b9834b"]);
    retroAudio.playKotoChime();
    const ln = currentScene.lines[0];
    if (ln) {
      await playVoiceLine(ln);
    }
    await new Promise((r) => window.setTimeout(r, 750));
    goToScene(sceneIdx + 1);
  }, [currentScene, goToScene, playVoiceLine, sceneIdx, spawnBurst]);

  // Scene 4: Advance Night 1 -> Night 2 -> Night 3
  const handleAdvanceNight = useCallback(() => {
    if (currentScene.type !== "tsuru_weaving_choice" || nightCount >= 3) return;
    retroAudio.playLoomClack();
    nightChangedAtRef.current = performance.now();
    setNightCount((prev) => (prev === 1 ? 2 : 3));
  }, [currentScene.type, nightCount]);

  // Scene 4: Moral choice handler
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

  // Scene 5: Complete sliding the real pine fusuma doors open
  const triggerDoorReveal = useCallback(async () => {
    if (doorRevealed) return;
    setDoorRevealed(true);
    doorAutoGlideRef.current = true;
    doorDraggingRef.current = false;
    retroAudio.playSlideDoor();
    window.setTimeout(() => retroAudio.playKotoChime(), 420);
    const ln = currentScene.lines[0];
    if (ln) {
      await new Promise((r) => window.setTimeout(r, 420));
      await playVoiceLine(ln);
    }
    await new Promise((r) => window.setTimeout(r, 950));
    goToScene(sceneIdx + 1);
  }, [currentScene, doorRevealed, goToScene, playVoiceLine, sceneIdx]);

  // Scene script runner
  useEffect(() => {
    if (!assetsReady) return;
    let cancelled = false;
    sceneStartRef.current = performance.now();
    lineChangedAtRef.current = performance.now();
    particlesRef.current = [];
    setLineFinished(false);
    setActiveLine(null);
    setLineIndex(0);
    setChoiceTaken(null);

    if (currentScene.type === "tsuru_rescue_crane") {
      untieProgressRef.current = 0;
      holdingUntieRef.current = false;
      lastTickStepRef.current = 0;
      setUntiePct(0);
      setCraneFreed(false);
      craneFreedAtRef.current = null;
    }
    if (currentScene.type === "tsuru_weaving_choice") {
      setNightCount(1);
      nightChangedAtRef.current = performance.now();
      nightScriptStartedRef.current = false;
      window.setTimeout(() => {
        if (!cancelled) retroAudio.playLoomClack();
      }, 360);
    }
    if (currentScene.type === "tsuru_slide_fusuma") {
      doorOpenRef.current = 0;
      doorAutoGlideRef.current = false;
      doorDraggingRef.current = false;
      setDoorRevealed(false);
    }

    const run = async () => {
      // Scene 2, Scene 4 (waits for Night 3), and Scene 5 wait for interactive beats
      if (
        currentScene.type === "tsuru_rescue_crane" ||
        currentScene.type === "tsuru_weaving_choice" ||
        currentScene.type === "tsuru_slide_fusuma"
      ) {
        return;
      }

      for (let i = 0; i < currentScene.lines.length; i++) {
        if (cancelled) return;
        setLineIndex(i);
        lineChangedAtRef.current = performance.now();
        await playVoiceLine(currentScene.lines[i]);
        if (cancelled) return;
        await new Promise((r) => window.setTimeout(r, 460));
      }

      if (cancelled) return;
      setLineFinished(true);

      if (currentScene.type === "tsuru_farewell_sky") {
        retroAudio.playKotoChime();
      }
    };

    void run();
    return () => {
      cancelled = true;
      stopVoice();
    };
  }, [assetsReady, currentScene, playVoiceLine, stopVoice]);

  // Scene 4 Night 3 narrator + Yosaku monologue trigger
  useEffect(() => {
    if (
      !assetsReady ||
      currentScene.type !== "tsuru_weaving_choice" ||
      nightCount !== 3 ||
      nightScriptStartedRef.current
    ) {
      return;
    }
    nightScriptStartedRef.current = true;
    let cancelled = false;
    const runNight3 = async () => {
      await new Promise((r) => window.setTimeout(r, 380));
      for (let i = 0; i < currentScene.lines.length; i++) {
        if (cancelled) return;
        setLineIndex(i);
        lineChangedAtRef.current = performance.now();
        await playVoiceLine(currentScene.lines[i]);
        if (cancelled) return;
        await new Promise((r) => window.setTimeout(r, 420));
      }
      if (!cancelled) setLineFinished(true);
    };
    void runNight3();
    return () => {
      cancelled = true;
    };
  }, [assetsReady, currentScene, nightCount, playVoiceLine]);

  // Autoplay director for ?autoplay=true
  useEffect(() => {
    if (!autoplay || !assetsReady) return;
    let cancelled = false;
    const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

    const clickAt = async (xPct: number, yPct: number) => {
      setCursorPos({ x: xPct, y: yPct, clicking: false });
      await sleep(460);
      if (cancelled) return;
      setCursorPos({ x: xPct, y: yPct, clicking: true });
      await sleep(160);
      if (cancelled) return;
      setCursorPos({ x: xPct, y: yPct, clicking: false });
    };

    const direct = async () => {
      if (currentScene.type === "tsuru_snow_intro" && lineFinished) {
        await sleep(500);
        if (cancelled) return;
        await clickAt(50, 86);
        if (!cancelled) {
          retroAudio.startBgm();
          retroAudio.playClick();
          goToScene(1);
        }
      } else if (
        currentScene.type === "tsuru_rescue_crane" &&
        craneFreedAtRef.current === null
      ) {
        await sleep(550);
        setCursorPos({ x: 48, y: 66, clicking: false });
        await sleep(420);
        if (cancelled) return;
        setCursorPos({ x: 48, y: 66, clicking: true });
        holdingUntieRef.current = true;
        while (!cancelled && craneFreedAtRef.current === null) {
          await sleep(100);
        }
        setCursorPos({ x: 48, y: 66, clicking: false });
      } else if (currentScene.type === "tsuru_visitor_promise" && lineFinished) {
        await sleep(550);
        if (cancelled) return;
        await clickAt(50, 88);
        if (!cancelled) {
          retroAudio.playClick();
          goToScene(sceneIdx + 1);
        }
      } else if (currentScene.type === "tsuru_weaving_choice") {
        if (nightCount < 3) {
          await sleep(900);
          if (cancelled) return;
          await clickAt(50, 86);
          if (!cancelled) handleAdvanceNight();
        } else if (lineFinished && !choiceTaken && currentScene.minigame) {
          await sleep(550);
          if (cancelled) return;
          await clickAt(35, 86);
          if (!cancelled) void handleSelectChoice(currentScene.minigame.choices[0]);
        }
      } else if (currentScene.type === "tsuru_slide_fusuma" && !doorRevealed) {
        await sleep(650);
        setCursorPos({ x: 50, y: 52, clicking: false });
        await sleep(400);
        if (cancelled) return;
        setCursorPos({ x: 50, y: 52, clicking: true });
        for (let s = 0; s <= 20; s++) {
          if (cancelled) return;
          const u = s / 20;
          doorOpenRef.current = u * 0.62;
          setCursorPos({ x: 50 + u * 28, y: 52, clicking: true });
          await sleep(34);
        }
        setCursorPos({ x: 78, y: 52, clicking: false });
        if (!cancelled) void triggerDoorReveal();
      } else if (currentScene.type === "tsuru_farewell_sky" && lineFinished) {
        await sleep(1400);
        if (!cancelled) markDone();
      }
    };

    void direct();
    return () => {
      cancelled = true;
    };
  }, [
    assetsReady,
    autoplay,
    choiceTaken,
    currentScene,
    doorRevealed,
    goToScene,
    handleAdvanceNight,
    handleSelectChoice,
    lineFinished,
    nightCount,
    sceneIdx,
    triggerDoorReveal,
  ]);

  // Main 60fps Cinematic Pixel Art Render Loop
  useEffect(() => {
    if (!assetsReady) return;
    return startLoop((ctx, now, dt) => {

      // Scene 2: Smooth hold-to-untie progression
      if (
        currentScene.type === "tsuru_rescue_crane" &&
        holdingUntieRef.current &&
        craneFreedAtRef.current === null
      ) {
        const next = clamp01(untieProgressRef.current + dt * 0.85);
        untieProgressRef.current = next;
        const pct = Math.round(next * 100);
        setUntiePct(pct);
        const step = Math.floor(next * 4);
        if (step > lastTickStepRef.current && step < 4) {
          lastTickStepRef.current = step;
          retroAudio.playClick();
          spawnBurst(154, 134, 5, ["#f6eed8", "#b9834b"]);
        }
        if (next >= 1) {
          void completeCraneRescue();
        }
      }

      // Scene 5: Smooth automatic door glide once triggered
      if (
        currentScene.type === "tsuru_slide_fusuma" &&
        doorAutoGlideRef.current &&
        doorOpenRef.current < 1
      ) {
        doorOpenRef.current = clamp01(doorOpenRef.current + dt * 1.45);
      }

      // Update particle bursts
      if (particlesRef.current.length > 0) {
        particlesRef.current = particlesRef.current
          .map((p) => ({
            ...p,
            x: p.x + p.vx * dt,
            y: p.y + p.vy * dt,
            vy: p.vy + 46 * dt,
            life: p.life + dt,
          }))
          .filter((p) => p.life < p.maxLife);
      }

      {
        const t = now / 1000;
        const elapsed = (now - sceneStartRef.current) / 1000;
        const lineElapsed = (now - lineChangedAtRef.current) / 1000;
        const imgs = imagesRef.current;

        switch (currentScene.type) {
          case "tsuru_snow_intro": {
            // Slow cinematic Ken Burns zoom into the moonlit village
            // Static 1x backdrop: sub-pixel Ken Burns zooms smeared the pixel grid.
            ctx.save();
            if (imgs["bg:snow"]) {
              ctx.drawImage(imgs["bg:snow"], 0, 0, VIRTUAL_W, VIRTUAL_H);
            }
            drawCottageWindowGlow(ctx, t);
            drawChimneySmoke(ctx, t);

            // White crane standing gently in snowy clearing
            ctx.fillStyle = "rgba(22, 30, 56, 0.28)";
            ctx.fillRect(102, 126, 24, 3);
            if (imgs["i:crane"]) {
              const bob = Math.round(Math.sin(t * 2.2) * 0.9);
              drawPixelImage(ctx, imgs["i:crane"], 92, 83 + bob, 44, 44);
            }
            ctx.restore();

            drawSnowflakes(ctx, t, 56);
            drawSparkle(ctx, 114, 34, t, 0.4, "#ffe38c");
            drawSparkle(ctx, 212, 22, t, 1.8, "#f6eed8");
            drawCinemaBottomFade(ctx, 0.55);

            // Atmospheric Japanese folktale title clear of the crescent moon
            ctx.save();
            ctx.font = 'bold 21px "DotGothic16", monospace';
            ctx.textAlign = "center";
            ctx.fillStyle = "rgba(10, 13, 24, 0.82)";
            ctx.fillText(currentScene.bannerTitle ?? "鶴の恩返し", VIRTUAL_W / 2 + 1, 68);
            ctx.fillStyle = "#ffe69c";
            ctx.fillText(currentScene.bannerTitle ?? "鶴の恩返し", VIRTUAL_W / 2, 66);
            // Delicate golden accent rule
            ctx.fillStyle = "rgba(255, 230, 156, 0.5)";
            ctx.fillRect(VIRTUAL_W / 2 - 44, 72, 88, 1);
            ctx.restore();
            break;
          }

          case "tsuru_rescue_crane": {
            // Smooth close-up onto the snowy clearing
            // 1x backdrop: the old fixed 1.26x close-up made background texels 1-2px wide.
            ctx.save();
            if (imgs["bg:snow"]) {
              ctx.drawImage(imgs["bg:snow"], 0, 0, VIRTUAL_W, VIRTUAL_H);
            }
            drawCottageWindowGlow(ctx, t);
            drawChimneySmoke(ctx, t);
            ctx.restore();

            const freed = craneFreedAtRef.current !== null;
            const flyT = freed ? (now - craneFreedAtRef.current!) / 1000 : 0;
            const prog = untieProgressRef.current;
            const shake = holdingUntieRef.current && !freed ? Math.sin(t * 36) * 1.1 : 0;

            const cx = freed ? 132 + flyT * 52 : 126 + shake;
            const cy = freed
              ? 88 - flyT * 38 + Math.sin(flyT * 9) * 3.5
              : 88 + Math.round(Math.sin(t * 4.2) * 1);

            if (!freed) {
              // Soft ground shadow under crane
              ctx.fillStyle = "rgba(22, 30, 56, 0.32)";
              ctx.fillRect(140, 140, 28, 4);
            }

            if (imgs["i:crane"]) {
              drawPixelImage(ctx, imgs["i:crane"], Math.round(cx), Math.round(cy), 56, 56);
            }

            if (!freed) {
              // Realistic winter snare cord looped tightly around crane's ankles
              const loosen = prog * 6;
              ctx.fillStyle = "#241712";
              ctx.fillRect(Math.round(143 - loosen * 0.5), 130, 24, 3);
              ctx.fillStyle = "#8a5a36";
              ctx.fillRect(Math.round(144 - loosen * 0.5), 131, 22, 2);
              // Trailing snare cord buried into snow on right
              ctx.fillStyle = "#5c3921";
              ctx.fillRect(164, 133, 12, 2);
              ctx.fillRect(174, 135, 10, 2);
              // Pulsing warm golden interaction beacon near the knot
              const ringR = 12 + Math.sin(t * 5) * 2;
              ctx.strokeStyle = `rgba(255, 227, 140, ${(0.45 + Math.sin(t * 5) * 0.3).toFixed(2)})`;
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.arc(155, 132, ringR, 0, Math.PI * 2);
              ctx.stroke();

              // Crisp wooden-gold untie progress meter under the crane
              const barW = 76;
              const barX = 117;
              const barY = 148;
              ctx.fillStyle = "#14182a";
              ctx.fillRect(barX - 2, barY - 2, barW + 4, 9);
              ctx.fillStyle = "#f5f1e6";
              ctx.fillRect(barX - 1, barY - 1, barW + 2, 7);
              ctx.fillStyle = "#232a42";
              ctx.fillRect(barX, barY, barW, 5);
              ctx.fillStyle = prog > 0.7 ? "#63d9b4" : "#ffd875";
              ctx.fillRect(barX, barY, Math.round(barW * prog), 5);
            } else {
              // Celebratory sparkles & drifting white feathers as crane lifts off
              drawSparkle(ctx, cx + 10, cy + 16, t, 0.2);
              drawSparkle(ctx, cx + 44, cy + 8, t, 1.3);
              drawDriftingFeathers(ctx, t, 7, 0.9);
              drawCinemaBottomFade(ctx, 0.72);
              // Frameless Yosaku portrait gliding in warmly on left as he speaks!
              drawFramelessCharacter(ctx, imgs["p:yosaku"], "left", {
                talking: speakingRef.current === "yosaku",
                active: true,
                enterProgress: Math.min(flyT / 0.45, 1),
                t,
                bottomY: VIRTUAL_H,
              });
            }
            drawSnowflakes(ctx, t, 42);
            break;
          }

          case "tsuru_visitor_promise": {
            // Cozy hearth interior with subtle film zoom
            // Static 1x backdrop: sub-pixel Ken Burns zooms smeared the pixel grid.
            ctx.save();
            if (imgs["bg:hearth"]) {
              ctx.drawImage(imgs["bg:hearth"], 0, 0, VIRTUAL_W, VIRTUAL_H);
            }
            drawWindowSnow(ctx, 40, 64, 22, 36, t, 1.1);
            drawHearthLife(ctx, t, 1.0);
            ctx.restore();

            // Line 0 = Narrator establishing the cozy hearth; Lines 1-2 = Frameless Otsū & Yosaku!
            if (lineIndex >= 1) {
              // Subtle atmospheric dimming for cinematic depth-of-field
              const dimAlpha = lineIndex >= 2 ? 0.36 : 0.24;
              ctx.fillStyle = `rgba(12, 10, 22, ${dimAlpha})`;
              ctx.fillRect(0, 0, VIRTUAL_W, VIRTUAL_H);
              drawCinemaBottomFade(ctx, 0.82);

              const appearT = Math.min((elapsed - 1.5) / 0.55, 1);
              // Yosaku on left listening attentively
              drawFramelessCharacter(ctx, imgs["p:yosaku"], "left", {
                talking: speakingRef.current === "yosaku",
                active: speakingRef.current === "yosaku",
                enterProgress: Math.max(0.2, appearT),
                t,
                bottomY: VIRTUAL_H,
              });

              // Otsū on right: smooth crossfade from gentle smile -> earnest pleading on Line 2!
              const pleadMix = lineIndex >= 2 ? clamp01(lineElapsed / 0.55) : 0;
              if (pleadMix < 1) {
                drawFramelessCharacter(ctx, imgs["p:otsu_gentle"], "right", {
                  talking: speakingRef.current === "otsu",
                  active: true,
                  enterProgress: Math.max(0.2, appearT),
                  opacity: 1 - pleadMix,
                  t,
                  bottomY: VIRTUAL_H,
                });
              }
              if (pleadMix > 0) {
                drawFramelessCharacter(ctx, imgs["p:otsu_plead"], "right", {
                  talking: speakingRef.current === "otsu",
                  active: true,
                  enterProgress: 1,
                  opacity: pleadMix,
                  t,
                  bottomY: VIRTUAL_H,
                });
              }
            } else {
              drawCinemaBottomFade(ctx, 0.65);
            }
            break;
          }

          case "tsuru_weaving_choice": {
            // Cozy hearth across 3 mysterious snowy nights!
            const nightT = (now - nightChangedAtRef.current) / 1000;
            const fireStrength = nightCount === 1 ? 1.0 : nightCount === 2 ? 0.78 : 0.55;
            if (imgs["bg:hearth"]) {
              ctx.drawImage(imgs["bg:hearth"], 0, 0, VIRTUAL_W, VIRTUAL_H);
            }
            drawWindowSnow(ctx, 40, 64, 22, 36, t, 0.8 + nightCount * 0.45);
            drawHearthLife(ctx, t, fireStrength);

            // Deepening blue night veil as the 3 nights pass
            const nightVeil = nightCount === 1 ? 0.1 : nightCount === 2 ? 0.22 : 0.34;
            ctx.fillStyle = `rgba(12, 18, 38, ${nightVeil})`;
            ctx.fillRect(0, 0, VIRTUAL_W, VIRTUAL_H);

            // Mysterious warm amber candlelight seeping through the vertical crack of the pine fusuma!
            const seamPulse =
              (0.45 + Math.sin(t * 4.2) * 0.2 + Math.exp(-nightT * 2.5) * 0.35) *
              (0.55 + nightCount * 0.16);
            ctx.fillStyle = `rgba(255, 206, 112, ${clamp01(seamPulse).toFixed(2)})`;
            ctx.fillRect(245, 58, 3, 79);
            ctx.fillStyle = `rgba(255, 184, 82, ${(clamp01(seamPulse) * 0.22).toFixed(2)})`;
            ctx.fillRect(239, 58, 15, 79);

            // Atmospheric woven loom sound wisps drifting delicately over the pine door
            const beat = Math.sin(t * 4.4);
            if (beat > -0.25) {
              const floatY = Math.round(beat * 2);
              ctx.save();
              ctx.font = 'bold 10px "DotGothic16", monospace';
              ctx.textAlign = "center";
              ctx.fillStyle = "rgba(16, 19, 34, 0.85)";
              ctx.fillText(nightCount === 2 ? "カラリ…トン…" : "トントン…", 246, 50 + floatY);
              ctx.fillStyle = "#ffe38c";
              ctx.fillText(nightCount === 2 ? "カラリ…トン…" : "トントン…", 245, 49 + floatY);
              ctx.restore();
            }

            drawCinemaBottomFade(ctx, 0.82);

            // On Night 3 when Yosaku worries (lineIndex >= 1 or choice taken), glide his frameless portrait in!
            if (nightCount === 3 && (lineIndex >= 1 || choiceTaken)) {
              drawFramelessCharacter(ctx, imgs["p:yosaku"], "left", {
                talking: speakingRef.current === "yosaku",
                active: true,
                enterProgress: Math.min(lineElapsed / 0.45, 1),
                t,
                bottomY: VIRTUAL_H,
              });
            }
            break;
          }

          case "tsuru_slide_fusuma": {
            // Dramatic secret reveal: candlelit crane weaving silk behind the REAL AI pine fusuma doors!
            if (imgs["bg:loom"]) {
              ctx.drawImage(imgs["bg:loom"], 0, 0, VIRTUAL_W, VIRTUAL_H);
            }
            // Soft radial candlelight flicker on left andon lantern (zero hard rectangle edge)
            const candle = 0.14 + Math.sin(t * 7.8) * 0.05;
            const lanternGrad = ctx.createRadialGradient(46, 118, 6, 46, 118, 52);
            lanternGrad.addColorStop(0, `rgba(255, 214, 112, ${candle.toFixed(3)})`);
            lanternGrad.addColorStop(1, "rgba(255, 190, 80, 0)");
            ctx.fillStyle = lanternGrad;
            ctx.fillRect(0, 62, 104, 112);

            // Soft radial golden silk shimmer pulsing gently on the woven cloth
            const silkGlow = 0.16 + Math.sin(t * 3.4) * 0.07;
            const silkGrad = ctx.createRadialGradient(178, 108, 4, 178, 108, 34);
            silkGrad.addColorStop(0, `rgba(255, 244, 198, ${silkGlow.toFixed(3)})`);
            silkGrad.addColorStop(1, "rgba(255, 232, 150, 0)");
            ctx.fillStyle = silkGrad;
            ctx.fillRect(142, 74, 72, 68);

            drawWindowSnow(ctx, 283, 34, 27, 56, t, 1.0);
            drawDriftingFeathers(ctx, t, 9, 1);
            drawSparkle(ctx, 156, 102, t, 0.5);
            drawSparkle(ctx, 198, 96, t, 1.9);

            // REAL AI Pine-Painted Fusuma Double Doors cropped cleanly from inside bg_hearth.png!
            const open = doorOpenRef.current;
            if (open < 0.995) {
              const halfW = VIRTUAL_W / 2;
              const shift = Math.round(easeOutCubic(open) * (halfW + 14));
              const leftX = -shift;
              const rightX = halfW + shift;

              // Warm golden candlelight glow spilling out of the widening gap!
              if (open > 0.01 && open < 0.85) {
                const beamA = (1 - open) * 0.28;
                ctx.fillStyle = `rgba(255, 214, 128, ${beamA.toFixed(3)})`;
                ctx.fillRect(halfW - shift, 0, shift * 2, VIRTUAL_H);
              }

              // Draw Left Pine Fusuma Panel (tight clean interior crop with zero perspective slivers)
              ctx.fillStyle = "#241712";
              ctx.fillRect(leftX, 0, halfW, VIRTUAL_H);
              ctx.fillStyle = "#5a3520";
              ctx.fillRect(leftX + 3, 4, halfW - 6, VIRTUAL_H - 8);
              ctx.fillStyle = "#c9a67d";
              ctx.fillRect(leftX + 8, 10, halfW - 14, VIRTUAL_H - 20);
              if (imgs["bg:hearth"]) {
                // painted panel crop at a whole-number scale (was stretched ~4.7x2.8)
                drawPixelImage(
                  ctx,
                  cropPixelImage(imgs["bg:hearth"], 212, 66, 30, 64),
                  leftX + 8,
                  10,
                  halfW - 14,
                  VIRTUAL_H - 20,
                  "center"
                );
              }
              ctx.fillStyle = "#241712";
              ctx.fillRect(leftX + halfW - 5, 0, 5, VIRTUAL_H);

              // Draw Right Pine Fusuma Panel (tight clean interior crop)
              ctx.fillStyle = "#241712";
              ctx.fillRect(rightX, 0, halfW, VIRTUAL_H);
              ctx.fillStyle = "#5a3520";
              ctx.fillRect(rightX + 3, 4, halfW - 6, VIRTUAL_H - 8);
              ctx.fillStyle = "#c9a67d";
              ctx.fillRect(rightX + 6, 10, halfW - 14, VIRTUAL_H - 20);
              if (imgs["bg:hearth"]) {
                // painted panel crop at a whole-number scale (was stretched ~4.7x2.8)
                drawPixelImage(
                  ctx,
                  cropPixelImage(imgs["bg:hearth"], 251, 62, 35, 72),
                  rightX + 6,
                  10,
                  halfW - 14,
                  VIRTUAL_H - 20,
                  "center"
                );
              }
              ctx.fillStyle = "#241712";
              ctx.fillRect(rightX, 0, 5, VIRTUAL_H);

              // Subtle golden light seam pulsing between the two closed doors
              if (open < 0.08) {
                const seam = 0.5 + Math.sin(t * 4.5) * 0.35;
                ctx.fillStyle = `rgba(255, 224, 138, ${seam.toFixed(2)})`;
                ctx.fillRect(halfW - 1, 8, 2, VIRTUAL_H - 16);

                // Minimalist pulsing double-arrow guide centered on the seam
                const nudge = Math.round(Math.sin(t * 5.2) * 4);
                ctx.fillStyle = "#241712";
                ctx.fillRect(halfW - 36 - nudge, 95, 22, 10);
                ctx.fillRect(halfW + 14 + nudge, 95, 22, 10);
                ctx.fillStyle = "#ffe38c";
                // Left arrow <-
                ctx.fillRect(halfW - 31 - nudge, 99, 13, 2);
                ctx.fillRect(halfW - 31 - nudge, 97, 3, 6);
                // Right arrow ->
                ctx.fillRect(halfW + 18 + nudge, 99, 13, 2);
                ctx.fillRect(halfW + 28 + nudge, 97, 3, 6);
              }
            } else {
              drawCinemaBottomFade(ctx, 0.72);
            }
            break;
          }

          case "tsuru_farewell_sky": {
            // Bittersweet moonlit farewell over the snowy village
            // Static 1x backdrop: sub-pixel Ken Burns zooms smeared the pixel grid.
            ctx.save();
            if (imgs["bg:snow"]) {
              ctx.drawImage(imgs["bg:snow"], 0, 0, VIRTUAL_W, VIRTUAL_H);
            }
            drawCottageWindowGlow(ctx, t);
            drawChimneySmoke(ctx, t);
            ctx.restore();

            // Rolled golden silk bolt resting cleanly in the snowy clearing ABOVE the subtitle box
            if (imgs["i:cloth"]) {
              ctx.fillStyle = "rgba(16, 20, 40, 0.22)";
              ctx.fillRect(142, 117, 30, 3);
              drawPixelImage(ctx, imgs["i:cloth"], 138, 84, 38, 38);
              drawSparkle(ctx, 146, 90, t, 0.3);
              drawSparkle(ctx, 170, 94, t, 1.5);
            }

            // Line 0 (Otsū's tearful farewell): Frameless Otsū softly illuminated on right!
            // Line 1 (Narrator): Otsū fades like winter mist as the white crane soars past the moon!
            if (lineIndex === 0) {
              ctx.fillStyle = "rgba(12, 18, 40, 0.24)";
              ctx.fillRect(0, 0, VIRTUAL_W, VIRTUAL_H);
              drawCinemaBottomFade(ctx, 0.8);
              drawFramelessCharacter(ctx, imgs["p:otsu_plead"], "right", {
                talking: speakingRef.current === "otsu",
                active: true,
                enterProgress: Math.min(elapsed / 0.7, 1),
                opacity: 1,
                t,
                bottomY: VIRTUAL_H,
              });
            } else {
              // Gentle fade-out echo of Otsū dissolving into feathers
              const fadeOut = clamp01(1 - lineElapsed / 0.85);
              if (fadeOut > 0.02) {
                drawFramelessCharacter(ctx, imgs["p:otsu_plead"], "right", {
                  talking: false,
                  active: true,
                  enterProgress: 1,
                  opacity: fadeOut * 0.85,
                  t,
                  bottomY: VIRTUAL_H,
                });
              }

              // White crane soaring high through the open night sky past the crescent moon!
              const flyProg = clamp01(lineElapsed / 6.0);
              const fx = 54 + flyProg * 144;
              const fy = 68 - flyProg * 48 + Math.sin(t * 3.6) * 4;
              const craneSize = Math.round(42 - flyProg * 14);
              if (imgs["i:crane"]) {
                drawPixelImage(ctx, imgs["i:crane"], Math.round(fx), Math.round(fy), craneSize, craneSize);
              }
              drawSparkle(ctx, fx + 4, fy + 14, t, 0.8, "#f6eed8");
              drawCinemaBottomFade(ctx, 0.7);
            }

            drawDriftingFeathers(ctx, t, 9, 0.95);
            drawSnowflakes(ctx, t, 46);
            break;
          }
        }

        // Render interactive burst particles
        for (const p of particlesRef.current) {
          const alpha = clamp01(1 - p.life / p.maxLife);
          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.fillStyle = p.color;
          ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
          ctx.restore();
        }
      }
    }, "#101322", 2.8);
  }, [assetsReady, choiceTaken, completeCraneRescue, currentScene, lineIndex, nightCount, spawnBurst]);

  const toVirtual = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      vx: ((e.clientX - rect.left) / rect.width) * VIRTUAL_W,
      vy: ((e.clientY - rect.top) / rect.height) * VIRTUAL_H,
    };
  };

  const boostUntieTap = useCallback(() => {
    if (currentScene.type !== "tsuru_rescue_crane" || craneFreedAtRef.current !== null) return;
    const next = clamp01(untieProgressRef.current + 0.34);
    untieProgressRef.current = next;
    setUntiePct(Math.round(next * 100));
    retroAudio.playClick();
    spawnBurst(154, 134, 6, ["#ffe38c", "#f6eed8", "#b9834b"]);
    if (next >= 1) {
      void completeCraneRescue();
    }
  }, [completeCraneRescue, currentScene.type, spawnBurst]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { vx, vy } = toVirtual(e);

    if (currentScene.type === "tsuru_rescue_crane" && craneFreedAtRef.current === null) {
      if (vx >= 95 && vx <= 215 && vy >= 70 && vy <= 172) {
        e.currentTarget.setPointerCapture(e.pointerId);
        holdingUntieRef.current = true;
        boostUntieTap();
      }
      return;
    }

    if (currentScene.type === "tsuru_slide_fusuma" && !doorRevealed) {
      e.currentTarget.setPointerCapture(e.pointerId);
      doorDraggingRef.current = true;
      doorDragStartXRef.current = vx;
      doorDragStartOpenRef.current = doorOpenRef.current;
      retroAudio.playClick();
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (
      currentScene.type !== "tsuru_slide_fusuma" ||
      !doorDraggingRef.current ||
      doorRevealed
    ) {
      return;
    }
    const { vx } = toVirtual(e);
    // Allow dragging EITHER right OR left smoothly to part the double fusuma doors!
    const delta = Math.abs(vx - doorDragStartXRef.current) / (VIRTUAL_W * 0.42);
    const nextOpen = clamp01(doorDragStartOpenRef.current + delta);
    doorOpenRef.current = nextOpen;
    if (nextOpen >= 0.48) {
      void triggerDoorReveal();
    }
  };

  const handlePointerUp = () => {
    if (currentScene.type === "tsuru_rescue_crane") {
      holdingUntieRef.current = false;
      return;
    }
    if (currentScene.type !== "tsuru_slide_fusuma" || !doorDraggingRef.current) return;
    doorDraggingRef.current = false;
    // Effortless tap-to-open support for mobile & mouse clickers
    if (!doorRevealed && doorOpenRef.current < 0.08) {
      void triggerDoorReveal();
    }
  };

  const nightBannerText =
    nightCount === 1
      ? "一夜目 · Đêm thứ 1 — Tiếng khung cửi vang lên sau cánh cửa..."
      : nightCount === 2
        ? "二夜目 · Đêm thứ 2 — Ánh nến vẫn sáng suốt đêm đông..."
        : "三夜目 · Đêm thứ 3 — Đã ba ngày không ăn uống gì...";

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
        onPointerCancel={handlePointerUp}
        style={{
          cursor:
            currentScene.type === "tsuru_rescue_crane" && !craneFreed
              ? "pointer"
              : currentScene.type === "tsuru_slide_fusuma" && !doorRevealed
                ? "ew-resize"
                : "default",
        }}
      />

      {currentScene.type === "tsuru_rescue_crane" && !craneFreed && (
        <div className="scene-hud-top">
          {currentScene.instruction} ({untiePct}%)
        </div>
      )}

      {currentScene.type === "tsuru_weaving_choice" && (
        <div className="scene-hud-top">{nightBannerText}</div>
      )}

      {currentScene.type === "tsuru_slide_fusuma" && !doorRevealed && (
        <div className="scene-hud-top">{currentScene.instruction}</div>
      )}

      {currentScene.type === "tsuru_visitor_promise" && (
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
          {currentScene.whoButtonLabel ?? "? どんな物語"}
        </button>
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

        {currentScene.type === "tsuru_snow_intro" && (
          <button
            type="button"
            className="pixel-btn pixel-btn-cream"
            onClick={() => {
              retroAudio.startBgm();
              retroAudio.playClick();
              goToScene(1);
            }}
          >
            ▶ {currentScene.actionLabel ?? "はじめる · BẮT ĐẦU"}
          </button>
        )}

        {currentScene.type === "tsuru_rescue_crane" && !craneFreed && (
          <button
            type="button"
            className="pixel-btn pixel-btn-cream"
            onPointerDown={() => {
              holdingUntieRef.current = true;
              boostUntieTap();
            }}
            onPointerUp={() => {
              holdingUntieRef.current = false;
            }}
            onPointerLeave={() => {
              holdingUntieRef.current = false;
            }}
          >
            🤲 ほどく · GIỮ (HOẶC CHẠM) GỠ BẪY
          </button>
        )}

        {currentScene.type === "tsuru_visitor_promise" && lineFinished && (
          <button
            type="button"
            className="pixel-btn pixel-btn-purple"
            onClick={() => {
              retroAudio.playClick();
              goToScene(sceneIdx + 1);
            }}
          >
            {currentScene.actionLabel ?? "約束する · ĐỒNG Ý HỨA →"}
          </button>
        )}

        {currentScene.type === "tsuru_weaving_choice" && nightCount < 3 && (
          <button
            type="button"
            className="pixel-btn pixel-btn-cream"
            onClick={handleAdvanceNight}
          >
            🌙 {nightCount === 1 ? "二夜目へ · Sang đêm thứ 2 →" : "三夜目へ · Sang đêm thứ 3 →"}
          </button>
        )}

        {currentScene.type === "tsuru_weaving_choice" &&
          nightCount === 3 &&
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
                      <RubyText segments={c.labelRuby} showFurigana={showFurigana} />
                    ) : (
                      c.labelJa
                    )}
                  </span>
                  <span className="choice-vi">{c.labelVi}</span>
                </button>
              ))}
            </div>
          )}

        {currentScene.type === "tsuru_slide_fusuma" && !doorRevealed && (
          <button
            type="button"
            className="pixel-btn pixel-btn-cream"
            onClick={() => void triggerDoorReveal()}
          >
            🚪 そっと開ける · Hé mở cánh cửa
          </button>
        )}

        {currentScene.type === "tsuru_farewell_sky" && lineFinished && (
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
              THẺ CÂU CHUYỆN
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
