# Video Exporter & Stage E2E (`Playwright` virtual clock + `FFmpeg`)

Xuất bất kỳ bài học hoạt hình nào sang `.mp4` 960×600 (đúng 3× canvas 320×200), **tất định** và **đồng bộ tiếng–hình chính xác từng frame**.

## Cách hoạt động
1. Mở `?story=<id>&autoplay=true&record=1` với **đồng hồ ảo** của Playwright đang dừng.
2. Ở `record=1`, stage không phát audio trong trình duyệt: mỗi câu giữ đúng `durationSec` (không phụ thuộc chính sách autoplay).
3. Tua đồng hồ từng frame (1/fps giây) → chụp `.canvas-viewport` (canvas + phụ đề) → pipe vào FFmpeg.
4. Mỗi câu thoại ghi `perfMs` trên cùng đồng hồ ảo → FFmpeg đặt file MP3/WAV gốc đúng mốc thời gian.

Bản cũ quay thời gian thực: Chromium headless chặn `audio.play()` nên mỗi câu chỉ “dài” 2 giây → các câu 9–15 s bị trộn chồng lên nhau, và tiếng bị lệch sớm ~0.7 s.

## Cài đặt lần đầu
```bash
cd exporter
npm install
npx playwright install chromium   # cần thêm ffmpeg trong PATH
```

## Lệnh
```bash
node export_video.mjs --story hanami-first [--fps 30] [--width 960] [--out out/x.mp4] [--url http://127.0.0.1:4173]
node export_video.mjs --story hanami-first --check   # chạy hết truyện thật nhanh, không xuất video
npm run check:all -- --url http://127.0.0.1:4173       # mọi truyện kind=engine trong index.json
npm test                                               # unit test timeline/audio plan
npm run test:e2e -- --url http://127.0.0.1:4173        # xuất MP4 thật rồi đo lệch tiếng-hình (≤ 50 ms)
```
Không truyền `--url` thì script tự `npm run build` và mở `vite preview`.

Kết quả: `out/<id>.mp4` + `out/<id>.mp4.timeline.json` (mốc từng câu thoại, cảnh báo chồng tiếng / thiếu file / lỗi trang).
Lưu ý: nhạc nền chiptune (Web Audio) chưa được ghi vào video — chỉ có giọng đọc.
