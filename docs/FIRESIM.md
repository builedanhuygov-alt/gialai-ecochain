# FireSim — Tactical Digital Twin & Decision Simulator

What-if Lab (slider+form) → 3D Interactive Wildfire Simulator.
Heuristic ELLIPTICAL_HEURISTIC_V1 (+scenario ROS factors, all published).
No fake physics, no probabilities, no mock GPS, no fake road network.

## Part A — Operational completion

### A1 Threatened Communities — no DB change
API `GET /api/communities/threatened` (exists, verified): commune +
population VERIFIED (dan_so 134/134) + earliest-step band + villages
ESTIMATED. FastAPI `villages.py`. PostGIS: `ST_Intersects(commune,
ST_GeomFromGeoJSON(step))`. React: FireSim impact card + community fills.
Perf: bbox-prefiltered intersect, cached shapes. Migration: none. Risk:
reference villages are not a census (labeled).

### A2 Contact Directory — no DB change
API `GET /api/assets/contacts` (exists): stations/water/towers/routes with
contact_person/phone/organization/verification_date, NULL when missing.
Migration: none. Risk: 28 hotline rows have phone but MISSING GPS (labeled).

### A3 Road Survey Readiness
DB: no new column; `seasonal_access` constrained to DRY_ONLY/YEAR_ROUND.
API: create/PATCH normalize legacy free-text via alias map, 400 otherwise.
FastAPI `assets.py::_seasonal_or_none`. PostGIS: none (text enum).
React Admin: select replaces free-text input. Perf: trivial. Migration:
existing rows keep legacy values until re-saved (read path tolerates any
string; write path canonicalizes — documented). Risk: legacy values visible
until rangers re-survey (no silent rewrite). Readiness: schema+API+UI done,
data pending field survey.

## Part B — Simulator (backend: `POST /api/simulate/fire`)

Single endpoint returns steps + ros/factors + wind_layer + communities +
villages + operational/water threats (colored) + route impacts + water
current-vs-simulated + impact panel. One round trip per slider change
(debounced 500ms client-side).

- B1 ellipses: server colors current🔴/+1h🟠/+3h🟡/+6h⚫; ROS factors published.
- B2 front: canvas overlay (~260 sprites), toggleable, auto-off on weak devices.
- B3 overlays: band→color SAFE blue/WATCH yellow/THREATENED orange/CRITICAL red.
- B4 routes: earliest containing step per vertex → color + "impacted in X hours".
- B5 water: current ETA/avail vs simulated band/avail + note.
- B6 wind: direction+speed payload; client draws rotated ➤ symbols (schematic).
- B7 impact: area, communes, water/stations/routes hit, per-step progression.
- B8 regen: `POST /api/v1/fires/response-plan` accepts `wind_speed_kmh` /
  `wind_direction_deg` overrides → spread/FWI/threats/plan regenerate, labeled
  `wind_source: "scenario override (simulator)"`.

DB changes: none (stateless; persistence via existing /api/scenarios).
PostGIS: intersect examples in postgis_init.sql (communes, routes min-hour).
Perf: 20-pt ellipses, bbox-prefiltered communes, photo counts skipped in sim
(static tiers), ~200ms server. Migration: additive only (new file + router
line). Risks: heuristic is NOT FARSITE (disclaimer every response); ROS caps
at 3.0; route measure is vertex-based until road network exists.

## Part C — Three.js architecture (decision: MapLibre-native)

`components/sim/FireSimLayers.tsx` = FireSimulationLayer orchestrator +
FireEllipseMesh / WindVectorMesh / ThreatenedAssetMesh / RouteImpactMesh /
ThreatenedCommunityMesh (GeoJSON sources, server-provided colors).
`FireFrontCanvas.tsx` = B2 particle overlay (canvas 2D, rAF, hidden-tab pause).
React-compatible (props + cleanup), MapLibre-compatible (sources/layers),
GPU-efficient (fill/circle/symbol layers; 260 canvas sprites), mobile
degradation (no community fills <640px, particles auto-off ≤4 cores /
reduced-motion, stacked layout).
Three.js migration trigger: ONLY if volumetric smoke/ember rendering becomes
an operational requirement — until then it adds ~600KB + battery cost for
zero decision value.

## Part D — Command Center integration

One sim change updates: ellipses, threats, routes, water, impact panel
(auto, debounced) + Response Plan + AI bulletin (RUN button, B8 overrides).
Command plan header links `🔥 Mô phỏng 3D → /firesim?lat=&lon=`; FireSim links
back to `/command`. Shared contracts: band colors, threat bands, viewer notes.

## Production risks & rollout

1. Slider spam → debounced + single endpoint; plan regen explicit (4-5s live fetch).
2. Commune geojson 836KB fetched once, desktop only.
3. Terrain DEM + Esri tiles are third-party (graceful fallback if blocked).
4. Heuristic misread as prediction → disclaimer on page + every response.
5. Rollout: deploy backend → frontend → run sim at Hội Sơn fire → compare plan
   vs live plan → train rangers on band colors, not on ellipse edges.
