// Unified event model — presentation mapping over existing data only.
// (moved from the deleted legacy EventIntelligence page; covered by EventIntel.test.ts)
import { parseCoords, severityOf } from '../components/EventIntel'
import type { Severity } from '../components/EventIntel'

export type UEvt = {
  key: string; kind: 'hist' | 'live'; id: string | number;
  title: string; place: string; dates: string; level: string;
  score: number | null; sev: Severity; status: string;
  source: string; forces?: string; outcome?: string;
  lat: number | null; lon: number | null; timeISO: string | null;
  location?: { province?: string | null; district?: string | null; commune?: string | null; verified_by_boundary: boolean };
  villageReference?: { name: string; commune?: string | null; distance_km?: number | null } | null;
  distanceKm?: number | null;
}

export function buildUnified(hist: any[], items: any[]): UEvt[] {
  const out: UEvt[] = []
  for (const h of hist) {
    const c = parseCoords(h.place)
    out.push({
      key: `h-${h.id}`, kind: 'hist', id: h.id, title: h.title, place: h.place,
      dates: h.dates, level: h.level, score: typeof h.score === 'number' ? h.score : null,
      sev: severityOf(h.level, h.score), status: h.status || 'SỰ KIỆN THẬT', source: h.source,
      forces: h.forces, outcome: h.outcome,
      lat: c?.lat ?? null, lon: c?.lon ?? null, timeISO: null,
    })
  }
  for (const e of items) {
    out.push({
      key: `l-${e.id}`, kind: 'live', id: e.id,
      title: e.title,
      place: e.place, dates: e.acq_date || '', level: e.level,
      score: typeof e.score === 'number' ? e.score : null,
      sev: severityOf(e.level, e.score), status: e.status,
      source: `${e.source} · ${e.sourceStatus || 'MISSING'}`,
      lat: typeof e.lat === 'number' ? e.lat : null,
      lon: typeof e.lon === 'number' ? e.lon : null,
      timeISO: e.timeISO,
      location: e.location,
      villageReference: e.villageReference,
      distanceKm: e.distanceKm,
    })
  }
  return out
}

export function filterEvents(list: UEvt[], sev: 'ALL' | Severity): UEvt[] {
  return sev === 'ALL' ? list : list.filter(e => e.sev === sev)
}

export function sortEvents(list: UEvt[], mode: 'sev' | 'new'): UEvt[] {
  const arr = [...list]
  if (mode === 'new') {
    arr.sort((a, b) => {
      if (a.timeISO && b.timeISO) return +new Date(b.timeISO) - +new Date(a.timeISO)
      if (a.timeISO) return -1
      if (b.timeISO) return 1
      return (b.score ?? -1) - (a.score ?? -1)
    })
    return arr
  }
  arr.sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
  return arr
}
