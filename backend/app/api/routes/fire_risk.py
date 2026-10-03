"""Fire-risk single-formula API: calculate, backtest, grid.

All scores come from services.fire_risk.compute_score — the one source of
truth. Origin labels ("LIVE" / "USER_INPUT" / "DEMO / SIMULATED") are set by
the server from data provenance, never by the client.
"""
import hashlib
import json
import os
import time
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query
from fastapi.responses import JSONResponse

from app.services.backtest import GIALAI_BBOX, build_grid, cache_path, run_backtest
from app.services.fire_risk import FireRiskInput, compute_score

router = APIRouter(tags=["FireRisk"])

_RUNNING: set = set()

FIELD_ADVICE = [    ("FIRMS proximity", "Có điểm nóng FIRMS gần đây — ưu tiên kiểm tra thực địa trong 24h."),
    ("Fuel Dryness", "Thảm khô — hạn chế đốt nương, chuẩn bị đường băng cản lửa."),
    ("Weather danger", "Nắng nóng + hanh khô — tăng tuần tra buổi trưa/chiều."),
    ("Wind", "Gió mạnh — lửa lan nhanh, cảnh báo các xã xuôi gió."),
    ("Rainfall deficit", "Nhiều ngày không mưa — theo dõi điểm có tiền sử cháy."),
    ("Terrain", "Địa hình dốc — tiếp cận khó, chuẩn bị phương án từ xa."),
    ("History/community", "Khu vực từng có cháy/cảnh báo — kiểm tra lại các điểm cũ."),
    ("NBR burn scar", "Vết cháy cũ (NBR) — nguy cơ tái bùng khi gặp gió."),
]


def field_advice(factors: dict, level: Optional[str]) -> list:
    out = [msg for key, msg in FIELD_ADVICE if key in factors]
    if level in ("IV", "V"):
        out.append("MỨC IV–V: trực ban 24/7, sẵn sàng lực lượng + phương tiện.")
    if not out:
        out.append("Duy trì tuần tra định kỳ, cập nhật khi có dữ liệu mới.")
    return out


def _input_from_body(body: dict) -> FireRiskInput:
    def num(k):
        v = body.get(k)
        return float(v) if v not in (None, "") else None
    hs = body.get("hotspots")
    real = [h for h in hs if isinstance(h, dict) and not h.get("suspect_artificial")] if isinstance(hs, list) else []
    return FireRiskInput(
        ndvi=num("ndvi"), ndmi=num("ndmi"), nbr=num("nbr"),
        temperature=num("temperature"), humidity=num("humidity"),
        rainfall=num("rainfall"), wind_speed=num("wind_speed"),
        slope=num("slope"), elevation=num("elevation"),
        hotspot_count=len(real),
        firms_observed=isinstance(hs, list),
        community_count=int(body.get("community_count") or 0),
        community_observed=body.get("community_count") is not None,
        historical_fire=bool(body.get("historical_fire", False)),
        historical_observed=body.get("historical_fire") is not None,
    )


@router.post("/fire-risk/calculate")
def calculate(body: dict):
    """What-if / point calculation. Inputs are user-supplied trials."""
    try:
        inp = _input_from_body(body)
    except (TypeError, ValueError):
        raise HTTPException(400, "numeric inputs must be numbers")
    r = compute_score(inp, origin="USER_INPUT")
    out = r.to_dict()
    out["advice"] = field_advice(r.factors, r.level)
    out["label"] = "THỬ NGHIỆM — không phải dự báo"
    return out


def _parse_day(value: Optional[str], default: date) -> date:
    if not value:
        return default
    try:
        return date.fromisoformat(value[:10])
    except ValueError:
        raise HTTPException(400, f"bad date: {value} (use YYYY-MM-DD)")


def _backtest_key(start: date, end: date, threshold: float, cell_km: float) -> str:
    return f"{start.isoformat()}_{end.isoformat()}_t{threshold:g}_c{cell_km:g}"


