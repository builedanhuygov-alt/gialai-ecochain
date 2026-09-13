import { describe, expect, it } from 'vitest'
import { esriTileUrl, parseCoords, severityOf, tileXY } from './EventIntel'
import { buildUnified, filterEvents, sortEvents } from '../pages/EventIntelligence'

describe('severityOf', () => {
  it('maps CẤP bands first', () => {
    expect(severityOf('CẤP V', 10)).toBe('CRITICAL')
    expect(severityOf('CẤP IV', 10)).toBe('HIGH')
    expect(severityOf('CẤP III', 10)).toBe('MEDIUM')
    expect(severityOf('CRITICAL', null)).toBe('CRITICAL')
  })
  it('falls back to score cutoffs', () => {
    expect(severityOf('Theo dõi', 95)).toBe('CRITICAL')
    expect(severityOf('Theo dõi', 80)).toBe('HIGH')
    expect(severityOf('Theo dõi', 70)).toBe('MEDIUM')
    expect(severityOf('Theo dõi', 40)).toBe('LOW')
    expect(severityOf(null, null)).toBe('LOW')
  })
})

describe('parseCoords', () => {
  it('parses DMS from place strings', () => {
    const c = parseCoords('P. Ghềnh Ráng · 13°44′20″N 109°11′45″E')
    expect(c?.lat).toBeCloseTo(13.7389, 3)
    expect(c?.lon).toBeCloseTo(109.1958, 3)
  })
  it('returns null when absent', () => {
    expect(parseCoords('Xã Hoài Ân')).toBeNull()
    expect(parseCoords(null)).toBeNull()
  })
})

describe('tileXY / esriTileUrl', () => {
  it('computes slippy tiles (Gia Lai z12)', () => {
    // 109.1958E,13.7389N at z12 → x=3290, y=1890 (OSM slippy formula)
    expect(tileXY(13.7389, 109.1958, 12)).toEqual({ x: 3290, y: 1890 })
  })
  it('builds Esri URLs only', () => {
    const u = esriTileUrl(13.7389, 109.1958)
    expect(u).toBe('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/12/1890/3290')
  })
})

describe('buildUnified/filterEvents/sortEvents', () => {
  const hist = [{ id: 'a', title: 'A', place: 'X', dates: 'd', level: 'CẤP V', score: 92, forces: 'f', outcome: 'o', source: 's' }]
  const items = [{ id: 1, village: 'V', score: 70, time: '2026-09-01T00:00:00', status: 'LIVE', level: 'Theo dõi' }]
  it('unifies without inventing coords', () => {
    const u = buildUnified(hist, items)
    expect(u).toHaveLength(2)
    expect(u[0].lat).toBeNull()
    expect(u[1].sev).toBe('MEDIUM')
  })
  it('filters and sorts deterministically', () => {
    const u = buildUnified(hist, items)
    expect(filterEvents(u, 'CRITICAL')).toHaveLength(1)
    expect(filterEvents(u, 'ALL')).toHaveLength(2)
    expect(sortEvents(u, 'sev')[0].score).toBe(92)
  })
})
