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
  /** Vibe kit: manga symbol over the speaker ("sweat", "anger", "heart", "sparkle", "shock", "question", "note", "dots", "gloom"). */
  emote?: string;
  /** Which actor the emote belongs to (default: the speaker). */
  emoteSide?: "left" | "right";
  /** Vibe kit: camera move while the line plays ("push", "punch", "close", "shake", "pan_left", "pan_right"). */
  camera?: string;
  /** Vibe kit: big variety-show caption over the stage (ruby allowed). */
  telop?: string | LineTelop;
  /** Vibe kit: sound effect at the start of the line (default comes from the emote; "none" = silent). */
  sfx?: string;
}

export interface LineTelop {
  text: string;
  /** Vietnamese under the telop (hidden when VI is off). */
  sub?: string;
  color?: "shu" | "gold" | "ai" | "white";
  /** Position in % of the stage (default 50 / 24). */
  x?: number;
  y?: number;
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
  /** key -> URL of a `rig.json` written by `pixellab_build_rig` (head/body cutout animation). */
  rigs?: Record<string, string>;
  cardPortrait?: string;
}

/** One on-stage character of the data-driven cinema engine. */
export interface CinemaActor {
  /** `DialogueLine.voice` value that makes this actor "talk". */
  voice: string;
  /** Static portrait key in `assets.portraits` ... */
  portrait?: string;
  /** ... or an animated sprite key in `assets.sprites` ... */
  sprite?: string;
  /** ... or a head/body rig key in `assets.rigs` (best: expressions + breathing / nodding). */
  rig?: string;
  idleClip?: string;
  talkClip?: string;
  /** Whole-number pixel scale (1 = native texel density). */
  scale?: number;
  flipX?: boolean;
  /** Horizontal pivot position on the 320px stage (defaults: left 56, right 264). */
  x?: number;
}

/** In-scene pixel tag (reference player style): term + optional translation, optional leader line. */
export interface StageLabel {
  /** Main text; Japanese may use compact ruby `{弁当|べんとう}`. */
  text: string;
  /** Translation shown under the term (hidden when the VI subtitle mode is off). */
  sub?: string;
  /** Centre of the tag in virtual 320x200 coordinates. */
  x: number;
  y: number;
  /** Draws a crisp 1px leader line from the tag to this point. */
  to?: [number, number];
  /** Only show once line N (0-based) of the scene has started. */
  afterLine?: number;
  style?: "tag" | "letter";
}

export interface SceneStamp {
  text: string;
  x?: number;
  y?: number;
}

export interface DragItem {
  id: string;
  /** Key in assets.items (palette-locked sprite). */
  item: string;
  from: [number, number];
  to: [number, number];
  label?: string;
  labelVi?: string;
}

export interface TapSpot {
  id: string;
  x: number;
  y: number;
  r?: number;
  /** Optional sprite drawn at the spot (assets.items key). */
  item?: string;
  label?: string;
  labelVi?: string;
  /** Optional voice line played when found. */
  line?: DialogueLine;
}

export interface HoldGauge {
  label: string;
  x: number;
  y: number;
  durationSec: number;
  /** Optional sprite drawn while holding (assets.items key), e.g. a teapot. */
  item?: string;
  /** Particle stream from the item to this point while holding (pouring, watering...). */
  streamTo?: [number, number];
}

/** Data-driven mini-game of a scene (played after the scene's lines). */
export interface SceneInteraction {
  type: "drag" | "tap" | "hold";
  /** Vietnamese instruction; shown uppercase in the caption bar with progress. */
  hint: string;
  items?: DragItem[];
  spots?: TapSpot[];
  hold?: HoldGauge;
  /** Voice line played when the interaction is completed. */
  doneLine?: DialogueLine;
}

export interface CinemaTitleCard {
  title?: string;
  subtitle?: string;
  credit?: string;
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
  /** Player v2: location / date stamp, e.g. "SHINJUKU GYOEN · 4月". */
  stamp?: string | SceneStamp;
  /** Player v2: pixel tags placed in the scene. */
  labels?: StageLabel[];
  /** Player v2: mini-game played after the lines. */
  interaction?: SceneInteraction;
  /** Player v2: intro title panel (defaults to bannerTitle / bannerSubtitle). */
  titleCard?: CinemaTitleCard;
  /** Additional atmospheric overlays drawn in order (e.g. ["light_rays", "petals"]). */
  overlays?: string[];
  /** Outro: one-line recap shown above the end buttons in the caption bar. */
  summary?: string;
  /** Vibe kit: light grade over the whole frame ("day", "morning", "golden", "dusk", "night", "rain", "warm"). */
  light?: string;
  /** Vibe kit: BGM mood from this scene on ("calm", "happy", "sad", "none" or a theme name). */
  bgm?: string;
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
  /** Shown as "??? — hoàn thành truyện để mở khoá" until the outro is reached. */
  locked?: boolean;
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
  /** Sino-Vietnamese reading of the kanji, e.g. 約束 -> "ƯỚC THÚC". */
  hanViet?: string;
  /** Spellings to find in the text when it differs from `word` (conjugations, kana spelling...). */
  forms?: string[];
}

/** One chapter of the reading page: a run of sentences + the stage scene it retells. */
export interface ReadingChapter {
  id: string;
  /** Ruby allowed: "{桜|さくら}の{公園|こうえん}". */
  title: string;
  titleVi?: string;
  sentenceIds: string[];
  /** Scene id from `scenes[]`; its `bg:` backdrop becomes the chapter illustration. */
  scene?: string;
  /** Explicit illustration (overrides the scene backdrop). */
  image?: string;
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
  /** Strict sprite craft checks for the validator (outline colour / noise / colour count). */
  artQuality?: { outlineColor?: string; minOutlineCompliance?: number; maxOrphanRatio?: number; maxColorsPerSprite?: number };
  /** Player v2 watermark shown in the stage corner. */
  brand?: string;
  /** Player v2 look: subtle dithered corner vignette (off by default). */
  look?: { vignette?: boolean };
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
    /** Optional chapters (TOC + illustration); default: one chapter with every sentence. */
    chapters?: ReadingChapter[];
    vocab: VocabItem[];
    grammar?: GrammarItem[];
    quiz?: QuizQuestion[];
  };
}
