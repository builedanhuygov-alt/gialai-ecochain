# Evidence Migration (Module I) — unified pipeline

## Current state (before)

- `POST /api/forest/proposals/{id}/photos` — real pipeline (bytes, thumbs,
  sha256 + perceptual hash, duplicate flag, geo check, serving URLs).
- `POST /api/citizen/report` — fake: in-memory `rep-<user>` id, nothing
  persisted, no photo path at all.
- Incident galleries, field observations — no pipeline.
- Each future module would have invented its own upload again.

## New state (after)

- `app/services/evidence.py` — `save_evidence()` / `get_evidence()` /
  `delete_evidence()` / `set_verification()` (+ `shape()` shared by every
  list/detail/gallery).
- `PhotoEvidence` += `source` (proposal/citizen/incident/field),
  `verification_status` (PENDING/VERIFIED/REJECTED), `capture_time`, `meta`.
  `is_duplicate`/`duplicate_of` unchanged (hash match, never silent delete).
- New `citizen_reports` table; `POST /api/citizen/report` persists and
  returns null evidence URLs until a real photo attaches via
  `POST /api/evidence` (multipart, source=citizen).
- New endpoints: `POST/GET/DELETE /api/evidence[/{id}]`,
  `PATCH /api/evidence/{id}/verify` (admin),
  `POST /api/incidents/{id}/evidence` (explicit link),
  `GET /api/incidents/{id}/gallery` (timeline + metadata + status).
- forest upload refactored to delegate (contract preserved + 2 new keys).

## Migration steps

1. Fresh SQLite: `create_all` (new tables/columns automatic).
2. Existing Postgres: run the `photo_evidences`/`citizen_reports` block in
   `backend/postgis_init.sql`. Existing rows default to
   source=proposal, verification_status=PENDING — correct because every
   legacy row came from the proposal uploader and was never reviewed.
3. Deploy backend. No frontend change required (shapes are additive;
   forest upload response keeps all old keys).
4. Backfill (optional): `PATCH /api/evidence/{id}/verify` per reviewed photo.

## Rollback plan

- Code: revert this commit; old forest route is self-contained (logic was
  moved, not deleted — restore from git).
- DB: new columns are nullable with defaults; old code ignores them.
  `citizen_reports` table stays unused. No data loss either direction.
- Contract risk: `GET /api/investment/priorities` changed list→dict and
  `POST /api/citizen/report` changed id format — both were fake outputs
  with no frontend consumer (verified by grep); test_phase6 updated.

## Risks

- Perceptual hash is a stub (`compute_perceptual_hash` documents it) —
  near-duplicates may miss; exact duplicates always caught by sha256.
- DB-stored bytes grow the database: 5MB cap + JPEG normalize mitigate;
  object storage is the documented next step, not this turn.
