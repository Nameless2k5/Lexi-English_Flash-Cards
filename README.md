# Lexi — học từ vựng tiếng Anh B1–C1

Ứng dụng PWA cho người Việt, dùng trên PC và iPhone. HTML/CSS/JavaScript thuần, không dùng framework, CDN, font ngoài, analytics hay API có phí.

## Chức năng

- 10 chủ đề, 160 từ/cụm từ với phiên âm UK, nghĩa, ví dụ và bản dịch.
- Thẻ học theo phiên tối đa 10 từ; tự đánh giá mức nhớ.
- Trắc nghiệm nghĩa và câu ví dụ có chỗ trống; kết quả và XP tính từ thao tác thật.
- Ôn tập theo lịch: chưa nhớ → 10 phút, cần ôn → 1 ngày, đã nhớ → 3 ngày rồi tăng dần, tối đa 60 ngày.
- Tìm từ gốc, từ gần nghĩa hoặc nghĩa tiếng Việt; lọc theo trình độ của từ gốc; lưu từ yêu thích.
- Từ gần nghĩa và cách diễn đạt mở rộng: cấp độ CEFR tham khảo, mức trang trọng, sắc thái, cấu trúc thường gặp, ví dụ Anh–Việt.
- Mục tiêu mỗi ngày, chuỗi ngày học, tiến độ theo chủ đề, biểu đồ 7 ngày.
- Xuất/nhập bản sao JSON để chuyển tiến độ giữa thiết bị.
- Web manifest, biểu tượng ứng dụng và service worker cho nội dung offline.

Các nhãn CEFR là gợi ý phân nhóm học, không phải phân loại chứng nhận chính thức.

## Sử dụng

Mở URL được cung cấp trong chat. Trên PC dùng Chrome/Edge và chọn cài ứng dụng ở thanh địa chỉ/menu. Trên iPhone mở bằng Safari → Chia sẻ → Thêm vào Màn hình chính → bật Mở dưới dạng ứng dụng web nếu có → Thêm.

Mục Cài đặt trong Lexi có hướng dẫn cài đặt và trạng thái chuẩn bị offline. Chỉ coi bộ từ đã sẵn sàng offline khi ứng dụng xác nhận. Hãy mở online lần đầu để lưu tài nguyên.

Tiến độ nằm trong localStorage của từng trình duyệt/origin. Chưa có đăng nhập riêng hay tự đồng bộ PC–iPhone. Xóa dữ liệu trình duyệt có thể xóa tiến độ; nên xuất bản sao khi cần. Giọng phát âm dùng speechSynthesis của hệ điều hành; một số giọng cần mạng hoặc tải trước trong cài đặt thiết bị.

## Chạy mã nguồn trên PC

Có Python 3:

```sh
cd dist
python -m http.server 8080 --bind 127.0.0.1
```

Mở http://127.0.0.1:8080 bằng trình duyệt. Có thể mở index.html trực tiếp để xem và học cơ bản, nhưng file:// không hỗ trợ cài PWA/service worker. iPhone cần URL HTTPS, không dùng localhost của PC.

Hoặc đưa toàn bộ thư mục dist lên bất kỳ hosting tĩnh có HTTPS nào. Giữ nguyên cấu trúc tệp và MIME types chuẩn. Không cần bước build hay dependency installation.

## Cấu trúc

- dist/index.html: khung giao diện, điều hướng, modal.
- dist/styles.css: thiết kế responsive, chế độ giảm chuyển động.
- dist/app.js: phiên học, quiz, SRS, lưu/nhập/xuất tiến độ, phát âm, cài PWA.
- dist/data.js: thư viện từ gốc; giữ nguyên ID để bảo toàn tiến độ.
- dist/synonyms.js: window.LEXI_SYNONYMS, ánh xạ ID từ gốc → danh sách so sánh; nội dung chỉ được dựng khi mở mục.
- dist/sw.js: cache ứng dụng có phiên bản và xác nhận sẵn sàng offline.
- dist/manifest.webmanifest và các icon: cấu hình cài ứng dụng.

Khi thay đổi tài nguyên đã cache, tăng CACHE_NAME trong sw.js. Bản cập nhật service worker chờ các cửa sổ ứng dụng cũ đóng để không thay thế mã giữa một phiên học.

## Kiểm tra đã thực hiện

Kiểm tra cú pháp JS; 160 mục dữ liệu/ID/IPA/fields; logic lịch ôn, XP và kiểm tra bản sao; các tình huống cache/offline service worker độc lập; luồng thẻ học 10 từ và quiz 10 câu qua trình duyệt; tìm kiếm/lưu từ/tải lại giữ tiến độ; bố cục PC và kích thước iPhone.

Cài thực tế trên iPhone và chất lượng giọng đọc từng thiết bị cần kiểm tra trên thiết bị đó. Đây là PWA cài từ trình duyệt, không phải gói App Store/EXE native.

## Từ gần nghĩa và cách dùng

Mỗi mục trong synonyms.js có word, level (CEFR tham khảo), register, meaning, distinction (so với nghĩa của từ gốc), pattern, example, translation và relation. relation=near là gần nghĩa theo ngữ cảnh, paraphrase là cách diễn đạt tương đương, related là có liên quan nhưng khác nghĩa. Không xem mọi mục là từ đồng nghĩa thay thế được trực tiếp. Với thuật ngữ chuyên ngành, giới hạn nghĩa được ghi rõ.

Các cách diễn đạt mở rộng hiện là tài liệu so sánh gắn với từ gốc, chưa có lịch ôn/XP riêng. Dữ liệu tiến độ và ID 160 từ gốc vẫn giữ nguyên khi cập nhật cùng domain. Khi thêm bộ so sánh mới, sửa synonyms.js và tăng phiên bản sw.js trước khi deploy.

Bản mở rộng hiện có 312 mục so sánh, 307 cách diễn đạt khác nhau gắn với đủ 160 từ gốc. Số này gồm gần nghĩa, cách diễn đạt và khái niệm liên quan đã được gắn nhãn riêng.

Nguồn tra cứu để đối chiếu các trường hợp khó (các ví dụ và giải thích trong app được biên soạn riêng; nhãn CEFR không phải trích phân loại chính thức của các nguồn):
- https://dictionary.cambridge.org/dictionary/english/empathy
- https://dictionary.cambridge.org/dictionary/english/sympathy
- https://dictionary.cambridge.org/dictionary/english/throughput
- https://www.merriam-webster.com/dictionary/cryptography
- https://www.merriam-webster.com/dictionary/biodiversity
- https://dictionary.cambridge.org/dictionary/english/compostable
- https://www.oxfordlearnersdictionaries.com/definition/english/rapport
- https://www.oxfordlearnersdictionaries.com/us/definition/english/warranty
- https://www.cancer.gov/publications/dictionaries/cancer-terms/def/sign
