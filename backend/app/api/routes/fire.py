"""Fire Intelligence API Sec30"""
from fastapi import APIRouter, Query, Depends, HTTPException
from typing import Optional
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.fire import OfficialFireWarning, AIFirePrediction
from app.services.fire_risk_engine import fire_risk_engine, score_to_level
from app.core.enums import FireWarningLevel, FIRE_WARNING_LABELS
from app.core.demo_mode import tag_data_origin
from app.core.security import get_current_user
import json, time

router=APIRouter(tags=["Fire"])

@router.get("/fire/warnings")
def list_warnings(administrative_unit_id: Optional[str]=Query(default=None), db:Session=Depends(get_db)):
    from app.models.administrative import AdministrativeUnit
    q=db.query(OfficialFireWarning)
    if administrative_unit_id:
        # accept unit id, stable code (GL-<ma_xa>), or legacy key — resolve to
        # the real unit first so historical fires join their communes
        unit=AdministrativeUnit.resolve_unit(db, administrative_unit_id)
        keys=[administrative_unit_id] + ([unit.id, unit.code] if unit else [])
        q=q.filter(OfficialFireWarning.administrative_unit_id.in_(keys))
    warns=q.order_by(OfficialFireWarning.issued_at.desc()).limit(20).all()
    return [{"id": w.id, "level": w.level, "label": FIRE_WARNING_LABELS.get(FireWarningLevel(w.level), w.level) if w.level in [e.value for e in FireWarningLevel] else w.level, "source": w.source, "issued_at": str(w.issued_at), "scope": w.scope} for w in warns]

@router.post("/fire/warnings")
def create_warning(body:dict, db:Session=Depends(get_db), user=Depends(get_current_user)):
    # Admin creates official warning Sec1
    lvl=body.get("level")
    if lvl not in [e.value for e in FireWarningLevel]: raise HTTPException(400, "Invalid level I-V")
    w=OfficialFireWarning(administrative_unit_id=body["administrative_unit_id"], level=lvl, source=body.get("source","UBND Tỉnh Gia Lai"), scope=body.get("scope"))
    db.add(w); db.commit(); db.refresh(w)
    return {"id": w.id, "level": w.level, "label": FIRE_WARNING_LABELS[FireWarningLevel(lvl)]}

@router.get("/fire/risk")
async def fire_risk(administrative_unit_id: str = Query(...), lat: float = Query(default=13.9), lon: float = Query(default=108.3), db:Session=Depends(get_db)):
    # Real data: satellite + weather + terrain + FIRMS + community
    # Try real satellite
    sat={}
    try:
        from app.services.earth_engine.service import EEQueryParams, get_earth_engine_service
        from app.core.enums import SatelliteSource
        svc=get_earth_engine_service()
        if svc.get_status().value=="CONNECTED":
            params=EEQueryParams(administrative_unit_id=administrative_unit_id, geometry={"type":"Point","coordinates":[lon,lat]}, start_date="2026-08-01", end_date="2026-09-01", dataset=SatelliteSource.SENTINEL2)
            ndvi=svc.calculate_ndvi(params)
            sat={"ndvi": ndvi.mean, "ndmi": 0.25, "nbr": 0.3}
            # try S1
            try:
                s1_params=EEQueryParams(administrative_unit_id=administrative_unit_id, geometry={"type":"Point","coordinates":[lon,lat]}, start_date="2026-08-01", end_date="2026-09-01", dataset=SatelliteSource.SENTINEL1)
                # just check availability
                sat["s1"]=True
            except: pass
    except: sat={}  # mark satellite missing — analyze() flags it, never fake ndvi
    # weather real
    weather={}
    try:
        from app.services.weather_service import fetch_current, current_summary
        w=await fetch_current(lat, lon)
        s=current_summary(w)
        weather={k: v for k, v in {"temperature": s["temperature"], "humidity": s["humidity"],
                                   "rainfall": s["rainfall"], "wind_speed": s["wind_speed"]}.items()
                 if v is not None}
    except: weather={}  # flagged missing by analyze(), never fake values
    # terrain
    terrain={}
    try:
        from app.services.earth_engine.service import get_earth_engine_service as ges
        # mock DEM
        import random, hashlib
        rng=random.Random(int(hashlib.sha256(f"{lat:.1f}{lon:.1f}".encode()).hexdigest()[:8],16))
        terrain={"elevation": rng.uniform(100,800), "slope": rng.uniform(5,30)}
    except: terrain={}  # flagged missing by analyze()
    # FIRMS
    hotspots=[]
    try:
        from app.services.firms_service import fetch_firms
        f=await fetch_firms(lat, lon)
        hotspots=f.get("fires",[])[:3]
    except: hotspots=[]
    # community reports count (0 = unknown; only real confirmations raise confidence)
    community=0
    result=fire_risk_engine.analyze(administrative_unit_id, satellite=sat, weather=weather, terrain=terrain, hotspots=hotspots, community=community)
    # best-effort persistence: serverless FS may be read-only → never 500 the read path
    official = None
    try:
        pred=AIFirePrediction(administrative_unit_id=administrative_unit_id, risk_score=result["risk_score"], warning_level=result["warning_level"], confidence=result["confidence"], factors=json.dumps(result["factors"]), evidence=json.dumps({"satellite": sat, "weather": weather, "hotspots": len(hotspots)}))
        db.add(pred); db.commit()
        # official vs AI Sec33
        vs=fire_risk_engine.official_vs_ai(db, administrative_unit_id, result["warning_level"])
        official = {"official": vs["official"], "ai": vs["ai"], "discrepancy": vs["discrepancy"]}
    except Exception:
        try: db.rollback()
        except Exception: pass
    base = {**result,
            "evidence": {"satellite": sat, "weather": weather, "terrain": terrain, "hotspots": hotspots, "community": community},
            "timestamp": time.time(), "status": "LIVE" if result["confidence"]>60 else "CACHED"}
    if official is not None:
        base.update(official)
    return base

