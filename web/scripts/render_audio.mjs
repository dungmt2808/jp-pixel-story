#!/usr/bin/env node
/** Render the shared sound effects to web/public/audio/sfx/<name>.wav (run after editing the synth). */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { encodeWav, loadThemes, renderSfx, sfxNames } from "./audio_synth.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "public", "audio", "sfx");
fs.mkdirSync(outDir, { recursive: true });

const T = await loadThemes();
const declared = [...T.SFX_NAMES].sort();
const synthesized = sfxNames().sort();
if (JSON.stringify(declared) !== JSON.stringify(synthesized)) {
  throw new Error(`SFX_NAMES (${declared}) and the synth (${synthesized}) disagree`);
}
for (const name of synthesized) {
  const wav = encodeWav(renderSfx(name));
  fs.writeFileSync(path.join(outDir, `${name}.wav`), wav);
  console.log(`  ${name}.wav  ${(wav.length / 1024).toFixed(1)} KB`);
}
