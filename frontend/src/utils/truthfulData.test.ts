import { describe, expect, it } from 'vitest'
import {
  normalizeFireAlert,
  extractFireAlerts,
  buildEventListFromAlerts,
  isLiveSourceStatus,
  hasRealCoordinates,
  hasFieldPhoto,
  hasBurnedArea,
  getAlertEventIdentity,
  getFireMarkerCoordinates,
  getCommunityReportCoordinates,
  findAlertAtExactCoordinates,
  formatAdministrativeLocation,
  resolveFireEventStatus,
  fireEventDetailPath,
  fireEventMapPath,
  findFireEventById,
  fireEventMapTarget,
} from './truthfulData'

describe('truthful data handling', () => {
  it('keeps real coordinates from the backend and ignores invented fallback values', () => {
    const alert = {
      hotspot_id: 'firms-123',
      latitude: 13.9,
      longitude: 108.3,
      village: 'Thôn A',
      commune: 'Xã A',
      distance_km: 2.4,
      acq_date: '2026-10-02',
      confidence: 'n',
      level: 'CẢNH BÁO',
    }

    const normalized = normalizeFireAlert(alert, 0)
    expect(normalized).not.toBeNull()
    expect(normalized?.lat).toBe(13.9)
    expect(normalized?.lon).toBe(108.3)
    expect(normalized?.status).toBe('NGHI_NGO')
  })

  it('returns no fake events when the backend provides no alerts', () => {
    expect(extractFireAlerts({ alerts: [] })).toEqual([])
    expect(buildEventListFromAlerts([])).toEqual([])
    expect(buildEventListFromAlerts({ status: 'UNAVAILABLE', alerts: [{ latitude: 13.9, longitude: 108.3 }] })).toEqual([])
  })

  it('parses the 10 live alerts from the backend without inventing new fields', () => {
    const payload = {
      status: 'LIVE',
      source: 'NASA FIRMS + Village delineation',
      alerts: [
        { hotspot_id: 'firms-1', latitude: 14.11535, longitude: 108.56094, village: 'Điểm Tơ Tung', commune: 'Xã Tơ Tung', acq_date: '2026-10-02', confidence: 'n', level: 'CẢNH BÁO' },
        { hotspot_id: 'firms-2', latitude: 13.86505, longitude: 108.62646, village: 'Thôn Trung Tâm', commune: 'Xã Ya Hội', acq_date: '2026-10-02', confidence: 'n', level: 'THEO DÕI' },
        { hotspot_id: 'firms-3', latitude: 14.09785, longitude: 108.99515, village: 'Điểm Kim Sơn', commune: 'Xã Kim Sơn', acq_date: '2026-10-02', confidence: 'n', level: 'THEO DÕI' },
        { hotspot_id: 'firms-4', latitude: 14.24297, longitude: 109.10039, village: 'Thôn 2', commune: 'Xã Ân Tường', acq_date: '2026-10-02', confidence: 'n', level: 'THEO DÕI' },
        { hotspot_id: 'firms-5', latitude: 13.66898, longitude: 109.0921, village: 'Phường Quy Nhơn', commune: 'Phường Quy Nhơn', acq_date: '2026-10-02', confidence: 'n', level: 'THEO DÕI' },
        { hotspot_id: 'firms-6', latitude: 13.74741, longitude: 109.02001, village: 'Phường Bình Định', commune: 'Phường Bình Định', acq_date: '2026-10-02', confidence: 'n', level: 'THEO DÕI' },
        { hotspot_id: 'firms-7', latitude: 14.06726, longitude: 109.19639, village: 'Điểm Phù Mỹ Nam', commune: 'Xã Phù Mỹ Nam', acq_date: '2026-10-02', confidence: 'n', level: 'THEO DÕI' },
        { hotspot_id: 'firms-8', latitude: 14.25269, longitude: 109.03144, village: 'Phường Bồng Sơn', commune: 'Phường Bồng Sơn', acq_date: '2026-10-02', confidence: 'n', level: 'THEO DÕI' },
        { hotspot_id: 'firms-9', latitude: 13.81923, longitude: 109.09583, village: 'Điểm Xuân An', commune: 'Xã Xuân An', acq_date: '2026-10-02', confidence: 'n', level: 'THEO DÕI' },
        { hotspot_id: 'firms-10', latitude: 13.89257, longitude: 108.72733, village: 'Điểm Vĩnh Quang', commune: 'Xã Vĩnh Quang', acq_date: '2026-10-02', confidence: 'n', level: 'THEO DÕI' },
      ],
    }

    const alerts = extractFireAlerts(payload)
    expect(alerts).toHaveLength(10)
    expect(alerts.every(a => hasRealCoordinates(a))).toBe(true)
    expect(alerts[0].hotspot_id).toBe('firms-1')
    expect(buildEventListFromAlerts(payload)[0].event_id).toBe('firms-1')
  })

  it('drops malformed alerts and does not render markers for missing coordinates', () => {
    expect(normalizeFireAlert({ latitude: 13.9 })).toBeNull()
    expect(normalizeFireAlert({ longitude: 108.3 })).toBeNull()
    expect(extractFireAlerts({ alerts: [{ latitude: 13.9 }] })).toEqual([])
    expect(getFireMarkerCoordinates({ village_coords: [108.3, 13.9] })).toBeNull()
  })

  it('uses FIRMS coordinates, never village reference coordinates, in map and event data', () => {
    const raw = {
      hotspot_id: 'firms-boundary-test',
      latitude: 14.11535,
      longitude: 108.56094,
      village_coords: [108.55, 14.1],
      fire_coords: [108.56094, 14.11535],
      village_reference: { name: 'Điểm Tơ Tung', commune: 'Xã Tơ Tung', distance_km: 2.1 },
      location: { province: 'Gia Lai', district: null, commune: 'Xã Kông Bơ La', verified_by_boundary: true },
      source_details: { provider: 'NASA FIRMS', status: 'LIVE' },
    }
    const mapCoordinates = getFireMarkerCoordinates(raw)
    const event = buildEventListFromAlerts([raw])[0]

    expect(mapCoordinates).toEqual({ lat: raw.latitude, lon: raw.longitude })
    expect(event.lat).toBe(mapCoordinates?.lat)
    expect(event.lon).toBe(mapCoordinates?.lon)
    expect(event.location.commune).toBe('Xã Kông Bơ La')
    expect(event.villageReference.name).toBe('Điểm Tơ Tung')
    expect(event.status).toBe('NGHI_NGO')
  })

  it('does not treat an unverified legacy commune as an administrative boundary', () => {
    const alert = normalizeFireAlert({ latitude: 13.9, longitude: 108.3, commune: 'Xã gần nhất' })
    expect(alert?.commune).toBeNull()
    expect(formatAdministrativeLocation(alert?.location)).toBe('Chưa xác định được địa giới từ dữ liệu hiện có.')
  })

  it('shows only the administrative levels whose own polygons verified them', () => {
    const alert = normalizeFireAlert({
      latitude: 15,
      longitude: 108,
      location: { province: 'Gia Lai', province_verified_by_boundary: true, commune: null, verified_by_boundary: false },
    })
    expect(alert?.commune).toBeNull()
    expect(formatAdministrativeLocation(alert?.location)).toBe('Gia Lai')
  })

  it('does not display a confirmed lifecycle status without persisted verification', () => {
    expect(resolveFireEventStatus('DA_XAC_NHAN', { verified: false })).toBe('NGHI_NGO')
    expect(resolveFireEventStatus('DANG_XAC_MINH', { verified: false })).toBe('NGHI_NGO')
    expect(resolveFireEventStatus('DANG_XAC_MINH', { verified: false }, 1)).toBe('DANG_XAC_MINH')
    expect(resolveFireEventStatus('DA_XAC_NHAN', {
      verified: true,
      verified_by: 'officer-1',
      verified_at: '2026-10-02T14:25:00Z',
      method: 'field inspection',
    })).toBe('DA_XAC_NHAN')
  })

  it('keeps unavailable evidence and AI analysis empty', () => {
    const event = buildEventListFromAlerts({
      status: 'LIVE',
      alerts: [{
        hotspot_id: 'firms-evidence-empty',
        latitude: 14.11535,
        longitude: 108.56094,
        event: {
          event_id: 'firms-evidence-empty',
          status: 'NGHI_NGO',
          detection: { source: 'NASA FIRMS', source_status: 'LIVE', latitude: 14.11535, longitude: 108.56094 },
          evidence: { firms: true, sentinel2: null, sentinel1: null, weather: null, field_photo: null, community_report: null },
          ai_analysis: null,
          verification: { verified: false, verified_by: null, verified_at: null, method: null },
          timeline: [],
        },
      }],
    })[0]
    expect(event.ai_analysis).toBeNull()
    expect(event.evidence.sentinel2).toBeNull()
    expect(event.evidence.community_report).toBeNull()
    expect(event.timeline).toEqual([])
    expect(event.status).toBe('NGHI_NGO')
  })

  it('uses the exact event identity for map/detail navigation', () => {
    expect(fireEventDetailPath('firms/abc')).toBe('/events/firms%2Fabc')
    expect(fireEventMapPath('firms/abc')).toBe('/?event=firms%2Fabc')
  })

  it('links map detections by exact coordinates, never by nearest event', () => {
    const alerts = [{ hotspot_id: 'firms-exact', latitude: 14.1, longitude: 108.5 }]
    expect(findAlertAtExactCoordinates(alerts, { lat: 14.1, lon: 108.5 })?.hotspot_id).toBe('firms-exact')
    expect(findAlertAtExactCoordinates(alerts, { lat: 14.10001, lon: 108.5 })).toBeUndefined()
  })

  it('builds the map target from an event ID and its exact detection coordinates', () => {
    const event = {
      event_id: 'firms-map-target',
      hotspot_id: 'firms-map-target',
      detection: { latitude: 14.11535, longitude: 108.56094, source_status: 'LIVE' },
      village_reference: { name: 'sample only', coordinates: [108.55, 14.1] },
    }
    const found = findFireEventById([event], 'firms-map-target')
    const target = fireEventMapTarget(found)
    expect(target?.hotspot_id).toBe('firms-map-target')
    expect(getFireMarkerCoordinates(target)).toEqual({ lat: 14.11535, lon: 108.56094 })
    expect(target?.latitude).not.toBe(event.village_reference.coordinates[1])
  })

  it('uses persisted report GPS as its own marker and never as FIRMS coordinates', () => {
    const report = { location: { latitude: 14.1, longitude: 108.4 } }
    expect(getCommunityReportCoordinates(report)).toEqual({ lat: 14.1, lon: 108.4 })
    expect(getFireMarkerCoordinates(report)).toBeNull()
  })

  it('treats unavailable Sentinel-2 and missing evidence as no-live data', () => {
    expect(isLiveSourceStatus('UNAVAILABLE')).toBe(false)
    expect(isLiveSourceStatus('LIVE')).toBe(true)
    expect(hasFieldPhoto(undefined)).toBe(false)
    expect(hasFieldPhoto('')).toBe(false)
    expect(hasBurnedArea(undefined)).toBe(false)
    expect(hasBurnedArea(null)).toBe(false)
    expect(getAlertEventIdentity({ hotspot_id: 'firms-42' })).toBe('firms-42')
  })
})
