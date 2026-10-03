export type TruthfulFireAlert = {
  id: string
  hotspot_id?: string | null
  lat: number
  lon: number
  village?: string | null
  commune?: string | null
  location?: { province?: string | null; district?: string | null; commune?: string | null; verified_by_boundary: boolean; province_verified_by_boundary?: boolean }
  villageReference?: { name: string; commune?: string | null; distance_km?: number | null } | null
  distance_km?: number | null
  acq_date?: string | null
  acq_time?: string | null
  confidence?: string | number | null
  level?: string | null
  status?: string | null
  source?: string | null
  sourceStatus?: string | null
  satellite?: string | null
  instrument?: string | null
  eventId?: string
  evidence?: Record<string, boolean | null>
  communityReportCount?: number | null
  communityReports?: Array<Record<string, any>>
  aiAnalysis?: Record<string, unknown> | null
  verification?: { verified: boolean; verified_by?: string | null; verified_at?: string | null; method?: string | null }
  timeline?: Array<{ time?: string; event?: string; source?: string }>
  raw?: Record<string, any>
}

export const FIRE_EVENT_STATUSES = [
  'NGHI_NGO', 'DANG_XAC_MINH', 'DA_XAC_NHAN', 'DANG_XU_LY', 'DA_KIEM_TRA', 'DONG_SU_CO',
] as const
export type FireEventStatus = typeof FIRE_EVENT_STATUSES[number]

export function isLiveSourceStatus(value: unknown): boolean {
  const text = typeof value === 'string' ? value.trim().toUpperCase() : ''
  return text === 'LIVE' || text === 'CACHED' || text === 'STALE'
}

export function hasRealCoordinates(alert: Record<string, any> | null | undefined): boolean {
  if (!alert || typeof alert !== 'object') return false
  const lat = asFiniteNumber(alert.latitude ?? alert.lat ?? alert.fire_latitude ?? alert.latitude_deg)
  const lon = asFiniteNumber(alert.longitude ?? alert.lon ?? alert.fire_longitude ?? alert.longitude_deg)
  return lat !== null && lon !== null
}

