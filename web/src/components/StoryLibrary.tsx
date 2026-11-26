import { useEffect, useRef, useState } from "react";
import { drawSkylineIntro, VIRTUAL_H, VIRTUAL_W } from "../engine/pixelRenderer";
import type { StoryCatalogEntry, StoryCategory } from "../types/catalog";
import { resolveAssetUrl } from "../utils/assetUrl";
import { getSavedDictationCount } from "./DictationView";
import { getSavedChoukaiScore } from "./JlptChoukaiView";

interface StoryLibraryProps {
  stories: StoryCatalogEntry[];
  onSelectStory: (storyId: string, autoplay: boolean) => void;
  onSelectDictation: (storyId: string) => void;
  onSelectChoukai: (examId: string) => void;
}

/** Cute 320x200 pixel-art thumbnail preview for Hachikō at Shibuya Station */
function drawHachikoThumb(ctx: CanvasRenderingContext2D, title: string): void {
  const px = (x: number, y: number, w: number, h: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(x, y, w, h);
  };
  // Sunset-to-night Shibuya sky
  px(0, 0, VIRTUAL_W, 44, "#151b30");
  px(0, 44, VIRTUAL_W, 38, "#3a3160");
  px(0, 82, VIRTUAL_W, 34, "#7a4a6a");
  px(0, 116, VIRTUAL_W, 24, "#d0745a");
  // Crescent moon & stars
  px(34, 18, 12, 12, "#efe3bf");
  px(38, 16, 10, 10, "#151b30");
  [[82, 20], [148, 16], [230, 22], [282, 30]].forEach(([x, y]) =>
    px(x, y, 2, 2, "#f6f1e4")
  );
  // Ground
  px(0, 134, VIRTUAL_W, 66, "#5a4d42");
  px(0, 134, VIRTUAL_W, 3, "#7a6a5a");
  // Retro Shibuya Station wooden facade on right
  px(196, 62, 118, 76, "#d8c8a2");
  px(188, 50, 132, 14, "#3a4250");
  px(228, 96, 42, 42, "#4a3a24");
  // Station clock
  px(242, 70, 16, 16, "#efe6d4");
  px(249, 73, 2, 6, "#2a1c12");
  px(249, 78, 5, 2, "#b8322e");
  // Sakura tree on left
  px(26, 86, 8, 54, "#4a3426");
  px(10, 62, 42, 30, "#f4b6c8");
  px(18, 54, 28, 16, "#f9d4de");
  // Street lamp
  px(156, 76, 3, 62, "#2a2a30");
  px(150, 72, 15, 6, "#ffe08a");
  px(140, 78, 36, 30, "rgba(255,224,138,0.16)");
  // Pixel Hachiko sitting patiently!
  const hx = 104;
  const hy = 122;
  px(hx - 2, hy + 24, 34, 3, "rgba(0,0,0,0.35)");
  // Body
  px(hx + 2, hy + 6, 20, 16, "#e3b77e");
  px(hx + 8, hy + 8, 14, 14, "#f6eedd");
  // Curled Akita tail
  px(hx - 4, hy + 6, 6, 8, "#b9854a");
  px(hx - 2, hy + 4, 5, 4, "#e3b77e");
  // Head & pointed ears
  px(hx + 16, hy - 6, 16, 14, "#e3b77e");
  px(hx + 16, hy - 11, 5, 6, "#b9854a");
  px(hx + 25, hy - 11, 5, 6, "#b9854a");
  // Face
  px(hx + 26, hy - 1, 3, 3, "#1b1410");
  px(hx + 31, hy + 1, 3, 3, "#1b1410");
  px(hx + 24, hy + 3, 8, 5, "#f6eedd");
  // Paws
  px(hx + 4, hy + 21, 6, 4, "#f6eedd");
  px(hx + 18, hy + 21, 6, 4, "#f6eedd");
  // Title text cleanly below top badges
  ctx.font = 'bold 18px "DotGothic16", monospace';
  ctx.textAlign = "center";
  ctx.fillStyle = "#151b30";
  ctx.fillText(title, VIRTUAL_W / 2 + 2, 56);
  ctx.fillStyle = "#f3e6c6";
  ctx.fillText(title, VIRTUAL_W / 2, 54);
}

