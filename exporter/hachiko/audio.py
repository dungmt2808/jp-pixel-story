"""Tổng hợp nhạc nền 8-bit + hiệu ứng âm thanh từ nhật ký sự kiện (events.json)."""
import json, sys
import numpy as np
import wave

SR = 44100
data = json.load(open(sys.argv[1]))
dur = data["duration"] + 0.5
out = np.zeros(int(SR * dur))
rng = np.random.default_rng(1)


def env(n, d):
    t = np.arange(n) / SR
    return np.exp(-t / max(d, 1e-3) * 5)


def osc(f, d, kind="square", slide=0.0):
    n = int(SR * d)
    t = np.arange(n) / SR
    freq = f * (1 + (slide - 1) * t / d) if slide else np.full(n, f)
    ph = 2 * np.pi * np.cumsum(freq) / SR
    if kind == "square":
        w = np.sign(np.sin(ph))
    elif kind == "triangle":
        w = 2 / np.pi * np.arcsin(np.sin(ph))
    elif kind == "saw":
        w = 2 * ((ph / (2 * np.pi)) % 1) - 1
    else:
        w = np.sin(ph)
    return w


def lowpass(x, cutoff):
    from scipy.signal import lfilter
    a = np.exp(-2 * np.pi * cutoff / SR)
    return lfilter([1 - a], [1, -a], x)


def noise(d, lp):
    n = int(SR * d)
    return lowpass(rng.uniform(-1, 1, n), lp)


def add(t, sig, vol, d):
    i = int(t * SR)
    sig = sig * env(len(sig), d) * vol
    j = min(len(out), i + len(sig))
    if i < len(out):
        out[i:j] += sig[: j - i]


def tone(t, f, d, kind="square", vol=.08, slide=0):
    add(t, osc(f, d, kind, slide), vol, d)


def nz(t, d, vol, lp):
    add(t, noise(d, lp), vol, d)


SFX = {
    "click": lambda t: tone(t, 900, .05, "square", .04),
    "pop": lambda t: (tone(t, 520, .08, "square", .05), tone(t + .07, 780, .12, "square", .05)),
    "whoosh": lambda t: nz(t, .45, .10, 1400),
    "stamp": lambda t: (nz(t, .15, .35, 700), tone(t, 85, .25, "sine", .45, .5)),
    "scribble": lambda t: [nz(t + i * .14, .05, .08, 3500) for i in range(9)],
    "crash": lambda t: (nz(t, 1.3, .40, 1600), tone(t, 180, .9, "saw", .10, .25)),
    "thud": lambda t: (tone(t, 110, .28, "sine", .45, .5), nz(t, .12, .16, 500)),
    "chime": lambda t: (tone(t, 660, .18, "triangle", .14), tone(t + .1, 990, .3, "triangle", .14)),
    "buzz": lambda t: (tone(t, 120, .25, "square", .07), tone(t + .12, 100, .3, "square", .07)),
    "tear": lambda t: nz(t, .4, .30, 4500),
    "boom": lambda t: (nz(t, 1.8, .55, 380), tone(t, 55, 1.4, "sine", .55, .4)),
    "step": lambda t: tone(t, 240, .05, "square", .03),
    "plane": lambda t: (tone(t, 95, 2.4, "saw", .05, 1.3), nz(t, 2.4, .07, 600)),
    "bark": lambda t: (tone(t, 640, .07, "square", .06, .7), tone(t + .13, 580, .09, "square", .06, .7)),
    "heart": lambda t: (tone(t, 784, .12, "triangle", .10), tone(t + .1, 1047, .2, "triangle", .10)),
    "train": lambda t: (tone(t, 70, 3.5, "saw", .04, 1.2), nz(t, 3.5, .07, 500), tone(t + 1.8, 1320, .5, "triangle", .06), tone(t + 2.1, 1100, .7, "triangle", .06)),
    "rain": lambda t: nz(t, 5, .07, 2500),
    "clap": lambda t: [nz(t + i * .09, .06, .12, 3000) for i in range(14)],
    "win": lambda t: [tone(t + i * .11, f, .22, "square", .05) for i, f in enumerate([523, 659, 784, 1047])],
}
for t, name in data["events"]:
    if name in SFX:
        SFX[name](t)

# nhạc nền: C – Am – F – G, 76 bpm (giống bản chạy trên web)
CH = [[130.81, [261.63, 329.63, 392]], [110, [220, 261.63, 329.63]], [87.31, [174.61, 220, 261.63]], [98, [196, 246.94, 293.66]]]
step = 60 / 76 / 2
music = np.zeros_like(out)
pat = [0, 1, 2, 1, 0, 1, 2, 1]
k = 0
while k * step < dur - 1:
    t = k * step
    bass, ch = CH[(k // 8) % 4]
    i = int(t * SR)
    if k % 4 == 0:
        s = osc(bass, step * 3.5, "triangle") * env(int(SR * step * 3.5), step * 3.5) * .10
        j = min(len(music), i + len(s)); music[i:j] += s[: j - i]
    s = osc(ch[pat[k % 8]] * 2, step * .9, "square") * env(int(SR * step * .9), step * .9) * .03
    j = min(len(music), i + len(s)); music[i:j] += s[: j - i]
    k += 1
fade = np.ones_like(music)
fl = int(SR * 2.5)
fade[-fl:] = np.linspace(1, 0, fl)
fade[: int(SR * 1.5)] = np.linspace(0, 1, int(SR * 1.5))
mix = out + lowpass(music, 3500) * fade
mix = np.tanh(mix * 2.6) * 0.9
pcm = (mix * 32767).astype(np.int16)
with wave.open(sys.argv[2], "wb") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print("audio", round(dur, 1), "s,", len(data["events"]), "events")
