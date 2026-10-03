import { getFireMarkerCoordinates } from '../utils/truthfulData'

export type ClusterFeatureCollection = {
  type: 'FeatureCollection'
  features: Array<{
    type: 'Feature'
    geometry: { type: 'Point'; coordinates: [number, number] }
    properties: { id: string; kind: 'alert' | 'hotspot'; artificial: boolean; lat: number; lon: number }
  }>
}

export function pointsToGeoJSON(rows: unknown[], kind: 'alert' | 'hotspot' = 'hotspot'): ClusterFeatureCollection {
  const features: ClusterFeatureCollection['features'] = []
  ;(Array.isArray(rows) ? rows : []).forEach((row, index) => {
    if (!row || typeof row !== 'object') return
    const point = getFireMarkerCoordinates(row as Record<string, unknown>)
    if (!point) return
    const rec = row as Record<string, any>
    const id = String(rec.hotspot_id || rec.event_id || rec.id || `${kind}-${index}`)
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [point.lon, point.lat] },
      properties: {
        id,
        kind,
        artificial: Boolean(rec.suspect_artificial),
        lat: point.lat,
        lon: point.lon,
      },
    })
  })
  return { type: 'FeatureCollection', features }
}

export const CLUSTER_LAYER_IDS = {
  clusters: 'firms-cluster-circles',
  count: 'firms-cluster-count',
  points: 'firms-cluster-points',
} as const

export const CLUSTER_SOURCE_ID = 'firms-cluster-src'
