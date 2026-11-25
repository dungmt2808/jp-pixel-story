import type { RubySegment } from "./story";

export interface DictationItem {
  id: string;
  speakerLabel?: string;
  jaPlain: string;
  jaKana: string;
  jaRuby: RubySegment[];
  vi: string;
  audioUrl: string;
  durationSec?: number;
}

export interface DictationPack {
  id: string;
  titleJa: string;
  titleVi: string;
  level: string;
  backHref?: string;
  items: DictationItem[];
}
