import type { RubySegment } from "../types/story";

const DIGRAPHS: Record<string, string> = {
  きゃ: "kya", きゅ: "kyu", きょ: "kyo",
  しゃ: "sha", しゅ: "shu", しょ: "sho",
  ちゃ: "cha", ちゅ: "chu", ちょ: "cho",
  にゃ: "nya", にゅ: "nyu", にょ: "nyo",
  ひゃ: "hya", ひゅ: "hyu", ひょ: "hyo",
  みゃ: "mya", みゅ: "myu", みょ: "myo",
  りゃ: "rya", りゅ: "ryu", りょ: "ryo",
  ぎゃ: "gya", ぎゅ: "gyu", ぎょ: "gyo",
  じゃ: "ja", じゅ: "ju", じょ: "jo",
  びゃ: "bya", びゅ: "byu", びょ: "byo",
  ぴゃ: "pya", ぴゅ: "pyu", ぴょ: "pyo",
  ふぁ: "fa", ふぃ: "fi", ふぇ: "fe", ふぉ: "fo",
  てぃ: "ti", でぃ: "di", ヴぁ: "va", ヴぃ: "vi", ヴぇ: "ve", ヴぉ: "vo",
};

const MONOGRAPHS: Record<string, string> = {
  あ: "a", い: "i", う: "u", え: "e", お: "o",
  か: "ka", き: "ki", く: "ku", け: "ke", こ: "ko",
  さ: "sa", し: "shi", す: "su", せ: "se", そ: "so",
  た: "ta", ち: "chi", つ: "tsu", て: "te", と: "to",
  な: "na", に: "ni", ぬ: "nu", ね: "ne", の: "no",
  は: "ha", ひ: "hi", ふ: "fu", へ: "he", ほ: "ho",
  ま: "ma", み: "mi", む: "mu", め: "me", も: "mo",
  や: "ya", ゆ: "yu", よ: "yo",
  ら: "ra", り: "ri", る: "ru", れ: "re", ろ: "ro",
  わ: "wa", を: "o", ん: "n",
  が: "ga", ぎ: "gi", ぐ: "gu", げ: "ge", ご: "go",
  ざ: "za", じ: "ji", ず: "zu", ぜ: "ze", ぞ: "zo",
  だ: "da", ぢ: "ji", づ: "zu", で: "de", ど: "do",
  ば: "ba", び: "bi", ぶ: "bu", べ: "be", ぼ: "bo",
  ぱ: "pa", ぴ: "pi", ぷ: "pu", ぺ: "pe", ぽ: "po",
  ぁ: "a", ぃ: "i", ぅ: "u", ぇ: "e", ぉ: "o",
  ゃ: "ya", ゅ: "yu", ょ: "yo",
  "。": ". ", "、": ", ", "「": " “", "」": "” ", "！": "! ", "？": "? ", "・": " · ", "…": "...",
};

function toHiragana(input: string): string {
  let out = "";
  for (const ch of input) {
    const code = ch.charCodeAt(0);
    if (code >= 0x30a1 && code <= 0x30f6) {
      out += String.fromCharCode(code - 0x60);
    } else {
      out += ch;
    }
  }
  return out;
}

export function kanaToRomaji(raw: string): string {
  const s = toHiragana(raw);
  let out = "";
  let i = 0;

  while (i < s.length) {
    const ch = s[i];

    // Small tsu doubles the following consonant
    if (ch === "っ" && i + 1 < s.length) {
      const nextPair = s.slice(i + 1, i + 3);
      const nextRom = DIGRAPHS[nextPair] || MONOGRAPHS[s[i + 1]] || "";
      if (nextRom && /^[bcdfghjklmnpqrstvwxyz]/.test(nextRom)) {
        out += nextRom.startsWith("ch") ? "t" : nextRom[0];
        i += 1;
        continue;
      }
    }

    // Long vowel mark (ー)
    if (ch === "ー" && out.length > 0) {
      const last = out[out.length - 1];
      if ("aeiou".includes(last)) {
        out += last;
      }
      i += 1;
      continue;
    }

    const pair = s.slice(i, i + 2);
    if (DIGRAPHS[pair]) {
      out += DIGRAPHS[pair];
      i += 2;
      continue;
    }

    if (MONOGRAPHS[ch] !== undefined) {
      out += MONOGRAPHS[ch];
      i += 1;
      continue;
    }

    out += ch;
    i += 1;
  }

  return out.replace(/\s+/g, " ").trim();
}

export function rubySegmentsToRomaji(segments: RubySegment[]): string {
  const kana = segments.map((seg) => seg.r ?? seg.t).join("");
  return kanaToRomaji(kana);
}
