export interface RubySegment {
  /** Base Japanese text (Kanji or Kana). */
  t: string;
  /** Optional Furigana reading shown above `t`. */
  r?: string;
}

export interface DialogueLine {
  id: string;
  voice: string;
  speakerLabel?: string;
  jaPlain: string;
  ttsText?: string;
  jaRuby: RubySegment[];
  vi: string;
  audioUrl?: string;
  durationSec?: number;
}

export interface MiniGameChoice {
  id: string;
  labelJa: string;
  labelRuby?: RubySegment[];
  labelVi: string;
  effect: "microwave" | "polite_bow" | string;
  responseLine: DialogueLine;
}

export interface SceneMiniGame {
  prompt: string;
  choices: MiniGameChoice[];
}

export type SceneType =
  | "skyline_intro"
  | "exterior_zoom"
  | "konbini_walkin"
  | "drag_counter"
  | "closeup_choice"
  | "outro_celebrate";

export interface StoryScene {
  id: string;
  type: SceneType;
  bannerTitle?: string;
  locationBadge?: string;
  whoButtonLabel?: string;
  actionLabel?: string;
  instruction?: string;
  lines: DialogueLine[];
  minigame?: SceneMiniGame;
}

export interface CharacterFact {
  label: string;
  value: string;
}

export interface CharacterCard {
  nameJa: string;
  subtitle: string;
  facts: CharacterFact[];
}

export interface ReadingSentence {
  id: string;
  voice: string;
  jaPlain: string;
  jaRuby: RubySegment[];
  vi: string;
  audioUrl?: string;
  durationSec?: number;
  highlightVocabIds?: string[];
  highlightGrammarIds?: string[];
}

export interface VocabItem {
  id: string;
  word: string;
  reading: string;
  romaji?: string;
  level: string;
  partOfSpeech: string;
  meaningVi: string;
  note: string;
}

export interface GrammarItem {
  id: string;
  pattern: string;
  level: string;
  meaningVi: string;
  explanation: string;
  exampleJa: string;
  exampleRuby?: RubySegment[];
  exampleVi: string;
}

export interface QuizQuestion {
  id: string;
  questionJa: RubySegment[];
  questionVi: string;
  options: { ja: RubySegment[]; text?: string }[];
  correctIndex: number;
  explanationVi: string;
}

export interface StoryData {
  id: string;
  series: string;
  titleJa: string;
  titleVi: string;
  level: string;
  author: string;
  palette: string;
  voices: Record<
    string,
    { label: string; speakerId: number; speedScale: number }
  >;
  characterCard: CharacterCard;
  scenes: StoryScene[];
  reading: {
    sectionTitle: string;
    subtitle: string;
    sentences: ReadingSentence[];
    vocab: VocabItem[];
    grammar?: GrammarItem[];
    quiz?: QuizQuestion[];
  };
}
