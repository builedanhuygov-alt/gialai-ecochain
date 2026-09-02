"""WeatherService Sec3 — Open-Meteo via backend only, caching per lat/lon+bucket."""
import time, hashlib, json, random
from typing import Dict
import httpx

CACHE={}
TTL=600  # 10 min

def _bucket_key(lat:float, lon:float)->str:
    return f"{round(lat,1):.1f},{round(lon,1):.1f}"

def _mock_weather(lat:float, lon:float)->Dict:
    rng=random.Random(int(hashlib.sha256(_bucket_key(lat,lon).encode()).hexdigest()[:8],16))
    temp=round(rng.uniform(24,32),1)
    return {
        "latitude": lat, "longitude": lon,
        "current": {"temperature": temp, "weathercode": rng.choice([1,2,3]), "windspeed": round(rng.uniform(5,18),1), "winddirection": rng.randint(0,360), "is_day":1, "time": "2026-09-02T14:00"},
        "hourly": {"temperature_2m": [temp+i*0.2 for i in range(24)], "precipitation": [round(rng.uniform(0,3),1) for _ in range(24)], "precipitation_probability": [rng.randint(0,80) for _ in range(24)]},
        "daily": {"temperature_2m_max": [temp+2], "temperature_2m_min": [temp-6], "precipitation_sum": [round(rng.uniform(0,30),1)]},
        "units": {"temperature":"°C","precipitation":"mm","windspeed":"km/h"},
        "humidity": rng.randint(60,90), "pressure": rng.randint(1008,1018), "cloudcover": rng.randint(20,80),
    }

async def fetch_current(lat:float, lon:float)->Dict:
    key=_bucket_key(lat,lon)+":current"
    if key in CACHE and time.time()-CACHE[key]["ts"]<TTL:
        d=CACHE[key]["data"].copy(); d["cache_status"]="CACHED"; return d
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            r=await client.get("https://api.open-meteo.com/v1/forecast", params={
                "latitude": lat, "longitude": lon,
                "current":"temperature_2m,precipitation,wind_speed_10m,wind_direction_10m,is_day,cloud_cover",
                "hourly":"temperature_2m,precipitation,precipitation_probability,wind_speed_10m,relative_humidity_2m",
                "daily":"temperature_2m_max,temperature_2m_min,precipitation_sum",
                "timezone":"auto", "forecast_days": 7
            })
            r.raise_for_status()
            j=r.json()
            # enrich
            data={"source":"Open-Meteo","status":"LIVE","retrieved_at": time.time(), "cache_status":"LIVE", **j}
            CACHE[key]={"ts": time.time(), "data": data}
            return data
    except Exception as e:
        data={"source":"Open-Meteo","status":"DEMO DATA","error": str(e), **_mock_weather(lat,lon), "cache_status":"DEMO DATA"}
        CACHE[key]={"ts": time.time(), "data": data}
        return data

async def fetch_forecast(lat:float, lon:float, days:int=7)->Dict:
    # reuse current but ensure forecast length
    return await fetch_current(lat,lon)

def validate_coords(lat:float, lon:float):
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        raise ValueError("Invalid coordinates")
