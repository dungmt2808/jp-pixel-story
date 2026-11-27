import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { retroAudio } from "../audio/chiptune";
import { resolveBgmTheme, sfxUrl } from "../audio/themes";
import { LEGACY_BADGE_OVERLAY, OVERLAYS, drawBackdrop } from "../engine/cinemaBackdrops";
import {
  drawArcHint,
  drawCursor,
  drawDitherVignette,
  drawLeaderLine,
  drawMeter,
  drawStream,
  drawTargetGlow,
  spawnBurst,
  stepAndDrawParticles,
  type Particle,
} from "../engine/cinemaFx";
import {
  actorFocus,
  actorX,
  cinemaSceneKind,
  resolveCast,
  sceneBackdropRef,
  visibleActors,
  type Side,
} from "../engine/cinemaModel";
import {
  dropDragItem,
  hintText,
  hitTapSpot,
  initDrag,
  pickDragItem,
  stepHold,
  toPct,
  type DragItemState,
  type Vec,
} from "../engine/cinemaUi";
import { drawPixelImage } from "../engine/pixelScale";
import { VIRTUAL_H, VIRTUAL_W } from "../engine/pixelRenderer";
import { drawRig, rigHeadFrame, rigPose } from "../engine/rigAnimator";
import { drawSpriteFrame, frameAt } from "../engine/spriteAnimator";
import { useStageRuntime } from "../engine/useStageRuntime";
import { cameraAt, drawEmote, drawLightGrade, IDENTITY_VIEW, lineSfx } from "../engine/cinemaVibe";
import { logStoryEvent } from "../engine/stageRuntime";
import type { CinemaActor, DialogueLine, LineTelop, MiniGameChoice, SceneStamp, StoryData } from "../types/story";
import { InfoCard } from "./cinema/InfoCard";
import { RubyText } from "./RubyText";

interface CinemaStageProps {
  story: StoryData;
  showFurigana: boolean;
  showVi: boolean;
  muted: boolean;
  autoplay: boolean;
  onToggleFurigana: () => void;
  onToggleVi: () => void;
  onToggleMute: () => void;
  onClose: () => void;
  onOpenReading: () => void;
  onOpenDictation: () => void;
  /** Scene index to start from (reading page "watch this scene again"). */
  startScene?: number;
}

type Phase = "lines" | "interact" | "doneLine" | "ready";

const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function easeOutCubic(t: number): number {
  const u = clamp01(t);
  return 1 - Math.pow(1 - u, 3);
}

/**
 * Frameless actor standing on the bottom edge: rig (head/body) > sprite clips > static portrait.
 * Always whole-pixel scale and offsets.
 */
function drawActor(
  ctx: CanvasRenderingContext2D,
  side: Side,
  actor: CinemaActor,
  res: {
    imgs: Record<string, HTMLImageElement>;
    sprites: ReturnType<typeof useStageRuntime>["spritesRef"]["current"];
    rigs: ReturnType<typeof useStageRuntime>["rigsRef"]["current"];
  },
  state: { talking: boolean; active: boolean; listening: boolean; enterProgress: number; t: number }
): void {
  const ease = easeOutCubic(state.enterProgress);
  const dir = side === "left" ? -1 : 1;
  const slide = Math.round(26 * (1 - ease)) * dir;
  const focusShift = state.active ? 0 : 4 * dir;
  const x = actorX(side, actor) + slide + focusShift;
  const scale = Math.max(1, Math.floor(actor.scale ?? 1));

  ctx.save();
  // gentle: a heavy brightness cut reads as a different skin tone on pixel portraits
  if (!state.active) ctx.filter = "brightness(0.8) saturate(0.9)";
  ctx.globalAlpha = clamp01(ease);
  const rig = actor.rig ? res.rigs[actor.rig] : undefined;
  const sheet = actor.sprite ? res.sprites[actor.sprite] : undefined;
  if (rig) {
    const pose = rigPose(state, state.t, side === "left" ? 0 : 1.3);
    const frame = rigHeadFrame(rig.data, state.talking, state.t, actor.talkClip, actor.idleClip);
    drawRig(ctx, rig, frame, x, VIRTUAL_H, pose, { scale, flipX: actor.flipX });
  } else if (sheet) {
    const clip = state.talking ? actor.talkClip ?? "talk" : actor.idleClip ?? "idle";
    drawSpriteFrame(ctx, sheet, frameAt(sheet.meta, clip, state.t), x, VIRTUAL_H, { scale, flipX: actor.flipX });
  } else {
    const im = actor.portrait ? res.imgs[`p:${actor.portrait}`] : undefined;
    if (im) {
      const w = im.naturalWidth * scale;
      const h = im.naturalHeight * scale;
      const breath = Math.round(Math.sin(state.t * 2.2 + (side === "left" ? 0 : 1.7)) * 0.8);
      const talkBob = state.talking ? -Math.round(Math.abs(Math.sin(state.t * 9.5)) * 2) : 0;
      if (actor.flipX) {
        ctx.translate(x * 2, 0);
        ctx.scale(-1, 1);
      }
      drawPixelImage(ctx, im, x - Math.floor(w / 2), VIRTUAL_H - h + breath + talkBob + 1, w, h);
    }
  }
  ctx.restore();
}

