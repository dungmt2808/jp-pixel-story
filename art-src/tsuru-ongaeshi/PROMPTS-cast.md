# 鶴の恩返し — ảnh để nhân vật cử động (nhép miệng, chớp mắt, đi bộ)

Chân dung trong truyện hiện là **ảnh tĩnh**: chỉ nhún nhẹ khi nói. Mỗi ảnh dưới đây làm một nhân vật
**mở miệng theo lời thoại, chớp mắt, gật đầu** — giống お花見. Ảnh nào chưa có thì nhân vật đó giữ
chân dung tĩnh như bây giờ, nên bạn có thể làm dần từng ảnh (ưu tiên 1 trước).

## A. Sheet biểu cảm (một sheet cho mỗi chân dung)

- **4 hình trong 1 hàng**, nền **xanh lá thuần #00FF00**, mỗi hình cùng khung, cùng tư thế, cùng kích thước
  với chân dung hiện tại (bán thân, bị cắt ở cạnh dưới). Các hình cách nhau một khoảng trống xanh.
- Hình 1: **y hệt chân dung hiện tại** (miệng khép). Hình 2: **miệng mở** (đang nói "a").
  Hình 3: **nhắm mắt** (chớp mắt). Hình 4: **miệng hé** (nói giữa chừng).
- Chỉ **mặt** được thay đổi giữa 4 hình; tóc, áo, vai giữ nguyên (tool cũng tự khoá phần này).
- **Quan trọng:** đưa ảnh chân dung hiện tại vào ô *reference / image-to-image* của công cụ để giữ đúng
  khuôn mặt và màu (đường dẫn ghi ở từng mục).

**Phong cách chung (dán đầu mỗi prompt):**

> pixel art character expression sheet, 4 frames in one row on a flat pure green #00FF00 background,
> the same bust portrait (head and shoulders, cut at the bottom edge) repeated 4 times with identical
> pose, framing and clothes: frame 1 mouth closed, frame 2 mouth open talking, frame 3 eyes closed
> blinking, frame 4 mouth half open; only the face changes; 16-bit SNES-era Japanese game style,
> dark brown 1-pixel outline, flat colors, no anti-aliasing, match the reference image exactly

**Negative:** 3D, blurry, gradient background, shadow, text, frame borders, different pose, different clothes.

### A1. `raw_sheet_yosaku.png` — 与作 (Yosaku) (ưu tiên 1)

Ảnh tham chiếu: `web/public/stories/tsuru-ongaeshi/assets/portrait_yosaku.png`

> [phong cách chung] + a kind young Japanese villager from an old folktale, messy brown hair, thick brown scarf, navy work kimono.

### A2. `raw_sheet_otsu_gentle.png` — おつう (dịu dàng) (ưu tiên 1)

Ảnh tham chiếu: `web/public/stories/tsuru-ongaeshi/assets/portrait_otsu_gentle.png`

> [phong cách chung] + a beautiful young woman from an old Japanese folktale, long straight black hair with a small red ribbon, white kimono with a red collar, gentle calm smile.

### A3. `raw_sheet_otsu_plead.png` — おつう (khẩn khoản) (ưu tiên 2)

Ảnh tham chiếu: `web/public/stories/tsuru-ongaeshi/assets/portrait_otsu_plead.png`

> [phong cách chung] + the same young woman (long black hair, red ribbon, white kimono with red collar) with worried, pleading eyes and slightly lowered eyebrows.

## B. Sheet đi bộ (toàn thân, như Minh & Yui ở お花見)

### `raw_walk_yosaku.png` — Yosaku (ưu tiên 2)

Dùng trong cảnh `snow_intro`: Yosaku đi trên tuyết tới chỗ chim hạc, dừng lại nhìn nó.

- **10 hình trong 1 hàng** trên nền #00FF00, toàn thân, **nhìn nghiêng sang PHẢI**: hình 1–8 là một chu kỳ
  đi bộ (chạm đất, hạ người, hai chân chụm, nhấc lên, rồi chân kia), hình 9 đứng yên, hình 10 đứng nhắm mắt.
  Không cần cách đều từng ô — tool tự tìm 10 nhân vật theo khoảng trống.
- Đưa chân dung của nhân vật vào ô reference để mặt và trang phục khớp.

> pixel art character walk cycle sprite sheet, 16-bit SNES-era Japanese game, side view facing right,
> 10 frames in one row on a flat pure green #00FF00 background: frames 1-8 a smooth looping walk cycle,
> frame 9 standing idle, frame 10 standing idle with eyes closed; same size and ground line in every
> frame, dark brown 1-pixel outline, flat colors, no anti-aliasing + Yosaku: young villager from an old Japanese folktale, messy brown hair, thick brown scarf, navy work kimono with rolled sleeves, straw sandals and leg wraps, walking through snow.

## Sau khi có ảnh

Lưu vào `art-src/tsuru-ongaeshi/` đúng tên ở trên (ảnh nào có trước làm trước), rồi:

```bash
cd mcp-server && uv run python art_manifest.py ../art-src/tsuru-ongaeshi/art.json --only characters
```

(hoặc nhờ Claude gọi `pixellab_apply_art_manifest` với `only: ["characters"]`). Lệnh này cắt từng sheet,
khoá vào bảng màu của truyện, khoá phần tóc/áo, dựng rig đầu–thân, ghi provenance, và đăng ký sprite
**cùng tên với chân dung** — player tự dùng nó, không phải sửa `story.json`. Ảnh chưa có được báo
`waiting_for_art`. Riêng sheet đi bộ: sau khi cắt, Claude sẽ đo sải bước, dàn cảnh (đi vào, dừng, quay
người) rồi kiểm tra lại cả truyện.
