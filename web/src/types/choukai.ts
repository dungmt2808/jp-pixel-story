import type { RubyTextValue } from "./story";

export interface ChoukaiScriptLine {
  speaker: string;
  ja: RubyTextValue;
  vi: string;
}

export interface ChoukaiOption {
  label: string;
  ja?: RubyTextValue;
  vi?: string;
}

export interface ChoukaiQuestion {
  id: string;
  sectionId: "m1" | "m2" | "m3" | "m4";
  number: number;
  audioUrl: string;
  durationSec: number;
  imageUrl?: string;
  /** Hide written options until answered (authentic for Mondai 3 & 4 where options are audio-only). */
  hideOptionsUntilAnswered?: boolean;
  promptJa: RubyTextValue;
  promptVi: string;
  options: ChoukaiOption[];
  correctIndex: number;
  script: ChoukaiScriptLine[];
  keyClueVi: string;
}

export interface ChoukaiSection {
  id: "m1" | "m2" | "m3" | "m4";
  titleJa: string;
  titleVi: string;
  instructionVi: string;
}

export interface ChoukaiExamData {
  id: string;
  titleJa: string;
  titleVi: string;
  examDate: string;
  level: string;
  audioSourceNote: string;
  sections: ChoukaiSection[];
  questions: ChoukaiQuestion[];
}
