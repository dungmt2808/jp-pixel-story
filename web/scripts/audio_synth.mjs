/**
 * Offline chiptune synth (Node, no dependencies besides esbuild for the shared TS tables).
 *
 *  - `renderBgm(theme, seconds)`  -> Float32Array of the same notes `chiptune.ts` plays live
 *  - `renderSfx(name)`           -> Float32Array of one sound effect
 *  - `encodeWav(samples)`        -> 16-bit mono WAV bytes
 *
 * Used by `npm run render:audio` (writes web/public/audio/sfx/*.wav) and by the MP4 exporter,
 * which renders BGM segments of the exact length it needs (no loop seams).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

export const SAMPLE_RATE = 22050;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

let themesModule = null;
export async function loadThemes() {
  if (themesModule) return themesModule;
  const res = await build({
    entryPoints: [path.join(__dirname, "..", "src", "audio", "themes.ts")],
    bundle: true,
    format: "esm",
    platform: "node",
    write: false,
  });
  themesModule = await import(`data:text/javascript;base64,${Buffer.from(res.outputFiles[0].text).toString("base64")}`);
  return themesModule;
}

function osc(type, phase) {
  const p = phase - Math.floor(phase);
  switch (type) {
    case "square":
      return p < 0.5 ? 1 : -1;
    case "triangle":
      return 1 - 4 * Math.abs(p - 0.5);
    case "saw":
      return 2 * p - 1;
    default:
      return Math.sin(2 * Math.PI * p);
  }
}

/**
 * Add one tone like `RetroAudioEngine.playTone`: 12 ms linear attack, exponential decay to
 * silence at `dur`. `freqEnd` makes a glide. Writes modulo `wrap` when given (seamless loops).
 */
export function addTone(buf, { at, freq, freqEnd, dur, type = "square", vol = 0.2 }, wrap = 0) {
  const start = Math.round(at * SAMPLE_RATE);
  const n = Math.round(dur * SAMPLE_RATE);
  const attack = Math.max(1, Math.round(0.012 * SAMPLE_RATE));
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const u = i / n;
    const f = freqEnd ? freq * Math.pow(freqEnd / freq, u) : freq;
    phase += f / SAMPLE_RATE;
    const env = i < attack ? i / attack : Math.pow(0.0001, (i - attack) / Math.max(1, n - attack));
    let idx = start + i;
    if (wrap) idx %= wrap;
    if (idx >= 0 && idx < buf.length) buf[idx] += osc(type, phase) * vol * env;
  }
}

/** Deterministic white-noise burst through a sweeping one-pole low-pass ("whoosh", "thud"). */
export function addNoise(buf, { at, dur, vol = 0.3, cutoffStart = 0.05, cutoffEnd = 0.4, seed = 7 }) {
  const start = Math.round(at * SAMPLE_RATE);
  const n = Math.round(dur * SAMPLE_RATE);
  let s = seed >>> 0;
  let y = 0;
  for (let i = 0; i < n; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const white = (s / 0xffffffff) * 2 - 1;
    const u = i / n;
    const a = cutoffStart + (cutoffEnd - cutoffStart) * Math.sin(Math.PI * u);
    y += a * (white - y);
    const env = Math.sin(Math.PI * u);
    const idx = start + i;
    if (idx < buf.length) buf[idx] += y * vol * env * 2.2;
  }
}

/** BGM of exactly `seconds` (theme name or mood alias), same notes and timing as the live player. */
export async function renderBgm(themeName, seconds) {
  const T = await loadThemes();
  const key = T.resolveBgmTheme(themeName);
  const buf = new Float32Array(Math.max(1, Math.round(seconds * SAMPLE_RATE)));
  if (key === "none") return buf;
  const th = T.BGM_THEMES[key];
  const stepSec = T.BGM_STEP_MS / 1000;
  const steps = Math.ceil(seconds / stepSec);
  for (let k = 0; k < steps; k++) {
    const at = k * stepSec;
    const m = th.melody[k % th.melody.length];
    const b = th.bass[k % th.bass.length];
    if (m) addTone(buf, { at, freq: m, dur: T.BGM_LEAD_SEC, type: th.wave, vol: th.leadVol });
    if (b) addTone(buf, { at, freq: b, dur: T.BGM_BASS_SEC, type: "triangle", vol: T.BGM_BASS_VOL });
  }
  return buf;
}

