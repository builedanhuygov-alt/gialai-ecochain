"""NASA POWER Sec4 — historical climate baseline."""
import time, hashlib, random
import httpx

CACHE={}
TTL=3600

def _mock_power(lat:float, lon:float)->dict:
    rng=random.Random(int(hashlib.sha256(f"power:{lat:.1f},{lon:.1f}".encode()).hexdigest()[:8],16))
    return {
        "source":"NASA POWER","status":"DEMO DATA",
        "parameters": {"T2M": round(rng.uniform(26,32),1), "PRECTOTCORR": round(rng.uniform(2,15),1), "WS2M": round(rng.uniform(2,6),1), "ALLSKY_SFC_SW_DWN": round(rng.uniform(5,7),1)},
        "history": [{"date":"2026-08-01","T2M":28,"PRECTOT":5},{"date":"2026-08-15","T2M":29,"PRECTOT":12}],
        "baseline": {"rainfall_avg": 8, "temp_avg": 28.5}
    }

async def fetch_power(lat:float, lon:float, start:str="20260801", end:str="20260902")->dict:
    key=f"power:{lat:.1f},{lon:.1f}"
    if key in CACHE and time.time()-CACHE[key]["ts"]<TTL:
        return CACHE[key]["data"]
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            r=await client.get("https://power.larc.nasa.gov/api/temporal/daily/point", params={
                "parameters":"T2M,PRECTOTCORR,WS2M,ALLSKY_SFC_SW_DWN",
                "community":"AG", "longitude": lon, "latitude": lat,
                "start": start, "end": end, "format":"JSON"
            })
            r.raise_for_status()
            j=r.json()
            data={"source":"NASA POWER","status":"LIVE", "raw": j, "cache_status":"LIVE"}
            CACHE[key]={"ts": time.time(), "data": data}
            return data
    except Exception as e:
        data=_mock_power(lat,lon)
        data["error"]=str(e)
        CACHE[key]={"ts": time.time(), "data": data}
        return data
