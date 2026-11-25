import type { CharacterCard } from "../types/story";
import { PortraitCanvas } from "./PortraitCanvas";

interface CharacterCardModalProps {
  card: CharacterCard;
  onClose: () => void;
}

export function CharacterCardModal({ card, onClose }: CharacterCardModalProps) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="char-card" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="char-card-close"
          onClick={onClose}
          aria-label="Close character card"
        >
          X
        </button>

        <div className="char-card-header">
          <div className="char-portrait-box">
            <PortraitCanvas />
          </div>
          <div>
            <h2 className="char-card-name">{card.nameJa}</h2>
            <div className="char-card-sub">{card.subtitle}</div>
          </div>
        </div>

        <div className="char-facts">
          {card.facts.map((fact, idx) => {
            const isLast = idx === card.facts.length - 1;
            return (
              <div
                key={fact.label}
                className={`char-fact-row ${isLast ? "char-fact-highlight" : ""}`}
              >
                <div className="char-fact-label">{fact.label}</div>
                <div className="char-fact-value">{fact.value}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
