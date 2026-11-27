# ことば村 (Kotoba Village) — Bộ Art Bible & Prompt Dùng Chung (Phương án B)

Thư mục này chứa bộ tài nguyên **dùng chung** cho toàn bộ series **ことば村 / ことば畑** (kết nối trực tiếp add-on Anki `kotoba-anki`, báo sáng `kotoba_daily` và truyện dài kỳ *『ことば村の小さな旅館』*).

Làm **1 lần** ở đây → mọi tập phim mới đều tái sử dụng trực tiếp từ `/shared/kotoba-mura/` mà **không phải vẽ lại nhân vật hay bối cảnh quen thuộc**.

---

## 0. Quy tắc phong cách chung (khóa 1 style duy nhất!)

- **Phong cách:** 16-bit SNES Japanese cozy slice-of-life pixel art (cùng chất ấm áp như `hanami-first` / `ramen-midnight` — chibi đầu hơi to, gần gũi, viền nâu đậm `#241712`, màu phẳng ít nhiễu, không anti-aliasing).
- **Bảng màu tự động khóa:** `jp_story_master` (viền `#241712`).
- **Tỉ lệ nhân vật:**
  - **Chân dung biểu cảm (`raw_sheet_*.png`):** 4 hình xếp **1 hàng ngang** trên nền **xanh lá thuần `#00FF00`**, tỉ lệ khung ảnh `3:1` (ví dụ `2172×724`):
    1. Miệng khép (trạng thái nghỉ)
    2. Miệng mở (đang nói "a")
    3. Nhắm mắt (chớp mắt)
    4. Miệng hé (nói nửa nhịp)
    - Chỉ phần **mặt** thay đổi; dáng, mũ/tóc, áo giữ nguyên 100%.
  - **Đi bộ toàn thân (`raw_walk_*.png`):** 10 hình xếp **1 hàng ngang** trên nền **`#00FF00`**, nhìn nghiêng sang **PHẢI**, tỉ lệ `3:1`:
    - Hình 1–8: chu kỳ đi bộ mượt (8 bước). Hình 9: đứng yên. Hình 10: đứng yên nhắm mắt.
  - **Nền (`raw_bg_*.png`):** tỉ lệ **`16:10`** (ví dụ `1280×800` hoặc `1600×1000`), **KHÔNG vẽ người** trong nền, để thoáng khoảng sàn phía dưới cho nhân vật đi bộ và chân dung đứng.

### Đoạn mở đầu dán vào MỌI prompt

- **Mở đầu Bust (người — Lin, Hana, Soncho):**
  > pixel art character expression sheet, 4 frames in one row on a flat pure green #00FF00 background, the same cozy chibi bust portrait (head and shoulders, slightly cute big-head proportions, facing front-slightly-angled, cut flat at the bottom edge) repeated 4 times with identical pose, framing and clothes: frame 1 mouth closed calm, frame 2 mouth open talking, frame 3 eyes closed blinking, frame 4 mouth half open small "o"; only the face changes; 16-bit SNES Japanese slice-of-life game style, dark brown 1-pixel outline, warm flat colors with simple shading, no anti-aliasing
- **Mở đầu Bust (Stack-chan):**
  > pixel art cute miniature desktop robot expression sheet, 4 frames in one row on a flat pure green #00FF00 background, the same tiny square-rounded white/cream M5Stack Stack-chan robot repeated 4 times with identical body, framing and tiny stubby arms: a cute boxy cream-white head with a dark black OLED rectangular face screen displaying glowing white minimal pixel eyes and mouth, sitting on a tiny matching cream boxy body with two stubby arms; only the glowing OLED face screen changes between the 4 frames; 16-bit SNES Japanese cozy pixel art style, dark brown 1-pixel outline, flat colors, no anti-aliasing
