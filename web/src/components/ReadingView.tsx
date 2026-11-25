import { useRef, useState } from "react";
import type { ReadingSentence, StoryData } from "../types/story";
import { PortraitCanvas } from "./PortraitCanvas";
import { RubyText } from "./RubyText";

interface ReadingViewProps {
  story: StoryData;
  showFurigana: boolean;
  onToggleFurigana: () => void;
  onBackToStory: () => void;
}

export function ReadingView({
  story,
  showFurigana,
  onToggleFurigana,
  onBackToStory,
}: ReadingViewProps) {
  const [activeSentenceId, setActiveSentenceId] = useState<string>(
    story.reading.sentences[0]?.id ?? ""
  );
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const activeSentence = story.reading.sentences.find(
    (s) => s.id === activeSentenceId
  );
  const highlightedVocab = new Set(activeSentence?.highlightVocabIds ?? []);

  const playSentence = (sent: ReadingSentence) => {
    setActiveSentenceId(sent.id);
    if (!sent.audioUrl) return;
    if (audioRef.current) {
      audioRef.current.pause();
    }
    const audio = new Audio(sent.audioUrl);
    audioRef.current = audio;
    void audio.play();
  };

  return (
    <div className="reading-shell">
      <div className="reading-topbar">
        <button
          type="button"
          className="reading-back-btn"
          onClick={onBackToStory}
        >
          ← Quay lại hoạt ảnh
        </button>

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
        </div>

        <div className="reading-vocab-col">
          <h2 className="vocab-heading">Từ vựng & Mẫu câu trọng tâm</h2>
          {story.reading.vocab.map((item) => {
            const isHighlighted = highlightedVocab.has(item.id);
            return (
              <div
                key={item.id}
                className={`vocab-card ${isHighlighted ? "highlighted" : ""}`}
              >
                <div className="vocab-top">
                  <div>
                    <span className="vocab-word">{item.word}</span>
                    <span className="vocab-reading">
                      {item.reading} ({item.romaji})
                    </span>
                  </div>
                  <span className="vocab-level">{item.level}</span>
                </div>
                <div className="vocab-meaning">{item.meaningVi}</div>
                <div className="vocab-note">{item.note}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
