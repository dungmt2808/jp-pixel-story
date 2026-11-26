/**
 * Procedural 8-bit chiptune BGM + retro SFX powered purely by Web Audio API.
 * Zero external audio assets needed; supports automatic ducking while VOICEVOX speaks.
 */

class RetroAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private bgmGain: GainNode | null = null;
  private bgmTimer: number | null = null;
  private step = 0;
  private muted = false;
  private ducked = false;

  // Gentle nostalgic pentatonic midnight Tokyo melody (Hz)
  private readonly melody: (number | null)[] = [
    523.25, null, 659.25, 587.33, 523.25, null, 392.0, null,
    440.0, null, 523.25, 587.33, 659.25, null, null, null,
    587.33, null, 659.25, 783.99, 659.25, null, 523.25, null,
    440.0, null, 392.0, 440.0, 523.25, null, null, null,
  ];

  private readonly bass: (number | null)[] = [
    130.81, null, null, null, 196.0, null, null, null,
    174.61, null, null, null, 130.81, null, null, null,
    146.83, null, null, null, 196.0, null, null, null,
    174.61, null, 196.0, null, 130.81, null, null, null,
  ];

  private ensureContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : 0.7;
      this.masterGain.connect(this.ctx.destination);

      this.bgmGain = this.ctx.createGain();
      this.bgmGain.gain.value = 0.14;
      this.bgmGain.connect(this.masterGain);
    }
    if (this.ctx.state === "suspended") {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(
        muted ? 0 : 0.7,
        this.ctx.currentTime,
        0.04
      );
    }
  }

  public setDucked(ducked: boolean): void {
    this.ducked = ducked;
    if (this.bgmGain && this.ctx) {
      const target = ducked ? 0.045 : 0.14;
      this.bgmGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
    }
  }

  public startBgm(): void {
    const ctx = this.ensureContext();
    if (!ctx || this.bgmTimer !== null) return;

    this.bgmTimer = window.setInterval(() => {
      if (!this.ctx || !this.bgmGain || this.muted) return;
      const now = this.ctx.currentTime;
      const mFreq = this.melody[this.step % this.melody.length];
      const bFreq = this.bass[this.step % this.bass.length];
      this.step += 1;

      if (mFreq) {
        this.playTone(mFreq, 0.22, "square", 0.18, this.bgmGain, now);
      }
      if (bFreq) {
        this.playTone(bFreq, 0.36, "triangle", 0.35, this.bgmGain, now);
      }
    }, 290);
  }

  public stopBgm(): void {
    if (this.bgmTimer !== null) {
      window.clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
  }

  private playTone(
    freq: number,
    duration: number,
    type: OscillatorType,
    volume: number,
    dest: AudioNode,
    startTime?: number
  ): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t0 = startTime ?? ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);

    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(volume, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

    osc.connect(gain);
    gain.connect(dest);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  public playClick(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain || this.muted) return;
    this.playTone(680, 0.06, "square", 0.18, this.masterGain);
    this.playTone(920, 0.07, "square", 0.12, this.masterGain, ctx.currentTime + 0.04);
  }

  public playTransition(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain || this.muted) return;
    const now = ctx.currentTime;
    [330, 440, 587].forEach((f, i) => {
      this.playTone(f, 0.08, "triangle", 0.16, this.masterGain!, now + i * 0.045);
    });
  }

  public playFootstep(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain || this.muted) return;
    this.playTone(145, 0.045, "triangle", 0.16, this.masterGain);
  }

  public playBeepScan(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain || this.muted) return;
    const now = ctx.currentTime;
    // Authentic Japanese konbini barcode scanner "ピッ！"
    this.playTone(2150, 0.09, "square", 0.22, this.masterGain, now);
    this.playTone(2450, 0.06, "square", 0.12, this.masterGain, now + 0.09);
  }

  public playMicrowaveDing(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain || this.muted) return;
    const now = ctx.currentTime;
    // Crisp microwave "チン！" bell
    this.playTone(1568, 0.55, "sine", 0.28, this.masterGain, now);
    this.playTone(3136, 0.35, "sine", 0.12, this.masterGain, now);
  }

  public playFanfare(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain || this.muted) return;
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, idx) => {
      this.playTone(f, 0.22, "square", 0.18, this.masterGain!, now + idx * 0.09);
    });
  }

  /** Traditional wooden weaving loom rhythm: "トン…カラリ…" */
  public playLoomClack(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain || this.muted) return;
    const now = ctx.currentTime;
    // Deep wooden frame thud ("トン")
    this.playTone(155, 0.075, "triangle", 0.26, this.masterGain, now);
    this.playTone(230, 0.045, "sine", 0.16, this.masterGain, now + 0.01);
    // Crisp shuttle slide & clack ("カラリ")
    this.playTone(410, 0.05, "triangle", 0.14, this.masterGain, now + 0.22);
    this.playTone(320, 0.06, "triangle", 0.18, this.masterGain, now + 0.34);
    this.playTone(170, 0.07, "triangle", 0.22, this.masterGain, now + 0.44);
  }

  /** Gentle sliding paper fusuma door on wooden track */
  public playSlideDoor(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain || this.muted) return;
    const now = ctx.currentTime;
    const bufferSize = Math.floor(ctx.sampleRate * 0.42);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.28;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(520, now);
    filter.frequency.exponentialRampToValueAtTime(280, now + 0.4);
    filter.Q.value = 1.6;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.24, now + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.41);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    noise.start(now);
    noise.stop(now + 0.42);
  }

  /** Delicate Japanese pentatonic koto shimmer for magical story beats */
  public playKotoChime(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain || this.muted) return;
    const now = ctx.currentTime;
    // Japanese Hirajoshi / Yo pentatonic shimmer (D5, E5, G5, A5, D6)
    const notes = [587.33, 659.25, 783.99, 880.0, 1174.66];
    notes.forEach((f, idx) => {
      this.playTone(f, 0.36, "triangle", 0.16, this.masterGain!, now + idx * 0.085);
      this.playTone(f * 2, 0.18, "sine", 0.06, this.masterGain!, now + idx * 0.085);
    });
  }
}

export const retroAudio = new RetroAudioEngine();
