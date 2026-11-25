import { useCallback, useEffect, useState } from "react";
import { retroAudio } from "./audio/chiptune";
import { PixelStage } from "./components/PixelStage";
import { ReadingView } from "./components/ReadingView";
import { StoryLibrary } from "./components/StoryLibrary";
import type { StoryCatalog, StoryCatalogEntry } from "./types/catalog";
import type { StoryData } from "./types/story";
import { resolveAssetUrl } from "./utils/assetUrl";

export function App() {
  const initialParams = new URLSearchParams(window.location.search);
  const initialStoryId = initialParams.get("story");
  const initialAutoplay = initialParams.get("autoplay") === "true";

  const [catalog, setCatalog] = useState<StoryCatalogEntry[]>([]);
  const [selectedStoryId, setSelectedStoryId] = useState<string | null>(
    initialStoryId
  );
  const [autoplay, setAutoplay] = useState<boolean>(initialAutoplay);
  const [story, setStory] = useState<StoryData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"stage" | "reading">("stage");
  const [showFurigana, setShowFurigana] = useState(true);
  const [muted, setMuted] = useState(false);

  // Load story catalog for the Library screen
  useEffect(() => {
    let cancelled = false;
    fetch(resolveAssetUrl("stories/index.json"))
      .then((res) => {
        if (!res.ok) throw new Error("Không tải được danh sách truyện.");
        return res.json() as Promise<StoryCatalog>;
      })
      .then((data) => {
        if (!cancelled) setCatalog(data.stories || []);
      })
      .catch(() => {
        // Fallback if index.json is missing
        if (!cancelled) {
          setCatalog([
            {
              id: "konbini-onigiri",
              titleJa: "夜のコンビニ",
              titleVi: "Lần đầu mua cơm nắm lúc nửa đêm",
              level: "JLPT N5–N4",
              description: "Tình huống mua cơm nắm ở cửa hàng tiện lợi Nhật Bản.",
              sceneCount: 6,
              vocabCount: 6,
            },
          ]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Load active story JSON whenever selectedStoryId changes
  useEffect(() => {
    if (!selectedStoryId) {
      setStory(null);
      setError(null);
      retroAudio.stopBgm();
      return;
    }

    let cancelled = false;
    setStory(null);
    setError(null);
    setMode("stage");

    fetch(resolveAssetUrl(`stories/${selectedStoryId}/story.json`))
      .then((res) => {
        if (!res.ok) throw new Error(`Không tìm thấy story "${selectedStoryId}"`);
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
  }, [selectedStoryId]);

  // Support browser back/forward navigation
  useEffect(() => {
    const onPopState = () => {
      const p = new URLSearchParams(window.location.search);
      setSelectedStoryId(p.get("story"));
      setAutoplay(p.get("autoplay") === "true");
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const handleSelectStory = useCallback((storyId: string, isAutoplay: boolean) => {
    const url = new URL(window.location.href);
    url.searchParams.set("story", storyId);
    if (isAutoplay) {
      url.searchParams.set("autoplay", "true");
    } else {
      url.searchParams.delete("autoplay");
    }
    window.history.pushState({}, "", url.toString());
    setAutoplay(isAutoplay);
    setSelectedStoryId(storyId);
  }, []);

  const handleOpenLibrary = useCallback(() => {
    retroAudio.stopBgm();
    const url = new URL(window.location.href);
    url.searchParams.delete("story");
    url.searchParams.delete("autoplay");
    window.history.pushState({}, "", url.toString());
    setSelectedStoryId(null);
    setAutoplay(false);
    setMode("stage");
  }, []);

  if (!selectedStoryId) {
    return (
      <div className="app-shell">
        <StoryLibrary stories={catalog} onSelectStory={handleSelectStory} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="app-shell">
        <div className="subtitle-box">
          <div className="subtitle-ja">Lỗi tải truyện: {error}</div>
          <div style={{ marginTop: 12 }}>
            <button
              type="button"
              className="pixel-btn pixel-btn-cream"
              onClick={handleOpenLibrary}
            >
              ← Quay về thư viện
            </button>
          </div>
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
                className="pixel-icon-btn"
                onClick={handleOpenLibrary}
                title="Quay lại thư viện truyện"
              >
                📚 Thư viện
              </button>
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
            key={`${story.id}-${autoplay ? "auto" : "play"}`}
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
          onOpenLibrary={handleOpenLibrary}
        />
      )}
    </div>
  );
}

export default App;
