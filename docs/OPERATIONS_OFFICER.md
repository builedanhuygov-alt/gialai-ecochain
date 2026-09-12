# Operations Officer — đề xuất hành động tác chiến

Plan phân tích → Officer đề xuất. Không %, không bịa, mọi action trích nguồn.

## M1 AI Operations Officer (TOP 5)

- DB: none. PostGIS: none.
- FastAPI: `twin_ops.operations_officer()` → `top_actions` trong
  /api/simulate/fire + response-plan. Mỗi action: reason + eta +
  required_assets + confidence (LOW/MODERATE/HIGH theo độ đủ dữ liệu).
  Thiếu chân → action MISSING trung thực (vẫn đủ 5 slot).
- React: FireSim panel TOP 5 + Command "Operations Officer" card.
- Data flow: primaries + closed routes + threatened + waters.
- Perf O(1). Migrate: additive keys. Risk: ETA đường chim bay (ghi rõ).

## M2 Operational Checklist

- Service `operational_checklist()`: immediate (verify_first) / short_term
  (ETA≤30′ + CRITICAL) / medium_term (còn lại + THREATENED + xã).
- FastAPI: `checklist` cả 2 endpoints. React: FireSim checklist block.

## M3 Shield V2

- Thêm terrain_difficulty (DEM client → tương lai truyền mean_slope vào API;
  hiện UNKNOWN trung thực) + population vào components; dashboard = bảng
  shield FireSim + panel Command (tooltip chi tiết từng thành phần).

## M4 Risk Driver Visualizer (WHY trên terrain)

- Three `RiskDriverLayer`: viền ellipse hiện tại tô màu driver chủ đạo
  (terrain/wind/fuel/access) + legend; WHY panel liệt kê mức + số nguồn.
- 2D: chưa tô (tránh lẫn màu band) — WHY panel dùng chung.

## M5 Local Terrain Analysis

- Three `TerrainAnalysisLayer`: slope zones (thống kê), ridge/valley
  ESTIMATED (cực trị + prominence 0.5m), stats panel (mean/max/ruggedness/
  steep%). Wind/water corridors + route constraints đã có (cyan outline,
  access lines, màu band). DEM lỗi → không phân tích (không bịa).

## M6 Fire Behavior Explainer

- Service `fire_behavior()`: so hệ số gió/dốc/scenario → wind-driven /
  terrain-driven / fuel-driven / mixed + câu "cháy lan hướng X vì...".
- FastAPI: `fire_behavior` cả 2 endpoints + `giai_thich_chay` bulletin.

## M7 Timeline scrubber + compare

- T+0/1/3/6/12 + playback + ALL; toggle T+12h (backend hours linh hoạt).
  Lọc ellipse/front/xã/story; tuyến/nước giữ toàn kịch bản (ghi rõ).
- Compare: scenario B (gió khác) overlay nét đứt tím 2D + delta diện tích/xã.

## M8–M9 Attack/Protection (giữ + mở rộng)

- `ResponsePlanLayer` 3D (trạm→cháy xanh, route viền trắng, vòng nước) +
  card Attack Plan Command. Protection có `detail` lý do từng tài sản.

## M10 Earth Intel V3

- Thêm major_bottleneck (constraint tệ nhất), critical_asset/community
  (PROTECT_NOW / CRITICAL đầu), best_intervention (theo bottleneck).

## M11 Story (giữ, nhóm theo T)

- Template deterministic, group T+0/1/3/6/12 trong UI, đồng bộ timeline.

## M12 Command V5

- +4 cards: Officer TOP 5 (+best intervention), Shield, Risk Drivers (+behavior),
  (Attack Plan có sẵn). Panel trống trung thực khi chưa chạy plan.

## Rollout

Deploy backend → frontend → /firesim: bật terrain analysis, WHY, compare B,
playback T+12 → Command kiểm tra 4 cards → đào tạo: đọc WHY trước khi đọc band.
