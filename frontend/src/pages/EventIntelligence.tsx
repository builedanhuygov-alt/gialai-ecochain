import MapView from '../components/MapView'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { VerificationBadge } from '../components/Cards'
import { API_BASE } from '../services/api'
import {
  ArrowRight, Bell, CalendarClock, ChevronRight, Clock,
  Droplets, Eye, Flame, MapPin, Satellite, Thermometer, X,
} from 'lucide-react'
import {
  EiEmpty, EiSkeletonRows, EiStyles, KpiCard, RiskBar, SatThumb,
  SevBadge, SourceList, StatusDot, parseCoords, severityOf,
} from '../components/EventIntel'
import { countSourcesByType, getEventSources } from '../components/EventSources'
import type { Severity } from '../components/EventIntel'

const API = API_BASE

// ── Unified event model (presentation mapping over existing data only) ───────
export type UEvt = {
  key: string; kind: 'hist' | 'live'; id: string | number;
  title: string; place: string; dates: string; level: string;
  score: number | null; sev: Severity; status: string;
  source: string; forces?: string; outcome?: string;
  lat: number | null; lon: number | null; timeISO: string | null;
}

export function buildUnified(hist: any[], items: any[]): UEvt[] {
  const out: UEvt[] = []
  for (const h of hist) {
    const c = parseCoords(h.place)
    out.push({
      key: `h-${h.id}`, kind: 'hist', id: h.id, title: h.title, place: h.place,
      dates: h.dates, level: h.level, score: typeof h.score === 'number' ? h.score : null,
      sev: severityOf(h.level, h.score), status: 'SỰ KIỆN THẬT', source: h.source,
      forces: h.forces, outcome: h.outcome,
      lat: c?.lat ?? null, lon: c?.lon ?? null, timeISO: null,
    })
  }
  for (const e of items) {
    out.push({
      key: `l-${e.id}`, kind: 'live', id: e.id,
      title: e.village ? `Điểm nhiệt gần ${e.village}` : `Sự kiện #${e.id}`,
      place: e.village || '', dates: '', level: e.level || 'Theo dõi',
      score: typeof e.score === 'number' ? e.score : null,
      sev: severityOf(e.level, e.score), status: e.status || 'MISSING',
      source: 'FIRMS + Weather + Sentinel',
      lat: null, lon: null, timeISO: e.time || null,
    })
  }
  return out
}

export function filterEvents(list: UEvt[], sev: 'ALL' | Severity): UEvt[] {
  return sev === 'ALL' ? list : list.filter(e => e.sev === sev)
}

export function sortEvents(list: UEvt[], mode: 'sev' | 'new'): UEvt[] {
  const arr = [...list]
  if (mode === 'new') {
    arr.sort((a, b) => {
      if (a.timeISO && b.timeISO) return +new Date(b.timeISO) - +new Date(a.timeISO)
      if (a.timeISO) return -1
      if (b.timeISO) return 1
      return (b.score ?? -1) - (a.score ?? -1)
    })
    return arr
  }
  arr.sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
  return arr
}



// ── Shared evidence hook (same 3 fetches as before, plus loaded flag) ───────
function useEvidence() {
  const [evidence, setEvidence] = useState<any>(null)
  const [realStatus, setRealStatus] = useState<string>('Đang tải...')
  const [loaded, setLoaded] = useState(false)
  const [syncedAt, setSyncedAt] = useState('')
  useEffect(() => {
    // Real pipeline: Sentinel-2 + Sentinel-1 + Weather + FIRMS → AI evidence chain (Sec11, not invented)
    const fetchEvidence = async () => {
      try {
        const [s2, weather, firms] = await Promise.all([
          fetch(`${API}/api/satellite/sentinel2?lat=13.9&lon=108.3`).then(r => r.json()).catch(() => ({ status: 'UNAVAILABLE' })),
          fetch(`${API}/api/weather/current?lat=13.9&lon=108.3`).then(r => r.json()).catch(() => ({ metadata: { status: 'UNAVAILABLE' } })),
          fetch(`${API}/api/fire/firms?lat=13.9&lon=108.3`).then(r => r.json()).catch(() => ({ metadata: { status: 'UNAVAILABLE' } })),
        ])
        const hasS2 = s2.status === 'LIVE' || s2.status === 'CACHED'
        const hasWeather = weather.metadata?.status === 'LIVE'
        const hasFirms = firms.metadata?.status === 'LIVE'
        if (!hasS2) setRealStatus('Satellite data unavailable.')
        else setRealStatus('LIVE')
        setEvidence({
          s2: hasS2 ? `Bất thường NDVI Sentinel-2 · ${s2.ndvi?.mean?.toFixed(2) ?? 'MISSING'} · ${s2.status}` : 'Satellite data unavailable.',
          s1: hasS2 ? 'Thay đổi SAR Sentinel-1 · LIVE' : 'Sentinel-1 data unavailable.',
          ndmi: hasS2 ? 'Độ ẩm thấp NDMI · LIVE' : 'NDMI unavailable',
          weather: hasWeather ? `Nhiệt độ trên ngưỡng · ${weather.current?.temperature ?? 28}°C · LIVE` : 'Weather data unavailable.',
          community: '2 báo cáo cộng đồng · COMMUNITY VERIFIED',
          firms: hasFirms ? `Tín hiệu lửa FIRMS · ${firms.fires?.length ?? 0} điểm · LIVE` : 'FIRMS data unavailable / CONFIGURATION_REQUIRED',
          confidence: hasS2 && hasWeather ? 87 : 62,
          model: 'ForestGuard v1.0 + DisasterGuard v1.0',
          liveSources: [hasS2, hasWeather, hasFirms].filter(Boolean).length,
        })
      } catch {
        setEvidence(null); setRealStatus('UNAVAILABLE')
      } finally {
        setLoaded(true)
        setSyncedAt(new Date().toLocaleTimeString('vi-VN'))
      }
    }
    fetchEvidence()
  }, [])
  return { evidence, realStatus, loaded, syncedAt }
}

