export interface RubySegment {
  /** Base Japanese text (Kanji or Kana). */
  t: string;
  /** Optional Furigana reading shown above `t`. */
  r?: string;
}

/** Supports both legacy RubySegment[] and compact `{漢字|かんじ}` string notation. */
export type RubyTextValue = string | RubySegment[];

export interface DialogueLine {
  id: string;
  voice: string;
  speakerLabel?: string;
  speakerId?: number;
  speedScale?: number;
  intonationScale?: number;
  jaPlain: string;
  ttsText?: string;
  jaRuby: RubyTextValue;
  vi: string;
  audioUrl?: string;
  durationSec?: number;
}

export interface MiniGameChoice {
  id: string;
  labelJa: string;
  labelRuby?: RubyTextValue;
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
  | "outro_celebrate"
  | "hybrid_alley_intro"
  | "hybrid_alley_zoom"
  | "hybrid_counter_order"
  | "hybrid_noodle_firmness"
  | "hybrid_drag_toppings"
  | "hybrid_outro_ramen"
  | "tsuru_snow_intro"
  | "tsuru_rescue_crane"
  | "tsuru_visitor_promise"
  | "tsuru_weaving_choice"
  | "tsuru_slide_fusuma"
  | "tsuru_farewell_sky"
  | "depato_intro"
  | "depato_counter_clue"
  | "depato_step_rain"
  | "depato_campus_reveal"
  | "depato_outro"
  | "cinema_intro"
  | "cinema_checklist"
  | "cinema_reveal"
  | "cinema_outro";

export interface StoryArtAssets {
  backgrounds: Record<string, string>;
  portraits: Record<string, string>;
  items: Record<string, string>;
  cardPortrait?: string;
}

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
  jaRuby: RubyTextValue;
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
  exampleRuby?: RubyTextValue;
  exampleVi: string;
}

export interface QuizQuestion {
  id: string;
  questionJa: RubyTextValue;
  questionVi: string;
  options: { ja: RubyTextValue; text?: string }[];
  correctIndex: number;
  explanationVi: string;
}

export interface StoryData {
  id: string;
  engine?: "procedural" | "hybrid" | "cinema";
  assets?: StoryArtAssets;
  series: string;
  titleJa: string;
  titleVi: string;
  level: string;
  author: string;
  palette: string;
  voices: Record<
    string,
    {
      label: string;
      speakerId: number;
      speedScale: number;
      pitchScale?: number;
      intonationScale?: number;
      pauseLengthScale?: number;
    }
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