- **Mở đầu Walk (10 khung):**
  > pixel art character walk cycle sprite sheet, 16-bit SNES Japanese cozy slice-of-life game, chibi proportions (about 2.5 heads tall), side view facing right, 10 frames in one row on a flat pure green #00FF00 background: frames 1-8 a smooth looping walk cycle, frame 9 standing idle, frame 10 standing idle with eyes closed; same size and same ground line in every frame, dark brown 1-pixel outline, flat colors, no anti-aliasing
- **Mở đầu Background (`16:10`):**
  > 16-bit SNES Japanese cozy slice-of-life pixel art background scene, wide 16:10 composition, warm nostalgic lighting, clean pixel clusters, dark brown outlines, no characters, no people, no text, leave open walkable floor/path in the lower third for sprite characters
- **Negative chung:**
  > 3D render, realistic, blurry, gradient background, floor shadow, anti-aliasing, text, numbers, frame borders, grid lines, extra characters

---

## ĐỢT 1 — ƯU TIÊN 1 (Chỉ 8 ảnh là quay được ngay Tập 1 & Tin làng ことば畑!)

### 1. `raw_sheet_stackchan_neutral.png` — スタックちゃん (biểu cảm thường)
> [Mở đầu Bust Stack-chan] + frame 1 glowing white dot eyes and tiny gentle line smile, frame 2 glowing white dot eyes and open rounded white talking mouth, frame 3 horizontal closed-eye lines blinking with tiny smile, frame 4 glowing white dot eyes and small "o" mouth. Cute minimal kawaii robot companion from Kotoba Batake garden.

### 2. `raw_sheet_stackchan_happy.png` — スタックちゃん (vui / khoe tranh)
*(Đưa `raw_sheet_stackchan_neutral.png` vào ô ảnh tham chiếu)*
> [Mở đầu Bust Stack-chan] + matching the reference robot body exactly, happy glowing OLED screen with soft pink pixel blush cheeks: frame 1 smiling arched `^ ^` white eyes and tiny smile, frame 2 smiling arched `^ ^` eyes and wide open happy mouth, frame 3 gentle closed horizontal blink eyes with pink cheeks, frame 4 arched `^ ^` eyes and small happy "o" mouth.

### 3. `raw_walk_stackchan.png` — スタックちゃん (đi bộ 10 khung)
*(Đưa `raw_sheet_stackchan_neutral.png` vào ô ảnh tham chiếu)*
> [Mở đầu Walk] + Stack-chan: a tiny adorable boxy cream-white M5Stack desktop robot (smaller than a human, chunky cute proportions), rounded square white head with a black OLED screen on the front-right showing glowing white dot eyes, tiny matching white boxy torso, two tiny dark-tipped stubby arms swinging, two tiny short blocky feet taking cute waddling steps (frames 1-8 walking, frame 9 standing idle, frame 10 standing idle blinking).

### 4. `raw_sheet_lin_neutral.png` — リンさん (cô gái VN làm ở quán trọ ことば屋)
> [Mở đầu Bust người] + Lin: a friendly young Vietnamese woman in her early 20s working at a cozy traditional Japanese village inn, dark brown hair tied in a neat low ponytail with a small warm red hair tie, warm cream blouse under a simple indigo-blue inn apron (maekake), earnest gentle smile, slightly angled to the right.

### 5. `raw_walk_lin.png` — リンさん (đi bộ 10 khung)
*(Đưa `raw_sheet_lin_neutral.png` vào ô ảnh tham chiếu)*
> [Mở đầu Walk] + Lin: matching the reference character, young Vietnamese woman with dark brown low ponytail and red hair tie, cream blouse, indigo-blue traditional inn apron over dark pants, simple flat brown shoes.

### 6. `raw_sheet_hana_warm.png` — はなさん (chị chủ quán trọ ことば屋)
> [Mở đầu Bust người] + Hana: a kind, graceful Japanese innkeeper woman around 30 years old, neat black hair in a soft low bun with a wooden hairpin, warm tea-brown traditional haori cardigan over a cream kimono collar, gentle caring smile, slightly angled to the left.