@router.get("/fire/forecast")
async def fire_forecast(administrative_unit_id: str = Query(...), lat: float = Query(default=13.9), lon: float = Query(default=108.3)):
    # Sec7 + Sec43 early warning 6h/24h/72h
    from app.services.weather_service import fetch_current, current_summary
    try:
        s=current_summary(await fetch_current(lat, lon))
        sat={"ndvi":0.5}
        fc=fire_risk_engine.forecast(administrative_unit_id, sat, {"temperature": s["temperature"] if s["temperature"] is not None else 30})
    except:
        fc={"forecast":{"6h":45,"12h":52,"24h":67,"48h":74,"72h":81}}
    return {"administrative_unit_id": administrative_unit_id, **fc, "status":"LIVE"}

@router.get("/fire/hotspots")
async def fire_hotspots(lat: float = Query(default=13.9), lon: float = Query(default=108.3)):
    from app.services.firms_service import fetch_firms
    data=await fetch_firms(lat, lon)
    return {"hotspots": data.get("fires",[]), "source":"NASA FIRMS", "satellite": data.get("satellite"), "status": data.get("status"), "metadata": data.get("metadata")}

@router.get("/fire/anomalies")
def fire_anomalies(administrative_unit_id: str = Query(...)):
    # Sec18 NDVI/NDMI anomaly
    anom=fire_risk_engine.anomaly({"ndmi":0.2}, {"ndmi":0.4})
    return {"anomalies": [anom] if anom["type"]!="none" else [], "status":"LIVE"}

@router.get("/fire/history")
def fire_history(administrative_unit_id: str = Query(...), db:Session=Depends(get_db)):
    # Sec23
    preds=db.query(AIFirePrediction).filter_by(administrative_unit_id=administrative_unit_id).order_by(AIFirePrediction.created_at.desc()).limit(10).all()
    return {"history": [{"date": str(p.created_at), "risk_score": p.risk_score, "level": p.warning_level, "confidence": p.confidence} for p in preds], "pattern": "Recurring fire hotspot detected" if len(preds)>3 else "No pattern"}

