/**
 * Pure helpers of the deterministic MP4 exporter (unit-tested in exporter/tests).
 *
 * Every stage logs `{ type: "voice", perfMs, audioUrl, durationSec }` events on the SAME virtual
 * clock that drives the captured frames, so `perfMs - t0` is exactly the video timestamp of a line.
 */

/** Integer milliseconds to advance for frame `i` so rounding never drifts (33,33,34,33,...). */
export function frameStepMs(i, fps) {
  return Math.round(((i + 1) * 1000) / fps) - Math.round((i * 1000) / fps);
}

/**
 * Turn story events into audio clips placed on the video timeline.
 * @param {Array<{type:string, perfMs?:number, timeMs?:number, audioUrl?:string, durationSec?:number, lineId?:string}>} events
 * @param {number} t0 virtual `performance.now()` of video frame 0
 * @param {(audioUrl:string)=>string|null} resolveFile maps an audioUrl to a local file (or null)
 */
export function buildAudioPlan(events, t0, resolveFile) {
  const clips = [];
  const missing = [];
  for (const ev of events) {
    if ((ev.type !== "voice" && ev.type !== "sfx") || !ev.audioUrl) continue;
    if (typeof ev.perfMs !== "number") {
      throw new Error(`${ev.type} event without perfMs: the stage is not on the shared runtime`);
    }
    const file = resolveFile(ev.audioUrl);
    if (!file) {
      missing.push(ev.audioUrl);
      continue;
    }
    clips.push({
      kind: ev.type,
      lineId: ev.lineId ?? null,
      audioUrl: ev.audioUrl,
      file,
      offsetMs: Math.max(0, Math.round(ev.perfMs - t0)),
      durationMs: Math.round((ev.durationSec ?? 0) * 1000),
    });
  }
  clips.sort((a, b) => a.offsetMs - b.offsetMs);
  return { clips, missing };
}

/**
 * Lines must never talk over each other: the old real-time recorder advanced scenes after a
 * fixed 2 s when autoplay was blocked, so 9-15 s clips were mixed on top of each other.
 * Returns the overlapping pairs (allowing `toleranceMs` for MP3 padding).
 */
export function findOverlaps(allClips, toleranceMs = 60) {
  const overlaps = [];
  // sound effects may ring under a voice on purpose; only voices must never overlap
  const clips = allClips.filter((c) => (c.kind ?? "voice") === "voice");
  for (let i = 0; i + 1 < clips.length; i++) {
    const a = clips[i];
    const b = clips[i + 1];
    const endA = a.offsetMs + a.durationMs;
    if (a.durationMs > 0 && b.offsetMs + toleranceMs < endA) {
      overlaps.push({ a: a.lineId ?? a.audioUrl, b: b.lineId ?? b.audioUrl, overlapMs: endA - b.offsetMs });
    }
  }
  return overlaps;
}

/**
 * BGM segments from "bgm" events: each theme plays from its event until the next one (or the
 * end of the video). `"none"` segments are dropped.
 * @returns {Array<{theme:string, offsetMs:number, durationMs:number}>}
 */
export function buildBgmPlan(events, t0, totalMs) {
  const marks = events
    .filter((ev) => ev.type === "bgm" && ev.theme && typeof ev.perfMs === "number")
    .map((ev) => ({ theme: ev.theme, offsetMs: Math.max(0, Math.round(ev.perfMs - t0)) }))
    .sort((a, b) => a.offsetMs - b.offsetMs);
  const segs = [];
  marks.forEach((m, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].offsetMs : totalMs;
    if (m.theme !== "none" && end - m.offsetMs > 50) segs.push({ ...m, durationMs: end - m.offsetMs });
  });
  return segs;
}

/**
 * FFmpeg args that place every clip at its offset and pad/trim the mix to the video length.
 * Optional `bgm` segments ({file, offsetMs, durationMs}, already rendered to the exact length)
 * are faded at their edges, lowered and side-chain ducked under the voices.
 */
export function buildMuxArgs(videoPath, clips, outPath, bgm = [], { bgmVolume = 0.32 } = {}) {
  const args = ["-y", "-v", "error", "-i", videoPath];
  for (const c of clips) args.push("-i", c.file);
  for (const b of bgm) args.push("-i", b.file);
  if (clips.length === 0 && bgm.length === 0) {
    return [...args, "-c:v", "copy", "-an", outPath];
  }
  const fmt = "aresample=44100,aformat=channel_layouts=stereo";
  const parts = clips.map((c, i) => `[${i + 1}:a]${fmt},adelay=${c.offsetMs}|${c.offsetMs}[a${i}]`);
  bgm.forEach((b, j) => {
    const fadeOut = Math.max(0, b.durationMs / 1000 - 0.4).toFixed(3);
    parts.push(
      `[${clips.length + j + 1}:a]${fmt},afade=t=in:d=0.4,afade=t=out:st=${fadeOut}:d=0.4,adelay=${b.offsetMs}|${b.offsetMs}[b${j}]`
    );
  });
  const fgInputs = clips.map((_, i) => `[a${i}]`).join("");
  const bgInputs = bgm.map((_, j) => `[b${j}]`).join("");
  if (bgm.length === 0) {
    parts.push(`${fgInputs}amix=inputs=${clips.length}:normalize=0:dropout_transition=0,apad[aout]`);
  } else if (clips.length === 0) {
    parts.push(`${bgInputs}amix=inputs=${bgm.length}:normalize=0:dropout_transition=0,volume=${bgmVolume},apad[aout]`);
  } else {
    parts.push(`${fgInputs}amix=inputs=${clips.length}:normalize=0:dropout_transition=0,apad,asplit=2[fg][sc]`);
    parts.push(`${bgInputs}amix=inputs=${bgm.length}:normalize=0:dropout_transition=0,volume=${bgmVolume}[bgraw]`);
    parts.push(`[bgraw][sc]sidechaincompress=threshold=0.02:ratio=6:attack=20:release=400[bgd]`);
    parts.push(`[fg][bgd]amix=inputs=2:normalize=0:dropout_transition=0:duration=first[aout]`);
  }
  return [
    ...args,
    "-filter_complex",
    parts.join(";"),
    "-map",
    "0:v:0",
    "-map",
    "[aout]",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-shortest",
    outPath,
  ];
}

export function parseArgs(argv) {
  const args = {
    story: "konbini-onigiri",
    url: "",
    out: "",
    fps: 30,
    width: 960,
    maxSec: 600,
    tailSec: 1.2,
    check: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === "--story") args.story = next();
    else if (a === "--url") args.url = next();
    else if (a === "--out") args.out = next();
    else if (a === "--fps") args.fps = Number(next());
    else if (a === "--width") args.width = Number(next());
    else if (a === "--max-sec" || a === "--timeout") args.maxSec = Number(next());
    else if (a === "--tail") args.tailSec = Number(next());
    else if (a === "--check") args.check = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  if (!(args.fps > 0 && args.fps <= 60)) throw new Error("--fps must be in 1..60");
  if (!(args.width >= 320)) throw new Error("--width must be >= 320");
  return args;
}
