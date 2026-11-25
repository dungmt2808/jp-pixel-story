import { useCallback, useEffect, useState } from "react";
import { retroAudio } from "./audio/chiptune";
import { DictationView } from "./components/DictationView";
import { HybridStage } from "./components/HybridStage";
import { PixelStage } from "./components/PixelStage";
import { ReadingView } from "./components/ReadingView";
import { StoryLibrary } from "./components/StoryLibrary";
import type { StoryCatalog, StoryCatalogEntry } from "./types/catalog";
import type { DictationItem, DictationPack } from "./types/dictation";
import type { StoryData } from "./types/story";
import { resolveAssetUrl } from "./utils/assetUrl";

function buildDictationPackFromStory(story: StoryData): DictationPack {
  const items: DictationItem[] = [];
  const seen = new Set<string>();

  const pushLine = (ln: {
    id: string;
    speakerLabel?: string;
    jaPlain: string;
    jaRuby: StoryData["scenes"][number]["lines"][number]["jaRuby"];
    vi: string;
    audioUrl?: string;
    durationSec?: number;
  }) => {
    if (!ln.audioUrl || seen.has(ln.id)) return;
    seen.add(ln.id);
    const jaKana = ln.jaRuby.map((seg) => seg.r ?? seg.t).join("");
    items.push({
      id: ln.id,
      speakerLabel: ln.speakerLabel,
      jaPlain: ln.jaPlain,
      jaKana,
      jaRuby: ln.jaRuby,
      vi: ln.vi,
      audioUrl: ln.audioUrl,
      durationSec: ln.durationSec,
    });
  };

  for (const sc of story.scenes) {
    for (const ln of sc.lines) pushLine(ln);
    if (sc.minigame) {
      for (const ch of sc.minigame.choices) {
        if (ch.responseLine) pushLine(ch.responseLine);
      }
    }
  }
  for (const sent of story.reading.sentences) {
    pushLine({ ...sent, speakerLabel: "ナレーター (Bài đọc)" });
  }

  return {
    id: story.id,
    titleJa: story.titleJa,
    titleVi: story.titleVi,
    level: story.level,
    items,
  };
}

