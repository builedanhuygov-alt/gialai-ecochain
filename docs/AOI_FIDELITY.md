# AOI Visual Fidelity — địa hình thật, không động logic

Không đổi mô phỏng / plan / analyst / engine. Chỉ pixels + ánh sáng.

## M1 Imagery theo AOI (Three/texture strategy)

- 1km→z16, 3km→z15, 5km→z14 (2×2 tiles quanh ignition) + fallback cùng
  footprint ở zoom thấp hơn → Esri → OSM (toàn tiles thật, cover-crop đúng
  block DEM). texStatus hiện trong legend.
- Terrain strategy: block = DEM 2×2 (độ cao), texture phủ đúng block.

## M2 Mesh (Three.js changes)

- Segments theo AOI×device: 257/193/161 high, 129/97/81 low. Sampling giữ
  native 256px tile (ghi rõ cap). LOD: tier + fps auto-degrade có sẵn.
- GPU: 1km high ≈ 130k tris (OK desktop ~60fps), low ≈ 32k.

## M3 Satellite drape

- CanvasTexture 512 + anisotropy 4 + vertexColors multiply. Không flat color
  ở bất kỳ path nào (fallback OSM vẫn là imagery thật).

## M4 Canopy patches (forest strategy)

- Gom pixel xanh thành cells 40×40 → disc/cell (bán kính + màu theo mật độ,
  ≥25% mới thành patch, ≤1200, 1 draw call). Rừng có dense/sparse/clearing/
  edges tự nhiên từ dữ liệu. Không cây riêng lẻ (không có kiểm kê).

## M5 Fire distortion (visual only)

- Catmull-Rom kín 200/128 pts (cùng polygon server) + glow + edge +
  current pulse. Ghi rõ: distortion mượt biên, không đổi vật lý lan.

## M6 Wind × terrain (visual only)

- Arrow ngắn lại ở sườn đón gió dốc (sheltered, xám), dài downslope;
  mật độ theo AOI. Không CFD — đọc ridge/valley trên DEM.

## M4 Ridge/valley (đã có, tăng contrast)

- Điểm ridge nâu / valley xanh + slope tint tương phản cao hơn.

## M7 Micro landcover (derived, labeled)

- Per-vertex class từ pixel thật + slope + cao độ: rock/dense/sparse/
  bare/grass (multiplier nhẹ, imagery vẫn chủ đạo) + AO concavity bake.

## M8–M9 Routes/water/communities (giữ + tubes/ripples có sẵn)

## M10 Camera (đã có Focus ×4 + 2 orbit modes)

## M11 Lighting (tuned)

- Hemi 0.6 + sun 1.2 (chống wash-out trắng) + shadow PCFSoft desktop +
  fog + ACES exposure mặc định. Không đỉnh đen (hemisphere ground sáng),
  không trắng cháy (sun giảm).

## M12 Perf

- Instancing (canopy/assets), culling mặc định, pixelRatio clamp, fps guard,
  chunk loading (commune light/full). Estimate: desktop 60, laptop 30+.

## Rollout

Deploy frontend → /firesim 3D đọc legend (lưới/ảnh/LOD/patch/FPS) →
so AOI 1km vs 5km → nếu trắng: texStatus + console tile errors.