### 7. `raw_bg_kotoba_garden.png` — Vườn từ vựng **ことば畑** (Đã chọn Phương án 2: vườn nằm sát hiên nhà trọ Ryokan 2 tầng!)
> [Mở đầu Background] + "Kotoba Batake", a cozy Japanese countryside pixel garden right beside a grand traditional two-story Japanese wooden ryokan inn ("Kotoba-ya") on the left: dark cedar timber and warm cream plaster walls, sweeping curved dark-grey kawara tiled roof, glowing shoji paper lattice windows, deep indigo noren curtain at the doorway and wooden engawa veranda facing the yard; on the right side, neat raised vegetable and sprout beds with cute tiny green seedlings and a small glass cloche protecting five tiny leaves, a rustic wooden mailbox by the fence, soft blue sky and distant green hills, warm morning sunlight, wide grassy dirt path across the lower foreground.
*(Quyết định thiết kế: khi vẽ lại `raw_bg_kotoba_garden.png` đợt tới, ngôi nhà bên trái là quán trọ **旅館ことば屋** 2 tầng mái ngói cong kawara + rèm noren + cửa shoji rộng bề thế; sau khi lưu đè chỉ cần chạy lại `art_manifest.py ../art-src/shared/kotoba-mura/art.json --only backgrounds` là tự động cập nhật cho Tập 1 và mọi tập sau!)*

### 8. `raw_bg_kotoba_inn_lobby.png` — Quầy lễ tân & lò sưởi quán trọ **ことば屋**
> [Mở đầu Background] + cozy interior of a small traditional Japanese country inn ("Kotoba-ya"): warm wooden reception counter with a retro black rotary telephone and small vase of autumn flowers, tatami seating area with a glowing warm sunken hearth/stove and iron teapot, sliding shoji paper doors glowing with soft daylight, warm tatami/wood floor open across the lower third.

---

## ĐỢT 2 — MỞ RỘNG ĐỦ BỘ CHO TOÀN BỘ 26 KỲ *『ことば村の小さな旅館』*

### 9. `raw_sheet_stackchan_lowbat.png` — スタックちゃん (hết pin / lo lắng — Kỳ 11 & Kỳ 20!)
*(Tham chiếu `raw_sheet_stackchan_neutral.png`)*
> [Mở đầu Bust Stack-chan] + matching the reference robot body exactly, low-battery sleepy/worried OLED face with a tiny red low-battery icon in the top-right corner of the black screen: frame 1 droopy tired white eyes and wavy worried mouth, frame 2 tired eyes and small weak open mouth, frame 3 closed faint eyes blinking, frame 4 dim tired eyes and tiny "o" mouth.

### 10. `raw_sheet_lin_happy.png` — リンさん (vui mừng)
*(Tham chiếu `raw_sheet_lin_neutral.png`)*
> [Mở đầu Bust người] + matching Lin from reference exactly, bright joyful expression with subtle rosy cheeks: frame 1 happy closed-mouth smile, frame 2 joyful open-mouth laugh, frame 3 happy eyes closed blink, frame 4 smiling small open mouth.

### 11. `raw_sheet_lin_flustered.png` — リンさん (lúng túng khi nói nhầm kính ngữ!)
*(Tham chiếu `raw_sheet_lin_neutral.png`)*
> [Mở đầu Bust người] + matching Lin from reference exactly, flustered embarrassed expression with slightly worried raised eyebrows and faint blush: frame 1 nervous closed mouth, frame 2 flustered open talking mouth, frame 3 squeezed closed eyes blink, frame 4 nervous small "o" mouth.

### 12. `raw_sheet_hana_happy.png` — はなさん (cười dịu dàng)
*(Tham chiếu `raw_sheet_hana_warm.png`)*
> [Mở đầu Bust người] + matching Hana from reference exactly, warm joyful expression: frame 1 soft beaming smile, frame 2 warm laughing open mouth, frame 3 gentle happy eyes closed, frame 4 soft small open mouth.

