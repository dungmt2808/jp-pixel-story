import type { RubyTextValue } from "./story";

export interface DokkaiVocabItem {
  word: string;
  reading: string;
  meaningVi: string;
}

export interface DokkaiGrammarNote {
  id: string;
  pattern: string;
  titleVi: string;
  explanationVi: string;
  exampleRuby?: RubyTextValue;
}

export type DokkaiDocStyle = "email" | "memo" | "essay" | "notice" | "info_table";

export interface DokkaiSentence {
  id: string;
  jaPlain: string;
  jaRuby: RubyTextValue;
  vi: string;
  audioUrl?: string;
  durationSec?: number;
  /** Optional small heading before this sentence (e.g., "<予約>", "<注意>") */
  sectionTagJa?: RubyTextValue;
  /** Optional subtle highlight flag (e.g., key line referenced by question) */
  highlight?: boolean;
}

export interface DokkaiConditionOption {
  id: string;
  label: string;
  badge: string;
  summaryJa: RubyTextValue;
  summaryVi: string;
  accent?: "sunny" | "rain" | "warn" | "ok";
}

export interface DokkaiTimelineStep {
  time: string;
  labelJa: RubyTextValue;
  labelVi: string;
  emphasis?: boolean;
}

export interface DokkaiTableRow {
  id: string;
  cells: RubyTextValue[];
  /** Tags matched by interactive filter chips */
  tags: string[];
}

export interface DokkaiTableFilter {
  id: string;
  labelJa: RubyTextValue;
  labelVi: string;
  tag: string;
}

export interface DokkaiTablePreset {
  id: string;
  label: string;
  tags: string[];
}

export interface DokkaiTableBlock {
  captionJa?: RubyTextValue;
  columns: RubyTextValue[];
  rows: DokkaiTableRow[];
  filters: DokkaiTableFilter[];
  presets?: DokkaiTablePreset[];
  footnoteJa?: RubyTextValue;
  footnoteVi?: string;
}

export interface DokkaiOption {
  label: string;
  ja: RubyTextValue;
  vi: string;
}

export interface DokkaiQuestion {
  id: string;
  number: number;
  questionJa: RubyTextValue;
  questionVi: string;
  options: DokkaiOption[];
  correctIndex: number;
  explanationVi: string;
}

export interface DokkaiPassage {
  id: string;
  tabLabel: string;
  sectionBadge: string;
  docStyle: DokkaiDocStyle;
  contextIntroJa?: RubyTextValue;
  contextIntroVi?: string;
  titleJa: RubyTextValue;
  titleVi: string;
  headerMeta?: Array<{ label: string; valueJa: RubyTextValue }>;
  footerMeta?: RubyTextValue[];
  sentences: DokkaiSentence[];
  /** Optional interactive condition simulator (e.g., rain vs no-rain notice) */
  conditionSimulator?: {
    promptVi: string;
    options: DokkaiConditionOption[];
  };
  /** Optional visual timeline helper (e.g., office memo deadlines) */
  timeline?: DokkaiTimelineStep[];
  /** Optional filterable table(s) for 問題6 information search */
  tables?: DokkaiTableBlock[];
  questions: DokkaiQuestion[];
  vocab: DokkaiVocabItem[];
  grammar: DokkaiGrammarNote[];
}

export interface DokkaiExamData {
  id: string;
  examDate: string;
  level: string;
  titleJa: string;
  titleVi: string;
  description: string;
  /** Optional linked 問題5 animated story id in the library */
  mondai5StoryId?: string;
  mondai5TitleVi?: string;
  passages: DokkaiPassage[];
}
