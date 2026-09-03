"""Fire risk weights Sec20 — configurable, not hard-coded in UI."""
WEIGHTS = {
    "fuel_dryness": 0.30,
    "weather_danger": 0.20,
    "firms_proximity": 0.15,
    "wind": 0.10,
    "rainfall_deficit": 0.10,
    "terrain": 0.10,
    "historical_community": 0.05,
}
# maps to: Fuel dryness 30%, Weather 20%, FIRMS 15%, Wind 10%, Rainfall deficit 10%, Terrain 10%, Historical 5%
THRESHOLDS = [(19, "I"), (39, "II"), (59, "III"), (79, "IV"), (100, "V")]