### 13. `raw_walk_hana.png` — はなさん (đi bộ 10 khung)
*(Tham chiếu `raw_sheet_hana_warm.png`)*
> [Mở đầu Walk] + Hana: matching the reference innkeeper, black low bun with wooden hairpin, warm tea-brown haori over cream kimono skirt, white tabi socks and zori sandals.

### 14. `raw_sheet_soncho_warm.png` — 村長 / たけちゃん (bác trưởng làng)
> [Mở đầu Bust người] + Soncho (Takeshi): a kind elderly Japanese village chief in his late 60s, short neat grey-white hair, warm crinkled laughing eyes, small grey mustache, knitted brown vest over a beige collared shirt, warm nostalgic smile, slightly angled to the left.

### 15. `raw_walk_soncho.png` — 村長 (đi bộ 10 khung)
*(Tham chiếu `raw_sheet_soncho_warm.png`)*
> [Mở đầu Walk] + Soncho: matching the reference kind elderly village chief, short grey hair, knitted brown vest over beige shirt, dark grey trousers, brown walking shoes.

### 16. `raw_bg_kotoba_inn_front.png` — Mặt tiền quán trọ **ことば屋** (Kiến trúc Ryokan Nhật Bản truyền thống bề thế)
> [Mở đầu Background] + cozy grand exterior of a traditional two-story Japanese country ryokan inn ("Kotoba-ya") along a quiet mountain-village lane: sweeping dark-grey curved kawara tiled roofs with overhanging wooden eaves, dark cedar timber beams and cream plaster walls, warm glowing shoji paper lattice windows upstairs and downstairs, sliding wooden koshido entrance doors with a deep indigo noren fabric curtain, stone toro lantern and warm glowing paper andon lamp by the stone-paved porch, red autumn maple tree beside the entrance, wide clear stone-and-dirt village road across the lower third.

### 17. `raw_bg_kotoba_inn_kitchen.png` — Gian bếp quán trọ **ことば屋** (nấu canh thịt lợn vị yuzu!)
> [Mở đầu Background] + warm cozy traditional Japanese inn kitchen: wooden counter with a steaming clay/iron pot of tonjiru pork miso soup, wooden cutting board with sliced daikon radish, carrots and bright yellow yuzu citrus fruits in a bamboo basket, shelves with ceramic bowls and soy sauce bottles, warm morning light through a small window.

### 18. `raw_bg_kotoba_mountain_yuzu.png` — Cây Yuzu trên đường núi nhìn xuống làng **ことば村**
> [Mở đầu Background] + scenic Japanese mountain trail overlooking a tiny peaceful village in the valley below: an old gnarled yuzu tree laden with bright golden-yellow yuzu fruits beside a moss-covered rock on the trail, wooden stone markers, pine trees framing the sides, clear dirt mountain path across the lower third.

---

## Cách xử lý sau khi có ảnh (làm dần từng đợt được!)

Lưu ảnh vào đúng thư mục `art-src/shared/kotoba-mura/` (có bao nhiêu ảnh chạy bấy nhiêu — ảnh chưa có sẽ tự báo `waiting_for_art`):

```bash
cd mcp-server && uv run python art_manifest.py ../art-src/shared/kotoba-mura/art.json
```

Lệnh này tự động:
1. Cắt mọi sheet biểu cảm (`96×96`) + khóa tóc/áo chống nhấp nháy + dựng rig đầu–thân cho nhân vật người (giữ nguyên không cắt cổ cho Stack-chan).
2. Cắt mọi sheet đi bộ (`40×64` cho người, `36×44` cho Stack-chan) + khóa `jp_story_master` + viền `#241712`.
3. Xử lý nền (`320×200`) vào `web/public/shared/kotoba-mura/`.
4. Xuất `web/public/shared/kotoba-mura/pack.json` kèm giọng VOICEVOX cố định & đầy đủ `provenance.json` để mọi tập truyện mới trỏ trực tiếp tới `/shared/kotoba-mura/...`!
