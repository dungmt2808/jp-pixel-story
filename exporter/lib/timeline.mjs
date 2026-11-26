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
    if (ev.type !== "voice" || !ev.audioUrl) continue;
    if (typeof ev.perfMs !== "number") {
      throw new Error("voice event without perfMs: the stage is not on the shared runtime");
    }
    const file = resolveFile(ev.audioUrl);
    if (!file) {
      missing.push(ev.audioUrl);
      continue;
    }
    clips.push({
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
export function findOverlaps(clips, toleranceMs = 60) {
  const overlaps = [];
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

/** FFmpeg args that place every clip at its offset and pad/trim the mix to the video length. */
export function buildMuxArgs(videoPath, clips, outPath) {
  const args = ["-y", "-v", "error", "-i", videoPath];
  for (const c of clips) args.push("-i", c.file);
  if (clips.length === 0) {
    return [...args, "-c:v", "copy", "-an", outPath];
  }
  const parts = clips.map(
    (c, i) => `[${i + 1}:a]aresample=44100,aformat=channel_layouts=stereo,adelay=${c.offsetMs}|${c.offsetMs}[a${i}]`
  );
  const inputs = clips.map((_, i) => `[a${i}]`).join("");
  parts.push(`${inputs}amix=inputs=${clips.length}:normalize=0:dropout_transition=0,apad[aout]`);
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
