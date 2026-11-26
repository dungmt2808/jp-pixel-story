import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { retroAudio } from "../audio/chiptune";
import type { ReadingSentence, StoryData } from "../types/story";
import { resolveAssetUrl } from "../utils/assetUrl";
import { rubyToPlain } from "../utils/ruby";
import { chapterImage, chunkByVocab, quizScore, readingChapters, sceneIndex } from "../utils/readingText";
import { WordCard } from "./reading/WordCard";
import { RubyText } from "./RubyText";

interface ReadingViewProps {
  story: StoryData;
  showFurigana: boolean;
  showVi: boolean;
  onToggleFurigana: () => void;
  onToggleVi: () => void;
  /** Back to the animation; with a scene index, the stage starts at that scene. */
  onBackToStory: (sceneIdx?: number) => void;
  onOpenLibrary: () => void;
  onOpenDictation: () => void;
}

interface ReaderSettings {
  size: "s" | "m" | "l";
  paper: "washi" | "sepia" | "night";
  vertical: boolean;
  /** 素読み: hide word underlines for a clean read. */
  plain: boolean;
}

const SETTINGS_KEY = "jp-reader-settings";
const DEFAULT_SETTINGS: ReaderSettings = { size: "m", paper: "washi", vertical: false, plain: false };
const KANJI_NUM = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";

function loadSettings(): ReaderSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<ReaderSettings>) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(s: ReaderSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // private mode / blocked storage: settings just do not persist
  }
}

