import type { RubySegment } from "../types/story";
import { parseRuby } from "../utils/ruby";

interface RubyTextProps {
  segments: string | RubySegment[];
  showFurigana: boolean;
}

export function RubyText({ segments, showFurigana }: RubyTextProps) {
  const list = parseRuby(segments);
  return (
    <>
      {list.map((seg, idx) =>
        seg.r && showFurigana ? (
          <ruby key={idx}>
            {seg.t}
            <rp>(</rp>
            <rt>{seg.r}</rt>
            <rp>)</rp>
          </ruby>
        ) : (
          <span key={idx}>{seg.t}</span>
        )
      )}
    </>
  );
}
