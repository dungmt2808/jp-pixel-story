# jp-pixel-story 🍙✨

**Nền tảng học Tiếng Nhật 2D Pixel Art tương tác & Luyện đề JLPT 4 kỹ năng — chi phí vận hành 0đ** (kết hợp **VOICEVOX** local + **Mini-PixelLab & JLPT QA MCP Server** + **HTML5 Canvas / React** + **GitHub Pages**).

👉 **Dùng thử trực tuyến:** https://dungmt2808.github.io/jp-pixel-story/

---

## ✨ Điểm nổi bật (v2.0)

### 1. Thư viện 13 bài học chuẩn 3 danh mục
- **📝 Đề thi JLPT (8 bài — trọn bộ 100% JLPT N4 năm 2025: 07/2025 & 12/2025, 170 câu thi thật):**
  - **漢 文字・語彙・文法 (`JlptGengoView`):** Đủ 49 câu/kỳ (28 Từ vựng + 21 Ngữ pháp), tự ẩn Furigana & dịch chống lộ đáp án câu Kanji, nháp ghép 4 mảnh câu `★` tương tác (`問題2`), đoạn văn đục lỗ bấm điền trực tiếp (`問題3`).
  - **📖 読解 問題4・6 (`JlptDokkaiView`):** Khung Email / Giấy nhắn / Thông báo / Bảng tra cứu chuẩn đề thật, có **bộ lọc điều kiện đồng bộ nhiều bảng** (`問題6`), **mô phỏng thời tiết nắng/mưa** & **trục thời gian mốc giờ** (`問題4`), giọng VOICEVOX từng câu + Daily Dictation.
  - **🎬 読解 問題5 (`CinemaStage` / `DepatoStage`):** Chuyển thể nguyên văn bài đọc trung văn (`デパートの雨の音楽` & `日本の生活`) thành hoạt ảnh 2D pixel tương tác + câu 25–27 thi thật.
  - **🎧 聴解 (`JlptChoukaiView`):** Đủ 28 câu/kỳ cắt trực tiếp từ MP3 gốc phòng thi, tranh minh họa xóa sạch watermark, 2 chế độ **Thi thử / Học sâu**, Script đầy đủ `ふりがな` + **26 câu Daily Dictation giọng Nhật thật**.
- **💬 Tình huống đời sống (`situation`):** `夜のコンビニ` (Mua cơm nắm nửa đêm), `深夜のラーメン屋` (Gọi mì Ramen đêm mưa — hybrid AI pixel art), `はじめてのお花見` (truyện demo engine `cinema` dữ liệu hoá + nhân vật hoạt hình theo frame).
- **📖 Câu chuyện & Đọc hiểu (`story`):** `鶴の恩返し` (Chim Hạc Trả Ơn — AI Pixel Art thống nhất bảng màu), `ハチ公の話` (Chú chó Hachikō ở ga Shibuya).

### 2. Trải nghiệm học Tiếng Nhật 3 trong 1 (không Romaji)
- **`ふりがな ON/OFF`** trên toàn bộ hệ thống (cú pháp gọn `{漢字|かんじ}`).
- **`🇻🇳 Dịch ON/OFF`** trên **tất cả video tương tác** (kể cả Hachikō canvas), trang Bài đọc và phòng luyện JLPT.
- **🎧 Daily Dictation (`DictationView`):** Chế độ gõ chép chính tả (chấp nhận cả Kanji lẫn Hiragana, diff từng ký tự) & chế độ ghép cụm từ trên điện thoại, phím tắt `Ctrl+Space` / `Alt+H`, tự lưu tiến độ trên trình duyệt.

### 3. Local MCP Server 23 công cụ (`mcp-server/server.py`)
Dùng tự động cho cả **Antigravity** (`.agents/plugins/jp-pixel-studio/`) và **Claude Code** (`.mcp.json` & `.claude/skills/jp-pixel-story/`):
- **VOICEVOX TTS (6 tools):** `voicevox_health`, `voicevox_list_speakers`, `voicevox_synthesize_line`, `voicevox_generate_story_audio`, `voicevox_generate_dokkai_audio`, `voicevox_generate_standalone_pack` — cache theo `ttsHash`, lưu tiến độ khi engine lỗi giữa chừng, gói standalone không ghi đè dữ liệu viết tay.
- **Content QA (2 tools):** `story_validate_content`, `story_validate_catalog` — Furigana, MP3, quiz, thư mục mồ côi, asset lệch bảng màu/thiếu, `meta.json`/`rig.json` hỏng, audio cũ; cảnh báo (hoặc lỗi nếu truyện khai báo `artQuality`) về viền, nhiễu, số màu, thiếu provenance.
- **Mini-PixelLab — xử lý ảnh (9 tools):** `pixellab_clean_background`, `pixellab_clean_sprite`, `pixellab_slice_spritesheet` (chung tỉ lệ + điểm neo, chống trôi `centroid`/`bust`), `pixellab_detect_grid` + `pixellab_depixelize` (dò lưới pixel giả của ảnh AI → dựng lại pixel thật), `pixellab_cleanup_sprite` + `pixellab_sprite_quality` (dọn nhiễu, ép viền `#241712`, góc pixel-perfect), `pixellab_relock_palette`, `pixellab_list_palettes`.
- **Mini-PixelLab — bảng màu & nguồn gốc (2 tools):** `pixellab_extract_palette` (trích/mở rộng bảng màu theo không khí cảnh), `pixellab_reprocess` (dựng lại asset từ `provenance.json`, kiểm tra trùng khớp từng byte).
- **Mini-PixelLab — nhân vật (3 tools):** `pixellab_lock_expressions` (áo/tóc không rung giữa các frame), `pixellab_add_expression` (thêm biểu cảm từ mảnh mắt/miệng), `pixellab_build_rig` (tách đầu/thân → thở, gật đầu, nhún khi nói).
- **JLPT (1 tool):** `jlpt_clean_exam_image`.

