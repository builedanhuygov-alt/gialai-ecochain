# AOI Quality — Tactical AOI hiển thị như khu vực thật

Không đổi logic mô phỏng / plan / analyst. Chỉ nâng hiển thị + chi tiết AOI.

## M1 High-res terrain (DB: none, API: none)

- Mesh segments theo AOI: 1km→256², 3km→192², 5km→160² (high); 128/96/80
  (low). Sampling giữ native theo tile DEM 256px — grid dày hơn không thêm
  chi tiết thật nên đó là cap trung thực (ghi trong code + UI).
- PostGIS: không (client-side). Migration: none. Risk: 256² = 130k tris —
  OK desktop, low dùng 128².

## M2 TerrainMesh

- `TwinLayers.TerrainMesh(origin, quality, aoiKm)` async: DEM + texture +
  sampler + grid + texStatus. React `TwinScene` owns lifecycle/dispose.
- LOD: quality-tier meshes + fps auto-degrade có sẵn.

## M3 Satellite texture

- Fallback chain: Esri z14 → Esri z13 → OSM z14 (toàn tiles thật);
  texStatus hiện trong legend (lưới N² · ảnh <nguồn>). Anisotropy 4 cho
  góc nghiêng. DEM lỗi → panel lỗi + 2D (không mặt phẳng giả).

## M4 Canopy patches

- Gom pixel xanh thành cells 40×40 → 1 disc/cell (bán kính + màu theo mật
  độ, ≤1200 patches, InstancedMesh 1 draw call). Không render từng cây
  (không có kiểm kê cây — bịa vị trí cây là dữ liệu giả).

## M5 High-res fire

- Resample Catmull-Rom kín → 200/128 vertices (cùng polygon server);
  core + glow + edge; current pulse opacity. Không đổi hình học lan.

## M6 Wind density theo AOI (7×7 / 5×5 / 3×3) + corridor outline có sẵn.

## M7 Routes: TubeGeometry casing trắng + core màu band (outline thật,
  không phụ thuộc line-width 1px). M8: vòng nước màu priority + ripple
  pulse (ghi rõ không có polygon mặt nước nên không vẽ shoreline giả).

## M9 Communities: fills boundary thật + shield tooltip (có sẵn).

## M10 Camera: Focus Fire/Water/Community/Route (tọa độ từ data đã load,
  không đoán) + Cinematic (autoRotate) / Tactical. Không rebuild scene.

## M11 Lighting: hemi 0.6 + sun 1.2 (chống wash-out), shadow PCFSoft
  desktop-only, fog, ACES. Ưu tiên đọc địa hình.

## M12 Perf: targets + instancing + culling + pixelRatio clamp + fps guard
  + chunk loading (commune light/full fallback). Dynamic resolution =
  mesh segs theo AOI × quality tier.

## M13 First-frame: camera theo AOI → terrain → overlays; legend hiện
  lưới/texture/FPS; caption canopy ESTIMATED.

## Rollout

Deploy backend (không đổi) → frontend → mở /firesim 3D: kiểm tra lưới +
nguồn ảnh trong legend, xoay/zoom, focus từng mục tiêu, orbit cinematic.
Nếu vẫn trắng: đọc legend (texStatus) + console tile errors — báo lại 2
dòng này thay vì ảnh chụp.
