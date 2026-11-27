import { useEffect, useMemo, useState } from "react";
import { retroAudio } from "../audio/chiptune";
import type {
  GengoClozePassage,
  GengoExamData,
  GengoPart,
  GengoQuestion,
} from "../types/gengo";
import {
  PixelArrowLeftIcon,
  PixelArrowRightIcon,
  PixelBookIcon,
  PixelCheckIcon,
  PixelCrossIcon,
  PixelExamIcon,
  PixelGridIcon,
  PixelHeadphonesIcon,
  PixelHomeIcon,
  PixelKanjiIcon,
  PixelLightbulbIcon,
  PixelPuzzleIcon,
  PixelResetIcon,
  PixelSparkleIcon,
  PixelTargetIcon,
  PixelTranslateIcon,
} from "./PixelIcons";
import { RubyText } from "./RubyText";

interface JlptGengoViewProps {
  exam: GengoExamData;
  showFurigana: boolean;
  showVi: boolean;
  onToggleFurigana: () => void;
  onToggleVi: () => void;
  onOpenLibrary: () => void;
  onOpenDokkai?: (dokkaiId: string) => void;
  onOpenChoukai?: (choukaiId: string) => void;
}

function storageKey(examId: string): string {
  return `jp_pixel_gengo_ans_${examId}`;
}

export function getSavedGengoScore(examId: string): { answered: number } {
  try {
    const raw = localStorage.getItem(storageKey(examId));
    if (!raw) return { answered: 0 };
    const parsed = JSON.parse(raw) as Record<string, number>;
    return { answered: Object.keys(parsed).length };
  } catch {
    return { answered: 0 };
  }
}

/** Render prompt text with `[[underlined]]` spans and optional furigana masking on target words */
function RichPrompt({
  text,
  showFurigana,
  maskTargetRuby,
  filledBlank,
}: {
  text: string;
  showFurigana: boolean;
  maskTargetRuby?: boolean;
  filledBlank?: string | null;
}) {
  // Split by `[[...]]` or `（　）`
  const parts = text.split(/(\[\[[^\]]+\]\]|（　）)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("[[") && part.endsWith("]]")) {
          const inner = part.slice(2, -2);
          return (
            <span key={i} className="gengo-underline">
              <RubyText
                segments={inner}
                showFurigana={maskTargetRuby ? false : showFurigana}
              />
            </span>
          );
        }
        if (part === "（　）") {
          return (
            <span key={i} className={`gengo-blank ${filledBlank ? "filled" : ""}`}>
              {filledBlank ? (
                <RubyText segments={filledBlank} showFurigana={showFurigana} />
              ) : (
                "　　　"
              )}
            </span>
          );
        }
        return (
          <RubyText
            key={i}
            segments={part}
            showFurigana={showFurigana}
          />
        );
      })}
    </>
  );
}

