# Production Data Gaps (Module J) — snapshot 2026-09-12 (seed chuẩn)

Regenerate live: `GET /api/ops/gaps` (totals) + `GET /api/ops/consistency`
(join integrity). Numbers below are the fresh-seed baseline.

## MISSING GPS

- Stations/towers/watchtowers in DB: **0** (honest empty — nearest-station
  returns null + Admin prompt, never a guessed pin).
- Station registry CSV (hotline phones): **28 rows, all MISSING GPS** by
  construction — phones usable in directory (`PARTIAL`), GPS must be
  surveyed before ops use.
- Water: 16/16 VERIFIED coordinates.
- Action: GPS survey 28 registry points → POST /api/assets (keeps phones).

## MISSING CONTACTS

- Water: **16/16 thiếu contact_phone** (manager có đủ → directory PARTIAL).
- Stations DB: 0 rows → nothing to evaluate.
- Registry CSV: 28/28 có phone (PARTIAL — phone, no verification date).
- Action: PATCH water contact + verification_date → VERIFIED.

## MISSING ROAD CONDITIONS

- Routes in DB: **0** (no geometry, no condition, no surface — all MISSING).
- 1 water asset (Hồ Ia Hrung) honestly `road_access=false`.
- Enum enforced: GOOD/FAIR/POOR/BLOCKED, surface PAVED/GRAVEL/FOREST_ROAD/
  TRAIL, seasonal DRY_ONLY/YEAR_ROUND. API 400s anything else.
- Action: field survey per route (geometry + condition + surface + tons).

## MISSING VIEWERS

- streetview VERIFIED: 3/16 water (Biển Hồ, Plei Krông, Ialy).
- panoee: 0 tours. photos: 0 evidences on fresh seed (ESTIMATED tier only
  when field photos land within 1km). Remainder: satellite fallback.
- Verification rule: unlisted-domain URLs stay `field_check_required`;
  VERIFIED never shown without verification.

## NOT_CONFIGURED GEE / SENTINEL

- GEE: NOT_CONFIGURED (no service account in prod env) → satellite
  thumbnails return null, NDVI inputs MISSING, confidence lowered.
  Nothing mocked in its place.
- Sentinel: same status (shares the GEE pipeline switch).
- Investment prioritization: NOT_CONFIGURED (static Area A/B/C removed).
- Action: mount `gialai-key.json` + set GEE project env, or leave
  NOT_CONFIGURED (system degrades honestly).

## Consistency (Module G)

- `GET /api/ops/consistency` resolves every join key (water codes, village
  codes, alerts/proposals/incidents/warnings unit ids) against
  administrative_units. Fresh seed: all consistent except **1 commune
  without geometry** (GL-137 Thống Nhất — geometry-less by design until its
  polygon is sourced; documented, not hidden).

## Checklist nhập liệu (giữ từ OPERATIONAL_GAPS.md)

1. [ ] GPS 28 registry points 2. [ ] SĐT + ngày kiểm chứng hồ
3. [ ] Tuyến: geometry + condition + surface + tải trọng + mùa
4. [ ] Tour Panoee đầu tiên + streetview URLs 3 hồ đã flag
5. [ ] GEE service account 6. [ ] Re-run /api/ops/gaps + /api/ops/consistency