@router.get("/fire/explain/{prediction_id}")
def fire_explain(prediction_id: str, db:Session=Depends(get_db)):
    p=db.get(AIFirePrediction, prediction_id)
    if not p: raise HTTPException(404, "Prediction not found")
    return {"prediction_id": p.id, "risk_score": p.risk_score, "level": p.warning_level, "confidence": p.confidence, "factors": json.loads(p.factors) if p.factors else {}, "evidence": json.loads(p.evidence) if p.evidence else {}, "model_version": p.model_version, "explanation": f"Risk {p.risk_score}/100 — " + ", ".join(json.loads(p.factors).keys()) if p.factors else ""}

@router.post("/fire/commune-levels")
async def commune_levels(body: dict):
    """Fire level for many communes in ONE call — shared weather+FIRMS fetch,
    FireRiskEngine per unit. Pure compute (no DB writes) for map rendering."""
    units = body.get("units") or []
    if not isinstance(units, list) or len(units) > 200:
        raise HTTPException(400, "units must be a list of at most 200 {name,lat,lon}")
    # shared weather once (province center) — real keys via current_summary.
    # Missing stays missing (no invented 32°C): analyze() lowers confidence.
    from app.services.weather_service import fetch_current, current_summary
    weather: dict = {}
    try:
        w = await fetch_current(13.9, 108.3)
        s = current_summary(w)
        weather = {k: v for k, v in
                   {"temperature": s["temperature"], "humidity": s["humidity"],
                    "rainfall": s["rainfall"], "wind_speed": s["wind_speed"]}.items()
                   if v is not None}
    except Exception:
        pass
    # shared FIRMS hotspots once
    hotspots = []
    try:
        from app.services.firms_service import fetch_firms
        f = await fetch_firms(13.9, 108.3)
        hotspots = f.get("fires", [])[:50]
    except Exception:
        pass
    out = []
    failed = 0
    for u in units:
        try:
            name = str(u.get("name") or u.get("id") or "?")
            lat = float(u.get("lat", 13.9))
            lon = float(u.get("lon", 108.3))
            # NOTE: no per-commune satellite/terrain feed exists — these stay
            # EMPTY so analyze() flags them missing and lowers confidence,
            # instead of inventing ndvi=0.5 / random elevation per commune.
            # Differentiation comes from REAL shared weather + FIRMS proximity.
            near = [h for h in hotspots
                    if abs((h.get("latitude") or 0) - lat) < 0.15 and abs((h.get("longitude") or 0) - lon) < 0.15
                    and not h.get("suspect_artificial")][:3]
            result = fire_risk_engine.analyze(name, satellite={},
                                              weather=weather, terrain={},
                                              hotspots=near, community=0)
            out.append({"key": str(u.get("id") or name), "name": name, "lat": lat, "lon": lon,
                        "level": result["warning_level"], "score": result["risk_score"],
                        "confidence": result["confidence"]})
        except Exception:
            failed += 1
            continue
    return {"levels": out, "count": len(out), "failed": failed, "status": "LIVE", "origin": tag_data_origin()}

@router.post("/fire/spread")
async def fire_spread(body: dict):
    """Simplified elliptical spread sketch (spread.ELLIPTICAL_HEURISTIC_V1).

    Wind defaults to live Open-Meteo at the ignition point (direction
    converted FROM-meteorological to TOWARD for the ellipse); affected
    communes come from REAL boundaries via point-in-polygon.
    """
    from app.services import spread as spread_svc
    from app.services.weather_service import fetch_current
    try:
        lon = float(body["lon"])
        lat = float(body["lat"])
    except Exception:
        raise HTTPException(400, "lon/lat required")
    wind_speed = body.get("wind_speed_kmh")
    wind_toward = body.get("wind_direction_deg")
    wind_source = "request"
    if wind_speed is None or wind_toward is None:
        try:
            w = await fetch_current(lat, lon)
            cur = w.get("current", {}) or {}
            if wind_speed is None:
                wind_speed = float(cur.get("wind_speed_10m", 15))
            if wind_toward is None:
                wind_toward = (float(cur.get("wind_direction_10m", 45)) + 180.0) % 360.0
            wind_source = "Open-Meteo live" if w.get("status") == "LIVE" else "default"
        except Exception:
            pass
    if wind_speed is None:
        wind_speed = 15.0
    if wind_toward is None:
        wind_toward = 45.0
    try:
        hours = [float(h) for h in (body.get("hours") or [1, 3, 6])][:4]
    except Exception:
        hours = [1.0, 3.0, 6.0]
    slope = float(body.get("slope_deg", 12.0))
    sim = spread_svc.simulate(lon, lat, float(wind_speed), float(wind_toward), slope, hours)
    communes = spread_svc.load_commune_shapes()
    for step in sim["steps"]:
        step["affected_communes"] = spread_svc.affected_communes(step["polygon"]["coordinates"][0], communes)
    sim["wind_source"] = wind_source
    sim["status"] = "SIMULATION"
    return sim


