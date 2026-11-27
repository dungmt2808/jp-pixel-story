import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { retroAudio } from "../audio/chiptune";
import type {
  DokkaiExamData,
  DokkaiPassage,
  DokkaiSentence,
} from "../types/dokkai";
import { resolveAssetUrl } from "../utils/assetUrl";
import {
  PixelArrowLeftIcon,
  PixelArrowRightIcon,
  PixelBookIcon,
  PixelCheckIcon,
  PixelClockIcon,
  PixelCrossIcon,
  PixelExamIcon,
  PixelFilmIcon,
  PixelHeadphonesIcon,
  PixelHomeIcon,
  PixelLightbulbIcon,
  PixelMailIcon,
  PixelPlayIcon,
  PixelPuzzleIcon,
  PixelResetIcon,
  PixelScrollIcon,
  PixelSearchIcon,
  PixelSpeakerIcon,
  PixelStopIcon,
  PixelTargetIcon,
  PixelTranslateIcon,
} from "./PixelIcons";
import { RubyText } from "./RubyText";

interface JlptDokkaiViewProps {
  exam: DokkaiExamData;
  showFurigana: boolean;
  onToggleFurigana: () => void;
  onOpenLibrary: () => void;
  onOpenDictation: () => void;
  onOpenMondai5?: (storyId: string) => void;
}

function storageKey(examId: string): string {
  return `jp_pixel_dokkai_ans_${examId}`;
}

export function getSavedDokkaiScore(examId: string): { answered: number } {
  try {
    const raw = localStorage.getItem(storageKey(examId));
    if (!raw) return { answered: 0 };
    const parsed = JSON.parse(raw) as Record<string, number>;
    return { answered: Object.keys(parsed).length };
  } catch {
    return { answered: 0 };
  }
}

