# GIALAI EcoChain 1.0 — AI Environmental & Resilience Governance Platform

> **Provincial Eco-Operating System for Gia Lai** — Observe → Analyze → Predict → Plan → Recommend → Human Approve → Execute → Monitor → Learn

GIALAI EcoChain (tiền thân EcoGL) là nền tảng GovTech cấp tỉnh hợp nhất **vệ tinh (Sentinel-2/Landsat qua GEE), thời tiết, GIS, trí tuệ cộng đồng và logistics** thành **Digital Twin** Gia Lai, điều phối bởi hệ AI Agent và quản trị 3 lớp **AI → Cộng đồng → Chính thức**.

**Status:** `v1.0.0` — Final Release — 16/16 tests PASS — Frontend `dist` builds — Backend boots in Demo/Mock mode without GEE credentials.

---

## Architecture

```
                         ECOGL 1.0
                              │
                       DATA FABRIC
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
       SATELLITE           WEATHER             GIS
       COMMUNITY           AGRICULTURE        LOGISTICS
                              │
                              ▼
                     KNOWLEDGE GRAPH
                              │
                              ▼
                         EVENT STREAM
                              │
                         DIGITAL TWIN
                ┌──────────────┼──────────────┐
                ▼              ▼              ▼
           FOREST           DISASTER         CARBON
                └──────────────┼──────────────┘
                              ▼
                      ECOGL MASTER AGENT
                              │
                       PLANNING ENGINE
                              │
                     SCENARIO / SIMULATION
                              │
                      RECOMMENDATION
                              │
                       HUMAN APPROVAL
                              │
                         MISSIONS → TASKS → FIELD
                              │
                          OUTCOME → LEARNING
```

**Phases consolidated:** Phase1 Foundation → Phase2 ForestGuard → Phase3 Disaster/Carbon/Ranking → Phase4 EUDR/Logistics → Phase5 Orchestration → Phase6 Predictive Twin → Phase7 Autonomous → Phase8 Network → Phase9 Twin Simulation + Master UI (Phase10).

---

## Features (Phase1→9)

| Domain | Capability |
|---|---|
| **Forest AI** | GEE `COPERNICUS/S2_SR_HARMONIZED`, NDVI `(B8-B4)/(B8+B4)`, change detection, fire/flood/landslide/drought/heat 5 risks, forest health forecast |
| **Disaster AI** | Multi-source fusion + spatial intelligence (buffer/intersection/hotspot) + compound/cascade + early warning WATCH/WARNING/CRITICAL |
| **Agriculture** | Coffee health 68/24/8, crop stress, harvest forecast, farm polygons |
| **Carbon** | Forest biomass `150×0.47` estimate (range 0.9–1.5M, **ESTIMATE not credit**), MRV ledger, scenario |
| **EUDR** | Farm→Plot polygon → Lot `GL-2026-xxxxx` → Facility → Traceability graph/timeline, readiness 0–100, due-diligence checklist, `EUDR Readiness (not legal certification)` |
| **Green Logistics** | Route optimize (distance/time/CO₂/risk + disaster-aware), `co2 = dist×factor×load`, Pareto `Cheapest/Fastest/Greenest`, supply chain twin |
| **Community** | `REPORT→PENDING→COMMUNITY VERIFIED (2 confirms + evidence + geo/time + no fraud)→OFFICIAL VERIFIED`, photo hash `SHA-256` + pHash duplicate, evidence chain |
| **Governance** | `PROVINCE→COMMUNE→VILLAGE` hierarchy, RBAC scope-aware (frontend hiding ≠ security), delegation/temporary/emergency, audit |
| **Digital Twin** | States `CURRENT/HISTORICAL/FORECAST/SIMULATED/TARGET/ACTUAL`, 12 layers (Forest, Fire, Flood, Carbon…), time machine 2018→2030, side-by-side |
| **Simulation** | What-if natural language → scenario (BASELINE/MODERATE/SEVERE/EXTREME), cascading `Flood→Road→Farm→Logistics`, scenario scorecard 9 metrics |
| **Master AI** | Goal-based planning, task DAG, AgentRegistry (8 agents), Event Bus idempotency, Impact Cascade, Priority Engine, Mission/Task, Learning Loop |
| **Dashboard** | Live Map (MapLibre), EcoGL Score 88.4, 8 KPIs, Risk Trend, AI Insights 89% + evidence, Alerts unified prioritized, Command Center, Leaderboard, Reports (DRAFT) |

