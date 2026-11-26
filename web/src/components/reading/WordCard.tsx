import type { ReadingSentence, VocabItem } from "../../types/story";
import { RubyText } from "../RubyText";

interface WordCardProps {
  item: VocabItem;
  /** First sentence of the reading that uses the word (tap to hear it). */
  example?: ReadingSentence;
  showFurigana: boolean;
  showVi: boolean;
  onPlayExample: (s: ReadingSentence) => void;
  onClose: () => void;
}

/** 単語カード: the card opened by tapping an underlined word in the text. */
export function WordCard({ item, example, showFurigana, showVi, onPlayExample, onClose }: WordCardProps) {
  return (
    <div className="rd-wordcard open" role="dialog" aria-label={item.word}>
      <button type="button" className="rd-x" aria-label="Đóng" onClick={onClose}>
        ×
      </button>
      <div className="rd-wc-top">
        <div className="rd-wc-word">{item.word}</div>
        <div className="rd-wc-reading">
          {item.reading}
          {item.romaji && <span className="rd-wc-romaji"> · {item.romaji}</span>}
        </div>
      </div>
      <div className="rd-wc-tags">
        {item.hanViet && <span className="rd-tag shu">Hán Việt · {item.hanViet}</span>}
        <span className="rd-tag">{item.level}</span>
        <span className="rd-tag ghost">{item.partOfSpeech}</span>
      </div>
      <div className="rd-wc-meaning">{item.meaningVi}</div>
      {item.note && <div className="rd-wc-note">{item.note}</div>}
      {example && (
        <button type="button" className="rd-wc-example" onClick={() => onPlayExample(example)}>
          <span className="rd-wc-ex-label">🔊 Trong bài</span>
          <span className="rd-wc-ex-ja">
            <RubyText segments={example.jaRuby} showFurigana={showFurigana} />
          </span>
          {showVi && <span className="rd-wc-ex-vi">{example.vi}</span>}
        </button>
      )}
    </div>
  );
}
