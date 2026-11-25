import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { retroAudio } from "../audio/chiptune";
import type { DictationPack } from "../types/dictation";
import { resolveAssetUrl } from "../utils/assetUrl";
import {
  buildProgressiveHint,
  gradeJapaneseDictation,
  shuffleTiles,
  splitRubyIntoTiles,
  type DictationGrade,
} from "../utils/dictation";
import { RubyText } from "./RubyText";

interface DictationViewProps {
  pack: DictationPack;
  showFurigana: boolean;
  onToggleFurigana: () => void;
  onOpenLibrary: () => void;
  onBackToStory?: () => void;
}

const SPEEDS = [0.7, 0.85, 1.0, 1.15];

function storageKey(packId: string): string {
  return `jp_pixel_dictation_done_${packId}`;
}

export function getSavedDictationCount(packId: string): number {
  try {
    const raw = localStorage.getItem(storageKey(packId));
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

export function DictationView({
  pack,
  showFurigana,
  onToggleFurigana,
  onOpenLibrary,
  onBackToStory,
}: DictationViewProps) {
  const [idx, setIdx] = useState(0);
  const [practiceMode, setPracticeMode] = useState<"type" | "tiles">("type");
  const [speed, setSpeed] = useState<number>(1.0);
  const [loop, setLoop] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  const [input, setInput] = useState("");
  const [pickedTileIds, setPickedTileIds] = useState<string[]>([]);
  const [grade, setGrade] = useState<DictationGrade | null>(null);
  const [revealed, setRevealed] = useState<boolean>(false);
  const [showMeaningHint, setShowMeaningHint] = useState<boolean>(false);
  const [streak, setStreak] = useState<number>(0);

  const [completedIds, setCompletedIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(storageKey(pack.id));
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  });

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const loopTimerRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const item = pack.items[idx];
  const total = pack.items.length;

  const orderedTiles = useMemo(
    () => (item ? splitRubyIntoTiles(item.jaRuby) : []),
    [item]
  );
  const scrambledTiles = useMemo(
    () => (item ? shuffleTiles(orderedTiles, item.id) : []),
    [orderedTiles, item]
  );

  const stopAudio = useCallback(() => {
    if (loopTimerRef.current !== null) {
      window.clearTimeout(loopTimerRef.current);
      loopTimerRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsPlaying(false);
  }, []);

  const playCurrent = useCallback(() => {
    if (!item) return;
    stopAudio();
    const audio = new Audio(resolveAssetUrl(item.audioUrl));
    audio.playbackRate = speed;
    audioRef.current = audio;
    setIsPlaying(true);

    audio.addEventListener(
      "ended",
      () => {
        setIsPlaying(false);
        if (loop) {
          loopTimerRef.current = window.setTimeout(() => {
            if (audioRef.current === audio) {
              audio.currentTime = 0;
              audio.playbackRate = speed;
              setIsPlaying(true);
              void audio.play().catch(() => setIsPlaying(false));
            }
          }, 1300);
        }
      },
      { once: false }
    );
    audio.addEventListener("error", () => setIsPlaying(false), { once: true });
    void audio.play().catch(() => setIsPlaying(false));
  }, [item, loop, speed, stopAudio]);

  // Update playback rate dynamically if user clicks a speed pill while playing
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
  }, [speed]);

  // Reset per-question state and auto-play sentence whenever idx changes
  useEffect(() => {
    setInput("");
    setPickedTileIds([]);
    setGrade(null);
    setRevealed(false);
    setShowMeaningHint(false);
    stopAudio();

    const timer = window.setTimeout(() => {
      playCurrent();
      if (practiceMode === "type") {
        inputRef.current?.focus();
      }
    }, 180);

    return () => {
      window.clearTimeout(timer);
      stopAudio();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, pack.id]);

  // Persist completed sentence IDs
  useEffect(() => {
    try {
      localStorage.setItem(storageKey(pack.id), JSON.stringify(completedIds));
    } catch {
      // ignore storage quota errors
    }
  }, [completedIds, pack.id]);

  const markCompleted = useCallback((id: string) => {
    setCompletedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, []);

  const handleCheck = useCallback(() => {
    if (!item) return;
    const candidateText =
      practiceMode === "type"
        ? input
        : pickedTileIds
            .map((tid) => orderedTiles.find((t) => t.id === tid)?.plain ?? "")
            .join("");

    const res = gradeJapaneseDictation(candidateText, item.jaPlain, item.jaKana);
    setGrade(res);

    if (res.exactMatch || res.accuracyPct === 100) {
      retroAudio.playFanfare();
      setRevealed(true);
      setStreak((s) => s + 1);
      markCompleted(item.id);
    } else {
      retroAudio.playClick();
      setStreak(0);
    }
  }, [input, item, markCompleted, orderedTiles, pickedTileIds, practiceMode]);

  const handleHint = useCallback(() => {
    if (!item) return;
    retroAudio.playClick();
    if (practiceMode === "type") {
      const nextHint = buildProgressiveHint(input, item.jaKana);
      setInput(nextHint);
      inputRef.current?.focus();
    } else {
      // Automatically place the next correct tile
      let matchedPrefix = 0;
      while (
        matchedPrefix < pickedTileIds.length &&
        matchedPrefix < orderedTiles.length &&
        pickedTileIds[matchedPrefix] === orderedTiles[matchedPrefix].id
      ) {
        matchedPrefix++;
      }
      if (matchedPrefix < orderedTiles.length) {
        const nextIds = orderedTiles
          .slice(0, matchedPrefix + 1)
          .map((t) => t.id);
        setPickedTileIds(nextIds);
      }
    }
  }, [input, item, orderedTiles, pickedTileIds, practiceMode]);

  const handleNext = useCallback(() => {
    if (idx + 1 < total) {
      setIdx(idx + 1);
    }
  }, [idx, total]);

  const handlePrev = useCallback(() => {
    if (idx > 0) {
      setIdx(idx - 1);
    }
  }, [idx]);

  // DailyDictation keyboard shortcuts: Ctrl+Space replay, Alt+H hint
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.code === "Space") {
        e.preventDefault();
        playCurrent();
      } else if (e.altKey && e.key.toLowerCase() === "h") {
        e.preventDefault();
        handleHint();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleHint, playCurrent]);

  if (!item) return null;

  const isSolved = Boolean(grade?.exactMatch || grade?.accuracyPct === 100);
  const progressPct = Math.round((completedIds.length / Math.max(total, 1)) * 100);

  return (
    <div className="dict-shell">
      {/* Top Bar */}
      <div className="dict-topbar">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            className="pixel-icon-btn"
            onClick={() => {
              stopAudio();
              onOpenLibrary();
            }}
          >
            📚 Thư viện
          </button>
          {onBackToStory ? (
            <button
              type="button"
              className="pixel-icon-btn"
              onClick={() => {
                stopAudio();
                onBackToStory();
              }}
            >
              🎮 Xem hoạt ảnh
            </button>
          ) : pack.backHref ? (
            <button
              type="button"
              className="pixel-icon-btn"
              onClick={() => {
                stopAudio();
                window.location.href = resolveAssetUrl(pack.backHref!);
              }}
            >
              🎮 Xem hoạt ảnh
            </button>
          ) : null}
        </div>

        <div className="dict-title-group">
          <span className="topbar-series">DAILY DICTATION · LUYỆN NGHE CHÉP CHÍNH TẢ</span>
          <div className="topbar-title">
            <span>
              {pack.titleJa} — {pack.titleVi}
            </span>
            <span className="level-pill">{pack.level}</span>
          </div>
        </div>

        <button
          type="button"
          className={`pixel-icon-btn ${showFurigana ? "active" : ""}`}
          onClick={onToggleFurigana}
        >
          ふりがな {showFurigana ? "ON" : "OFF"}
        </button>
      </div>

      {/* Progress & Sentence Selector */}
      <div className="dict-progress-area">
        <div className="dict-stats-row">
          <span>
            Câu <b>{idx + 1}</b> / {total}
          </span>
          <span>
            ✅ Hoàn thành:{" "}
            <b>
              {completedIds.length}/{total} ({progressPct}%)
            </b>
          </span>
          {streak > 0 && <span className="dict-streak">🔥 Chuỗi đúng: {streak}</span>}
        </div>

        <div className="dict-progress-track">
          <div
            className="dict-progress-fill"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        <div className="dict-step-dots">
          {pack.items.map((it, i) => {
            const done = completedIds.includes(it.id);
            return (
              <button
                key={it.id}
                type="button"
                className={`dict-dot ${i === idx ? "current" : ""} ${
                  done ? "done" : ""
                }`}
                onClick={() => setIdx(i)}
                title={`Câu ${i + 1}`}
              >
                {i + 1}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Dictation Card */}
      <div className="dict-card">
        {/* Audio Control Strip */}
        <div className="dict-audio-bar">
          <button
            type="button"
            className={`pixel-btn ${isPlaying ? "pixel-btn-mint" : "pixel-btn-purple"}`}
            onClick={() => (isPlaying ? stopAudio() : playCurrent())}
          >
            {isPlaying ? "⏸ Đang phát..." : "▶ Nghe câu (Ctrl+Space)"}
          </button>

          <div className="dict-speed-group" aria-label="Tốc độ đọc">
            {SPEEDS.map((sp) => (
              <button
                key={sp}
                type="button"
                className={`dict-chip ${speed === sp ? "active" : ""}`}
                onClick={() => setSpeed(sp)}
              >
                {sp}x
              </button>
            ))}
          </div>

          <button
            type="button"
            className={`dict-chip ${loop ? "active" : ""}`}
            onClick={() => setLoop((v) => !v)}
          >
            🔁 Lặp {loop ? "ON" : "OFF"}
          </button>

          <button
            type="button"
            className={`dict-chip ${showMeaningHint ? "active" : ""}`}
            onClick={() => setShowMeaningHint((v) => !v)}
          >
            🇻🇳 Gợi ý nghĩa
          </button>
        </div>

        {item.speakerLabel && (
          <div className="dict-speaker-tag">
            🎙️ Nhân vật: <b>{item.speakerLabel}</b>{" "}
            {item.durationSec ? `· ${item.durationSec.toFixed(1)}s` : ""}
          </div>
        )}

        {showMeaningHint && (
          <div className="dict-meaning-peek">
            <b>Nghĩa tiếng Việt:</b> {item.vi}
          </div>
        )}

        {/* Mode Switcher: Type vs Tiles */}
        <div className="dict-mode-tabs">
          <button
            type="button"
            className={`dict-mode-btn ${practiceMode === "type" ? "active" : ""}`}
            onClick={() => {
              setPracticeMode("type");
              setGrade(null);
            }}
          >
            ⌨️ Gõ chép chính tả (Hiragana hoặc Kanji)
          </button>
          <button
            type="button"
            className={`dict-mode-btn ${practiceMode === "tiles" ? "active" : ""}`}
            onClick={() => {
              setPracticeMode("tiles");
              setGrade(null);
            }}
          >
            🧩 Ghép cụm từ (Hợp điện thoại)
          </button>
        </div>

        {/* Input Area */}
        {practiceMode === "type" ? (
          <form
            className="dict-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (isSolved && idx + 1 < total) {
                handleNext();
              } else {
                handleCheck();
              }
            }}
          >
            <input
              ref={inputRef}
              type="text"
              className="dict-input"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                if (grade) setGrade(null);
              }}
              placeholder="Nghe VOICEVOX rồi gõ lại câu tiếng Nhật (gõ Hiragana thuần hay Kanji đều chấm đúng)..."
              autoComplete="off"
              spellCheck={false}
            />
          </form>
        ) : (
          <div className="dict-tiles-wrap">
            <div className="dict-tile-answer-box">
              {pickedTileIds.length === 0 ? (
                <span className="dict-tile-placeholder">
                  Nghe câu rồi bấm các cụm từ bên dưới theo đúng thứ tự...
                </span>
              ) : (
                pickedTileIds.map((tid) => {
                  const tile = orderedTiles.find((t) => t.id === tid);
                  if (!tile) return null;
                  return (
                    <button
                      key={tid}
                      type="button"
                      className="dict-tile placed"
                      onClick={() => {
                        setPickedTileIds((prev) => prev.filter((x) => x !== tid));
                        setGrade(null);
                      }}
                    >
                      <RubyText
                        segments={tile.segments}
                        showFurigana={showFurigana}
                      />
                    </button>
                  );
                })
              )}
            </div>

            <div className="dict-tile-bank">
              {scrambledTiles.map((tile) => {
                const used = pickedTileIds.includes(tile.id);
                return (
                  <button
                    key={tile.id}
                    type="button"
                    className={`dict-tile ${used ? "used" : ""}`}
                    disabled={used}
                    onClick={() => {
                      retroAudio.playClick();
                      setPickedTileIds((prev) => [...prev, tile.id]);
                      setGrade(null);
                    }}
                  >
                    <RubyText
                      segments={tile.segments}
                      showFurigana={showFurigana}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="dict-actions">
          <button
            type="button"
            className="pixel-btn pixel-btn-cream"
            onClick={handleCheck}
          >
            ✓ Kiểm tra
          </button>
          <button
            type="button"
            className="pixel-btn pixel-btn-dark"
            onClick={handleHint}
          >
            💡 Gợi ý (Alt+H)
          </button>
          <button
            type="button"
            className="pixel-btn pixel-btn-dark"
            onClick={() => {
              retroAudio.playClick();
              setRevealed((r) => !r);
            }}
          >
            {revealed ? "🙈 Ẩn đáp án" : "👁 Xem đáp án"}
          </button>

          <div className="dict-nav-right">
            <button
              type="button"
              className="pixel-icon-btn"
              disabled={idx === 0}
              onClick={handlePrev}
            >
              ← Câu trước
            </button>
            <button
              type="button"
              className={`pixel-icon-btn ${isSolved ? "active" : ""}`}
              disabled={idx + 1 >= total}
              onClick={handleNext}
            >
              Câu tiếp →
            </button>
          </div>
        </div>

        {/* Character Diff Feedback */}
        {grade && (
          <div className={`dict-feedback ${isSolved ? "ok" : "warn"}`}>
            <div className="dict-feedback-head">
              {isSolved ? (
                <span>🎉 すごい！ Chính xác 100%! (Nhấn Enter để sang câu tiếp)</span>
              ) : (
                <span>
                  Độ chính xác: <b>{grade.accuracyPct}%</b> — Xem chỗ đỏ/vàng bên dưới rồi nghe lại nhé:
                </span>
              )}
            </div>
            <div className="dict-diff-line">
              {grade.diff.map((tok, i) => (
                <span key={i} className={`diff-ch diff-${tok.status}`}>
                  {tok.char}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Full Answer + Shadowing Card */}
        {revealed && (
          <div className="dict-answer-card">
            <div className="dict-answer-label">ĐÁP ÁN CHUẨN · NGHE &amp; ĐỌC THEO (SHADOWING)</div>
            <div className="dict-answer-ja">
              <RubyText segments={item.jaRuby} showFurigana={showFurigana} />
            </div>
            <div className="dict-answer-vi">{item.vi}</div>
          </div>
        )}
      </div>

      <div className="dict-shortcuts-footer">
        Phím tắt: <code>Ctrl + Space</code> nghe lại · <code>Enter</code> kiểm tra / sang câu tiếp ·{" "}
        <code>Alt + H</code> mở gợi ý · Tiến độ tự lưu trên trình duyệt.
      </div>
    </div>
  );
}
