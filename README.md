# Lexi — học từ vựng tiếng Anh B1–C1

Ứng dụng PWA cho người Việt, dùng trên PC và iPhone. HTML/CSS/JavaScript thuần, không dùng framework, CDN, font ngoài, analytics hay API có phí.

## Chức năng

- 10 chủ đề, 160 từ/cụm từ với phiên âm UK, nghĩa, ví dụ và bản dịch.
- Thẻ học theo phiên tối đa 10 từ; tự đánh giá mức nhớ.
- Trắc nghiệm nghĩa và câu ví dụ có chỗ trống; kết quả và XP tính từ thao tác thật.
- Ôn tập theo lịch: chưa nhớ → 10 phút, cần ôn → 1 ngày, đã nhớ → 3 ngày rồi tăng dần, tối đa 60 ngày.
- Tìm từ/ý nghĩa tiếng Việt, lọc B1/B2/C1, lưu từ yêu thích.
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
- dist/data.js: thư viện từ vựng, dễ mở rộng theo cùng schema.
- dist/sw.js: cache ứng dụng có phiên bản và xác nhận sẵn sàng offline.
- dist/manifest.webmanifest và các icon: cấu hình cài ứng dụng.

Khi thay đổi tài nguyên đã cache, tăng CACHE_NAME trong sw.js. Bản cập nhật service worker chờ các cửa sổ ứng dụng cũ đóng để không thay thế mã giữa một phiên học.

## Kiểm tra đã thực hiện

Kiểm tra cú pháp JS; 160 mục dữ liệu/ID/IPA/fields; logic lịch ôn, XP và kiểm tra bản sao; các tình huống cache/offline service worker độc lập; luồng thẻ học 10 từ và quiz 10 câu qua trình duyệt; tìm kiếm/lưu từ/tải lại giữ tiến độ; bố cục PC và kích thước iPhone.

Cài thực tế trên iPhone và chất lượng giọng đọc từng thiết bị cần kiểm tra trên thiết bị đó. Đây là PWA cài từ trình duyệt, không phải gói App Store/EXE native.
