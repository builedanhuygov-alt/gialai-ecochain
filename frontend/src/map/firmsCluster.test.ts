import { describe, expect, it } from 'vitest'
import { pointsToGeoJSON } from './firmsCluster'

describe('pointsToGeoJSON', () => {
  it('skips rows without FIRMS coordinates', () => {
    expect(pointsToGeoJSON([{ hotspot_id: 'x' }]).features).toHaveLength(0)
  })
  it('keeps FIRMS coordinates as the marker point', () => {
    const fc = pointsToGeoJSON([{ hotspot_id: 'firms-1', latitude: 13.9, longitude: 108.3 }])
    expect(fc.features).toHaveLength(1)
    expect(fc.features[0].geometry.coordinates).toEqual([108.3, 13.9])
    expect(fc.features[0].properties.id).toBe('firms-1')
  })
})
