import type { RubySegment } from "../types/story";

interface RubyTextProps {
  segments: RubySegment[];
  showFurigana: boolean;
}

export function RubyText({ segments, showFurigana }: RubyTextProps) {
  return (
    <>
      {segments.map((seg, idx) =>
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
