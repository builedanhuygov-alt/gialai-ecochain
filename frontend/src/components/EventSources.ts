// Event source registry — WILDFIRE INTELLIGENCE SYSTEM, PASS 3.
//
// Provenance rule (absolute): every entry below is transcribed VERBATIM from
// curated press references already present in the codebase
// (MapView HIST_FIRES press fields + EventIntelligence HISTORICAL source
// strings). No URL was guessed, no title invented, no date inferred.
// Entries whose press mention has NO URL are deliberately EXCLUDED
// (unverifiable link) — those events render NO RELATED SOURCES.
//
// Each entry was link-audited (HTTP 200) on 2026-09-13. Relevance is
// documented per entry (same place + same figures as the incident record).
// publishedAt stays null where the curation carries no date — the UI shows
// "ngày đăng chưa xác minh" instead of inventing one.

export type SourceType = 'OFFICIAL' | 'NEWS' | 'LOCAL AUTHORITY' | 'FORESTRY' | 'SATELLITE' | 'WEATHER'
export type Relevance = 'HIGH' | 'MEDIUM' | 'LOW'
export type Relation = 'DIRECT' | 'RELATED' | 'CONTEXT'

export type EventSource = {
  id: string
  eventId: string
  type: SourceType
  publisher: string
  title: string
  url: string
  publishedAt: string | null
  retrievedAt: string | null
  relevance: Relevance
  relation: Relation
  matchReason: string
}

const SOURCES: EventSource[] = [
  {
    id: 'src-vungchua-baogialai',
    eventId: 'vung-chua-0827',
    type: 'NEWS',
    publisher: 'Báo Gia Lai',
    title: 'Báo Gia Lai: 500 người dập cháy Quy Nhơn Nam',
    url: 'https://baogialai.com.vn/hon-500-nguoi-tham-gia-dap-tat-chay-rung-tai-phuong-quy-nhon-nam-post596298.html',
    publishedAt: null,
    retrievedAt: null,
    relevance: 'HIGH',
    relation: 'DIRECT',
    matchReason: 'Cùng địa điểm Quy Nhơn Nam/Vũng Chua, cùng lực lượng ~500 người với hồ sơ sự cố',
  },
  {
    id: 'src-vungchua-dcs',
    eventId: 'vung-chua-0827',
    type: 'OFFICIAL',
    publisher: 'Cổng ĐCS Gia Lai',
    title: 'Cổng ĐCS Gia Lai',
    url: 'https://gialai.dcs.vn/an-ninh-quoc-phong/-/view-content/609439/hon-500-nguoi-tham-gia-dap-tat-chay-rung-tai-phuong-quy-nhon-nam',
    publishedAt: null,
    retrievedAt: null,
    relevance: 'HIGH',
    relation: 'DIRECT',
    matchReason: 'Cổng chính thức, cùng vụ cháy Quy Nhơn Nam trong hồ sơ sự cố',
  },
  {
    id: 'src-vungchua-vietnamvn',
    eventId: 'vung-chua-0827',
    type: 'NEWS',
    publisher: 'Vietnam.vn',
    title: 'Vietnam.vn: giải cứu 2 người mắc kẹt',
    url: 'https://www.vietnam.vn/en/giai-cuu-hai-nguoi-mac-ket-tren-dinh-nui-trong-vu-chay-rung-o-quy-nhon',
    publishedAt: null,
    retrievedAt: null,
    relevance: 'HIGH',
    relation: 'DIRECT',
    matchReason: 'Cùng vụ cháy núi Quy Nhơn với hồ sơ sự cố',
  },
  {
    id: 'src-catthanh-baogialai',
    eventId: 'cat-thanh-133ha',
    type: 'NEWS',
    publisher: 'Báo Gia Lai',
    title: 'Báo Gia Lai: cháy 133ha Cát Thành',
    url: 'https://baogialai.com.vn/chay-133-ha-rung-trong-o-xa-cat-thanh-post520560.html',
    publishedAt: null,
    retrievedAt: null,
    relevance: 'HIGH',
    relation: 'DIRECT',
    matchReason: 'Cùng địa điểm Cát Thành/Núi Lỗ Gáo, cùng diện tích 133ha với hồ sơ sự cố',
  },
]

// Abstraction for the future source API: same signature the backend will
// implement (GET /api/events/:id/sources). Today it resolves locally;
// NOTHING here fabricates a response — unknown ids yield [].
export function getEventSources(eventId: string | number): EventSource[] {
  return SOURCES.filter(s => s.eventId === String(eventId))
}

export function countSourcesByType(list: EventSource[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const s of list) out[s.type] = (out[s.type] || 0) + 1
  return out
}

// External-URL gate: only http/https render as links. Everything else
// (javascript:, data:, relative) is rejected — never injected into href.
export function isSafeHttpUrl(url: unknown): boolean {
  if (typeof url !== 'string') return false
  const t = url.trim().toLowerCase()
  return t.startsWith('http://') || t.startsWith('https://')
}
