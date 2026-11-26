import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { retroAudio } from "../audio/chiptune";
import type { ChoukaiExamData, ChoukaiQuestion } from "../types/choukai";
import { resolveAssetUrl } from "../utils/assetUrl";
import { RubyText } from "./RubyText";

interface JlptChoukaiViewProps {
  exam: ChoukaiExamData;
  showFurigana: boolean;
  onToggleFurigana: () => void;
  onOpenLibrary: () => void;
  onOpenDictation: () => void;
}

const SPEEDS = [0.75, 0.85, 1.0, 1.15];

function storageKey(examId: string): string {
  return `jp_pixel_choukai_ans_${examId}`;
}

export function getSavedChoukaiScore(examId: string): { answered: number } {
  try {
    const raw = localStorage.getItem(storageKey(examId));
    if (!raw) return { answered: 0 };
    const parsed = JSON.parse(raw) as Record<string, number>;
    return { answered: Object.keys(parsed).length };
  } catch {
    return { answered: 0 };
  }
}

function fmtSec(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

export function JlptChoukaiView({
  exam,
  showFurigana,
  onToggleFurigana,
  onOpenLibrary,
  onOpenDictation,
}: JlptChoukaiViewProps) {
  const [sectionFilter, setSectionFilter] = useState<"all" | "m1" | "m2" | "m3" | "m4">("all");
  const [studyMode, setStudyMode] = useState<"exam" | "study">("exam");
  const [idx, setIdx] = useState(0);
  const [speed, setSpeed] = useState(1.0);
  const [loop, setLoop] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [curTime, setCurTime] = useState(0);
  const [durTime, setDurTime] = useState(0);
  const [revealScript, setRevealScript] = useState(false);

  const [answers, setAnswers] = useState<Record<string, number>>(() => {
    try {
      const raw = localStorage.getItem(storageKey(exam.id));
      return raw ? (JSON.parse(raw) as Record<string, number>) : {};
    } catch {
      return {};
    }
  });

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const filteredQuestions: ChoukaiQuestion[] = useMemo(() => {
    if (sectionFilter === "all") return exam.questions;
    return exam.questions.filter((q) => q.sectionId === sectionFilter);
  }, [exam.questions, sectionFilter]);

  const q = filteredQuestions[Math.min(idx, Math.max(0, filteredQuestions.length - 1))];
  const sectionMeta = exam.sections.find((s) => s.id === q?.sectionId);

  const totalCorrect = useMemo(
    () =>
      exam.questions.reduce(
        (acc, item) => (answers[item.id] === item.correctIndex ? acc + 1 : acc),
        0
      ),
    [answers, exam.questions]
  );
  const totalAnswered = Object.keys(answers).length;

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsPlaying(false);
    setCurTime(0);
  }, []);

  // Load new audio element whenever question changes
  useEffect(() => {
    if (!q) return;
    stopAudio();
    setRevealScript(studyMode === "study");
    setDurTime(q.durationSec);

    const audio = new Audio(resolveAssetUrl(q.audioUrl));
    audio.playbackRate = speed;
    audioRef.current = audio;

    const onTime = () => setCurTime(audio.currentTime);
    const onMeta = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDurTime(audio.duration);
      }
    };
    const onEnded = () => {
      if (loop) {
        audio.currentTime = 0;
        void audio.play().catch(() => setIsPlaying(false));
      } else {
        setIsPlaying(false);
      }
    };

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.pause();
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("ended", onEnded);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q?.id, exam.id]);

  // Keep speed & loop synced cleanly on live audio element
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
  }, [speed]);

  useEffect(() => {
    if (studyMode === "study") setRevealScript(true);
  }, [studyMode]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey(exam.id), JSON.stringify(answers));
    } catch {
      // ignore
    }
  }, [answers, exam.id]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.playbackRate = speed;
      setIsPlaying(true);
      void audio.play().catch(() => setIsPlaying(false));
    }
  }, [isPlaying, speed]);

  const scrubBy = useCallback((delta: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const next = Math.max(0, Math.min(audio.duration || durTime || 1, audio.currentTime + delta));
    audio.currentTime = next;
    setCurTime(next);
  }, [durTime]);

  const handleSelectOption = (optIdx: number) => {
    if (!q) return;
    setAnswers((prev) => ({ ...prev, [q.id]: optIdx }));
    if (optIdx === q.correctIndex) {
      retroAudio.playFanfare();
    } else {
      retroAudio.playClick();
    }
  };

  if (!q) return null;

  const picked = answers[q.id];
  const hasAnswered = picked !== undefined;
  const isCorrect = picked === q.correctIndex;
  const showTextOptions = !q.hideOptionsUntilAnswered || hasAnswered || studyMode === "study" || revealScript;
  const progressPct = durTime > 0 ? Math.min(100, (curTime / durTime) * 100) : 0;

  return (
    <div className="dict-shell choukai-shell">
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
          <button
            type="button"
            className="pixel-icon-btn"
            onClick={() => {
              stopAudio();
              onOpenDictation();
            }}
            title="Luyện nghe chép chính tả giọng JLPT thật (問題3 & 問題4)"
          >
            🎧 Nghe chép
          </button>
          <button
            type="button"
            className={`pixel-icon-btn ${studyMode === "exam" ? "active" : ""}`}
            onClick={() => {
              setStudyMode("exam");
              setRevealScript(false);
            }}
          >
            📝 Thi thử
          </button>
          <button
            type="button"
            className={`pixel-icon-btn ${studyMode === "study" ? "active" : ""}`}
            onClick={() => {
              setStudyMode("study");
              setRevealScript(true);
            }}
          >
            🔍 Học sâu
          </button>
        </div>

        <div className="dict-title-group">
          <span className="topbar-series">
            JLPT REAL EXAM AUDIO · {exam.examDate}
          </span>
          <div className="topbar-title">
            <span>{exam.titleJa}</span>
            <span className="level-pill">{exam.level}</span>
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

      {/* Section Filter Tabs & Score */}
      <div className="dict-progress-area">
        <div className="choukai-section-tabs">
          <button
            type="button"
            className={`dict-chip ${sectionFilter === "all" ? "active" : ""}`}
            onClick={() => {
              setSectionFilter("all");
              setIdx(0);
            }}
          >
            Tất cả ({exam.questions.length})
          </button>
          {exam.sections.map((sec) => {
            const cnt = exam.questions.filter((item) => item.sectionId === sec.id).length;
            return (
              <button
                key={sec.id}
                type="button"
                className={`dict-chip ${sectionFilter === sec.id ? "active" : ""}`}
                onClick={() => {
                  setSectionFilter(sec.id);
                  setIdx(0);
                }}
              >
                {sec.titleJa.split(" ")[0]} {sec.titleJa.split(" ")[1]} ({cnt})
              </button>
            );
          })}
          <span className="choukai-score-pill">
            🎯 Điểm: <b>{totalCorrect}/{exam.questions.length}</b> ({totalAnswered} đã làm)
          </span>
        </div>

        <div className="dict-step-dots">
          {filteredQuestions.map((item, i) => {
            const ans = answers[item.id];
            const cls =
              ans === undefined
                ? ""
                : ans === item.correctIndex
                  ? "done"
                  : "wrong";
            return (
              <button
                key={item.id}
                type="button"
                className={`dict-dot ${i === idx ? "current" : ""} ${cls}`}
                onClick={() => setIdx(i)}
                title={`${item.sectionId.toUpperCase()} Câu ${item.number}`}
              >
                {sectionFilter === "all" ? i + 1 : item.number}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Question Card */}
      <div className="dict-card choukai-card">
        <div className="choukai-q-header">
          <div>
            <span className="choukai-sec-badge">
              {sectionMeta?.titleJa} · Câu {q.number}
            </span>
            <div className="choukai-sec-sub">{sectionMeta?.instructionVi}</div>
          </div>
          <div className="choukai-nav-mini">
            <button
              type="button"
              className="pixel-icon-btn"
              disabled={idx === 0}
              onClick={() => setIdx((v) => Math.max(0, v - 1))}
            >
              ← Trước
            </button>
            <button
              type="button"
              className="pixel-icon-btn"
              disabled={idx + 1 >= filteredQuestions.length}
              onClick={() => setIdx((v) => Math.min(filteredQuestions.length - 1, v + 1))}
            >
              Tiếp →
            </button>
          </div>
        </div>

        {/* Real JLPT Audio Player */}
        <div className="choukai-player">
          <div className="dict-audio-bar">
            <button
              type="button"
              className={`pixel-btn ${isPlaying ? "pixel-btn-mint" : "pixel-btn-purple"}`}
              onClick={togglePlay}
            >
              {isPlaying ? "⏸ Tạm dừng" : "▶ Nghe audio thi thật"}
            </button>
            <button type="button" className="dict-chip" onClick={() => scrubBy(-3)}>
              ⏪ -3s
            </button>
            <button type="button" className="dict-chip" onClick={() => scrubBy(3)}>
              ⏩ +3s
            </button>
            <div className="dict-speed-group">
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
          </div>

          <div className="choukai-timeline-row">
            <span className="choukai-time">{fmtSec(curTime)}</span>
            <div
              className="choukai-timeline"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                if (audioRef.current) {
                  const target = ratio * (audioRef.current.duration || durTime);
                  audioRef.current.currentTime = target;
                  setCurTime(target);
                }
              }}
            >
              <div className="choukai-timeline-fill" style={{ width: `${progressPct}%` }} />
            </div>
            <span className="choukai-time">{fmtSec(durTime)}</span>
          </div>
        </div>

        {/* Clean Exam Illustration Card (if picture question) */}
        {q.imageUrl && (
          <div className="choukai-pic-frame">
            <img
              src={resolveAssetUrl(q.imageUrl)}
              alt={`JLPT N4 ${q.id}`}
              className="choukai-pic-img"
            />
          </div>
        )}

        {/* Prompt (shown in Study Mode or after answering / reveal) */}
        {(hasAnswered || studyMode === "study" || revealScript) && (
          <div className="choukai-prompt-box">
            <div className="choukai-prompt-ja">
              <RubyText segments={q.promptJa} showFurigana={showFurigana} />
            </div>
            <div className="choukai-prompt-vi">{q.promptVi}</div>
          </div>
        )}

        {/* Answer Options */}
        <div className="choukai-options-grid">
          {q.options.map((opt, oIdx) => {
            const chosen = picked === oIdx;
            const revealCorrect = hasAnswered && oIdx === q.correctIndex;
            const statusClass = revealCorrect
              ? "ok"
              : chosen && !isCorrect
                ? "no"
                : "";
            return (
              <button
                key={opt.label}
                type="button"
                className={`choukai-opt-btn ${statusClass}`}
                onClick={() => handleSelectOption(oIdx)}
              >
                <span className="choukai-opt-num">{opt.label}</span>
                <div className="choukai-opt-content">
                  {showTextOptions && opt.ja ? (
                    <div className="choukai-opt-ja">
                      <RubyText segments={opt.ja} showFurigana={showFurigana} />
                    </div>
                  ) : !showTextOptions ? (
                    <div className="choukai-opt-hidden">
                      🎧 Nghe đáp án số {opt.label} trong băng
                    </div>
                  ) : (
                    <div className="choukai-opt-ja">Đáp án {opt.label}</div>
                  )}
                  {(hasAnswered || studyMode === "study") && opt.vi && (
                    <div className="choukai-opt-vi">{opt.vi}</div>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Instant Feedback & JLPT Trap Explanation */}
        {hasAnswered && (
          <div className={`dict-feedback ${isCorrect ? "ok" : "warn"}`}>
            <div className="dict-feedback-head">
              {isCorrect ? (
                <span>🎉 せいかい! Chính xác (Đáp án {q.correctIndex + 1})</span>
              ) : (
                <span>
                  ❌ Bạn chọn {picked + 1} — Đáp án đúng là <b>số {q.correctIndex + 1}</b>
                </span>
              )}
            </div>
            <div className="choukai-clue-text">
              <b>💡 Mẹo bắt bẫy JLPT:</b> {q.keyClueVi}
            </div>
          </div>
        )}

        {/* Toggle Script Button */}
        <div className="choukai-script-controls">
          <button
            type="button"
            className="pixel-btn pixel-btn-dark"
            onClick={() => {
              retroAudio.playClick();
              setRevealScript((v) => !v);
            }}
          >
            {revealScript ? "🙈 Ẩn Script hội thoại" : "📜 Xem Script gốc (có ふりがな) + Dịch"}
          </button>

          {totalAnswered > 0 && (
            <button
              type="button"
              className="pixel-icon-btn"
              onClick={() => {
                setAnswers({});
                retroAudio.playClick();
              }}
            >
              ↺ Làm lại từ đầu
            </button>
          )}
        </div>

        {/* Full Multi-Speaker Transcript */}
        {revealScript && (
          <div className="choukai-script-box">
            <div className="dict-answer-label">
              📜 SCRIPT GỐC PHÒNG THI · {exam.titleJa}
            </div>
            {q.script.map((line, li) => (
              <div key={li} className="choukai-script-line">
                <span className="choukai-speaker-pill">{line.speaker}</span>
                <div className="choukai-script-body">
                  <div className="choukai-script-ja">
                    <RubyText segments={line.ja} showFurigana={showFurigana} />
                  </div>
                  <div className="choukai-script-vi">{line.vi}</div>
                </div>
              </div>
            ))}
            {!hasAnswered && (
              <div className="choukai-clue-text" style={{ marginTop: 10 }}>
                <b>💡 Gợi ý phân tích:</b> {q.keyClueVi}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="dict-shortcuts-footer">
        {exam.audioSourceNote} · Tiến độ &amp; điểm số tự động lưu trên trình duyệt.
      </div>
    </div>
  );
}