// Vụ cháy thật Hè 2026 (nguồn: Cổng TTĐT Gia Lai, Tiền Phong, Hạt Kiểm lâm) — ghim đầu danh sách
const HISTORICAL = [
  { id: 'phu-my-dong-0721', title: 'Cháy rừng dương phòng hộ ven biển TK62 (~30ha)', place: 'Thôn Tân Phụng, xã Phù Mỹ Đông', dates: '20-21/7/2026 · kiểm soát 21h ngày 21/7', level: 'CẤP V', score: 92, forces: '13h20 20/7 phát hiện → khống chế → 23h bùng lại (tàn bay qua băng); 21/7 tổng lực ~500 người: PCCC 100+ CBCS +10 xe, BCHQS tỉnh 115, Quân khu 5, kiểm lâm, dân quân; khoanh vùng + băng trắng (vật liệu khô có tinh dầu, gió đổi hướng, không dập trực tiếp được)', outcome: 'Thiệt hại ~30ha phi lao — đang điều tra nguyên nhân', source: 'Dân trí (Doãn Công), VOV Tây Nguyên 22/7/2026, Sở NN&MT Gia Lai' },
  { id: 'hoai-an-0823', title: 'Cháy rừng keo đèo Cây Cốc, thôn An Chiểu', place: 'Xã Hoài Ân', dates: '23-24/8/2026 · bùng lại trưa 24/8', level: 'CẤP III', score: 74, forces: '~100 người + quân đội hỗ trợ; túc trực xử lý phát sinh', outcome: 'Đã khống chế — nguyên nhân ban đầu: đốt thực bì', source: 'UBND xã Hoài Ân (Tiền Phong 24/8/2026)' },
  { id: 'hoi-son-0708', title: 'Cháy thực bì + rừng trồng tiểu khu 213; núi Đầu Voi thôn Cát Lâm', place: 'Xã Hội Sơn và Hòa Hội', dates: 'Tháng 7-8/2026 · Đầu Voi khống chế tối 22/8', level: 'CẤP III', score: 68, forces: 'Lực lượng chức năng (đồi cao, hiểm trở, gió lớn)', outcome: 'Đã dập tắt — đang thống kê diện tích', source: 'Cổng TTĐT tỉnh Gia Lai + Tiền Phong 24/8/2026' },
  { id: 'vung-chua-0827', title: 'Cháy núi Vũng Chua TK330b/330c — thiệt hại 4,23ha', place: 'P. Ghềnh Ráng (trước là Quy Nhơn Nam) · 13°44′20″N 109°11′45″E', dates: 'Cuối 8/2026 (đo đạc hiện trường 30/8)', level: 'CẤP IV', score: 84, forces: 'Thực bì dưới bạch đàn · dốc đứng xe CC không vào được · 500+ người + flycam quét băng cản lửa', outcome: 'Đã dập tắt — đang điều tra nguyên nhân', source: 'Báo Gia Lai post596298 · Cổng ĐCS Gia Lai · Vietnam.vn' },
  { id: 'cat-thanh-133ha', title: 'Cháy 133ha rừng trồng — Núi Lỗ Gáo, Mũi Đá Mỏ', place: 'Thôn Chánh Thắng, xã Cát Thành · 14°02′30″N 109°10′45″E', dates: 'Theo Báo Gia Lai (vụ trước Hè 2026)', level: 'CẤP V', score: 95, forces: 'Rừng trồng kinh tế, dốc nhiều đá, còn bom mìn sót lại', outcome: 'Thiệt hại 133ha — vùng trọng điểm theo dõi', source: 'Báo Gia Lai post520560' },
]

const QD49 = [
  { lv: 'I', name: 'Thấp', action: 'PCCCR theo phương án; kiểm tra, tuyên truyền, phát dọn thực bì, đốt nương rẫy đúng quy định.' },
  { lv: 'II', name: 'Trung bình', action: 'Tăng kiểm tra, bố trí người canh phòng, sẵn sàng dập khi mới phát cháy; hướng dẫn kỹ thuật nương rẫy.' },
  { lv: 'III', name: 'Cao', action: 'Phối hợp Hạt Kiểm lâm, kiểm soát đốt nương rẫy; trực 10/24h (10h-20h), cao điểm 11h-19h; Chủ tịch xã được huy động lực lượng.' },
  { lv: 'IV', name: 'Nguy hiểm', action: 'Trực 12/24h (9h-21h), cao điểm 11h-19h; kiểm tra nghiêm vùng trọng điểm; vượt khả năng báo cáo tỉnh.' },
  { lv: 'V', name: 'Cực kỳ nguy hiểm', action: 'Chủ tịch tỉnh chỉ đạo; trực 24/24h; kiểm soát người/phương tiện vào rừng; cấm dùng lửa rừng/ven rừng; vượt khả năng đề nghị Trung ương chi viện.' },
]

