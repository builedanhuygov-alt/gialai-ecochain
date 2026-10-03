import { describe, expect, it } from 'vitest'
import {
  countLabel, coverageWord, dataSourceFromStatus, dataSourceLabel,
  systemStatusFromHealth, systemStatusLabel,
} from './statusModel'

describe('systemStatusFromHealth', () => {
  it('stays CHECKING until the backend ping returns', () => {
    expect(systemStatusFromHealth(null)).toBe('CHECKING')
  })
  it('is OFFLINE only when the backend is down', () => {
    expect(systemStatusFromHealth(false, ['LIVE'])).toBe('OFFLINE')
  })
  it('is LIVE when the backend is up and sources are live', () => {
    expect(systemStatusFromHealth(true, ['LIVE', 'LIVE'])).toBe('LIVE')
  })
  it('is DEGRADED when the backend is up but a source is cached or missing', () => {
    expect(systemStatusFromHealth(true, ['LIVE', 'CACHED'])).toBe('DEGRADED')
    expect(systemStatusFromHealth(true, ['UNAVAILABLE'])).toBe('DEGRADED')
  })
})

describe('dataSourceFromStatus', () => {
  it('does not call a cache feed LIVE', () => {
    expect(dataSourceFromStatus('CACHED')).toBe('FIRMS_CACHE')
    expect(dataSourceFromStatus('LIVE')).toBe('FIRMS_LIVE')
    expect(dataSourceLabel('FIRMS_CACHE')).toBe('FIRMS CACHE')
  })
  it('marks demo mode separately from system LIVE', () => {
    expect(dataSourceFromStatus('LIVE', true)).toBe('DEMO')
    expect(coverageWord('UNAVAILABLE').word).toBe('THIẾU NGUỒN FIRMS')
  })
})

describe('countLabel', () => {
  it('never renders 0 while loading', () => {
    expect(countLabel('LOADING', 0)).toBe('…')
    expect(countLabel('UNAVAILABLE', 0)).toBe('—')
    expect(countLabel('LIVE', 0)).toBe('0')
  })
})

describe('systemStatusLabel', () => {
  it('uses short operator labels', () => {
    expect(systemStatusLabel('LIVE')).toBe('LIVE')
    expect(systemStatusLabel('DEGRADED')).toBe('DEGRADED')
    expect(systemStatusLabel('OFFLINE')).toBe('OFFLINE')
  })
})