export function App() {
  const initialParams = new URLSearchParams(window.location.search);
  const initialStoryId = initialParams.get("story");
  const initialAutoplay = initialParams.get("autoplay") === "true";
  const initialModeParam = initialParams.get("mode");
  const initialMode: "stage" | "reading" | "dictation" =
    initialModeParam === "dictation"
      ? "dictation"
      : initialModeParam === "reading"
        ? "reading"
        : "stage";

  const [catalog, setCatalog] = useState<StoryCatalogEntry[]>([]);
  const [selectedStoryId, setSelectedStoryId] = useState<string | null>(
    initialStoryId
  );
  const [autoplay, setAutoplay] = useState<boolean>(initialAutoplay);
  const [mode, setMode] = useState<"stage" | "reading" | "dictation">(
    initialMode
  );
  const [story, setStory] = useState<StoryData | null>(null);
  const [dictationPack, setDictationPack] = useState<DictationPack | null>(null);
  const [error, setError] = useState<string | null>(null);
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
        if (!cancelled) {
          setCatalog([
            {
              id: "konbini-onigiri",
              category: "situation",
              kind: "engine",
              thumbStyle: "konbini",
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

  // Load active story or dictation pack whenever selectedStoryId / mode changes
  useEffect(() => {
    if (!selectedStoryId) {
      setStory(null);
      setDictationPack(null);
      setError(null);
      retroAudio.stopBgm();
      return;
    }

    let cancelled = false;
    setError(null);

    const loadData = async () => {
      if (mode === "dictation") {
        setDictationPack(null);
        // 1. Prefer dedicated dictation.json (used by standalone stories like Hachiko)
        try {
          const dRes = await fetch(
            resolveAssetUrl(`stories/${selectedStoryId}/dictation.json`)
          );
          if (dRes.ok) {
            const pack = (await dRes.json()) as DictationPack;
            const catItem = catalog.find((c) => c.id === selectedStoryId);
            if (catItem?.kind === "standalone" && catItem.href) {
              pack.backHref = catItem.href;
            }
            if (!cancelled) setDictationPack(pack);
            return;
          }
        } catch {
          // fallback to story.json
        }

        // 2. Otherwise build DictationPack automatically from story.json
        try {
          const sRes = await fetch(
            resolveAssetUrl(`stories/${selectedStoryId}/story.json`)
          );
          if (!sRes.ok) {
            throw new Error(`Không tìm thấy dữ liệu luyện nghe cho "${selectedStoryId}"`);
          }
          const sData = (await sRes.json()) as StoryData;
          if (!cancelled) {
            setStory(sData);
            setDictationPack(buildDictationPackFromStory(sData));
          }
        } catch (err: unknown) {
          if (!cancelled) {
            setError(err instanceof Error ? err.message : String(err));
          }
        }
        return;
      }

      // Stage or Reading mode: load story.json
      setStory(null);
      try {
        const res = await fetch(
          resolveAssetUrl(`stories/${selectedStoryId}/story.json`)
        );
        if (!res.ok) throw new Error(`Không tìm thấy story "${selectedStoryId}"`);
        const data = (await res.json()) as StoryData;
        if (!cancelled) setStory(data);
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    };

    void loadData();
    return () => {
      cancelled = true;
    };
  }, [selectedStoryId, mode, catalog]);

  // Support browser back/forward navigation
  useEffect(() => {
    const onPopState = () => {
      const p = new URLSearchParams(window.location.search);
      setSelectedStoryId(p.get("story"));
      setAutoplay(p.get("autoplay") === "true");
      const m = p.get("mode");
      setMode(m === "dictation" ? "dictation" : m === "reading" ? "reading" : "stage");
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const updateUrl = (
    storyId: string | null,
    nextMode: "stage" | "reading" | "dictation",
    isAutoplay = false
  ) => {
    const url = new URL(window.location.href);
    if (storyId) {
      url.searchParams.set("story", storyId);
    } else {
      url.searchParams.delete("story");
    }
    if (nextMode === "dictation" || nextMode === "reading") {
      url.searchParams.set("mode", nextMode);
    } else {
      url.searchParams.delete("mode");
    }
    if (isAutoplay) {
      url.searchParams.set("autoplay", "true");
    } else {
      url.searchParams.delete("autoplay");
    }
    window.history.pushState({}, "", url.toString());
  };

  const handleSelectStory = useCallback((storyId: string, isAutoplay: boolean) => {
    updateUrl(storyId, "stage", isAutoplay);
    setAutoplay(isAutoplay);
    setMode("stage");
    setSelectedStoryId(storyId);
  }, []);

  const handleOpenDictation = useCallback((storyId: string) => {
    retroAudio.stopBgm();
    updateUrl(storyId, "dictation", false);
    setAutoplay(false);
    setMode("dictation");
    setSelectedStoryId(storyId);
  }, []);

  const handleOpenLibrary = useCallback(() => {
    retroAudio.stopBgm();
    updateUrl(null, "stage", false);
    setSelectedStoryId(null);
    setAutoplay(false);
    setMode("stage");
  }, []);

  if (!selectedStoryId) {
    return (
      <div className="app-shell">
        <StoryLibrary
          stories={catalog}
          onSelectStory={handleSelectStory}
          onSelectDictation={handleOpenDictation}
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="app-shell">
        <div className="subtitle-box">
          <div className="subtitle-ja">Lỗi tải dữ liệu: {error}</div>
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

  if (mode === "dictation") {
    if (!dictationPack) {
      return (
        <div className="app-shell">
          <div className="subtitle-box">
            <div className="subtitle-ja">読み込み中... (Đang tải bài luyện nghe...)</div>
          </div>
        </div>
      );
    }

    const catEntry = catalog.find((c) => c.id === selectedStoryId);
    const isEngineStory = !catEntry || catEntry.kind !== "standalone";

    return (
      <div className="app-shell">
        <DictationView
          pack={dictationPack}
          showFurigana={showFurigana}
          onToggleFurigana={() => setShowFurigana((v) => !v)}
          onOpenLibrary={handleOpenLibrary}
          onBackToStory={
            isEngineStory
              ? () => {
                  updateUrl(selectedStoryId, "stage", false);
                  setMode("stage");
                }
              : undefined
          }
        />
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
                className="pixel-icon-btn"
                onClick={() => handleOpenDictation(story.id)}
                title="Chuyển sang chế độ luyện nghe chép chính tả"
              >
                🎧 Nghe chép
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

          {story.engine === "hybrid" ? (
            <HybridStage
              key={`${story.id}-${autoplay ? "auto" : "play"}`}
              story={story}
              showFurigana={showFurigana}
              muted={muted}
              autoplay={autoplay}
              onOpenReading={() => {
                updateUrl(story.id, "reading", false);
                setMode("reading");
              }}
              onOpenDictation={() => handleOpenDictation(story.id)}
            />
          ) : (
            <PixelStage
              key={`${story.id}-${autoplay ? "auto" : "play"}`}
              story={story}
              showFurigana={showFurigana}
              muted={muted}
              autoplay={autoplay}
              onOpenReading={() => {
                updateUrl(story.id, "reading", false);
                setMode("reading");
              }}
            />
          )}
        </div>
      ) : (
        <ReadingView
          story={story}
          showFurigana={showFurigana}
          onToggleFurigana={() => setShowFurigana((v) => !v)}
          onBackToStory={() => {
            updateUrl(story.id, "stage", false);
            setMode("stage");
          }}
          onOpenLibrary={handleOpenLibrary}
          onOpenDictation={() => handleOpenDictation(story.id)}
        />
      )}
    </div>
  );
}

export default App;