export function JlptDokkaiView({
  exam,
  showFurigana,
  onToggleFurigana,
  onOpenLibrary,
  onOpenDictation,
  onOpenMondai5,
}: JlptDokkaiViewProps) {
  const [passageIdx, setPassageIdx] = useState(0);
  const [showVi, setShowVi] = useState(false);
  const [activeSentenceId, setActiveSentenceId] = useState<string | null>(null);
  const [playingAll, setPlayingAll] = useState(false);
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [simOptionId, setSimOptionId] = useState<string | null>(null);
  const [showTimeline, setShowTimeline] = useState(false);

  const [answers, setAnswers] = useState<Record<string, number>>(() => {
    try {
      const raw = localStorage.getItem(storageKey(exam.id));
      return raw ? (JSON.parse(raw) as Record<string, number>) : {};
    } catch {
      return {};
    }
  });

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playAllCancelledRef = useRef(false);

  const passage: DokkaiPassage | undefined =
    exam.passages[Math.min(passageIdx, Math.max(0, exam.passages.length - 1))];

  const allQuestions = useMemo(
    () => exam.passages.flatMap((p) => p.questions),
    [exam.passages]
  );

  const totalCorrect = useMemo(
    () =>
      allQuestions.reduce(
        (acc, q) => (answers[q.id] === q.correctIndex ? acc + 1 : acc),
        0
      ),
    [allQuestions, answers]
  );
  const totalAnswered = Object.keys(answers).length;

  const stopAudio = useCallback(() => {
    playAllCancelledRef.current = true;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    setActiveSentenceId(null);
    setPlayingAll(false);
  }, []);

  // Reset per-passage interactive state when switching tabs or exams
  useEffect(() => {
    stopAudio();
    setActiveTags([]);
    setShowTimeline(false);
    setSimOptionId(passage?.conditionSimulator?.options[0]?.id ?? null);
    return () => {
      stopAudio();
    };
  }, [passage?.id, exam.id, stopAudio]);

  // Persist quiz answers
  useEffect(() => {
    try {
      localStorage.setItem(storageKey(exam.id), JSON.stringify(answers));
    } catch {
      // ignore quota error
    }
  }, [answers, exam.id]);

  const playSentence = useCallback(
    (sent: DokkaiSentence) => {
      if (!sent.audioUrl) return;
      stopAudio();
      const audio = new Audio(resolveAssetUrl(sent.audioUrl));
      audioRef.current = audio;
      setActiveSentenceId(sent.id);
      audio.addEventListener("ended", () => {
        if (audioRef.current === audio) {
          setActiveSentenceId(null);
        }
      });
      audio.addEventListener("error", () => {
        if (audioRef.current === audio) {
          setActiveSentenceId(null);
        }
      });
      void audio.play().catch(() => setActiveSentenceId(null));
    },
    [stopAudio]
  );

  const playWholePassage = useCallback(async () => {
    if (!passage) return;
    if (playingAll) {
      stopAudio();
      return;
    }
    const voiced = passage.sentences.filter((s) => Boolean(s.audioUrl));
    if (voiced.length === 0) return;

    stopAudio();
    playAllCancelledRef.current = false;
    setPlayingAll(true);

    for (const sent of voiced) {
      if (playAllCancelledRef.current) break;
      setActiveSentenceId(sent.id);
      await new Promise<void>((resolve) => {
        const audio = new Audio(resolveAssetUrl(sent.audioUrl!));
        audioRef.current = audio;
        const done = () => resolve();
        audio.addEventListener("ended", done, { once: true });
        audio.addEventListener("error", done, { once: true });
        audio.play().catch(done);
      });
      if (!playAllCancelledRef.current) {
        await new Promise((r) => window.setTimeout(r, 260));
      }
    }

    if (!playAllCancelledRef.current) {
      setActiveSentenceId(null);
      setPlayingAll(false);
    }
  }, [passage, playingAll, stopAudio]);

  const toggleTag = (tag: string) => {
    retroAudio.playClick();
    setActiveTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleSelectOption = (questionId: string, optIdx: number, correctIndex: number) => {
    setAnswers((prev) => ({ ...prev, [questionId]: optIdx }));
    if (optIdx === correctIndex) {
      retroAudio.playFanfare();
    } else {
      retroAudio.playClick();
    }
  };

  // Deduplicated filters across tables in this passage (so 1 filter bar drives all tables in 問題6!)
  const combinedFilters = useMemo(() => {
    if (!passage?.tables) return [];
    const seen = new Set<string>();
    const out = [];
    for (const tbl of passage.tables) {
      for (const f of tbl.filters) {
        if (!seen.has(f.tag)) {
          seen.add(f.tag);
          out.push(f);
        }
      }
    }
    return out;
  }, [passage?.tables]);

  const combinedPresets = useMemo(() => {
    if (!passage?.tables) return [];
    return passage.tables.flatMap((t) => t.presets ?? []);
  }, [passage?.tables]);

  const primaryTable = passage?.tables?.[0];
  const matchedRowCount = useMemo(() => {
    if (!primaryTable) return 0;
    if (activeTags.length === 0) return primaryTable.rows.length;
    return primaryTable.rows.filter((r) =>
      activeTags.every((t) => r.tags.includes(t))
    ).length;
  }, [primaryTable, activeTags]);

  if (!passage) return null;

  const hasVoicedSentences = passage.sentences.some((s) => Boolean(s.audioUrl));
  const simSelected = passage.conditionSimulator?.options.find(
    (o) => o.id === simOptionId
  );

  return (
    <div className="dict-shell dokkai-shell">
      {/* Unified Washi Top Bar */}
      <header className="dict-topbar">
        <div className="dict-topbar-inner">
          <div className="dict-top-actions">
            <button
              type="button"
              className="pixel-icon-btn"
              onClick={() => {
                stopAudio();
                onOpenLibrary();
              }}
            >
              <PixelHomeIcon size={14} />
              <span>Thư viện</span>
            </button>
            <button
              type="button"
              className="pixel-icon-btn"
              onClick={() => {
                stopAudio();
                onOpenDictation();
              }}
              title="Luyện nghe chép chính tả các câu đọc hiểu JLPT"
            >
              <PixelHeadphonesIcon size={14} />
              <span>Nghe chép</span>
            </button>
            {exam.mondai5StoryId && onOpenMondai5 && (
              <button
                type="button"
                className="pixel-icon-btn dokkai-m5-btn"
                onClick={() => {
                  stopAudio();
                  onOpenMondai5(exam.mondai5StoryId!);
                }}
                title={exam.mondai5TitleVi ?? "Xem hoạt ảnh tương tác 問題5"}
              >
                <PixelFilmIcon size={14} />
                <span>Hoạt ảnh 問題5</span>
              </button>
            )}
          </div>

          <div className="dict-title-group">
            <span className="topbar-series">
              JLPT REAL READING · {exam.examDate}
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
            <span>ふりがな {showFurigana ? "ON" : "OFF"}</span>
          </button>
        </div>
      </header>

      <div className="dict-main-wrap">
        {/* Passage Tabs & Score */}
        <div className="dict-progress-area">
          <div className="study-filter-bar">
            <div className="study-seg-group">
              {exam.passages.map((p, i) => {
                const pCorrect = p.questions.filter(
                  (q) => answers[q.id] === q.correctIndex
                ).length;
                const pAllDone =
                  p.questions.length > 0 && pCorrect === p.questions.length;
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={`dict-chip dokkai-tab ${i === passageIdx ? "active" : ""} ${
                      pAllDone ? "solved" : ""
                    }`}
                    onClick={() => {
                      retroAudio.playClick();
                      setPassageIdx(i);
                    }}
                  >
                    {pAllDone && <PixelCheckIcon size={12} />}
                    <span>{p.tabLabel}</span>
                  </button>
                );
              })}
            </div>
            <span className="choukai-score-pill">
              <PixelTargetIcon size={13} />
              <span>
                <b>{totalCorrect}/{allQuestions.length}</b> đúng ({totalAnswered} đã làm)
              </span>
            </span>
          </div>
        </div>

        {/* Active Passage Card */}
        <div className="dict-card dokkai-card">
          <div className="choukai-q-header">
            <div>
              <span className="choukai-sec-badge">{passage.sectionBadge}</span>
              <div className="dokkai-passage-title">
                <RubyText segments={passage.titleJa} showFurigana={showFurigana} />
                <span className="dokkai-passage-title-vi"> — {passage.titleVi}</span>
              </div>
            </div>
            <div className="choukai-nav-mini">
              <button
                type="button"
                className="pixel-icon-btn"
                disabled={passageIdx === 0}
                onClick={() => setPassageIdx((v) => Math.max(0, v - 1))}
              >
                <PixelArrowLeftIcon size={13} />
                <span>Bài trước</span>
              </button>
              <button
                type="button"
                className="pixel-icon-btn"
                disabled={passageIdx + 1 >= exam.passages.length}
                onClick={() =>
                  setPassageIdx((v) => Math.min(exam.passages.length - 1, v + 1))
                }
              >
                <span>Bài tiếp</span>
                <PixelArrowRightIcon size={13} />
              </button>
            </div>
          </div>

          {/* Audio & Translation Toolbar */}
          <div className="dokkai-toolbar">
            {hasVoicedSentences && (
              <button
                type="button"
                className={`pixel-btn ${playingAll ? "pixel-btn-mint" : "pixel-btn-purple"}`}
                onClick={() => void playWholePassage()}
              >
                {playingAll ? <PixelStopIcon size={14} /> : <PixelSpeakerIcon size={14} />}
                <span>{playingAll ? "Dừng đọc bài" : "Nghe đọc cả bài (VOICEVOX)"}</span>
              </button>
            )}
            <button
              type="button"
              className={`dict-chip ${showVi ? "active" : ""}`}
              onClick={() => {
                retroAudio.playClick();
                setShowVi((v) => !v);
              }}
            >
              <PixelTranslateIcon size={13} />
              <span>Dịch tiếng Việt {showVi ? "ON" : "OFF"}</span>
            </button>
            <span className="dokkai-tip-inline px-inline-label">
              <PixelLightbulbIcon size={13} />
              <span>Bấm từng câu tiếng Nhật bên dưới để nghe phát âm</span>
            </span>
          </div>

          {/* Context Intro Line (if exam specifies email/notice/memo situation) */}
          {passage.contextIntroJa && (
            <div className="dokkai-context-banner">
              <div className="dokkai-context-ja">
                <RubyText
                  segments={passage.contextIntroJa}
                  showFurigana={showFurigana}
                />
              </div>
              {showVi && passage.contextIntroVi && (
                <div className="dokkai-context-vi">{passage.contextIntroVi}</div>
              )}
            </div>
          )}

          {/* Authentic Japanese Document Paper */}
          <div className={`dokkai-doc dokkai-doc-${passage.docStyle}`}>
            {/* Document Chrome Bar */}
            {passage.docStyle === "email" && (
              <div className="dokkai-chrome-bar dokkai-chrome-email">
                <span className="px-inline-label">
                  <PixelMailIcon size={14} /> INBOX · UNIVERSITY MAIL
                </span>
                <span>● ● ●</span>
              </div>
            )}
            {passage.docStyle === "memo" && (
              <div className="dokkai-chrome-bar dokkai-chrome-memo">
                <span className="px-inline-label">
                  <PixelExamIcon size={14} /> OFFICE DESK MEMO · 伝言メモ
                </span>
                <span>伝言</span>
              </div>
            )}
            {passage.docStyle === "notice" && (
              <div className="dokkai-chrome-bar dokkai-chrome-notice">
                <span className="px-inline-label">
                  <PixelSpeakerIcon size={14} /> お知らせ · THÔNG BÁO CỬA HÀNG
                </span>
                <span>★</span>
              </div>
            )}
            {passage.docStyle === "info_table" && (
              <div className="dokkai-chrome-bar dokkai-chrome-info">
                <span className="px-inline-label">
                  <PixelScrollIcon size={14} /> 案内ポスター · BẢNG TRA CỨU THÔNG TIN
                </span>
                <PixelSearchIcon size={14} />
              </div>
            )}

            <div className="dokkai-doc-inner">
              {/* Optional Header Meta */}
              {passage.headerMeta && passage.headerMeta.length > 0 && (
                <div className="dokkai-meta-block">
                  {passage.headerMeta.map((m, mi) => (
                    <div key={mi} className="dokkai-meta-row">
                      <span className="dokkai-meta-label">{m.label}</span>
                      <span className="dokkai-meta-val">
                        <RubyText
                          segments={m.valueJa}
                          showFurigana={showFurigana}
                        />
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Interactive Condition Filter Bar for 問題6 Info Tables */}
              {passage.tables && passage.tables.length > 0 && (
                <div className="dokkai-filter-panel">
                  <div className="dokkai-filter-head">
                    <span className="px-inline-label">
                      <PixelSearchIcon size={14} />
                      <span>
                        <b>Bộ lọc tra cứu nhanh</b> — Bấm các điều kiện của đề bài để bảng tự lọc lớp phù hợp:
                      </span>
                    </span>
                    <span className="dokkai-match-count">
                      Khớp <b>{matchedRowCount}/{primaryTable?.rows.length ?? 0}</b> lớp
                    </span>
                  </div>

                  {combinedPresets.length > 0 && (
                    <div className="dokkai-preset-row">
                      {combinedPresets.map((preset) => {
                        const isSame =
                          preset.tags.length === activeTags.length &&
                          preset.tags.every((t) => activeTags.includes(t));
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            className={`dokkai-preset-btn ${isSame ? "active" : ""}`}
                            onClick={() => {
                              retroAudio.playClick();
                              setActiveTags(isSame ? [] : [...preset.tags]);
                            }}
                          >
                            {preset.label}
                          </button>
                        );
                      })}
                      {activeTags.length > 0 && (
                        <button
                          type="button"
                          className="dokkai-reset-btn"
                          onClick={() => {
                            retroAudio.playClick();
                            setActiveTags([]);
                          }}
                        >
                          <PixelResetIcon size={12} />
                          <span>Xóa lọc</span>
                        </button>
                      )}
                    </div>
                  )}

                  <div className="dokkai-filter-chips">
                    {combinedFilters.map((f) => {
                      const active = activeTags.includes(f.tag);
                      return (
                        <button
                          key={f.id}
                          type="button"
                          className={`dokkai-filter-chip ${active ? "active" : ""}`}
                          onClick={() => toggleTag(f.tag)}
                        >
                          <span className="dokkai-chip-ja">
                            <RubyText
                              segments={f.labelJa}
                              showFurigana={showFurigana}
                            />
                          </span>
                          <span className="dokkai-chip-vi">({f.labelVi})</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Render Tables (問題6) */}
              {passage.tables &&
                passage.tables.map((tbl, ti) => (
                  <div key={ti} className="dokkai-table-wrap">
                    {tbl.captionJa && (
                      <div className="dokkai-table-caption">
                        <RubyText
                          segments={tbl.captionJa}
                          showFurigana={showFurigana}
                        />
                      </div>
                    )}
                    <div className="dokkai-table-scroll">
                      <table className="dokkai-table">
                        <thead>
                          <tr>
                            {tbl.columns.map((col, ci) => (
                              <th key={ci}>
                                <RubyText
                                  segments={col}
                                  showFurigana={showFurigana}
                                />
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {tbl.rows.map((row) => {
                            const hasFilter = activeTags.length > 0;
                            const matched =
                              hasFilter &&
                              activeTags.every((t) => row.tags.includes(t));
                            const rowCls = !hasFilter
                              ? ""
                              : matched
                                ? "dokkai-row-match"
                                : "dokkai-row-dim";
                            return (
                              <tr key={row.id} className={rowCls}>
                                {row.cells.map((cell, ci) => (
                                  <td key={ci}>
                                    {ci === 0 && matched && (
                                      <span className="dokkai-match-star">★ </span>
                                    )}
                                    <RubyText
                                      segments={cell}
                                      showFurigana={showFurigana}
                                    />
                                  </td>
                                ))}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {tbl.footnoteJa && (
                      <div className="dokkai-table-footnote">
                        <RubyText
                          segments={tbl.footnoteJa}
                          showFurigana={showFurigana}
                        />
                        {showVi && tbl.footnoteVi && (
                          <div className="dokkai-sent-vi">{tbl.footnoteVi}</div>
                        )}
                      </div>
                    )}
                  </div>
                ))}

              {/* Clickable Japanese Sentences (VOICEVOX audio per sentence) */}
              <div className="dokkai-sentences">
                {passage.sentences.map((sent) => {
                  const isPlayingSent = activeSentenceId === sent.id;
                  return (
                    <div
                      key={sent.id}
                      className={`dokkai-sent-row ${
                        isPlayingSent ? "playing" : ""
                      } ${sent.highlight ? "keyline" : ""}`}
                      onClick={() => playSentence(sent)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          playSentence(sent);
                        }
                      }}
                    >
                      <span
                        className={`dokkai-play-pill ${isPlayingSent ? "on" : ""}`}
                        aria-hidden="true"
                      >
                        {isPlayingSent ? (
                          <PixelSpeakerIcon size={12} />
                        ) : (
                          <PixelPlayIcon size={11} />
                        )}
                      </span>
                      <div className="dokkai-sent-content">
                        {sent.sectionTagJa && (
                          <div className="dokkai-sent-tag">
                            <RubyText
                              segments={sent.sectionTagJa}
                              showFurigana={showFurigana}
                            />
                          </div>
                        )}
                        <div className="dokkai-sent-ja">
                          <RubyText
                            segments={sent.jaRuby}
                            showFurigana={showFurigana}
                          />
                        </div>
                        {showVi && (
                          <div className="dokkai-sent-vi">{sent.vi}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Interactive Condition Simulator (e.g., 07/2025 Q24 Rain vs Sunny Notice!) */}
              {passage.conditionSimulator && (
                <div className="dokkai-sim-box">
                  <div className="dokkai-sim-prompt px-inline-label">
                    <PixelSearchIcon size={14} />
                    <span>
                      <b>Mô phỏng điều kiện trong thông báo:</b>{" "}
                      {passage.conditionSimulator.promptVi}
                    </span>
                  </div>
                  <div className="dokkai-sim-btns">
                    {passage.conditionSimulator.options.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        className={`dokkai-sim-btn ${
                          simOptionId === opt.id ? "active" : ""
                        } accent-${opt.accent ?? "ok"}`}
                        onClick={() => {
                          retroAudio.playClick();
                          setSimOptionId(opt.id);
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  {simSelected && (
                    <div
                      className={`dokkai-sim-result accent-${
                        simSelected.accent ?? "ok"
                      }`}
                    >
                      <span className="dokkai-sim-badge">{simSelected.badge}</span>
                      <div>
                        <div className="dokkai-sim-ja">
                          <RubyText
                            segments={simSelected.summaryJa}
                            showFurigana={showFurigana}
                          />
                        </div>
                        <div className="dokkai-sim-vi">{simSelected.summaryVi}</div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Optional Interactive Timeline Helper (e.g., 12/2025 Q23 Memo Deadlines) */}
              {passage.timeline && passage.timeline.length > 0 && (
                <div className="dokkai-timeline-wrap">
                  <button
                    type="button"
                    className="dokkai-timeline-toggle"
                    onClick={() => {
                      retroAudio.playClick();
                      setShowTimeline((v) => !v);
                    }}
                  >
                    <PixelClockIcon size={14} />
                    <span>
                      {showTimeline
                        ? "Ẩn trục thời gian mốc giờ"
                        : "Mở trục thời gian mốc giờ (Gợi ý bắt bẫy giờ giấc)"}
                    </span>
                  </button>
                  {showTimeline && (
                    <div className="dokkai-timeline-strip">
                      {passage.timeline.map((step, si) => (
                        <div
                          key={si}
                          className={`dokkai-tl-node ${
                            step.emphasis ? "emphasis" : ""
                          }`}
                        >
                          <div className="dokkai-tl-time">{step.time}</div>
                          <div className="dokkai-tl-ja">
                            <RubyText
                              segments={step.labelJa}
                              showFurigana={showFurigana}
                            />
                          </div>
                          <div className="dokkai-tl-vi">{step.labelVi}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Document Footer Metadata */}
              {passage.footerMeta && passage.footerMeta.length > 0 && (
                <div className="dokkai-doc-footer">
                  {passage.footerMeta.map((line, li) => (
                    <div key={li}>
                      <RubyText segments={line} showFurigana={showFurigana} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Official JLPT Questions for this Passage */}
          <div className="dokkai-quiz-section">
            <div className="dokkai-section-heading px-inline-label">
              <PixelExamIcon size={14} />
              <span>
                CÂU HỎI THI THẬT JLPT ({passage.questions.map((q) => `Câu ${q.number}`).join(" & ")})
              </span>
            </div>

            {passage.questions.map((q) => {
              const picked = answers[q.id];
              const hasAnswered = picked !== undefined;
              const isCorrect = picked === q.correctIndex;
              return (
                <div key={q.id} className="dokkai-q-block">
                  <div className="choukai-prompt-box">
                    <div className="choukai-prompt-ja">
                      <span className="dokkai-q-num-badge">問{q.number}</span>{" "}
                      <RubyText
                        segments={q.questionJa}
                        showFurigana={showFurigana}
                      />
                    </div>
                    {(showVi || hasAnswered) && (
                      <div className="choukai-prompt-vi">{q.questionVi}</div>
                    )}
                  </div>

                  <div className="choukai-options-grid dokkai-options-grid">
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
                          onClick={() =>
                            handleSelectOption(q.id, oIdx, q.correctIndex)
                          }
                        >
                          <span className="choukai-opt-num">{opt.label}</span>
                          <div className="choukai-opt-content">
                            <div className="choukai-opt-ja">
                              <RubyText
                                segments={opt.ja}
                                showFurigana={showFurigana}
                              />
                            </div>
                            {(hasAnswered || showVi) && (
                              <div className="choukai-opt-vi">{opt.vi}</div>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {hasAnswered && (
                    <div className={`dict-feedback ${isCorrect ? "ok" : "warn"}`}>
                      <div className="dict-feedback-head">
                        {isCorrect ? (
                          <span className="px-inline-label">
                            <PixelCheckIcon size={15} />
                            <span>せいかい! Chính xác (Đáp án {q.correctIndex + 1})</span>
                          </span>
                        ) : (
                          <span className="px-inline-label">
                            <PixelCrossIcon size={14} />
                            <span>
                              Bạn chọn {picked + 1} — Đáp án đúng là <b>số {q.correctIndex + 1}</b>
                            </span>
                          </span>
                        )}
                      </div>
                      <div className="choukai-clue-text">
                        <span className="px-inline-label study-clue-lead">
                          <PixelLightbulbIcon size={14} />
                          <b>Phân tích &amp; mẹo bắt bẫy JLPT:</b>
                        </span>{" "}
                        {q.explanationVi}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Vocab & Grammar Highlights for this Passage */}
          {(passage.vocab.length > 0 || passage.grammar.length > 0) && (
            <div className="dokkai-study-grid">
              {passage.vocab.length > 0 && (
                <div className="dokkai-study-box">
                  <div className="dokkai-study-head px-inline-label">
                    <PixelBookIcon size={14} />
                    <span>Từ vựng trọng tâm ({passage.vocab.length})</span>
                  </div>
                  <div className="dokkai-vocab-list">
                    {passage.vocab.map((v, vi) => (
                      <div key={vi} className="dokkai-vocab-item">
                        <span className="dokkai-vocab-word">
                          {v.word}
                          {showFurigana && v.reading && v.reading !== v.word && (
                            <span className="dokkai-vocab-read">
                              （{v.reading}）
                            </span>
                          )}
                        </span>
                        <span className="dokkai-vocab-vi">{v.meaningVi}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {passage.grammar.length > 0 && (
                <div className="dokkai-study-box">
                  <div className="dokkai-study-head px-inline-label">
                    <PixelPuzzleIcon size={14} />
                    <span>Ngữ pháp N4 trong bài ({passage.grammar.length})</span>
                  </div>
                  <div className="dokkai-grammar-list">
                    {passage.grammar.map((g) => (
                      <div key={g.id} className="dokkai-grammar-item">
                        <div className="dokkai-grammar-pat">
                          {g.pattern}{" "}
                          <span className="dokkai-grammar-title">
                            · {g.titleVi}
                          </span>
                        </div>
                        <div className="dokkai-grammar-exp">{g.explanationVi}</div>
                        {g.exampleRuby && (
                          <div className="dokkai-grammar-ex">
                            <RubyText
                              segments={g.exampleRuby}
                              showFurigana={showFurigana}
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Reset Score Bar */}
          {totalAnswered > 0 && (
            <div className="choukai-script-controls">
              <span className="study-muted-note">
                Điểm phần đọc hiểu tự động lưu trên trình duyệt của bạn.
              </span>
              <button
                type="button"
                className="pixel-icon-btn"
                onClick={() => {
                  setAnswers({});
                  retroAudio.playClick();
                }}
              >
                <PixelResetIcon size={13} />
                <span>Làm lại toàn bộ câu hỏi</span>
              </button>
            </div>
          )}
        </div>

        <div className="dict-shortcuts-footer">
          Đề đọc hiểu thật {exam.level} ({exam.examDate}) · Có đủ giọng đọc VOICEVOX từng câu + Daily Dictation.
        </div>
      </div>
    </div>
  );
}
