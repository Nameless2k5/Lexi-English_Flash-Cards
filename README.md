# Lexi — học từ vựng tiếng Anh B1–C1

Ứng dụng PWA cho người Việt, dùng trên PC và iPhone. Thư viện hiện có 260 mục: 160 từ theo chủ đề và 100 từ/cụm từ TOEIC. Giao diện HTML/CSS/JavaScript nhẹ, không tải framework hay font ngoài trên thiết bị. Máy chủ Vinext/Cloudflare Workers bổ sung sao lưu D1 theo tài khoản; không cần API từ dịch vụ AI.

## Chức năng

- 10 chủ đề, 160 từ/cụm từ với phiên âm UK, nghĩa, ví dụ và bản dịch.
- Thẻ học theo phiên tối đa 10 từ; tự đánh giá mức nhớ.
- Trắc nghiệm nghĩa và câu ví dụ có chỗ trống; kết quả và XP tính từ thao tác thật.
- Ôn tập theo lịch: chưa nhớ → 10 phút, cần ôn → 1 ngày, đã nhớ → 3 ngày rồi tăng dần, tối đa 60 ngày.
- Tìm từ gốc, từ gần nghĩa hoặc nghĩa tiếng Việt; lọc theo trình độ của từ gốc; lưu từ yêu thích.
- Từ gần nghĩa và cách diễn đạt mở rộng: cấp độ CEFR tham khảo, mức trang trọng, sắc thái, cấu trúc thường gặp, ví dụ Anh–Việt.
- Mục tiêu mỗi ngày, chuỗi ngày học, tiến độ theo chủ đề, biểu đồ 7 ngày.
- Sao lưu tùy chọn theo tài khoản ChatGPT: trạng thái xác nhận từ máy chủ, khôi phục sau khi dữ liệu trên thiết bị bị xóa, kiểm tra xung đột giữa các thiết bị.
- Yêu cầu lưu trữ bền vững nếu trình duyệt hỗ trợ; hiển thị kết quả thật.
- Xuất/nhập bản sao JSON, chia sẻ tệp tới Files/iCloud Drive nếu thiết bị hỗ trợ.
- Web manifest, biểu tượng ứng dụng và service worker cho nội dung offline.

Các nhãn CEFR là gợi ý phân nhóm học, không phải phân loại chứng nhận chính thức.

## Sử dụng

Mở URL được cung cấp trong chat. Trên PC dùng Chrome/Edge và chọn cài ứng dụng ở thanh địa chỉ/menu. Trên iPhone mở bằng Safari → Chia sẻ → Thêm vào Màn hình chính → bật Mở dưới dạng ứng dụng web nếu có → Thêm.

Mục Cài đặt trong Lexi có hướng dẫn cài đặt và trạng thái chuẩn bị offline. Chỉ coi bộ từ đã sẵn sàng offline khi ứng dụng xác nhận. Hãy mở online lần đầu để lưu tài nguyên.

Tiến độ vẫn lưu ngay vào localStorage với khóa `lexi-progress-v1`. Trong Cài đặt, bật sao lưu và đăng nhập ChatGPT để lưu thêm trên máy chủ của Lexi. Chỉ coi bản mới được sao lưu sau khi máy chủ xác nhận; khi offline/lỗi bộ nhớ, xem trạng thái còn chờ và xuất tệp dự phòng. Đăng nhập đúng tài khoản để khôi phục khi iOS xóa dữ liệu local. PWA không thể buộc iOS giữ dữ liệu mãi. Giọng phát âm dùng speechSynthesis của hệ điều hành; một số giọng cần mạng hoặc tải trước trong cài đặt thiết bị.

## Chạy mã nguồn trên PC

Cần Node.js >=22.13 và npm.

```sh
npm run install:ci
npm run build
# Áp dụng các SQL migration chưa chạy, theo thứ tự; chỉ cơ sở dữ liệu local:
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_slim_annihilus.sql
npm run dev -- --hostname 127.0.0.1
```

Preview portable giả lập đăng nhập tại /signin-with-chatgpt bằng tài khoản local. Dữ liệu local preview độc lập với dữ liệu đã publish. Hosting Sites cấp D1 binding DB và áp dụng migration khi deploy; không đổi project_id hoặc domain để giữ tiến độ cũ.

## Cấu trúc

- public/: giao diện PWA hiện tại, thư viện 160 từ gốc/312 mục so sánh, icon và service worker.
- public/backup.js: quản lý bảo vệ lưu trữ, sao lưu/khôi phục và trạng thái.
- app/route.ts: phục vụ tài liệu HTML gốc, giữ nguyên URL và không tải React vào giao diện học.
- app/api/backup/route.ts, lib/backup-api.ts: API sao lưu riêng từng người dùng; danh tính do Sites xác thực.
- lib/lexi-catalog.json: ID từ và chủ đề hợp lệ để kiểm tra dữ liệu gửi lên máy chủ. Cập nhật khi thêm từ mới, giữ ID cũ.
- db/schema.ts, drizzle/: schema và migration D1 đã sinh. Không sửa migration đã áp dụng.
- dist/: đầu ra build, không chỉnh trực tiếp.

