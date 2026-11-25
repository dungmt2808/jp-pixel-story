import type { RubySegment } from "../types/story";

export interface DiffToken {
  char: string;
  status: "ok" | "wrong" | "missing";
}

export interface DictationGrade {
  exactMatch: boolean;
  accuracyPct: number;
  matchedMode: "kanji" | "kana";
  diff: DiffToken[];
}

const NUMBER_READINGS: Array<[string, string]> = [
  ["1924", "せんきゅうひゃくにじゅうよ"],
  ["1925", "せんきゅうひゃくにじゅうご"],
  ["1932", "せんきゅうひゃくさんじゅうに"],
  ["1934", "せんきゅうひゃくさんじゅうよ"],
  ["1935", "せんきゅうひゃくさんじゅうご"],
  ["160", "ひゃくろくじゅう"],
  ["45", "よんじゅうご"],
  ["24", "にじゅうよ"],
  ["11", "じゅういち"],
  ["10", "じゅう"],
  ["5", "ご"],
  ["3", "さん"],
];

function toHalfWidth(str: string): string {
  return str.replace(/[Ａ-Ｚａ-ｚ０-９]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xfee0)
  );
}

export function katakanaToHiragana(str: string): string {
  let out = "";
  for (const ch of str) {
    const code = ch.charCodeAt(0);
    if (code >= 0x30a1 && code <= 0x30f6) {
      out += String.fromCharCode(code - 0x60);
    } else {
      out += ch;
    }
  }
  return out;
}

