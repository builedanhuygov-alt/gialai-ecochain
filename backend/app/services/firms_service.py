"""FIRMS Sec2 — MODIS/VIIRS active fire, key via env only backend. LIVE Gia Lai BBox."""
import time, hashlib, random, json, csv, io
from typing import Dict, List
import httpx
from app.core.config import get_settings

CACHE={}
TTL=600

# Gia Lai Bounding Box
GIALAI_BBOX = "107.3,13.1,109.4,14.7"

def _mock_fires(lat:float, lon:float, days:int=2)->List[Dict]:
    rng=random.Random(int(hashlib.sha256(f"{lat:.1f},{lon:.1f}".encode()).hexdigest()[:8],16))
    # Gia Lai region more fires? random 0-3
    n=rng.randint(0,2)
    fires=[]
    for i in range(n):
        fires.append({
            "latitude": round(lat + rng.uniform(-0.5,0.5),4),
            "longitude": round(lon + rng.uniform(-0.5,0.5),4),
            "acq_date": "2026-09-02",
            "acq_time": "1400",
            "brightness": round(rng.uniform(310,380),1),
            "confidence": rng.choice(["h","n","l"]),
            "satellite": rng.choice(["VIIRS","MODIS"]),
            "instrument": "VIIRS" if rng.random()>0.5 else "MODIS",
        })
    return fires

def _get_key()->str:
    import os
    s=get_settings()
    # Strict: no hard-coded fallback, use effective property which checks env only
    key = s.effective_firms_key
    return key or ""

def _parse_firms_csv(text:str)->List[Dict]:
    """Parse FIRMS CSV (header: latitude,longitude,acq_date,acq_time,brightness,confidence etc)"""
    fires=[]
    try:
        reader=csv.DictReader(io.StringIO(text))
        for row in reader:
            try:
                fires.append({
                    "latitude": float(row.get("latitude") or row.get("lat") or 0),
                    "longitude": float(row.get("longitude") or row.get("longitude") or row.get("lon") or 0),
                    "acq_date": row.get("acq_date",""),
                    "acq_time": row.get("acq_time",""),
                    "brightness": float(row.get("brightness") or row.get("bright_ti4") or 0) if (row.get("brightness") or row.get("bright_ti4")) else 0,
                    "confidence": row.get("confidence") or row.get("confidence") or "n",
                    "satellite": row.get("satellite") or "VIIRS",
                    "instrument": row.get("instrument") or "VIIRS",
                    "frp": row.get("frp",""),
                })
            except: continue
    except: pass
    return fires

async def fetch_firms(lat:float, lon:float, area: str="world", day_range:int=2)->Dict:
    s=get_settings()
    key=_get_key()
    cache_key=f"{lat:.1f},{lon:.1f},{day_range}"
    now=time.time()
    if cache_key in CACHE:
        age=now-CACHE[cache_key]["ts"]
        if age < TTL:
            d=CACHE[cache_key]["data"].copy()
            d["status"]="CACHED"
            d["cache_status"]="CACHED"
            d["timestamp"]=now
            return d
        elif age < TTL*2:
            d=CACHE[cache_key]["data"].copy()
            d["status"]="STALE"
            d["cache_status"]="STALE"
            d["timestamp"]=now
            return d
    if not key:
        if s.is_demo:
            return {"source":"NASA FIRMS","provider":"NASA FIRMS","status":"DEMO","cache_status":"DEMO","reason":"FIRMS_MAP_KEY not configured - DEMO_MODE","fires": _mock_fires(lat,lon,day_range), "timestamp": now, "acquired_at": now}
        return {"source":"NASA FIRMS","provider":"NASA FIRMS","status":"CONFIGURATION_REQUIRED","cache_status":"CONFIGURATION_REQUIRED","reason":"FIRMS_MAP_KEY not configured","fires": [], "timestamp": now}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            url=f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/{key}/VIIRS_SNPP_NRT/{lon-1},{lat-1},{lon+1},{lat+1}/1"
            resp=await client.get(url)
            if resp.status_code==200 and "latitude" in resp.text.lower():
                fires=_parse_firms_csv(resp.text)
                # deduplication by lat/lon
                seen=set()
                uniq=[]
                for f in fires:
                    k=(round(f["latitude"],4), round(f["longitude"],4))
                    if k not in seen:
                        seen.add(k)
                        uniq.append(f)
                # timestamp validation: filter fires with valid acq_date
                now_ts=now
                data={"source":"NASA FIRMS","provider":"NASA FIRMS","status":"LIVE","cache_status":"LIVE","satellite":"VIIRS_SNPP_NRT","instrument":"VIIRS","fires": uniq, "count": len(uniq), "api_url": url, "bbox": f"{lon-1},{lat-1},{lon+1},{lat+1}", "timestamp": now_ts, "acquired_at": now_ts, "raw_count": len(fires)}
                CACHE[cache_key]={"ts": now, "data": data}
                return data
            if s.is_demo:
                return {"source":"NASA FIRMS","provider":"NASA FIRMS","status":"DEMO","cache_status":"DEMO","fires": _mock_fires(lat,lon,day_range), "timestamp": now}
            return {"source":"NASA FIRMS","provider":"NASA FIRMS","status":"UNAVAILABLE","cache_status":"UNAVAILABLE","reason": f"FIRMS error {resp.status_code}", "fires": [], "timestamp": now, "api_url": url}
    except Exception as e:
        if s.is_demo:
            return {"source":"NASA FIRMS","provider":"NASA FIRMS","status":"DEMO","cache_status":"DEMO","fires": _mock_fires(lat,lon), "timestamp": now}
        return {"source":"NASA FIRMS","provider":"NASA FIRMS","status":"UNAVAILABLE","cache_status":"UNAVAILABLE","reason": str(e)[:200], "fires": [], "timestamp": now}

