# jp-pixel-story 🍙✨

**Nền tảng học Tiếng Nhật 2D Pixel Art tương tác & Luyện đề JLPT 4 kỹ năng — chi phí vận hành 0đ** (kết hợp **VOICEVOX** local + **Mini-PixelLab & JLPT QA MCP Server** + **HTML5 Canvas / React** + **GitHub Pages**).

👉 **Dùng thử trực tuyến:** https://dungmt2808.github.io/jp-pixel-story/

---

## ✨ Điểm nổi bật (v2.0)

### 1. Thư viện 12 bài học chuẩn 3 danh mục
- **📝 Đề thi JLPT (8 bài — trọn bộ 100% JLPT N4 năm 2025: 07/2025 & 12/2025, 170 câu thi thật):**
  - **漢 文字・語彙・文法 (`JlptGengoView`):** Đủ 49 câu/kỳ (28 Từ vựng + 21 Ngữ pháp), tự ẩn Furigana & dịch chống lộ đáp án câu Kanji, nháp ghép 4 mảnh câu `★` tương tác (`問題2`), đoạn văn đục lỗ bấm điền trực tiếp (`問題3`).
  - **📖 読解 問題4・6 (`JlptDokkaiView`):** Khung Email / Giấy nhắn / Thông báo / Bảng tra cứu chuẩn đề thật, có **bộ lọc điều kiện đồng bộ nhiều bảng** (`問題6`), **mô phỏng thời tiết nắng/mưa** & **trục thời gian mốc giờ** (`問題4`), giọng VOICEVOX từng câu + Daily Dictation.
  - **🎬 読解 問題5 (`CinemaStage` / `DepatoStage`):** Chuyển thể nguyên văn bài đọc trung văn (`デパートの雨の音楽` & `日本の生活`) thành hoạt ảnh 2D pixel tương tác + câu 25–27 thi thật.
  - **🎧 聴解 (`JlptChoukaiView`):** Đủ 28 câu/kỳ cắt trực tiếp từ MP3 gốc phòng thi, tranh minh họa xóa sạch watermark, 2 chế độ **Thi thử / Học sâu**, Script đầy đủ `ふりがな` + **26 câu Daily Dictation giọng Nhật thật**.
- **💬 Tình huống đời sống (`situation`):** `夜のコンビニ` (Mua cơm nắm nửa đêm), `深夜のラーメン屋` (Gọi mì Ramen đêm mưa — hybrid AI pixel art).
- **📖 Câu chuyện & Đọc hiểu (`story`):** `鶴の恩返し` (Chim Hạc Trả Ơn — AI Pixel Art thống nhất bảng màu), `ハチ公の話` (Chú chó Hachikō ở ga Shibuya).

### 2. Trải nghiệm học Tiếng Nhật 3 trong 1 (không Romaji)
- **`ふりがな ON/OFF`** trên toàn bộ hệ thống (cú pháp gọn `{漢字|かんじ}`).
- **`🇻🇳 Dịch ON/OFF`** trên **tất cả video tương tác** (kể cả Hachikō canvas), trang Bài đọc và phòng luyện JLPT.
- **🎧 Daily Dictation (`DictationView`):** Chế độ gõ chép chính tả (chấp nhận cả Kanji lẫn Hiragana, diff từng ký tự) & chế độ ghép cụm từ trên điện thoại, phím tắt `Ctrl+Space` / `Alt+H`, tự lưu tiến độ trên trình duyệt.

### 3. Local MCP Server 13 công cụ (`mcp-server/server.py`)
Dùng tự động cho cả **Antigravity** (`.agents/plugins/jp-pixel-studio/`) và **Claude Code** (`.mcp.json` & `.claude/skills/jp-pixel-story/`):
- **VOICEVOX TTS (6 tools):** `voicevox_health`, `voicevox_list_speakers`, `voicevox_synthesize_line`, `voicevox_generate_story_audio`, `voicevox_generate_dokkai_audio`, `voicevox_generate_standalone_pack`.
- **Content QA (2 tools):** `story_validate_content`, `story_validate_catalog` (kiểm tra 100% Furigana, MP3, `starOrder`, quiz bounds & thư mục mồ côi trên toàn bộ `index.json`).
- **Mini-PixelLab & JLPT Image (5 tools):** `pixellab_list_palettes`, `pixellab_clean_background`, `pixellab_clean_sprite`, `pixellab_slice_spritesheet`, `jlpt_clean_exam_image` (xóa watermark màu trên tranh đề thi JLPT).

---

## 🗂️ Cấu trúc thư mục

```text
jp-pixel-story/
├── .agents/plugins/jp-pixel-studio/   # Antigravity Plugin (MCP + Rules + Skill v2.0 + References)
├── .claude/skills/jp-pixel-story/     # Bản đồng bộ 100% cho Claude Code
├── .github/workflows/deploy-pages.yml # CI tự chạy pytest + npm test + npm run build → GitHub Pages
├── mcp-server/                        # Local Python MCP Server (13 tools + 10 pytest tests)
├── web/                               # React + Vite + HTML5 Canvas App + unit tests (npm test)
│   ├── public/stories/                # 12 bài học (index.json, story/choukai/dokkai/gengo.json, MP3)
│   └── src/components/                # CinemaStage, TsuruStage, DepatoStage, Jlpt*View, DictationView
└── exporter/                          # Script Playwright + FFmpeg xuất MP4 tự động
```

---

## 🚀 Chạy & Kiểm thử Local

```bash
# 1. Kiểm thử Backend MCP & quét QA toàn bộ 12 bài học trong index.json
cd mcp-server
uv sync --extra dev
PYTHONPATH=. uv run pytest -v

# 2. Chạy unit test Frontend (ruby.ts & dictation.ts) + build kiểm tra
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
npx playwright install chromium
node export_video.mjs --story jlpt-n4-2025-12-japan-life
```

---

## 📄 Giấy phép
MIT License — tự do sử dụng, mở rộng cho hành trình học Tiếng Nhật của bạn!
