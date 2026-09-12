# GEOFM Twin — Geospatial Foundation Model Digital Twin (tỉnh Gia Lai)

4 layers: Observation (có sẵn) → Earth Intelligence (abstraction, KHÔNG model
mới) → Tactical Decision → Digital Twin Simulator. Không xác suất chưa hiệu
chuẩn; thiếu dữ liệu trả MISSING / NOT_CONFIGURED / FIELD_VERIFICATION_REQUIRED.

## Module A — Earth Intelligence Layer

- DB: không đổi (đọc inputs sẵn có). PostGIS: không (suy luận số học).
- FastAPI: `twin_ops.earth_intelligence()` + `earth_intelligence` trong mọi
  response-plan. Drivers: terrain (slope→ROS mult), fuel (T/H dryness),
  weather (wind), access (routes surveyed?), water constraint + recommended
  action (rules thứ tự) + insights. Mỗi driver ghi nguồn số.
- React: Command + FireSim hiển thị recommended_action + 4 mức driver.
- Data flow: plan sections → intel → bulletin/UI. Perf: O(1).
- Deploy: cùng backend. Risk: driver MISSING khi thiếu input (đúng thiết kế).

## Module B–G — Twin 3D (giữ nguyên, refactor named layers)

- DB/PostGIS: không đổi (stateless sim + intersect mẫu sẵn có).
- FastAPI: `POST /api/simulate/fire` (+closed_route_ids, +min_water_capacity_m3).
- React/Three: `TwinLayers.ts` export đúng tên spec — TerrainMesh,
  FireEllipseMesh, WindFieldLayer, ThreatenedAssetLayer, RouteImpactLayer,
  CommunityImpactLayer, WaterAccessLayer (+ FireFrontPoints, buildCanopy);
  `TwinScene.tsx` owns lifecycle. 60 FPS desktop / degrade tự động.
- Data flow: sliders → sim → 2D + 3D + impact + plan + bulletin cùng lúc.
- Perf: xem docs/TWIN3D.md. Deploy: three.js code-split khỏi bundle chính.
- Risk: tile DEM/Esri bên thứ ba (fallback lỗi trung thực).

## Module H — Threatened Communities (+distance/ETA)

- DB: không. PostGIS: centroid ví dụ `ST_Centroid` (hiện tính Python bbox).
- FastAPI: `GET /api/communities/threatened` + `threatened_communities`
  trong plan — mỗi xã/thôn có distance_km (tới centroid/khúc thôn) +
  eta_hours (dist/ROS) + population VERIFIED/ESTIMATED/MISSING.
- React: FireSim impact + Command Top Risk Areas. Risk: centroid bbox là
  gần đúng cho xã dài (ghi rõ ETA ~).

## Module I/J — Water & Route impact (giữ nguyên + scenario)

- Waters lọc theo ngưỡng dung tích (labeled exclusions); routes đóng theo
  kịch bản (giữ band lan, màu xám, panel "dùng dự phòng") — closure đổi
  PHÂN CÔNG, không đổi vật lý.

## Module K — Response Plan (full contract)

- Output: primary/backup station/water/route, threatened_assets,
  threatened_communities (+distance/ETA), deployment_plan (5 bước có thứ tự,
  ETA trích dẫn), eta_minutes, command_status, scenario echo
  (exclude_route_ids/closed_routes/min_cap/excluded_waters).
- Deploy cùng backend, tương thích ngược (chỉ thêm keys).

## Module L — AI Analyst (14 sections)

- Bulletin cũ + phan_tich_dia_hinh + tac_dong_cong_dong +
  ke_hoach_trieu_dong + rui_ro_van_hanh (+hinh_anh có sẵn). Chỉ CẤP I-V +
  confidence + reasoning, không %.

## Module M — What-if Lab V2 (FireSim)

- Thêm sliders: đóng tuyến (select route DB thật) + ngưỡng dung tích hồ.
  Auto: sim debounce 500ms; plan+bulletin auto-regen debounce 1500ms + cờ
  "plan cũ". Không mock route/GPS nào.

## Module N — Command Center V3

- Map layers có sẵn (EcoMap) + link 2 chiều Command↔FireSim. Panel phải:
  plan + bulletin + alerts (có sẵn). Panel dưới +2: Top Risk Areas
  (từ plan threatened_communities) + Operational Alerts (CRITICAL alerts +
  CRITICAL assets + missing data).
- Deploy: cùng frontend. Risk: panels trống trung thực khi chưa chạy plan.

## Rollout

1. Deploy backend → frontend (lệnh cũ). 2. Chạy sim Hội Sơn, đối chiếu plan
   cũ/mới. 3. Nhập GPS 28 registry + road survey (gaps). 4. Không quảng bá
   "foundation model" với dân — đây là abstraction quyết định, không phải ML.
