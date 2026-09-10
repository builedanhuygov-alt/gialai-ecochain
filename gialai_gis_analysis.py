#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
GIS & Khoa học Dữ liệu - Tỉnh Gia Lai (135 xã/phường)
Thực hiện 3 nhiệm vụ:
 1) Phân tích & Thống kê GeoJSON
 2) Trích xuất Excel (ma_xa, ten_xa, dtich_km2, dan_so, sap_nhap)
 3) Rasterization Vector -> Raster Mask 4096x4096 (pixel = ma_xa)

Yêu cầu thư viện:
 pip install geopandas rasterio pandas openpyxl shapely

Tác giả: Muse Spark - Chuyên gia GIS
"""

import json
import pathlib
import numpy as np
import pandas as pd
import geopandas as gpd
from shapely.geometry import shape, Polygon, MultiPolygon
from shapely.validation import make_valid
import rasterio
from rasterio.features import rasterize
from rasterio.transform import from_bounds

# =============================================================
# CẤU HÌNH
# =============================================================
# Đặt file GeoJSON ở cùng thư mục script hoặc chỉ đường dẫn tuyệt đối
# Hỗ trợ cả .geojson và .json
POSSIBLE_INPUTS = [
    "gialai_135.geojson",
    "gialai_135.json",
    r"C:\Users\danhu\Downloads\gialai_135.json",
    "data/gialai_135.geojson",
]
OUTPUT_EXCEL = "danh_sach_xa.xlsx"
OUTPUT_RASTER_TIF = "gialai_mask_4096.tif"
OUTPUT_RASTER_NPY = "gialai_mask_4096.npy"  # tiện cho AI training

RASTER_WIDTH = 4096
RASTER_HEIGHT = 4096
RASTER_DTYPE = np.uint16  # ma_xa max ~152 < 65535, dùng uint16 tiết kiệm RAM; nếu ma_xa >65535 dùng uint32
RASTER_CRS = "EPSG:4326"  # WGS84 (lon/lat) như trong GeoJSON

def find_input_file() -> pathlib.Path:
    for p in POSSIBLE_INPUTS:
        path = pathlib.Path(p)
        if path.exists():
            return path
    raise FileNotFoundError(
        f"Không tìm thấy file GeoJSON. Đã thử: {POSSIBLE_INPUTS}. "
        "Hãy copy gialai_135.geojson vào thư mục hiện tại hoặc sửa POSSIBLE_INPUTS."
    )

def load_geojson_robust(path: pathlib.Path) -> gpd.GeoDataFrame:
    """
    Đọc GeoJSON robust:
    - Ưu tiên geopandas với on_invalid='ignore' để nhanh
    - Nếu có geometry None (vd ma_xa=131 bị invalid ring 2 điểm), fallback sang parse thủ công + make_valid
    - Đảm bảo tất cả 135 (thực tế file có 134) features đều có geometry hợp lệ
    """
    # Thử cách 1: geopandas
    try:
        gdf_try = gpd.read_file(path, on_invalid="ignore")
        # Kiểm tra có geometry None không
        n_none = gdf_try.geometry.isna().sum() if hasattr(gdf_try.geometry, "isna") else sum(g is None for g in gdf_try.geometry)
        # Với file Gia Lai, ma_xa 131 sẽ bị None -> cần fallback
        if n_none == 0:
            # gán CRS nếu thiếu (GeoJSON mặc định WGS84)
            if gdf_try.crs is None:
                gdf_try.set_crs(epsg=4326, inplace=True)
            return gdf_try
        else:
            print(f"[Cảnh báo] geopandas on_invalid='ignore' làm mất {n_none} geometry (None). Chuyển sang parse thủ công + make_valid...")
    except Exception as e:
        print(f"[Cảnh báo] gpd.read_file thất bại ({e}), chuyển sang parse thủ công...")

    # Cách 2: parse thủ công bằng json + shapely make_valid
    with open(path, encoding="utf-8") as f:
        data = json.load(f)

    def sanitize_geojson(geom_dict):
        """Loại bỏ LinearRing <4 điểm (lỗi phổ biến ở ma_xa=131) và polygon rỗng"""
        if geom_dict is None:
            return None, False
        gtype = geom_dict.get("type")
        coords = geom_dict.get("coordinates")
        if gtype == "MultiPolygon":
            cleaned = []
            removed = 0
            for poly in coords:
                clean_rings = []
                for ring in poly:
                    if len(ring) >= 4:
                        clean_rings.append(ring)
                    else:
                        removed += 1
                if clean_rings:
                    cleaned.append(clean_rings)
                else:
                    removed += 1  # cả polygon bị loại
            if not cleaned:
                return None, removed > 0
            is_changed = removed > 0 or len(cleaned) != len(coords)
            return {"type": "MultiPolygon", "coordinates": cleaned}, is_changed
        elif gtype == "Polygon":
            clean_rings = [r for r in coords if len(r) >= 4]
            removed = len(coords) - len(clean_rings)
            if not clean_rings:
                return None, removed > 0
            is_changed = removed > 0
            return {"type": "Polygon", "coordinates": clean_rings}, is_changed
        else:
            return geom_dict, False

    rows = []
    n_invalid_fixed = 0
    n_sanitized = 0
    for feat in data["features"]:
        props = feat["properties"]
        geom_dict_orig = feat["geometry"]
        # sanitize trước khi tạo shape (xử lý ring 2 điểm)
        geom_dict, changed = sanitize_geojson(geom_dict_orig)
        if geom_dict is None:
            print(f"[Bỏ qua] ma_xa={props.get('ma_xa')} không còn polygon hợp lệ sau sanitize")
            continue
        if changed:
            n_sanitized += 1
        try:
            geom = shape(geom_dict)  # tạo shapely geometry
            if not geom.is_valid:
                geom = make_valid(geom)
                n_invalid_fixed += 1
            # make_valid có thể trả về GeometryCollection chứa Polygon + LineString
            # chỉ giữ phần Polygon/MultiPolygon
            if geom.geom_type == "GeometryCollection":
                polys = [g for g in geom.geoms if g.geom_type in ("Polygon", "MultiPolygon")]
                if not polys:
                    print(f"[Bỏ qua] ma_xa={props.get('ma_xa')} geometry rỗng sau make_valid")
                    continue
                # gộp các polygon thành MultiPolygon nếu nhiều
                if len(polys) == 1:
                    geom = polys[0]
                else:
                    # tạo MultiPolygon từ các polygon con
                    # cần flatten MultiPolygon con
                    flat = []
                    for p in polys:
                        if p.geom_type == "Polygon":
                            flat.append(p)
                        elif p.geom_type == "MultiPolygon":
                            flat.extend(list(p.geoms))
                    geom = MultiPolygon(flat)
        except Exception as e:
            print(f"[Lỗi] ma_xa={props.get('ma_xa')} không parse được geometry: {e}")
            continue
        rows.append({**props, "geometry": geom})

    print(f"[Thông tin] Đã sanitize {n_sanitized} geometry có ring lỗi, fix {n_invalid_fixed} geometry không hợp lệ bằng make_valid")
    gdf = gpd.GeoDataFrame(rows, crs=RASTER_CRS)
    return gdf


def task1_thong_ke(gdf: gpd.GeoDataFrame):
    """Nhiệm vụ 1: Phân tích & Thống kê"""
    print("=" * 70)
    print("NHIỆM VỤ 1: PHÂN TÍCH & THỐNG KÊ")
    print("=" * 70)
    total = len(gdf)
    print(f"Tổng số xã/phường: {total}")

    # Lấy danh sách thuộc tính (properties) - là các cột trừ geometry
    properties = [c for c in gdf.columns if c != "geometry"]
    print(f"Các trường thuộc tính ({len(properties)} trường):")
    for col in properties:
        print(f"  - {col}")

    # Thông tin thêm hữu ích
    print("\nChi tiết mẫu (5 dòng đầu):")
    cols_show = [c for c in ["ma_xa", "ten_xa", "dtich_km2", "dan_so", "sap_nhap"] if c in gdf.columns]
    print(gdf[cols_show].head().to_string(index=False))

    print(f"\nBounds (WGS84): {gdf.total_bounds}")  # [minx, miny, maxx, maxy]
    print(f"CRS: {gdf.crs}")
    # Thống kê ma_xa
    if "ma_xa" in gdf.columns:
        print(f"ma_xa: min={gdf['ma_xa'].min()}, max={gdf['ma_xa'].max()}, unique={gdf['ma_xa'].nunique()}")
    print()


def task2_xuat_excel(gdf: gpd.GeoDataFrame, output=OUTPUT_EXCEL):
    """Nhiệm vụ 2: Trích xuất Excel"""
    print("=" * 70)
    print("NHIỆM VỤ 2: TRÍCH XUẤT EXCEL")
    print("=" * 70)
    required_cols = ["ma_xa", "ten_xa", "dtich_km2", "dan_so", "sap_nhap"]
    missing = [c for c in required_cols if c not in gdf.columns]
    if missing:
        raise KeyError(f"Thiếu cột yêu cầu trong GeoJSON: {missing}. Các cột hiện có: {list(gdf.columns)}")

    df = pd.DataFrame(gdf[required_cols])
    # Sắp xếp theo ma_xa để dễ tra cứu
    # ma_xa có thể là string/int lẫn lộn -> convert sang numeric nếu được
    try:
        df["_sort"] = pd.to_numeric(df["ma_xa"], errors="coerce")
        df = df.sort_values("_sort").drop(columns="_sort")
    except Exception:
        df = df.sort_values("ma_xa")

    # Ép kiểu hiển thị đẹp hơn (optional)
    # dtich_km2, dan_so đang là string -> convert numeric
    # Giữ nguyên để không mất format, nhưng có thể convert để sort/filter trong Excel
    df.to_excel(output, index=False, engine="openpyxl")
    print(f"Đã xuất {len(df)} dòng ra file Excel: {output}")
    print(df.head(10).to_string(index=False))
    print()


def extract_polygon_parts(geom):
    """Tách GeometryCollection thành list Polygon/MultiPolygon hợp lệ cho rasterize"""
    if geom is None or geom.is_empty:
        return []
    gtype = geom.geom_type
    if gtype in ("Polygon", "MultiPolygon"):
        return [geom]
    if gtype == "GeometryCollection":
        parts = []
        for g in geom.geoms:
            parts.extend(extract_polygon_parts(g))
        return parts
    # LineString, Point... bỏ qua
    return []


def task3_rasterization(gdf: gpd.GeoDataFrame,
                        width=RASTER_WIDTH, height=RASTER_HEIGHT,
                        out_tif=OUTPUT_RASTER_TIF, out_npy=OUTPUT_RASTER_NPY):
    """Nhiệm vụ 3: Chuyển Vector -> Raster Mask 4096x4096, pixel = ma_xa"""
    print("=" * 70)
    print("NHIỆM VỤ 3: RASTERIZATION (Vector -> Raster Mask)")
    print("=" * 70)
    if gdf.crs is None:
        gdf = gdf.set_crs(epsg=4326)
    # Đảm bảo CRS là EPSG:4326 để transform đúng (nếu muốn reprojection thì thêm gdf.to_crs)
    west, south, east, north = gdf.total_bounds
    print(f"Bounds: west={west:.5f}, south={south:.5f}, east={east:.5f}, north={north:.5f}")
    print(f"Kích thước raster: {width} x {height} pixels")
    transform = from_bounds(west, south, east, north, width, height)
    print(f"Transform (affine): {transform}")

    # Chuẩn bị shapes: list of (geometry, value)
    shapes = []
    n_skipped = 0
    for geom, ma_xa in zip(gdf.geometry, gdf["ma_xa"]):
        # ma_xa có thể là string -> ép int
        try:
            value = int(str(ma_xa).strip())
        except Exception:
            print(f"[Bỏ qua] ma_xa không parse được: {ma_xa}")
            continue
        parts = extract_polygon_parts(geom)
        if not parts:
            n_skipped += 1
            continue
        for part in parts:
            if part.is_empty or not part.is_valid:
                # thử fix lần nữa
                part = make_valid(part)
                # lại tách nếu thành collection
                sub_parts = extract_polygon_parts(part)
                for sp in sub_parts:
                    if not sp.is_empty and sp.is_valid:
                        shapes.append((sp, value))
            else:
                shapes.append((part, value))

    print(f"Số shapes hợp lệ để rasterize: {len(shapes)} (bỏ qua {n_skipped} geometry rỗng)")
    if len(shapes) == 0:
        raise ValueError("Không có shapes hợp lệ để rasterize!")

    # Rasterize
    # all_touched=False: chỉ pixel có tâm nằm trong polygon mới được gán (chuẩn cho AI mask)
    # nếu muốn lấp đầy biên, đổi thành True
    mask = rasterize(
        shapes,
        out_shape=(height, width),
        transform=transform,
        fill=0,  # background = 0
        dtype=RASTER_DTYPE,
        all_touched=False
    )
    print(f"Mask shape: {mask.shape}, dtype: {mask.dtype}")
    unique_vals = np.unique(mask)
    print(f"Giá trị unique trong mask: {len(unique_vals)} giá trị (gồm background 0)")
    print(f"  unique[:20] = {unique_vals[:20]}")
    print(f"  max ma_xa trong mask = {mask.max()}, min = {mask.min()}")
    print(f"  Số pixel !=0 (thuộc xã/phường): {np.count_nonzero(mask)} / {width*height} ({np.count_nonzero(mask)/ (width*height)*100:.2f}%)")

    # Kiểm tra xem có xã nào bị missing không (do lỗi geometry)
    expected = set(pd.to_numeric(gdf["ma_xa"], errors="coerce").dropna().astype(int).tolist())
    got = set(unique_vals.tolist()) - {0}
    missing = expected - got
    if missing:
        print(f"[Cảnh báo] Các ma_xa không xuất hiện trong mask (có thể do geometry lỗi): {sorted(missing)}")
    else:
        print("Tất cả ma_xa đều đã được rasterize thành công!")

    # Lưu file GeoTIFF (có georeference)
    with rasterio.open(
        out_tif,
        "w",
        driver="GTiff",
        height=height,
        width=width,
        count=1,
        dtype=mask.dtype,
        crs=gdf.crs,
        transform=transform,
        compress="lzw",
        tiled=True,
        blockxsize=256,
        blockysize=256,
        nodata=0
    ) as dst:
        dst.write(mask, 1)
        dst.set_band_description(1, "ma_xa")

    print(f"Đã lưu Raster Mask GeoTIFF: {out_tif} (có georeference, CRS={gdf.crs})")

    # Lưu thêm file .npy cho tiện load trong PyTorch/TensorFlow
    np.save(out_npy, mask)
    print(f"Đã lưu Raster Mask NumPy: {out_npy} (shape {mask.shape}, dtype {mask.dtype})")
    print("Gợi ý load trong AI: mask = np.load('gialai_mask_4096.npy'); # giá trị pixel = ma_xa")
    print()
    return mask, transform


def main():
    input_path = find_input_file()
    print(f"Đang đọc file: {input_path}")
    # Đọc robust
    gdf = load_geojson_robust(input_path)

    # Nhiệm vụ 1
    task1_thong_ke(gdf)

    # Nhiệm vụ 2
    task2_xuat_excel(gdf, OUTPUT_EXCEL)

    # Nhiệm vụ 3
    mask, transform = task3_rasterization(gdf)

    print("=" * 70)
    print("HOÀN TẤT TẤT CẢ NHIỆM VỤ!")
    print("=" * 70)
    print(f"1. Thống kê: {len(gdf)} xã/phường, {len([c for c in gdf.columns if c!='geometry'])} thuộc tính")
    print(f"2. Excel: {OUTPUT_EXCEL}")
    print(f"3. Mask: {OUTPUT_RASTER_TIF} + {OUTPUT_RASTER_NPY} ({RASTER_WIDTH}x{RASTER_HEIGHT})")


if __name__ == "__main__":
    main()
