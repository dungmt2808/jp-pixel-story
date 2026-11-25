import { useEffect, useRef } from "react";
import { drawSkylineIntro, VIRTUAL_H, VIRTUAL_W } from "../engine/pixelRenderer";
import type { StoryCatalogEntry } from "../types/catalog";

interface StoryLibraryProps {
  stories: StoryCatalogEntry[];
  onSelectStory: (storyId: string, autoplay: boolean) => void;
}

function MiniPreviewCanvas({ title }: { title: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    drawSkylineIntro(ctx, 1.2, title);
  }, [title]);

  return (
    <canvas
      ref={ref}
      width={VIRTUAL_W}
      height={VIRTUAL_H}
      className="library-thumb-canvas"
    />
  );
}

export function StoryLibrary({ stories, onSelectStory }: StoryLibraryProps) {
  return (
    <div className="library-shell">
      <header className="library-header">
        <div>
          <div className="topbar-series">JP-PIXEL-STORY · INTERACTIVE JAPANESE</div>
          <h1 className="library-title">Thư viện truyện 2D Tiếng Nhật</h1>
          <p className="library-subtitle">
            Chọn một bài học để xem hoạt ảnh 2D tương tác, nghe giọng VOICEVOX chuẩn Nhật và luyện đọc có Furigana.
          </p>
        </div>
        <div className="library-badge-count">{stories.length} bài học</div>
      </header>

      <div className="library-grid">
        {stories.map((item) => (
          <article key={item.id} className="story-card">
            <div
              className="story-card-thumb"
              onClick={() => onSelectStory(item.id, false)}
            >
              <MiniPreviewCanvas title={item.titleJa} />
              <span className="story-card-level">{item.level}</span>
            </div>

            <div className="story-card-body">
              <h2 className="story-card-title-ja">{item.titleJa}</h2>
              <div className="story-card-title-vi">{item.titleVi}</div>
              <p className="story-card-desc">{item.description}</p>

              <div className="story-card-meta">
                <span>🎬 {item.sceneCount} cảnh</span>
                <span>📖 {item.vocabCount} từ vựng</span>
                <span>🔊 VOICEVOX</span>
              </div>

              <div className="story-card-actions">
                <button
                  type="button"
                  className="pixel-btn pixel-btn-purple"
                  onClick={() => onSelectStory(item.id, false)}
                >
                  ▶ Vào học tương tác
                </button>
                <button
                  type="button"
                  className="pixel-btn pixel-btn-dark"
                  onClick={() => onSelectStory(item.id, true)}
                >
                  🎬 Tự chạy
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>

      <footer className="library-footer">
        Mỗi lần thêm truyện mới vào <code>web/public/stories/</code> và{" "}
        <code>git push</code>, web GitHub Pages sẽ tự động cập nhật bài mới vào thư viện này.
      </footer>
    </div>
  );
}
