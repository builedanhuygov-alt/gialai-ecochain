import { describe, expect, it } from 'vitest'
import { rainfallFromDryDays, toCalculateBody } from './WhatIfPanel'

describe('WhatIfPanel mapping', () => {
  it('maps dry days to model rainfall explicitly', () => {
    expect(rainfallFromDryDays(0)).toBe(3)
    expect(rainfallFromDryDays(1)).toBe(0)
    expect(rainfallFromDryDays(30)).toBe(0)
  })
  it('builds a numeric calculate body (no hidden strings)', () => {
    const b = toCalculateBody({ temperature: 38, humidity: 20, dryDays: 5, wind: 25 })
    expect(b).toEqual({ temperature: 38, humidity: 20, rainfall: 0, wind_speed: 25 })
  })
})
