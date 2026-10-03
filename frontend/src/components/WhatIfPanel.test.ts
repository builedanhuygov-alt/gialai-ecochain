import { describe, expect, it } from 'vitest'
import { ndviFromVegDry, rainfallFromDryDays, toCalculateBody } from './WhatIfPanel'

describe('WhatIfPanel mapping', () => {
  it('maps dry days to model rainfall explicitly', () => {
    expect(rainfallFromDryDays(0)).toBe(3)
    expect(rainfallFromDryDays(1)).toBe(0)
    expect(rainfallFromDryDays(30)).toBe(0)
  })
  it('maps vegetation dryness to NDVI in range', () => {
    expect(ndviFromVegDry(0)).toBe(0.7)
    expect(ndviFromVegDry(100)).toBe(0.1)
    expect(ndviFromVegDry(50)).toBe(0.4)
  })
  it('builds a numeric calculate body (no hidden strings)', () => {
    const b = toCalculateBody({ temperature: 38, humidity: 20, rain7d: 0, vegDry: 80, wind: 25, hotspotKm: 2, windDir: 90 })
    expect(b).toEqual({ temperature: 38, humidity: 20, rainfall: 0, wind_speed: 25,
      ndvi: 0.22, ndmi: 0.25, hotspots: [{ latitude: 0, longitude: 0 }] })
  })
  it('drops hotspot beyond 5 km', () => {
    const b = toCalculateBody({ temperature: 33, humidity: 45, rain7d: 10, vegDry: 50, wind: 12, hotspotKm: 12, windDir: 90 })
    expect(b.hotspots).toEqual([])
  })
})
