# ECOGL 1.0 — Phase 3 AI Risk Intelligence (Forest + Disaster + Carbon + Ranking)

Phase 1 Foundation + Phase 2 ForestGuard + Phase 3 Multi-Agent Risk Intelligence. Đã pass 10 tests (Phase1 8 + Phase2 1 + Phase3 1).

## Architecture (Section 23)

```
             🌐 DATA SOURCES
                   │
      ┌────────────┼────────────┐
      ▼            ▼            ▼
  🛰️ GEE       🌦️ Weather     🗺️ GIS
      │            │            │
      └────────────┼────────────┘
                   ▼
            🤖 AI AGENTS
                   │
         ┌─────────┼─────────┐
         ▼         ▼         ▼
      FOREST    CARBON    DISASTER
         │         │         │
         └─────────┼─────────┘
                   ▼
             AI ANALYSIS
                   │
                   ▼
              DATA PROPOSAL
                   │
                   ▼
                PENDING
                   │
                   ▼
              👤 ADMIN
                   │
             ┌─────┴─────┐
             ▼           ▼
          APPROVE      REJECT
             │
             ▼
         VERIFIED
```

## Quick Start

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env
# edit .env — set GEE_*, DATABASE_URL, DEMO_MODE
uvicorn app.main:app --reload --port 8000
# docs: http://localhost:8000/docs
```

## Environment / GEE Authentication (Section 5)

> Never commit credentials.

| Var | Required | Description |
|-----|----------|-------------|
| `GEE_PROJECT_ID` | Phase 2 | GCP project id |
| `GEE_SERVICE_ACCOUNT` | Phase 2 | `…@….iam.gserviceaccount.com` |
| `GEE_PRIVATE_KEY` | Phase 2 | `-----BEGIN PRIVATE KEY-----` (escapes `\n` ok) |
| `GEE_KEY_FILE` | alt | Path to service-account json |
| `DEMO_MODE` | - | `true` → all responses tagged `DEMO / SIMULATED` |
| `DATABASE_URL` | - | default `sqlite:///./ecogl.db` |

If not configured, the app boots with:

```
GEE STATUS: NOT CONFIGURED
```

and every GEE call falls back to `MockEarthEngineService` — no crash (Section 5, 19).

Check:

```
GET /api/health          → { gee: { status, configured, last_error } }
POST /api/gee/authenticate
GET /api/automation-status
```

## Key Abstractions

### 1. EarthEngineService (`app/services/earth_engine/service.py:42`)

```python
class EarthEngineService(ABC):
    def authenticate(): ...
    def get_imagery(params: EEQueryParams): ...
    def calculate_ndvi(params: EEQueryParams): ...  # NDVI=(NIR-RED)/(NIR+RED), B8/B4 for S2
    def detect_forest_change(...): ...
    def get_statistics(...): ...
```

Factory: `get_earth_engine_service(use_mock=None)` — auto selects mock when `DEMO_MODE` or not configured, real `GEE_EarthEngineService` in Phase 2.

Dataset single source: `app/services/earth_engine/config.py:14` (`COPERNICUS/S2_SR_HARMONIZED`, `LANDSAT/...`).

### 2. DataProvider (`app/services/data_providers/base.py:24`)

```
DataProvider
├── EarthEngineProvider
├── WeatherProvider
├── GISProvider
├── NewsProvider
└── AdminInputProvider
```

Registry: `app/services/data_providers/__init__.py:22`

### 3. Pipeline (`app/services/pipeline/pipeline.py:34`)

```
SCHEDULE → AGENT → PROVIDER → RAW → PROCESSED → AI_RESULT → PROPOSAL(PENDING) → ADMIN → VERIFIED
```

Governance invariant (Section 18): AI never writes `VERIFIED` directly.

```python
run_pipeline(db, provider_name="EARTH_ENGINE", query=ProviderQuery(...))
approve_proposal(db, proposal_id, verified_by="admin")  # → VerifiedData
reject_proposal(db, proposal_id, reason="…")
```

### 4. ForestGuardAgent (`app/services/agents/forest_guard.py:24`)

```python
class ForestGuardAgent(ABC):
    def monitor_area(admin_unit_id, start_date, end_date, geometry): ...
    def analyze_ndvi(params): ...
    def detect_change(...): ...
    def create_proposal(analysis): ...
```

Phase 1: `MockForestGuardAgent` (deterministic RNG per unit+date, full failure handling Section 19).  
Phase 2: `GEEForestGuardAgent` swaps in real EE without contract change.

### 5. Scheduler (`app/services/scheduler/scheduler.py:20`)

```python
scheduler_service.register_job("forest_monitoring", func, cron="0 2 * * *")
scheduler_service.register_job("forest_monitoring", func, interval_hours=24)
scheduler_service.list_jobs()
scheduler_service.trigger_now("forest_monitoring")
```

Defaults to `APScheduler`; if not installed → graceful `REGISTERED_NO_SCHEDULER`. Heavy jobs never run inside HTTP request.

## Administrative Hierarchy (Sections 11-12)

`AdministrativeUnit` (`app/models/administrative.py:14`) has `geometry_geojson` (GeoJSON) validated via `shapely`, parent hierarchy, and extensible `AdministrativeLevel`: `PROVINCE/COMMUNE/VILLAGE` + future `FARM/PLOT/FIELD/LOT`. Seeded demo Gia Lai:

```
Gia Lai (Province)
├── Xã A (Commune) ──┬─ Thôn 1 (Village)
│                    └─ Thôn 2 (Village)
└── Xã B (Commune)
```

Endpoints: `POST /api/administrative-units`, `GET /api/administrative-units?level=COMMUNE`, `GET /api/administrative-units/{id}/hierarchy`

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | root + demo flag |
| GET | `/api/health` | app + GEE + scheduler |
| POST | `/api/gee/authenticate` | attempt GEE auth |
| GET | `/api/automation-status` | dashboard Section 16 |
| POST | `/api/administrative-units` | create unit with geometry |
| GET | `/api/agents/forest-guard/monitor` | Section 10 auto monitoring |
| POST | `/api/agents/forest-guard/ndvi` | NDVI stats |
| GET | `/api/agents/forest-guard/proposals` | list PENDING/VERIFIED |
| POST | `/api/agents/forest-guard/proposals/{id}/approve` | verify |
| POST | `/api/agents/forest-guard/proposals/{id}/reject` | reject |
| GET | `/api/agents/forest-guard/lineage/{id}` | Section 14 trace |
| GET | `/api/agents/forest-guard/query-logs` | Section 15 |

All demo responses include `"origin": "DEMO / SIMULATED"` vs `"REAL / VERIFIED"` (Section 20).

## Demo Mode

Set `DEMO_MODE=true` in `.env`. Seed data is tagged `is_demo=True` and every API response carries `origin`. UI must render badge accordingly — never present simulated as real.

## Verification (Success Criteria Section 22)

Run:

```bash
pytest -q
python -c "from app.services.earth_engine.service import EarthEngineService; ...; print('OK')"
```

Checklist mirrors Section 22 — all interfaces, pipeline states, lineage, fallback, scheduler, demo mode.

## Phase 2 Handoff

Implement only:

```
EarthEngineProvider → Sentinel-2 → NDVI → Historical Comparison → ForestChange → ForestGuard → Proposal → Admin
```

No changes needed to auth, RBAC, hierarchy, verification, audit, dashboard, map, or core DB.