---

## AI Agents (Sec2,9)

| Agent | Capabilities | Model | Input | Output |
|---|---|---|---|---|
| **ForestGuard** | `forest_change_detection, vegetation_analysis` | `v1.0` | geometry, dates, cloud% | risk 0–100 + confidence + `forest_risk` |
| **DisasterGuard** | `fire/flood/landslide/drought/heat` | `v1.0` | temp, rainfall, slope, elevation | score + `Potential Flood Risk` wording |
| **CarbonGuard** | `carbon_stock, carbon_change` | `v1.0` | forest area, NDVI | `Estimated Carbon` |
| **EUDRGuard** | `eudr_readiness, traceability` | `v1.0` | lot_id | readiness + flags |
| **GreenRouteAgent** | `route_optimization, co2` | `v1.0` | origin/dest/weights | `best` + alternatives |
| **PredictiveEcoAgent** | `forecast 24h/3d/7d/30d` | `v1.0` | historical | `Risk Index` vs `Forecast` |
| **MasterAgent** | `planning, delegation, synthesis` | `v1.0` | goal | plan DAG + recommendation |

All agents expose `status, last_run, input/output, confidence, data_sources, model_version, error handling`. Kill-switch `POST /api/agents/{agent}/toggle` pauses without breaking verified data.

---

## Data Sources & GEE

| Source | Provider | Integration |
|---|---|---|
| **Sentinel-2** | `COPERNICUS/S2_SR_HARMONIZED` (config single source) | `EarthEngineService.get_imagery()` |
| **Landsat** | `LANDSAT/LC08/C02/T1_L2` fallback | same interface |
| **Weather** | `WeatherAdapter` | Disaster inputs |
| **GIS** | `OSM/PostGIS` | Spatial ops |
| **Community** | `Community Report` | `UNTRUSTED USER CONTENT` sanitized |

**GEE auth:** `GEE_PROJECT_ID | GEE_SERVICE_ACCOUNT | GEE_PRIVATE_KEY | GEE_KEY_FILE` via env. `GET /api/earth-engine/status` → `{"connected":true}` or `{"connected":false,"reason":"NOT_CONFIGURED"}`. App boots with `MockEarthEngineService` (deterministic RNG) and displays **`DEMO DATA` / `GEE CONFIGURATION REQUIRED`** instead of crashing. Frontend never downloads full imagery — NDVI computed server-side on GEE.

---

## Installation

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env   # edit
# DATABASE_URL=sqlite:///./ecogl.db (dev) / postgresql+psycopg2://... (prod PostGIS)
# GEE_* (optional), DEMO_MODE=true, APP_ENV=development
python -c "from app.database import init_db; init_db()"
python -c "from app.seed import seed_demo; seed_demo()"  # Gia Lai hierarchy + demo farms
uvicorn app.main:app --reload --port 8000
# docs: http://localhost:8000/docs
# health: http://localhost:8000/api/health
```

### Frontend

```bash
cd frontend
npm install
echo "VITE_API_BASE=http://localhost:8000" > .env
npm run dev    # http://localhost:5173
npm run build  # dist/ 83KB CSS + 1.5MB JS
```

### Database (PostGIS production)

```sql
CREATE DATABASE ecogl;
CREATE EXTENSION postgis;
-- indexes: administrative_unit_id, geometry (GIST), timestamp, risk_score, status
```

---

## Environment Variables

| Var | Required | Example | Description |
|---|---|---|---|
| `DATABASE_URL` | yes | `postgresql://user:pass@localhost:5432/ecogl` | SQLAlchemy URL |
| `GEE_PROJECT_ID` | no | `my-gee-project` | For GEE real mode |
| `GEE_SERVICE_ACCOUNT` | no | `...@...iam.gserviceaccount.com` | |
| `GEE_PRIVATE_KEY` | no | `-----BEGIN PRIVATE KEY-----` | Escaped `\n` supported |
| `GEE_KEY_FILE` | no | `/secrets/gee.json` | Alternative to private key |
| `SECRET_KEY` | yes | `change-me` | JWT |
| `DEMO_MODE` | no | `true` | Tags all responses `DEMO / SIMULATED` |
| `APP_ENV` | no | `development\|staging\|production\|demo` | Config toggle |

