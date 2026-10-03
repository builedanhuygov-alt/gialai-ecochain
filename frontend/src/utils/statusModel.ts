export type SystemStatus = 'CHECKING' | 'LIVE' | 'DEGRADED' | 'OFFLINE'
export type DataSourceKind = 'LOADING' | 'FIRMS_LIVE' | 'FIRMS_CACHE' | 'FIRMS_STALE' | 'DEMO' | 'FALLBACK' | 'UNAVAILABLE'

export function systemStatusFromHealth(backendUp: boolean | null, sourceStatuses: unknown[] = []): SystemStatus {
  if (backendUp === null) return 'CHECKING'
  if (backendUp === false) return 'OFFLINE'
  const liveish = sourceStatuses
    .map(value => String(value || '').toUpperCase())
    .filter(value => value === 'LIVE' || value === 'CACHED' || value === 'STALE' || value === 'DEMO')
  if (liveish.length === 0) return 'DEGRADED'
  if (liveish.every(value => value === 'LIVE')) return 'LIVE'
  return 'DEGRADED'
}

export function dataSourceFromStatus(status: unknown, demoMode = false): DataSourceKind {
  if (demoMode) return 'DEMO'
  const text = String(status || '').trim().toUpperCase()
  if (!text || text === 'LOADING' || text === 'ĐANG TẢI') return 'LOADING'
  if (text === 'LIVE') return 'FIRMS_LIVE'
  if (text === 'CACHED') return 'FIRMS_CACHE'
  if (text === 'STALE') return 'FIRMS_STALE'
  if (text === 'DEMO' || text === 'DEMO DATA') return 'DEMO'
  if (text === 'CONFIGURATION_REQUIRED' || text === 'FALLBACK') return 'FALLBACK'
  return 'UNAVAILABLE'
}

export function systemStatusLabel(status: SystemStatus): string {
  if (status === 'CHECKING') return 'ĐANG KIỂM TRA'
  if (status === 'LIVE') return 'LIVE'
  if (status === 'DEGRADED') return 'DEGRADED'
  return 'OFFLINE'
}

export function dataSourceLabel(kind: DataSourceKind): string {
  if (kind === 'LOADING') return 'ĐANG TẢI'
  if (kind === 'FIRMS_LIVE') return 'FIRMS LIVE'
  if (kind === 'FIRMS_CACHE') return 'FIRMS CACHE'
  if (kind === 'FIRMS_STALE') return 'FIRMS STALE'
  if (kind === 'DEMO') return 'DEMO'
  if (kind === 'FALLBACK') return 'FIRMS FALLBACK'
  return 'FIRMS UNAVAILABLE'
}

export function coverageWord(kind: DataSourceKind): { word: string; color: string } {
  if (kind === 'DEMO') return { word: 'DEMO', color: '#F59E0B' }
  if (kind === 'FIRMS_LIVE') return { word: 'FIRMS LIVE', color: '#10B981' }
  if (kind === 'FIRMS_CACHE' || kind === 'FIRMS_STALE') return { word: dataSourceLabel(kind), color: '#D97706' }
  if (kind === 'LOADING') return { word: 'ĐANG TẢI', color: '#64748B' }
  if (kind === 'FALLBACK') return { word: 'FIRMS FALLBACK', color: '#D97706' }
  return { word: 'THIẾU NGUỒN FIRMS', color: '#EF4444' }
}

export function countLabel(status: unknown, count: number): string {
  const text = String(status || '').toUpperCase()
  if (text === 'LOADING' || text === 'ĐANG TẢI') return '…'
  const kind = dataSourceFromStatus(status)
  if (kind === 'FIRMS_LIVE' || kind === 'FIRMS_CACHE' || kind === 'FIRMS_STALE' || kind === 'DEMO') return String(count)
  return '—'
}

export const KPI_DEFINITIONS: Record<string, { definition: string; source: string }> = {
  firms: {
    definition: 'Tổng điểm nóng vệ tinh NASA FIRMS trong vùng/thời gian đang chọn. Không đồng nghĩa cháy đã xác nhận.',
    source: 'NASA FIRMS (VIIRS/MODIS) qua /api fire/hotspots',
  },
  signals: {
    definition: 'Tín hiệu đang nằm trong workflow xác minh (theo dõi, điều tra, cộng đồng). Có thể ít hơn tổng hotspot FIRMS.',
    source: 'NASA FIRMS + /api/villages/fire-alert',
  },
  incidents: {
    definition: 'Sự cố đang xử lý trong hệ thống điều hành, không phải mọi điểm nóng vệ tinh.',
    source: 'API incidents',
  },
  alerts: {
    definition: 'Cảnh báo vận hành đang ACTIVE (cấp cháy, rủi ro), khác với hotspot FIRMS.',
    source: 'API alerts',
  },
  wind: {
    definition: 'Tốc độ gió tại điểm quan trắc thời tiết đang dùng cho khu vực.',
    source: 'Open-Meteo / API weather',
  },
}