/** Strip spaces and Japanese/ASCII punctuation for forgiving comparison. */
export function normalizeForCompare(raw: string, foldToHiragana = false): string {
  let s = toHalfWidth(raw)
    .replace(/[\s　。、！？!?「」『』（）()・….,:;'"“”\-–—]/g, "")
    .trim();
  if (foldToHiragana) {
    s = katakanaToHiragana(s);
    for (const [digits, reading] of NUMBER_READINGS) {
      s = s.split(digits).join(reading);
    }
  }
  return s;
}

/** Build character-level LCS diff between user string and target string. */
function computeLcsDiff(userStr: string, targetStr: string): {
  diff: DiffToken[];
  matches: number;
} {
  const u = Array.from(userStr);
  const t = Array.from(targetStr);
  const m = u.length;
  const n = t.length;

  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0)
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (u[i - 1] === t[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const diff: DiffToken[] = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && u[i - 1] === t[j - 1]) {
      diff.push({ char: t[j - 1], status: "ok" });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      diff.push({ char: t[j - 1], status: "missing" });
      j--;
    } else {
      diff.push({ char: u[i - 1], status: "wrong" });
      i--;
    }
  }
  diff.reverse();
  return { diff, matches: dp[m][n] };
}

/**
 * Grade Japanese dictation input flexibly:
 * accepts either Kanji+Kana OR pure Hiragana/Katakana and chooses the best match.
 */
export function gradeJapaneseDictation(
  userInput: string,
  targetPlain: string,
  targetKana: string
): DictationGrade {
  const uPlain = normalizeForCompare(userInput, false);
  const tPlain = normalizeForCompare(targetPlain, false);

  const uKana = normalizeForCompare(userInput, true);
  const tKana = normalizeForCompare(targetKana, true);

  if (uPlain.length === 0) {
    return {
      exactMatch: false,
      accuracyPct: 0,
      matchedMode: "kana",
      diff: Array.from(tKana).map((ch) => ({ char: ch, status: "missing" })),
    };
  }

  const plainRes = computeLcsDiff(uPlain, tPlain);
  const plainDenom = Math.max(uPlain.length, tPlain.length, 1);
  const plainScore = plainRes.matches / plainDenom;

  const kanaRes = computeLcsDiff(uKana, tKana);
  const kanaDenom = Math.max(uKana.length, tKana.length, 1);
  const kanaScore = kanaRes.matches / kanaDenom;

  const useKanji = plainScore >= kanaScore;
  const bestRes = useKanji ? plainRes : kanaRes;
  const bestScore = useKanji ? plainScore : kanaScore;
  const exactMatch = useKanji ? uPlain === tPlain : uKana === tKana;

  return {
    exactMatch,
    accuracyPct: Math.round(bestScore * 100),
    matchedMode: useKanji ? "kanji" : "kana",
    diff: bestRes.diff,
  };
}

/** Reveal the next 2–3 characters of the sentence as a DailyDictation-style progressive hint. */
export function buildProgressiveHint(
  currentInput: string,
  targetKana: string
): string {
  const cleanTarget = Array.from(normalizeForCompare(targetKana, false));
  const cleanUser = Array.from(normalizeForCompare(currentInput, true));
  const targetFolded = Array.from(normalizeForCompare(targetKana, true));

  let matchLen = 0;
  while (
    matchLen < cleanUser.length &&
    matchLen < targetFolded.length &&
    cleanUser[matchLen] === targetFolded[matchLen]
  ) {
    matchLen++;
  }
  const revealCount = Math.min(cleanTarget.length, matchLen + 3);
  return cleanTarget.slice(0, revealCount).join("");
}

/** Build natural Japanese word/phrase tiles from jaRuby segments for mobile-friendly Tile Mode. */
export interface DictationTile {
  id: string;
  segments: RubySegment[];
  plain: string;
}

export function splitRubyIntoTiles(jaRuby: RubySegment[]): DictationTile[] {
  // Flatten into atomic tokens (each kanji ruby unit or single kana char)
  const atoms: RubySegment[] = [];
  for (const seg of jaRuby) {
    if (seg.r) {
      atoms.push(seg);
    } else {
      for (const ch of Array.from(seg.t)) {
        atoms.push({ t: ch });
      }
    }
  }

  const breakAfter = new Set([
    "、",
    "。",
    "！",
    "!",
    "？",
    "?",
    "」",
    "は",
    "が",
    "を",
    "に",
    "で",
    "へ",
    "と",
    "も",
    "の",
  ]);

  const rawGroups: RubySegment[][] = [];
  let buf: RubySegment[] = [];

  for (let i = 0; i < atoms.length; i++) {
    const cur = atoms[i];
    if (/^[。、！？!?「」…]$/.test(cur.t)) {
      if (buf.length > 0) {
        rawGroups.push(buf);
        buf = [];
      }
      continue;
    }
    buf.push(cur);
    const plainBufLen = buf.reduce((acc, s) => acc + s.t.length, 0);
    if (breakAfter.has(cur.t) && plainBufLen >= 2) {
      rawGroups.push(buf);
      buf = [];
    }
  }
  if (buf.length > 0) rawGroups.push(buf);

  // Merge overly tiny groups so we end up with 3..7 readable tiles
  const merged: RubySegment[][] = [];
  for (const grp of rawGroups) {
    const grpLen = grp.reduce((acc, s) => acc + s.t.length, 0);
    if (
      merged.length > 0 &&
      (grpLen <= 1 ||
        (merged.length >= 6 &&
          merged[merged.length - 1].reduce((a, s) => a + s.t.length, 0) <= 4))
    ) {
      merged[merged.length - 1] = [...merged[merged.length - 1], ...grp];
    } else {
      merged.push(grp);
    }
  }

  // If still too few tiles (e.g. short sentence), split cleanly into ~2-3 char tiles
  let finalGroups = merged;
  if (finalGroups.length === 1 && atoms.length >= 4) {
    finalGroups = [];
    let chunk: RubySegment[] = [];
    for (const at of atoms) {
      if (/^[。、！？!?「」…]$/.test(at.t)) continue;
      chunk.push(at);
      if (chunk.length >= 2) {
        finalGroups.push(chunk);
        chunk = [];
      }
    }
    if (chunk.length > 0) {
      if (finalGroups.length > 0 && chunk.length === 1) {
        finalGroups[finalGroups.length - 1].push(...chunk);
      } else {
        finalGroups.push(chunk);
      }
    }
  }

  return finalGroups.map((segs, idx) => ({
    id: `tile_${idx}`,
    segments: segs,
    plain: segs.map((s) => s.t).join(""),
  }));
}

/** Deterministic shuffle based on sentence ID so tiles never jump around on re-render. */
export function shuffleTiles<T>(items: T[], seedStr: string): T[] {
  const arr = [...items];
  let seed = 0;
  for (let i = 0; i < seedStr.length; i++) {
    seed = (seed * 31 + seedStr.charCodeAt(i)) >>> 0;
  }
  for (let i = arr.length - 1; i > 0; i--) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const j = seed % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  // Ensure order actually changed when length >= 2
  if (arr.length >= 2 && arr.every((v, idx) => v === items[idx])) {
    [arr[0], arr[1]] = [arr[1], arr[0]];
  }
  return arr;
}