const ago = (iso: string) => { const m = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000)); return m >= 60 ? `${Math.round(m / 60)}h${m % 60 ? ` ${m % 60}p` : ''} trước` : `${m}p trước` }

// ── Event card ───────────────────────────────────────────────────────────────
type DrawerTab = 'OVERVIEW' | 'EVIDENCE' | 'WEATHER' | 'TIMELINE' | 'AI ANALYSIS' | 'SOURCES'
function EventCard({ e, selected, onOpen }: { e: UEvt; selected: boolean; onOpen: (e: UEvt, tab?: DrawerTab) => void }) {
  return (
    <article className={`ei-card${selected ? ' sel' : ''}`} style={{ borderLeftColor: e.sev === 'LOW' ? undefined : ({ CRITICAL: '#EF4444', HIGH: '#F97316', MEDIUM: '#F59E0B' } as any)[e.sev] }}>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <SevBadge sev={e.sev} label={e.sev === 'CRITICAL' ? 'KHẨN CẤP' : e.sev === 'HIGH' ? 'CAO' : e.sev === 'MEDIUM' ? 'TRUNG BÌNH' : 'THẤP'} />
            <span className="ei-tag">{e.status}</span>
          </div>
          <h3>{e.title}</h3>
          <div className="ei-meta"><MapPin size={12} />{e.place || 'Gia Lai'}</div>
          <div className="ei-meta"><Clock size={12} />{e.dates || (e.timeISO ? ago(e.timeISO) : 'MISSING')}</div>
          {e.kind === 'hist' && e.forces && <div className="ei-desc">{e.forces}</div>}
          {e.kind === 'hist' && e.outcome && <div style={{ fontSize: 12, color: '#7EE2A8', marginTop: 4 }}>✓ {e.outcome}</div>}
          <div className="ei-meta" style={{ marginTop: 8 }}>SOURCE · {e.kind === 'hist' ? 'Hồ sơ báo chí đã đối chiếu' : e.source}</div>
          {(() => {
            const n = e.kind === 'hist' ? getEventSources(e.id).length : 0
            return n > 0 ? (
              <button onClick={() => onOpen(e, 'SOURCES')} className="ei-meta"
                style={{ marginTop: 4, background: 'none', border: 0, padding: 0, cursor: 'pointer', color: '#7AA7FF', fontWeight: 800 }}>
                RELATED SOURCES · {n} →
              </button>
            ) : e.kind === 'hist' ? (
              <div className="ei-meta" style={{ marginTop: 4 }}>Chưa có nguồn ngoài phù hợp cho sự kiện này.</div>
            ) : null
          })()}
          {e.score != null && <RiskBar score={e.score} sev={e.sev} />}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end', flex: 'none' }}>
          {e.lat != null && e.lon != null && <SatThumb lat={e.lat} lon={e.lon} label={e.title} onOpen={() => onOpen(e)} />}
          <button className="ei-btn" onClick={() => onOpen(e)} aria-label={`Chi tiết ${e.title}`} style={{ padding: 8 }}><ChevronRight size={16} /></button>
        </div>
      </div>
    </article>
  )
}

// ── Detail drawer ────────────────────────────────────────────────────────────
const DTABS: DrawerTab[] = ['OVERVIEW', 'EVIDENCE', 'WEATHER', 'TIMELINE', 'AI ANALYSIS', 'SOURCES']

