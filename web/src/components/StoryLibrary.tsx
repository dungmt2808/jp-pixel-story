import { useEffect, useMemo, useRef, useState } from "react";
import { drawSkylineIntro, VIRTUAL_H, VIRTUAL_W } from "../engine/pixelRenderer";
import type { StoryCatalogEntry } from "../types/catalog";
import { resolveAssetUrl } from "../utils/assetUrl";
import { getSavedDictationCount } from "./DictationView";
import { getSavedChoukaiScore } from "./JlptChoukaiView";
import { getSavedDokkaiScore } from "./JlptDokkaiView";
import { getSavedGengoScore } from "./JlptGengoView";
import {
  PixelArrowRightIcon,
  PixelBookIcon,
  PixelCheckIcon,
  PixelExamIcon,
  PixelFilmIcon,
  PixelHeadphonesIcon,
  PixelHomeIcon,
  PixelKanjiIcon,
  PixelPlayIcon,
  PixelScrollIcon,
  PixelSparkleIcon,
} from "./PixelIcons";

interface StoryLibraryProps {
  stories: StoryCatalogEntry[];
  onSelectStory: (storyId: string, autoplay: boolean) => void;
  onSelectDictation: (storyId: string) => void;
  onSelectChoukai: (examId: string) => void;
  onSelectDokkai: (examId: string) => void;
  onSelectGengo: (examId: string) => void;
}

type NavTab = "home" | "stories" | "jlpt";

interface ExamGroup {
  term: string;
  levelLabel: string;
  items: StoryCatalogEntry[];
}

/** Cute 320x200 pixel-art thumbnail preview for Hachikō at Shibuya Station */
function drawHachikoThumb(ctx: CanvasRenderingContext2D, title: string): void {
  const px = (x: number, y: number, w: number, h: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(x, y, w, h);
  };
  px(0, 0, VIRTUAL_W, 44, "#151b30");
  px(0, 44, VIRTUAL_W, 38, "#3a3160");
  px(0, 82, VIRTUAL_W, 34, "#7a4a6a");
  px(0, 116, VIRTUAL_W, 24, "#d0745a");
  px(34, 18, 12, 12, "#efe3bf");
  px(38, 16, 10, 10, "#151b30");
  [[82, 20], [148, 16], [230, 22], [282, 30]].forEach(([x, y]) => px(x, y, 2, 2, "#f6f1e4"));
  px(0, 134, VIRTUAL_W, 66, "#5a4d42");
  px(0, 134, VIRTUAL_W, 3, "#7a6a5a");
  px(196, 62, 118, 76, "#d8c8a2");
  px(188, 50, 132, 14, "#3a4250");
  px(228, 96, 42, 42, "#4a3a24");
  px(242, 70, 16, 16, "#efe6d4");
  px(249, 73, 2, 6, "#2a1c12");
  px(249, 78, 5, 2, "#b8322e");
  px(26, 86, 8, 54, "#4a3426");
  px(10, 62, 42, 30, "#f4b6c8");
  px(18, 54, 28, 16, "#f9d4de");
  px(156, 76, 3, 62, "#2a2a30");
  px(150, 72, 15, 6, "#ffe08a");
  px(140, 78, 36, 30, "rgba(255,224,138,0.16)");
  const hx = 104;
  const hy = 122;
  px(hx - 2, hy + 24, 34, 3, "rgba(0,0,0,0.35)");
  px(hx + 2, hy + 6, 20, 16, "#e3b77e");
  px(hx + 8, hy + 8, 14, 14, "#f6eedd");
  px(hx - 4, hy + 6, 6, 8, "#b9854a");
  px(hx - 2, hy + 4, 5, 4, "#e3b77e");
  px(hx + 16, hy - 6, 16, 14, "#e3b77e");
  px(hx + 16, hy - 11, 5, 6, "#b9854a");
  px(hx + 25, hy - 11, 5, 6, "#b9854a");
  px(hx + 26, hy - 1, 3, 3, "#1b1410");
  px(hx + 31, hy + 1, 3, 3, "#1b1410");
  px(hx + 24, hy + 3, 8, 5, "#f6eedd");
  px(hx + 4, hy + 21, 6, 4, "#f6eedd");
  px(hx + 18, hy + 21, 6, 4, "#f6eedd");
  ctx.font = 'bold 18px "DotGothic16", monospace';
  ctx.textAlign = "center";
  ctx.fillStyle = "#151b30";
  ctx.fillText(title, VIRTUAL_W / 2 + 2, 56);
  ctx.fillStyle = "#f3e6c6";
  ctx.fillText(title, VIRTUAL_W / 2, 54);
}

