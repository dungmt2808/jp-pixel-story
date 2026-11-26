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

console.log(`\nALL ${passed} FRONTEND TESTS PASSED!`);
