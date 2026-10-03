# OPERATIONAL GAPS — Forest Command Center Gia Lai

Snapshot: 2026-09-11 (seed chuẩn). Số liệu từ `GET /api/ops/gaps` — chạy lại
endpoint để làm mới sau mỗi đợt nhập liệu thực địa.
Quy ước: VERIFIED (đã kiểm chứng) / PARTIAL (có một phần) / ESTIMATED (suy từ
vị trí, ghi rõ) / MISSING (trống — KHÔNG bịa).

## Tổng quan

| Hạng mục | total | verified | missing |
|---|---|---|---|
| Hồ chứa (water_assets) | 16 | 14 verified status | 16 thiếu SĐT liên hệ |
| Trạm/chòi GPS (DB) | 0 | 0 | 0 (chưa nhập — honest empty) |
| Trạm registry CSV (MISSING GPS) | 28 | — | 28 SĐT đường dây nóng thật (văn bản Kiểm lâm), chờ đo GPS |
| Tuyến tiếp cận (routes) | 0 | 0 | 0 (chưa khảo sát) |
| Xã có dân số VERIFIED | 134/134 | 134 (dan_so) | 0 |
| Thôn reference-sample | 20 điểm | — | ESTIMATED, không phải census |

## MISSING GPS

- Trạm/chòi DB: toàn bộ chưa nhập. `stations_registry.csv` có 28 dòng đường dây
  nóng thật (Chi cục + 3 Đội cơ động + 23 Hạt, nguồn duong-day-nong-kiem-lam),
  tất cả gps_status=MISSING — SĐT dùng được ngay trong directory, GPS phải đo
  thực địa trước khi điều hành.
- Hành động: đo GPS 28 điểm registry → nhập Admin (giữ SĐT, đổi MISSING → VERIFIED).
- Hồ: 16/16 VERIFIED (tọa độ operator-supplied).

## MISSING CONTACT

- Hồ: 16/16 thiếu contact_phone (manager/organization có đủ 16/16 → PARTIAL).
- Trạm/tuyến: 0 bản ghi nên chưa đánh giá.
- Hành động: PATCH `/api/water/assets/{id}/contact` hoặc Admin; đặt
  verification_date khi gọi xác minh → VERIFIED.

## MISSING ROUTE DATA

- Tuyến: 0. Chưa có geometry, road_condition, surface_type, tải trọng nào.
- Enum chuẩn (Module B): road_condition GOOD/FAIR/POOR/BLOCKED;
  surface_type PAVED/GRAVEL/FOREST_ROAD/TRAIL. API từ chối giá trị ngoài enum (400).
- Hành động: đi tuyến → ghi LineString + road_condition + surface_type +
  max_vehicle_tons + seasonal_access + source.

## MISSING ROAD CONDITION

- Hồ Ia Hrung: road_access=false duy nhất (đã ghi nhận trung thực, không suy đoán).
- Tuyến: toàn bộ MISSING (chưa có tuyến nào).

## MISSING VIEWER DATA

- streetview VERIFIED: 3/16 hồ (Biển Hồ, Plei Krông, Ialy).
- panoee: 0 (chưa có viewer_url nào).
- photos: ESTIMATED theo proximity ≤1km (PhotoEvidence gắn proposal, không gắn
  asset — không bao giờ ghi VERIFIED cho tier này).
- Còn lại: satellite (nền bản đồ, VERIFIED khi có tọa độ). Tier `none` chỉ khi
  mất tọa độ (không xảy ra với schema hiện tại).

## Trạng thái sẵn sàng

- Water layer: SẴN SÀNG (scoring A/B/C + ETA + threatened hoạt động).
- Station/route layer: CHƯA SẴN SÀNG — API + schema + UI đã xong, chờ dữ liệu.
- Communities: SẴN SÀNG MỘT PHẦN — 134 xã có dân số VERIFIED + bands;
  thôn chỉ 20 điểm ESTIMATED.
- Response Plan Engine vẫn chạy trung thực với missing (command_status
  NO_STATION / DATA_GAP) — không chặn điều hành, không bịa số.

## Checklist nhập liệu (cho kiểm lâm)

1. [ ] GPS + tên + loại cho từng chốt/trạm/chòi (Admin → Tài sản vận hành)
2. [ ] district/commune/manager/source cho từng trạm
3. [ ] SĐT + người liên hệ + ngày kiểm chứng (→ VERIFIED)
4. [ ] Tuyến: LineString + road_condition + surface_type + tải trọng + mùa + nguồn
5. [ ] Hồ: SĐT quản hồ + ngày kiểm chứng (PATCH contact)
6. [ ] viewer_url 360° khi có; tick streetview khi đã kiểm tra
7. [ ] Chạy lại `/api/ops/gaps` và đối chiếu bảng này
