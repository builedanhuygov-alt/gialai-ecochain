import { describe, expect, it } from 'vitest'
import {
  alertSev, bandText, buildDecisions, buildHierarchy, buildInterpretation, buildRiskSignals,
  classifyEvent, confidenceBasis, fmtInt, isPendingProposal, normalizeStatus, sortAlerts,
  timeOf, timeSec, windDir,
} from './CommandCenter'

describe('bandText', ()=>{
  it('maps levels to bands', ()=>{
    expect(bandText('V')).toBe('RỦI RO CAO')
    expect(bandText('IV')).toBe('RỦI RO CAO')
    expect(bandText('III')).toBe('RỦI RO TRUNG BÌNH')
    expect(bandText('II')).toBe('RỦI RO THẤP')
    expect(bandText('I')).toBe('RỦI RO THẤP')
    expect(bandText(null)).toBe('CHƯA XÁC ĐỊNH')
    expect(bandText(undefined)).toBe('CHƯA XÁC ĐỊNH')
  })
})

describe('windDir', ()=>{
  it('maps degrees to compass', ()=>{
    expect(windDir(0)).toBe('N')
    expect(windDir(45)).toBe('NE')
    expect(windDir(180)).toBe('S')
    expect(windDir(360)).toBe('N')
  })
  it('returns MISSING for non-numbers', ()=>{
    expect(windDir(null)).toBe('MISSING')
    expect(windDir(undefined)).toBe('MISSING')
    expect(windDir(NaN)).toBe('MISSING')
  })
})

describe('fmtInt', ()=>{
  it('rounds finite numbers, MISSING otherwise', ()=>{
    expect(fmtInt(3.7)).toBe('4')
    expect(fmtInt(null)).toBe('MISSING')
    expect(fmtInt(undefined)).toBe('MISSING')
    expect(fmtInt('x')).toBe('MISSING')
  })
})

describe('classifyEvent', ()=>{
  it('routes by keywords', ()=>{
    expect(classifyEvent('FIRMS hotspot detected', 'fires')).toBe('FIRMS')
    expect(classifyEvent('wind updated', 'weather')).toBe('WEATHER')
    expect(classifyEvent('risk recalculated', 'ai')).toBe('AI')
    expect(classifyEvent('user login', 'auth')).toBe('SYSTEM')
    expect(classifyEvent(null, null)).toBe('SYSTEM')
  })
})

describe('normalizeStatus', ()=>{
  it('normalizes lifecycle words', ()=>{
    expect(normalizeStatus('LIVE')).toBe('LIVE')
    expect(normalizeStatus('live')).toBe('LIVE')
    expect(normalizeStatus('CACHED')).toBe('CACHED')
    expect(normalizeStatus('DEMO')).toBe('DEMO')
    expect(normalizeStatus('DEMO DATA')).toBe('DEMO')
    expect(normalizeStatus('STALE')).toBe('STALE')
    expect(normalizeStatus('MISSING')).toBe('MISSING')
    expect(normalizeStatus('weird')).toBe('UNAVAILABLE')
    expect(normalizeStatus(null)).toBe('UNAVAILABLE')
  })
})

describe('timeOf', ()=>{
  it('formats clock time', ()=>{
    expect(timeOf('2026-09-12T10:30:00')).toBe('10:30')
    expect(timeOf(null)).toBe('')
  })
})

describe('timeSec', ()=>{
  it('formats unix seconds, null when not a timestamp', ()=>{
    const s = timeSec(1789268114)
    expect(s).toMatch(/^\d{2}:\d{2}:\d{2}$/)
    expect(timeSec(null)).toBeNull()
    expect(timeSec('x')).toBeNull()
    expect(timeSec(-5)).toBeNull()
  })
})

describe('confidenceBasis', ()=>{
  it('counts engine inputs only, never invents', ()=>{
    expect(confidenceBasis(['terrain', 'community'], 0)).toEqual(
      { evaluated: 5, available: 3, stale: 0, missing: ['terrain', 'community'] })
    expect(confidenceBasis([], 1)).toEqual(
      { evaluated: 5, available: 5, stale: 1, missing: [] })
    expect(confidenceBasis(null, 0)).toEqual(
      { evaluated: 5, available: 5, stale: 0, missing: [] })
  })
})

