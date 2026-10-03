"""Fire-risk single-formula API: calculate, backtest, grid.

All scores come from services.fire_risk.compute_score — the one source of
truth. Origin labels ("LIVE" / "USER_INPUT" / "DEMO / SIMULATED") are set by
the server from data provenance, never by the client.
"""
import json
import os
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query
from fastapi.responses import JSONResponse

from app.services.backtest import cache_path, run_backtest
from app.services.fire_risk import FireRiskInput, compute_score

router = APIRouter(tags=["FireRisk"])

_RUNNING: set = set()

FIELD_ADVICE = [
    ("FIRMS proximity", "Có điểm nóng FIRMS gần đây — ưu tiên kiểm tra thực địa trong 24h."),
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
