-- PostGIS production bootstrap for EcoGL.
-- Run once as a superuser (or the DB owner) on the production database,
-- e.g. Neon / Supabase / self-hosted Postgres, then point the backend at:
--   DATABASE_URL=postgresql+psycopg2://USER:PASS@HOST:5432/ecogl
--
-- The app stores geometry as GeoJSON text (SQLite-compatible), so it boots
-- on plain Postgres too — PostGIS only unlocks spatial indexes + queries.

CREATE EXTENSION IF NOT EXISTS postgis;

-- Spatial index on raw geometry payloads (JSON text columns).
-- Add real Geometry columns later via Alembic when switching to geoalchemy2 types.

-- Example: GIST index for administrative unit lookups by code/level.
CREATE INDEX IF NOT EXISTS ix_admin_units_level ON administrative_units (level);
CREATE INDEX IF NOT EXISTS ix_risk_score_unit ON risk_scores (administrative_unit_id);
CREATE INDEX IF NOT EXISTS ix_alert_status ON alerts (status);
CREATE INDEX IF NOT EXISTS ix_proposals_status ON proposals (status);

-- Water assets (PostGIS-native mirror of app/models/water.py).
-- The app seeds the same 16 rows portably in Python (seed_water_assets);
-- run the INSERTs below only on a fresh Postgres that was NOT seeded.
CREATE TABLE IF NOT EXISTS water_assets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  asset_type TEXT NOT NULL,
  geom GEOMETRY(Point, 4326) NOT NULL,
  commune TEXT, district TEXT, province TEXT DEFAULT 'Gia Lai',
  capacity_m3 BIGINT, water_area_ha DOUBLE PRECISION,
  manager TEXT, road_access BOOLEAN DEFAULT FALSE,
  status TEXT DEFAULT 'cần xác minh',
  google_maps_url TEXT, has_streetview BOOLEAN DEFAULT FALSE,
  commune_code TEXT, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_water_assets_geom ON water_assets USING GIST (geom);
-- Nearest-3 example (R-Tree <->, road factor 1.3 applied in Python):
-- SELECT id, name, capacity_m3,
--        ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint(:lon,:lat),4326)::geography)/1000 AS dist_km
-- FROM water_assets ORDER BY geom::geography <-> ST_SetSRID(ST_MakePoint(:lon,:lat),4326)::geography LIMIT 3;
