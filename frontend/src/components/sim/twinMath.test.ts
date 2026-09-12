import { describe, expect, it } from 'vitest'
import { aoiRadiusKm, BAND_COLORS_3D, isCanopyPixel, lonLatToTile, metersPerPixel, slopeAt, STEP_COLORS_3D, terrariumToHeight, tileToLonLat, toLocal } from './twinMath'

describe('twinMath (3D scene helpers)', () => {
  it('aoi radius clamps to 1–3km', () => {
    expect(aoiRadiusKm([])).toBe(1)
    expect(aoiRadiusKm([{ length_km: 0.4 }])).toBe(1)
    expect(aoiRadiusKm([{ length_km: 7.5 }])).toBe(3)
    expect(aoiRadiusKm([{ length_km: 2 }])).toBeCloseTo(1.5)
  })
  it('tile round-trips around Gia Lai', () => {
    const t = lonLatToTile(108.41, 13.85, 13)
    const c = tileToLonLat(t.x + 0.5, t.y + 0.5, 13)
    expect(Math.abs(c.lon - 108.41)).toBeLessThan(0.05)
    expect(Math.abs(c.lat - 13.85)).toBeLessThan(0.05)
  })
  it('terrarium decodes sea level and Everest sane', () => {
    expect(terrariumToHeight(128, 0, 0)).toBe(0)
    expect(terrariumToHeight(159, 64, 0)).toBe(8000)
  })
  it('metersPerPixel sane at lat 14 z13', () => {
    expect(metersPerPixel(14, 13)).toBeGreaterThan(15)
    expect(metersPerPixel(14, 13)).toBeLessThan(22)
  })
  it('toLocal origin maps to zero, east positive', () => {
    const o = { lon: 108, lat: 14 }
    expect(toLocal(108, 14, o)).toEqual({ x: 0, z: -0 })
    expect(toLocal(108.01, 14, o).x).toBeGreaterThan(900)
  })
  it('canopy proxy flags green pixels only', () => {
    expect(isCanopyPixel(60, 140, 50)).toBe(true)
    expect(isCanopyPixel(150, 140, 130)).toBe(false)
    expect(isCanopyPixel(40, 50, 120)).toBe(false)
  })
  it('slopeAt flat grid is zero, cliff is steep', () => {
    const flat = new Float32Array(9).fill(100)
    expect(slopeAt(flat, 3, 1, 1, 10)).toBe(0)
    const cliff = new Float32Array([0, 0, 0, 0, 0, 100, 0, 0, 0])
    expect(slopeAt(cliff, 3, 1, 1, 10)).toBeGreaterThan(1)
  })
  it('band/step colors cover every status', () => {
    for(const b of ['SAFE', 'WATCH', 'THREATENED', 'CRITICAL']) expect(BAND_COLORS_3D[b]).toMatch(/^#/)
    for(const h of [0, 1, 3, 6]) expect(STEP_COLORS_3D[h]).toMatch(/^#/)
  })
})