def _run_and_store(key: str, start: date, end: date, threshold: float, cell_km: float):
    import asyncio
    try:
        result = asyncio.run(run_backtest(start, end, threshold, cell_km))
        with open(cache_path(key), "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False)
    finally:
        _RUNNING.discard(key)


@router.get("/fire-risk/backtest")
def backtest(start: Optional[str] = Query(default=None),
             end: Optional[str] = Query(default=None),
             threshold: float = Query(default=60, ge=0, le=100),
             cell_km: float = Query(default=5, ge=1, le=25),
             background: BackgroundTasks = None):
    """Backtest metrics, cached. Cache miss -> 202 RUNNING, poll to refresh."""
    today = date.today()
    end_d = _parse_day(end, today)
    start_d = _parse_day(start, end_d - timedelta(days=7))
    if start_d > end_d:
        raise HTTPException(400, "start must be <= end")
    if (end_d - start_d).days > 31:
        raise HTTPException(400, "range too wide (max 31 days)")
    key = _backtest_key(start_d, end_d, threshold, cell_km)
    path = cache_path(key)
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        data["cached"] = True
        return data
    if key in _RUNNING:
        return JSONResponse(status_code=202, content={"status": "RUNNING", "key": key})
    _RUNNING.add(key)
    background.add_task(_run_and_store, key, start_d, end_d, threshold, cell_km)
    return JSONResponse(status_code=202, content={
        "status": "RUNNING", "key": key,
        "period": {"start": start_d.isoformat(), "end": end_d.isoformat()},
        "note": "Computing in background — poll this URL until 200.",
    })


_WX_CACHE: dict = {}
_WX_TTL_S = 900


def _wx_sample(lat: float, lon: float) -> Optional[dict]:
    """Current weather at a sample point, cached 15 min. None when unreachable."""
    import asyncio
    key = f"{round(lat, 2)},{round(lon, 2)}"
    hit = _WX_CACHE.get(key)
    if hit and time.time() - hit[0] < _WX_TTL_S:
        return hit[1]
    try:
        from app.services.weather_service import current_summary, fetch_current
        data = asyncio.run(fetch_current(lat, lon))
    except Exception:
        return None
    if not isinstance(data, dict) or data.get("status") not in ("LIVE", "CACHED", "STALE"):
        return None
    flat = current_summary(data)
    _WX_CACHE[key] = (time.time(), flat)
    return flat


def _demo_score(cell_id: str) -> int:
    """Deterministic simulated score for scenario=demo (documented, labeled)."""
    h = hashlib.sha256(f"riskgrid:{cell_id}".encode()).hexdigest()
    return 25 + (int(h[:8], 16) % 70)  # 25..94


@router.get("/fire-risk/grid")
def risk_grid(bbox: Optional[str] = Query(default=None),
              cell_km: float = Query(default=5, ge=1, le=25),
              scenario: Optional[str] = Query(default=None)):
    """GeoJSON risk cells over the bbox (viewport). Score/level/factors/origin.

    Default: live weather + live FIRMS counts per cell. scenario=demo forces
    deterministic simulated scores labeled DEMO / SIMULATED (UI showcase
    without keys — never mixed with live data).
    """
    if bbox:
        try:
            parts = [float(x) for x in bbox.split(",")]
            assert len(parts) == 4
            bounds = (parts[0], parts[1], parts[2], parts[3])
        except (ValueError, AssertionError):
            raise HTTPException(400, "bbox must be minlon,minlat,maxlon,maxlat")
    else:
        bounds = GIALAI_BBOX
    cells = build_grid(bounds, cell_km)
    if len(cells) > 1500:
        raise HTTPException(400, f"too many cells ({len(cells)}); zoom in or raise cell_km")
    demo = (scenario == "demo")

    fires: list = []
    firms_live = False
    if not demo:
        try:
            import asyncio
            from app.services.firms_service import fetch_firms_gialai
            data = asyncio.run(fetch_firms_gialai(day_range=1))
            if isinstance(data, dict) and data.get("status") in ("LIVE", "CACHED", "STALE"):
                firms_live = True
                fires = [f for f in data.get("fires", []) if not f.get("suspect_artificial")]
        except Exception:
            fires = []

    # One weather sample per ~4 cells (documented), cached server-side.
    step = max(1, len(cells) // 40)
    samples = cells[::step][:40]
    wx_by_sample = {} if demo else {s["id"]: _wx_sample(s["cy"], s["cx"]) for s in samples}
    wx_live_any = any(v is not None for v in wx_by_sample.values())

    def nearest(cell):
        best, bd = samples[0]["id"], 1e18
        for smp in samples:
            d = (smp["cx"] - cell["cx"]) ** 2 + (smp["cy"] - cell["cy"]) ** 2
            if d < bd:
                bd, best = d, smp["id"]
        return best

    features = []
    for cell in cells:
        minlon, minlat, maxlon, maxlat = cell["bounds"]
        if demo:
            score, level, factors, origin = _demo_score(cell["id"]), None, {}, "DEMO / SIMULATED"
            from app.services.fire_risk import score_to_level as _lvl
            level = _lvl(score)
            completeness = 0.0
            advice = ["DỮ LIỆU GIẢ LẬP — bật chế độ live để xem điểm thật."]
        else:
            w = wx_by_sample.get(nearest(cell)) or {}
            n_in = 0
            for f in fires:
                try:
                    la, lo = float(f["latitude"]), float(f["longitude"])
                except (TypeError, ValueError):
                    continue
                if minlon <= lo <= maxlon and minlat <= la <= maxlat:
                    n_in += 1
            inp = FireRiskInput(
                temperature=w.get("temperature"), humidity=w.get("humidity"),
                rainfall=w.get("rainfall"), wind_speed=w.get("wind_speed"),
                hotspot_count=n_in, firms_observed=firms_live)
            r = compute_score(inp, origin="LIVE")
            if not w and not firms_live:
                score, level, factors, completeness = None, None, {}, 0.0
            else:
                score, level, factors = r.score, r.level, r.factors
                completeness = r.data_completeness
            origin = "LIVE"
            advice = field_advice(factors, level) if score is not None else []
        features.append({
            "type": "Feature",
            "geometry": {"type": "Polygon", "coordinates": [[
                [minlon, minlat], [maxlon, minlat], [maxlon, maxlat],
                [minlon, maxlat], [minlon, minlat]]]},
            "properties": {
                "cell_id": cell["id"], "cx": cell["cx"], "cy": cell["cy"],
                "score": score, "level": level,
                "top_factors": sorted(factors.keys()),
                "factors": factors, "advice": advice,
                "data_completeness": completeness, "origin": origin,
            },
        })
    origin_all = "DEMO / SIMULATED" if demo else "LIVE"
    return {"type": "FeatureCollection", "features": features,
            "meta": {"n_cells": len(cells), "cell_km": cell_km, "origin": origin_all,
                     "weather": "Open-Meteo current (LIVE, cached 15 min)" if wx_live_any or demo else "Open-Meteo unreachable (cells unscored)",
                     "fires": f"{len(fires)} live FIRMS points" if firms_live else ("SIMULATED" if demo else "FIRMS unavailable (factor missing)"),
                     "disclaimer": "Chi so tham khao, trong so chua hieu chuan"}}


@router.get("/fire-risk/config")
def risk_config():
    from app.services.fire_risk_config import THRESHOLDS, WEIGHTS
    return {"weights": WEIGHTS,
            "thresholds": [{"lte": t, "level": lvl} for t, lvl in THRESHOLDS],
            "note": "Nguong cau hinh tai mot noi (fire_risk_config), khong rai rac UI"}
