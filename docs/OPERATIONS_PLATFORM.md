# Operations Platform — Local Tactical Digital Twin

Regional dashboard → local tactical twin. Honest statuses only: MISSING /
NOT_CONFIGURED / FIELD_VERIFICATION_REQUIRED. No fake data, no %.

## M1 AOI Tactical View / M2 Battlefield

- DB: none. PostGIS: none (framing is client math).
- FastAPI: none new (ignition already a param everywhere).
- React: FireSim AOI select 1/3/5km + click-to-ignite (2D map click sets
  lon/lat, no mock) + 🎯 Focus Fire (2D flyTo / 3D camera reset via focusKey).
- Three: TwinScene aoiKm prop reframes without rebuild; battlefield shows
  slopes (vertex shading), wind axis, access lines, water, teams.
- Data flow: ignition state → sim → both views. Perf: reframe O(1).
- Migrate: additive. Risk: click mis-tap → user can re-click (no persistence).

## M3–M5 Terrain / Ellipses / Front (giữ nguyên, đã verify)

- DEM mesh, draped ellipses, THREE.Points front — xem docs/TWIN3D.md.

## M5 Wind corridor (mới)

- Service `twin_ops.wind_corridor()` (pure geometry: axis + half-width from
  LB ratio) + `corridor_contains()`.
- FastAPI `wind_corridor` trong /api/simulate/fire (+communes_inside).
- PostGIS: `ST_Contains(ST_GeomFromGeoJSON(corridor), ST_Centroid(geom))`.
- React/Three: dashed cyan outline (2D line layer + 3D LineLoop) + panel
  communes. Không CFD — ridge/valley đọc trên DEM 3D.
- Risk: corridor là swath hình học, không mô phỏng xoáy địa hình.

## M6 Routes (Time To Impact + Alternative)

- Service: earliest-step có sẵn; alternative = tuyến SAFE gần nhất theo
  vertex (FIELD_VERIFICATION_REQUIRED khi không có).
- FastAPI: `alternative_route` + `alternative_distance_km` trong routes.
- React: panel + thay thế xanh; 3D giữ màu band (xám khi đóng kịch bản).
- Risk: khoảng cách vertex–vertex là gần đúng (chưa road network).

## M7 Shield Score (mới)

- Service `community_shield()` + `nearest_support()`: exposure × water ×
  response × route → RESILIENT/WATCH/VULNERABLE/CRITICAL (worst-factor,
  không trung bình, không %).
- FastAPI: `shield` + `shield_components` + nearest_water/station trong
  /api/communities/threatened, /api/simulate/fire, (plan communities giữ
  band/ETA — shield xem ở 2 endpoint chuyên).
- React: badge 🛡️ trong impact card. Risk: centroid bbox gần đúng xã dài.

## M8 Protection Plan (mới)

- Service `protection_plan()`: PROTECT_NOW (CRITICAL; THREATENED chiến lược/
  trạm/nước) / MONITOR / LOW_PRIORITY, sort ưu tiên.
- FastAPI: `protection_plan` trong simulate + response-plan. React: panel
  FireSim + card Attack Plan (Command). Risk: strategic = hạng A hoặc band
  CRITICAL/THREATENED (định nghĩa công khai).

## M9 Earth Intel V2

- Thêm `major_risk_driver` (max severity) + `water_driver` (alias constraint).
  Không model mới — max có nhãn trên 4 drivers cũ.

## M10 Timeline (mới)

- Backend: hours đã linh hoạt (thêm 12h qua toggle T+12h).
- React: T+0/1/3/6/12 + playback 1.4s/bước + ALL; lọc ellipses/front/xã/
  story; tuyến/nước giữ toàn kịch bản (ghi rõ). Band xã theo cửa sổ 6h
  (hit ở 12h vẫn SAFE + first_hour 12 — ghi rõ).

## M11 Story Mode (mới)

- Service `tactical_story()`: ignition → route impacts → community flips →
  deployment, mỗi event trích số nguồn. Frontend feed đồng bộ timeline.
  Không LLM — deterministic template (tránh bịa narrative).

## M12–M13 Water/Plan viz (giữ + thêm ResponsePlanLayer)

- Dispatch: station→fire xanh lá đứt nét + vòng đánh dấu trạm + route chính
  viền trắng + vòng nước. Match tên best-effort, không đoán tọa độ.

## M14 Command V4

- Map layers (EcoMap) + link 2 chiều. Panel phải: plan + intel + bulletin +
  alerts (có sẵn). Panel dưới + Attack Plan card (deployment + PROTECT_NOW).

## M15 Performance

- Có sẵn: LOD/instancing/culling/pixelRatio/fps-guard (docs/TWIN3D.md).
- Mới: timeline filter giảm draw khi playback; corridor 1 polygon.

## Rollout

Deploy backend → frontend → mở /firesim: chọn AOI 3km, bật T+12h, playback,
đóng 1 tuyến, nâng ngưỡng nước → kiểm tra plan/story/bands đổi đúng →
Command Attack Plan. Ghi nhận: story template chưa thay AI narrative.
