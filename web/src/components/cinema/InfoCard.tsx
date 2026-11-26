import type { CharacterCard } from "../../types/story";
import { resolveAssetUrl } from "../../utils/assetUrl";
import { RubyText } from "../RubyText";

interface InfoCardProps {
  card: CharacterCard;
  portraitUrl?: string;
  /** Locked facts stay "???" until the learner reaches the end of the story. */
  unlocked: boolean;
  showFurigana: boolean;
  onClose: () => void;
}

/** Parchment info card of the cinematic player (portrait, title, key/value facts). */
export function InfoCard({ card, portraitUrl, unlocked, showFurigana, onClose }: InfoCardProps) {
  return (
    <div className="cine-card-backdrop" onClick={onClose}>
      <div className="cine-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={card.nameJa}>
        <button type="button" className="cine-card-close" onClick={onClose} aria-label="Đóng">
          ✕
        </button>
        <div className="cine-card-head">
          {portraitUrl && <img className="cine-card-portrait" src={resolveAssetUrl(portraitUrl)} alt="" />}
          <div>
            <div className="cine-card-title">
              <RubyText segments={card.nameJa} showFurigana={showFurigana} />
            </div>
            <div className="cine-card-sub">
              <RubyText segments={card.subtitle} showFurigana={showFurigana} />
            </div>
          </div>
        </div>
        {card.facts.map((fact) => {
          const hidden = fact.locked && !unlocked;
          return (
            <div key={fact.label} className={`cine-card-row ${hidden ? "locked" : ""}`}>
              <div className="k">{fact.label}</div>
              <div className="v">
                {hidden ? "??? — hoàn thành truyện để mở khoá" : <RubyText segments={fact.value} showFurigana={showFurigana} />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