const SFX = {
  pop: (b) => addTone(b, { at: 0, freq: 660, freqEnd: 1320, dur: 0.09, type: "square", vol: 0.22 }),
  ding: (b) => {
    addTone(b, { at: 0, freq: 1318.5, dur: 0.7, type: "sine", vol: 0.32 });
    addTone(b, { at: 0, freq: 2637, dur: 0.35, type: "sine", vol: 0.08 });
  },
  whoosh: (b) => addNoise(b, { at: 0, dur: 0.38, vol: 0.32, cutoffStart: 0.02, cutoffEnd: 0.35 }),
  boing: (b) => addTone(b, { at: 0, freq: 180, freqEnd: 520, dur: 0.32, type: "triangle", vol: 0.34 }),
  shock: (b) => {
    addTone(b, { at: 0, freq: 659.25, dur: 0.1, type: "square", vol: 0.2 });
    addTone(b, { at: 0.08, freq: 987.77, dur: 0.22, type: "square", vol: 0.2 });
  },
  sparkle: (b) => {
    [1567.98, 2093.0, 2637.02, 3135.96].forEach((f, i) => addTone(b, { at: i * 0.06, freq: f, dur: 0.16, type: "sine", vol: 0.18 }));
  },
  thud: (b) => {
    addTone(b, { at: 0, freq: 120, freqEnd: 50, dur: 0.24, type: "sine", vol: 0.55 });
    addNoise(b, { at: 0, dur: 0.08, vol: 0.25, cutoffStart: 0.1, cutoffEnd: 0.2, seed: 3 });
  },
  gloom: (b) => {
    [392.0, 369.99, 349.23, 293.66].forEach((f, i) =>
      addTone(b, { at: i * 0.17, freq: f, freqEnd: i === 3 ? 260 : undefined, dur: i === 3 ? 0.5 : 0.18, type: "triangle", vol: 0.3 })
    );
  },
  heart: (b) => {
    addTone(b, { at: 0, freq: 659.25, dur: 0.16, type: "sine", vol: 0.28 });
    addTone(b, { at: 0.14, freq: 880.0, dur: 0.28, type: "sine", vol: 0.28 });
  },
};

export function sfxNames() {
  return Object.keys(SFX);
}

export function renderSfx(name) {
  const make = SFX[name];
  if (!make) throw new Error(`unknown sfx "${name}"`);
  const buf = new Float32Array(Math.round(0.9 * SAMPLE_RATE));
  make(buf);
  // trim trailing silence
  let end = buf.length;
  while (end > 1 && Math.abs(buf[end - 1]) < 1e-4) end--;
  return buf.subarray(0, Math.min(buf.length, end + Math.round(0.02 * SAMPLE_RATE)));
}

export function encodeWav(samples, sampleRate = SAMPLE_RATE) {
  const n = samples.length;
  const out = Buffer.alloc(44 + n * 2);
  out.write("RIFF", 0);
  out.writeUInt32LE(36 + n * 2, 4);
  out.write("WAVE", 8);
  out.write("fmt ", 12);
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20); // PCM
  out.writeUInt16LE(1, 22); // mono
  out.writeUInt32LE(sampleRate, 24);
  out.writeUInt32LE(sampleRate * 2, 28);
  out.writeUInt16LE(2, 32);
  out.writeUInt16LE(16, 34);
  out.write("data", 36);
  out.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    out.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  return out;
}
