/**
 * Single source of the chiptune BGM themes and sound-effect names.
 * Used live by `chiptune.ts` (Web Audio) AND offline by `web/scripts/audio_synth.mjs`
 * (the MP4 exporter renders the same notes to WAV), so videos sound like the web player.
 */

export interface BgmTheme {
  melody: (number | null)[];
  bass: (number | null)[];
  wave: "square" | "triangle" | "sine";
  leadVol: number;
}

/** One note step (ms); lead notes ring 0.26 s, bass notes 0.38 s. */
export const BGM_STEP_MS = 280;
export const BGM_LEAD_SEC = 0.26;
export const BGM_BASS_SEC = 0.38;
export const BGM_BASS_VOL = 0.32;

export const BGM_THEMES: Record<string, BgmTheme> = {
  // gentle nostalgic pentatonic midnight-Tokyo melody
  default: {
    melody: [
      523.25, null, 659.25, 587.33, 523.25, null, 392.0, null,
      440.0, null, 523.25, 587.33, 659.25, null, null, null,
      587.33, null, 659.25, 783.99, 659.25, null, 523.25, null,
      440.0, null, 392.0, 440.0, 523.25, null, null, null,
    ],
    bass: [
      130.81, null, null, null, 196.0, null, null, null,
      174.61, null, null, null, 130.81, null, null, null,
      146.83, null, null, null, 196.0, null, null, null,
      174.61, null, 196.0, null, 130.81, null, null, null,
    ],
    wave: "square",
    leadVol: 0.2,
  },
  // bright department-store waltz chime
  depato_sunny: {
    melody: [
      698.46, null, 880.0, 1046.5, 880.0, null, 783.99, null,
      698.46, 783.99, 880.0, null, 659.25, null, null, null,
      587.33, null, 698.46, 880.0, 783.99, null, 698.46, null,
      659.25, 783.99, 1046.5, null, 698.46, null, null, null,
    ],
    bass: [
      174.61, null, null, null, 261.63, null, null, null,
      233.08, null, null, null, 261.63, null, null, null,
      146.83, null, null, null, 220.0, null, null, null,
      196.0, null, 261.63, null, 174.61, null, null, null,
    ],
    wave: "triangle",
    leadVol: 0.2,
  },
  // soft melancholic raindrop motif
  depato_rain: {
    melody: [
      659.25, null, 587.33, null, 523.25, null, 493.88, null,
      440.0, null, 523.25, null, 659.25, null, null, null,
      587.33, null, 523.25, null, 493.88, null, 440.0, null,
      392.0, null, 440.0, 493.88, 440.0, null, null, null,
    ],
    bass: [
      110.0, null, null, null, 164.81, null, null, null,
      130.81, null, null, null, 164.81, null, null, null,
      146.83, null, null, null, 196.0, null, null, null,
      130.81, null, 164.81, null, 110.0, null, null, null,
    ],
    wave: "sine",
    leadVol: 0.24,
  },
};

/** Mood names writers use in story.json -> the theme that plays. */
const BGM_ALIASES: Record<string, string> = {
  calm: "default",
  night: "default",
  happy: "depato_sunny",
  bright: "depato_sunny",
  sad: "depato_rain",
  tender: "depato_rain",
  rain: "depato_rain",
};

/** `"none"` (silence) or a known theme; unknown names fall back to "default". */
export function resolveBgmTheme(name: string | undefined): string {
  if (name === "none") return "none";
  const key = name ? BGM_ALIASES[name] ?? name : "default";
  return BGM_THEMES[key] ? key : "default";
}

/** Sound effects rendered to `/audio/sfx/<name>.wav` by `npm run render:audio`. */
export const SFX_NAMES = ["pop", "ding", "whoosh", "boing", "shock", "sparkle", "thud", "gloom", "heart"] as const;
export type SfxName = (typeof SFX_NAMES)[number];

export function sfxUrl(name: string): string | null {
  return (SFX_NAMES as readonly string[]).includes(name) ? `/audio/sfx/${name}.wav` : null;
}
