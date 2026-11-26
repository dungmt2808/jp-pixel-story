import type { RubyTextValue } from "./story";

export type GengoPart = "vocab" | "grammar";

export type GengoQuestionKind =
  | "kanji_read"
  | "kanji_write"
  | "cloze"
  | "synonym"
  | "usage"
  | "star_order"
  | "passage_cloze";

export interface GengoSectionMeta {
  id: string;
  part: GengoPart;
  shortLabel: string;
  titleJa: string;
  instructionVi: string;
  kind: GengoQuestionKind;
}

export interface GengoOption {
  label: string;
  /** Compact `{漢字|かんじ}` or plain Japanese option text */
  ja: RubyTextValue;
  /** Optional plain Japanese without ruby (used for kanji_write before answering) */
  jaNoRuby?: string;
  vi?: string;
}

export interface GengoPassageBlank {
  questionId: string;
  number: number;
}

export interface GengoClozePassage {
  id: string;
  sectionId: string;
  contextIntroJa: RubyTextValue;
  contextIntroVi: string;
  titleJa: RubyTextValue;
  authorJa: string;
  /** Paragraphs containing inline `[[18]]`..`[[21]]` blank markers & `{漢字|かんじ}` ruby */
  paragraphs: string[];
  paragraphsVi: string[];
}

export interface GengoQuestion {
  id: string;
  sectionId: string;
  part: GengoPart;
  kind: GengoQuestionKind;
  number: number;
  /**
   * Prompt Japanese with compact `{漢字|かんじ}` ruby.
   * Special inline markers:
   * - `[[...]]` renders with bold exam underline (target word in 問題1, 2, 4, 5)
   * - `（　）` renders as a highlighted blank box
   * - For `star_order`, use `[[STAR_SLOTS]]` where the 4 slots (＿＿ ＿＿ ★ ＿＿) belong!
   */
  promptJa: string;
  /** Optional no-ruby version of the underlined target word so Kanji reading isn't spoiled pre-answer */
  maskTargetRuby?: boolean;
  /** Optional word header for 問題5 (e.g., "ていねい") */
  headwordJa?: string;
  promptVi: string;
  /** For `star_order`: 0-based index of the ★ slot (usually 2 = 3rd slot) */
  starSlotIndex?: number;
  /** For `star_order`: ordered option indices `[optA, optB, optC, optD]` forming the correct sentence */
  starOrder?: [number, number, number, number];
  /** Optional linked cloze passage id for 問題3 */
  passageId?: string;
  options: GengoOption[];
  correctIndex: number;
  explanationVi: string;
}

export interface GengoExamData {
  id: string;
  examDate: string;
  level: string;
  titleJa: string;
  titleVi: string;
  description: string;
  dokkaiId?: string;
  choukaiId?: string;
  sections: GengoSectionMeta[];
  passages?: GengoClozePassage[];
  questions: GengoQuestion[];
}
