# 日本の生活 — ảnh cần vẽ (để cả video cùng một phong cách)

Hiện tại cảnh 2 (phòng tắm `bg_ofuro.png`) là ảnh pixel chi tiết, còn bàn ăn, tàu điện, sân bay vẽ
bằng code nên trông như "hai thế giới". Bạn chỉ cần tạo 3 ảnh dưới đây, lưu đúng tên vào thư mục này,
rồi chạy **một lệnh** ở cuối trang.

## Phong cách chung (dán vào đầu MỌI prompt)

> 16-bit pixel art background, SNES-era Japanese slice-of-life game, detailed interior/exterior,
> warm wood and washi-paper tones, soft natural light with subtle ordered dithering on gradients,
> dark brown 1-pixel outlines on furniture and objects, limited palette of about 24 colors,
> eye-level camera, horizon at about 55% of the height, NO people, NO characters, NO text,
> keep the lower-left and lower-right corners simple (two characters stand there as bust portraits).

**Negative prompt:** photo, 3D render, blurry, smooth gradient, anti-aliasing, painterly brush strokes,
text, letters, watermark, logo, people, characters, faces, UI, frame, border.

**Kích thước:** 320×200 nếu công cụ cho chọn; nếu không, bất kỳ ảnh 16:10 nào (1280×800, 1536×960).
Tool tự nhận lưới pixel và đưa về 320×200. **Ảnh tham chiếu phong cách:** nếu công cụ có ô
"style / reference image", hãy đưa vào `web/public/stories/jlpt-n4-2025-12-japan-life/assets/bg_ofuro.png`
để màu và độ chi tiết khớp với cảnh phòng tắm.

## 1. `raw_bg_dining.png` — bữa cơm gia đình Nhật trong phim hoạt hình (cảnh mở đầu + lựa chọn "和食")

> [phong cách chung] + a cozy Japanese family living room in the evening, low wooden chabudai table
> in the center seen slightly from above, plates of sashimi, bowls of miso soup and rice, chopsticks,
> a small teapot, tatami floor, shoji sliding doors with warm lamp light, a CRT TV and a calendar on
> the wall, nostalgic 1990s anime atmosphere.

## 2. `raw_bg_train.png` — trên tàu ra sân bay (cảnh "cú twist")

> [phong cách chung] + inside a Japanese airport express train in the late afternoon, a row of large
> windows showing Tokyo suburbs and power lines passing by, hanging hand straps, blue train seats
> along the wall, golden sunlight beams across the floor, a small route map sign above the door.

## 3. `raw_bg_airport.png` — sân bay lúc hoàng hôn (cảnh kết)

> [phong cách chung] + a quiet Japanese airport departure lobby at dusk, huge glass wall with a purple
> and orange sky and an airplane on the runway, rows of seats, a departure board with glowing
> (unreadable) lines, polished floor reflecting the sunset, calm and slightly emotional mood.

## Sau khi có ảnh

Lưu ảnh vào thư mục này (`art-src/jlpt-n4-2025-12-japan-life/`) với đúng 3 tên trên, rồi:

```bash
cd mcp-server && uv run python art_manifest.py ../art-src/jlpt-n4-2025-12-japan-life/art.json
```

(hoặc nhờ Claude gọi tool `pixellab_apply_art_manifest`). Lệnh này xử lý ảnh nào đã có (ảnh nào chưa
có thì báo `waiting_for_art`), khoá vào bảng màu `jp_story_master`, ghi `provenance.json`, và tự đổi
các cảnh trong `story.json` sang `bg:dining` / `bg:train` / `bg:airport`. Chạy lại trình kiểm tra:
cảnh báo `[Style Mix]` sẽ biến mất khi đủ 3 ảnh.

Ánh sáng (`light`) của từng cảnh đã đặt sẵn: bữa cơm `warm`, tàu `golden`, sân bay `dusk` — nên vẽ ảnh
gốc với ánh sáng ban ngày trung tính cũng được, player sẽ phủ màu cho đồng bộ với nhân vật.
