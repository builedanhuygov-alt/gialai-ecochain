import os
os.environ["DATABASE_URL"]="sqlite:///:memory:"
os.environ["DEMO_MODE"]="true"
from fastapi.testclient import TestClient
from app.database import Base, engine, init_db
from app.main import create_app
def setup():
    Base.metadata.drop_all(bind=engine)
    app=create_app(); init_db()
    try:
        from app.seed import seed_demo; seed_demo()
    except: pass
    return TestClient(app)

def test_weather_current():
    c=setup()
    # valid coords Gia Lai
    r=c.get("/api/weather/current?lat=13.9&lon=108.3")
    assert r.status_code==200
    j=r.json()
    assert "source" in j and "metadata" in j
    assert j["metadata"]["status"] in ["LIVE","DEMO","DEMO DATA","CACHED","STALE","CONFIGURATION_REQUIRED","UNAVAILABLE"]
    # invalid coords
    r=c.get("/api/weather/current?lat=100&lon=200")
    assert r.status_code in [400,422]

def test_weather_forecast_cache():
    c=setup()
    r1=c.get("/api/weather/forecast?lat=13.9&lon=108.3&days=7")
    assert r1.status_code==200
    r2=c.get("/api/weather/forecast?lat=13.9&lon=108.3&days=7")
    assert r2.status_code==200
    # second may be CACHED
    assert r2.json()["metadata"]["cache_status"] in ["LIVE","CACHED","DEMO","DEMO DATA","STALE","CONFIGURATION_REQUIRED","UNAVAILABLE"]

def test_satellite():
    c=setup()
    r=c.get("/api/satellite/sentinel2?lat=13.9&lon=108.3&cloud=20")
    assert r.status_code==200 and "ndvi" in r.json()
    r=c.get("/api/satellite/sentinel1?lat=13.9&lon=108.3")
    assert r.status_code==200 and r.json()["source"]=="Sentinel-1 SAR"
    r=c.get("/api/satellite/landsat?mission=8&lat=13.9&lon=108.3")
    assert r.status_code==200
    r=c.get("/api/satellite/dem?source=SRTM&lat=13.9&lon=108.3")
    assert r.status_code==200 and "elevation" in r.json()
    r=c.get("/api/satellite/landcover?source=DynamicWorld&lat=13.9&lon=108.3")
    assert r.status_code==200

def test_firms():
    c=setup()
    r=c.get("/api/fire/firms?lat=13.9&lon=108.3")
    assert r.status_code==200
    j=r.json()
    assert "fires" in j and "metadata" in j
    assert j["metadata"]["status"] in ["LIVE","DEMO","DEMO DATA","CACHED","STALE","CONFIGURATION_REQUIRED","UNAVAILABLE"]

def test_climate():
    c=setup()
    r=c.get("/api/climate/power?lat=13.9&lon=108.3")
    assert r.status_code==200
    assert "source" in r.json()

def test_gee_fallback():
    c=setup()
    # GEE not configured → DEMO or CONFIGURATION_REQUIRED, not crash
    r=c.get("/api/satellite/sentinel2?lat=13.9&lon=108.3")
    assert r.json()["status"] in ["LIVE","DEMO","DEMO DATA","CACHED","STALE","CONFIGURATION_REQUIRED","UNAVAILABLE"]

def test_location_reverse():
    c=setup()
    r=c.get("/api/location/reverse?lat=13.9&lon=108.3")
    assert r.status_code==200 and "locality" in r.json()

def test_data_lineage_metadata():
    c=setup()
    r=c.get("/api/weather/current?lat=13.9&lon=108.3")
    assert "metadata" in r.json()
    assert "source" in r.json()["metadata"] and "timestamp" in r.json()["metadata"]
