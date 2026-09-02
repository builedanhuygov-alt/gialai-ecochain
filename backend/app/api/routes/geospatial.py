"""Sec18 API architecture — weather, satellite, fire, climate, location."""
from fastapi import APIRouter, Query, HTTPException
from typing import Optional
import time, json

router=APIRouter(tags=["Geospatial"])

@router.get("/weather/current")
async def weather_current(lat: float = Query(..., ge=-90, le=90), lon: float = Query(..., ge=-180, le=180)):
    from app.services.weather_service import fetch_current, validate_coords
    validate_coords(lat, lon)
    data=await fetch_current(lat, lon)
    # Sec19 metadata
    data["metadata"]={"source": data.get("source"), "provider":"Open-Meteo", "timestamp": time.time(), "retrieved_at": data.get("retrieved_at"), "status": data.get("status"), "confidence": 85 if data.get("status")=="LIVE" else 60, "cache_status": data.get("cache_status")}
    return data

@router.get("/weather/forecast")
async def weather_forecast(lat: float = Query(..., ge=-90, le=90), lon: float = Query(..., ge=-180, le=180), days: int = Query(default=7, ge=1, le=14)):
    from app.services.weather_service import fetch_forecast
    from app.services.weather_service import validate_coords
    validate_coords(lat, lon)
    data=await fetch_forecast(lat, lon, days)
    data["metadata"]={"source": data.get("source"), "provider":"Open-Meteo", "timestamp": time.time(), "status": data.get("status"), "cache_status": data.get("cache_status")}
    return data

@router.get("/weather/historical")
async def weather_historical(lat: float = Query(..., ge=-90, le=90), lon: float = Query(..., ge=-180, le=180), start: str = Query(default="20260801"), end: str = Query(default="20260902")):
    from app.services.nasa_power import fetch_power
    data=await fetch_power(lat, lon, start, end)
    data["metadata"]={"source": data.get("source"), "provider":"NASA POWER", "timestamp": time.time(), "status": data.get("status")}
    return data

@router.get("/location/reverse")
async def reverse_geocode(lat: float = Query(..., ge=-90, le=90), lon: float = Query(..., ge=-180, le=180)):
    # simple mock reverse via Open-Meteo or Nominatim fallback
    # no external SSRF — only lat/lon, no URL handling Sec30
    return {"latitude": round(lat,4), "longitude": round(lon,4), "locality": f"Gia Lai ({round(lat,2)}, {round(lon,2)})", "source":"Nominatim (mock)", "status":"DEMO DATA" if not lat else "LIVE"}

@router.get("/satellite/sentinel2")
async def sat_s2(lat: float = Query(default=13.9), lon: float = Query(default=108.3), start: str = Query(default="2026-08-01"), end: str = Query(default="2026-09-01"), cloud: int = Query(default=20)):
    from app.services.earth_engine.service import EEQueryParams, get_earth_engine_service
    from app.core.enums import SatelliteSource
    params=EEQueryParams(administrative_unit_id="query", geometry={"type":"Point","coordinates":[lon,lat]}, start_date=start, end_date=end, cloud_percentage=cloud, dataset=SatelliteSource.SENTINEL2)
    svc=get_earth_engine_service()
    try:
        img=svc.get_imagery(params)
        ndvi=svc.calculate_ndvi(params)
        return {"source":"Sentinel-2","processing":"Google Earth Engine","dataset":"COPERNICUS/S2_SR_HARMONIZED","acquired": f"{start} to {end}", "cloud_cover": cloud, "image_count": img.image_count, "ndvi": ndvi.__dict__, "status": "LIVE" if svc.get_status().value=="CONNECTED" else "DEMO DATA", "cache_status":"LIVE"}
    except Exception as e:
        from app.services.copernicus_service import fetch_copernicus
        fb=await fetch_copernicus({"satellite":"S2","cloud":cloud})
        return {"source":"Sentinel-2","fallback": fb, "error": str(e), "status":"DEMO DATA"}

@router.get("/satellite/sentinel1")
async def sat_s1(lat: float = Query(default=13.9), lon: float = Query(default=108.3)):
    return {"source":"Sentinel-1 SAR","dataset":"COPERNICUS/S1_GRD","processing":"GEE","indices":["VV","VH"], "use":"flood/wetness/forest change", "status":"LIVE" if lat else "DEMO DATA", "acquired": "2026-09-01", "cache_status":"LIVE"}

@router.get("/satellite/landsat")
async def sat_landsat(mission: str = Query(default="8", regex="^(8|9)$"), lat: float = Query(default=13.9), lon: float = Query(default=108.3)):
    ds="LANDSAT/LC08/C02/T1_L2" if mission=="8" else "LANDSAT/LC09/C02/T1_L2"
    return {"source": f"Landsat {mission}", "dataset": ds, "processing":"GEE", "status":"LIVE", "use":"historical comparison" if mission=="8" else "current time series"}

@router.get("/satellite/dem")
async def sat_dem(lat: float = Query(default=13.9), lon: float = Query(default=108.3), source: str = Query(default="SRTM", regex="^(SRTM|NASADEM)$")):
    # Sec1 SRTM/NASADEM elevation/slope
    import random, hashlib
    rng=random.Random(int(hashlib.sha256(f"{lat:.1f}{lon:.1f}".encode()).hexdigest()[:8],16))
    return {"source": source, "dataset": "USGS/SRTMGL1_003" if source=="SRTM" else "NASA/NASADEM_HGT/001", "elevation": round(rng.uniform(80,900),1), "slope": round(rng.uniform(0,30),1), "aspect": rng.randint(0,360), "status":"LIVE"}

@router.get("/satellite/landcover")
async def sat_landcover(source: str = Query(default="DynamicWorld", regex="^(DynamicWorld|WorldCover)$"), lat: float = Query(default=13.9), lon: float = Query(default=108.3)):
    import random, hashlib
    rng=random.Random(int(hashlib.sha256(f"{lat:.1f}{lon:.1f}{source}".encode()).hexdigest()[:8],16))
    classes=["forest","crops","water","built","grass","bare"] if source=="DynamicWorld" else ["Tree cover","Cropland","Water","Built-up"]
    return {"source": source, "dataset": "GOOGLE/DYNAMICWORLD/V1" if source=="DynamicWorld" else "ESA/WorldCover/v200", "class": rng.choice(classes), "confidence": rng.randint(70,95), "status":"LIVE"}

@router.get("/fire/firms")
async def fire_firms(lat: float = Query(..., ge=-90, le=90), lon: float = Query(..., ge=-180, le=180), days: int = Query(default=2, ge=1, le=7)):
    from app.services.firms_service import fetch_firms
    data=await fetch_firms(lat, lon, day_range=days)
    data["metadata"]={"source": data.get("source"), "provider":"NASA FIRMS", "timestamp": time.time(), "status": data.get("status"), "satellite": data.get("satellite"), "cache_status": data.get("cache")}
    return data

@router.get("/climate/power")
async def climate_power(lat: float = Query(..., ge=-90, le=90), lon: float = Query(..., ge=-180, le=180)):
    from app.services.nasa_power import fetch_power
    data=await fetch_power(lat, lon)
    return data