export function getFireMarkerCoordinates(alert: Record<string, any> | null | undefined): { lat: number; lon: number } | null {
  if (!alert || typeof alert !== 'object') return null
  const lat = asFiniteNumber(alert.latitude)
  const lon = asFiniteNumber(alert.longitude)
  if (lat === null || lon === null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null
  return { lat, lon }
}

export function getCommunityReportCoordinates(report: Record<string, any> | null | undefined): { lat: number; lon: number } | null {
  if (!report || typeof report !== 'object') return null
  const lat = asFiniteNumber(report.location?.latitude)
  const lon = asFiniteNumber(report.location?.longitude)
  if (lat === null || lon === null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null
  return { lat, lon }
}

export function findAlertAtExactCoordinates(alerts: Record<string, any>[], coordinates: { lat: number; lon: number }): Record<string, any> | undefined {
  return alerts.find((alert) => {
    const point = getFireMarkerCoordinates(alert)
    return point?.lat === coordinates.lat && point.lon === coordinates.lon
  })
}

export function hasFieldPhoto(value: unknown): boolean {
  if (!value) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') {
    const keys = ['url', 'photo_url', 'image_url', 'path', 'src']
    return keys.some((key) => typeof (value as Record<string, any>)[key] === 'string' && (value as Record<string, any>)[key].trim().length > 0)
  }
  return false
}

export function hasBurnedArea(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0
  if (typeof value === 'string') {
    const num = Number(value.replace(',', '.').trim())
    return Number.isFinite(num) && num > 0
  }
  if (value && typeof value === 'object') {
    const area = (value as Record<string, any>).area_ha ?? (value as Record<string, any>).burned_area_ha ?? (value as Record<string, any>).value
    return hasBurnedArea(area)
  }
  return false
}

export function getAlertEventIdentity(raw: Record<string, any> | null | undefined, fallbackIndex = 0): string {
  if (!raw || typeof raw !== 'object') return `fire-${fallbackIndex}`
  const candidates = [raw.event_id, raw.hotspot_id, raw.id, raw.alert_id]
  const first = candidates.find((value) => typeof value === 'string' && value.trim().length > 0)
  if (typeof first === 'string' && first.trim().length > 0) return first

  const lat = asFiniteNumber(raw.latitude ?? raw.lat ?? raw.fire_latitude ?? raw.latitude_deg)
  const lon = asFiniteNumber(raw.longitude ?? raw.lon ?? raw.fire_longitude ?? raw.longitude_deg)
  if (lat !== null && lon !== null) return `fire-${lat.toFixed(5)}-${lon.toFixed(5)}`
  return `fire-${fallbackIndex}`
}

export function formatAdministrativeLocation(location: TruthfulFireAlert['location']): string {
  if (!location) return 'Chưa xác định được địa giới từ dữ liệu hiện có.'
  const verified = [
    ...(location.verified_by_boundary ? [location.commune, location.district] : []),
    ...(location.province_verified_by_boundary ? [location.province] : []),
  ].filter(Boolean)
  return verified.join(', ') || 'Chưa xác định được địa giới từ dữ liệu hiện có.'
}

export function resolveFireEventStatus(
  status: unknown,
  verification: TruthfulFireAlert['verification'],
  communityReportCount: number | null = null,
): FireEventStatus {
  const candidate = typeof status === 'string' && FIRE_EVENT_STATUSES.includes(status as FireEventStatus)
    ? status as FireEventStatus
    : 'NGHI_NGO'
  if (candidate === 'NGHI_NGO') return candidate
  if (candidate === 'DANG_XAC_MINH') return (communityReportCount ?? 0) > 0 ? candidate : 'NGHI_NGO'
  const persistedVerification = verification?.verified === true
    && Boolean(verification.verified_by?.trim())
    && Boolean(verification.verified_at?.trim())
    && Boolean(verification.method?.trim())
  return persistedVerification ? candidate : 'NGHI_NGO'
}

export function fireEventDetailPath(eventId: string): string {
  return `/events/${encodeURIComponent(eventId)}`
}

export function fireEventMapPath(eventId: string): string {
  return `/?event=${encodeURIComponent(eventId)}`
}

export function findFireEventById(events: Record<string, any>[], eventId: string): Record<string, any> | undefined {
  return events.find((event) => event.event_id === eventId || event.hotspot_id === eventId)
}

export function fireEventMapTarget(event: Record<string, any> | undefined): Record<string, any> | null {
  if (!event || !event.detection || typeof event.detection !== 'object') return null
  const coordinates = getFireMarkerCoordinates(event.detection)
  if (!coordinates) return null
  return {
    ...event,
    ...event.detection,
    hotspot_id: event.hotspot_id || event.event_id,
    latitude: coordinates.lat,
    longitude: coordinates.lon,
    location: event.location,
    village_reference: event.village_reference,
    source_details: { provider: event.detection.source, status: event.detection.source_status },
    distance_km: event.village_reference?.distance_km ?? null,
  }
}

function asFiniteNumber(value: unknown): number | null {
  const num = typeof value === 'string' ? Number(value.replace(',', '.')) : Number(value)
  return Number.isFinite(num) ? num : null
}

export function normalizeFireAlert(raw: Record<string, any> | null | undefined, fallbackIndex = 0): TruthfulFireAlert | null {
  if (!raw || typeof raw !== 'object') return null

  const eventRaw = raw.event && typeof raw.event === 'object' ? raw.event : raw
  const detection = eventRaw.detection && typeof eventRaw.detection === 'object' ? eventRaw.detection : raw
  const lat = asFiniteNumber(raw.latitude ?? detection.latitude ?? raw.lat ?? raw.fire_latitude ?? raw.latitude_deg)
  const lon = asFiniteNumber(raw.longitude ?? detection.longitude ?? raw.lon ?? raw.fire_longitude ?? raw.longitude_deg)
  if (lat === null || lon === null) return null

  const locationRaw = eventRaw.location ?? raw.location
  const verifiedByBoundary = locationRaw?.verified_by_boundary === true
  const location = {
    province: locationRaw?.province_verified_by_boundary === true && typeof locationRaw.province === 'string' ? locationRaw.province : null,
    district: verifiedByBoundary && typeof locationRaw.district === 'string' ? locationRaw.district : null,
    commune: verifiedByBoundary && typeof locationRaw.commune === 'string' ? locationRaw.commune : null,
    verified_by_boundary: verifiedByBoundary,
    province_verified_by_boundary: locationRaw?.province_verified_by_boundary === true,
  }
  const referenceRaw = eventRaw.village_reference ?? raw.village_reference
  const villageReference = referenceRaw && typeof referenceRaw.name === 'string'
    ? {
        name: referenceRaw.name,
        commune: typeof referenceRaw.commune === 'string' ? referenceRaw.commune : null,
        distance_km: asFiniteNumber(referenceRaw.distance_km),
      }
    : null
  const village = villageReference?.name ?? null
  const commune = location.commune
  const level = typeof raw.level === 'string' && raw.level.trim() ? raw.level.trim() : null

  const eventId = typeof eventRaw.event_id === 'string' && eventRaw.event_id.trim()
    ? eventRaw.event_id
    : getAlertEventIdentity(raw, fallbackIndex)
  const verificationRaw = eventRaw.verification && typeof eventRaw.verification === 'object' ? eventRaw.verification : null
  const verification = {
    verified: verificationRaw?.verified === true,
    verified_by: typeof verificationRaw?.verified_by === 'string' ? verificationRaw.verified_by : null,
    verified_at: typeof verificationRaw?.verified_at === 'string' ? verificationRaw.verified_at : null,
    method: typeof verificationRaw?.method === 'string' ? verificationRaw.method : null,
  }
  const communityReportCount = Number.isInteger(eventRaw.community_report_count)
    ? Math.max(0, eventRaw.community_report_count)
    : null
  const time = typeof detection.acq_time === 'string' ? detection.acq_time.match(/^(\d{2})(\d{2})$/) : null
  const timeline = Array.isArray(eventRaw.timeline)
    ? eventRaw.timeline.filter((item: any) => item && typeof item.time === 'string' && typeof item.event === 'string')
    : detection.acq_date && time
      ? [{ time: `${detection.acq_date}T${time[1]}:${time[2]}:00Z`, event: 'NASA FIRMS phát hiện điểm nhiệt', source: 'NASA FIRMS' }]
      : []

  return {
    id: eventId,
    eventId,
    hotspot_id: typeof eventRaw.hotspot_id === 'string' ? eventRaw.hotspot_id : typeof raw.hotspot_id === 'string' ? raw.hotspot_id : eventId,
    lat,
    lon,
    village,
    commune,
    location,
    villageReference,
    distance_km: asFiniteNumber(raw.distance_km ?? raw.distanceKm ?? raw.distance_km_km ?? raw.distance),
    acq_date: detection.acq_date ?? raw.acq_date ?? raw.acquired_at ?? raw.detected_at ?? raw.time ?? raw.date ?? null,
    acq_time: typeof detection.acq_time === 'string' ? detection.acq_time : null,
    confidence: detection.confidence ?? raw.confidence ?? raw.conf ?? null,
    level,
    status: resolveFireEventStatus(eventRaw.status, verification, communityReportCount),
    source: typeof detection.source === 'string' ? detection.source : typeof raw.source_details?.provider === 'string' ? raw.source_details.provider : 'NASA FIRMS',
    sourceStatus: detection.source_status ?? raw.source_details?.status ?? null,
    satellite: typeof detection.satellite === 'string' ? detection.satellite : null,
    instrument: typeof detection.instrument === 'string' ? detection.instrument : null,
    evidence: eventRaw.evidence && typeof eventRaw.evidence === 'object' ? eventRaw.evidence : null,
    communityReportCount,
    communityReports: Array.isArray(eventRaw.community_reports) ? eventRaw.community_reports : [],
    aiAnalysis: eventRaw.ai_analysis && typeof eventRaw.ai_analysis === 'object' ? eventRaw.ai_analysis : null,
    verification,
    timeline,
    raw: raw as Record<string, any>,
  }
}

export function extractFireAlerts(payload: any): TruthfulFireAlert[] {
  if (!payload) return []
  if (!Array.isArray(payload) && payload.status !== undefined && !isLiveSourceStatus(payload.status)) return []

  const list = Array.isArray(payload)
    ? payload
    : Array.isArray(payload.events)
      ? payload.events
      : Array.isArray(payload.alerts)
      ? payload.alerts
      : Array.isArray(payload.fires)
        ? payload.fires
        : []

  return list
    .map((item: Record<string, any>, index: number) => normalizeFireAlert(item, index))
    .filter((item: TruthfulFireAlert | null): item is TruthfulFireAlert => Boolean(item))
}

export function buildEventListFromAlerts(alerts: any): any[] {
  const sourceStatus = !Array.isArray(alerts) && typeof alerts?.status === 'string' ? alerts.status : null
  return extractFireAlerts(alerts)
    .map((alert) => {
      const detection = {
        source: alert.source || 'NASA FIRMS',
        source_status: alert.sourceStatus || sourceStatus,
        latitude: alert.lat,
        longitude: alert.lon,
        acq_date: alert.acq_date,
        acq_time: alert.acq_time,
        confidence: alert.confidence,
        satellite: alert.satellite,
        instrument: alert.instrument,
      }
      const status = resolveFireEventStatus(alert.status, alert.verification, alert.communityReportCount)
      return {
        id: getAlertEventIdentity(alert.raw ?? alert),
        event_id: alert.eventId || alert.id,
        hotspot_id: alert.hotspot_id || alert.id,
        title: `Phát hiện điểm nhiệt · ${alert.eventId || alert.id}`,
        place: formatAdministrativeLocation(alert.location),
        status,
        source: detection.source,
        sourceStatus: detection.source_status || 'MISSING',
        lat: alert.lat,
        lon: alert.lon,
        acq_date: alert.acq_date,
        acq_time: alert.acq_time,
        timeISO: alert.timeline?.[0]?.time || null,
        location: alert.location,
        villageReference: alert.villageReference,
        distanceKm: alert.villageReference?.distance_km ?? null,
        detection,
        evidence: alert.evidence || { firms: isLiveSourceStatus(detection.source_status), sentinel2: null, sentinel1: null, weather: null, field_photo: null, community_report: null },
        community_report_count: alert.communityReportCount,
        community_reports: alert.communityReports || [],
        ai_analysis: alert.aiAnalysis,
        verification: alert.verification,
        timeline: alert.timeline || [],
        level: status,
        score: null,
      }
    })
}