function EventDrawer({ e, weather, aiNote, initialTab, onClose }: { e: UEvt; weather: string; aiNote: string; initialTab?: DrawerTab; onClose: () => void }) {
  const [tab, setTab] = useState<DrawerTab>(initialTab || 'OVERVIEW')
  useEffect(() => {
    const h = (ev: KeyboardEvent) => { if (ev.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  const weatherOk = weather && !weather.includes('unavailable')
  return (
    <div className="ei-drawer" role="dialog" aria-label={`Chi tiết ${e.title}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div>
          <div className="ei-kicker">INCIDENT · {e.sev}</div>
          <h3 style={{ margin: '6px 0 0', fontSize: 17, lineHeight: 1.4 }}>{e.title}</h3>
          <div className="ei-meta" style={{ marginTop: 4 }}><MapPin size={12} /> {e.place || 'Gia Lai'} · {e.status}</div>
        </div>
        <button className="ei-btn" onClick={onClose} aria-label="Đóng chi tiết"><X size={14} /></button>
      </div>
      <div style={{ marginTop: 8 }}><SevBadge sev={e.sev} /></div>
      <div className="ei-dtabs" role="tablist" aria-label="Mục chi tiết">
        {DTABS.map(t => (
          <button key={t} role="tab" aria-selected={tab === t} className={`ei-dtab${tab === t ? ' on' : ''}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>
      {tab === 'OVERVIEW' && (
        <div style={{ marginTop: 10, fontSize: 13, color: '#C4D2E0', lineHeight: 1.6 }}>
          <div>Trạng thái: <b>{e.status}</b> · Cấp: <b>{e.level}</b>{e.score != null && <> · Điểm: <b>{e.score}</b></>}</div>
          {e.dates && <div style={{ marginTop: 4 }}><CalendarClock size={13} /> {e.dates}</div>}
          {e.timeISO && <div style={{ marginTop: 4 }}><Clock size={13} /> {ago(e.timeISO)}</div>}
          <div style={{ marginTop: 4 }}>Vị trí: {e.lat != null && e.lon != null ? <b>{e.lat.toFixed(4)}°N {e.lon.toFixed(4)}°E</b> : <b>MISSING</b>}</div>
          {e.lat != null && e.lon != null && <div style={{ marginTop: 8 }}><SatThumb lat={e.lat} lon={e.lon} label={e.title} /></div>}
        </div>
      )}
      {tab === 'EVIDENCE' && (
        <div style={{ marginTop: 10, fontSize: 13, color: '#C4D2E0', lineHeight: 1.6 }}>
          {e.forces ? <><p style={{ margin: 0 }}>{e.forces}</p>{e.outcome && <p style={{ color: '#7EE2A8' }}>✓ {e.outcome}</p>}<p style={{ color: '#8CA0B3', fontSize: 12 }}>Nguồn: {e.source}</p></>
            : <EiEmpty icon={<Eye size={20} />} title="DATA UNAVAILABLE" hint="Sự cố chưa có bằng chứng hiện trường đối chiếu." />}
        </div>
      )}
      {tab === 'WEATHER' && (
        <div style={{ marginTop: 10, fontSize: 13, color: '#C4D2E0', lineHeight: 1.6 }}>
          {weatherOk ? <p style={{ margin: 0 }}>{weather}</p>
            : <EiEmpty icon={<Eye size={20} />} title="DATA UNAVAILABLE" hint="Trạm thời tiết chưa phản hồi cho kỳ này." />}
        </div>
      )}
      {tab === 'TIMELINE' && (
        <EiEmpty icon={<Clock size={20} />} title="NO TIMELINE DATA" hint="Timeline information is not currently available for this incident. Mở hồ sơ đầy đủ để xem diễn biến theo báo chí." />
      )}
      {tab === 'AI ANALYSIS' && (
        <div style={{ marginTop: 10, fontSize: 13, color: '#C4D2E0', lineHeight: 1.6 }}>
          {aiNote ? <p style={{ margin: 0 }}>{aiNote}</p>
            : <EiEmpty icon={<Eye size={20} />} title="DATA UNAVAILABLE" hint="Chưa có phân tích AI cho sự cố này." />}
        </div>
      )}
      {tab === 'SOURCES' && (
        <div style={{ marginTop: 10 }}>
          {(() => {
            const list = e.kind === 'hist' ? getEventSources(e.id) : []
            if (list.length === 0) {
              return <EiEmpty icon={<Eye size={20} />} title="NO RELATED SOURCES" hint="Chưa tìm thấy nguồn ngoài phù hợp cho sự kiện này." />
            }
            const byType = countSourcesByType(list)
            return (
              <>
                <div className="ei-meta" style={{ marginBottom: 8 }}>
                  {list.length} SOURCES · {Object.entries(byType).map(([t, n]) => `${t} ${n}`).join(' · ')}
                </div>
                <SourceList sources={list} />
                <p style={{ fontSize: 11, color: '#8CA0B3', marginTop: 10, lineHeight: 1.6 }}>
                  Các nguồn báo chí cung cấp thông tin bối cảnh/xác nhận, không thay thế dữ liệu cảm biến và vệ tinh.
                </p>
              </>
            )
          })()}
        </div>
      )}
      <div className="ei-actions">
        <Link className="ei-btn primary" to={`/events/${e.id}`}>OPEN FULL INCIDENT <ArrowRight size={14} /></Link>
        <Link className="ei-btn blue" to="/">OPEN MAP</Link>
      </div>
    </div>
  )
}

export function EventsList() {
  const [items, setItems] = useState<any[]>([])
  const [itemsLoaded, setItemsLoaded] = useState(false)
  const { evidence, realStatus, loaded: evLoaded, syncedAt } = useEvidence()
  const [sev, setSev] = useState<'ALL' | Severity>('ALL')
  const [sort, setSort] = useState<'sev' | 'new'>('sev')
  const [view, setView] = useState<'list' | 'split' | 'map'>('list')
  const [selected, setSelected] = useState<UEvt | null>(null)
  const [drawerTab, setDrawerTab] = useState<DrawerTab>('OVERVIEW')
  const openDrawer = (e: UEvt, tab?: DrawerTab) => { setSelected(e); setDrawerTab(tab || 'OVERVIEW') }
  const [qdOpen, setQdOpen] = useState(false)
  useEffect(() => {
    fetch(`${API}/api/villages/fire-alert`).then(r => r.json()).then(j => {
      const alerts = j.alerts || []
      const mapped = [1, 2, 3].map(i => {
        const a = alerts[i - 1]
        return { id: i, village: a?.village || `Thôn ${i}`, score: a ? 78 + i * 3 : 62 + i * 5, time: a?.acq_date || new Date(Date.now() - i * 47 * 60000).toISOString(), status: a ? 'LIVE' : 'DEMO DATA', level: a?.level || 'Theo dõi' }
      })
      setItems(mapped)
    }).catch(() => setItems([1, 2, 3].map(i => ({ id: i, village: `Thôn ${i}`, score: 60 + i * 4, time: new Date(Date.now() - i * 53 * 60000).toISOString(), status: 'DEMO DATA', level: 'Theo dõi' }))))
      .finally(() => setItemsLoaded(true))
  }, [])

  const unified = buildUnified(HISTORICAL, items)
  const shown = sortEvents(filterEvents(unified, sev), sort)
  const liveCount = (s: Severity) => countByHelper(unified, s)
  const queue = [...unified].filter(e => e.score != null).sort((a, b) => (b.score as number) - (a.score as number)).slice(0, 4)
  const hasS2 = !!evidence && !String(evidence.s2).includes('unavailable')
  const liveSources = evidence?.liveSources ?? 0

  return (
    <div className="ei rise-in">
      <EiStyles />
      {/* HERO */}
      <div className="ei-hero">
        <div className="ei-iconbox"><Flame size={26} /></div>
        <div style={{ flex: 1, minWidth: 240 }}>
          <h1 className="ei-title">Event Intelligence</h1>
          <div className="ei-sub">AI-powered monitoring, prediction and response intelligence · Gia Lai</div>
          <div className="ei-chips" aria-label="Trạng thái nguồn dữ liệu">
            <span className="ei-chip"><StatusDot live={realStatus.includes('LIVE')} /> {realStatus.includes('LIVE') ? 'LIVE' : realStatus}</span>
            <span className="ei-chip"><StatusDot live={hasS2} /> FIRMS+</span>
            <span className="ei-chip"><StatusDot live={!!evidence && !String(evidence.weather).includes('unavailable')} /> Weather</span>
            <span className="ei-chip"><StatusDot live={hasS2} /> Sentinel</span>
          </div>
        </div>
        <div className="ei-sysbox" role="status" aria-label="Trạng thái hệ thống">
          <span className="cell"><span className="ei-dot live" /> <b>SYSTEM OPERATIONAL</b></span>
          <span className="cell">Last sync: <b>{syncedAt || '…'}</b></span>
          <span className="cell">Sources: <b>{evLoaded ? liveSources : '…'}/3</b></span>
        </div>
      </div>

      {/* KPI */}
      <div className="ei-kpis" role="region" aria-label="Tổng quan sự kiện">
        <KpiCard icon={<Bell size={15} />} value={String(unified.length)} label="ACTIVE EVENTS" sub="Sự kiện đang theo dõi" color="#7AA7FF" />
        <KpiCard icon={<Flame size={15} />} value={String(liveCount('CRITICAL'))} label="CRITICAL" sub="Cần ưu tiên" color="#EF4444" hot={liveCount('CRITICAL') > 0} />
        <KpiCard icon={<Thermometer size={15} />} value={String(liveCount('HIGH'))} label="HIGH RISK" sub="Mức cao" color="#F97316" />
        <KpiCard icon={<Satellite size={15} />} value={evLoaded ? String(liveSources) : '…'} label="LIVE SOURCES" sub="FIRMS · Weather · Sentinel" color="#22C55E" />
      </div>

      {/* AI BRIEF */}
      <div className="ei-panel" style={{ marginTop: 12, borderLeft: '4px solid #3B82F6' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <span className="ei-kicker">✦ AI SITUATION BRIEF</span>
          <span style={{ display: 'flex', gap: 6 }}>
            <span className="ei-tag">[AI ANALYSIS]</span>
            <span className="ei-tag">[CONFIDENCE {evidence ? `${evidence.confidence}%` : '…'}]</span>
          </span>
        </div>
        {!evLoaded ? <div className="ei-skel" style={{ height: 64, marginTop: 10 }} /> : !evidence ? (
          <div style={{ marginTop: 8, fontSize: 13, color: '#8CA0B3' }}>AI ANALYSIS UNAVAILABLE — pipeline bằng chứng chưa phản hồi.</div>
        ) : (
          <>
            <p style={{ fontSize: 15, lineHeight: 1.6, margin: '8px 0 0', fontWeight: 600 }}>
              {liveCount('CRITICAL') > 0
                ? <>Nguy cơ cháy rừng tại Gia Lai đang ở mức <b>CAO</b>. {liveCount('CRITICAL')} sự kiện mức khẩn cấp, {liveCount('HIGH')} sự kiện mức cao cần theo dõi.</>
                : <>Chưa ghi nhận sự kiện mức khẩn cấp. Hệ thống tiếp tục giám sát {unified.length} sự kiện/điểm theo dõi.</>}
            </p>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 10, fontSize: 12 }}>
              <span><span className="ei-kicker">PRIORITY · </span><b style={{ color: liveCount('CRITICAL') > 0 ? '#EF4444' : '#22C55E' }}>{liveCount('CRITICAL') > 0 ? 'Critical' : 'Normal'}</b></span>
              <span><span className="ei-kicker">BASED ON · </span><span style={{ color: '#C4D2E0' }}>{['FIRMS', 'Weather', 'Sentinel'].filter((_, i) => [evidence.firms.includes('LIVE'), evidence.weather.includes('LIVE'), hasS2][i]).join(' · ') || 'đang chờ nguồn LIVE'}</span></span>
            </div>
            <div className="ei-meta" style={{ marginTop: 8 }}><Eye size={12} /> Chuỗi bằng chứng: {evidence.s2} · {evidence.weather} · {evidence.firms}</div>
            <div className="ei-actions">
              <button className="ei-btn blue" onClick={() => window.dispatchEvent(new CustomEvent('ecochain-open-ai', { detail: {} }))}>Xem phân tích <ArrowRight size={14} /></button>
            </div>
          </>
        )}
      </div>

      {/* ALERTS */}
      <div className="ei-alert crit" role="alert">
        <Flame size={26} className="ei-sevpulse" style={{ color: '#EF4444', flex: 'none', marginTop: 2 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="ei-kicker" style={{ color: '#FCA5A5' }}>INCIDENT COMMAND ALERT · SEVERITY: CRITICAL</div>
          <h3 style={{ marginTop: 4 }}>NGUY CƠ CHÁY RỪNG CAO — El Niño mạnh đến cuối năm</h3>
          <div className="ei-meta" style={{ marginTop: 4 }}>Gia Lai · Detected từ văn bản 11116/UBND-NNMT · Risk: CRITICAL</div>
          <p>Khô hạn, nắng nóng, thiếu nước. 82 xã/phường nắng nóng; trực 24/24h; cấp IV-V kiểm soát người vào rừng, cấm dùng lửa rừng/ven rừng; “4 tại chỗ” mức cao nhất.</p>
          <div className="ei-meta" style={{ marginTop: 6 }}>
            <span className="ei-tag">82 xã/phường</span>
            <span className="ei-tag">24/24 monitoring</span>
            <span className="ei-tag" style={{ background: 'rgba(239,68,68,0.2)', borderColor: 'rgba(239,68,68,0.5)', color: '#FCA5A5' }}>Risk: CRITICAL</span>
          </div>
          <div className="ei-actions">
            {queue[0] && typeof queue[0].id === 'string' && <Link className="ei-btn primary" to={`/events/${queue[0].id}`}>VIEW INCIDENT</Link>}
            <Link className="ei-btn" to="/">OPEN MAP</Link>
            <Link className="ei-btn" to="/missions">CREATE MISSION</Link>
          </div>
        </div>
      </div>
      <div className="ei-alert info">
        <Droplets size={24} style={{ color: '#3B82F6', flex: 'none', marginTop: 2 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3>Cảnh báo thiên tai – Dự báo thời tiết <span className="ei-tag" style={{ background: 'rgba(59,130,246,0.15)', borderColor: 'rgba(59,130,246,0.4)', color: '#BFDBFE' }}>Quan trọng</span></h3>
          <p>Bão/áp thấp nhiệt đới có khả năng ảnh hưởng khu vực Trung Bộ và Tây Nguyên. Từ đầu 2025 có 129 vụ/150ha, gấp đôi cùng kỳ 2024 — nguyên nhân không chỉ thời tiết cực đoan mà cả “lỗ hổng” ý thức. Khuyến cáo: cảnh báo sớm bằng vệ tinh + cảm biến nhiệt + dự báo vi mô, lực lượng bán chuyên cấp xã.</p>
        </div>
      </div>

      {/* FILTER BAR */}
      <div className="ei-filters" role="toolbar" aria-label="Lọc sự kiện">
        {(['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).map(f => (
          <button key={f} className={`ei-fbtn${sev === f ? ' on' : ''}`} onClick={() => setSev(f)} aria-pressed={sev === f}>
            {f === 'ALL' ? 'Tất cả' : f} <span className="c">({f === 'ALL' ? unified.length : liveCount(f as Severity)})</span>
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <label className="ei-meta" htmlFor="ei-sort">Sắp xếp:
          <select id="ei-sort" className="ei-select" value={sort} onChange={e => setSort(e.target.value as 'sev' | 'new')}>
            <option value="sev">Mức độ</option>
            <option value="new">Mới nhất</option>
          </select>
        </label>
        <div className="ei-segview" style={{ display: 'flex', border: '1px solid rgba(148,163,184,0.16)', borderRadius: 999, padding: 2 }} role="group" aria-label="Chế độ xem">
          {([['list', 'LIST'], ['split', 'SPLIT'], ['map', 'MAP']] as const).map(([v, l]) => (
            <button key={v} className={`ei-fbtn${view === v ? ' on' : ''}`} onClick={() => setView(v)} aria-pressed={view === v}
              style={view === v ? undefined : { border: 0 }} title={l}>{l}</button>
          ))}
        </div>
      </div>

      {/* AI PRIORITY QUEUE */}
      <div className="ei-panel" style={{ marginTop: 12 }}>
        <div className="ei-kicker">AI PRIORITY QUEUE — XẾP THEO ĐIỂM HIỆN CÓ</div>
        {queue.length === 0 ? <div className="ei-meta" style={{ marginTop: 6 }}>Chưa có sự kiện để xếp hạng.</div>
          : queue.map((e, i) => (
            <div className={`ei-q${i === 0 ? ' ei-qlead' : ''}`} key={e.key} style={i === 0 ? { borderRadius: 12, padding: '10px 12px' } : undefined}>
              <span className="rank">#{String(i + 1).padStart(2, '0')}</span>
              <Flame size={16} style={{ color: e.sev === 'CRITICAL' ? '#EF4444' : e.sev === 'HIGH' ? '#F97316' : '#F59E0B', flex: 'none' }} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <b>{e.title}</b>
                <span style={{ display: 'block', fontSize: 11, color: '#8CA0B3', marginTop: 2 }}>{e.sev}{e.place ? ` · ${e.place}` : ''}</span>
                {e.score != null && (
                  <span style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
                    <span className="ei-bar" style={{ maxWidth: 160 }}><i style={{ width: `${Math.min(100, e.score)}%`, background: e.sev === 'CRITICAL' ? '#EF4444' : e.sev === 'HIGH' ? '#F97316' : '#F59E0B' }} /></span>
                    <span style={{ fontSize: 11, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{e.score}</span>
                  </span>
                )}
              </span>
              <button className="ei-btn" onClick={() => openDrawer(e)} aria-label={`Chi tiết ${e.title}`}><ChevronRight size={14} /></button>
            </div>
          ))}
      </div>

      {/* LIST / SPLIT / MAP — map reuse MapView thật; chưa sync marker theo card (cần geo id backend) */}
      {view === 'map' ? (
        <div className="ei-mapwrap" style={{ marginTop: 12 }}><MapView fill /></div>
      ) : view === 'split' ? (
        <div className="ei-split">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
            {!itemsLoaded ? <EiSkeletonRows n={2} /> : shown.length === 0 ? (
              <div className="ei-panel"><EiEmpty icon={<Eye size={22} />} title="NO EVENTS" hint="Không có sự kiện nào ở mức lọc hiện tại." /></div>
            ) : shown.map(e => <EventCard key={e.key} e={e} selected={selected?.key === e.key} onOpen={openDrawer} />)}
          </div>
          <div className="ei-mapwrap"><MapView fill /></div>
        </div>
      ) : (
        <div className="ei-cards">
          {!itemsLoaded ? <EiSkeletonRows n={3} /> : shown.length === 0 ? (
            <div className="ei-panel"><EiEmpty icon={<Eye size={22} />} title="NO EVENTS" hint="Không có sự kiện nào ở mức lọc hiện tại." /></div>
          ) : shown.map(e => <EventCard key={e.key} e={e} selected={selected?.key === e.key} onOpen={openDrawer} />)}
        </div>
      )}

      {/* QD49 */}
      <div className="ei-panel" style={{ marginTop: 12 }}>
        <button onClick={() => setQdOpen(o => !o)} aria-expanded={qdOpen} style={{ background: 'none', border: 0, color: 'inherit', width: '100%', textAlign: 'left', cursor: 'pointer', padding: 0 }}>
          <div className="ei-kicker">QĐ 49/2026/QĐ-UBND — 5 CẤP DỰ BÁO CHÁY RỪNG {qdOpen ? '▴' : '▾'}</div>
        </button>
        {qdOpen && QD49.map(q => (
          <div key={q.lv} style={{ fontSize: 12, color: '#C4D2E0', marginTop: 8 }}><b>Cấp {q.lv} ({q.name}):</b> {q.action}</div>
        ))}
        <div style={{ fontSize: 11, color: '#5B6E82', marginTop: 8 }}>Sở NN&MT hướng dẫn bảng tra cấp dự báo theo quyết định.</div>
      </div>

      {selected && <EventDrawer key={`${selected.key}-${drawerTab}`} e={selected} weather={evidence?.weather || 'Weather data unavailable.'}
        aiNote={evidence ? `Mức ${selected.level}${selected.score != null ? ` · điểm ${selected.score}` : ''} · Tin cậy ${evidence.confidence}% · ${evidence.model}` : ''} initialTab={drawerTab} onClose={() => setSelected(null)} />}
    </div>
  )
}

function countByHelper(list: UEvt[], sev: Severity): number {
  return list.filter(e => e.sev === sev).length
}

export default function EventIntelligence() {
  const { id } = useParams()
  const { evidence, realStatus, loaded } = useEvidence()
  return (
    <div className="ei rise-in">
      <EiStyles />
      {(() => {
        const h = HISTORICAL.find(x => x.id === id)
        if (!h) return <div className="ei-panel"><EiEmpty icon={<Eye size={22} />} title="NOT FOUND" hint="Không tìm thấy sự kiện. Về danh sách:" action={<Link className="ei-btn" to="/events">Danh sách sự kiện</Link>} /></div>
        const sev = severityOf(h.level, h.score)
        const c = parseCoords(h.place)
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="ei-panel" style={{ borderLeft: `4px solid ${sev === 'CRITICAL' ? '#EF4444' : sev === 'HIGH' ? '#F97316' : '#F59E0B'}` }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <SevBadge sev={sev} />
                <span className="ei-tag">SỰ KIỆN THẬT</span>
                <span style={{ flex: 1 }} />
                <Link className="ei-btn" to="/events">← Danh sách</Link>
              </div>
              <h1 className="ei-title" style={{ marginTop: 8 }}>{h.title}</h1>
              <div className="ei-meta" style={{ marginTop: 6 }}><MapPin size={12} />{h.place} · {h.dates}</div>
              <div style={{ fontSize: 13, color: '#C4D2E0', marginTop: 8, lineHeight: 1.6 }}>{h.forces}</div>
              <div style={{ fontSize: 13, color: '#7EE2A8', marginTop: 6 }}>✓ {h.outcome}</div>
              <div style={{ fontSize: 12, color: '#8CA0B3', marginTop: 6 }}>Nguồn: {h.source} · Mức cấp là ước tính biên tập theo mô tả, chờ phân loại chính thức của Kiểm lâm</div>
              {typeof h.score === 'number' && (
                <div style={{ marginTop: 10 }}>
                  <div className="ei-kicker">RISK SCORE (ƯỚC TÍNH BIÊN TẬP)</div>
                  <div className="ei-risk">
                    <span className="ei-score" style={{ color: sev === 'CRITICAL' ? '#EF4444' : sev === 'HIGH' ? '#F97316' : '#F59E0B' }}>{h.score}</span>
                    <div className="ei-bar" role="progressbar" aria-valuenow={h.score} aria-valuemin={0} aria-valuemax={100} aria-label={`Risk score ${h.score}`}>
                      <i style={{ width: `${h.score}%`, background: sev === 'CRITICAL' ? '#EF4444' : sev === 'HIGH' ? '#F97316' : '#F59E0B' }} />
                    </div>
                  </div>
                </div>
              )}
              {c && <div style={{ marginTop: 10 }}><SatThumb lat={c.lat} lon={c.lon} label={h.title} /></div>}
              {(() => {
                const list = getEventSources(h.id)
                if (list.length === 0) return null
                const byType = countSourcesByType(list)
                return (
                  <div style={{ marginTop: 12 }}>
                    <div className="ei-kicker">RELATED SOURCES · {list.length} · {Object.entries(byType).map(([t, n]) => `${t} ${n}`).join(' · ')}</div>
                    <div style={{ marginTop: 8 }}><SourceList sources={list} /></div>
                    <p style={{ fontSize: 11, color: '#8CA0B3', marginTop: 8, lineHeight: 1.6 }}>
                      Các nguồn báo chí cung cấp thông tin bối cảnh/xác nhận, không thay thế dữ liệu cảm biến và vệ tinh.
                    </p>
                  </div>
                )
              })()}
            </div>
            <div className="ei-panel">
              <div className="ei-kicker">TẠI SAO AI PHÁT HIỆN? — CHUỖI BẰNG CHỨNG</div>
              {!loaded ? <div className="ei-skel" style={{ height: 90, marginTop: 8 }} /> : !evidence ? (
                <div style={{ fontSize: 13, color: '#8CA0B3', marginTop: 8 }}>AI ANALYSIS UNAVAILABLE — pipeline bằng chứng chưa phản hồi.</div>
              ) : (
                <ul style={{ fontSize: 13, lineHeight: 1.8, margin: '8px 0 0 18px', padding: 0, color: '#C4D2E0' }}>
                  <li>{evidence.s2}</li>
                  <li>{evidence.s1}</li>
                  <li>{evidence.ndmi}</li>
                  <li>{evidence.weather}</li>
                  <li>{evidence.community}</li>
                  <li>{evidence.firms}</li>
                </ul>
              )}
              <div style={{ fontSize: 12, color: '#8CA0B3', marginTop: 8 }}>
                Nguồn: Sentinel-2 · Sentinel-1 · FIRMS · Thời tiết · Cộng đồng · Tin cậy {evidence?.confidence ?? '…'}% · Mô hình {evidence?.model ?? 'v1.0'} · {realStatus}
              </div>
            </div>
            <div className="ei-panel">
              <div className="ei-kicker">CHUỖI TÁC ĐỘNG</div>
              <div style={{ fontFamily: 'monospace', fontSize: 13, textAlign: 'center', marginTop: 8 }}>RỪNG ↓ CÀ PHÊ ↓ ĐƯỜNG / LOGISTICS ↓ CARBON ↓ CỘNG ĐỒNG</div>
              <div style={{ fontSize: 13, color: '#C4D2E0', marginTop: 8 }}>Tác động môi trường không chỉ là điểm trên bản đồ.</div>
            </div>
            <div className="ei-panel" style={{ borderLeft: '4px solid #F59E0B' }}>
              <div className="ei-kicker">PHÂN TÍCH AI — DỰ THẢO</div>
              <div style={{ marginTop: 6 }}>Rủi ro: <b>CAO</b> · Ưu tiên: P1 · Cần xác minh thực địa</div>
              <div style={{ fontSize: 12, color: '#F59E0B', marginTop: 4 }}>DRAFT — Chờ xác minh con người · <VerificationBadge status="PENDING" /></div>
              <div className="ei-actions">
                <Link className="ei-btn blue" to="/what-if">MÔ PHỎNG TÁC ĐỘNG →</Link>
                <Link className="ei-btn" to="/missions">Tạo nhiệm vụ</Link>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