function MiniPreviewCanvas({
  title,
  style,
}: {
  title: string;
  style?: "konbini" | "hachiko";
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

function shortLevel(level: string): string {
  return level.replace(/^JLPT\s*/i, "").split("·")[0].trim() || level;
}

function extractExamTerm(item: StoryCatalogEntry): string {
  const m = item.level.match(/(\d{2}\/\d{4})/) ?? item.titleJa.match(/(\d{2}\/\d{4})/);
  return m ? m[1] : "Khác";
}

function examPartMeta(item: StoryCatalogEntry): {
  order: number;
  label: string;
  sub: string;
  countLabel: string;
  done: number;
  total: number;
  hasDictation: boolean;
  icon: "kanji" | "headphones" | "scroll" | "film";
} {
  if (item.kind === "jlpt-gengo") {
    const total = item.questionCount ?? 49;
    return {
      order: 0,
      label: "Từ vựng & Ngữ pháp",
      sub: "文字・語彙・文法 (問題1–5)",
      countLabel: `${total} câu`,
      done: getSavedGengoScore(item.id).answered,
      total,
      hasDictation: false,
      icon: "kanji",
    };
  }
  if (item.kind === "jlpt-choukai") {
    const total = item.questionCount ?? 28;
    return {
      order: 1,
      label: "Nghe hiểu MP3",
      sub: "聴解 đề thi thật (問題1–4)",
      countLabel: `${total} câu`,
      done: getSavedChoukaiScore(item.id).answered,
      total,
      hasDictation: true,
      icon: "headphones",
    };
  }
  if (item.kind === "jlpt-dokkai") {
    const total = item.questionCount ?? 5;
    return {
      order: 2,
      label: "Đọc hiểu 問題4·6",
      sub: "Trung văn & tra cứu thông tin",
      countLabel: `${total} câu`,
      done: getSavedDokkaiScore(item.id).answered,
      total,
      hasDictation: true,
      icon: "scroll",
    };
  }
  return {
    order: 3,
    label: `Hoạt ảnh ${item.titleJa}`,
    sub: "Chuyển thể bài đọc 問題5",
    countLabel: "問題5",
    done: getSavedDictationCount(item.id),
    total: 0,
    hasDictation: true,
    icon: "film",
  };
}

function ExamPartIcon({ kind }: { kind: "kanji" | "headphones" | "scroll" | "film" }) {
  if (kind === "kanji") return <PixelKanjiIcon size={16} />;
  if (kind === "headphones") return <PixelHeadphonesIcon size={16} />;
  if (kind === "scroll") return <PixelScrollIcon size={16} />;
  return <PixelFilmIcon size={16} />;
}

export function StoryLibrary({
  stories,
  onSelectStory,
  onSelectDictation,
  onSelectChoukai,
  onSelectDokkai,
  onSelectGengo,
}: StoryLibraryProps) {
  const [tab, setTab] = useState<NavTab>("home");

  const nonJlpt = useMemo(() => stories.filter((s) => s.category !== "jlpt"), [stories]);
  const kotobaSeries = useMemo(
    () => nonJlpt.filter((s) => s.id.startsWith("kotoba-mura")),
    [nonJlpt]
  );
  const heroStory = kotobaSeries[0] ?? nonJlpt[0] ?? null;
  const standaloneStories = useMemo(
    () => nonJlpt.filter((s) => !s.id.startsWith("kotoba-mura")),
    [nonJlpt]
  );
  const homePreviewStories = useMemo(
    () => nonJlpt.filter((s) => s.id !== heroStory?.id).slice(0, 3),
    [nonJlpt, heroStory]
  );

  const examGroups = useMemo<ExamGroup[]>(() => {
    const map = new Map<string, ExamGroup>();
    for (const s of stories) {
      if (s.category !== "jlpt") continue;
      const term = extractExamTerm(s);
      if (!map.has(term)) {
        map.set(term, {
          term,
          levelLabel: shortLevel(s.level),
          items: [],
        });
      }
      map.get(term)!.items.push(s);
    }
    return [...map.values()].map((g) => ({
      ...g,
      items: [...g.items].sort((a, b) => examPartMeta(a).order - examPartMeta(b).order),
    }));
  }, [stories]);

  const openItem = (item: StoryCatalogEntry, autoplay = false) => {
    if (item.kind === "jlpt-choukai") {
      onSelectChoukai(item.id);
      return;
    }
    if (item.kind === "jlpt-dokkai") {
      onSelectDokkai(item.id);
      return;
    }
    if (item.kind === "jlpt-gengo") {
      onSelectGengo(item.id);
      return;
    }
    if (item.kind === "standalone" && item.href) {
      const target = resolveAssetUrl(item.href);
      window.location.href = autoplay ? `${target}?auto=1` : target;
      return;
    }
    onSelectStory(item.id, autoplay);
  };

  const renderStoryCard = (item: StoryCatalogEntry) => {
    const dictDone = getSavedDictationCount(item.id);
    return (
      <article key={item.id} className="washi-card">
        <div
          className="washi-card-thumb"
          onClick={() => openItem(item, false)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              openItem(item, false);
            }
          }}
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
              style={item.thumbStyle === "hachiko" ? "hachiko" : "konbini"}
            />
          )}
          <span className="washi-level-tag">{shortLevel(item.level)}</span>
        </div>

        <div className="washi-card-body">
          <div className="washi-card-text" onClick={() => openItem(item, false)}>
            <h3 className="washi-card-ja">{item.titleJa}</h3>
            <p className="washi-card-vi">{item.titleVi}</p>
          </div>

          <div className="washi-card-footer">
            <button
              type="button"
              className="washi-btn-play"
              onClick={() => openItem(item, false)}
            >
              <PixelPlayIcon size={14} />
              <span>Vào học</span>
            </button>
            <button
              type="button"
              className="washi-btn-dict"
              onClick={() => onSelectDictation(item.id)}
              title="Luyện nghe chép chính tả VOICEVOX"
            >
              <PixelHeadphonesIcon size={14} />
              <span>Nghe chép</span>
              {dictDone > 0 && (
                <span className="washi-done-chip">
                  <PixelCheckIcon size={11} />
                  {dictDone}
                </span>
              )}
            </button>
          </div>
        </div>
      </article>
    );
  };

  const renderExamCard = (group: ExamGroup, detailed: boolean) => (
    <div key={group.term} className={`washi-exam-box ${detailed ? "detailed" : ""}`}>
      <div className="washi-exam-head">
        <div>
          <div className="washi-eyebrow">Đề thi chính thức</div>
          <h3 className="washi-exam-title">
            JLPT {group.levelLabel} · Kỳ tháng {group.term}
          </h3>
        </div>
        <span className="washi-exam-count">{group.items.length} phần</span>
      </div>

      <div className={`washi-exam-grid ${detailed ? "detailed" : ""}`}>
        {group.items.map((item) => {
          const meta = examPartMeta(item);
          const dictDone = meta.hasDictation ? getSavedDictationCount(item.id) : 0;
          return (
            <div key={item.id} className="washi-exam-tile-wrap">
              <button
                type="button"
                className="washi-exam-tile"
                onClick={() => openItem(item, false)}
              >
                <span className="washi-exam-tile-main">
                  <span className="washi-exam-icon">
                    <ExamPartIcon kind={meta.icon} />
                  </span>
                  <span className="washi-exam-tile-copy">
                    <span className="washi-exam-tile-label">{meta.label}</span>
                    {detailed && <span className="washi-exam-tile-sub">{meta.sub}</span>}
                  </span>
                </span>
                <span className="washi-exam-tile-stat">
                  {meta.total > 0 && meta.done > 0 ? (
                    <span className="washi-stat-done">
                      <PixelCheckIcon size={12} />
                      {meta.done}/{meta.total}
                    </span>
                  ) : (
                    meta.countLabel
                  )}
                </span>
              </button>
              {detailed && meta.hasDictation && (
                <button
                  type="button"
                  className="washi-exam-dict-btn"
                  onClick={() => onSelectDictation(item.id)}
                  title="Nghe chép chính tả phần này"
                >
                  <PixelHeadphonesIcon size={14} />
                  <span>Nghe chép</span>
                  {dictDone > 0 && <span className="washi-done-chip">{dictDone}</span>}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  const heroDictDone = heroStory ? getSavedDictationCount(heroStory.id) : 0;

  return (
    <div className="washi-library">
      {/* Clean Warm Washi Top Navigation */}
      <header className="washi-topbar">
        <div className="washi-topbar-inner">
          <button
            type="button"
            className="washi-brand"
            onClick={() => setTab("home")}
          >
            <span className="washi-brand-mascot">
              <img
                src={resolveAssetUrl("shared/kotoba-mura/sprites/stackchan_happy/frame_00.png")}
                alt="Stack-chan"
                className="library-thumb-canvas"
              />
            </span>
            <span className="washi-brand-text">
              <span className="washi-brand-title">
                ことば村 <span className="washi-brand-sep">· jp-pixel-story</span>
              </span>
              <span className="washi-brand-sub">
                Học Tiếng Nhật N5–N4 qua hoạt ảnh pixel &amp; đề thi thật
              </span>
            </span>
          </button>

          <nav className="washi-nav" aria-label="Điều hướng chính">
            <button
              type="button"
              className={`washi-nav-btn ${tab === "home" ? "active" : ""}`}
              onClick={() => setTab("home")}
            >
              <PixelHomeIcon size={15} />
              <span>Trang chính</span>
            </button>
            <button
              type="button"
              className={`washi-nav-btn ${tab === "stories" ? "active" : ""}`}
              onClick={() => setTab("stories")}
            >
              <PixelBookIcon size={15} />
              <span>Câu chuyện ({nonJlpt.length})</span>
            </button>
            <button
              type="button"
              className={`washi-nav-btn ${tab === "jlpt" ? "active" : ""}`}
              onClick={() => setTab("jlpt")}
            >
              <PixelExamIcon size={15} />
              <span>Luyện thi JLPT ({examGroups.length} kỳ)</span>
            </button>
          </nav>
        </div>
      </header>

      <main className="washi-main">
        {/* TAB 1: TRANG CHÍNH (Calm & Clear Overview) */}
        {tab === "home" && (
          <>
            {heroStory && (
              <section className="washi-hero" aria-label="Tập nổi bật">
                <div
                  className="washi-hero-media"
                  onClick={() => openItem(heroStory, false)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openItem(heroStory, false);
                    }
                  }}
                >
                  {heroStory.thumbImage ? (
                    <img
                      src={resolveAssetUrl(heroStory.thumbImage)}
                      alt={heroStory.titleJa}
                      className="library-thumb-canvas"
                    />
                  ) : (
                    <MiniPreviewCanvas title={heroStory.titleJa} />
                  )}
                  <span className="washi-hero-pill">
                    <PixelSparkleIcon size={13} />
                    <span>MỚI NHẤT · SERIES ことば村</span>
                  </span>
                </div>

                <div className="washi-hero-body">
                  <div>
                    <div className="washi-eyebrow">
                      {heroStory.level} · {heroStory.sceneCount} cảnh tương tác · {heroStory.vocabCount} từ vựng
                    </div>
                    <h1 className="washi-hero-ja">{heroStory.titleJa}</h1>
                    <p className="washi-hero-vi">{heroStory.titleVi}</p>
                    <p className="washi-hero-desc">
                      Buổi sáng đầu tiên của Lin ở quán trọ nhỏ ことば屋, bài học bẫy kính ngữ cùng chị Hana và cú hết pin giữa vườn của Stack-chan.
                    </p>
                  </div>

                  <div className="washi-hero-actions">
                    <button
                      type="button"
                      className="washi-cta-primary"
                      onClick={() => openItem(heroStory, false)}
                    >
                      <PixelPlayIcon size={15} />
                      <span>Vào học Tập 1</span>
                    </button>
                    <button
                      type="button"
                      className="washi-cta-secondary"
                      onClick={() => onSelectDictation(heroStory.id)}
                    >
                      <PixelHeadphonesIcon size={15} />
                      <span>Nghe chép</span>
                      {heroDictDone > 0 && (
                        <span className="washi-done-chip">
                          <PixelCheckIcon size={11} />
                          {heroDictDone}
                        </span>
                      )}
                    </button>
                  </div>
                </div>
              </section>
            )}

            {/* Shelf 1: Featured Stories */}
            <section className="washi-section">
              <div className="washi-sec-head">
                <div className="washi-sec-title-row">
                  <span className="washi-sec-icon">
                    <PixelBookIcon size={18} />
                  </span>
                  <div>
                    <h2 className="washi-sec-title">Câu chuyện &amp; Tình huống ngắn</h2>
                    <p className="washi-sec-sub">
                      Hoạt ảnh 2D tương tác · Bài đọc có ふりがな · Luyện nghe chép VOICEVOX
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="washi-link-more"
                  onClick={() => setTab("stories")}
                >
                  <span>Xem tất cả {nonJlpt.length} bài</span>
                  <PixelArrowRightIcon size={14} />
                </button>
              </div>

              <div className="washi-story-grid">
                {homePreviewStories.map(renderStoryCard)}
              </div>
            </section>

            {/* Shelf 2: Grouped JLPT Exam Rooms */}
            {examGroups.length > 0 && (
              <section className="washi-section">
                <div className="washi-sec-head">
                  <div className="washi-sec-title-row">
                    <span className="washi-sec-icon">
                      <PixelExamIcon size={18} />
                    </span>
                    <div>
                      <h2 className="washi-sec-title">Phòng Luyện thi Đề thật JLPT N4</h2>
                      <p className="washi-sec-sub">
                        Gom gọn theo từng kỳ thi · Đủ Từ vựng–Ngữ pháp, Nghe hiểu MP3 &amp; Đọc hiểu
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="washi-link-more"
                    onClick={() => setTab("jlpt")}
                  >
                    <span>Mở phòng thi</span>
                    <PixelArrowRightIcon size={14} />
                  </button>
                </div>

                <div className="washi-exam-list">
                  {examGroups.map((g) => renderExamCard(g, false))}
                </div>
              </section>
            )}
          </>
        )}

        {/* TAB 2: TẤT CẢ CÂU CHUYỆN & SERIES */}
        {tab === "stories" && (
          <>
            {kotobaSeries.length > 0 && (
              <section className="washi-section">
                <div className="washi-sec-head">
                  <div className="washi-sec-title-row">
                    <span className="washi-sec-icon">
                      <PixelSparkleIcon size={18} />
                    </span>
                    <div>
                      <h2 className="washi-sec-title">Series dài kỳ · ことば村の小さな旅館</h2>
                      <p className="washi-sec-sub">
                        Vũ trụ làng Kotoba cùng Stack-chan, Lin &amp; chị Hana
                      </p>
                    </div>
                  </div>
                  <span className="washi-sec-meta">{kotobaSeries.length} tập</span>
                </div>
                <div className="washi-story-grid">
                  {kotobaSeries.map(renderStoryCard)}
                </div>
              </section>
            )}

            <section className="washi-section">
              <div className="washi-sec-head">
                <div className="washi-sec-title-row">
                  <span className="washi-sec-icon">
                    <PixelBookIcon size={18} />
                  </span>
                  <div>
                    <h2 className="washi-sec-title">Truyện kể &amp; Tình huống đời sống</h2>
                    <p className="washi-sec-sub">
                      Mỗi bài gồm hoạt ảnh tương tác, trang đọc hiểu kèm Hán Việt &amp; bài nghe chép
                    </p>
                  </div>
                </div>
                <span className="washi-sec-meta">{standaloneStories.length} bài</span>
              </div>
              <div className="washi-story-grid">
                {standaloneStories.map(renderStoryCard)}
              </div>
            </section>
          </>
        )}

        {/* TAB 3: PHÒNG LUYỆN THI JLPT */}
        {tab === "jlpt" && (
          <section className="washi-section">
            <div className="washi-sec-head">
              <div className="washi-sec-title-row">
                <span className="washi-sec-icon">
                  <PixelExamIcon size={18} />
                </span>
                <div>
                  <h2 className="washi-sec-title">Phòng Luyện thi Đề thật JLPT N4</h2>
                  <p className="washi-sec-sub">
                    Chọn đúng phần thi muốn luyện hoặc bấm Nghe chép để luyện phản xạ từng câu
                  </p>
                </div>
              </div>
              <span className="washi-sec-meta">{examGroups.length} kỳ thi</span>
            </div>

            <div className="washi-exam-list detailed">
              {examGroups.map((g) => renderExamCard(g, true))}
            </div>
          </section>
        )}

        <footer className="washi-footer">
          <span>ことば村 · jp-pixel-story</span>
          <span>Hoạt ảnh 2D Pixel Art · VOICEVOX · JLPT N5–N4</span>
        </footer>
      </main>
    </div>
  );
}
