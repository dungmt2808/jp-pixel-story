# ハチ公の話: bài đọc tương tác tiếng Nhật N4

## Các file

| File | Vai trò |
|---|---|
| `index.html` | Mini-game 5 cảnh và bài đọc. Mở bằng trình duyệt là dùng được, không cần mạng. Font tiếng Nhật và tiếng Việt đã được nhúng sẵn. |
| `record.py` | Tự quay thành MP4, gồm 3 phần: phần game quay từng khung hình, phần bài đọc chụp các bước bấm thành ảnh tĩnh, rồi đến đoạn kết. |
| `audio.py` | Tự tạo nhạc nền 8-bit và hiệu ứng âm thanh (tiếng chó sủa, tàu, mưa, vỗ tay…). |

## Chạy

```bash
pip install playwright numpy scipy
python -m playwright install chromium   # hoặc đặt CHROME=/đường/dẫn/chrome
python record.py index.html hachiko.mp4  # cần cài ffmpeg
```

## Phụ đề có furigana

Trong code, phụ đề được viết theo dạng `{漢字|かんじ}`, ví dụ `{先生|せんせい}`. Trang sẽ tự vẽ phần đọc nhỏ phía trên chữ Hán, trên cả canvas lẫn bài đọc.

## Sửa bài đọc và từ vựng

Ba phần nội dung nằm trong `index.html`:

- `PASSAGE`: các đoạn văn, mỗi đoạn kèm bản dịch tiếng Việt.
- `DICT`: từ vựng và ngữ pháp, gồm nghĩa, ghi chú và câu ví dụ.
- `QUIZ`: các câu hỏi đọc hiểu.

Để tô màu một chữ trong bài và cho bấm xem nghĩa, viết chữ đó theo dạng `<<khóa:chữ>>`, trong đó `khóa` là tên mục tương ứng trong `DICT`.