### 4. Engine hoạt hình dùng chung (`web/src/engine/`)
- **`useStageRuntime`**: 1 runtime cho cả 5 stage (tải asset/sprite, phát giọng — nếu trình duyệt chặn autoplay vẫn giữ đúng `durationSec`, chuyển cảnh Bayer, vòng lặp render, tín hiệu cho exporter).
- **Pixel-perfect**: vẽ vào buffer 320×200 rồi phóng **số nguyên** lên canvas; `drawPixelImage` / `drawSpriteFrame` / `drawPixelZoom` không bao giờ scale lẻ.
- **`SpriteAnimator`**: hoạt hình theo frame từ `meta.json` (idle chớp mắt, talk mấp máy miệng khi nhân vật nói).
- **`RigAnimator`**: nhân vật tách đầu/thân từ `rig.json` — thở, gật đầu khi nghe, nhún đầu khi nói, luôn theo bước nguyên pixel.
- **`CinemaStage` dữ liệu hoá 100%**: phông (`bg:` / `proc:`), hiệu ứng (`petals`, `snow`, `rain`, `bath_steam`), dàn nhân vật, ghi chú, nhãn nút… đều khai báo trong `story.json`.
- **Player điện ảnh v2** (giao diện kiểu ClassMate): thanh công cụ trên (`?` thẻ nhân vật, `ふ`, `JA·VI`, âm thanh), phụ đề nằm *dưới* khung hình, title card, tem địa điểm, nhãn chữ có đường dẫn 1px, mini-game kéo / chạm / giữ (`interaction`) với con trỏ tự chơi khi xuất video, thẻ thông tin giấy cũ có mục bí mật mở khoá, chuyển cảnh hoà tan dither (`cinemaFx.ts`, `cinemaUi.ts`).

---

## 🗂️ Cấu trúc thư mục

```text
jp-pixel-story/
├── .agents/plugins/jp-pixel-studio/   # Antigravity Plugin (MCP + Rules + Skill v2.0 + References)
├── .claude/skills/jp-pixel-story/     # Bản đồng bộ 100% cho Claude Code
├── art-src/                           # Ảnh gốc (không deploy) để dựng lại asset từ provenance.json
├── .github/workflows/deploy-pages.yml # CI tự chạy pytest + npm test + npm run build → GitHub Pages
├── mcp-server/                        # Local Python MCP Server (23 tools + pytest)
├── web/                               # React + Vite + HTML5 Canvas App + unit tests (npm test)
│   ├── public/stories/                # 12 bài học (index.json, story/choukai/dokkai/gengo.json, MP3)
│   ├── src/engine/                    # useStageRuntime, pixelScale, spriteAnimator, cinemaBackdrops...
│   └── src/components/                # CinemaStage, TsuruStage, DepatoStage, Jlpt*View, DictationView
└── exporter/                          # Xuất MP4 tất định (đồng hồ ảo Playwright + FFmpeg) + E2E check
```

---

## 🚀 Chạy & Kiểm thử Local

```bash
# 1. Kiểm thử Backend MCP & quét QA toàn bộ bài học trong index.json
cd mcp-server
uv sync --extra dev
PYTHONPATH=. uv run pytest -v

# 2. Chạy unit test Frontend (ruby, dictation & engine) + build kiểm tra
cd ../web
npm install
npm test
npm run build

# 3. Khởi động bản dev trên trình duyệt
npm run dev
```

### Xuất Video `.mp4` tự động (`exporter/`)
```bash
cd exporter
npm install
npm test                                              # unit test timeline/audio
node export_video.mjs --story hanami-first            # MP4 30fps, 960x600, đồng bộ tiếng-hình chính xác từng frame
node export_video.mjs --story hanami-first --check    # chạy nhanh hết truyện, không xuất video
npm run check:all                                     # mọi truyện hoạt hình phải chạy hết, không lỗi, không chồng tiếng
npm run test:e2e                                      # xuất MP4 thật rồi đo độ lệch tiếng-hình (≤ 50 ms)
```

> Ghi chú: audio của truyện demo `hanami-first` được tạo trong môi trường cloud không có VOICEVOX (giọng tạm qua Gemini TTS, đi qua đúng code `voicevox_generate_story_audio`). Trên máy có VOICEVOX, chạy lại `voicevox_generate_story_audio(story_json_path="web/public/stories/hanami-first/story.json", force=True)` để thay bằng giọng VOICEVOX.

---

## 📄 Giấy phép
MIT License — tự do sử dụng, mở rộng cho hành trình học Tiếng Nhật của bạn!