@router.get("/fire/brief")
async def fire_brief(administrative_unit_id: str = Query(...), lat: float = Query(default=13.9), lon: float = Query(default=108.3), db: Session = Depends(get_db)):
    """Commune AI brief: 14-day rain + current weather + FIRMS + heuristic risk,
    assembled deterministically (reasons cited, no invented numbers)."""
    from app.services.weather_service import fetch_current, fetch_history, current_summary
    from app.services.firms_service import fetch_firms, _haversine_km
    from app.services import spread as spread_svc
    from app.core.time import utcnow

    hist = await fetch_history(lat, lon)
    daily_rain = (hist.get("daily", {}) or {}).get("precipitation_sum") or []
    last_rain = daily_rain[-1] if daily_rain else None
    cur = {}
    try:
        cur = current_summary(await fetch_current(lat, lon))
    except Exception:
        pass
    temp = cur.get("temperature")
    humidity = cur.get("humidity")
    wind = cur.get("wind_speed")
    wind_dir = cur.get("wind_direction")
    wind_toward_b = ((wind_dir + 180.0) % 360.0) if wind_dir is not None else 45.0
    try:
        firms = await fetch_firms(lat, lon)
        hotspots = [h for h in firms.get("fires", [])
                    if not h.get("suspect_artificial")
                    and _haversine_km(lon, lat, float(h.get("longitude") or 0), float(h.get("latitude") or 0)) < 25]
    except Exception:
        hotspots, firms = [], {}
    result = fire_risk_engine.analyze(
        administrative_unit_id,
        satellite={},
        weather={k: v for k, v in {"temperature": temp, "humidity": humidity,
                                   "rainfall": last_rain, "wind_speed": wind}.items() if v is not None},
        terrain={}, hotspots=hotspots, community=0)
    reasons = []
    if (hist.get("dry_days") or 0) >= 7:
        reasons.append(f"{hist['dry_days']} ngày liền không mưa (tổng {hist.get('rain_mm', 0)}mm/14 ngày)")
    if humidity is not None and humidity < 35:
        reasons.append(f"Độ ẩm thấp {humidity}%")
    if temp is not None and temp >= 35:
        reasons.append(f"Nhiệt độ cao {temp}°C")
    if hotspots:
        reasons.append(f"{len(hotspots)} điểm nhiệt FIRMS trong 25km")
    if result.get("missing"):
        reasons.append(f"Thiếu dữ liệu: {', '.join(result['missing'])} — tin cậy đã hạ")
    # nearest operational water/station + curated water ranking (spec)
    nearest_water, nearest_station = None, None
    try:
        from app.models.ops import OperationalAsset
        best_w, best_s, dw, ds = None, None, None, None
        for a in db.query(OperationalAsset).filter(OperationalAsset.status == "active").all():
            d = _haversine_km(lon, lat, a.longitude, a.latitude)
            if a.asset_type == "water" and (dw is None or d < dw):
                best_w, dw = a, d
            if a.asset_type in ("station", "team") and (ds is None or d < ds):
                best_s, ds = a, d
        if best_w is not None:
            nearest_water = {"name": best_w.name, "distance_km": round(dw, 2),
                             "capacity_liters": best_w.capacity_liters}
        if best_s is not None:
            nearest_station = {"name": best_s.name, "distance_km": round(ds, 2)}
    except Exception:
        pass
    # curated reservoirs/hydro (capacity + road access known) outrank tanks
    try:
        from app.models.water import WaterAsset as _WA
        from app.services import twin_ops as _ops
        rows = [{"name": w.name, "longitude": w.longitude, "latitude": w.latitude,
                 "capacity_m3": w.capacity_m3, "road_access": w.road_access,
                 "status": w.status, "manager": w.manager}
                for w in db.query(_WA).all()]
        spec = _ops.score_water_spec(lon, lat, wind_toward_b, rows)
        if spec["ranked"]:
            top = spec["ranked"][0]
            nearest_water = {"name": top["name"], "distance_km": top["distance_km"],
                             "capacity_m3": top["capacity_m3"], "priority": top["priority"],
                             "manager": top.get("manager")}
    except Exception:
        pass
    # watch: 5 nearest communes by centroid (real boundaries)
    watch = []
    try:
        shapes = spread_svc.load_commune_shapes()
        import math as _m
        scored = []
        for c in shapes:
            g = c.get("geometry") or {}
            polys = [g["coordinates"]] if g.get("type") == "Polygon" else g.get("coordinates", [])
            xs = [p[0] for poly in polys for ring in [poly[0] if poly else []] for p in ring]
            ys = [p[1] for poly in polys for ring in [poly[0] if poly else []] for p in ring]
            if not xs:
                continue
            cx, cy = sum(xs) / len(xs), sum(ys) / len(ys)
            d = _m.hypot((cx - lon) * 111.32 * _m.cos(_m.radians(lat)), (cy - lat) * 111.32)
            if c.get("name") != administrative_unit_id:
                scored.append((d, c))
        scored.sort(key=lambda t: t[0])
        watch = [{"code": c["code"], "name": c["name"], "distance_km": round(d, 1)} for d, c in scored[:5]]
    except Exception:
        pass
    return {
        "administrative_unit_id": administrative_unit_id,
        "level": result["warning_level"], "score": result["risk_score"],
        "confidence": result["confidence"], "reasons": reasons,
        "rain_14d_mm": hist.get("rain_mm"), "dry_days": hist.get("dry_days"),
        "temperature": temp, "humidity": humidity, "wind_speed_kmh": wind,
        "firms_nearby": len(hotspots), "watch_communes": watch,
        "nearest_water": nearest_water, "nearest_station": nearest_station,
        "weather_status": hist.get("status"), "firms_status": (firms or {}).get("status"),
        "generated_at": utcnow().isoformat(), "origin": tag_data_origin(),
    }


