# GIALAI EcoChain 1.0 — Cảnh báo sớm cháy rừng Gia Lai (Chư Prông - Kon Ka Kinh)

> **Tiêu điểm duy nhất:** Phát hiện sớm cháy rừng → Xác minh cộng đồng 2 lớp → Cảnh báo chính thức. Một câu trả lời rõ ràng cho Ban Giám khảo.

GIALAI EcoChain là **Hệ thống cảnh báo sớm cháy rừng cấp tỉnh** cho Gia Lai, tập trung duy nhất vào **rừng + thiên tai lửa rừng**. Luồng lõi: `Vệ tinh NDVI (Sentinel Hub) + Điểm nhiệt FIRMS → AI phát hiện → Cộng đồng xác minh (2 confirms + ảnh + geo/time) → Chính thức duyệt → Hành động`. Các domain phụ (carbon/EUDR/logistics) đã tách khỏi pitch để tránh pha loãng — nằm trong `docs/` nếu cần mở rộng sau.

**Status:** `v1.0.0` — Final Release — Backend Health `All-LIVE` (GEE/Sentinel/FIRMS/LLM) — Frontend Live Dashboard công khai — Vào là dùng được ngay (không cần cấu hình DEMO/REAL).

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

## Tính năng lõi duy nhất (đã thu hẹp - không liệt kê 8 domain)

| Thành phần | Chứng minh thật (không mock) |
|---|---|
| **Vệ tinh NDVI** | `GET /api/v1/satellite/ndvi?bbox=107.3,13.1,109.4,14.7` → Sentinel Hub Process API (OAuth2 `https://services.sentinel-hub.com/oauth/token`) — `backend/app/services/sentinel_service.py:1` |
| **Điểm nhiệt FIRMS** | `GET /api/v1/hotspots/live` → NASA FIRMS `MAP_KEY` (env) Area `107.3,13.1,109.4,14.7` — `backend/app/services/firms_service.py:1` |
| **GEE Gia Lai** | `GET /api/health/geospatial` → `gee LIVE` qua Service Account `gialai-507506` — `backend/app/core/config.py:32` |
| **LLM PCCC** | `GET /api/health/llm` → Gemini/Groq scenario generation — `backend/app/services/llm_service.py:1` + `Bộ Prompt tiêu biểu` trong `docs/prompts.md` |
| **Cộng đồng** | `REPORT→PENDING→COMMUNITY VERIFIED (2 confirms)→OFFICIAL VERIFIED (admin, identity từ JWT)` — `photo SHA-256` |
| **Dashboard** | 1 link công khai duy nhất `https://frontend-jz2k6tnx7-dan1775.vercel.app` — KPI từ API thật (`/api/forest/statistics`, `/api/risk/overview`, `/api/dashboard/green-economy`, `/api/alerts`) + badge `DỮ LIỆU TRỰC TIẾP / DEMO / NGOẠI TUYẾN` (`frontend/src/pages/Dashboard.tsx:1`; mockProvider chỉ là fallback ngoại tuyến có nhãn). API base tập trung duy nhất tại `API_BASE` (`frontend/src/services/api.ts:1`, fallback = backend production, không `localhost`) |

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

## Real Data Setup (Sec31)

### Google Earth Engine
1. Tạo project tại https://code.earthengine.google.com → tạo Service Account → download JSON key
2. Điền `.env`: `GEE_PROJECT_ID`, `GEE_SERVICE_ACCOUNT`, `GEE_PRIVATE_KEY` (hoặc `GEE_KEY_FILE=/secrets/gee.json`)
3. Kiểm tra: `GET /api/earth-engine/status` → `{"connected":true}`; nếu chưa có → `DEMO DATA` + `MockEarthEngineService` (NDVI, Sentinel-1 SAR VV/VH, Landsat 8/9, SRTM/NASADEM elevation/slope, Dynamic World/WorldCover land-cover) vẫn chạy

### NASA FIRMS
- Đăng ký MAP_KEY tại https://firms.modaps.eosdis.nasa.gov/api/area/ → `FIRMS_MAP_KEY` trong `.env`
- Backend proxy `GET /api/fire/firms?lat=13.9&lon=108.3` → trả `fires[]` với `brightness/confidence/satellite MODIS/VIIRS`; key chỉ ở backend, frontend hiển thị `LIVE`/`DEMO DATA`

### Copernicus Data Space (fallback)
- Tạo tài khoản https://dataspace.copernicus.eu/ → `COPERNICUS_CLIENT_ID/SECRET/TOKEN_URL`
- Kiến trúc `GEE Primary → failure → Copernicus fallback` (không hard-code provider)

