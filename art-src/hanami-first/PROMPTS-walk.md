# はじめてのお花見 — sheet đi bộ của Minh & Yui (nhân vật toàn thân, kiểu PixelLab)

Cảnh mở đầu giờ có Minh và Yui **đi bộ** vào công viên (route B `people` trên nền vẽ). Hai sheet
hiện tại (`raw_walk_minh.png`, `raw_walk_yui.png`) là **bản tạm vẽ bằng code**
(`standin_walk.py`) để thử toàn bộ đường ống. Bạn tạo 2 ảnh thật theo prompt dưới, lưu đè đúng tên,
chạy một lệnh ở cuối — story không phải sửa gì.

## Bố cục sheet (quan trọng nhất)

- **10 ô ngang, 1 hàng**, các ô bằng nhau, nền **xanh lá thuần #00FF00** (green screen), không bóng đổ.
- Nhân vật **toàn thân, nhìn nghiêng sang PHẢI**, cùng kích thước ở mọi ô, chân chạm cùng một đường đáy.
- Ô 1–8: **một chu kỳ đi bộ** — contact (chân trước chạm đất), down, passing (hai chân chụm), up,
  rồi lặp lại với chân kia. Tay vung ngược chân.
- Ô 9: đứng yên (idle). Ô 10: đứng yên, **nhắm mắt** (chớp mắt).
- Tỉ lệ gợi ý 2560×384 (mỗi ô 256×384) — tool tự cắt, khử nền, đưa về khung 32×48 px.

Nếu công cụ có ô **ảnh tham chiếu nhân vật**, đưa vào `raw_sheet_minh.png` / `raw_sheet_yui.png`
(chân dung đang dùng) để khuôn mặt, tóc, màu áo khớp với chân dung trong hội thoại.

## Phong cách chung (dán vào đầu MỌI prompt)

> pixel art character walk cycle sprite sheet, 16-bit SNES-era Japanese slice-of-life game, chibi
> proportions (big head, about 2.5 heads tall), side view facing right, 10 frames in one row on a
> flat pure green #00FF00 background: frames 1-8 a smooth looping walk cycle (contact, down, passing,
> up, then the other leg), frame 9 standing idle, frame 10 standing idle with eyes closed;
> same size and same ground line in every frame, dark brown 1-pixel outline, flat colors with
> one shade per color, no anti-aliasing

**Negative prompt:** 3D render, blurry, motion blur, gradient background, shadow on the ground,
anti-aliasing, text, numbers, frame borders, grid lines, front view, back view, extra characters.

## 1. `raw_walk_yui.png`

> [phong cách chung] + Yui: a cheerful Japanese university girl, short black bob haircut with a
> small pink cherry-blossom hair clip, cream short-sleeved blouse, pink knee-length skirt, bare legs,
> dark red flat shoes, small blush on the cheeks.

## 2. `raw_walk_minh.png`

> [phong cách chung] + Minh: a friendly Vietnamese university student in Tokyo, short messy brown
> hair, navy blue hoodie with white drawstrings, dark grey jeans, white sneakers.

## Sau khi có ảnh

Lưu vào thư mục này (`art-src/hanami-first/`) đúng 2 tên trên, rồi tái tạo sprite từ bản ghi
provenance (giữ nguyên mọi thông số cắt: 10 ô, khung 32×48, `registration="centroid"`,
`bg_mode="chroma_green"`, `facing="right"`, clip `walk` 8 khung với `stridePx: 24`, clip `idle`):

```bash
cd mcp-server && uv run python -c "import provenance, json; print(json.dumps(provenance.reprocess('../web/public/stories/hanami-first/assets/sprites/provenance.json'), indent=2))"
```

`reprocess` sẽ báo `differs from record` cho `yui_walk` / `minh_walk` (đúng, vì ảnh gốc đã đổi) —
khi đó gọi lại tool `pixellab_slice_spritesheet` với cùng thông số (hoặc nhờ Claude) để ghi sprite và
provenance mới. Xem trước: mở truyện, cảnh đầu — hai bạn đi từ trái vào, Minh dừng lại quay đầu chờ,
Yui đi tới rồi quay sang nói chuyện.

**Mẹo sải bước:** nếu chân trông như trượt trên cỏ, chỉnh `stridePx` trong `meta.json` của sprite
(số px nhân vật đi được trong 1 chu kỳ 8 khung ≈ 2 × độ dài một bước chân trên màn hình). Player chọn
khung theo **quãng đường đã đi**, không theo thời gian, nên đi nhanh hay chậm chân vẫn bám đất.