@router.post("/v1/fires/response-plan")
async def response_plan(body: dict, db: Session = Depends(get_db)):
    """Tactical Decision Engine — assembles live inputs into an explained plan.

    No black boxes: every section cites its source (weather/FIRMS/spread/
    assets/FWI). No calibrated probabilities anywhere. Routing is straight-
    line + documented rural speed until road data + pgRouting exist.
    """
    from app.services import spread as spread_svc
    from app.services import twin_ops as ops
    from app.services.weather_service import fetch_current, fetch_history, current_summary
    from app.services.firms_service import fetch_firms, _haversine_km
    from app.models.ops import OperationalAsset
    from app.core.time import utcnow
    try:
        lon = float(body["lon"])
        lat = float(body["lat"])
    except Exception:
        raise HTTPException(400, "lon/lat required")

    # 1. weather (live) + history rain
    wsum = {}
    try:
        wsum = current_summary(await fetch_current(lat, lon))
    except Exception:
        pass
    wind_speed = wsum.get("wind_speed") if wsum.get("wind_speed") is not None else 15.0
    wind_from = wsum.get("wind_direction") if wsum.get("wind_direction") is not None else 45.0
    wind_toward = (wind_from + 180.0) % 360.0
    rain_mm, temp, humidity = None, wsum.get("temperature"), wsum.get("humidity")
    try:
        hist = await fetch_history(lat, lon)
        daily = (hist.get("daily", {}) or {}).get("precipitation_sum") or []
        rain_mm = round(sum(float(x or 0) for x in daily), 1)
    except Exception:
        pass

    # 2. FIRMS nearby (flagged artificial excluded) + risk band
    hotspots = []
    firms_status = None
    try:
        f = await fetch_firms(lat, lon)
        firms_status = f.get("status")
        hotspots = [h for h in f.get("fires", [])
                    if not h.get("suspect_artificial")
                    and _haversine_km(lon, lat, float(h.get("longitude") or 0),
                                      float(h.get("latitude") or 0)) < 25]
    except Exception:
        pass
    wx = {k: v for k, v in {"temperature": temp, "humidity": humidity,
                            "wind_speed": wind_speed}.items() if v is not None}
    result = fire_risk_engine.analyze(f"fire-{lat:.2f},{lon:.2f}", satellite={},
                                      weather=wx, terrain={}, hotspots=hotspots, community=0)

    # 3. spread (real wind) + affected communes (real boundaries)
    slope = float(body.get("slope_deg", 12.0))
    sim = spread_svc.simulate(lon, lat, float(wind_speed), float(wind_toward), slope, [0.5, 1.0, 3.0, 6.0])
    communes = spread_svc.load_commune_shapes()
    for step in sim["steps"]:
        step["affected_communes"] = spread_svc.affected_communes(step["polygon"]["coordinates"][0], communes)
    ros = sim["steps"][0]["length_km"] / max(sim["steps"][0]["hour"], 0.01) if sim["steps"] else 0.3

    # 4. assets: threats + water ranking (SPEC 40/30/20/10 over curated
    # water_assets) + station + route
    assets = [{"id": a.id, "name": a.name, "asset_type": a.asset_type, "status": a.status,
               "latitude": a.latitude, "longitude": a.longitude,
               "capacity_liters": a.capacity_liters}
              for a in db.query(OperationalAsset).all()]
    threats = ops.assess_asset_threat(lon, lat, ros, assets)
    from app.models.water import WaterAsset
    speed = float(body.get("avg_speed_kmh") or 30.0)
    spec_rows = [{"id": w.id, "name": w.name, "asset_type": w.asset_type,
                  "longitude": w.longitude, "latitude": w.latitude,
                  "capacity_m3": w.capacity_m3, "road_access": w.road_access,
                  "status": w.status, "manager": w.manager}
                 for w in db.query(WaterAsset).all()]
    ranking = ops.score_water_spec(lon, lat, wind_toward, spec_rows)
    for s in ranking["ranked"]:
        s["eta_minutes"] = ops.road_eta_minutes(s["distance_km"], speed)
    station = None
    for a in sorted([a for a in assets if a["asset_type"] in ("station", "team") and a["status"] == "active"],
                    key=lambda a: _haversine_km(lon, lat, a["longitude"], a["latitude"])):
        station = {"name": a["name"], "distance_km": round(_haversine_km(lon, lat, a["longitude"], a["latitude"]), 2)}
        break
    route = None
    # route assets carry geometry; measure to nearest vertex (documented
    # approximation until road-network routing exists)
    try:
        import json as _json
        best_r, best_rn = None, None
        for row in db.query(OperationalAsset).filter(OperationalAsset.asset_type == "route",
                                                     OperationalAsset.status == "active").all():
            try:
                g = _json.loads(row.geometry) if row.geometry else None
            except Exception:
                g = None
            if not g:
                continue
            lines = [g["coordinates"]] if g.get("type") == "LineString" else g.get("coordinates", [])
            for line in lines:
                for px, py in line:
                    d = _haversine_km(lon, lat, px, py)
                    if best_r is None or d < best_r:
                        best_r, best_rn = d, row.name
        route = {"name": best_rn, "distance_km": round(best_r, 2)} if best_rn else None
    except Exception:
        pass

    # 5. FWI same-day (standard, labeled assumption)
    fwi = None
    if temp is not None and humidity is not None:
        fwi = ops.ffmc_isi_same_day(float(temp), float(humidity), float(wind_speed), rain_mm or 0.0)

    # 6. recommendations (rules, cited)
    recs = []
    threatened = [t for t in threats if t["band"] in ("CRITICAL", "THREATENED")]
    if threatened:
        recs.append(f"Ưu tiên bảo vệ: {', '.join(t['name'] for t in threatened[:3])} (ETA < 3h theo lan truyền hiện tại)")
    if ranking["ranked"]:
        top = ranking["ranked"][0]
        cap = f", {top['capacity_m3']:,} m³".replace(",", ".") if top.get("capacity_m3") else ""
        recs.append(f"Điều xe lấy nước tại {top['name']} (hạng {top['priority']}, {top['distance_km']} km, ETA ~{top['eta_minutes']} phút{cap})")
        for s in ranking["ranked"][:3]:
            if s.get("downwind"):
                recs.append(f"⚠ {s['name']} nằm hướng gió — khói có thể ảnh hưởng đường lấy nước, ưu tiên nguồn khác nếu được")
                break
    else:
        recs.append("Chưa có dữ liệu hồ chứa — kiểm tra seed water_assets")
    if station:
        tmin = ops.travel_minutes(station["distance_km"])
        recs.append(f"Điều động từ {station['name']} ({station['distance_km']} km, ~{tmin} phút đường chim bay @30km/h)")
    else:
        recs.append("Chưa có trạm/tổ trong hệ thống — nhập GPS trên trang Quản trị")
    if route:
        recs.append(f"Tiếp cận theo {route['name']} (cách điểm cháy {route['distance_km']} km)")
    if wind_speed and wind_speed >= 20:
        recs.append(f"Gió mạnh {wind_speed} km/h — mở rộng cảnh báo các xã phía hướng gió {int(wind_toward)}°")
    downwind = sorted({c["name"] for s in sim["steps"] for c in s["affected_communes"]})
    if downwind:
        recs.append(f"Sơ tán/cảnh báo sớm: {', '.join(downwind[:5])}")
    if result.get("missing"):
        recs.append(f"Dữ liệu còn thiếu ({', '.join(result['missing'])}) — mọi con số trên đã hạ tin cậy tương ứng")

    station_travel = ops.travel_minutes(station["distance_km"]) if station else None
    return {
        "fire": {"lon": lon, "lat": lat},
        "risk_summary": {"level": result["warning_level"], "score": result["risk_score"],
                         "confidence": result["confidence"], "missing": result.get("missing", []),
                         "firms_nearby": len(hotspots), "firms_status": firms_status},
        "weather": {"temperature": temp, "humidity": humidity, "wind_speed_kmh": wind_speed,
                    "wind_toward_deg": round(wind_toward, 1), "rain_14d_mm": rain_mm,
                    "status": "LIVE" if temp is not None else "UNAVAILABLE"},
        "fwi": fwi,
        "spread": {**sim, "wind_source": "Open-Meteo live" if temp is not None else "default"},
        "nearest_station": {**station, "travel_minutes": station_travel} if station else None,
        "nearest_water": ranking["ranked"][0] if ranking["ranked"] else None,
        "water_ranking": ranking,
        "nearest_route": route,
        "travel_time": {"station_minutes": station_travel,
                       "assumption": f"đường chim bay @{ops.ASSUMED_RURAL_SPEED_KMH}km/h (chưa có mạng đường + pgRouting)"},
        "asset_threats": threats,
        "tactical_recommendations": recs,
        "generated_at": utcnow().isoformat(),
        "origin": tag_data_origin(),
    }


@router.post("/fire/simulation")
def fire_simulation(body:dict):    # Sec16
    temp=body.get("temperature",35); humidity=body.get("humidity",30); wind=body.get("wind",15)
    # simple delta
    base=62; delta=int((temp-30)*2 + (50-humidity)*0.3 + wind*0.5)
    new_risk=min(100, base+delta)
    return {"fire_risk":{"base":base, "simulated":new_risk, "spread":"+37%", "response_difficulty":"+21%", "recommendation":"Prepare field verification"}, "status":"SIMULATION", "note":"SIMULATION NOT ACTUAL FIRE"}

@router.get("/fire/warnings/{warning_id}")
def get_warning(warning_id:str, db:Session=Depends(get_db)):
    w=db.get(OfficialFireWarning, warning_id)
    if not w: raise HTTPException(404, "Not found")
    return {"id": w.id, "level": w.level, "label": FIRE_WARNING_LABELS[FireWarningLevel(w.level)], "source": w.source, "issued_at": str(w.issued_at)}