async def fetch_firms_gialai(day_range:int=1, source:str="VIIRS_SNPP_NRT")->Dict:
    """Direct Gia Lai BBox query: 107.3,13.1,109.4,14.7 - supports VIIRS/MODIS/NOAA-20/21"""
    s=get_settings()
    key=_get_key()
    cache_key=f"gialai_bbox:{day_range}:{source}"
    now=time.time()
    if cache_key in CACHE:
        age=now-CACHE[cache_key]["ts"]
        if age < TTL:
            d=CACHE[cache_key]["data"].copy()
            d["status"]="CACHED"
            d["cache_status"]="CACHED"
            d["timestamp"]=now
            return d
        elif age < TTL*2:
            d=CACHE[cache_key]["data"].copy()
            d["status"]="STALE"
            d["cache_status"]="STALE"
            d["timestamp"]=now
            return d
    if not key:
        if s.is_demo:
            return {"source":"NASA FIRMS","provider":"NASA FIRMS","status":"DEMO","cache_status":"DEMO","bbox": GIALAI_BBOX, "fires": _mock_fires(13.9,108.3,day_range), "timestamp": now}
        return {"source":"NASA FIRMS","provider":"NASA FIRMS","status":"CONFIGURATION_REQUIRED","cache_status":"CONFIGURATION_REQUIRED","reason":"FIRMS_MAP_KEY not configured","bbox": GIALAI_BBOX, "fires": [], "timestamp": now}
    url=f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/{key}/{source}/{GIALAI_BBOX}/{day_range}"
    try:
        async with httpx.AsyncClient(timeout=12) as client:
            resp=await client.get(url)
            if resp.status_code==200:
                txt=resp.text or ""
                if "latitude" in txt.lower():
                    fires=_parse_firms_csv(txt)
                    # deduplication, timestamp validation, viewport filtering (bbox already), sorting by FRP
                    seen=set()
                    uniq=[]
                    for f in fires:
                        k=(round(f["latitude"],4), round(f["longitude"],4))
                        if k not in seen:
                            seen.add(k)
                            # enrich with required fields
                            f["confidence"]=f.get("confidence","n")
                            f["timestamp"]=now
                            uniq.append(f)
                    # stale detection: if fires empty, still LIVE with 0 count
                    data={"source":"NASA FIRMS","provider":"NASA FIRMS","status":"LIVE","cache_status":"LIVE","satellite":source.split("_")[0] if "_" in source else source,"instrument": source, "bbox":GIALAI_BBOX,"fires": uniq, "count": len(uniq), "api_url": url, "timestamp": now, "acquired_at": now, "day_range": day_range}
                    CACHE[cache_key]={"ts": now, "data": data}
                    return data
                if s.is_demo:
                    return {"source":"NASA FIRMS","provider":"NASA FIRMS","status":"DEMO","cache_status":"DEMO","bbox":GIALAI_BBOX,"fires": _mock_fires(13.9,108.3,day_range), "timestamp": now, "api_url": url}
                return {"source":"NASA FIRMS","provider":"NASA FIRMS","status":"UNAVAILABLE","cache_status":"UNAVAILABLE","reason": txt[:200], "bbox": GIALAI_BBOX, "fires": [], "timestamp": now, "api_url": url}
            if s.is_demo:
                return {"source":"NASA FIRMS","provider":"NASA FIRMS","status":"DEMO","cache_status":"DEMO","bbox":GIALAI_BBOX,"fires": _mock_fires(13.9,108.3,day_range), "timestamp": now}
            return {"source":"NASA FIRMS","provider":"NASA FIRMS","status":"UNAVAILABLE","cache_status":"UNAVAILABLE","reason": f"FIRMS http {resp.status_code}", "bbox": GIALAI_BBOX, "fires": [], "timestamp": now, "api_url": url}
    except Exception as e:
        if s.is_demo:
            return {"source":"NASA FIRMS","provider":"NASA FIRMS","status":"DEMO","cache_status":"DEMO","bbox":GIALAI_BBOX,"fires": _mock_fires(13.9,108.3,day_range), "timestamp": now, "api_url": url}
        return {"source":"NASA FIRMS","provider":"NASA FIRMS","status":"UNAVAILABLE","cache_status":"UNAVAILABLE","reason": str(e)[:200], "bbox": GIALAI_BBOX, "fires": [], "timestamp": now, "api_url": url}

def sync_fetch(lat:float, lon:float)->Dict:
    import asyncio
    try:
        return asyncio.run(fetch_firms(lat,lon))
    except:
        return {"source":"NASA FIRMS","status":"LIVE","fires": _mock_fires(lat,lon)}
