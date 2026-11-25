import { useEffect, useState } from "react";
import { PixelStage } from "./components/PixelStage";
import { ReadingView } from "./components/ReadingView";
import type { StoryData } from "./types/story";

export function App() {
  const params = new URLSearchParams(window.location.search);
  const storyId = params.get("story") || "konbini-onigiri";
  const autoplay = params.get("autoplay") === "true";

  const [story, setStory] = useState<StoryData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"stage" | "reading">("stage");
  const [showFurigana, setShowFurigana] = useState(true);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/stories/${storyId}/story.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`Không tìm thấy story "${storyId}"`);
        return res.json() as Promise<StoryData>;
      })
      .then((data) => {
        if (!cancelled) setStory(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [storyId]);

  if (error) {
    return (
      <div className="app-shell">
        <div className="subtitle-box">
          <div className="subtitle-ja">Lỗi tải truyện: {error}</div>
        </div>
      </div>
    );
  }

  if (!story) {
    return (
      <div className="app-shell">
        <div className="subtitle-box">
          <div className="subtitle-ja">読み込み中... (Đang tải...)</div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      {mode === "stage" ? (
        <div className="stage-frame">
          <div className="stage-topbar">
            <div className="topbar-meta">
              <span className="topbar-series">{story.series}</span>
              <div className="topbar-title">
                <span>
                  {story.titleJa} — {story.titleVi}
                </span>
                <span className="level-pill">{story.level}</span>
              </div>
            </div>

            <div className="topbar-controls">
              <button
                type="button"
                className={`pixel-icon-btn ${showFurigana ? "active" : ""}`}
                onClick={() => setShowFurigana((v) => !v)}
                title="Bật / Tắt Furigana"
              >
                ふりがな {showFurigana ? "ON" : "OFF"}
              </button>
              <button
                type="button"
                className="pixel-icon-btn"
                onClick={() => setMuted((m) => !m)}
                title="Bật / Tắt âm thanh"
              >
                {muted ? "🔇 MUTED" : "🔊 SOUND"}
              </button>
            </div>
          </div>

          <PixelStage
            story={story}
            showFurigana={showFurigana}
            muted={muted}
            autoplay={autoplay}
            onOpenReading={() => setMode("reading")}
          />
        </div>
      ) : (
        <ReadingView
          story={story}
          showFurigana={showFurigana}
          onToggleFurigana={() => setShowFurigana((v) => !v)}
          onBackToStory={() => setMode("stage")}
        />
      )}
    </div>
  );
}

export default App;
