# はじめてのお花見 — sheet đi bộ của Minh & Yui (nhân vật toàn thân, kiểu PixelLab)

Cảnh mở đầu có Minh và Yui **đi bộ** vào công viên (route B `people` trên nền vẽ).
`raw_walk_minh.png` và `raw_walk_yui.png` là sheet thật bạn đã tạo từ các prompt dưới đây
(bản tạm vẽ bằng code trước đó: `standin_walk.py`). Muốn vẽ lại, lưu đè đúng tên và chạy lệnh
ở cuối — story không phải sửa gì.

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

Lưu vào thư mục này (`art-src/hanami-first/`) đúng 2 tên trên, rồi cắt lại với cùng thông số đang
ghi trong `web/public/stories/hanami-first/assets/sprites/provenance.json`:

```bash
cd mcp-server && uv run python -c "
from pixel_processor import process_sprite_sheet
for who, stride in (('minh', 28), ('yui', 32)):
    process_sprite_sheet(f'../art-src/hanami-first/raw_walk_{who}.png',
        f'../web/public/stories/hanami-first/assets/sprites/{who}_walk',
        cols=10, frame_width=40, frame_height=64, registration='centroid', bg_mode='chroma_green',
        cleanup=True, facing='right', split='gaps', pixel_pitch=5.5, fps=10,
        clips={'walk': {'frames': list(range(8)), 'fps': 10, 'stridePx': stride},
               'idle': {'frames': [8] * 11 + [9], 'fps': 4}},
        source={'artist': 'user', 'brief': 'art-src/hanami-first/PROMPTS-walk.md'})"
```

- `split='gaps'`: nhân vật trong ảnh tạo ra không cách đều đúng 10 ô, tool tìm từng nhân vật theo
  khoảng trống giữa chúng (phải đúng 10 nhân vật).
- `pixel_pitch=5.5`: mỗi "pixel vẽ" trong ảnh rộng ~5.5 px (ảnh 2000 px). Cố định tỉ lệ để 1 pixel
  sprite = 1 pixel vẽ và hai nhân vật cùng một tỉ lệ thế giới. Ảnh to/nhỏ hơn thì đổi số này
  (2000 px → 5.5; 4000 px → 11).

**Mẹo sải bước:** nếu chân trông như trượt trên cỏ, chỉnh `stridePx` trong `meta.json` của sprite
(số px nhân vật đi được trong 1 chu kỳ 8 khung ≈ 2 × độ dài một bước chân trên màn hình). Player chọn
khung theo **quãng đường đã đi**, không theo thời gian, nên đi nhanh hay chậm chân vẫn bám đất.
