import { describe, expect, it } from 'vitest'
import { formatMetric } from './BacktestCard'

describe('BacktestCard formatMetric', () => {
  it('shows — for unknown metrics, never invents numbers', () => {
    expect(formatMetric(null)).toBe('—')
    expect(formatMetric(undefined)).toBe('—')
  })
  it('rounds real metrics to 2 decimals', () => {
    expect(formatMetric(0.5)).toBe('0.50')
    expect(formatMetric(0.3333)).toBe('0.33')
  })
})
