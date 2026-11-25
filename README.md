# jp-pixel-story 🍙✨

**Studio tạo web truyện 2D Pixel Art tương tác & xuất video học Tiếng Nhật tự động — chi phí 0đ phát sinh** (kết hợp **VOICEVOX** trên máy + **Mini-PixelLab MCP** tự chế + **HTML5 Canvas** + **Antigravity / Claude Code**).

Lấy cảm hứng từ phong cách kể chuyện pixel art tương tác (chuyển cảnh *Bayer dithering*, phụ đề song ngữ, mini-game kéo thả, thẻ nhân vật & trang bài đọc chi tiết), được thiết kế riêng cho người học Tiếng Nhật (**Furigana `<ruby>` bật/tắt**, font pixel hỗ trợ đầy đủ Kanji `DotGothic16`, giọng đọc VOICEVOX đa nhân vật).

---

## ✨ Tính năng đã có sẵn trong repo

1. **Local MCP Server tự chế (`mcp-server/`) — dùng được cho cả Antigravity & Claude Code:**
   * **VOICEVOX TTS Tools:**
     * `voicevox_health` — kiểm tra VOICEVOX local (`http://127.0.0.1:50021`).
     * `voicevox_list_speakers` — liệt kê toàn bộ nhân vật & `speaker_id` đang cài trên máy.
     * `voicevox_synthesize_line` — đọc 1 câu tiếng Nhật → xuất `.wav` + trả về độ dài chính xác (`duration_sec`).
     * `voicevox_generate_story_audio` — đọc hàng loạt toàn bộ câu thoại & bài đọc trong `story.json`, tự điền `audioUrl` và `durationSec`.
   * **Mini-PixelLab Tools (thay thế PixelLab miễn phí):**
     * `pixellab_list_palettes` — 4 bảng màu retro Nhật (`midnight_tokyo`, `konbini_warm`, `kyoto_autumn`, `snes_rpg`).
     * `pixellab_clean_sprite` — tách nền thông minh (border flood-fill), ép lưới pixel chuẩn (xóa *mixel* & viền mờ), khóa bảng màu.
     * `pixellab_slice_spritesheet` — cắt ảnh sprite sheet AI (VD 4 frame đi bộ) thành `spritesheet.png` đều nhau + `meta.json`.
2. **Web 2D Pixel Art Tương Tác (`web/`) — chia 2 danh mục + giọng VOICEVOX thật:**
   * **Thư viện chia 2 mục rõ ràng:** **`💬 Tình huống đời sống`** (`situation`) và **`📖 Câu chuyện & Đọc hiểu`** (`story`).
   * **Nút ẩn/hiện `ふりがな ON/OFF`** trực tiếp trên cả hoạt ảnh lẫn trang bài đọc (không dùng Romaji để luyện đọc Kana/Kanji tự nhiên).
   * **Cuối mỗi bài đọc** đều có tổng hợp **📒 Từ vựng đã áp dụng**, **🧩 Ngữ pháp đã áp dụng** (kèm câu ví dụ) và **✅ 読解クイズ (Quiz đọc hiểu)**.
   * **2 bài học hoàn chỉnh có giọng VOICEVOX thật đi kèm:**
     * 💬 **`夜のコンビニ` (JLPT N5–N4):** Tình huống mua cơm nắm nửa đêm — kéo thả cơm nắm vào máy quét, chọn trả lời 「温めますか？」, 14 câu VOICEVOX, 6 từ vựng, 4 ngữ pháp, 3 câu quiz.
     * 📖 **`ハチ公の話` (JLPT N4):** Câu chuyện Hachikō ở ga Shibuya (1924–1935) với 5 cảnh tương tác phong phú (thẻ nhân vật, kéo Hachi ra ga, bấm đồng hồ, xoay 4 mùa, mở báo, kéo vải khánh thành tượng) + **31 file giọng VOICEVOX MP3** (25 câu thoại + 6 đoạn bài đọc), 18 mục từ vựng & ngữ pháp, 4 câu quiz đọc hiểu.