function stampOf(stamp: string | SceneStamp | undefined): SceneStamp | null {
  if (!stamp) return null;
  return typeof stamp === "string" ? { text: stamp } : stamp;
}

/**
 * Cinematic player v2 (data-driven): thin top bar with ふ / JA·VI / sound / close, a framed pixel
 * stage with in-scene tags, stamps, title card and mini-games, and a caption bar UNDER the stage
 * (bilingual line, or an uppercase instruction with progress), like a classic adventure game.
 */
export function CinemaStage({
  story,
  showFurigana,
  showVi,
  muted,
  autoplay,
  onToggleFurigana,
  onToggleVi,
  onToggleMute,
  onClose,
  onOpenReading,
  onOpenDictation,
  startScene = 0,
}: CinemaStageProps) {
  const rt = useStageRuntime({ story, muted, initialScene: startScene });
  const {
    canvasRef,
    imagesRef,
    spritesRef,
    rigsRef,
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
    cameraRef,
    stageStartRef,
    recordMode,
  } = rt;

  const [phase, setPhase] = useState<Phase>("lines");
  const [lineIdx, setLineIdx] = useState(-1);
  const [showCard, setShowCard] = useState(false);
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [backdropOverride, setBackdropOverride] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [foundIds, setFoundIds] = useState<string[]>([]);
  const [reachedEnd, setReachedEnd] = useState(false);

  const currentScene = story.scenes[sceneIdx];
  const kind = cinemaSceneKind(currentScene.type);
  const cast = useMemo(() => resolveCast(story), [story]);
  const interaction = currentScene.interaction;
  const total = interaction
    ? interaction.type === "drag"
      ? interaction.items?.length ?? 0
      : interaction.type === "tap"
        ? interaction.spots?.length ?? 0
        : 1
    : 0;

  // interaction runtime state (refs: read every frame by the render loop)
  const dragRef = useRef<DragItemState[]>([]);
  const dragIdxRef = useRef(-1);
  const pointerRef = useRef<Vec>([0, 0]);
  const holdRef = useRef({ progress: 0, holding: false });
  const particlesRef = useRef<Particle[]>([]);
  const cursorRef = useRef({ x: 160, y: 120, down: false, visible: false });
  const phaseRef = useRef<Phase>("lines");
  phaseRef.current = phase;
  const completingRef = useRef(false);
  const foundRef = useRef<string[]>([]);

  const go = useCallback((idx: number) => goToScene(idx, "dissolve"), [goToScene]);

  // Scene script runner: lines -> (interaction) -> ready
  useEffect(() => {
    if (!assetsReady) return;
    let cancelled = false;
    sceneStartRef.current = performance.now();
    setPhase("lines");
    setLineIdx(-1);
    setActiveLine(null);
    setCheckedIds([]);
    setBackdropOverride(null);
    setProgress(0);
    setFoundIds([]);
    foundRef.current = [];
    setDraggingId(null);
    completingRef.current = false;
    dragRef.current = initDrag(currentScene.interaction?.items ?? []);
    dragIdxRef.current = -1;
    holdRef.current = { progress: 0, holding: false };
    particlesRef.current = [];
    if (sceneIdx === story.scenes.length - 1) setReachedEnd(true);

    const run = async () => {
      for (let i = 0; i < currentScene.lines.length; i++) {
        if (cancelled) return;
        setLineIdx(i);
        await playVoiceLine(currentScene.lines[i]);
        if (cancelled) return;
        await sleep(420);
      }
      if (cancelled) return;
      if (currentScene.interaction) {
        setPhase("interact");
      } else {
        setPhase("ready");
        if (kind === "outro") retroAudio.playKotoChime();
      }
    };
    void run();
    return () => {
      cancelled = true;
      stopVoice();
    };
  }, [assetsReady, currentScene, kind, playVoiceLine, sceneIdx, sceneStartRef, setActiveLine, stopVoice, story.scenes.length]);

  // Vibe kit: remember when each line starts and play its sound effect (logged for the MP4).
  const vibeRef = useRef<{ line: DialogueLine | null; start: number }>({ line: null, start: 0 });
  // telop stays up while its line is spoken (also for checklist answers, which play in "ready")
  const [telopOn, setTelopOn] = useState(false);
  useEffect(() => {
    if (!activeLine?.telop) {
      setTelopOn(false);
      return;
    }
    setTelopOn(true);
    const id = window.setTimeout(() => setTelopOn(false), Math.round((activeLine.durationSec ?? 3) * 1000) + 300);
    return () => window.clearTimeout(id);
  }, [activeLine]);

  useEffect(() => {
    vibeRef.current = { line: activeLine, start: performance.now() };
    const name = lineSfx(activeLine);
    const url = name ? sfxUrl(name) : null;
    if (!name || !url) return;
    logStoryEvent({ type: "sfx", audioUrl: url, lineId: activeLine?.id }, stageStartRef.current);
    if (!recordMode) retroAudio.playSfx(name);
  }, [activeLine, recordMode, stageStartRef]);

  // BGM mood per scene (scene.bgm > story.bgm); the exporter renders the same themes into the MP4.
  const bgmThemeRef = useRef<string | null>(null);
  const bgmStartedRef = useRef(false);
  useEffect(() => {
    if (!assetsReady) return;
    const theme = resolveBgmTheme(currentScene.bgm ?? story.bgm ?? "default");
    if (theme === bgmThemeRef.current) return;
    bgmThemeRef.current = theme;
    logStoryEvent({ type: "bgm", theme }, stageStartRef.current);
    if (bgmStartedRef.current && !recordMode) retroAudio.startBgm(theme);
  }, [assetsReady, currentScene, recordMode, stageStartRef, story.bgm]);
  /** First user gesture (BEGIN) starts the music of the current scene. */
  const startMusic = useCallback(() => {
    bgmStartedRef.current = true;
    if (!recordMode) retroAudio.startBgm(bgmThemeRef.current ?? story.bgm ?? "default");
  }, [recordMode, story.bgm]);

  const completeInteraction = useCallback(async () => {
    if (completingRef.current) return;
    completingRef.current = true;
    setPhase("doneLine");
    retroAudio.playFanfare();
    spawnBurst(particlesRef.current, [160, 90], ["#ffe38c", "#f6eed8", "#f4b6c2"], 18, 70);
    const done = currentScene.interaction?.doneLine;
    if (done) {
      await playVoiceLine(done);
      await sleep(300);
    }
    setPhase("ready");
  }, [currentScene, playVoiceLine]);

  const registerProgress = useCallback(
    (n: number) => {
      setProgress(n);
      if (n >= total) void completeInteraction();
    },
    [completeInteraction, total]
  );

  // --- pointer input --------------------------------------------------------------------------
  const toVirtual = (e: React.PointerEvent<HTMLCanvasElement>): Vec => {
    const rect = e.currentTarget.getBoundingClientRect();
    return [((e.clientX - rect.left) / rect.width) * VIRTUAL_W, ((e.clientY - rect.top) / rect.height) * VIRTUAL_H];
  };

  const pressAt = useCallback(
    (p: Vec) => {
      pointerRef.current = p;
      if (phaseRef.current !== "interact" || !interaction) return;
      if (interaction.type === "drag") {
        const i = pickDragItem(dragRef.current, p);
        if (i >= 0) {
          dragIdxRef.current = i;
          setDraggingId(dragRef.current[i].id);
          retroAudio.playClick();
        }
      } else if (interaction.type === "tap") {
        // read/write through the ref: several taps can happen before React re-renders
        const id = hitTapSpot(interaction.spots ?? [], foundRef.current, p);
        if (id) {
          const spot = interaction.spots?.find((s) => s.id === id);
          retroAudio.playBeepScan();
          spawnBurst(particlesRef.current, [spot?.x ?? p[0], spot?.y ?? p[1]], ["#ffe38c", "#f6eed8"], 10, 45);
          const next = [...foundRef.current, id];
          foundRef.current = next;
          setFoundIds(next);
          if (spot?.line) void playVoiceLine(spot.line);
          registerProgress(next.length);
        }
      } else if (interaction.type === "hold") {
        holdRef.current.holding = true;
      }
    },
    [interaction, playVoiceLine, registerProgress]
  );

  const moveTo = useCallback((p: Vec) => {
    pointerRef.current = p;
  }, []);

  const releaseAt = useCallback(
    (p: Vec) => {
      pointerRef.current = p;
      holdRef.current.holding = false;
      const i = dragIdxRef.current;
      if (i < 0) return;
      dragIdxRef.current = -1;
      setDraggingId(null);
      const r = dropDragItem(dragRef.current, i, p);
      dragRef.current = r.items;
      if (r.placed) {
        retroAudio.playBeepScan();
        spawnBurst(particlesRef.current, r.items[i].target, ["#c78b56", "#f6eed8", "#995f39"], 12, 40);
        registerProgress(r.items.filter((it) => it.placed).length);
      }
    },
    [registerProgress]
  );

  // --- checklist (legacy cinema_checklist / cinema_explore) -------------------------------------
  const selectChoice = useCallback(
    async (choice: MiniGameChoice) => {
      retroAudio.playClick();
      setBackdropOverride(choice.backdrop ?? null);
      setCheckedIds((prev) => (prev.includes(choice.id) ? prev : [...prev, choice.id]));
      await playVoiceLine(choice.responseLine);
    },
    [playVoiceLine]
  );
  const checklistChoices = currentScene.minigame?.choices ?? [];
  const allChecked = checklistChoices.length === 0 || checklistChoices.every((c) => checkedIds.includes(c.id));

  // --- autoplay director (hands-free demo + deterministic MP4 export) ---------------------------
  const moveCursor = useCallback(async (to: Vec, ms: number, down: boolean, onStep?: (p: Vec) => void) => {
    const c = cursorRef.current;
    const from: Vec = [c.x, c.y];
    const steps = Math.max(1, Math.round(ms / 33));
    for (let s = 1; s <= steps; s++) {
      const u = easeOutCubic(s / steps);
      const p: Vec = [from[0] + (to[0] - from[0]) * u, from[1] + (to[1] - from[1]) * u - (down ? Math.sin(u * Math.PI) * 14 : 0)];
      c.x = p[0];
      c.y = p[1];
      c.down = down;
      onStep?.(p);
      await sleep(33);
    }
  }, []);

  useEffect(() => {
    if (!autoplay || !assetsReady) return;
    let cancelled = false;
    const c = cursorRef.current;
    const direct = async () => {
      if (phase === "interact" && interaction) {
        c.visible = true;
        await sleep(500);
        if (interaction.type === "drag") {
          for (let i = 0; i < dragRef.current.length; i++) {
            const it = dragRef.current[i];
            if (cancelled) return;
            if (it.placed) continue;
            await moveCursor(it.pos, 450, false);
            if (cancelled) return;
            pressAt(it.pos);
            await moveCursor(it.target, 900, true, moveTo);
            if (cancelled) return;
            releaseAt(it.target);
            c.down = false;
            await sleep(450);
          }
        } else if (interaction.type === "tap") {
          for (const s of interaction.spots ?? []) {
            if (cancelled) return;
            await moveCursor([s.x, s.y], 550, false);
            if (cancelled) return;
            c.down = true;
            pressAt([s.x, s.y]);
            await sleep(140);
            c.down = false;
            const spotLine = s.line?.durationSec ? s.line.durationSec * 1000 + 300 : 650;
            await sleep(spotLine);
          }
        } else if (interaction.type === "hold" && interaction.hold) {
          await moveCursor([interaction.hold.x, interaction.hold.y + 12], 500, false);
          if (cancelled) return;
          c.down = true;
          pressAt([interaction.hold.x, interaction.hold.y]);
          await sleep(interaction.hold.durationSec * 1000 + 250);
          c.down = false;
          releaseAt([interaction.hold.x, interaction.hold.y]);
        }
        return;
      }
      if (phase !== "ready") return;
      c.visible = false;
      if (kind === "checklist") {
        for (const choice of checklistChoices) {
          if (cancelled) return;
          await sleep(700);
          if (cancelled) return;
          await selectChoice(choice);
          if (cancelled) return;
          await sleep(500);
        }
      }
      await sleep(1100);
      if (cancelled) return;
      if (sceneIdx + 1 < story.scenes.length) {
        if (kind === "intro") startMusic();
        go(sceneIdx + 1);
      } else {
        markDone();
      }
    };
    void direct();
    return () => {
      cancelled = true;
    };
    // checklistChoices/interaction derive from currentScene (covered by sceneIdx)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetsReady, autoplay, go, kind, markDone, phase, sceneIdx, selectChoice, startMusic, story]);

  // --- render loop ------------------------------------------------------------------------------
  // refs mirrored for the render loop (it must not restart on every state change)
  const registerProgressRef = useRef(registerProgress);
  registerProgressRef.current = registerProgress;

  const visibleLabels = (currentScene.labels ?? []).filter((l) => l.afterLine === undefined || lineIdx >= l.afterLine || phase !== "lines");
  const labelsRef = useRef(visibleLabels);
  labelsRef.current = visibleLabels;

  useEffect(() => {
    if (!assetsReady) return;
    const backdropRef = sceneBackdropRef(currentScene, backdropOverride);
    const overlayNames = backdropOverride
      ? []
      : [currentScene.overlay ?? LEGACY_BADGE_OVERLAY[backdropRef], ...(currentScene.overlays ?? [])].filter(Boolean) as string[];
    const sides = visibleActors(currentScene);
    const inter = currentScene.interaction;

    const actorBox = (side: Side) => {
      const actor = cast[side];
      if (!actor) return null;
      const scale = Math.max(1, Math.floor(actor.scale ?? 1));
      const rig = actor.rig ? rigsRef.current[actor.rig] : undefined;
      const sheet = actor.sprite ? spritesRef.current[actor.sprite] : undefined;
      const im = actor.portrait ? imagesRef.current[`p:${actor.portrait}`] : undefined;
      const w = (rig?.data.frameWidth ?? sheet?.meta.frameWidth ?? im?.naturalWidth ?? 64) * scale;
      const h = (rig?.data.frameHeight ?? sheet?.meta.frameHeight ?? im?.naturalHeight ?? 96) * scale;
      return { side, x: actorX(side, actor), top: VIRTUAL_H - h, w, h };
    };

    return startLoop((ctx, now, dt) => {
      const t = now / 1000;
      const elapsed = (now - sceneStartRef.current) / 1000;
      const imgs = imagesRef.current;

      // vibe kit: who is speaking, how long into the line
      const vibe = vibeRef.current;
      const vLine = speakingRef.current !== null ? vibe.line : null;
      // rAF `now` is the frame start and can be slightly older than the line start
      const vAge = Math.max(0, (now - vibe.start) / 1000);
      const onStage = kind === "intro" ? [] : sides;
      const speakerSide = vLine ? onStage.find((sd) => cast[sd]?.voice === vLine.voice) : undefined;
      // the camera frames whoever reacts (emoteSide) or else the speaker
      const focusSide = vLine?.emoteSide && onStage.includes(vLine.emoteSide) ? vLine.emoteSide : speakerSide;
      const focusBox = focusSide ? actorBox(focusSide) : null;
      const focus: [number, number] = focusBox
        ? [focusBox.x, focusBox.top + focusBox.h * 0.3]
        : [VIRTUAL_W / 2, VIRTUAL_H / 2];
      cameraRef.current = vLine?.camera ? cameraAt(vLine.camera, vAge, focus, vLine.durationSec ?? 3) : IDENTITY_VIEW;

      if (!drawBackdrop(ctx, backdropRef, t, imgs)) {
        ctx.fillStyle = "#101322";
        ctx.fillRect(0, 0, VIRTUAL_W, VIRTUAL_H);
      }
      for (const name of overlayNames) OVERLAYS[name]?.(ctx, t);

      if (kind !== "intro") {
        const speaking = speakingRef.current;
        sides.forEach((side, i) => {
          const actor = cast[side];
          if (!actor) return;
          const focus = actorFocus(side, cast, speaking, sides);
          drawActor(ctx, side, actor, { imgs, sprites: spritesRef.current, rigs: rigsRef.current }, {
            ...focus,
            enterProgress: Math.min(elapsed / (0.5 + i * 0.1), 1),
            t,
          });
        });
      }

      // interaction layer
      const interacting = phaseRef.current === "interact";
      if (inter?.type === "drag") {
        const items = dragRef.current;
        const firstOpen = items.findIndex((it) => !it.placed);
        items.forEach((it, i) => {
          const spec = inter.items?.[i];
          const im = spec ? imgs[`i:${spec.item}`] : undefined;
          const dragging = dragIdxRef.current === i;
          if (interacting && !it.placed && i === firstOpen && !dragging) {
            drawTargetGlow(ctx, it.target, t);
            drawArcHint(ctx, it.pos, it.target, t);
          }
          if (interacting && dragging) drawTargetGlow(ctx, it.target, t);
          const pos = dragging ? pointerRef.current : it.pos;
          if (im) {
            const bob = !it.placed && !dragging && interacting ? Math.round(Math.sin(t * 4 + i) * 1) : 0;
            drawPixelImage(ctx, im, Math.round(pos[0] - im.naturalWidth / 2), Math.round(pos[1] - im.naturalHeight / 2) + bob, im.naturalWidth, im.naturalHeight);
          }
        });
      } else if (inter?.type === "tap") {
        for (const s of inter.spots ?? []) {
          const found = foundRef.current.includes(s.id);
          const im = s.item ? imgs[`i:${s.item}`] : undefined;
          if (found && im) {
            drawPixelImage(ctx, im, Math.round(s.x - im.naturalWidth / 2), Math.round(s.y - im.naturalHeight / 2), im.naturalWidth, im.naturalHeight);
          } else if (!found && interacting) {
            const tw = Math.sin(t * 3 + s.x) > 0.2;
            ctx.fillStyle = tw ? "#ffe38c" : "#f6eed8";
            ctx.fillRect(Math.round(s.x), Math.round(s.y) - 2, 1, 5);
            ctx.fillRect(Math.round(s.x) - 2, Math.round(s.y), 5, 1);
          }
        }
      } else if (inter?.type === "hold" && inter.hold) {
        const h = inter.hold;
        const hr = holdRef.current;
        if (interacting) {
          const before = hr.progress;
          hr.progress = stepHold(hr.progress, hr.holding, dt, h.durationSec);
          if (before < 1 && hr.progress >= 1) {
            hr.holding = false;
            registerProgressRef.current(1);
          }
        }
        const im = h.item ? imgs[`i:${h.item}`] : undefined;
        if (im) {
          const tilt = hr.holding ? -2 : 0;
          drawPixelImage(ctx, im, Math.round(h.x - im.naturalWidth / 2), Math.round(h.y - im.naturalHeight - 10) + tilt, im.naturalWidth, im.naturalHeight);
        }
        if (hr.holding && h.streamTo) drawStream(ctx, [h.x + 8, h.y - 12], h.streamTo, t);
        drawMeter(ctx, h.x, h.y, 64, hr.progress);
      }

      // one light grade over the whole world layer (backdrop, actors, items) = one time of day
      drawLightGrade(ctx, currentScene.light);
      if (vLine?.emote) {
        const emoteSide = vLine.emoteSide ?? speakerSide ?? onStage[0];
        const b = emoteSide ? actorBox(emoteSide) : null;
        if (b) {
          const dir = b.side === "left" ? 1 : -1;
          // big portraits get pixel-doubled symbols so they read at the same visual weight
          const k = b.h >= 64 ? 2 : 1;
          drawEmote(ctx, vLine.emote, b.x + dir * Math.round(b.w * 0.3), b.top + Math.round(b.h * 0.22), vAge, k);
        } else {
          drawEmote(ctx, vLine.emote, VIRTUAL_W / 2, 60, vAge, 2);
        }
      }

      for (const l of labelsRef.current) {
        if (l.to) drawLeaderLine(ctx, [l.x, l.y + 6], l.to);
      }
      particlesRef.current = stepAndDrawParticles(ctx, particlesRef.current, dt);
      if (story.look?.vignette) drawDitherVignette(ctx);
      const c = cursorRef.current;
      if (c.visible && autoplay) drawCursor(ctx, c.x, c.y, c.down);
    });
  }, [
    assetsReady,
    autoplay,
    backdropOverride,
    cast,
    currentScene,
    imagesRef,
    kind,
    rigsRef,
    sceneStartRef,
    speakingRef,
    spritesRef,
    startLoop,
    story.look,
  ]);

  // --- UI ------------------------------------------------------------------------------------
  const stamp = stampOf(currentScene.stamp);
  const telop: LineTelop | null = activeLine?.telop
    ? typeof activeLine.telop === "string"
      ? { text: activeLine.telop }
      : activeLine.telop
    : null;
  const title = currentScene.titleCard?.title ?? currentScene.bannerTitle ?? story.titleJa;
  const subtitle = currentScene.titleCard?.subtitle ?? currentScene.bannerSubtitle ?? story.level;
  const labels = currentScene.outroLabels ?? {};
  const isLast = sceneIdx + 1 >= story.scenes.length;

  let caption: ReactNode = null;
  if (phase === "interact" && interaction) {
    caption = <div className="cine-cap-hint">{hintText(interaction.hint, progress, total)}</div>;
  } else if (kind === "outro" && phase === "ready") {
    caption = (
      <>
        {currentScene.summary && (
          <div className="cine-cap-summary">
            <RubyText segments={currentScene.summary} showFurigana={showFurigana} />
          </div>
        )}
        <div className="cine-cap-actions">
          <button type="button" className="cine-btn" onClick={() => { retroAudio.playClick(); onOpenReading(); }}>
            {labels.reading ?? "📖 ĐỌC BÀI & LÀM QUIZ →"}
          </button>
          <button type="button" className="cine-btn ghost" onClick={() => { retroAudio.playClick(); onOpenDictation(); }}>
            {labels.dictation ?? "🎧 NGHE CHÉP"}
          </button>
          <button type="button" className="cine-btn ghost" onClick={() => { retroAudio.playClick(); setShowCard(true); }}>
            {labels.card ?? "THẺ NHÂN VẬT"}
          </button>
          <button type="button" className="cine-btn ghost" onClick={() => { retroAudio.playClick(); go(0); }}>
            {labels.replay ?? "↺ XEM LẠI"}
          </button>
        </div>
      </>
    );
  } else if (activeLine) {
    caption = (
      <>
        {activeLine.speakerLabel && <div className="cine-cap-speaker">{activeLine.speakerLabel}</div>}
        <div className="cine-cap-ja">
          <RubyText segments={activeLine.jaRuby} showFurigana={showFurigana} />
        </div>
        <div className="cine-cap-vi">{activeLine.vi}</div>
      </>
    );
  } else if (currentScene.instruction && kind !== "intro") {
    caption = <div className="cine-cap-hint">{currentScene.instruction.toLocaleUpperCase("vi-VN")}</div>;
  }

  return (
    <div className={`cine-player ${showVi ? "" : "hide-vi"}`}>
      <div className="cine-topbar">
        <span className="cine-title">
          {story.titleJa} · {story.level}
        </span>
        <div className="cine-tools">
          {story.characterCard && (
            <button type="button" className="cine-tool" onClick={() => setShowCard(true)} title="Thẻ thông tin">
              ?
            </button>
          )}
          <button type="button" className={`cine-tool ${showFurigana ? "on" : ""}`} onClick={onToggleFurigana} title="Furigana">
            ふ
          </button>
          <button type="button" className={`cine-tool ${showVi ? "on" : ""}`} onClick={onToggleVi} title="Phụ đề tiếng Việt">
            {showVi ? "JA·VI" : "JA"}
          </button>
          <button type="button" className="cine-tool" onClick={onToggleMute} title="Âm thanh">
            {muted ? "🔇" : "🔊"}
          </button>
          <button type="button" className="cine-tool" onClick={onClose} title="Đóng">
            ✕
          </button>
        </div>
      </div>

      <div className="cine-stage canvas-viewport">
        <canvas
          ref={canvasRef}
          width={VIRTUAL_W}
          height={VIRTUAL_H}
          className="pixel-canvas"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            pressAt(toVirtual(e));
          }}
          onPointerMove={(e) => moveTo(toVirtual(e))}
          onPointerUp={(e) => releaseAt(toVirtual(e))}
          onPointerCancel={(e) => releaseAt(toVirtual(e))}
        />
        <div className="cine-brand">{story.brand ?? "jp-pixel-story"}</div>

        {stamp && kind !== "intro" && (
          <div className="cine-stamp" style={toPct(stamp.x ?? 160, stamp.y ?? 18)}>
            {stamp.text}
          </div>
        )}

        {visibleLabels.map((l, i) => (
          <div key={`${sceneIdx}-${i}`} className={`cine-tag ${l.style === "letter" ? "letter" : ""}`} style={toPct(l.x, l.y)}>
            <RubyText segments={l.text} showFurigana={showFurigana} />
            {l.sub && <span className="cine-tag-sub">{l.sub}</span>}
          </div>
        ))}

        {interaction?.type === "drag" &&
          phase === "interact" &&
          (interaction.items ?? []).map((it, i) =>
            it.label && !dragRef.current[i]?.placed && draggingId !== it.id ? (
              <div key={it.id} className="cine-tag" style={toPct(it.from[0], it.from[1] - 22)}>
                <RubyText segments={it.label} showFurigana={showFurigana} />
                {it.labelVi && <span className="cine-tag-sub">{it.labelVi}</span>}
              </div>
            ) : null
          )}
        {interaction?.type === "tap" &&
          (interaction.spots ?? []).map((s) =>
            foundIds.includes(s.id) && s.label ? (
              <div key={s.id} className="cine-tag" style={toPct(s.x, s.y - 18)}>
                <RubyText segments={s.label} showFurigana={showFurigana} />
                {s.labelVi && <span className="cine-tag-sub">{s.labelVi}</span>}
              </div>
            ) : null
          )}
        {interaction?.type === "hold" && interaction.hold && (
          <div className="cine-tag" style={toPct(interaction.hold.x, interaction.hold.y + 16)}>
            <RubyText segments={interaction.hold.label} showFurigana={showFurigana} />
          </div>
        )}
        {telop && telopOn && phase !== "interact" && (
          <div
            key={activeLine?.id}
            className={`cine-telop ${telop.color ?? "shu"}`}
            style={{ left: `${telop.x ?? 50}%`, top: `${telop.y ?? 24}%` }}
          >
            <div className="cine-telop-t">
              <RubyText segments={telop.text} showFurigana={showFurigana} />
            </div>
            {telop.sub && showVi && <div className="cine-telop-s">{telop.sub}</div>}
          </div>
        )}
        {interaction && phase === "interact" && total > 1 && (
          <div className="cine-counter">
            {progress} / {total}
          </div>
        )}

        {kind === "intro" && (
          <div className="cine-titlecard">
            <h1>
              <RubyText segments={title} showFurigana={showFurigana} />
            </h1>
            <div className="sub">{subtitle}</div>
            <button
              type="button"
              className="cine-btn"
              onClick={() => {
                startMusic();
                retroAudio.playClick();
                go(1);
              }}
            >
              ▶ {currentScene.actionLabel ?? "BẮT ĐẦU"}
            </button>
            {currentScene.titleCard?.credit && <div className="credit">{currentScene.titleCard.credit}</div>}
          </div>
        )}

        {currentScene.revealNote && phase === "ready" && (
          <div className="cine-note">
            {currentScene.revealNote.map((note, i) => (
              <div key={i}>
                <b style={{ color: note.color ?? "#ffd875" }}>{note.label}</b> {note.text}
              </div>
            ))}
          </div>
        )}

        {kind === "checklist" && phase === "ready" && (
          <div className="cine-choices">
            {checklistChoices.map((ch) => (
              <button
                key={ch.id}
                type="button"
                className={`cine-choice ${checkedIds.includes(ch.id) ? "done" : ""}`}
                onClick={() => void selectChoice(ch)}
              >
                {checkedIds.includes(ch.id) ? "✓ " : ""}
                {ch.labelRuby ? <RubyText segments={ch.labelRuby} showFurigana={showFurigana} /> : ch.labelJa}
              </button>
            ))}
          </div>
        )}

        {phase === "ready" && !isLast && kind !== "intro" && (kind !== "checklist" || allChecked) && (
          <div className="cine-stage-actions">
            <button
              type="button"
              className="cine-btn"
              onClick={() => {
                retroAudio.playClick();
                go(sceneIdx + 1);
              }}
            >
              {currentScene.actionLabel ?? "TIẾP TỤC →"}
            </button>
          </div>
        )}

        {showCard && story.characterCard && (
          <InfoCard
            card={story.characterCard}
            portraitUrl={story.assets?.cardPortrait}
            unlocked={reachedEnd}
            showFurigana={showFurigana}
            onClose={() => {
              retroAudio.playClick();
              setShowCard(false);
            }}
          />
        )}
      </div>

      <div className="cine-caption">{caption}</div>
    </div>
  );
}