export function ReadingView({
  story,
  showFurigana,
  showVi,
  onToggleFurigana,
  onToggleVi,
  onBackToStory,
  onOpenLibrary,
  onOpenDictation,
}: ReadingViewProps) {
  const reading = story.reading;
  const chapters = useMemo(() => readingChapters(story), [story]);
  const quizList = reading.quiz ?? [];
  const grammarList = reading.grammar ?? [];
  const byId = useMemo(() => new Map(reading.sentences.map((s) => [s.id, s])), [reading.sentences]);
  const vocabById = useMemo(() => new Map(reading.vocab.map((v) => [v.id, v])), [reading.vocab]);

  const [settings, setSettings] = useState<ReaderSettings>(loadSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [chapterIdx, setChapterIdx] = useState(0); // === chapters.length -> quiz page
  const [activeId, setActiveId] = useState<string | null>(null);
  const [playingAll, setPlayingAll] = useState(false);
  const [wordId, setWordId] = useState<string | null>(null);
  const [sideTab, setSideTab] = useState<"words" | "grammar">("words");
  const [visited, setVisited] = useState<Set<number>>(() => new Set([0]));
  const [firstPicks, setFirstPicks] = useState<Record<string, number>>({});
  const [picks, setPicks] = useState<Record<string, number>>({});

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const queueRef = useRef<string[]>([]);
  const sentRefs = useRef(new Map<string, HTMLElement>());

  const onQuiz = chapterIdx >= chapters.length && quizList.length > 0;
  const chapter = chapters[Math.min(chapterIdx, chapters.length - 1)];
  const chapterSentences = chapter.sentenceIds.map((id) => byId.get(id)).filter(Boolean) as ReadingSentence[];
  const img = chapterImage(chapter, story);
  const chapterScene = sceneIndex(story, chapter.scene);

  const updateSettings = (patch: Partial<ReaderSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  };

  const stopAudio = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  /** Play one sentence; `onEnd` fires when the clip ends (or after durationSec when audio is blocked). */
  const playSentence = useCallback(
    (sent: ReadingSentence, onEnd?: () => void) => {
      stopAudio();
      setActiveId(sent.id);
      const fallbackMs = Math.max(1200, (sent.durationSec ?? 3) * 1000);
      const finish = () => {
        if (timerRef.current !== null) window.clearTimeout(timerRef.current);
        timerRef.current = null;
        onEnd?.();
      };
      if (!sent.audioUrl) {
        timerRef.current = window.setTimeout(finish, fallbackMs);
        return;
      }
      const audio = new Audio(resolveAssetUrl(sent.audioUrl));
      audioRef.current = audio;
      audio.onended = finish;
      audio.play().catch(() => {
        timerRef.current = window.setTimeout(finish, fallbackMs);
      });
    },
    [stopAudio]
  );

  const playNextInQueue = useCallback(() => {
    const nextId = queueRef.current.shift();
    const next = nextId ? byId.get(nextId) : undefined;
    if (!next) {
      setPlayingAll(false);
      return;
    }
    playSentence(next, () => window.setTimeout(playNextInQueue, 350));
  }, [byId, playSentence]);

  const startReadAll = () => {
    const ids = chapter.sentenceIds;
    const startAt = activeId && ids.includes(activeId) && !playingAll ? ids.indexOf(activeId) : 0;
    queueRef.current = ids.slice(startAt);
    setPlayingAll(true);
    playNextInQueue();
  };

  const stopReadAll = () => {
    queueRef.current = [];
    setPlayingAll(false);
    stopAudio();
  };

  const goChapter = (idx: number) => {
    stopReadAll();
    setWordId(null);
    setChapterIdx(idx);
    setActiveId(null);
    setVisited((v) => new Set(v).add(idx));
    retroAudio.playClick();
  };

  // stop audio when leaving the page
  useEffect(() => () => stopAudio(), [stopAudio]);

  // keep the sentence being read in view (karaoke follow)
  useEffect(() => {
    if (!activeId) return;
    sentRefs.current.get(activeId)?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [activeId]);

  const pickAnswer = (qid: string, idx: number, correct: number) => {
    setPicks((p) => ({ ...p, [qid]: idx }));
    setFirstPicks((p) => (p[qid] === undefined ? { ...p, [qid]: idx } : p));
    if (idx === correct) retroAudio.playFanfare();
    else retroAudio.playClick();
  };

  const word = wordId ? vocabById.get(wordId) : undefined;
  const wordExample = word
    ? reading.sentences.find((s) => chunkByVocab(s.jaRuby, [word]).some((c) => c.vocabId === word.id))
    : undefined;
  const chapterWords = new Set(
    chapterSentences.flatMap((s) => chunkByVocab(s.jaRuby, reading.vocab).map((c) => c.vocabId).filter(Boolean))
  );
  const score = quizScore(firstPicks, quizList);
  const activeSentence = activeId ? byId.get(activeId) : undefined;
  const readIdx = activeId ? chapter.sentenceIds.indexOf(activeId) : -1;

  const renderSentence = (sent: ReadingSentence, n: number) => {
    const chunks = chunkByVocab(sent.jaRuby, reading.vocab);
    return (
      <span
        key={sent.id}
        ref={(el) => {
          if (el) sentRefs.current.set(sent.id, el);
          else sentRefs.current.delete(sent.id);
        }}
        className={`rd-sent ${activeId === sent.id ? "active" : ""}`}
        onClick={() => {
          stopReadAll();
          playSentence(sent);
        }}
      >
        <span className="rd-sent-ja">
          {!settings.vertical && <span className="rd-num">{CIRCLED[n] ?? `${n + 1}.`}</span>}
          {chunks.map((c, i) =>
            c.vocabId && !settings.plain ? (
              <button
                type="button"
                key={i}
                className={`rd-word ${wordId === c.vocabId ? "on" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setWordId(c.vocabId ?? null);
                  setSideTab("words");
                  retroAudio.playClick();
                }}
              >
                <RubyText segments={c.segs} showFurigana={showFurigana} />
              </button>
            ) : (
              <RubyText key={i} segments={c.segs} showFurigana={showFurigana} />
            )
          )}
        </span>
        {showVi && !settings.vertical && <span className="rd-sent-vi">{sent.vi}</span>}
      </span>
    );
  };

  return (
    <div className={`rd-shell paper-${settings.paper} size-${settings.size}`}>
      <header className="rd-top">
        <div className="rd-top-group">
          <button type="button" className="rd-chip" onClick={() => onBackToStory()}>
            ← Hoạt ảnh
          </button>
          <button type="button" className="rd-chip ghost" onClick={onOpenLibrary}>
            Thư viện
          </button>
        </div>
        <div className="rd-brand">
          <span className="rd-hanko" aria-hidden>
            読
          </span>
          <div>
            <div className="rd-brand-title">{story.titleJa}</div>
            <div className="rd-brand-sub">
              {story.level} · ĐỌC BÀI
            </div>
          </div>
        </div>
        <div className="rd-top-group">
          <button type="button" className={`rd-chip tool ${showFurigana ? "on" : ""}`} onClick={onToggleFurigana} title="Furigana">
            ふ
          </button>
          <button type="button" className={`rd-chip tool ${showVi ? "on" : ""}`} onClick={onToggleVi} title="Dịch tiếng Việt">
            VI
          </button>
          <button
            type="button"
            className={`rd-chip tool ${showSettings ? "on" : ""}`}
            onClick={() => setShowSettings((v) => !v)}
            title="Cài đặt đọc"
          >
            Aa
          </button>
          <button type="button" className="rd-chip ai" onClick={onOpenDictation}>
            🎧 Nghe chép
          </button>
        </div>
        {showSettings && (
          <div className="rd-settings" role="dialog" aria-label="Cài đặt đọc">
            <div className="rd-set-row">
              <span>Cỡ chữ</span>
              {(["s", "m", "l"] as const).map((sz) => (
                <button key={sz} type="button" className={settings.size === sz ? "on" : ""} onClick={() => updateSettings({ size: sz })}>
                  {sz === "s" ? "A-" : sz === "m" ? "A" : "A+"}
                </button>
              ))}
            </div>
            <div className="rd-set-row">
              <span>Giấy</span>
              {(
                [
                  ["washi", "和紙"],
                  ["sepia", "古書"],
                  ["night", "夜"],
                ] as const
              ).map(([p, label]) => (
                <button key={p} type="button" className={settings.paper === p ? "on" : ""} onClick={() => updateSettings({ paper: p })}>
                  {label}
                </button>
              ))}
            </div>
            <div className="rd-set-row">
              <span>Chiều chữ</span>
              <button type="button" className={!settings.vertical ? "on" : ""} onClick={() => updateSettings({ vertical: false })}>
                横書き
              </button>
              <button type="button" className={settings.vertical ? "on" : ""} onClick={() => updateSettings({ vertical: true })}>
                縦書き
              </button>
            </div>
            <div className="rd-set-row">
              <span>Đọc trơn</span>
              <button type="button" className={settings.plain ? "on" : ""} onClick={() => updateSettings({ plain: !settings.plain })}>
                {settings.plain ? "BẬT" : "TẮT"}
              </button>
              <small>ẩn gạch chân từ vựng</small>
            </div>
          </div>
        )}
      </header>

      <nav className="rd-toc" aria-label="Mục lục">
        {chapters.map((c, i) => (
          <button
            key={c.id}
            type="button"
            className={`rd-toc-item ${i === chapterIdx ? "on" : ""} ${visited.has(i) ? "seen" : ""}`}
            onClick={() => goChapter(i)}
          >
            <span className="rd-toc-num">{KANJI_NUM[i] ?? i + 1}</span>
            <span className="rd-toc-title">
              <RubyText segments={c.title} showFurigana={false} />
            </span>
          </button>
        ))}
        {quizList.length > 0 && (
          <button type="button" className={`rd-toc-item quiz ${onQuiz ? "on" : ""}`} onClick={() => goChapter(chapters.length)}>
            <span className="rd-toc-num">問</span>
            <span className="rd-toc-title">確認テスト</span>
          </button>
        )}
      </nav>

      <div className="rd-body">
        <main className="rd-page">
          {!onQuiz ? (
            <>
              <div className="rd-ch-head">
                <span className="rd-ch-label">第{KANJI_NUM[chapterIdx] ?? chapterIdx + 1}章</span>
                <h1 className="rd-ch-title">
                  <RubyText segments={chapter.title} showFurigana={showFurigana} />
                </h1>
                {chapter.titleVi && showVi && <div className="rd-ch-vi">{chapter.titleVi}</div>}
              </div>

              {img && (
                <figure className="rd-figure">
                  <img src={resolveAssetUrl(img)} alt="" />
                  <figcaption>
                    <span>🎬 Cảnh bạn đã xem trong hoạt ảnh</span>
                    {chapterScene >= 0 && (
                      <button type="button" className="rd-link" onClick={() => onBackToStory(chapterScene)}>
                        ▶ Xem lại cảnh này
                      </button>
                    )}
                  </figcaption>
                </figure>
              )}

              <div className={`rd-text ${settings.vertical ? "tate" : "yoko"}`}>
                {chapterSentences.map((s, n) => renderSentence(s, n))}
              </div>
              {settings.vertical && showVi && activeSentence && <div className="rd-vi-strip">{activeSentence.vi}</div>}

              <div className="rd-pager">
                <button type="button" className="rd-chip ghost" disabled={chapterIdx === 0} onClick={() => goChapter(chapterIdx - 1)}>
                  ← Chương trước
                </button>
                <span className="rd-pager-n">
                  {chapterIdx + 1} / {chapters.length}
                </span>
                {chapterIdx + 1 < chapters.length ? (
                  <button type="button" className="rd-chip" onClick={() => goChapter(chapterIdx + 1)}>
                    Chương sau →
                  </button>
                ) : quizList.length > 0 ? (
                  <button type="button" className="rd-chip shu" onClick={() => goChapter(chapters.length)}>
                    Làm bài kiểm tra →
                  </button>
                ) : (
                  <span />
                )}
              </div>
            </>
          ) : (
            <section className="rd-quiz">
              <div className="rd-ch-head">
                <span className="rd-ch-label">確認テスト</span>
                <h1 className="rd-ch-title">
                  <RubyText segments="{読解|どっかい}クイズ" showFurigana={showFurigana} />
                </h1>
                <div className="rd-ch-vi">Chỉ tính lần chọn đầu tiên của mỗi câu.</div>
              </div>
              {quizList.map((q, qi) => {
                const picked = picks[q.id];
                const ok = picked === q.correctIndex;
                return (
                  <div key={q.id} className="rd-q">
                    <div className="rd-q-ja">
                      <b>問{qi + 1}</b> <RubyText segments={q.questionJa} showFurigana={showFurigana} />
                    </div>
                    {(showVi || picked !== undefined) && <div className="rd-q-vi">{q.questionVi}</div>}
                    <div className="rd-q-opts">
                      {q.options.map((opt, oi) => (
                        <button
                          key={oi}
                          type="button"
                          className={`rd-q-opt ${picked === oi ? (oi === q.correctIndex ? "ok" : "no") : ""}`}
                          onClick={() => pickAnswer(q.id, oi, q.correctIndex)}
                        >
                          {/* JLPT options already carry their own "1." numbering */}
                          {!/^\s*[0-9０-９]/.test(rubyToPlain(opt.ja)) && <span className="rd-q-key">{"ABCD"[oi]}</span>}
                          <span className="rd-q-text">
                            <RubyText segments={opt.ja} showFurigana={showFurigana} />
                          </span>
                        </button>
                      ))}
                    </div>
                    {picked !== undefined && (
                      <div className={`rd-q-fb ${ok ? "ok" : "no"}`}>
                        {ok ? (
                          <>
                            <b>正解！</b> {q.explanationVi}
                          </>
                        ) : (
                          <>
                            <b>もう一度…</b> Đọc lại chương liên quan rồi chọn đáp án khác nhé.
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {score.answered === score.total && score.total > 0 && (
                <div className="rd-result">
                  <span className={`rd-stamp ${score.correct * 3 >= score.total * 2 ? "pass" : "retry"}`}>
                    {score.correct * 3 >= score.total * 2 ? "合格" : "再挑戦"}
                  </span>
                  <div>
                    <b>
                      {score.correct} / {score.total}
                    </b>{" "}
                    câu đúng ngay lần đầu
                    <div className="rd-result-actions">
                      <button type="button" className="rd-chip ai" onClick={onOpenDictation}>
                        🎧 Luyện nghe chép
                      </button>
                      <button type="button" className="rd-chip ghost" onClick={() => onBackToStory(0)}>
                        ↺ Xem lại hoạt ảnh
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </section>
          )}
        </main>

        <aside className="rd-side">
          {word ? (
            <WordCard
              item={word}
              example={wordExample}
              showFurigana={showFurigana}
              showVi={showVi}
              onPlayExample={(s) => {
                stopReadAll();
                playSentence(s);
              }}
              onClose={() => setWordId(null)}
            />
          ) : (
            <div className="rd-side-hint">Chạm vào từ được gạch chân trong bài để mở thẻ từ.</div>
          )}

          <div className="rd-tabs">
            <button type="button" className={sideTab === "words" ? "on" : ""} onClick={() => setSideTab("words")}>
              単語帳 · {reading.vocab.length}
            </button>
            {grammarList.length > 0 && (
              <button type="button" className={sideTab === "grammar" ? "on" : ""} onClick={() => setSideTab("grammar")}>
                文法 · {grammarList.length}
              </button>
            )}
          </div>

          {sideTab === "words" ? (
            <ul className="rd-wordlist">
              {reading.vocab.map((v) => (
                <li key={v.id}>
                  <button
                    type="button"
                    className={`${wordId === v.id ? "on" : ""} ${chapterWords.has(v.id) ? "here" : ""}`}
                    onClick={() => setWordId(v.id)}
                  >
                    <span className="w">{v.word}</span>
                    <span className="r">{v.reading}</span>
                    <span className="m">{v.meaningVi}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="rd-grammar">
              {grammarList.map((g) => (
                <div key={g.id} className="rd-g">
                  <div className="rd-g-top">
                    <b>{g.pattern}</b>
                    <span className="rd-tag">{g.level}</span>
                  </div>
                  <div className="rd-g-m">{g.meaningVi}</div>
                  <div className="rd-g-x">{g.explanation}</div>
                  <div className="rd-g-ex">
                    {g.exampleRuby ? <RubyText segments={g.exampleRuby} showFurigana={showFurigana} /> : g.exampleJa}
                    {showVi && <small>{g.exampleVi}</small>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>

      {!onQuiz && (
        <div className="rd-player">
          <button type="button" className="rd-chip shu" onClick={playingAll ? stopReadAll : startReadAll}>
            {playingAll ? "■ Dừng" : "▶ Đọc cả chương"}
          </button>
          <div className="rd-player-bar" aria-hidden>
            {chapter.sentenceIds.map((id, i) => (
              <span key={id} className={i < readIdx ? "done" : i === readIdx ? "now" : ""} />
            ))}
          </div>
          <span className="rd-player-n">
            {readIdx >= 0 ? readIdx + 1 : 0} / {chapter.sentenceIds.length} câu
          </span>
        </div>
      )}
    </div>
  );
}