### Weather (Open-Meteo) + NASA POWER
- Open-Meteo không cần key: `WeatherService` gọi `https://api.open-meteo.com/v1/forecast` qua `EcoGL Weather API` (`/api/weather/current|forecast`), backend cache 10 phút theo `lat/lon rounded + bucket`
- NASA POWER (`/api/weather/historical` → `/api/climate/power`) cho `historical, T2M/PRECTOTCORR, drought/agriculture baseline`, service riêng `NASAWeatherService`

### Mobile Location (BẮT BUỘC)
- Browser `navigator.geolocation.getCurrentPosition` khi user bấm `📍 Dùng vị trí của tôi`
- UX: `idle → prompt → locating (Detecting...) → granted (📍 Lat/Lon 2 số thập phân) / denied → "Location permission was denied..." / unsupported → fallback`
- Privacy: `location = session/local state`, chỉ gửi `lat/lon` tới `/api/weather/*` khi cần, không lưu DB, không track liên tục, hiển thị hint privacy trên `WeatherCard`
- HTTPS bắt buộc trên production (geolocation yêu cầu secure context), local `http://localhost` được phép

---

## Database

Migration: `app.database.Base.metadata.create_all(bind=engine)` (Alembic scaffold present). Seed creates Gia Lai Province → Xã A/B → Thôn 1/2 polygons + 4 monitored areas + vehicle `81A-12345`. Partition by `tenant/province/time` ready for multi-province.

---

## Development

```bash
# backend — 57 tests / 21 files (auth, RBAC/approve identity, feedback, search, rate-limit, GEE fallback, phases 2-9...)
$env:PYTHONPATH="backend"; $env:APP_ENV="test"; python -m pytest backend/tests -q

# frontend — 31 vitest (api client incl. dashboard endpoints + API_BASE guard, scope store, i18n) + build
cd frontend && npm test && npm run build
```
CI (`.github/workflows/ci.yml`) runs both on push/PR.

---

## Demo Mode

`DEMO_MODE=true` (default). All AI outputs carry `"origin":"DEMO / SIMULATED"` and UI shows amber `DEMO DATA` badge; GEE shows `○ GEE temporarily unavailable — Showing last successful analysis`. Demo flow (3 min):

```
Forest anomaly → AI risk HIGH (Map) → Community 📷 fire image → 2 confirms → COMMUNITY VERIFIED → Admin alert → View Evidence → Run Scenario (Rainfall +20%) → Logistics Route B -18% CO₂ → Approve → Mission → Commune Tasks → Field evidence → Verified
```

`POST /api/demo/run` triggers 15-step orchestrated demo; `POST /api/demo/reset` clears demo without touching production.

---

## Testing

- **Unit:** backend 57 tests / 21 files — Phase1 (GEE interface, dataset B8/B4, providers) + Phase2-9 (fire→disaster, EUDR, logistics, predictive, twin, master) + RBAC (official approve/verify require `admin`, actor identity from JWT; alert ack/verify/resolve require login). Frontend 31 vitest — api client incl. `forestStats`/`riskOverview` passthrough + `API_BASE` never-localhost guard, scope store, i18n.
- **Integration:** `/api/forest/monitor` → `PENDING` → `COMMUNITY VERIFIED` (2 confirms) → `OFFICIAL VERIFIED` (admin only)
- **Security:** cross-commune 403, duplicate confirmation 400, rate limit 60/min 429, unauthenticated approve/ack 401, non-admin official approve 403
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
- `earthengine-api` is an optional dep (lazy-imported; app boots without it) — `geemap` is NOT used anywhere in code. Real NDVI requires `ee.Initialize` with valid service-account credentials.
- Map clustering not yet paginating >10k features — viewport loading recommended for >5k markers.
- Bundle is code-split: routes via `lazy()` + vendor chunks (`vendor-map` maplibre ~969kB loads only on map routes; initial `index` ~41kB). maplibre stays heavy — consider vector-tile simplification for low-end devices.
- RBAC model is minimal but enforced server-side: official approve/verify = `admin` only, actor identity always from JWT (client-supplied `approved_by`/`actor_id` ignored); alert ack/verify/resolve require login. Roles today: `admin` (first registered user) + `viewer` — no province/commune identity verification yet.
- PostGIS not enforced on SQLite dev DB — production must use `geoalchemy2` + `GIST`.
- AI recommendations are **draft, not official** — require `POST /api/approvals/{id}/approve` (admin) + audit.

---

## EcoGL Loop

```
DATA → AI DETECTION → RISK → VERIFICATION → HUMAN DECISION → ACTION → RESULT → AI LEARNING → DATA
```

> *“EcoGL không chỉ biết Gia Lai đang xảy ra chuyện gì. EcoGL dự báo, mô phỏng, đề xuất và theo dõi kết quả — để chính quyền quyết định sớm hơn, chính xác hơn và xanh hơn.”*
