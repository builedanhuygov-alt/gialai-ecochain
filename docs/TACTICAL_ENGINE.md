# Tactical Decision Engine — Gia Lai Forest Command Center

Thực chiến, không demo. Mọi số đều truy vết được. Không xác suất % chưa hiệu chuẩn.
SQLite chạy ngay; Postgres+PostGIS mở KNN index khi scale.

## MODULE 1 — Nearest Station

1. **Schema** — `operational_assets` (`app/models/ops.py`): `asset_type IN (station,team)`,
   `status`, `latitude/longitude`, `contact NULL` (SĐT/người — NULL tới khi kiểm lâm nhập),
   `created_by`. Không seed trạm giả.
2. **API** — `GET /api/stations/nearest?lat=&lon=&avg_speed_kmh=` →
   `{station_name, station_type, distance_km, eta_minutes, contact, operational_status}`.
   Honest-empty khi chưa có trạm. Alias cũ `GET /api/assets/nearest-station` giữ nguyên.
3. **PostGIS** — `postgis_init.sql` (M1):
   `... WHERE status='active' AND asset_type IN ('station','team')
   ORDER BY geom::geography <-> point LIMIT 2` + GIST index.
4. **FastAPI** — `app/api/routes/assets.py::_rank_stations`: thử KNN PostGIS khi
   `DATABASE_URL=postgresql...`, fallback vòng haversine trên SQLite. ETA =
   `dist × 1.3 / speed × 60` (`twin_ops.road_eta_minutes`).
5. **React** — `api.stationsNearest()` + Admin nhập contact + Command hiển thị
   primary/backup station + ☎.
6. **Performance** — SQLite O(n) đủ vài trăm assets; Postgres KNN O(log n) tới hàng nghìn.
7. **Risks** — 17 chốt chưa nhập GPS → API trả null trung thực; contact null tới khi có số thật.
8. **Migration** — fresh DB: `create_all` tự có cột; Postgres cũ: chạy `postgis_init.sql`
   (ALTER ADD contact + geom generated + GIST).

## MODULE 2 — Nearest Route

1. **Schema** — cùng bảng: `asset_type='route'`, `geometry` GeoJSON LineString,
   `route_type NULL`, `road_condition NULL` (dry/mud/blocked — NULL tới khi khảo sát).
2. **API** — `GET /api/routes/nearest?lat=&lon=` →
   `{route_name, distance_km, route_type, road_condition, geometry}` + `pgrouting: BLOCKED`.
   Alias cũ `/api/assets/nearest-route` giữ nguyên.
3. **PostGIS** — vertex-KNN cần bảng vertices khi scale (đã ghi chú trong SQL);
   hiện tại đo khoảng cách tới vertex gần nhất trong Python (documented).
4. **FastAPI** — `_rank_routes` top-2. **Không trả fastest/safest/backup giả** —
   pgRouting thiết kế xong nhưng BLOCKED vì chưa có road network.
5. **React** — `api.routesNearest()` + Admin nhập route_type/road_condition + Command hiển thị.
6. **Performance** — routes ít (<100), vertex-scan đủ nhanh; scale bằng vertices table sau.
7. **Risks** — vertex-distance đánh giá thấp đường ngoằn ngoèo → ETA ghi rõ giả định.
8. **Migration** — như M1 (ALTER ADD route_type/road_condition).

## MODULE 3 — Threatened Asset Engine

1. **Schema** — đọc từ `operational_assets` + `water_assets` + commune GeoJSON
   (`gialai_communes.geojson`), không bảng mới.
2. **API** — `GET /api/assets/threatened?lat=&lon=&wind_speed_kmh=&wind_direction_deg=&slope_deg=`
   → `{operational_threats, water_threats, communes_per_step, summary}`.
   Riêng nước: `GET /api/water/threatened` (giữ nguyên).
3. **PostGIS** — `ST_Intersects(geom, ST_GeomFromGeoJSON(:poly_1h/3h/6h))` (mẫu trong SQL).
4. **FastAPI** — `twin_ops.assess_asset_threat` (ETA=dist/ROS) +
   `assess_water_threat` (nặng hơn giữa polygon ∩ và ETA). Logic công khai.
5. **React** — Command hiển thị `asset_threats` + `water_threats` non-SAFE.
6. **Performance** — point-in-ring O(v) với v=20 đỉnh ellipse; communes bbox-prefilter.
7. **Risks** — ellipse là heuristic (ghi rõ MODEL), không phải FARSITE; ROS sai → band sai theo.
8. **Migration** — không đổi schema.

## MODULE 4 — Tactical Water Scoring