/** Crisp pixel-art retro cassette & JLPT exam audio room thumbnail */
function drawJlptThumb(ctx: CanvasRenderingContext2D, title: string): void {
  const px = (x: number, y: number, w: number, h: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(x, y, w, h);
  };
  // Deep indigo exam-room backdrop
  px(0, 0, VIRTUAL_W, VIRTUAL_H, "#131932");
  px(0, 140, VIRTUAL_W, 60, "#1d274a");
  px(0, 140, VIRTUAL_W, 3, "#3b4c80");
  // Subtle grid dots
  for (let gx = 16; gx < VIRTUAL_W; gx += 20) {
    for (let gy = 20; gy < 135; gy += 18) {
      px(gx, gy, 1, 1, "rgba(154, 178, 232, 0.2)");
    }
  }
  // Retro JLPT Cassette / Audio Deck on center-bottom
  px(74, 88, 172, 74, "#0d1122");
  px(78, 92, 164, 66, "#28355e");
  px(82, 96, 156, 22, "#f5f1e6");
  // Cassette label stripe
  px(82, 113, 156, 5, "#46b89d");
  // Animated-look equalizer bars inside cassette window
  px(108, 124, 104, 24, "#101426");
  const bars = [10, 16, 12, 20, 14, 18, 9, 15, 20, 11, 16, 8];
  bars.forEach((bh, i) => {
    px(116 + i * 7, 146 - bh, 4, bh, i % 2 === 0 ? "#ffd875" : "#46b89d");
  });
  // Tape reels
  px(86, 127, 16, 16, "#141a30");
  px(90, 131, 8, 8, "#ffd875");
  px(218, 127, 16, 16, "#141a30");
  px(222, 131, 8, 8, "#ffd875");

  // Crisp Japanese title
  ctx.font = 'bold 16px "DotGothic16", monospace';
  ctx.textAlign = "center";
  ctx.fillStyle = "#0b0e1a";
  ctx.fillText(title, VIRTUAL_W / 2 + 2, 62);
  ctx.fillStyle = "#ffd875";
  ctx.fillText(title, VIRTUAL_W / 2, 60);
  ctx.font = 'bold 10px "DotGothic16", monospace';
  ctx.fillStyle = "#8ad4ff";
  ctx.fillText("ORIGINAL AUDIO · 28 QUESTIONS", VIRTUAL_W / 2, 77);
}

function MiniPreviewCanvas({
  title,
  style,
}: {
  title: string;
  style?: "konbini" | "hachiko" | "jlpt";
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    if (style === "hachiko") {
      drawHachikoThumb(ctx, title);
    } else if (style === "jlpt") {
      drawJlptThumb(ctx, title);
    } else {
      drawSkylineIntro(ctx, 1.2, title);
    }
  }, [style, title]);

  return (
    <canvas
      ref={ref}
      width={VIRTUAL_W}
      height={VIRTUAL_H}
      className="library-thumb-canvas"
    />
  );
}

const CATEGORY_META: Record<
  StoryCategory,
  { label: string; icon: string; badgeClass: string }
> = {
  jlpt: {
    label: "Đề thi JLPT",
    icon: "📝",
    badgeClass: "cat-jlpt",
  },
  situation: {
    label: "Tình huống",
    icon: "💬",
    badgeClass: "cat-situation",
  },
  story: {
    label: "Câu chuyện",
    icon: "📖",
    badgeClass: "cat-story",
  },
};