3. **Antigravity Plugin + Custom Skill & Claude Code Config:**
   * `.agents/plugins/jp-pixel-studio/` — tự động nạp Plugin, MCP Server, Rules và Skill `jp-pixel-story` khi mở project bằng **Antigravity**.
   * `.mcp.json` & `.claude/skills/jp-pixel-story/` — tự động nạp khi mở bằng **Claude Code**.
4. **Bộ xuất Video MP4 tự động (`exporter/`):**
   * Dùng **Playwright** mở `?autoplay=true` + thu thập timestamp từng câu VOICEVOX → **FFmpeg** trộn video với âm thanh `.wav` gốc chất lượng cao thành file `.mp4`.

---

## 🗂️ Cấu trúc thư mục

```text
jp-pixel-story/
├── .agents/plugins/jp-pixel-studio/   # Plugin + MCP + Custom Skill cho Antigravity
│   ├── plugin.json
│   ├── mcp_config.json
│   ├── rules/AGENTS.md
│   └── skills/jp-pixel-story/
│       ├── SKILL.md
│       └── references/story-schema.md
├── .claude/skills/jp-pixel-story/     # Mirror Skill cho Claude Code
├── .mcp.json                          # Cấu hình MCP cho Claude Code
├── AGENTS.md                          # Hướng dẫn chung cho AI Agent
├── mcp-server/                        # Local Python MCP Server (VOICEVOX + Mini-PixelLab)
│   ├── pyproject.toml
│   ├── server.py
│   ├── voicevox_client.py
│   ├── pixel_processor.py
│   ├── palettes.py
│   └── tests/test_tools.py
├── web/                               # React + Vite + HTML5 Canvas Interactive App
│   ├── public/stories/konbini-onigiri/
│   │   ├── story.json                 # Kịch bản + Furigana + Từ vựng JLPT
│   │   └── audio/*.wav                # 14 file giọng đọc thật từ VOICEVOX
│   └── src/
│       ├── audio/chiptune.ts          # Nhạc 8-bit + SFX bằng Web Audio API
│       ├── engine/bayerDither.ts      # Hiệu ứng chuyển cảnh Bayer 4x4
│       ├── engine/pixelRenderer.ts    # Engine vẽ 6 cảnh pixel art 320x200
│       └── components/                # PixelStage, ReadingView, CharacterCardModal, RubyText
└── exporter/                          # Script Playwright + FFmpeg xuất MP4 tự động
    └── export_video.mjs
```

---

## 🚀 Hướng dẫn chạy ngay (3 phút)

### Yêu cầu môi trường
* **VOICEVOX** (đang mở trên máy ở cổng `50021`) — để tạo bài mới (bài demo đã có sẵn 14 file `.wav` nên chạy web ngay cả khi tắt VOICEVOX!).
* **Python 3.10+** & **`uv`** (`curl -LsSf https://astral.sh/uv/install.sh | sh`).
* **Node.js 20+** & **`npm`**.
* **FFmpeg** (nếu dùng `exporter/` để xuất MP4).

### 1. Xem trực tuyến trên GitHub Pages (Không cần mở Terminal!)
Repo đã tích hợp sẵn GitHub Actions (`.github/workflows/deploy-pages.yml`) và **Thư viện truyện (`web/public/stories/index.json`)**:
1. Vào **GitHub Repo → Settings → Pages → Build and deployment → Source** chọn **`GitHub Actions`** (chỉ cần bật 1 lần duy nhất).
2. Đợi ~30 giây, mở web học trực tuyến trên điện thoại hoặc máy tính tại:
   `https://dungmt2808.github.io/jp-pixel-story/`
3. Từ giờ mỗi lần tạo thêm truyện mới (AI tự ghi vào `web/public/stories/index.json`) rồi `git push`, web tự động cập nhật thêm bài mới ngay trên thư viện!