`.env.example` is committed; `.env` is gitignored. Never commit `.env`, `credentials.json`, or `ecogl.db`.

---

## Database

Migration: `app.database.Base.metadata.create_all(bind=engine)` (Alembic scaffold present). Seed creates Gia Lai Province → Xã A/B → Thôn 1/2 polygons + 4 monitored areas + vehicle `81A-12345`. Partition by `tenant/province/time` ready for multi-province.

---

## Development

```bash
# backend
pytest -q                          # 16 tests
$env:PYTHONPATH="backend"; python -m pytest backend/tests -v

# frontend
npm run lint
npm run build
```

---

## Demo Mode

`DEMO_MODE=true` (default). All AI outputs carry `"origin":"DEMO / SIMULATED"` and UI shows amber `DEMO DATA` badge; GEE shows `○ GEE temporarily unavailable — Showing last successful analysis`. Demo flow (3 min):

```
Forest anomaly → AI risk HIGH (Map) → Community 📷 fire image → 2 confirms → COMMUNITY VERIFIED → Admin alert → View Evidence → Run Scenario (Rainfall +20%) → Logistics Route B -18% CO₂ → Approve → Mission → Commune Tasks → Field evidence → Verified
```

`POST /api/demo/run` triggers 15-step orchestrated demo; `POST /api/demo/reset` clears demo without touching production.

---

## Testing

- **Unit:** 8 Phase1 (GEE interface, dataset B8/B4, providers) + 8 Phase2-9 (fire→disaster, EUDR, logistics, predictive, twin, master)
- **Integration:** `/api/forest/monitor` → `PENDING` → `COMMUNITY VERIFIED` (2 confirms) → `OFFICIAL VERIFIED`
- **Security:** cross-commune 403, duplicate confirmation 400, rate limit 60/min 429
- **Performance target:** dashboard <2-3s cached, map progressive, AI jobs background (never on request thread) — verified via `pytest -q` and `npm run build`.

---

## Deployment

```bash
# docker example
docker build -t ecogl:1.0 -f backend/Dockerfile .
docker run -e DATABASE_URL -e GEE_PROJECT_ID -p 8000:8000 ecogl:1.0
# frontend
npm run build && npx serve dist -l 3000
# env separation: development|staging|production|demo
```

---

## Git Release

```bash
git tag -a v1.0.0 -m "EcoGL 1.0 — Initial Release"
git push origin master --tags
# ZIP: EcoGL-1.0-Final.zip via kho_luu_tru/
```

Current: `v1.0.0` points to `Phase9` + UI merge (9 tags: `phase1-ai-ready` → `phase9-twin` + `v1.0.0`).

---

## Known Limitations

- GEE real mode requires credentials; without them system runs deterministic mock (clearly labeled).
- `earthengine-api` + `geemap` are optional deps — not needed for Demo; real NDVI requires `ee.Initialize`.
- Map clustering not yet paginating >10k features — viewport loading recommended for >5k markers.
- `dist` 1.5MB — code-split via `import()` recommended for production.
- PostGIS not enforced on SQLite dev DB — production must use `geoalchemy2` + `GIST`.
- AI recommendations are **draft, not official** — require `POST /api/approvals/{id}/approve` + audit.

---

## EcoGL Loop

```
DATA → AI DETECTION → RISK → VERIFICATION → HUMAN DECISION → ACTION → RESULT → AI LEARNING → DATA
```

> *“EcoGL không chỉ biết Gia Lai đang xảy ra chuyện gì. EcoGL dự báo, mô phỏng, đề xuất và theo dõi kết quả — để chính quyền quyết định sớm hơn, chính xác hơn và xanh hơn.”*
