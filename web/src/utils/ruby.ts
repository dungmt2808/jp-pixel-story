import type { RubySegment } from "../types/story";

const BRACE_RUBY_RE = /\{([^|}]+)\|([^}]+)\}/g;

/**
 * Parse compact `{漢字|かんじ}` notation into RubySegment[].
 * Cuts story JSON size and token usage by ~70% while keeping full Furigana control.
 */
export function parseRuby(input: string | RubySegment[]): RubySegment[] {
  if (Array.isArray(input)) return input;
  const out: RubySegment[] = [];
  let pos = 0;
  BRACE_RUBY_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = BRACE_RUBY_RE.exec(input)) !== null) {
    if (m.index > pos) {
      out.push({ t: input.slice(pos, m.index) });
    }
    out.push({ t: m[1], r: m[2] });
    pos = m.index + m[0].length;
  }
  if (pos < input.length) {
    out.push({ t: input.slice(pos) });
  }
  return out;
}

export function rubyToPlain(input: string | RubySegment[]): string {
  if (typeof input === "string") {
    return input.replace(BRACE_RUBY_RE, "$1");
  }
  return input.map((s) => s.t).join("");
}

export function rubyToKana(input: string | RubySegment[]): string {
  if (typeof input === "string") {
    return input.replace(BRACE_RUBY_RE, "$2");
  }
  return input.map((s) => s.r ?? s.t).join("");
}