describe('buildRiskSignals', ()=>{
  const base = {
    firmsCount: 0, firmsStatus: 'LIVE' as const,
    wind: 17.7, temp: 34, humidity: 30, wxStatus: 'LIVE' as const,
    ndvi: 0.52, ndviStatus: 'CACHED' as const, proposals: 3,
  }
  it('builds 4 observed signals from real values', ()=>{
    const sigs = buildRiskSignals(base)
    expect(sigs).toHaveLength(4)
    expect(sigs[0]).toEqual({ n: '01', source: 'FIRMS', value: 'No active hotspot', status: 'LIVE' })
    expect(sigs[1].value).toContain('17.7 km/h')
    expect(sigs[2]).toEqual({ n: '03', source: 'NDVI', value: '0.52', status: 'CACHED' })
    expect(sigs[3].value).toContain('3 proposals')
  })
  it('never invents values for missing inputs', ()=>{
    const sigs = buildRiskSignals({
      firmsCount: null, firmsStatus: 'UNAVAILABLE',
      wind: null, temp: null, humidity: null, wxStatus: 'UNAVAILABLE',
      ndvi: null, ndviStatus: 'UNAVAILABLE', proposals: null,
    })
    expect(sigs.every(s => s.value === null)).toBe(true)
  })
  it('marks DEMO fetches as SIMULATED, not live counts', ()=>{
    const sigs = buildRiskSignals({ ...base, firmsCount: 2, firmsStatus: 'DEMO' })
    expect(sigs[0].value).toBe('SIMULATED')
    expect(sigs[0].status).toBe('DEMO')
  })
})

describe('buildInterpretation', ()=>{
  it('extracts driver + engine factors, null when absent', ()=>{
    expect(buildInterpretation(null)).toBeNull()
    expect(buildInterpretation({})).toBeNull()
    const out = buildInterpretation({
      forecast_rating: { major_risk_driver: 'Dry fuel' },
      factors: { 'Fuel Dryness': '+30%', Wind: '+10%' },
    })
    expect(out?.driver).toBe('Dry fuel')
    expect(out?.factors).toEqual([['Fuel Dryness', '+30%'], ['Wind', '+10%']])
  })
  it('drops MISSING driver', ()=>{
    expect(buildInterpretation({ forecast_rating: { major_risk_driver: 'MISSING' }, factors: {} })?.driver).toBeNull()
  })
})

describe('alertSev/sortAlerts', ()=>{
  it('ranks CRITICAL first without inventing levels', ()=>{
    expect(alertSev({ level: 'V' })).toBe('CRITICAL')
    expect(alertSev({ level: 'CRITICAL' })).toBe('CRITICAL')
    expect(alertSev({ level: 'IV' })).toBe('HIGH')
    expect(alertSev({ level: 'III' })).toBe('MEDIUM')
    expect(alertSev({ level: 'II' })).toBe('LOW')
    expect(alertSev({})).toBe('LOW')
    expect(alertSev(null)).toBe('LOW')
    const sorted = sortAlerts([{ level: 'II' }, { level: 'V' }, { level: 'IV' }])
    expect(sorted.map((a: any) => a.level)).toEqual(['V', 'IV', 'II'])
    expect(sortAlerts(null)).toEqual([])
  })
})

describe('isPendingProposal', ()=>{
  it('only flags actionable proposals', ()=>{
    expect(isPendingProposal({ status: 'PENDING' })).toBe(true)
    expect(isPendingProposal({ status: 'COMMUNITY_VERIFIED' })).toBe(false)
    expect(isPendingProposal({ status: 'REJECTED' })).toBe(false)
    expect(isPendingProposal(null)).toBe(false)
  })
})

describe('buildDecisions', ()=>{
  it('derives decisions from real state only', ()=>{
    expect(buildDecisions([], [], '')).toEqual([])
    const d = buildDecisions(
      [{ id: 'a', title: 'Fire', level: 'V' }],
      [{ status: 'PENDING' }, { status: 'VERIFIED' }],
      '',
    )
    expect(d).toHaveLength(2)
    expect(d[0].sev).toBe('CRITICAL')
    expect(d[0].action.kind).toBe('drawer')
    expect(d[1].action.kind).toBe('link')
    const planned = buildDecisions([{ id: 'a', title: 'Fire', level: 'V' }], [], 'a')
    expect(planned[0].detail).toContain('Đang có kế hoạch')
  })
})

describe('buildHierarchy', ()=>{
  it('summarizes NOW/NEXT/MONITOR honestly', ()=>{
    const h = buildHierarchy([{ level: 'V' }, { level: 'II' }], [{ status: 'PENDING' }], 2)
    expect(h.now).toContain('01')
    expect(h.next).toHaveLength(2)
    expect(h.monitor).toHaveLength(1)
    expect(buildHierarchy([], [], 0)).toEqual({ now: null, next: [], monitor: [] })
  })
})
