"""Tự động quay bài Hachikō thành MP4: phần game (từng khung hình), phần bài đọc (ảnh tĩnh), đoạn kết.

Cách chạy:  python3 record.py index.html out.mp4
"""
import base64, json, os, subprocess, sys
from pathlib import Path
from playwright.sync_api import sync_playwright

page_path = Path(sys.argv[1] if len(sys.argv) > 1 else "index.html").resolve()
out_path = Path(sys.argv[2] if len(sys.argv) > 2 else "out.mp4").resolve()
work = out_path.parent / "_render"
work.mkdir(parents=True, exist_ok=True)
CHROME = os.environ.get("CHROME", "/usr/bin/google-chrome")
ENC = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-r", "30"]
files = []


def encode(args, name):
    tmp = work / f"{len(files):02d}_{name}.part.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y", *args, *ENC, str(tmp)], check=True)
    final = tmp.with_name(tmp.name.replace(".part", ""))
    tmp.rename(final)
    files.append(final)


class SceneWriter:
    def __init__(self):
        self.p = None
        self.cur = None

    def frame(self, sc, jpg):
        if sc != self.cur:
            self.close()
            self.tmp = work / f"{len(files):02d}_scene{sc}.part.mp4"
            self.p = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "image2pipe", "-framerate", "30", "-c:v", "mjpeg",
                                       "-i", "-", *ENC, str(self.tmp)], stdin=subprocess.PIPE)
            self.cur = sc
        self.p.stdin.write(jpg)

    def close(self):
        if self.p:
            self.p.stdin.close()
            if self.p.wait() != 0:
                raise SystemExit("ffmpeg failed")
            final = self.tmp.with_name(self.tmp.name.replace(".part", ""))
            self.tmp.rename(final)
            files.append(final)
            self.p = None
            self.cur = None


def run_frames(pg, sw):
    n = 0
    while True:
        res = pg.evaluate("n => window.__frames(n)", 20)
        for sc, url in res["frames"]:
            sw.frame(sc, base64.b64decode(url.split(",", 1)[1]))
            n += 1
        if res["done"] or res["phase"] == "reader" or not res["frames"]:
            return n, res


extra_events, still_total = [], 0.0
with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path=CHROME, args=["--no-sandbox"])
    pg = b.new_page(viewport={"width": 1000, "height": 900})
    pg.goto(page_path.as_uri() + "?record=1")
    pg.wait_for_function("window.__ready")
    sw = SceneWriter()
    n1, res = run_frames(pg, sw)
    sw.close()
    t_reader = n1 / 30
    print(f"game: {t_reader:.1f}s", flush=True)

    # ---- bài đọc: các bước bấm, mỗi bước là một ảnh tĩnh ----
    pg.evaluate("document.fonts.ready")
    pg.wait_for_timeout(400)
    steps = [("window.__R.top()", 3.5, None), ("window.__R.word('nakunaru')", 4.5, "click"),
             ("window.__R.word('ikura')", 4.5, "click"), ("window.__R.word('youni')", 4.0, "click"),
             ("window.__R.toggle('tVi')", 4.0, "click"), ("window.__R.toggle('tFuri')", 3.0, "click"),
             ("(window.__R.toggle('tFuri'), window.__R.answer(2,1))", 4.5, "chime")]
    stage = pg.locator("#stage")
    for i, (js, dur, snd) in enumerate(steps):
        x, y = pg.evaluate(js)
        pg.evaluate(f"window.__R.cursor({x},{y})")
        pg.wait_for_timeout(150)
        shot = work / f"still{i}.jpg"
        stage.screenshot(path=str(shot), type="jpeg", quality=92)
        if snd:
            extra_events.append([t_reader + still_total + 0.05, snd])
        encode(["-framerate", "30", "-i", str(shot), "-vf", f"scale=960:720,format=yuv420p,loop=-1:1,trim=duration={dur}"], f"still{i}")
        still_total += dur
    print(f"reader stills: {still_total:.1f}s", flush=True)

    pg.evaluate("window.__R.outro()")
    sw = SceneWriter()
    n2, _ = run_frames(pg, sw)
    sw.close()
    events = pg.evaluate("window.__events")
    b.close()

# sự kiện âm thanh sau phần bài đọc được dời lại đúng bằng thời lượng các ảnh tĩnh
events = [[t + (still_total if t > t_reader + 0.001 else 0), nm] for t, nm in events] + extra_events
duration = (n1 + n2) / 30 + still_total
(work / "events.json").write_text(json.dumps({"duration": duration, "events": events}))
(work / "list.txt").write_text("".join(f"file '{f.name}'\n" for f in files))
silent = work / "video_silent.mp4"
subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(work / "list.txt"), "-c", "copy", str(silent)], check=True)
wav = work / "audio.wav"
subprocess.run([sys.executable, str(Path(__file__).with_name("audio.py")), str(work / "events.json"), str(wav)], check=True)
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(silent), "-i", str(wav), "-map", "0:v", "-map", "1:a", "-c:v", "copy",
                "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", str(out_path)], check=True)
print(f"OK  {out_path}  {duration:.1f}s  {len(files)} parts")