Khi đổi tài nguyên đã cache, tăng CACHE_NAME trong public/sw.js. API/đăng nhập không được đưa vào cache. Bản cập nhật service worker chờ các cửa sổ cũ đóng để tránh đổi mã giữa phiên học.

## Bảo vệ tiến độ và quyền riêng tư

Sao lưu là tùy chọn. Bật trong Cài đặt để gửi tiến độ học, lịch ôn, mục tiêu và từ đã lưu tới D1 của Site. Không gửi câu trả lời tới mô hình AI. Khóa dữ liệu là ID tài khoản do nền tảng cấp, không phải email hoặc ID do trình duyệt tự chọn. Site công khai vẫn không cho đọc/ghi bản sao của tài khoản khác. Mọi API dùng no-store, yêu cầu danh tính; ghi yêu cầu Origin cùng site, JSON và ID tài khoản khớp.

Máy khách đọc bản sao trước khi ghi. Dùng revision/CAS để chống ghi đè từ thiết bị cũ; khác biệt cần lựa chọn rõ ràng. Máy chủ giữ 10 phiên bản gần nhất. GET /api/backup?history=1 liệt kê phiên bản của chính tài khoản; GET /api/backup?revision=N lấy một bản cụ thể. Không tự xóa bản sao khi người dùng đóng app hoặc dữ liệu local mất. Dữ liệu offline chưa tải lên không thể khôi phục từ máy chủ.

Home Screen được miễn giới hạn ITP 7 ngày; vẫn nên sao lưu ngoài origin. persist() chỉ là yêu cầu, không luôn được cấp. Không xin quyền thông báo để đổi lấy lưu trữ. Xuất JSON vào Files/iCloud Drive là phương án độc lập; mở bảng chia sẻ không chứng minh người dùng đã lưu tệp.

Tài liệu: https://webkit.org/tracking-prevention/ và https://webkit.org/blog/14403/updates-to-storage-policy/

## Kiểm tra đã thực hiện

`npm test`: API chạy trên D1/SQLite thật qua Miniflare và bộ điều khiển sao lưu chạy với các lỗi mạng, xóa dữ liệu local, xung đột thiết bị, đổi tài khoản, khôi phục lịch sử và yêu cầu lưu trữ. `npx tsc --noEmit`: kiểm tra TypeScript.


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

## Đăng xuất và đổi tài khoản

Trong Cài đặt hoặc Tiến độ, nút Đăng xuất xuất hiện khi đã xác định được tài khoản. Điều hướng top-level qua /signout-with-chatgpt của Sites; không tự xử lý cookie hoặc mật khẩu. App dừng sao lưu trước khi rời trang, giữ tiến độ local và bản sao cloud, cảnh báo nếu còn thay đổi chưa xác nhận. Khi quay lại có nút Đăng nhập bằng ChatGPT; dùng tài khoản mới cần chọn rõ có muốn chuyển bản local hay khôi phục bản tài khoản. Nếu nhà cung cấp đăng nhập tự chọn tài khoản cũ, đổi tài khoản ChatGPT trong cùng trình duyệt trước khi thử lại.

## TOEIC mục tiêu 400–800

public/toeic.js thêm 5 nhóm, mỗi nhóm 20 từ có ID riêng ổn định: toeic-400 … toeic-800. Mỗi mục có phiên âm UK, nghĩa, từ loại, ví dụ tự biên soạn Anh–Việt, nhãn CEFR tham khảo, collocation, usage, context và toeicTarget. Các mốc là mục tiêu tổng điểm Listening & Reading do Lexi sắp xếp để học tích lũy, không phải danh sách từ tần suất cao có thống kê, nhãn chính thức ETS, phép đổi CEFR hay dự đoán điểm. Bài quiz là luyện từ vựng, không mô phỏng đủ đề thi.

Mở #toeic từ thanh bên hoặc thẻ trên Hôm nay/Chủ đề. Từ điển có bộ lọc 400/500/600/700/800 và tìm cụm thường đi cùng. Thẻ đã lật hiển thị ghi chú cách dùng. Tất cả từ mới tham gia SRS/XP và sao lưu như từ cũ. lib/lexi-catalog.json được cập nhật đủ 260 ID; backend chặn client cache cũ ghi mất tiến độ TOEIC bằng catalogVersion. Không thay đổi ID hoặc nội dung của 160 từ gốc và 312 mục so sánh.

Ngữ cảnh đối chiếu: https://www.ets.org/pdfs/toeic/toeic-listening-reading-test-examinee-handbook.pdf (văn phòng, nhân sự, mua hàng, tài chính, vận chuyển, hợp đồng). Mô tả năng lực tham khảo: https://www.ets.org/pdfs/toeic/toeic-listening-reading-score-descriptors.pdf (điểm từng kỹ năng, không phải tổng điểm hay danh sách từ).

Chạy npm test để kiểm tra nội dung, ID, mọi câu điền từ, bộ lọc, sao lưu và khôi phục cả 100 từ mới trên D1/SQLite.
