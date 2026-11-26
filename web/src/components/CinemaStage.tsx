import { useCallback, useEffect, useMemo, useState } from "react";
import { retroAudio } from "../audio/chiptune";
import {
  LEGACY_BADGE_OVERLAY,
  OVERLAYS,
  drawBackdrop,
} from "../engine/cinemaBackdrops";
import {
  actorFocus,
  actorX,
  cinemaSceneKind,
  resolveCast,
  sceneBackdropRef,
  visibleActors,
  type Side,
} from "../engine/cinemaModel";
import { drawPixelImage } from "../engine/pixelScale";
import { VIRTUAL_H, VIRTUAL_W } from "../engine/pixelRenderer";
import { drawSpriteFrame, frameAt } from "../engine/spriteAnimator";
import { useStageRuntime } from "../engine/useStageRuntime";
import type { CinemaActor, MiniGameChoice, StoryData } from "../types/story";
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

function drawCinemaBottomFade(ctx: CanvasRenderingContext2D, strength = 0.78): void {
  const grad = ctx.createLinearGradient(0, 128, 0, VIRTUAL_H);
  grad.addColorStop(0, "rgba(10, 13, 24, 0)");
  grad.addColorStop(0.65, `rgba(10, 13, 24, ${(strength * 0.55).toFixed(2)})`);
  grad.addColorStop(1, `rgba(10, 13, 24, ${strength.toFixed(2)})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 128, VIRTUAL_W, VIRTUAL_H - 128);
}

/**
 * Frameless actor standing on the bottom edge. Sprites play their idle/talk clips from
 * meta.json; static portraits get a 1px breathing / talking bob. Always whole-pixel scale.
 */
function drawActor(
  ctx: CanvasRenderingContext2D,
  side: Side,
  actor: CinemaActor,
  res: { imgs: Record<string, HTMLImageElement>; sprites: ReturnType<typeof useStageRuntime>["spritesRef"]["current"] },
  state: { talking: boolean; active: boolean; enterProgress: number; t: number }
): void {
  const ease = easeOutCubic(state.enterProgress);
  const dir = side === "left" ? -1 : 1;
  const slide = Math.round(26 * (1 - ease)) * dir;
  const focusShift = state.active ? 0 : 4 * dir;
  const x = actorX(side, actor) + slide + focusShift;
  const scale = Math.max(1, Math.floor(actor.scale ?? 1));

  ctx.save();
  if (!state.active) ctx.filter = "brightness(0.64) saturate(0.86)";
  ctx.globalAlpha = clamp01(ease);

  const sheet = actor.sprite ? res.sprites[actor.sprite] : undefined;
  if (sheet) {
    const clip = state.talking ? actor.talkClip ?? "talk" : actor.idleClip ?? "idle";
    const frame = frameAt(sheet.meta, clip, state.t);
    drawSpriteFrame(ctx, sheet, frame, x, VIRTUAL_H, { scale, flipX: actor.flipX });
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

/**
 * Data-driven pixel cinema: every story-specific detail (backdrops, overlays, cast, banner,
 * reveal notes, checklist backdrops, outro labels, BGM) comes from story.json.
 */
export function CinemaStage({
  story,
  showFurigana,
  muted,
  autoplay,
  onOpenReading,
  onOpenDictation,
}: CinemaStageProps) {
  const rt = useStageRuntime({ story, muted });
  const {
    canvasRef,
    imagesRef,
    spritesRef,
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
  } = rt;

  const [lineFinished, setLineFinished] = useState(false);
  const [showCard, setShowCard] = useState(false);
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [backdropOverride, setBackdropOverride] = useState<string | null>(null);

  const currentScene = story.scenes[sceneIdx];
  const kind = cinemaSceneKind(currentScene.type);
  const cast = useMemo(() => resolveCast(story), [story]);

  // Scene script runner
  useEffect(() => {
    if (!assetsReady) return;
    let cancelled = false;
    sceneStartRef.current = performance.now();
    setLineFinished(false);
    setActiveLine(null);
    setCheckedIds([]);
    setBackdropOverride(null);

    const run = async () => {
      for (const line of currentScene.lines) {
        if (cancelled) return;
        await playVoiceLine(line);
        if (cancelled) return;
        await new Promise((r) => window.setTimeout(r, 420));
      }
      if (cancelled) return;
      setLineFinished(true);
      if (kind === "outro") retroAudio.playKotoChime();
    };
    void run();
    return () => {
      cancelled = true;
      stopVoice();
    };
  }, [assetsReady, currentScene, kind, playVoiceLine, sceneStartRef, setActiveLine, stopVoice]);

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
  const allChecked =
    checklistChoices.length === 0 || checklistChoices.every((c) => checkedIds.includes(c.id));

  // Autoplay director (hands-free demo + MP4 export): also plays through checklist items.
  useEffect(() => {
    if (!autoplay || !assetsReady || !lineFinished) return;
    let cancelled = false;
    const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms));
    const direct = async () => {
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
        if (kind === "intro") retroAudio.startBgm(story.bgm ?? "default");
        goToScene(sceneIdx + 1);
      } else {
        markDone();
      }
    };
    void direct();
    return () => {
      cancelled = true;
    };
    // checklistChoices is derived from currentScene (covered by sceneIdx/kind)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetsReady, autoplay, goToScene, kind, lineFinished, markDone, sceneIdx, selectChoice, story]);

  // 60fps render loop: backdrop -> overlay -> actors -> banner (transition handled by runtime)
  useEffect(() => {
    if (!assetsReady) return;
    const backdropRef = sceneBackdropRef(currentScene, backdropOverride);
    // A checklist backdrop override replaces the whole scene look, including its overlay.
    const overlayName = backdropOverride
      ? undefined
      : currentScene.overlay ?? LEGACY_BADGE_OVERLAY[backdropRef];
    const overlay = overlayName ? OVERLAYS[overlayName] : undefined;
    const sides = visibleActors(currentScene);

    return startLoop((ctx, now) => {
      const t = now / 1000;
      const elapsed = (now - sceneStartRef.current) / 1000;
      const imgs = imagesRef.current;

      if (!drawBackdrop(ctx, backdropRef, t, imgs)) {
        ctx.fillStyle = "#101322";
        ctx.fillRect(0, 0, VIRTUAL_W, VIRTUAL_H);
      }
      overlay?.(ctx, t);

      if (kind === "intro") {
        drawCinemaBottomFade(ctx, 0.65);
        ctx.save();
        ctx.font = 'bold 21px "DotGothic16", monospace';
        ctx.textAlign = "center";
        const title = currentScene.bannerTitle ?? story.titleJa;
        ctx.fillStyle = "rgba(12, 15, 28, 0.85)";
        ctx.fillText(title, VIRTUAL_W / 2 + 1, 56);
        ctx.fillStyle = "#ffe69c";
        ctx.fillText(title, VIRTUAL_W / 2, 54);
        ctx.font = 'bold 9px "DotGothic16", monospace';
        ctx.fillStyle = "#8ad4ff";
        ctx.fillText(currentScene.bannerSubtitle ?? story.level, VIRTUAL_W / 2, 69);
        ctx.restore();
        return;
      }

      drawCinemaBottomFade(ctx, 0.8);
      const speaking = speakingRef.current;
      sides.forEach((side, i) => {
        const actor = cast[side];
        if (!actor) return;
        const focus = actorFocus(side, cast, speaking);
        drawActor(ctx, side, actor, { imgs, sprites: spritesRef.current }, {
          ...focus,
          enterProgress: Math.min(elapsed / (0.5 + i * 0.1), 1),
          t,
        });
      });
    });
  }, [
    assetsReady,
    backdropOverride,
    cast,
    currentScene,
    imagesRef,
    kind,
    sceneStartRef,
    speakingRef,
    spritesRef,
    startLoop,
    story.level,
    story.titleJa,
  ]);

  const labels = currentScene.outroLabels ?? {};

  return (
    <div className="canvas-viewport">
      <canvas ref={canvasRef} width={VIRTUAL_W} height={VIRTUAL_H} className="pixel-canvas" />

      {currentScene.instruction && kind !== "intro" && (
        <div className="scene-hud-top">{currentScene.instruction}</div>
      )}

      {currentScene.whoButtonLabel && (
        <button
          type="button"
          className="pixel-btn pixel-btn-dark"
          style={{ position: "absolute", right: "14px", top: "12px", padding: "6px 12px", fontSize: "12px" }}
          onClick={() => {
            retroAudio.playClick();
            setShowCard(true);
          }}
        >
          {currentScene.whoButtonLabel}
        </button>
      )}

      {currentScene.revealNote && lineFinished && (
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
            {currentScene.revealNote.map((note, i) => (
              <div key={i}>
                <b style={{ color: note.color ?? "#ffd875" }}>{note.label}</b> {note.text}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="overlay-center-bottom">
        {activeLine && (
          <div className="subtitle-box">
            {activeLine.speakerLabel && <div className="subtitle-speaker">{activeLine.speakerLabel}</div>}
            <div className="subtitle-ja">
              <RubyText segments={activeLine.jaRuby} showFurigana={showFurigana} />
            </div>
            <div className="subtitle-vi">{activeLine.vi}</div>
          </div>
        )}

        {kind === "intro" && (
          <button
            type="button"
            className="pixel-btn pixel-btn-cream"
            onClick={() => {
              retroAudio.startBgm(story.bgm ?? "default");
              retroAudio.playClick();
              goToScene(1);
            }}
          >
            ▶ {currentScene.actionLabel ?? "はじめる · BẮT ĐẦU"}
          </button>
        )}

        {kind === "checklist" && lineFinished && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <div className="choice-row">
              {checklistChoices.map((ch) => {
                const done = checkedIds.includes(ch.id);
                return (
                  <button
                    key={ch.id}
                    type="button"
                    className={`pixel-icon-btn ${done ? "active" : ""}`}
                    onClick={() => void selectChoice(ch)}
                  >
                    {done ? "✓ " : ""}
                    {ch.labelRuby ? <RubyText segments={ch.labelRuby} showFurigana={showFurigana} /> : ch.labelJa}
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

        {kind === "dialogue" && lineFinished && sceneIdx + 1 < story.scenes.length && (
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

        {kind === "outro" && lineFinished && (
          <div className="action-row">
            <button
              type="button"
              className="pixel-btn pixel-btn-purple"
              onClick={() => {
                retroAudio.playClick();
                onOpenReading();
              }}
            >
              {labels.reading ?? "📖 ĐỌC BÀI & LÀM QUIZ →"}
            </button>
            <button
              type="button"
              className="pixel-btn pixel-btn-mint"
              onClick={() => {
                retroAudio.playClick();
                onOpenDictation();
              }}
            >
              {labels.dictation ?? "🎧 NGHE CHÉP"}
            </button>
            <button
              type="button"
              className="pixel-btn pixel-btn-cream"
              onClick={() => {
                retroAudio.playClick();
                setShowCard(true);
              }}
            >
              {labels.card ?? "THẺ NHÂN VẬT"}
            </button>
            <button
              type="button"
              className="pixel-btn pixel-btn-dark"
              onClick={() => {
                retroAudio.playClick();
                goToScene(0);
              }}
            >
              {labels.replay ?? "↺ XEM LẠI"}
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
