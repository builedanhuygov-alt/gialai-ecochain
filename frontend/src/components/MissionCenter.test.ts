import { describe, expect, it } from 'vitest'
import {
  DEMO_INCIDENTS, filterIncidents, fmtAgo, fmtNum, riskTone, sortIncidents,
} from './MissionCenter'
import type { Incident } from './MissionCenter'

const mk = (o: Partial<Incident> & { id: string }): Incident => ({
  title: 'T', area: 'A', forest: 'F', sev: 'LOW', status: 'MONITORING', live: false,
  areaHa: 1, spreadMMin: 1, temp: 28, humidity: 50, windKmh: 8, windDir: 'N',
  personnel: 0, vehicles: 0, drones: 0, riskScore: 10, factors: [],
  detectedAt: 0, updatedAt: 0, source: 'S', timeline: [], ai: { text: 't', confidence: 50, reason: 'r' },
  ...o,
})

describe('DEMO_INCIDENTS', () => {
  it('covers required severities with spec IDs', () => {
    const ids = DEMO_INCIDENTS.map(i => i.id)
    expect(ids).toContain('IA-0926-014')
    expect(ids).toContain('IA-0926-011')
    expect(ids).toContain('IA-0926-009')
    expect(ids).toContain('IA-0926-006')
    expect(new Set(DEMO_INCIDENTS.map(i => i.sev)).size).toBeGreaterThanOrEqual(3)
  })
})

describe('filterIncidents', () => {
  const list = [
    mk({ id: 'a', title: 'Chay rung Ia Mor', area: 'Ia Mor', sev: 'CRITICAL', status: 'LIVE' }),
    mk({ id: 'b', title: 'Diem nhiet An Khe', area: 'An Khe', sev: 'MEDIUM', status: 'MONITORING' }),
  ]
  it('filters by severity, status, area, query', () => {
    expect(filterIncidents(list, { q: '', sev: 'CRITICAL', status: 'ALL', area: 'ALL' })).toHaveLength(1)
    expect(filterIncidents(list, { q: '', sev: 'ALL', status: 'MONITORING', area: 'ALL' })).toHaveLength(1)
    expect(filterIncidents(list, { q: '', sev: 'ALL', status: 'ALL', area: 'An Khe' })).toHaveLength(1)
    expect(filterIncidents(list, { q: 'ia-0926', sev: 'ALL', status: 'ALL', area: 'ALL' })).toHaveLength(0)
    expect(filterIncidents(list, { q: 'an khe', sev: 'ALL', status: 'ALL', area: 'ALL' })).toHaveLength(1)
  })
})

describe('sortIncidents', () => {
  const list = [
    mk({ id: 'a', sev: 'LOW', riskScore: 90, detectedAt: 3 }),
    mk({ id: 'b', sev: 'CRITICAL', riskScore: 10, detectedAt: 1 }),
  ]
  it('severity first, then risk', () => {
    expect(sortIncidents(list, 'sev')[0].id).toBe('b')
    expect(sortIncidents(list, 'risk')[0].id).toBe('a')
    expect(sortIncidents(list, 'new')[0].id).toBe('a')
  })
})

describe('riskTone / fmtAgo / fmtNum', () => {
  it('maps score bands', () => {
    expect(riskTone(90)).toBe('CRITICAL')
    expect(riskTone(75)).toBe('HIGH')
    expect(riskTone(50)).toBe('MEDIUM')
    expect(riskTone(10)).toBe('LOW')
  })
  it('formats relative time', () => {
    const now = 1000000000000
    expect(fmtAgo(now - 10000, now)).toBe('vừa xong')
    expect(fmtAgo(now - 5 * 60000, now)).toBe('5 phút trước')
    expect(fmtAgo(now - 3 * 3600000, now)).toBe('3 giờ trước')
  })
  it('formats numbers', () => {
    expect(fmtNum(28.44)).toBe('28.4')
  })
})
