import { useRef, useState } from "react";
import { retroAudio } from "../audio/chiptune";
import type { ReadingSentence, StoryData } from "../types/story";
import { resolveAssetUrl } from "../utils/assetUrl";
import { PortraitCanvas } from "./PortraitCanvas";
import { RubyText } from "./RubyText";

interface ReadingViewProps {
  story: StoryData;
  showFurigana: boolean;
  onToggleFurigana: () => void;
  onBackToStory: () => void;
  onOpenLibrary: () => void;
  onOpenDictation: () => void;
}

export function ReadingView({
  story,
  showFurigana,
  onToggleFurigana,
  onBackToStory,
  onOpenLibrary,
  onOpenDictation,
}: ReadingViewProps) {
  const [activeSentenceId, setActiveSentenceId] = useState<string>(
    story.reading.sentences[0]?.id ?? ""
  );
  const [sidebarTab, setSidebarTab] = useState<"all" | "vocab" | "grammar">("all");
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number>>({});
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const activeSentence = story.reading.sentences.find(
    (s) => s.id === activeSentenceId
  );
  const highlightedVocab = new Set(activeSentence?.highlightVocabIds ?? []);
  const grammarList = story.reading.grammar ?? [];
  const quizList = story.reading.quiz ?? [];

  const playSentence = (sent: ReadingSentence) => {
    setActiveSentenceId(sent.id);
    if (!sent.audioUrl) return;
    if (audioRef.current) {
      audioRef.current.pause();
    }
    const audio = new Audio(resolveAssetUrl(sent.audioUrl));
    audioRef.current = audio;
    void audio.play();
  };

  const handleAnswerQuiz = (qid: string, optIdx: number, correctIndex: number) => {
    setQuizAnswers((prev) => ({ ...prev, [qid]: optIdx }));
    if (optIdx === correctIndex) {
      retroAudio.playFanfare();
    } else {
      retroAudio.playClick();
    }
  };

  return (
    <div className="reading-shell">
      <div className="reading-topbar">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            className="reading-back-btn"
            onClick={onOpenLibrary}
          >
            📚 Thư viện
          </button>
          <button
            type="button"
            className="reading-back-btn"
            onClick={onBackToStory}
          >
            ← Quay lại hoạt ảnh
          </button>
          <button
            type="button"
            className="reading-back-btn"
            style={{ background: "#226e68" }}
            onClick={onOpenDictation}
          >
            🎧 Luyện nghe chép
          </button>
        </div>

        <div style={{ fontWeight: 700, fontSize: 14 }}>
          {story.titleJa} · {story.level}
        </div>

        <button
          type="button"
          className={`pixel-icon-btn ${showFurigana ? "active" : ""}`}
          onClick={onToggleFurigana}
        >
          ふりがな {showFurigana ? "ON" : "OFF"}
        </button>
      </div>

      <div className="reading-grid">
        <div className="reading-passage-col">
          <div className="reading-intro-head">
            <div className="reading-avatar">
              <PortraitCanvas />
            </div>
            <div>
              <h1 className="reading-h1">{story.reading.sectionTitle}</h1>
              <p className="reading-sub">{story.reading.subtitle}</p>
            </div>
          </div>

          {story.reading.sentences.map((sent) => {
            const isActive = sent.id === activeSentenceId;
            return (
              <div
                key={sent.id}
                className={`sentence-card ${isActive ? "active" : ""}`}
                onClick={() => playSentence(sent)}
              >
                <div className="sentence-ja">
                  <RubyText
                    segments={sent.jaRuby}
                    showFurigana={showFurigana}
                  />
                </div>
                <div className="sentence-vi">{sent.vi}</div>
                <span className="sentence-play-hint">
                  ▶ Nghe giọng VOICEVOX ({sent.durationSec?.toFixed(1) ?? "—"}s)
                </span>
              </div>
            );
          })}

          {quizList.length > 0 && (
            <section className="reading-quiz-section">
              <h2 className="reading-quiz-title">
                <RubyText
                  segments={[
                    { t: "読解", r: "どっかい" },
                    { t: "クイズ" },
                  ]}
                  showFurigana={showFurigana}
                />{" "}
                <span>· Kiểm tra hiểu bài</span>
              </h2>
              {quizList.map((q, qIdx) => {
                const picked = quizAnswers[q.id];
                const isCorrect = picked === q.correctIndex;
                return (
                  <div key={q.id} className="quiz-card">
                    <div className="quiz-q-ja">
                      <b>{qIdx + 1}. </b>
                      <RubyText
                        segments={q.questionJa}
                        showFurigana={showFurigana}
                      />
                    </div>
                    <div className="quiz-q-vi">{q.questionVi}</div>
                    <div className="quiz-opts">
                      {q.options.map((opt, oIdx) => {
                        const chosen = picked === oIdx;
                        const statusClass = chosen
                          ? oIdx === q.correctIndex
                            ? "ok"
                            : "no"
                          : "";
                        return (
                          <button
                            key={oIdx}
                            type="button"
                            className={`quiz-opt-btn ${statusClass}`}
                            onClick={() =>
                              handleAnswerQuiz(q.id, oIdx, q.correctIndex)
                            }
                          >
                            <RubyText
                              segments={opt.ja}
                              showFurigana={showFurigana}
                            />
                          </button>
                        );
                      })}
                    </div>
                    {picked !== undefined && (
                      <div className={`quiz-fb ${isCorrect ? "ok" : "no"}`}>
                        {isCorrect ? (
                          <>
                            <b>せいかい! (Chính xác)</b> {q.explanationVi}
                          </>
                        ) : (
                          <>
                            <b>ざんねん…</b> Thử chọn lại đáp án khác nhé!
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
          )}
        </div>

        <div className="reading-vocab-col">
          <div className="sidebar-tabs">
            <button
              type="button"
              className={`sidebar-tab ${sidebarTab === "all" ? "active" : ""}`}
              onClick={() => setSidebarTab("all")}
            >
              Tất cả
            </button>
            <button
              type="button"
              className={`sidebar-tab ${sidebarTab === "vocab" ? "active" : ""}`}
              onClick={() => setSidebarTab("vocab")}
            >
              📒 Từ vựng ({story.reading.vocab.length})
            </button>
            {grammarList.length > 0 && (
              <button
                type="button"
                className={`sidebar-tab ${sidebarTab === "grammar" ? "active" : ""}`}
                onClick={() => setSidebarTab("grammar")}
              >
                🧩 Ngữ pháp ({grammarList.length})
              </button>
            )}
          </div>

          {(sidebarTab === "all" || sidebarTab === "vocab") && (
            <>
              <h2 className="vocab-heading">📒 Từ vựng đã áp dụng</h2>
              {story.reading.vocab.map((item) => {
                const isHighlighted = highlightedVocab.has(item.id);
                return (
                  <div
                    key={item.id}
                    className={`vocab-card vocab-type ${
                      isHighlighted ? "highlighted" : ""
                    }`}
                  >
                    <div className="vocab-top">
                      <div>
                        <span className="vocab-word">{item.word}</span>
                        {showFurigana && (
                          <span className="vocab-reading">{item.reading}</span>
                        )}
                      </div>
                      <span className="vocab-level">{item.level}</span>
                    </div>
                    <div className="vocab-meaning">{item.meaningVi}</div>
                    <div className="vocab-note">{item.note}</div>
                  </div>
                );
              })}
            </>
          )}

          {(sidebarTab === "all" || sidebarTab === "grammar") &&
            grammarList.length > 0 && (
              <>
                <h2 className="vocab-heading" style={{ marginTop: 18 }}>
                  🧩 Ngữ pháp đã áp dụng
                </h2>
                {grammarList.map((g) => (
                  <div key={g.id} className="vocab-card grammar-type">
                    <div className="vocab-top">
                      <span className="vocab-word">{g.pattern}</span>
                      <span className="vocab-level grammar-badge">
                        {g.level}
                      </span>
                    </div>
                    <div className="vocab-meaning">{g.meaningVi}</div>
                    <div className="vocab-note">{g.explanation}</div>
                    <div className="grammar-example">
                      <div className="grammar-ex-ja">
                        {g.exampleRuby ? (
                          <RubyText
                            segments={g.exampleRuby}
                            showFurigana={showFurigana}
                          />
                        ) : (
                          g.exampleJa
                        )}
                      </div>
                      <div className="grammar-ex-vi">{g.exampleVi}</div>
                    </div>
                  </div>
                ))}
              </>
            )}
        </div>
      </div>
    </div>
  );
}
