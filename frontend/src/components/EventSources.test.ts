import { describe, expect, it } from 'vitest'
import { countSourcesByType, getEventSources, isSafeHttpUrl } from './EventSources'

describe('getEventSources', () => {
  it('returns only verified-URL sources for known incidents', () => {
    const v = getEventSources('vung-chua-0827')
    expect(v).toHaveLength(3)
    expect(v.every(s => s.url.startsWith('https://'))).toBe(true)
    expect(v.every(s => s.relation === 'DIRECT')).toBe(true)
  })
  it('returns single source for cat-thanh', () => {
    expect(getEventSources('cat-thanh-133ha')).toHaveLength(1)
  })
  it('returns [] for events without verifiable links (never invents)', () => {
    expect(getEventSources('phu-my-dong-0721')).toEqual([])
    expect(getEventSources('hoai-an-0823')).toEqual([])
    expect(getEventSources('no-such-id')).toEqual([])
    expect(getEventSources(123)).toEqual([])
  })
  it('every entry has full provenance fields, no empty URL/title', () => {
    for (const id of ['vung-chua-0827', 'cat-thanh-133ha']) {
      for (const s of getEventSources(id)) {
        expect(s.publisher.length).toBeGreaterThan(0)
        expect(s.title.length).toBeGreaterThan(0)
        expect(s.url.length).toBeGreaterThan(0)
        expect(s.matchReason.length).toBeGreaterThan(0)
      }
    }
  })
})

describe('countSourcesByType', () => {
  it('groups OFFICIAL vs NEWS honestly', () => {
    expect(countSourcesByType(getEventSources('vung-chua-0827'))).toEqual({ NEWS: 2, OFFICIAL: 1 })
  })
})

describe('isSafeHttpUrl', () => {
  it('allows http/https only', () => {
    expect(isSafeHttpUrl('https://example.com/a')).toBe(true)
    expect(isSafeHttpUrl('http://example.com')).toBe(true)
    expect(isSafeHttpUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeHttpUrl('data:text/html,x')).toBe(false)
    expect(isSafeHttpUrl('/relative/path')).toBe(false)
    expect(isSafeHttpUrl(null)).toBe(false)
    expect(isSafeHttpUrl(42)).toBe(false)
  })
})
