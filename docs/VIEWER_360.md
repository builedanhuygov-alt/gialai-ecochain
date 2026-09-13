# Viewer 360 (Panoee) — Forest Command Center

Không engine 360 mới, không ảnh tự tạo, không dữ liệu giả. Chỉ hiển thị
những gì thực sự tồn tại. Không URL nào được tự sinh — streetview thiếu URL
chỉ báo tồn tại, không link bịa.

## 1. Database migration

- Fresh SQLite: `create_all` tự có cột (`preview_image_url`, `capture_date`,
  `capture_source` trên cả `operational_assets` + `water_assets`).
- Postgres cũ: chạy `backend/postgis_init.sql` (ALTERs Module 360).
- Không backfill: mọi cột mới NULL cho tới khi kiểm lâm nhập thật.

## 2. FastAPI endpoints

- `GET /api/assets/{id}/detail` — payload hợp nhất ops + water cho trang viewer.
- `GET /api/assets/{id}/viewer` — full chain + proximity ảnh (có sẵn).
- `PATCH /api/assets/{id}` + `PATCH /api/water/assets/{id}/viewer` —
  nhập `viewer_url/preview_image_url/capture_date/capture_source/has_streetview`.
- `POST /api/v1/fires/response-plan` trả thêm `viewer_notes` +
  `primary_*[].viewer` + bulletin `hinh_anh_hien_truong`.
- Whitelist domain (`twin_ops.VIEWER_WHITELIST`): Panoee
  (panoee.net/com, cloud/app) + Google Maps (google.com, maps.google.com,
  goo.gl). URL ngoài whitelist vẫn lưu (http/https) nhưng nhãn
  `field_check_required` — phân loại thay vì chặn để không mất dữ liệu thực địa.

## 3. React components

- `pages/Viewer.tsx` (`/viewer/:assetId`): iframe Panoee (fullscreen,
  responsive, `height: min(70vh,560px)`, mobile 60vh) + tên/loại/ngày cập nhật
  + nguồn capture + trạng thái xác minh. Streetview có URL → nút mở;
  không URL → text hướng dẫn bổ sung; photos/satellite/none → text trung thực.
- `Admin.tsx`: ô nhập viewer_url/preview/capture_date/capture_source +
  select streetview (chưa rõ/có/không) + 2 loại asset mới (Nhà rông, Điểm nguy
  cơ cao) + badge viewer/viewer_status mỗi dòng + link Xem.
- `api.ts`: `assetDetail()`.

## 4. Asset popup integration (M6)

`MapView.tsx`: nút sáng khi viewer mở được (panoee → trang /viewer nội bộ;
streetview có URL → link ngoài), text mờ khi streetview thiếu URL /
satellite / none ("Chưa có dữ liệu 360°"). Ảnh cộng đồng gần đó giữ nguyên
cho tier photos. Marker hồ thêm dòng viewer tương tự.

## 5. Command Center integration

`Command.tsx` hiển thị `hinh_anh_hien_truong` trong bản tin AI (câu M8:
"Quan sát hiện trường 360° khả dụng." / "Hiện trường có dữ liệu hình ảnh." /
"Chưa có dữ liệu hình ảnh xác minh.").

## 6. Security review

- Chỉ nhận http/https (400 nếu khác) cho `viewer_url`/`preview_image_url`.
- Iframe không `allow-same-origin` — chỉ `fullscreen/accelerometer/gyroscope`;
  không script bridge, không postMessage parsing → không XSS từ tour lạ.
- URL ngoài whitelist không bị chặn nhưng gắn `field_check_required` và Admin
  thấy badge — kiểm lâm quyết định tin hay không, hệ thống không tự tin hộ.
- SĐT đường dây nóng là dữ liệu công khai theo văn bản (không phải PII rò rỉ);
  vẫn chỉ đọc từ CSV + directory, không ghi log.

## 7. Mobile UX

- Viewer page 1 cột, iframe 60vh, nút ≥44px theo tay; popup maxWidth 300px
  giữ nguyên (bản đồ mobile đã có bottom-sheet pattern riêng).
- Không autoplay, không tải iframe khi tier != panoee (tiết kiệm 4G thực địa).

## 8. Production rollout plan

1. Deploy backend (migration ALTERs trước khi rolling pod mới).
2. Nhập tour Panoee thật đầu tiên cho 1 chòi + 1 hồ → kiểm tra badge verified.
3. Đo GPS 28 điểm registry (giữ SĐT, đổi MISSING → VERIFIED).
4. Bổ sung streetview URL cho 3 hồ đã flag.
5. Tái chạy `/api/ops/gaps`, cập nhật `docs/OPERATIONAL_GAPS.md`.
6. Không quảng bá "360 toàn tỉnh" cho tới khi >50% trạm VERIFIED.
