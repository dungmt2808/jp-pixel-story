/**
 * Pure helpers of the reading page: chapters, vocab-word detection inside ruby text,
 * chapter illustrations. No DOM, unit-tested in tests/utils.test.mjs.
 */
import type { ReadingChapter, RubySegment, StoryData, VocabItem } from "../types/story";
import { parseRuby } from "./ruby";

export interface WordChunk {
  segs: RubySegment[];
  vocabId?: string;
}

type VocabLike = Pick<VocabItem, "id" | "word"> & { forms?: string[] };

/** Spellings to look for: explicit `forms`, else `word` without "(...)" notes and "〜..." tails. */
export function vocabNeedles(v: VocabLike): string[] {
  const base = v.word
    .replace(/\s*[(（][^)）]*[)）]\s*/g, "")
    .split(/[〜~]/)[0]
    .trim();
  const all = [...(v.forms ?? []), base].filter((n) => n.length > 0);
  return [...new Set(all)];
}

/**
 * Split a ruby sentence into chunks, wrapping every occurrence of a vocab word.
 * Kanji groups with ruby are atomic: a match that cuts one is widened to the whole group,
 * so furigana is never split. Longest spelling wins; matching is greedy left to right.
 */
export function chunkByVocab(input: string | RubySegment[], vocab: VocabLike[]): WordChunk[] {
  const segs = parseRuby(input);
  const plain = segs.map((s) => s.t).join("");
  const needles = vocab
    .flatMap((v) => vocabNeedles(v).map((n) => ({ n, id: v.id })))
    .sort((a, b) => b.n.length - a.n.length);

  const marks: { start: number; end: number; id: string }[] = [];
  for (let i = 0; i < plain.length; ) {
    const hit = needles.find((x) => plain.startsWith(x.n, i));
    if (hit) {
      marks.push({ start: i, end: i + hit.n.length, id: hit.id });
      i += hit.n.length;
    } else {
      i++;
    }
  }
  // widen marks to whole ruby groups
  let off = 0;
  for (const seg of segs) {
    const a = off;
    const b = off + seg.t.length;
    if (seg.r) {
      for (const m of marks) {
        if (m.start < b && m.end > a) {
          m.start = Math.min(m.start, a);
          m.end = Math.max(m.end, b);
        }
      }
    }
    off = b;
  }
  // merge marks that now overlap (keep the first one's id)
  marks.sort((x, y) => x.start - y.start);
  const merged: typeof marks = [];
  for (const m of marks) {
    const last = merged[merged.length - 1];
    if (last && m.start < last.end) last.end = Math.max(last.end, m.end);
    else merged.push({ ...m });
  }

  const markAt = (pos: number) => merged.findIndex((m) => pos >= m.start && pos < m.end);
  const pieces: { seg: RubySegment; mark: number }[] = [];
  off = 0;
  for (const seg of segs) {
    if (seg.r) {
      pieces.push({ seg, mark: markAt(off) });
    } else {
      // split plain text at mark boundaries
      let cur = "";
      let curMark = markAt(off);
      for (let k = 0; k < seg.t.length; k++) {
        const mk = markAt(off + k);
        if (mk !== curMark && cur) {
          pieces.push({ seg: { t: cur }, mark: curMark });
          cur = "";
        }
        curMark = mk;
        cur += seg.t[k];
      }
      if (cur) pieces.push({ seg: { t: cur }, mark: curMark });
    }
    off += seg.t.length;
  }

  const chunks: WordChunk[] = [];
  let lastMark = -2;
  for (const p of pieces) {
    const prev = chunks[chunks.length - 1];
    if (prev && p.mark === lastMark) {
      prev.segs.push(p.seg);
    } else {
      chunks.push({ segs: [p.seg], vocabId: p.mark >= 0 ? merged[p.mark].id : undefined });
    }
    lastMark = p.mark;
  }
  return chunks;
}

/** Chapters of a story's reading; falls back to one chapter holding every sentence. */
export function readingChapters(story: Pick<StoryData, "reading" | "scenes">): ReadingChapter[] {
  const sentences = story.reading.sentences;
  const known = new Set(sentences.map((s) => s.id));
  const declared = (story.reading.chapters ?? [])
    .map((c) => ({ ...c, sentenceIds: c.sentenceIds.filter((id) => known.has(id)) }))
    .filter((c) => c.sentenceIds.length > 0);
  if (declared.length > 0) return declared;
  const firstBgScene = story.scenes.find((s) => s.backdrop?.startsWith("bg:"));
  return [
    {
      id: "all",
      title: story.reading.sectionTitle,
      sentenceIds: sentences.map((s) => s.id),
      scene: firstBgScene?.id,
    },
  ];
}

/** Illustration URL of a chapter: explicit image > the `bg:` backdrop of its scene > none. */
export function chapterImage(
  chapter: ReadingChapter,
  story: Pick<StoryData, "scenes" | "assets">
): string | undefined {
  if (chapter.image) return chapter.image;
  const scene = story.scenes.find((s) => s.id === chapter.scene);
  const ref = scene?.backdrop;
  if (!ref?.startsWith("bg:")) return undefined;
  return story.assets?.backgrounds?.[ref.slice(3)];
}

/** Index of a scene id in `scenes[]` (-1 when unknown) — used to jump back to the animation. */
export function sceneIndex(story: Pick<StoryData, "scenes">, sceneId: string | undefined): number {
  return sceneId ? story.scenes.findIndex((s) => s.id === sceneId) : -1;
}

/** Quiz score from the FIRST answer given to each question. */
export function quizScore(
  firstPicks: Record<string, number>,
  quiz: { id: string; correctIndex: number }[]
): { correct: number; answered: number; total: number } {
  let correct = 0;
  let answered = 0;
  for (const q of quiz) {
    if (firstPicks[q.id] === undefined) continue;
    answered++;
    if (firstPicks[q.id] === q.correctIndex) correct++;
  }
  return { correct, answered, total: quiz.length };
}