export function StoryLibrary({
  stories,
  onSelectStory,
  onSelectDictation,
  onSelectChoukai,
}: StoryLibraryProps) {
  const [filter, setFilter] = useState<"all" | StoryCategory>("all");

  const jlptCount = stories.filter((s) => s.category === "jlpt").length;
  const situationCount = stories.filter((s) => s.category === "situation").length;
  const storyCount = stories.filter((s) => s.category === "story").length;
  const filtered =
    filter === "all" ? stories : stories.filter((s) => s.category === filter);

  const openItem = (item: StoryCatalogEntry, autoplay: boolean) => {
    if (item.kind === "jlpt-choukai") {
      onSelectChoukai(item.id);
      return;
    }
    if (item.kind === "standalone" && item.href) {
      const target = resolveAssetUrl(item.href);
      window.location.href = autoplay ? `${target}?auto=1` : target;
      return;
    }
    onSelectStory(item.id, autoplay);
  };

  return (
    <div className="library-shell">
      <header className="library-header">
        <div>
          <div className="topbar-series">JP-PIXEL-STORY · INTERACTIVE JAPANESE</div>
          <h1 className="library-title">Thư viện học Tiếng Nhật 2D Pixel Art</h1>
          <p className="library-subtitle">
            Học Tiếng Nhật 3 trong 1: <b>Hoạt ảnh 2D tương tác</b> + <b>Bài đọc có ふりがな &amp; ngữ pháp</b> +{" "}
            <b>🎧 Daily Dictation (nghe chép chính tả VOICEVOX)</b>.
          </p>
        </div>
        <div className="library-badge-count">{stories.length} bài học</div>
      </header>

      <div className="category-tabs" role="tablist">
        <button
          type="button"
          className={`cat-tab ${filter === "all" ? "active" : ""}`}
          onClick={() => setFilter("all")}
        >
          ✨ Tất cả ({stories.length})
        </button>
        <button
          type="button"
          className={`cat-tab ${filter === "jlpt" ? "active" : ""}`}
          onClick={() => setFilter("jlpt")}
        >
          📝 Đề thi JLPT ({jlptCount})
        </button>
        <button
          type="button"
          className={`cat-tab ${filter === "situation" ? "active" : ""}`}
          onClick={() => setFilter("situation")}
        >
          💬 Tình huống đời sống ({situationCount})
        </button>
        <button
          type="button"
          className={`cat-tab ${filter === "story" ? "active" : ""}`}
          onClick={() => setFilter("story")}
        >
          📖 Câu chuyện &amp; Đọc hiểu ({storyCount})
        </button>
      </div>

      <div className="library-grid">
        {filtered.map((item) => {
          const cat = CATEGORY_META[item.category] ?? CATEGORY_META.story;
          const isChoukai = item.kind === "jlpt-choukai";
          const dictDone = isChoukai ? 0 : getSavedDictationCount(item.id);
          const choukaiDone = isChoukai ? getSavedChoukaiScore(item.id).answered : 0;
          return (
            <article key={item.id} className="story-card">
              <div
                className="story-card-thumb"
                onClick={() => openItem(item, false)}
              >
                {item.thumbImage ? (
                  <img
                    src={resolveAssetUrl(item.thumbImage)}
                    alt={item.titleJa}
                    className="library-thumb-canvas"
                  />
                ) : (
                  <MiniPreviewCanvas
                    title={item.titleJa}
                    style={
                      item.thumbStyle === "hachiko"
                        ? "hachiko"
                        : item.thumbStyle === "jlpt"
                          ? "jlpt"
                          : "konbini"
                    }
                  />
                )}
                <span className={`story-card-cat ${cat.badgeClass}`}>
                  {cat.icon} {cat.label}
                </span>
                {item.artBadge && (
                  <span className="story-card-art-badge">{item.artBadge}</span>
                )}
                <span className="story-card-level">{item.level}</span>
              </div>

              <div className="story-card-body">
                <h2 className="story-card-title-ja">{item.titleJa}</h2>
                <div className="story-card-title-vi">{item.titleVi}</div>
                <p className="story-card-desc">{item.description}</p>

                <div className="story-card-meta">
                  {isChoukai ? (
                    <>
                      <span>🎧 {item.questionCount ?? 28} câu thi thật</span>
                      <span>🎙️ MP3 gốc JLPT</span>
                      <span>📜 Script ふりがな</span>
                      {choukaiDone > 0 && (
                        <span style={{ color: "#46b89d", fontWeight: 700 }}>
                          ✅ Đã làm {choukaiDone}/{item.questionCount ?? 28}
                        </span>
                      )}
                    </>
                  ) : (
                    <>
                      <span>🎬 {item.sceneCount} cảnh</span>
                      <span>📒 {item.vocabCount} từ vựng</span>
                      {item.grammarCount ? <span>🧩 {item.grammarCount} ngữ pháp</span> : null}
                      {item.quizCount ? <span>✅ {item.quizCount} quiz</span> : null}
                      <span>🔊 VOICEVOX</span>
                      {dictDone > 0 && (
                        <span style={{ color: "#46b89d", fontWeight: 700 }}>
                          🎧 Đã chép {dictDone} câu
                        </span>
                      )}
                    </>
                  )}
                </div>

                <div className="story-card-actions">
                  {isChoukai ? (
                    <>
                      <button
                        type="button"
                        className="pixel-btn pixel-btn-purple"
                        onClick={() => onSelectChoukai(item.id)}
                      >
                        🎧 Luyện nghe JLPT
                      </button>
                      <button
                        type="button"
                        className="pixel-btn pixel-btn-mint"
                        onClick={() => onSelectDictation(item.id)}
                      >
                        ⌨️ Nghe chép
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="pixel-btn pixel-btn-purple"
                        onClick={() => openItem(item, false)}
                      >
                        ▶ Học tương tác
                      </button>
                      <button
                        type="button"
                        className="pixel-btn pixel-btn-mint"
                        onClick={() => onSelectDictation(item.id)}
                      >
                        🎧 Nghe chép
                      </button>
                      <button
                        type="button"
                        className="pixel-btn pixel-btn-dark"
                        onClick={() => openItem(item, true)}
                      >
                        🎬 Tự chạy
                      </button>
                    </>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <footer className="library-footer">
        Mỗi lần thêm bài mới (thuộc mục <b>Tình huống</b> hoặc <b>Câu chuyện</b>) vào{" "}
        <code>web/public/stories/</code> và <code>git push</code>, GitHub Pages sẽ tự động cập nhật thư viện này.
      </footer>
    </div>
  );
}