/** Render a 問題3 cloze composition with interactive clickable numbered blanks */
function ClozePassageCard({
  passage,
  activeQNumber,
  answers,
  questions,
  showFurigana,
  showVi,
  onJumpToNumber,
}: {
  passage: GengoClozePassage;
  activeQNumber: number;
  answers: Record<string, number>;
  questions: GengoQuestion[];
  showFurigana: boolean;
  showVi: boolean;
  onJumpToNumber: (num: number) => void;
}) {
  const byNumber = useMemo(() => {
    const m = new Map<number, GengoQuestion>();
    for (const q of questions) {
      if (q.passageId === passage.id) m.set(q.number, q);
    }
    return m;
  }, [passage.id, questions]);

  return (
    <div className="dokkai-doc gengo-passage-doc">
      <div className="dokkai-chrome-bar dokkai-chrome-email">
        <span className="px-inline-label">
          <PixelExamIcon size={14} /> 問題3 · ĐỌC ĐOẠN VĂN ĐIỀN NGỮ PHÁP
        </span>
        <span>作文</span>
      </div>
      <div className="dokkai-doc-inner">
        <div className="gengo-passage-intro">
          <RubyText segments={passage.contextIntroJa} showFurigana={showFurigana} />
          {showVi && (
            <div className="dokkai-sent-vi">{passage.contextIntroVi}</div>
          )}
        </div>

        <div className="gengo-passage-head">
          <div className="gengo-passage-title">
            <RubyText segments={passage.titleJa} showFurigana={showFurigana} />
          </div>
          <div className="gengo-passage-author">{passage.authorJa}</div>
        </div>

        <div className="gengo-passage-body">
          {passage.paragraphs.map((para, pi) => {
            const chunks = para.split(/(\[\[\d+\]\])/g);
            return (
              <div key={pi} className="gengo-passage-para">
                <p className="gengo-passage-ja">
                  {chunks.map((ch, ci) => {
                    const m = ch.match(/^\[\[(\d+)\]\]$/);
                    if (m) {
                      const num = Number(m[1]);
                      const qItem = byNumber.get(num);
                      const pickedIdx = qItem ? answers[qItem.id] : undefined;
                      const pickedOpt =
                        qItem && pickedIdx !== undefined
                          ? qItem.options[pickedIdx]
                          : undefined;
                      const isCurrent = num === activeQNumber;
                      const isOk =
                        qItem !== undefined && pickedIdx === qItem.correctIndex;
                      const isWrong =
                        pickedIdx !== undefined && !isOk;
                      return (
                        <button
                          key={ci}
                          type="button"
                          className={`gengo-inline-blank ${
                            isCurrent ? "current" : ""
                          } ${isOk ? "ok" : isWrong ? "no" : ""}`}
                          onClick={() => onJumpToNumber(num)}
                        >
                          <span className="gengo-inline-num">{num}</span>
                          {pickedOpt ? (
                            <RubyText
                              segments={pickedOpt.ja}
                              showFurigana={showFurigana}
                            />
                          ) : (
                            <span>　？　</span>
                          )}
                        </button>
                      );
                    }
                    return (
                      <RubyText
                        key={ci}
                        segments={ch}
                        showFurigana={showFurigana}
                      />
                    );
                  })}
                </p>
                {showVi && passage.paragraphsVi[pi] && (
                  <p className="dokkai-sent-vi">{passage.paragraphsVi[pi]}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function JlptGengoView({
  exam,
  showFurigana,
  showVi,
  onToggleFurigana,
  onToggleVi,
  onOpenLibrary,
  onOpenDokkai,
  onOpenChoukai,
}: JlptGengoViewProps) {
  const [partFilter, setPartFilter] = useState<"all" | GengoPart>("all");
  const [sectionFilter, setSectionFilter] = useState<string>("all");
  const [idx, setIdx] = useState(0);
  const [showQuestionMap, setShowQuestionMap] = useState(false);
  // Optional interactive scramble helper slots for 問題2 ★ questions
  const [scrambleSlots, setScrambleSlots] = useState<number[]>([]);

  const [answers, setAnswers] = useState<Record<string, number>>(() => {
    try {
      const raw = localStorage.getItem(storageKey(exam.id));
      return raw ? (JSON.parse(raw) as Record<string, number>) : {};
    } catch {
      return {};
    }
  });

  const visibleSections = useMemo(() => {
    if (partFilter === "all") return exam.sections;
    return exam.sections.filter((s) => s.part === partFilter);
  }, [exam.sections, partFilter]);

  const filteredQuestions = useMemo(() => {
    return exam.questions.filter((q) => {
      if (partFilter !== "all" && q.part !== partFilter) return false;
      if (sectionFilter !== "all" && q.sectionId !== sectionFilter) return false;
      return true;
    });
  }, [exam.questions, partFilter, sectionFilter]);

  const safeIdx = Math.min(idx, Math.max(0, filteredQuestions.length - 1));
  const q = filteredQuestions[safeIdx];
  const sectionMeta = exam.sections.find((s) => s.id === q?.sectionId);
  const activePassage = q?.passageId
    ? exam.passages?.find((p) => p.id === q.passageId)
    : undefined;

  const vocabCount = useMemo(
    () => exam.questions.filter((x) => x.part === "vocab").length,
    [exam.questions]
  );
  const grammarCount = useMemo(
    () => exam.questions.filter((x) => x.part === "grammar").length,
    [exam.questions]
  );

  const totalCorrect = useMemo(
    () =>
      exam.questions.reduce(
        (acc, item) => (answers[item.id] === item.correctIndex ? acc + 1 : acc),
        0
      ),
    [answers, exam.questions]
  );
  const totalAnswered = Object.keys(answers).length;

  useEffect(() => {
    setScrambleSlots([]);
  }, [q?.id]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey(exam.id), JSON.stringify(answers));
    } catch {
      // ignore storage error
    }
  }, [answers, exam.id]);

  if (!q) return null;

  const picked = answers[q.id];
  const hasAnswered = picked !== undefined;
  const isCorrect = picked === q.correctIndex;
  const starIdx = q.starSlotIndex ?? 2;

  const handleSelectOption = (optIdx: number) => {
    setAnswers((prev) => ({ ...prev, [q.id]: optIdx }));
    if (optIdx === q.correctIndex) {
      retroAudio.playFanfare();
    } else {
      retroAudio.playClick();
    }
  };

  const handleToggleScramblePiece = (optIdx: number) => {
    retroAudio.playClick();
    setScrambleSlots((prev) => {
      if (prev.includes(optIdx)) {
        return prev.filter((x) => x !== optIdx);
      }
      if (prev.length >= 4) return prev;
      return [...prev, optIdx];
    });
  };

  const handleJumpToBlankNumber = (num: number) => {
    const found = filteredQuestions.findIndex(
      (item) => item.passageId === q.passageId && item.number === num
    );
    if (found >= 0) {
      retroAudio.playClick();
      setIdx(found);
    }
  };

  // Mask target word ruby on Kanji reading before user answers so answer is never spoiled
  const shouldMaskTarget = Boolean(q.maskTargetRuby && !hasAnswered);
  // Mask option ruby on Kanji writing before user answers so Kanji options stay authentic
  const showOptionRuby = q.kind === "kanji_write" ? (hasAnswered && showFurigana) : showFurigana;

  const progressPct = Math.round(
    (filteredQuestions.filter((item) => answers[item.id] !== undefined).length /
      Math.max(filteredQuestions.length, 1)) *
      100
  );

  return (
    <div className="dict-shell gengo-shell">
      {/* Unified Washi Top Bar */}
      <header className="dict-topbar">
        <div className="dict-topbar-inner">
          <div className="dict-top-actions">
            <button
              type="button"
              className="pixel-icon-btn"
              onClick={onOpenLibrary}
            >
              <PixelHomeIcon size={14} />
              <span>Thư viện</span>
            </button>
            {exam.dokkaiId && onOpenDokkai && (
              <button
                type="button"
                className="pixel-icon-btn"
                onClick={() => onOpenDokkai(exam.dokkaiId!)}
              >
                <PixelBookIcon size={14} />
                <span>Đọc hiểu</span>
              </button>
            )}
            {exam.choukaiId && onOpenChoukai && (
              <button
                type="button"
                className="pixel-icon-btn"
                onClick={() => onOpenChoukai(exam.choukaiId!)}
              >
                <PixelHeadphonesIcon size={14} />
                <span>Nghe hiểu</span>
              </button>
            )}
          </div>

          <div className="dict-title-group">
            <span className="topbar-series">
              JLPT KIẾN THỨC NGÔN NGỮ · {exam.examDate}
            </span>
            <div className="topbar-title">
              <span>{exam.titleJa}</span>
              <span className="level-pill">{exam.level}</span>
            </div>
          </div>

          <div className="dict-top-actions">
            <button
              type="button"
              className={`pixel-icon-btn ${showFurigana ? "active" : ""}`}
              onClick={onToggleFurigana}
              title="Bật / Tắt Furigana (tự động ẩn trên chữ Kanji đang bị hỏi ở 問題1)"
            >
              <span>ふりがな {showFurigana ? "ON" : "OFF"}</span>
            </button>
            <button
              type="button"
              className={`pixel-icon-btn ${showVi ? "active" : ""}`}
              onClick={onToggleVi}
              title="Hiện / Ẩn dịch tiếng Việt"
            >
              <PixelTranslateIcon size={14} />
              <span>Dịch {showVi ? "ON" : "OFF"}</span>
            </button>
          </div>
        </div>
      </header>

      <div className="dict-main-wrap">
        {/* Clean Single-Row Filter Bar + Collapsible Question Map */}
        <div className="dict-progress-area">
          <div className="study-filter-bar">
            <div className="study-seg-group" role="tablist" aria-label="Phần thi">
              <button
                type="button"
                role="tab"
                aria-selected={partFilter === "all"}
                className={`dict-chip ${partFilter === "all" ? "active" : ""}`}
                onClick={() => {
                  setPartFilter("all");
                  setSectionFilter("all");
                  setIdx(0);
                }}
              >
                <PixelSparkleIcon size={13} />
                <span>Tất cả ({exam.questions.length})</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={partFilter === "vocab"}
                className={`dict-chip ${partFilter === "vocab" ? "active" : ""}`}
                onClick={() => {
                  setPartFilter("vocab");
                  setSectionFilter("all");
                  setIdx(0);
                }}
              >
                <PixelKanjiIcon size={13} />
                <span>文字・語彙 ({vocabCount})</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={partFilter === "grammar"}
                className={`dict-chip ${partFilter === "grammar" ? "active" : ""}`}
                onClick={() => {
                  setPartFilter("grammar");
                  setSectionFilter("all");
                  setIdx(0);
                }}
              >
                <PixelPuzzleIcon size={13} />
                <span>文法 ({grammarCount})</span>
              </button>
            </div>

            <div className="study-filter-right">
              <label className="study-select-wrap" aria-label="Lọc theo dạng bài">
                <select
                  className="study-select"
                  value={sectionFilter}
                  onChange={(e) => {
                    setSectionFilter(e.target.value);
                    setIdx(0);
                  }}
                >
                  <option value="all">Tất cả dạng bài ({filteredQuestions.length})</option>
                  {visibleSections.map((sec) => {
                    const cnt = exam.questions.filter((x) => x.sectionId === sec.id).length;
                    return (
                      <option key={sec.id} value={sec.id}>
                        {sec.shortLabel} ({cnt})
                      </option>
                    );
                  })}
                </select>
              </label>

              <span className="choukai-score-pill">
                <PixelTargetIcon size={13} />
                <span>
                  <b>{totalCorrect}/{exam.questions.length}</b> đúng
                </span>
              </span>

              <button
                type="button"
                className={`dict-chip study-map-toggle ${showQuestionMap ? "active" : ""}`}
                onClick={() => {
                  retroAudio.playClick();
                  setShowQuestionMap((v) => !v);
                }}
                aria-expanded={showQuestionMap}
              >
                <PixelGridIcon size={13} />
                <span>Bảng câu ({filteredQuestions.length})</span>
              </button>
            </div>
          </div>

          {/* Slim Washi Progress Bar */}
          <div className="study-progress-slim">
            <div className="dict-progress-track">
              <div
                className="dict-progress-fill"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="study-progress-caption">
              Câu <b>{safeIdx + 1}</b> / {filteredQuestions.length} · Đã làm {totalAnswered}/{exam.questions.length}
            </span>
          </div>

          {/* Collapsible Question Map Drawer */}
          {showQuestionMap && (
            <div className="dict-step-dots study-map-drawer">
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
                    className={`dict-dot ${i === safeIdx ? "current" : ""} ${cls}`}
                    onClick={() => {
                      setIdx(i);
                      setShowQuestionMap(false);
                    }}
                    title={`${item.part === "vocab" ? "語彙" : "文法"} Câu ${item.number}`}
                  >
                    {item.part === "grammar" && partFilter === "all" && sectionFilter === "all"
                      ? `G${item.number}`
                      : item.number}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Main Question Card */}
        <div className="dict-card gengo-card">
          <div className="choukai-q-header">
            <div style={{ flex: 1, minWidth: 220 }}>
              <span className="choukai-sec-badge">
                {q.part === "vocab" ? "文字・語彙" : "文法"} · {sectionMeta?.titleJa} · Câu {q.number}
              </span>
              <div className="choukai-sec-sub">{sectionMeta?.instructionVi}</div>
            </div>
            <div className="choukai-nav-mini">
              <button
                type="button"
                className="pixel-icon-btn"
                disabled={safeIdx === 0}
                onClick={() => setIdx((v) => Math.max(0, v - 1))}
              >
                <PixelArrowLeftIcon size={13} />
                <span>Trước</span>
              </button>
              <button
                type="button"
                className="pixel-icon-btn"
                disabled={safeIdx + 1 >= filteredQuestions.length}
                onClick={() =>
                  setIdx((v) => Math.min(filteredQuestions.length - 1, v + 1))
                }
              >
                <span>Tiếp</span>
                <PixelArrowRightIcon size={13} />
              </button>
            </div>
          </div>

          {/* Cloze Composition Card for 問題3 */}
          {activePassage && (
            <ClozePassageCard
              passage={activePassage}
              activeQNumber={q.number}
              answers={answers}
              questions={exam.questions}
              showFurigana={showFurigana}
              showVi={showVi}
              onJumpToNumber={handleJumpToBlankNumber}
            />
          )}

          {/* Question Prompt Box */}
          <div className="gengo-prompt-panel">
            {q.headwordJa && (
              <div className="gengo-headword-pill">
                Từ cần kiểm tra cách dùng: <b>{q.headwordJa}</b>
              </div>
            )}

            {q.kind === "star_order" ? (
              <div className="gengo-star-sentence">
                {q.promptJa.split("[[STAR_SLOTS]]").map((segment, si) => (
                  <span key={si}>
                    <RubyText segments={segment} showFurigana={showFurigana} />
                    {si === 0 && (
                      <span className="gengo-star-slots-inline">
                        {[0, 1, 2, 3].map((slotPos) => {
                          const chosenOptIdx = hasAnswered && q.starOrder
                            ? q.starOrder[slotPos]
                            : scrambleSlots[slotPos];
                          const optObj =
                            chosenOptIdx !== undefined
                              ? q.options[chosenOptIdx]
                              : undefined;
                          return (
                            <span
                              key={slotPos}
                              className={`gengo-star-slot ${
                                slotPos === starIdx ? "is-star" : ""
                              } ${optObj ? "filled" : ""}`}
                            >
                              {optObj ? (
                                <RubyText
                                  segments={optObj.ja}
                                  showFurigana={showFurigana}
                                />
                              ) : slotPos === starIdx ? (
                                "★"
                              ) : (
                                "＿＿"
                              )}
                            </span>
                          );
                        })}
                      </span>
                    )}
                  </span>
                ))}
              </div>
            ) : (
              <div className="gengo-prompt-ja">
                <span className="dokkai-q-num-badge">問{q.number}</span>{" "}
                <RichPrompt
                  text={q.promptJa}
                  showFurigana={showFurigana}
                  maskTargetRuby={shouldMaskTarget}
                  filledBlank={
                    q.kind === "cloze" && hasAnswered
                      ? (typeof q.options[picked].ja === "string"
                          ? q.options[picked].ja
                          : null)
                      : null
                  }
                />
              </div>
            )}

            {(showVi || hasAnswered) && q.promptVi && (
              <div className="gengo-prompt-vi">
                <PixelTranslateIcon size={13} />
                <span>{q.promptVi}</span>
              </div>
            )}
          </div>

          {/* Interactive Scramble Helper for 問題2 ★ */}
          {q.kind === "star_order" && !hasAnswered && (
            <div className="gengo-scramble-helper">
              <div className="gengo-scramble-head">
                <span className="px-inline-label">
                  <PixelPuzzleIcon size={14} />
                  <span>
                    <b>Nháp ghép 4 mảnh câu (tùy chọn):</b> Bấm theo thứ tự 1 → 2 → ★ → 4 để thử câu rồi chọn đáp án ở ô ★.
                  </span>
                </span>
                {scrambleSlots.length > 0 && (
                  <button
                    type="button"
                    className="dokkai-reset-btn"
                    onClick={() => setScrambleSlots([])}
                  >
                    <PixelResetIcon size={12} />
                    <span>Xóa nháp</span>
                  </button>
                )}
              </div>
              <div className="gengo-scramble-chips">
                {q.options.map((opt, oi) => {
                  const pos = scrambleSlots.indexOf(oi);
                  return (
                    <button
                      key={opt.label}
                      type="button"
                      className={`gengo-scramble-chip ${pos >= 0 ? "placed" : ""}`}
                      onClick={() => handleToggleScramblePiece(oi)}
                    >
                      <span className="gengo-sc-num">{opt.label}</span>
                      <RubyText segments={opt.ja} showFurigana={showFurigana} />
                      {pos >= 0 && (
                        <span className="gengo-sc-badge">
                          {pos === starIdx ? "★" : `#${pos + 1}`}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              {scrambleSlots.length === 4 && (
                <div style={{ marginTop: 10 }}>
                  <button
                    type="button"
                    className="pixel-btn pixel-btn-mint"
                    onClick={() => handleSelectOption(scrambleSlots[starIdx])}
                  >
                    <PixelCheckIcon size={14} />
                    <span>Nộp đáp án ★ = số {scrambleSlots[starIdx] + 1}</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 4 Answer Options */}
          <div
            className={`choukai-options-grid ${
              q.kind === "usage" || q.kind === "synonym"
                ? "gengo-options-single"
                : ""
            }`}
          >
            {q.options.map((opt, oIdx) => {
              const chosen = picked === oIdx;
              const revealCorrect = hasAnswered && oIdx === q.correctIndex;
              const statusClass = revealCorrect
                ? "ok"
                : chosen && !isCorrect
                  ? "no"
                  : "";
              const optContent =
                q.kind === "usage" && typeof opt.ja === "string" ? (
                  <RichPrompt text={opt.ja} showFurigana={showOptionRuby} />
                ) : (
                  <RubyText segments={opt.ja} showFurigana={showOptionRuby} />
                );

              return (
                <button
                  key={opt.label}
                  type="button"
                  className={`choukai-opt-btn ${statusClass}`}
                  onClick={() => handleSelectOption(oIdx)}
                >
                  <span className="choukai-opt-num">{opt.label}</span>
                  <div className="choukai-opt-content">
                    <div className="choukai-opt-ja">{optContent}</div>
                    {(hasAnswered || showVi) && opt.vi && (
                      <div className="choukai-opt-vi">{opt.vi}</div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Instant Feedback & Explanation */}
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
              {q.kind === "star_order" && q.starOrder && (
                <div className="gengo-star-solution">
                  <b>Thứ tự chuẩn:</b>{" "}
                  {q.starOrder.map((oi, pos) => (
                    <span
                      key={pos}
                      className={`gengo-sol-chip ${pos === starIdx ? "star" : ""}`}
                    >
                      {pos === starIdx ? "★ " : ""}
                      {oi + 1}.{" "}
                      <RubyText
                        segments={q.options[oi].ja}
                        showFurigana={showFurigana}
                      />
                    </span>
                  ))}
                </div>
              )}
              <div className="choukai-clue-text">
                <span className="px-inline-label study-clue-lead">
                  <PixelLightbulbIcon size={14} />
                  <b>Giải thích &amp; mẹo JLPT:</b>
                </span>{" "}
                {q.explanationVi}
              </div>
            </div>
          )}

          {/* Footer Controls */}
          <div className="choukai-script-controls">
            <span className="study-muted-note">
              Câu {safeIdx + 1}/{filteredQuestions.length} trong mục hiện tại
            </span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {safeIdx + 1 < filteredQuestions.length && hasAnswered && (
                <button
                  type="button"
                  className="pixel-btn pixel-btn-purple"
                  onClick={() => setIdx((v) => v + 1)}
                >
                  <span>Câu tiếp</span>
                  <PixelArrowRightIcon size={14} />
                </button>
              )}
              {totalAnswered > 0 && (
                <button
                  type="button"
                  className="pixel-icon-btn"
                  onClick={() => {
                    setAnswers({});
                    retroAudio.playClick();
                  }}
                >
                  <PixelResetIcon size={13} />
                  <span>Làm lại toàn bộ</span>
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="dict-shortcuts-footer">
          Đề thi thật {exam.level} · Trọn bộ {exam.questions.length} câu 文字・語彙 &amp; 文法 · Tiến độ tự lưu trên trình duyệt.
        </div>
      </div>
    </div>
  );
}
