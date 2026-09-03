import os
os.environ["DATABASE_URL"]="sqlite:///:memory:"
from app.services.fire_risk_engine import fire_risk_engine

def test_dry_vegetation_increases():
    low=fire_risk_engine.analyze("test1", satellite={"ndvi":0.7,"ndmi":0.4}, weather={"temperature":28,"humidity":60,"rainfall":10,"wind_speed":5})
    high=fire_risk_engine.analyze("test1", satellite={"ndvi":0.3,"ndmi":0.05}, weather={"temperature":28,"humidity":60,"rainfall":10,"wind_speed":5})
    assert high["risk_score"] > low["risk_score"]

def test_high_humidity_decreases():
    dry=fire_risk_engine.analyze("test2", satellite={"ndvi":0.5}, weather={"temperature":30,"humidity":30,"rainfall":5,"wind_speed":10})
    humid=fire_risk_engine.analyze("test2", satellite={"ndvi":0.5}, weather={"temperature":30,"humidity":85,"rainfall":5,"wind_speed":10})
    assert humid["risk_score"] < dry["risk_score"]

def test_rainfall_decreases():
    rainy=fire_risk_engine.analyze("test3", satellite={"ndvi":0.5}, weather={"rainfall":20,"temperature":30,"humidity":60,"wind_speed":10})
    dry=fire_risk_engine.analyze("test3", satellite={"ndvi":0.5}, weather={"rainfall":0,"temperature":30,"humidity":60,"wind_speed":10})
    assert rainy["risk_score"] < dry["risk_score"]

def test_high_wind_increases():
    calm=fire_risk_engine.analyze("test4", satellite={"ndvi":0.5}, weather={"wind_speed":3,"temperature":30,"humidity":60,"rainfall":5})
    windy=fire_risk_engine.analyze("test4", satellite={"ndvi":0.5}, weather={"wind_speed":25,"temperature":30,"humidity":60,"rainfall":5})
    assert windy["risk_score"] > calm["risk_score"]

def test_near_firms_increases():
    far=fire_risk_engine.analyze("test5", satellite={"ndvi":0.5}, weather={"temperature":30,"humidity":60,"rainfall":5,"wind_speed":10}, hotspots=[])
    near=fire_risk_engine.analyze("test5", satellite={"ndvi":0.5}, weather={"temperature":30,"humidity":60,"rainfall":5,"wind_speed":10}, hotspots=[{"lat":13.9,"lon":108.3}])
    assert near["risk_score"] > far["risk_score"]

def test_urban_low_ndvi_not_fire():
    # urban area low NDVI but not fire: we ensure high humidity + no wind + no firms keeps risk moderate, not critical
    urban=fire_risk_engine.analyze("urban", satellite={"ndvi":0.15,"ndmi":0.1}, weather={"temperature":30,"humidity":70,"rainfall":15,"wind_speed":5}, hotspots=[])
    assert urban["risk_score"] < 70  # not critical

def test_nbr_alone_not_high():
    # NBR alone high should NOT produce high fire risk Sec53
    nbr_only=fire_risk_engine.analyze("nbr", satellite={"ndvi":0.6,"ndmi":0.35,"nbr":0.8}, weather={"temperature":28,"humidity":65,"rainfall":15,"wind_speed":5}, hotspots=[])
    assert nbr_only["risk_score"] < 70