1. **Schema** — `water_assets` 16 hồ thật (capacity_m3, road_access, status, manager).
2. **API** — `GET /api/water/nearest` + `water_ranking` trong response-plan.
   Mỗi dòng: `components{distance,capacity,road_access,infrastructure,direction_safety}` +
   `breakdown{distance_score,capacity_score,access_score,infra_score,safety_score,total_score}`.
3. **PostGIS** — KNN nước (mẫu SQL có sẵn) + Python scoring.
4. **FastAPI** — `twin_ops.score_water_spec`: tổng = 0.40·dist + 0.30·cap + 0.20·road + 0.10·infra;
   A≥80, B 50–79, C<50 hoặc chưa verified. **safety_score là advisory, không vào tổng**
   (chưa có trọng số hiệu chuẩn — cố nhét vào mới là black-box).
5. **React** — Command hiển thị hạng + breakdown khi cần giải trình.
6. **Performance** — 16 hồ: không đáng kể.
7. **Risks** — capacity NULL → 0 điểm (ghi rõ); unverified luôn C.
8. **Migration** — không đổi.

## MODULE 5 — Response Plan Engine

1. **Schema** — không bảng mới; đọc assets + water + communes + weather/FIRMS live.
2. **API** — `POST /api/v1/fires/response-plan {lon,lat,avg_speed_kmh,slope_deg}` →
   `{affected_area, primary_station, backup_station, primary_water, backup_water,
   primary_route, backup_route, eta_minutes, threatened_assets (+asset_threats/water_threats),
   tactical_recommendations, command_status, analyst_bulletin, ...}`.
   Keys cũ (`nearest_*`, `water_ranking`) giữ nguyên tương thích ngược.
3. **PostGIS** — tái dùng KNN M1/M2 bên trong.
4. **FastAPI** — `app/api/routes/fire.py::response_plan` 6 bước: weather → FIRMS+risk →
   spread+communes → assets/water/station/route/threats → FWI → recs (rules có trích dẫn).
5. **React** — Command `runPlan()` hiển thị full contract (đã nối).
6. **Performance** — 1 call Open-Meteo + 1 FIRMS + compute local; ~4–5s khi live.
7. **Risks** — weather/FIRMS down → defaults ghi rõ + `missing` hạ tin cậy; routing chim bay.
8. **Migration** — không đổi schema.

## MODULE 6 — AI Analyst Output

- Formatter thuần `twin_ops.build_analyst_bulletin(plan)` → 10 mục đúng mẫu lệnh
  (tình hình, vị trí, cấp, thời tiết, hướng lan, trạm, nước, tuyến, khuyến nghị, đe dọa).
- Chỉ CẤP I–V + confidence + reasoning; **không % xác suất** (test assert không có `probability`).
- Trả trong response-plan (`analyst_bulletin`), Command render khối bản tin.

## MODULE 7 — FWI Integration

- `GET /api/fwi?lat=&lon=&slope_deg=` → live temp/humidity/wind/rain14d +
  `fwi{ffmc, isi, method, assumption}` (Van Wagner, prev FFMC=85 ghi rõ) +
  `spread_severity{level, ros_kmh, severity_rule}` +
  `threatened_communities` per 1/3/6h.
- Full FWI/BUI/DMC/DC **không trả** (cần history nhiều ngày — trả là bịa).
- Severity là HEURISTIC công khai, chưa hiệu chuẩn (ghi trong response).

## MODULE 8 — Command Center V2

- Map layers hiện có: fires (FIRMS), spread, water (16 hồ), stations/routes (assets).
  Threatened layer: dùng `in_1h/in_3h/in_6h` + band màu (CRITICAL đỏ…).
- Panel phải (`Command.tsx`): Response Plan full + AI bulletin + alerts — đã nối.
- Panel dưới: Active Incidents + Asset Status (có); Top Risk Communes: dùng
  `affected_area.communes` + `risk/overview` (bước tiếp theo: bảng xếp hạng xã theo FIRMS+Firms).
- GEE/Sentinel: **chưa bật** — giữ `NOT_CONFIGURED` trung thực, không mock ảnh vệ tinh.

## Production Reality Checklist

- [x] NULL > rác (contact/road/station rỗng trung thực)
- [x] ETA ghi giả định ×1.3 @30km/h
- [x] FWI ghi assumption prev-FFMC 85, không BUI
- [x] Spread ghi ELLIPTICAL_HEURISTIC_V1, không phải vật lý cháy
- [x] pgRouting BLOCKED công khai, không fastest-route giả
- [ ] Việc tiếp: nhập GPS 17 chốt + khảo sát road_condition + road network cho pgRouting
