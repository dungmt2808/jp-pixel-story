/**
 * Zero-dependency frontend unit tests for ruby.ts & dictation.ts.
 * Uses esbuild (already bundled by Vite) to transpile TS in memory and Node's built-in assert.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, "..");

async function loadTsModule(relPath) {
  const res = await build({
    entryPoints: [path.join(webRoot, relPath)],
    bundle: true,
    format: "esm",
    platform: "node",
    write: false,
  });
  const code = res.outputFiles[0].text;
  const dataUrl = `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
  return import(dataUrl);
}

const ruby = await loadTsModule("src/utils/ruby.ts");
const dict = await loadTsModule("src/utils/dictation.ts");
const rd = await loadTsModule("src/utils/readingText.ts");

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

console.log("Running jp-pixel-story frontend unit tests...");

test("parseRuby parses compact {漢字|かんじ} strings accurately", () => {
  const segs = ruby.parseRuby("{今日|きょう}は{雨|あめ}です。");
  assert.deepEqual(segs, [
    { t: "今日", r: "きょう" },
    { t: "は" },
    { t: "雨", r: "あめ" },
    { t: "です。" },
  ]);
});

test("parseRuby passes through legacy RubySegment[] unchanged", () => {
  const legacy = [{ t: "日本", r: "にほん" }, { t: "の" }];
  assert.deepEqual(ruby.parseRuby(legacy), legacy);
});

test("rubyToPlain & rubyToKana extract exact plain Kanji and Hiragana", () => {
  const input = "{前山|まえやま}ガラス{美術館|びじゅつかん}";
  assert.equal(ruby.rubyToPlain(input), "前山ガラス美術館");
  assert.equal(ruby.rubyToKana(input), "まえやまガラスびじゅつかん");
});

test("gradeJapaneseDictation accepts exact Kanji match with punctuation ignored", () => {
  const res = dict.gradeJapaneseDictation(
    "今日は雨です",
    "今日は、雨です。",
    "きょうは、あめです。"
  );
  assert.equal(res.exactMatch, true);
  assert.equal(res.accuracyPct, 100);
  assert.equal(res.matchedMode, "kanji");
});

test("gradeJapaneseDictation accepts pure Hiragana & Katakana equivalence", () => {
  const res = dict.gradeJapaneseDictation(
    "きょうはあめです",
    "今日は雨です。",
    "きょうはあめです。"
  );
  assert.equal(res.exactMatch, true);
  assert.equal(res.accuracyPct, 100);
  assert.equal(res.matchedMode, "kana");
});

test("gradeJapaneseDictation flags typos and returns <100% accuracy", () => {
  const res = dict.gradeJapaneseDictation(
    "きょうはゆきです",
    "今日は雨です。",
    "きょうはあめです。"
  );
  assert.equal(res.exactMatch, false);
  assert.ok(res.accuracyPct > 50 && res.accuracyPct < 100);
  assert.ok(res.diff.some((d) => d.status === "wrong" || d.status === "missing"));
});

test("gradeJapaneseDictation handles empty input safely", () => {
  const res = dict.gradeJapaneseDictation("   ", "雨です。", "あめです。");
  assert.equal(res.exactMatch, false);
  assert.equal(res.accuracyPct, 0);
});

test("buildProgressiveHint reveals next 3 kana characters incrementally", () => {
  assert.equal(dict.buildProgressiveHint("", "きょうはあめです。"), "きょう");
  assert.equal(dict.buildProgressiveHint("きょう", "きょうはあめです。"), "きょうはあめ");
});

test("splitRubyIntoTiles + shuffleTiles produces deterministic non-trivial phrase tiles", () => {
  const tiles = dict.splitRubyIntoTiles(
    "{先週|せんしゅう}、さくらデパートへ{買|か}い{物|もの}に{行|い}きました。"
  );
  assert.ok(tiles.length >= 3 && tiles.length <= 7);
  const rejoined = tiles.map((t) => t.plain).join("");
  assert.equal(rejoined, "先週さくらデパートへ買い物に行きました");

  const s1 = dict.shuffleTiles(tiles, "sent_01");
  const s2 = dict.shuffleTiles(tiles, "sent_01");
  assert.deepEqual(
    s1.map((t) => t.id),
    s2.map((t) => t.id)
  );
});


const plainOf = (chunk) => chunk.segs.map((s) => s.t).join("");

test("chunkByVocab wraps vocab words and keeps ruby groups whole", () => {
  const vocab = [
    { id: "hanami", word: "お花見" },
    { id: "rainen", word: "来年" },
  ];
  const chunks = rd.chunkByVocab("{来年|らいねん}もお{花見|はなみ}をしたい。", vocab);
  assert.deepEqual(
    chunks.map((c) => [plainOf(c), c.vocabId ?? null]),
    [["来年", "rainen"], ["も", null], ["お花見", "hanami"], ["をしたい。", null]]
  );
  // furigana of the wrapped kanji group survives
  assert.deepEqual(chunks[2].segs, [{ t: "お" }, { t: "花見", r: "はなみ" }]);
  // every character is kept, in order
  assert.equal(chunks.map(plainOf).join(""), "来年もお花見をしたい。");
});

test("chunkByVocab widens a match that cuts a ruby group and prefers the longest spelling", () => {
  // 弁 alone would cut {弁当|べんとう}; the chunk must contain the whole group
  const chunks = rd.chunkByVocab("お{弁当|べんとう}です", [{ id: "ben", word: "弁" }]);
  assert.deepEqual(chunks.map((c) => [plainOf(c), c.vocabId ?? null]), [["お", null], ["弁当", "ben"], ["です", null]]);
  const longest = rd.chunkByVocab("{和食|わしょく}を", [
    { id: "wa", word: "和" },
    { id: "washoku", word: "和食" },
  ]);
  assert.equal(longest[0].vocabId, "washoku");
});

test("vocabNeedles strips notes and tails, adds explicit forms", () => {
  assert.deepEqual(rd.vocabNeedles({ id: "f", word: "風呂 (お湯)" }), ["風呂"]);
  assert.deepEqual(rd.vocabNeedles({ id: "n", word: "なかなか〜ない" }), ["なかなか"]);
  assert.deepEqual(rd.vocabNeedles({ id: "c", word: "違う", forms: ["違って"] }), ["違って", "違う"]);
  const chunks = rd.chunkByVocab("{生活|せいかつ}と{違|ちが}って", [{ id: "c", word: "違う", forms: ["違って"] }]);
  assert.equal(chunks.find((c) => c.vocabId === "c") && plainOf(chunks.find((c) => c.vocabId === "c")), "違って");
});

test("readingChapters falls back to one chapter; chapterImage resolves the scene backdrop", () => {
  const story = {
    scenes: [
      { id: "s1", backdrop: "proc:airport_train" },
      { id: "s2", backdrop: "bg:park" },
    ],
    assets: { backgrounds: { park: "/bg/park.png" }, portraits: {} },
    reading: { sectionTitle: "T", sentences: [{ id: "a" }, { id: "b" }], vocab: [] },
  };
  const [only] = rd.readingChapters(story);
  assert.deepEqual(only.sentenceIds, ["a", "b"]);
  assert.equal(rd.chapterImage(only, story), "/bg/park.png");
  assert.equal(rd.chapterImage({ id: "x", title: "", sentenceIds: [], scene: "s1" }, story), undefined);
  // declared chapters drop unknown sentence ids and empty chapters
  story.reading.chapters = [
    { id: "c1", title: "一", sentenceIds: ["a", "zzz"] },
    { id: "c2", title: "二", sentenceIds: ["nope"] },
  ];
  assert.deepEqual(rd.readingChapters(story).map((c) => [c.id, c.sentenceIds]), [["c1", ["a"]]]);
  assert.equal(rd.sceneIndex(story, "s2"), 1);
  assert.equal(rd.sceneIndex(story, undefined), -1);
});

test("quizScore counts only the first answer of each question", () => {
  const quiz = [{ id: "q1", correctIndex: 1 }, { id: "q2", correctIndex: 0 }, { id: "q3", correctIndex: 2 }];
  assert.deepEqual(rd.quizScore({ q1: 1, q2: 2 }, quiz), { correct: 1, answered: 2, total: 3 });
});

console.log(`\nALL ${passed} FRONTEND TESTS PASSED!`);
