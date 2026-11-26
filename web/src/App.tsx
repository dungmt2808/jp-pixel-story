import { useCallback, useEffect, useState } from "react";
import { retroAudio } from "./audio/chiptune";
import { CinemaStage } from "./components/CinemaStage";
import { DepatoStage } from "./components/DepatoStage";
import { DictationView } from "./components/DictationView";
import { HybridStage } from "./components/HybridStage";
import { JlptChoukaiView } from "./components/JlptChoukaiView";
import { JlptDokkaiView } from "./components/JlptDokkaiView";
import { JlptGengoView } from "./components/JlptGengoView";
import { PixelStage } from "./components/PixelStage";
import { ReadingView } from "./components/ReadingView";
import { StoryLibrary } from "./components/StoryLibrary";
import { TsuruStage } from "./components/TsuruStage";
import type { StoryCatalog, StoryCatalogEntry } from "./types/catalog";
import type { ChoukaiExamData } from "./types/choukai";
import type { DictationItem, DictationPack } from "./types/dictation";
import type { DokkaiExamData } from "./types/dokkai";
import type { GengoExamData } from "./types/gengo";
import type { StoryData } from "./types/story";
import { resolveStageEngine } from "./engine/stageEngines";
import { resolveAssetUrl } from "./utils/assetUrl";
import { parseRuby, rubyToKana } from "./utils/ruby";

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
    const jaKana = rubyToKana(ln.jaRuby);
    items.push({
      id: ln.id,
      speakerLabel: ln.speakerLabel,
      jaPlain: ln.jaPlain,
      jaKana,
      jaRuby: parseRuby(ln.jaRuby),
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

function buildDictationPackFromDokkai(dokkai: DokkaiExamData): DictationPack {
  const items: DictationItem[] = [];
  const seen = new Set<string>();
  for (const passage of dokkai.passages) {
    for (const sent of passage.sentences) {
      if (!sent.audioUrl || seen.has(sent.id)) continue;
      seen.add(sent.id);
      items.push({
        id: sent.id,
        speakerLabel: passage.tabLabel,
        jaPlain: sent.jaPlain,
        jaKana: rubyToKana(sent.jaRuby),
        jaRuby: parseRuby(sent.jaRuby),
        vi: sent.vi,
        audioUrl: sent.audioUrl,
        durationSec: sent.durationSec,
      });
    }
  }
  return {
    id: dokkai.id,
    titleJa: dokkai.titleJa,
    titleVi: dokkai.titleVi,
    level: dokkai.level,
    items,
  };
}

type AppMode = "stage" | "reading" | "dictation" | "choukai" | "dokkai" | "gengo";

function parseAppMode(m: string | null): AppMode {
  if (m === "choukai") return "choukai";
  if (m === "dokkai") return "dokkai";
  if (m === "gengo") return "gengo";
  if (m === "dictation") return "dictation";
  if (m === "reading") return "reading";
  return "stage";
}

export function App() {
  const initialParams = new URLSearchParams(window.location.search);
  const initialStoryId = initialParams.get("story");
  const initialAutoplay = initialParams.get("autoplay") === "true";
  const initialMode: AppMode = parseAppMode(initialParams.get("mode"));

  const [catalog, setCatalog] = useState<StoryCatalogEntry[]>([]);
  const [selectedStoryId, setSelectedStoryId] = useState<string | null>(
    initialStoryId
  );
  const [autoplay, setAutoplay] = useState<boolean>(initialAutoplay);
  const [mode, setMode] = useState<AppMode>(initialMode);
  const [stageStartScene, setStageStartScene] = useState(0);
  const [story, setStory] = useState<StoryData | null>(null);
  const [dictationPack, setDictationPack] = useState<DictationPack | null>(null);
  const [choukaiExam, setChoukaiExam] = useState<ChoukaiExamData | null>(null);
  const [dokkaiExam, setDokkaiExam] = useState<DokkaiExamData | null>(null);
  const [gengoExam, setGengoExam] = useState<GengoExamData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showFurigana, setShowFurigana] = useState(true);
  const [showVi, setShowVi] = useState(true);
  const [showGengoVi, setShowGengoVi] = useState(false);
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
      setChoukaiExam(null);
      setDokkaiExam(null);
      setGengoExam(null);
      setError(null);
      retroAudio.stopBgm();
      return;
    }

    let cancelled = false;
    setError(null);

    const loadData = async () => {
      if (mode === "choukai" || (selectedStoryId.endsWith("-choukai") && mode !== "dictation")) {
        setChoukaiExam(null);
        try {
          const cRes = await fetch(
            resolveAssetUrl(`stories/${selectedStoryId}/choukai.json`)
          );
          if (!cRes.ok) {
            throw new Error(`Không tìm thấy đề nghe JLPT "${selectedStoryId}"`);
          }
          const cData = (await cRes.json()) as ChoukaiExamData;
          if (!cancelled) {
            setChoukaiExam(cData);
            if (mode !== "choukai") setMode("choukai");
          }
        } catch (err: unknown) {
          if (!cancelled) {
            setError(err instanceof Error ? err.message : String(err));
          }
        }
        return;
      }

      if (mode === "dokkai" || (selectedStoryId.endsWith("-dokkai") && mode !== "dictation")) {
        setDokkaiExam(null);
        try {
          const dRes = await fetch(
            resolveAssetUrl(`stories/${selectedStoryId}/dokkai.json`)
          );
          if (!dRes.ok) {
            throw new Error(`Không tìm thấy đề đọc JLPT "${selectedStoryId}"`);
          }
          const dData = (await dRes.json()) as DokkaiExamData;
          if (!cancelled) {
            setDokkaiExam(dData);
            if (mode !== "dokkai") setMode("dokkai");
          }
        } catch (err: unknown) {
          if (!cancelled) {
            setError(err instanceof Error ? err.message : String(err));
          }
        }
        return;
      }

      if (mode === "gengo" || selectedStoryId.endsWith("-gengo")) {
        setGengoExam(null);
        try {
          const gRes = await fetch(
            resolveAssetUrl(`stories/${selectedStoryId}/gengo.json`)
          );
          if (!gRes.ok) {
            throw new Error(`Không tìm thấy đề Từ vựng & Ngữ pháp "${selectedStoryId}"`);
          }
          const gData = (await gRes.json()) as GengoExamData;
          if (!cancelled) {
            setGengoExam(gData);
            if (mode !== "gengo") setMode("gengo");
          }
        } catch (err: unknown) {
          if (!cancelled) {
            setError(err instanceof Error ? err.message : String(err));
          }
        }
        return;
      }

      if (mode === "dictation") {
        setDictationPack(null);
        // 1. Prefer dedicated dictation.json (used by standalone stories & JLPT choukai)
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
          // fallback
        }

        // 2. If it's a JLPT Dokkai pack, auto-build DictationPack from dokkai.json
        if (selectedStoryId.endsWith("-dokkai")) {
          try {
            const dkRes = await fetch(
              resolveAssetUrl(`stories/${selectedStoryId}/dokkai.json`)
            );
            if (!dkRes.ok) {
              throw new Error(`Không tìm thấy dữ liệu đọc hiểu cho "${selectedStoryId}"`);
            }
            const dkData = (await dkRes.json()) as DokkaiExamData;
            if (!cancelled) {
              setDokkaiExam(dkData);
              setDictationPack(buildDictationPackFromDokkai(dkData));
            }
          } catch (err: unknown) {
            if (!cancelled) {
              setError(err instanceof Error ? err.message : String(err));
            }
          }
          return;
        }

        // 3. Otherwise build DictationPack automatically from story.json
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
      setMode(parseAppMode(p.get("mode")));
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const updateUrl = (
    storyId: string | null,
    nextMode: AppMode,
    isAutoplay = false
  ) => {
    const url = new URL(window.location.href);
    if (storyId) {
      url.searchParams.set("story", storyId);
    } else {
      url.searchParams.delete("story");
    }
    if (
      nextMode === "dictation" ||
      nextMode === "reading" ||
      nextMode === "choukai" ||
      nextMode === "dokkai" ||
      nextMode === "gengo"
    ) {
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
    setStageStartScene(0);
    setSelectedStoryId(storyId);
  }, []);

  const handleOpenDictation = useCallback((storyId: string) => {
    retroAudio.stopBgm();
    updateUrl(storyId, "dictation", false);
    setAutoplay(false);
    setMode("dictation");
    setSelectedStoryId(storyId);
  }, []);

  const handleOpenChoukai = useCallback((examId: string) => {
    retroAudio.stopBgm();
    updateUrl(examId, "choukai", false);
    setAutoplay(false);
    setMode("choukai");
    setSelectedStoryId(examId);
  }, []);

  const handleOpenDokkai = useCallback((examId: string) => {
    retroAudio.stopBgm();
    updateUrl(examId, "dokkai", false);
    setAutoplay(false);
    setMode("dokkai");
    setSelectedStoryId(examId);
  }, []);

  const handleOpenGengo = useCallback((examId: string) => {
    retroAudio.stopBgm();
    updateUrl(examId, "gengo", false);
    setAutoplay(false);
    setMode("gengo");
    setSelectedStoryId(examId);
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
          onSelectChoukai={handleOpenChoukai}
          onSelectDokkai={handleOpenDokkai}
          onSelectGengo={handleOpenGengo}
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

  if (mode === "choukai") {
    if (!choukaiExam) {
      return (
        <div className="app-shell">
          <div className="subtitle-box">
            <div className="subtitle-ja">読み込み中... (Đang tải đề luyện nghe JLPT...)</div>
          </div>
        </div>
      );
    }
    return (
      <div className="app-shell">
        <JlptChoukaiView
          exam={choukaiExam}
          showFurigana={showFurigana}
          onToggleFurigana={() => setShowFurigana((v) => !v)}
          onOpenLibrary={handleOpenLibrary}
          onOpenDictation={() => handleOpenDictation(choukaiExam.id)}
        />
      </div>
    );
  }

  if (mode === "dokkai") {
    if (!dokkaiExam) {
      return (
        <div className="app-shell">
          <div className="subtitle-box">
            <div className="subtitle-ja">読み込み中... (Đang tải đề đọc hiểu JLPT...)</div>
          </div>
        </div>
      );
    }
    return (
      <div className="app-shell">
        <JlptDokkaiView
          exam={dokkaiExam}
          showFurigana={showFurigana}
          onToggleFurigana={() => setShowFurigana((v) => !v)}
          onOpenLibrary={handleOpenLibrary}
          onOpenDictation={() => handleOpenDictation(dokkaiExam.id)}
          onOpenMondai5={(storyId) => handleSelectStory(storyId, false)}
        />
      </div>
    );
  }

  if (mode === "gengo") {
    if (!gengoExam) {
      return (
        <div className="app-shell">
          <div className="subtitle-box">
            <div className="subtitle-ja">読み込み中... (Đang tải đề Từ vựng &amp; Ngữ pháp JLPT...)</div>
          </div>
        </div>
      );
    }
    return (
      <div className="app-shell">
        <JlptGengoView
          exam={gengoExam}
          showFurigana={showFurigana}
          showVi={showGengoVi}
          onToggleFurigana={() => setShowFurigana((v) => !v)}
          onToggleVi={() => setShowGengoVi((v) => !v)}
          onOpenLibrary={handleOpenLibrary}
          onOpenDokkai={handleOpenDokkai}
          onOpenChoukai={handleOpenChoukai}
        />
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
    const isChoukaiPack = catEntry?.kind === "jlpt-choukai" || selectedStoryId.endsWith("-choukai");
    const isDokkaiPack = catEntry?.kind === "jlpt-dokkai" || selectedStoryId.endsWith("-dokkai");
    const isEngineStory =
      !catEntry || (catEntry.kind !== "standalone" && !isChoukaiPack && !isDokkaiPack);

    return (
      <div className="app-shell">
        <DictationView
          pack={dictationPack}
          showFurigana={showFurigana}
          onToggleFurigana={() => setShowFurigana((v) => !v)}
          onOpenLibrary={handleOpenLibrary}
          onBackToStory={
            isChoukaiPack
              ? () => handleOpenChoukai(selectedStoryId)
              : isDokkaiPack
                ? () => handleOpenDokkai(selectedStoryId)
                : isEngineStory
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
      {mode === "stage" && resolveStageEngine(story) === "cinema" ? (
        <CinemaStage
          key={`${story.id}-${autoplay ? "auto" : "play"}-${stageStartScene}`}
          story={story}
          startScene={stageStartScene}
          showFurigana={showFurigana}
          showVi={showVi}
          muted={muted}
          autoplay={autoplay}
          onToggleFurigana={() => setShowFurigana((v) => !v)}
          onToggleVi={() => setShowVi((v) => !v)}
          onToggleMute={() => setMuted((m) => !m)}
          onClose={handleOpenLibrary}
          onOpenReading={() => {
            updateUrl(story.id, "reading", false);
            setMode("reading");
          }}
          onOpenDictation={() => handleOpenDictation(story.id)}
        />
      ) : mode === "stage" ? (
        <div className={`stage-frame ${showVi ? "" : "hide-vi"}`}>
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
                className={`pixel-icon-btn ${showVi ? "active" : ""}`}
                onClick={() => setShowVi((v) => !v)}
                title="Hiện / Ẩn phụ đề dịch tiếng Việt"
              >
                🇻🇳 Dịch {showVi ? "ON" : "OFF"}
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

          {(() => {
            const stageKey = `${story.id}-${autoplay ? "auto" : "play"}`;
            const common = {
              story,
              showFurigana,
              muted,
              autoplay,
              onOpenReading: () => {
                updateUrl(story.id, "reading", false);
                setMode("reading");
              },
            };
            const onOpenDictation = () => handleOpenDictation(story.id);
            switch (resolveStageEngine(story)) {
              case "tsuru":
                return <TsuruStage key={stageKey} {...common} onOpenDictation={onOpenDictation} />;
              case "depato":
                return <DepatoStage key={stageKey} {...common} onOpenDictation={onOpenDictation} />;
              case "hybrid":
                return <HybridStage key={stageKey} {...common} onOpenDictation={onOpenDictation} />;
              default:
                return <PixelStage key={stageKey} {...common} />;
            }
          })()}
        </div>
      ) : (
        <ReadingView
          story={story}
          showFurigana={showFurigana}
          showVi={showVi}
          onToggleFurigana={() => setShowFurigana((v) => !v)}
          onToggleVi={() => setShowVi((v) => !v)}
          onBackToStory={(sceneIdx) => {
            setStageStartScene(sceneIdx ?? 0);
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
