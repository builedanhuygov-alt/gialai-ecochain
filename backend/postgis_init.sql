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

-- ── Tactical ops (M1/M2/M3): generated geom + KNN ──────────────────────
-- operational_assets stores lon/lat floats (SQLite-compatible). On Postgres,
-- add a generated PostGIS point so KNN uses a GIST index at scale (1000s rows).
ALTER TABLE operational_assets ADD COLUMN IF NOT EXISTS geom GEOMETRY(Point, 4326)
  GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)) STORED;
CREATE INDEX IF NOT EXISTS ix_op_assets_geom ON operational_assets USING GIST (geom);
CREATE INDEX IF NOT EXISTS ix_op_assets_type_status ON operational_assets (asset_type, status);
-- M1 nearest station/team (KNN, index-assisted):
-- SELECT id, name, asset_type, status, contact,
--        ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint(:lon,:lat),4326)::geography)/1000 AS dist_km
-- FROM operational_assets WHERE status='active' AND asset_type IN ('station','team')
-- ORDER BY geom::geography <-> ST_SetSRID(ST_MakePoint(:lon,:lat),4326)::geography LIMIT 2;
-- M2 nearest route anchor (vertex KNN needs a vertices table at scale; until
-- road data exists the app measures vertex distance in Python — documented):
-- SELECT id, name, route_type, road_condition FROM operational_assets
-- WHERE status='active' AND asset_type='route' LIMIT 200;
-- M3 threatened: spread polygons are computed in Python (elliptical heuristic);
-- on PostGIS intersect them via ST_GeomFromGeoJSON(:polygon):
-- SELECT w.id FROM water_assets w WHERE ST_Intersects(w.geom, ST_GeomFromGeoJSON(:poly_1h));
-- Part B FireSim: same pattern for scenario ellipses (client sends simulated
-- polygons back for persistence-free impact math, or compute in-DB):
-- SELECT c.code FROM communes c WHERE ST_Intersects(c.geom, ST_GeomFromGeoJSON(:sim_poly));
-- Route impact in-DB (earliest step): unnest route vertices, ST_Within vs steps:
-- SELECT r.id, min(s.hour) FROM routes r, (SELECT * FROM (VALUES (1.0, :poly_1h),(3.0, :poly_3h),(6.0, :poly_6h)) AS t(hour, geom)) s
-- WHERE ST_Intersects(r.geom, ST_GeomFromGeoJSON(s.geom)) GROUP BY r.id;
-- M1/M2 tactical nullable columns (SQLite create_all handles fresh DBs;
-- existing Postgres needs these ALTERs):
ALTER TABLE operational_assets ADD COLUMN IF NOT EXISTS contact TEXT;
ALTER TABLE operational_assets ADD COLUMN IF NOT EXISTS route_type TEXT;
ALTER TABLE operational_assets ADD COLUMN IF NOT EXISTS road_condition TEXT;
-- Field-data completion, Modules A/B/D/E (all NULL until surveyed):
ALTER TABLE operational_assets ADD COLUMN IF NOT EXISTS district TEXT;
ALTER TABLE operational_assets ADD COLUMN IF NOT EXISTS commune TEXT;
ALTER TABLE operational_assets ADD COLUMN IF NOT EXISTS manager TEXT;
ALTER TABLE operational_assets ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE operational_assets ADD COLUMN IF NOT EXISTS contact_person TEXT;
ALTER TABLE operational_assets ADD COLUMN IF NOT EXISTS contact_phone TEXT;
ALTER TABLE operational_assets ADD COLUMN IF NOT EXISTS organization TEXT;
ALTER TABLE operational_assets ADD COLUMN IF NOT EXISTS verification_date TIMESTAMPTZ;
ALTER TABLE operational_assets ADD COLUMN IF NOT EXISTS surface_type TEXT;
ALTER TABLE operational_assets ADD COLUMN IF NOT EXISTS max_vehicle_tons DOUBLE PRECISION;
ALTER TABLE operational_assets ADD COLUMN IF NOT EXISTS seasonal_access TEXT;
ALTER TABLE operational_assets ADD COLUMN IF NOT EXISTS has_streetview BOOLEAN;
-- Module 360 (M1/M5): viewer metadata — NULL until real media exists.
ALTER TABLE operational_assets ADD COLUMN IF NOT EXISTS preview_image_url TEXT;
ALTER TABLE operational_assets ADD COLUMN IF NOT EXISTS capture_date TIMESTAMPTZ;
ALTER TABLE operational_assets ADD COLUMN IF NOT EXISTS capture_source TEXT;
-- M4 new asset types (community_hall, risk_point) need no DDL (text enum in app).
-- Enum guards (canonical survey values; app also validates pre-insert):
-- ALTER TABLE operational_assets ADD CONSTRAINT ck_road_condition
--   CHECK (road_condition IS NULL OR road_condition IN ('GOOD','FAIR','POOR','BLOCKED'));
-- ALTER TABLE operational_assets ADD CONSTRAINT ck_surface_type
--   CHECK (surface_type IS NULL OR surface_type IN ('PAVED','GRAVEL','FOREST_ROAD','TRAIL'));
-- Module D — water contact directory (fresh SQLite: create_all; old Postgres: ALTERs):
ALTER TABLE water_assets ADD COLUMN IF NOT EXISTS contact_person TEXT;
ALTER TABLE water_assets ADD COLUMN IF NOT EXISTS contact_phone TEXT;
ALTER TABLE water_assets ADD COLUMN IF NOT EXISTS verification_date TIMESTAMPTZ;
ALTER TABLE water_assets ADD COLUMN IF NOT EXISTS source TEXT;
-- Module 360 (M1/M5) viewer metadata for water assets:
ALTER TABLE water_assets ADD COLUMN IF NOT EXISTS preview_image_url TEXT;
ALTER TABLE water_assets ADD COLUMN IF NOT EXISTS capture_date TIMESTAMPTZ;
ALTER TABLE water_assets ADD COLUMN IF NOT EXISTS capture_source TEXT;
-- Unified evidence pipeline (Module A/H) + citizen reports (Module B).
-- Fresh SQLite: create_all. Existing Postgres: run the ALTERs + new table.
ALTER TABLE photo_evidences ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'proposal';
ALTER TABLE photo_evidences ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'PENDING';
ALTER TABLE photo_evidences ADD COLUMN IF NOT EXISTS capture_time TIMESTAMPTZ;
ALTER TABLE photo_evidences ADD COLUMN IF NOT EXISTS meta TEXT;
CREATE TABLE IF NOT EXISTS citizen_reports (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  report_type TEXT,
  latitude DOUBLE PRECISION, longitude DOUBLE PRECISION,
  note TEXT, administrative_unit_id TEXT,
  status TEXT DEFAULT 'PENDING',
  created_at TIMESTAMPTZ DEFAULT now()
);
-- Optional enum guards (app validates pre-insert; DB guard is defense in depth):
-- ALTER TABLE photo_evidences ADD CONSTRAINT ck_ev_source
--   CHECK (source IN ('proposal','citizen','incident','field'));
-- ALTER TABLE photo_evidences ADD CONSTRAINT ck_ev_status
--   CHECK (verification_status IN ('PENDING','VERIFIED','REJECTED'));
