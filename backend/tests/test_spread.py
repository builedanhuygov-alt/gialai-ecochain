"""Spread model math + real-boundary impact (deterministic, verifiable)."""
from app.services import spread as S


def test_ros_grows_with_wind_and_slope_and_caps():
    calm = S.head_ros_kmh(5, 5)
    windy = S.head_ros_kmh(40, 25)
    assert 0 < calm < windy <= 3.0
    assert S.head_ros_kmh(200, 60) == 3.0


def test_simulate_steps_expand_and_close():
    sim = S.simulate(109.18, 14.04, 18, 90, 12, [1.0, 3.0, 6.0])
    assert sim["model"] == "ELLIPTICAL_HEURISTIC_V1"
    areas = [s["area_ha"] for s in sim["steps"]]
    assert areas == sorted(areas) and areas[0] > 0
    for s in sim["steps"]:
        ring = s["polygon"]["coordinates"][0]
        assert ring[0] == ring[-1]  # closed
        assert len(ring) >= 8


def test_cat_thanh_burn_hits_phu_cat_area():
    shapes = S.load_commune_shapes()
    assert len(shapes) == 134
    # Cát Thành 133ha burn point must resolve to a real commune
    sim = S.simulate(109.1792, 14.0417, 15, 90, 12, [3.0])
    hit = S.affected_communes(sim["steps"][0]["polygon"]["coordinates"][0], shapes)
    names = [h["name"] for h in hit]
    assert any("Phù Cát" in n or "Cát Tiến" in n for n in names), names


def test_downwind_bias():
    # east wind toward 90°: polygon must extend further east than west of ignition
    sim = S.simulate(108.3, 13.9, 30, 90, 0, [3.0])
    ring = sim["steps"][0]["polygon"]["coordinates"][0]
    lons = [p[0] for p in ring]
    assert max(lons) - 108.3 > 108.3 - min(lons)
