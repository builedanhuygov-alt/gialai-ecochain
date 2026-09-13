import { describe, expect, it } from 'vitest'
import { DEMO_REPORTS, sevOfConfidence, toVStatus, trustOf } from './Community'

describe('toVStatus', () => {
  it('maps API statuses without inventing states', () => {
    expect(toVStatus('OFFICIAL_VERIFIED', 0)).toBe('ĐÃ DUYỆT')
    expect(toVStatus('VERIFIED', 0)).toBe('ĐÃ DUYỆT')
    expect(toVStatus('COMMUNITY_VERIFIED', 2)).toBe('ĐÃ XÁC MINH')
    expect(toVStatus('REJECTED', 0)).toBe('BỊ TỪ CHỐI')
    expect(toVStatus('PENDING', 0)).toBe('CHỜ XÁC MINH')
    expect(toVStatus('PENDING', 1)).toBe('ĐANG XÁC MINH')
  })
})

describe('sevOfConfidence', () => {
  it('never escalates to CRITICAL from a number alone', () => {
    expect(sevOfConfidence(100)).toBe('HIGH')
    expect(sevOfConfidence(80)).toBe('HIGH')
    expect(sevOfConfidence(50)).toBe('MEDIUM')
    expect(sevOfConfidence(10)).toBe('LOW')
    expect(sevOfConfidence(undefined)).toBe('MEDIUM')
  })
})

describe('trustOf', () => {
  it('is deterministic and capped', () => {
    const a = trustOf({ status: 'PENDING', confirmations: 0, hasPhoto: false, source: 'Khác' })
    const b = trustOf({ status: 'OFFICIAL_VERIFIED', confirmations: 5, hasPhoto: true, source: 'Kiểm lâm' })
    expect(a).toBe(45)
    expect(b).toBeLessThanOrEqual(98)
    expect(b).toBeGreaterThan(a)
    expect(trustOf({ status: 'PENDING', confirmations: 100, hasPhoto: true, source: 'Kiểm lâm' })).toBeLessThanOrEqual(98)
  })
})

describe('DEMO_REPORTS', () => {
  it('has the 4 spec examples, all labeled demo-safe', () => {
    const ids = DEMO_REPORTS.map(d => d.id)
    expect(ids).toEqual(['FR-0926-014', 'FR-0926-011', 'FR-0926-009', 'FR-0926-007'])
    for (const d of DEMO_REPORTS) {
      expect(d.title.length).toBeGreaterThan(0)
      expect(d.area.length).toBeGreaterThan(0)
      expect(d.minsAgo).toBeGreaterThan(0)
    }
  })
})