### 2. Hoặc chạy thử local trên máy
```bash
cd web
npm install
npm run dev
```
* Xem thư viện tất cả bài học: mở `http://127.0.0.1:5173`
* Mở thẳng 1 bài (hoặc chế độ tự chạy): `http://127.0.0.1:5173/?story=konbini-onigiri&autoplay=true`

### 2. Cài đặt & kiểm thử Local MCP Server (VOICEVOX + Mini-PixelLab)
```bash
cd mcp-server
uv sync --extra dev
uv run pytest -v
```

### 3. Kết nối vào Antigravity hoặc Claude Code
* **Với Antigravity:** Chỉ cần đặt thư mục `jp-pixel-story` làm **Active Workspace** — plugin `.agents/plugins/jp-pixel-studio/` (gồm MCP server + Skill `jp-pixel-story`) sẽ được nhận diện tự động.
  *(Nếu muốn dùng MCP này toàn cục ở mọi dự án, copy nội dung `.agents/plugins/jp-pixel-studio/mcp_config.json` vào `~/.gemini/config/mcp_config.json` và đổi `"mcp-server"` thành đường dẫn tuyệt đối tới thư mục `mcp-server`.)*
* **Với Claude Code:** Mở terminal tại thư mục gốc `jp-pixel-story` và chạy `claude` — file `.mcp.json` và `.claude/skills/jp-pixel-story/SKILL.md` sẽ tự được nạp.

### 4. Xuất tự động ra file Video `.mp4`
```bash
cd exporter
npm install
npx playwright install chromium
node export_video.mjs --story konbini-onigiri
```
Video kết quả nằm tại `exporter/out/konbini-onigiri.mp4`.

---

## 🎨 Cách tạo bài học Tiếng Nhật mới hoàn toàn tự động

Sau khi mở workspace trong **Antigravity (Gemini Pro)** hoặc **Claude Code (Claude Pro)** và bật sẵn **VOICEVOX**, bạn chỉ cần gõ 1 prompt như sau:

> *"Dùng skill `jp-pixel-story` tạo cho tớ 1 bài học JLPT N4 về tình huống **mua vé tàu ở ga Shinjuku**, giọng nhân viên là 春日部つむぎ, giọng người kể chuyện là 青山龍星, rồi sinh toàn bộ giọng đọc bằng VOICEVOX MCP."*

AI Agent sẽ tự động:
1. Gọi `voicevox_health` và `voicevox_list_speakers`.
2. Tạo `web/public/stories/shinjuku-ticket/story.json` đầy đủ Furigana, dịch Việt, mini-game và bài đọc + từ vựng.
3. Gọi `voicevox_generate_story_audio` để xuất toàn bộ file `.wav` và đồng bộ thời lượng.
4. Nếu bạn đưa thêm ảnh nhân vật vẽ bằng Gemini, AI sẽ gọi `pixellab_clean_sprite` / `pixellab_slice_spritesheet` để biến thành pixel art chuẩn bảng màu!

---

## 🛠️ Mẹo chọn Prompt khi vẽ ảnh nhân vật bằng Gemini (để nạp vào Mini-PixelLab)

Khi tạo nhân vật bằng Gemini để đưa qua `pixellab_clean_sprite` hoặc `pixellab_slice_spritesheet`, dùng mẫu prompt sau:
```text
16-bit SNES JRPG pixel art sprite sheet of a friendly Vietnamese student in Tokyo
wearing a navy jacket and brown backpack, 4-frame side-view walking animation
arranged evenly in a single horizontal row, crisp pixels, solid pure green
background (#00FF00), no drop shadow, no text, clean outlines.
```
Sau đó gọi tool `pixellab_slice_spritesheet` với `bg_mode="chroma_green"` và `palette_name="midnight_tokyo"`!

---

## 📄 Giấy phép
MIT License — tự do chỉnh sửa, mở rộng cho hành trình học Tiếng Nhật của bạn!
