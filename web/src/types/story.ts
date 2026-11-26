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
  /** Fingerprint of text + voice settings written by the VOICEVOX tools (stale-audio check). */
  ttsHash?: string;
}

export interface MiniGameChoice {
  id: string;
  labelJa: string;
  labelRuby?: RubyTextValue;
  labelVi: string;
  effect: "microwave" | "polite_bow" | string;
  responseLine: DialogueLine;
  /** Cinema checklist: backdrop to show while this item's response plays (e.g. "proc:washoku_table"). */
  backdrop?: string;
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
  | "cinema_explore"
  | "cinema_dialogue"
  | "cinema_reveal"
  | "cinema_outro";

export interface StoryArtAssets {
  backgrounds: Record<string, string>;
  portraits: Record<string, string>;
  items?: Record<string, string>;
  /** key -> URL of a `meta.json` written by `pixellab_slice_spritesheet` (frame animation). */
  sprites?: Record<string, string>;
  cardPortrait?: string;
}

/** One on-stage character of the data-driven cinema engine. */
export interface CinemaActor {
  /** `DialogueLine.voice` value that makes this actor "talk". */
  voice: string;
  /** Static portrait key in `assets.portraits` ... */
  portrait?: string;
  /** ... or an animated sprite key in `assets.sprites` (preferred). */
  sprite?: string;
  idleClip?: string;
  talkClip?: string;
  /** Whole-number pixel scale (1 = native texel density). */
  scale?: number;
  flipX?: boolean;
  /** Horizontal pivot position on the 320px stage (defaults: left 56, right 264). */
  x?: number;
}

export interface CinemaRevealNote {
  label: string;
  text: string;
  color?: string;
}

export interface CinemaOutroLabels {
  reading?: string;
  dictation?: string;
  card?: string;
  replay?: string;
}

export interface StoryScene {
  id: string;
  type: SceneType;
  bannerTitle?: string;
  /** Cinema intro: small line under the title (defaults to the story level). */
  bannerSubtitle?: string;
  locationBadge?: string;
  /** Cinema: "bg:<backgroundKey>" or "proc:<procedural backdrop>" (see engine/cinemaBackdrops.ts). */
  backdrop?: string;
  /** Cinema: atmospheric overlay drawn above the backdrop ("bath_steam", "snow", "rain", "petals"). */
  overlay?: string;
  /** Cinema: which actors are on stage (default both; legacy outro shows only the left actor). */
  actors?: Array<"left" | "right">;
  revealNote?: CinemaRevealNote[];
  outroLabels?: CinemaOutroLabels;
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

export type StageEngine = "pixel" | "procedural" | "hybrid" | "tsuru" | "depato" | "cinema";

export interface StoryData {
  id: string;
  engine?: StageEngine;
  assets?: StoryArtAssets;
  /** Cinema engine cast (falls back to the first two portraits, keyed by voice). */
  cast?: { left?: CinemaActor; right?: CinemaActor };
  /** Chiptune BGM theme started when the story begins. */
  bgm?: "default" | "depato_sunny" | "depato_rain";
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
