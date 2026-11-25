# Video Exporter (`Playwright` + `FFmpeg`)

Xuất tự động bất kỳ bài học nào từ chế độ `?autoplay=true` sang file `.mp4` sắc nét có đồng bộ giọng đọc VOICEVOX gốc.

## Cài đặt lần đầu
```bash
cd exporter
npm install
npx playwright install chromium
```

## Chạy xuất video MP4
```bash
node export_video.mjs --story konbini-onigiri
```

File kết quả sẽ được lưu tại `exporter/out/konbini-onigiri.mp4`.
