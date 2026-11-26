import { useCallback, useEffect, useRef, useState } from "react";
import { retroAudio } from "../audio/chiptune";
import { drawBayerDitherOverlay } from "../engine/bayerDither";
import { VIRTUAL_H, VIRTUAL_W } from "../engine/pixelRenderer";
import type { DialogueLine, MiniGameChoice, StoryData } from "../types/story";
import { resolveAssetUrl } from "../utils/assetUrl";
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

function drawSnowflakes(ctx: CanvasRenderingContext2D, t: number, count = 46): void {
  for (let i = 0; i < count; i++) {
    const sx = (i * 67) % VIRTUAL_W;
    const sy = (i * 43) % VIRTUAL_H;
    const y = (sy + t * (16 + (i % 4) * 5)) % VIRTUAL_H;
    const x = ((sx + Math.sin(t * 1.4 + i) * 6 - t * 6) % VIRTUAL_W + VIRTUAL_W) % VIRTUAL_W;
    ctx.fillStyle = i % 3 === 0 ? "#f6eed8" : "rgba(246, 238, 216, 0.72)";
    ctx.fillRect(Math.round(x), Math.round(y), i % 4 === 0 ? 2 : 1, i % 4 === 0 ? 2 : 1);
  }
}

function drawDriftingFeathers(ctx: CanvasRenderingContext2D, t: number): void {
  for (let i = 0; i < 8; i++) {
    const prog = (t * 0.18 + i * 0.13) % 1;
    const x = 40 + i * 34 + Math.sin(t * 2.2 + i * 1.7) * 14;
    const y = -8 + prog * (VIRTUAL_H + 16);
    ctx.fillStyle = "#f6eed8";
    ctx.fillRect(Math.round(x), Math.round(y), 4, 2);
    ctx.fillStyle = "#ffe38c";
    ctx.fillRect(Math.round(x + 3), Math.round(y + 1), 2, 1);
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
  if (pulse > 0.4) {
    ctx.fillRect(rx - 2, ry, 5, 1);
    ctx.fillRect(rx, ry - 2, 1, 5);
  }
}

function drawHearthGlow(ctx: CanvasRenderingContext2D, t: number): void {
  const pulse = 0.09 + Math.sin(t * 6.5) * 0.04;
  ctx.fillStyle = `rgba(244, 164, 66, ${pulse.toFixed(3)})`;
  ctx.fillRect(80, 128, 62, 34);
  // Subtle rising fire ember sparks directly above the glowing irori coals
  for (let i = 0; i < 4; i++) {
    const p = (t * 0.72 + i * 0.27) % 1;
    const ex = 100 + i * 6 + Math.sin(t * 5 + i) * 2.5;
    const ey = 148 - p * 34;
    ctx.fillStyle = p > 0.55 ? "#f4a442" : "#ffe38c";
    ctx.fillRect(Math.round(ex), Math.round(ey), 2, 2);
  }
}

function drawFramedPortrait(
  ctx: CanvasRenderingContext2D,
  im: HTMLImageElement | undefined,
  x: number,
  y: number,
  size: number,
  talking: boolean,
  active: boolean,
  t: number
): void {
  if (!im) return;
  const bounce = talking ? Math.round(Math.abs(Math.sin(t * 10)) * -2) : 0;
  const px = Math.round(x);
  const py = Math.round(y + bounce);

  // Subtle retro portrait frame backdrop
  ctx.fillStyle = active ? "#ffe38c" : "#41527d";
  ctx.fillRect(px - 2, py - 2, size + 4, size + 4);
  ctx.fillStyle = "#1b223b";
  ctx.fillRect(px, py, size, size);
  ctx.drawImage(im, px, py, size, size);
}

export function TsuruStage({
  story,
  showFurigana,
  muted,
  autoplay,
  onOpenReading,
  onOpenDictation,
}: TsuruStageProps) {
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

  // Scene 2 interactive snare untie (0 -> 3 taps)
  const [untieTaps, setUntieTaps] = useState(0);
  const craneFreedAtRef = useRef<number | null>(null);

  // Scene 5 interactive fusuma sliding door (0 = closed, 1 = fully open)
  const doorOpenRef = useRef<number>(0);
  const doorDraggingRef = useRef<boolean>(false);
  const doorDragStartXRef = useRef<number>(0);
  const doorDragStartOpenRef = useRef<number>(0);
  const [doorRevealed, setDoorRevealed] = useState(false);

  // Bayer dither transition
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

  // Preload all AI pixel art assets
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
      for (const [k, v] of Object.entries(story.assets.items)) {
        entries.push([`i:${k}`, resolveAssetUrl(v)]);
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

    if (currentScene.type === "tsuru_rescue_crane") {
      setUntieTaps(0);
      craneFreedAtRef.current = null;
    }
    if (currentScene.type === "tsuru_slide_fusuma") {
      doorOpenRef.current = 0;
      doorDraggingRef.current = false;
      setDoorRevealed(false);
    }

    const run = async () => {
      // Scene 2 & Scene 5 narrate AFTER user completes the interactive action
      if (
        currentScene.type === "tsuru_rescue_crane" ||
        currentScene.type === "tsuru_slide_fusuma"
      ) {
        return;
      }

      for (let i = 0; i < currentScene.lines.length; i++) {
        if (cancelled) return;
        setLineIndex(i);
        await playVoiceLine(currentScene.lines[i]);
        if (cancelled) return;
        await new Promise((r) => window.setTimeout(r, 420));
      }

      if (cancelled) return;
      setLineFinished(true);

      if (currentScene.type === "tsuru_farewell_sky") {
        retroAudio.playFanfare();
      }
    };

    void run();
    return () => {
      cancelled = true;
      stopVoice();
    };
  }, [assetsReady, currentScene, playVoiceLine, stopVoice]);

  // Scene 2: Complete rescuing the white crane
  const handleTapCrane = useCallback(async () => {
    if (currentScene.type !== "tsuru_rescue_crane" || craneFreedAtRef.current !== null) {
      return;
    }
    retroAudio.playClick();
    const next = untieTaps + 1;
    setUntieTaps(next);
    if (next >= 3) {
      craneFreedAtRef.current = performance.now();
      retroAudio.playFanfare();
      const ln = currentScene.lines[0];
      if (ln) {
        await playVoiceLine(ln);
      }
      await new Promise((r) => window.setTimeout(r, 700));
      goToScene(sceneIdx + 1);
    }
  }, [currentScene, goToScene, playVoiceLine, sceneIdx, untieTaps]);

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

  // Scene 5: Complete sliding fusuma door open
  const triggerDoorReveal = useCallback(async () => {
    if (doorRevealed) return;
    setDoorRevealed(true);
    doorOpenRef.current = 1;
    doorDraggingRef.current = false;
    retroAudio.playTransition();
    const ln = currentScene.lines[0];
    if (ln) {
      await playVoiceLine(ln);
    }
    await new Promise((r) => window.setTimeout(r, 850));
    goToScene(sceneIdx + 1);
  }, [currentScene, doorRevealed, goToScene, playVoiceLine, sceneIdx]);

  // Autoplay director for ?autoplay=true
  useEffect(() => {
    if (!autoplay || !assetsReady) return;
    let cancelled = false;
    const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

    const clickAt = async (xPct: number, yPct: number) => {
      setCursorPos({ x: xPct, y: yPct, clicking: false });
      await sleep(480);
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
        await sleep(600);
        for (let k = 0; k < 3; k++) {
          if (cancelled) return;
          await clickAt(38, 66);
          if (cancelled) return;
          setUntieTaps(k + 1);
          retroAudio.playClick();
          if (k === 2) {
            craneFreedAtRef.current = performance.now();
            retroAudio.playFanfare();
            const ln = currentScene.lines[0];
            if (ln) await playVoiceLine(ln);
            await sleep(700);
            if (!cancelled) goToScene(sceneIdx + 1);
          } else {
            await sleep(380);
          }
        }
      } else if (currentScene.type === "tsuru_visitor_promise" && lineFinished) {
        await sleep(550);
        if (cancelled) return;
        await clickAt(50, 88);
        if (!cancelled) {
          retroAudio.playClick();
          goToScene(sceneIdx + 1);
        }
      } else if (
        currentScene.type === "tsuru_weaving_choice" &&
        lineFinished &&
        !choiceTaken &&
        currentScene.minigame
      ) {
        await sleep(550);
        if (cancelled) return;
        await clickAt(35, 86);
        if (!cancelled) void handleSelectChoice(currentScene.minigame.choices[0]);
      } else if (currentScene.type === "tsuru_slide_fusuma" && !doorRevealed) {
        await sleep(750);
        setCursorPos({ x: 35, y: 50, clicking: false });
        await sleep(450);
        if (cancelled) return;
        setCursorPos({ x: 35, y: 50, clicking: true });
        for (let s = 0; s <= 24; s++) {
          if (cancelled) return;
          const u = s / 24;
          doorOpenRef.current = u;
          setCursorPos({ x: 35 + u * 44, y: 50, clicking: true });
          await sleep(32);
        }
        setCursorPos({ x: 79, y: 50, clicking: false });
        if (!cancelled) void triggerDoorReveal();
      } else if (currentScene.type === "tsuru_farewell_sky" && lineFinished) {
        await sleep(1400);
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
    choiceTaken,
    currentScene,
    doorRevealed,
    goToScene,
    handleSelectChoice,
    lineFinished,
    playVoiceLine,
    sceneIdx,
    triggerDoorReveal,
  ]);

  // Main 60fps AI-Hybrid Pixel Art Render Loop
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
          case "tsuru_snow_intro": {
            if (imgs["bg:snow"]) ctx.drawImage(imgs["bg:snow"], 0, 0, VIRTUAL_W, VIRTUAL_H);
            // White crane standing softly in snowy clearing cleanly above subtitle box
            ctx.fillStyle = "rgba(27, 34, 59, 0.25)";
            ctx.fillRect(104, 126, 22, 3);
            if (imgs["i:crane"]) {
              const bob = Math.round(Math.sin(t * 2.5) * 1);
              ctx.drawImage(imgs["i:crane"], 94, 83 + bob, 44, 44);
            }
            drawSnowflakes(ctx, t, 48);
            drawSparkle(ctx, 114, 34, t, 0.4, "#ffe38c");
            drawSparkle(ctx, 212, 24, t, 1.8, "#f6eed8");

            // Crisp Japanese pixel title positioned cleanly clear of crescent moon
            ctx.save();
            ctx.font = 'bold 20px "DotGothic16", monospace';
            ctx.textAlign = "center";
            ctx.fillStyle = "#101322";
            ctx.fillText(currentScene.bannerTitle ?? "鶴の恩返し", VIRTUAL_W / 2 + 2, 68);
            ctx.fillStyle = "#ffe38c";
            ctx.fillText(currentScene.bannerTitle ?? "鶴の恩返し", VIRTUAL_W / 2, 66);
            ctx.restore();
            break;
          }

          case "tsuru_rescue_crane": {
            // Gentle zoom onto the snowy clearing
            ctx.save();
            ctx.translate(VIRTUAL_W * 0.36, VIRTUAL_H * 0.68);
            ctx.scale(1.22, 1.22);
            ctx.translate(-VIRTUAL_W * 0.36, -VIRTUAL_H * 0.68);
            if (imgs["bg:snow"]) ctx.drawImage(imgs["bg:snow"], 0, 0, VIRTUAL_W, VIRTUAL_H);
            ctx.restore();

            const freed = craneFreedAtRef.current !== null;
            const flyT = freed ? (now - craneFreedAtRef.current!) / 1000 : 0;
            const cx = freed ? 102 + flyT * 46 : 102;
            const cy = freed
              ? 100 - flyT * 36 + Math.sin(flyT * 10) * 4
              : 102 + Math.round(Math.sin(t * 5) * 1);

            if (imgs["i:crane"]) {
              ctx.drawImage(imgs["i:crane"], Math.round(cx), Math.round(cy), 56, 56);
            }

            // Draw pixel winter snare rope until untied (3 taps)
            if (!freed) {
              const remaining = Math.max(0, 3 - untieTaps);
              ctx.fillStyle = "#c78b56";
              for (let r = 0; r < remaining; r++) {
                ctx.fillRect(108, 134 + r * 4, 42, 2);
              }
              // Pulsing golden tap target ring
              const pulse = 0.45 + Math.sin(t * 6) * 0.35;
              ctx.strokeStyle = `rgba(255, 227, 140, ${pulse.toFixed(2)})`;
              ctx.lineWidth = 2;
              ctx.strokeRect(98, 98, 64, 62);
            } else {
              drawSparkle(ctx, cx + 10, cy + 16, t, 0.2);
              drawSparkle(ctx, cx + 46, cy + 8, t, 1.3);
              drawDriftingFeathers(ctx, t);
            }
            drawSnowflakes(ctx, t, 40);
            break;
          }

          case "tsuru_visitor_promise": {
            if (imgs["bg:hearth"]) ctx.drawImage(imgs["bg:hearth"], 0, 0, VIRTUAL_W, VIRTUAL_H);
            drawHearthGlow(ctx, t);

            // Yosaku left portrait & Otsū right portrait (switches expression on line 2!)
            const otsuKey = lineIndex >= 1 ? "otsu_plead" : "otsu_gentle";
            drawFramedPortrait(
              ctx,
              imgs["p:yosaku"],
              16,
              32,
              64,
              speakingRef.current === "yosaku",
              speakingRef.current === "yosaku",
              t
            );
            drawFramedPortrait(
              ctx,
              imgs[`p:${otsuKey}`],
              VIRTUAL_W - 80,
              32,
              64,
              speakingRef.current === "otsu",
              speakingRef.current === "otsu",
              t
            );
            break;
          }

          case "tsuru_weaving_choice": {
            if (imgs["bg:hearth"]) ctx.drawImage(imgs["bg:hearth"], 0, 0, VIRTUAL_W, VIRTUAL_H);
            drawHearthGlow(ctx, t);

            // Expressive Yosaku portrait on left thinking
            drawFramedPortrait(
              ctx,
              imgs["p:yosaku"],
              16,
              32,
              64,
              speakingRef.current === "yosaku",
              true,
              t
            );

            // Rhythmic loom sound text pulsing directly over the closed pine fusuma door on right!
            const beat = Math.sin(t * 5.2);
            if (beat > -0.2) {
              ctx.save();
              ctx.font = 'bold 11px "DotGothic16", monospace';
              ctx.textAlign = "center";
              ctx.fillStyle = "#101322";
              ctx.fillText("トン…カラ…", 238, 94 + Math.round(beat * 2));
              ctx.fillStyle = "#b8382c";
              ctx.fillText("トン…カラ…", 237, 93 + Math.round(beat * 2));
              ctx.restore();
            }
            break;
          }

          case "tsuru_slide_fusuma": {
            // Breathtaking secret candlelit loom room revealed BEHIND the sliding fusuma door!
            if (imgs["bg:loom"]) ctx.drawImage(imgs["bg:loom"], 0, 0, VIRTUAL_W, VIRTUAL_H);
            drawDriftingFeathers(ctx, t);
            drawSparkle(ctx, 156, 86, t, 0.5);
            drawSparkle(ctx, 196, 68, t, 1.9);

            // Interactive wooden Fusuma sliding door panel covering the scene until slid right!
            const open = doorOpenRef.current;
            if (open < 0.99) {
              const doorX = Math.round(open * VIRTUAL_W);
              // Wooden door body (cream paper + cedar frame + pine silhouettes)
              ctx.fillStyle = "#241712";
              ctx.fillRect(doorX, 0, VIRTUAL_W, VIRTUAL_H);
              ctx.fillStyle = "#6e3f27";
              ctx.fillRect(doorX + 4, 4, VIRTUAL_W - 8, VIRTUAL_H - 8);
              ctx.fillStyle = "#f6eed8";
              ctx.fillRect(doorX + 12, 12, VIRTUAL_W - 24, VIRTUAL_H - 24);
              // Subtle lattice grid lines on paper fusuma
              ctx.fillStyle = "#c78b56";
              for (let lx = doorX + 52; lx < VIRTUAL_W; lx += 44) {
                ctx.fillRect(lx, 12, 2, VIRTUAL_H - 24);
              }
              for (let ly = 44; ly < VIRTUAL_H - 16; ly += 38) {
                ctx.fillRect(doorX + 12, ly, VIRTUAL_W - 24, 2);
              }
              // Recessed dark-wood door handle pull (hikite) on left edge of door!
              ctx.fillStyle = "#241712";
              ctx.fillRect(doorX + 20, 88, 12, 22);
              ctx.fillStyle = "#b8382c";
              ctx.fillRect(doorX + 22, 90, 8, 18);

              // Animated arrow hint pointing right
              if (!doorDraggingRef.current && open < 0.15) {
                const shift = Math.round(Math.sin(t * 6) * 4);
                ctx.fillStyle = "#b8382c";
                ctx.fillRect(doorX + 46 + shift, 97, 26, 4);
                ctx.fillRect(doorX + 68 + shift, 93, 4, 12);
                ctx.fillRect(doorX + 72 + shift, 95, 4, 8);
                ctx.fillRect(doorX + 76 + shift, 97, 4, 4);
              }
            }
            break;
          }

          case "tsuru_farewell_sky": {
            if (imgs["bg:snow"]) ctx.drawImage(imgs["bg:snow"], 0, 0, VIRTUAL_W, VIRTUAL_H);

            // White crane soaring gracefully across the crescent moon sky!
            const flyProg = Math.min(elapsed / 9.0, 1);
            const fx = 66 + flyProg * 190;
            const fy = 62 - flyProg * 36 + Math.sin(t * 3.8) * 5;
            if (imgs["i:crane"]) {
              ctx.drawImage(imgs["i:crane"], Math.round(fx), Math.round(fy), 42, 42);
            }

            // Shimmering woven silk cloth resting softly on the snowy porch/foreground
            if (imgs["i:cloth"]) {
              ctx.drawImage(imgs["i:cloth"], 136, 98, 48, 48);
              drawSparkle(ctx, 144, 102, t, 0.3);
              drawSparkle(ctx, 176, 106, t, 1.5);
            }

            drawDriftingFeathers(ctx, t);
            drawSnowflakes(ctx, t, 46);
            break;
          }
        }

        // Bayer 4x4 dithering scene transition
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
  }, [assetsReady, currentScene, lineIndex, untieTaps]);

  const toVirtual = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      vx: ((e.clientX - rect.left) / rect.width) * VIRTUAL_W,
      vy: ((e.clientY - rect.top) / rect.height) * VIRTUAL_H,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { vx, vy } = toVirtual(e);

    if (currentScene.type === "tsuru_rescue_crane") {
      if (vx >= 80 && vx <= 180 && vy >= 80 && vy <= 176) {
        void handleTapCrane();
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
    const delta = (vx - doorDragStartXRef.current) / (VIRTUAL_W * 0.65);
    const nextOpen = Math.max(0, Math.min(1, doorDragStartOpenRef.current + delta));
    doorOpenRef.current = nextOpen;
    if (nextOpen >= 0.62) {
      void triggerDoorReveal();
    }
  };

  const handlePointerUp = () => {
    if (currentScene.type !== "tsuru_slide_fusuma" || !doorDraggingRef.current) return;
    doorDraggingRef.current = false;
    // Also allow simple tap-to-open for effortless mobile play!
    if (!doorRevealed && doorOpenRef.current < 0.06) {
      void triggerDoorReveal();
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
            currentScene.type === "tsuru_rescue_crane"
              ? "pointer"
              : currentScene.type === "tsuru_slide_fusuma" && !doorRevealed
                ? "ew-resize"
                : "default",
        }}
      />

      {currentScene.type === "tsuru_rescue_crane" && craneFreedAtRef.current === null && (
        <div className="scene-hud-top">
          {currentScene.instruction} ({untieTaps}/3)
        </div>
      )}

      {currentScene.type === "tsuru_slide_fusuma" && !doorRevealed && (
        <div className="scene-hud-top">{currentScene.instruction}</div>
      )}

      {currentScene.type === "tsuru_visitor_promise" && (
        <button
          type="button"
          className="pixel-btn pixel-btn-cream"
          style={{ position: "absolute", left: "50%", top: "14%", transform: "translateX(-50%)" }}
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

        {currentScene.type === "tsuru_visitor_promise" && lineFinished && (
          <button
            type="button"
            className="pixel-btn pixel-btn-purple"
            onClick={() => {
              retroAudio.playClick();
              goToScene(sceneIdx + 1);
            }}
          >
            {currentScene.actionLabel ?? "約束する →"}
          </button>
        )}

        {currentScene.type === "tsuru_weaving_choice" &&
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
