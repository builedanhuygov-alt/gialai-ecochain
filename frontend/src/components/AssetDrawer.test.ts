import { describe, expect, it } from 'vitest'
import { groupNearby, haversineKm, stripHtml, GROUPS } from './AssetDrawer'

describe('AssetDrawer helpers (no new data, grouping only)', () => {
  it('haversine sane around Gia Lai', () => {
    expect(haversineKm(108.3, 13.9, 108.3, 13.9)).toBe(0)
    // ~11km per 0.1 degree longitude at lat 14
    expect(haversineKm(108.3, 13.9, 108.4, 13.9)).toBeGreaterThan(9)
    expect(haversineKm(108.3, 13.9, 108.4, 13.9)).toBeLessThan(13)
  })
  it('groups nearby by the 5 fixed groups, radius-capped', () => {
    const pools = [
      { group: 'Water', pts: [
        { key: 'water:1', icon: '🌊', name: 'Hồ gần', lon: 108.31, lat: 13.91 },
        { key: 'water:2', icon: '🌊', name: 'Hồ xa', lon: 109.5, lat: 14.5 },
      ] },
      { group: 'Stations', pts: [] },
    ]
    const g = groupNearby(108.3, 13.9, pools, 5, 3)
    expect(g.map(x=> x.group)).toEqual(['Water'])
    expect(g[0].items[0].name).toBe('Hồ gần')
    expect(g[0].items[0].distKm).toBeLessThanOrEqual(5)
  })
  it('exposes exactly the 5 brief groups vocabulary', () => {
    expect([...GROUPS]).toEqual(['Water', 'Stations', 'Routes', 'Communities', 'Historical'])
  })
  it('strips commune HTML directory to plain text (no tags rendered)', () => {
    expect(stripHtml('<p>+Ngô Xuân Hiếu<br> Chủ tịch UBND </p><p>0914032925</p>'))
      .toBe('+Ngô Xuân Hiếu Chủ tịch UBND 0914032925')
    expect(stripHtml(null)).toBe('')
    expect(stripHtml(undefined)).toBe('')
  })
})
