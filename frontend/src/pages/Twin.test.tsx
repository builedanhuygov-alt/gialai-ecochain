import { describe, expect, it } from 'vitest'
import { fmtClock, pickForest, riskTone } from './Twin'

describe('pickForest', () => {
  it('reads forest index, SIMULATED A-shape, else null (never guesses)', () => {
    expect(pickForest({ forest: 92 })).toBe(92)
    expect(pickForest({ A: 85 })).toBe(85)
    expect(pickForest(77)).toBe(77)
    expect(pickForest({})).toBeNull()
    expect(pickForest(null)).toBeNull()
    expect(pickForest({ forest: NaN })).toBeNull()
    expect(pickForest('92')).toBeNull()
  })
})

describe('riskTone', () => {
  it('maps bands', () => {
    expect(riskTone(90)).toBe('#EF4444')
    expect(riskTone(75)).toBe('#F97316')
    expect(riskTone(50)).toBe('#F59E0B')
    expect(riskTone(10)).toBe('#22C55E')
  })
})

describe('fmtClock', () => {
  it('formats HH:MM:SS', () => {
    expect(fmtClock(1789268114000)).toMatch(/^\d{2}:\d{2}:\d{2}$/)
  })
})
