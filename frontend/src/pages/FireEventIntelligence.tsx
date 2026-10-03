import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Clock3, Flame, MapPin, Radio, RotateCw, ShieldCheck } from 'lucide-react'
import MapView from '../components/MapView'
import BacktestCard from '../components/BacktestCard'
import { API_BASE, photoUrl } from '../services/api'
import {
  buildEventListFromAlerts,
  fireEventMapPath,
  findFireEventById,
  formatAdministrativeLocation,
  isLiveSourceStatus,
} from '../utils/truthfulData'

const API = API_BASE
const LIFECYCLE = [
  ['NGHI_NGO', 'Nghi ngờ'],
  ['DANG_XAC_MINH', 'Đang xác minh'],
  ['DA_XAC_NHAN', 'Đã xác nhận'],
  ['DANG_XU_LY', 'Đang xử lý'],
  ['DA_KIEM_TRA', 'Đã kiểm tra'],
  ['DONG_SU_CO', 'Đóng sự cố'],
] as const

export function eventCountLabel(status: string, count: number): string {
  if (status === 'LOADING') return '…'
  return isLiveSourceStatus(status) ? String(count) : '—'
}

export function formatAcquisitionTime(value: unknown): string | null {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 2359) {
    value = String(value).padStart(4, '0')
  }
  if (typeof value !== 'string') return null
  const digits = value.trim()
  const match = digits.match(/^(\d{1,2})(\d{2})$/)
  if (!match) return digits || null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')} UTC`
}

function useFireEventFeed() {
  const [feed, setFeed] = useState<{ status: string; events: any[]; alerts: any[]; error: string | null }>({
    status: 'LOADING', events: [], alerts: [], error: null,
  })
  const [health, setHealth] = useState<any>(null)
  const [healthStatus, setHealthStatus] = useState<'LOADING'|'AVAILABLE'|'UNAVAILABLE'>('LOADING')
  const [reloadVersion, setReloadVersion] = useState(0)

  useEffect(() => {
    let active = true
    setFeed({ status: 'LOADING', events: [], alerts: [], error: null })
    fetch(`${API}/api/villages/fire-alert`, { cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.json()
      })
      .then(payload => {
        if (!active) return
        if (!payload || typeof payload !== 'object' || typeof payload.status !== 'string') {
          throw new Error('Phản hồi FIRMS không đúng định dạng.')
        }
        if (!isLiveSourceStatus(payload?.status)) {
          setFeed({ status: payload.status, events: [], alerts: [], error: null })
          return
        }
        setFeed({
          status: payload.status,
          events: buildEventListFromAlerts(payload),
          alerts: Array.isArray(payload.alerts) ? payload.alerts : [],
          error: null,
        })
      })
      .catch(error => {
        if (active) setFeed({ status: 'UNAVAILABLE', events: [], alerts: [], error: String(error) })
      })
    fetch(`${API}/api/health/geospatial`, { cache: 'no-store' })
      .then(response => response.ok ? response.json() : null)
      .then(payload => { if (active) { setHealth(payload); setHealthStatus(payload ? 'AVAILABLE' : 'UNAVAILABLE') } })
      .catch(() => { if (active) { setHealth(null); setHealthStatus('UNAVAILABLE') } })
    return () => { active = false }
  }, [reloadVersion])

  return { ...feed, health, healthStatus, retry: () => setReloadVersion(version => version + 1) }
}

function StatusPill({ status }: { status: string }) {
  const stateClass = status === 'LIVE' ? 'live' : status === 'CACHED' ? 'cached' : status === 'STALE' ? 'stale' : ''
  return <span className={`fi-status${stateClass ? ` ${stateClass}` : ''}`}><i />{status}</span>
}

function EvidenceRow({ label, state, detail }: { label: string; state: 'yes' | 'missing' | 'unavailable'; detail: string }) {
  return (
    <div className="fi-evidence-row">
      <span className={`fi-evidence-mark ${state}`} aria-hidden="true">{state === 'yes' ? '✓' : '—'}</span>
      <div className="fi-evidence-copy"><b>{label}</b><span>{detail}</span></div>
      <span className={`fi-evidence-state ${state}`}>{state === 'yes' ? 'Có dữ liệu' : state === 'unavailable' ? 'Chưa khả dụng' : 'Chưa có dữ liệu'}</span>
    </div>
  )
}

function EventVerification({ event }: { event: any }) {
  const verified = event.verification?.verified === true
  const evidence: Record<string, boolean | null> = event.evidence || {}
  const items = [
    ['Phát hiện FIRMS', evidence.firms === true],
    ['Ảnh thực địa', evidence.field_photo === true],
    ['Báo cáo cộng đồng', evidence.community_report === true],
    ['Ảnh vệ tinh', evidence.sentinel2 === true || evidence.sentinel1 === true],
    ['Xác nhận cán bộ', verified],
  ] as const
  const currentIndex = Math.max(0, LIFECYCLE.findIndex(([code]) => code === event.status))
  return (
    <section className="fi-section" aria-labelledby="fi-verification-title">
      <div className="fi-section-heading"><ShieldCheck size={16} /><h2 id="fi-verification-title">Xác minh sự kiện</h2></div>
      <div className="fi-lifecycle" aria-label="Vòng đời sự kiện">
        {LIFECYCLE.map(([code, label], index) => (
          <div className={`fi-life-step${index === currentIndex ? ' current' : ''}`} key={code} aria-current={index === currentIndex ? 'step' : undefined}>
            <span>{index < currentIndex ? '✓' : index === currentIndex ? '●' : '○'}</span>{label}
          </div>
        ))}
      </div>
      <div className="fi-checklist">
        {items.map(([label, present]) => (
          <label key={label}><input type="checkbox" checked={present} disabled readOnly />{label}</label>
        ))}
      </div>
      <p className="fi-unsynced">{verified ? `Đã xác minh bởi ${event.verification.verified_by} · ${event.verification.verified_at}` : event.status === 'DANG_XAC_MINH' ? 'Đã nhận báo cáo cộng đồng; báo cáo không xác nhận đám cháy.' : 'Chưa có cơ chế xác minh máy chủ cho FIRMS event này.'}</p>
    </section>
  )
}

function EventEvidence({ event, health }: { event: any; health: any }) {
  const evidence: Record<string, boolean | null> = event.evidence || {}
  const s2Status = health?.sentinel2?.status
  const s1Status = health?.sentinel1?.status
  const firmsAvailable = evidence.firms === true && isLiveSourceStatus(event.detection?.source_status)
  const acquisitionTime = formatAcquisitionTime(event.detection?.acq_time)
  const communityCount = event.community_report_count
  const satelliteState = (status: unknown, value: boolean | null | undefined): 'yes' | 'missing' | 'unavailable' => {
    if (value === true) return 'yes'
    if (status === 'UNAVAILABLE' || status === 'CONFIGURATION_REQUIRED') return 'unavailable'
    return 'missing'
  }
  return (
    <section className="fi-section" aria-labelledby="fi-evidence-title">
      <div className="fi-section-heading"><Radio size={16} /><h2 id="fi-evidence-title">Nguồn dữ liệu và bằng chứng</h2></div>
      <div className="fi-evidence-list">
        <EvidenceRow label="NASA FIRMS" state={firmsAvailable ? 'yes' : 'missing'} detail={firmsAvailable ? `${event.detection.source_status} · ${event.detection.acq_date || 'Chưa có ngày'}${acquisitionTime ? ` ${acquisitionTime}` : ''}` : 'Chưa có dữ liệu phát hiện'} />
        <EvidenceRow label="Sentinel-2" state={satelliteState(s2Status, evidence.sentinel2)} detail={evidence.sentinel2 === true ? 'Bằng chứng gắn với sự kiện' : s2Status ? `Tình trạng nguồn: ${s2Status} · chưa có ảnh gắn với sự kiện` : 'Chưa có dữ liệu gắn với sự kiện'} />
        <EvidenceRow label="Sentinel-1" state={satelliteState(s1Status, evidence.sentinel1)} detail={evidence.sentinel1 === true ? 'Bằng chứng gắn với sự kiện' : s1Status ? `Tình trạng nguồn: ${s1Status} · chưa có ảnh gắn với sự kiện` : 'Chưa có dữ liệu gắn với sự kiện'} />
        <EvidenceRow label="Thời tiết" state={evidence.weather === true ? 'yes' : 'missing'} detail={evidence.weather === true ? 'Dữ liệu thời tiết gắn với sự kiện' : 'Chưa có dữ liệu thời tiết gắn với sự kiện'} />
        <EvidenceRow label="Báo cáo cộng đồng" state={communityCount == null ? 'unavailable' : communityCount > 0 ? 'yes' : 'missing'} detail={communityCount == null ? 'Chưa thể tải dữ liệu báo cáo' : communityCount > 0 ? `${communityCount} báo cáo cộng đồng đã nhận · chưa xác minh đám cháy` : 'Chưa có báo cáo cộng đồng'} />
        <EvidenceRow label="Ảnh thực địa" state={evidence.field_photo == null ? 'unavailable' : evidence.field_photo ? 'yes' : 'missing'} detail={evidence.field_photo == null ? 'Chưa thể tải trạng thái ảnh' : evidence.field_photo ? 'Có ảnh thực địa đã lưu' : 'Chưa có ảnh thực địa'} />
      </div>
      {Array.isArray(event.community_reports) && event.community_reports.map((report: any) => (
        <article className="fi-community-report" key={report.report_id}>
          <b>Báo cáo {report.report_id}</b>
          <span>{report.reported_at ? new Date(report.reported_at).toLocaleString('vi-VN') : 'Chưa có thời gian máy chủ'}</span>
          <p>{report.description || 'Chưa có mô tả'}</p>
          <span>GPS báo cáo: {report.location?.latitude}, {report.location?.longitude}</span>
          {report.match_distance_km != null && <div className="fi-report-relation">
            <span>FIRMS · {event.detection.latitude}, {event.detection.longitude}</span>
            <b>↕ {report.match_distance_km} km · khoảng cách địa lý, không xác nhận cùng đám cháy</b>
            <span>Báo cáo · {report.location?.latitude}, {report.location?.longitude}</span>
          </div>}
          <Link to={`/community/reports/${encodeURIComponent(report.report_id)}`}>Mở báo cáo</Link>
          {report.photos?.map((photo: any) => <figure key={photo.photo_id}>
            <img src={photoUrl(photo.url)} alt={`Ảnh thực địa trong báo cáo ${report.report_id}`} loading="lazy" />
            <figcaption>Ảnh thực địa · tải lên {photo.uploaded_at ? new Date(photo.uploaded_at).toLocaleString('vi-VN') : 'chưa có thời gian'}{photo.gps ? ` · tọa độ gửi kèm ảnh ${photo.gps[0]}, ${photo.gps[1]}` : ''}</figcaption>
          </figure>)}
        </article>
      ))}
      <div className="fi-provenance">Dữ liệu FIRMS là quan sát cảm biến nhiệt; không tự xác nhận đám cháy.</div>
    </section>
  )
}

function EventTimeline({ event }: { event: any }) {
  const entries = Array.isArray(event.timeline) ? event.timeline : []
  return (
    <section className="fi-section" aria-labelledby="fi-timeline-title">
      <div className="fi-section-heading"><Clock3 size={16} /><h2 id="fi-timeline-title">Dòng thời gian</h2></div>
      {entries.length ? entries.map((item: any, index: number) => (
        <div className="fi-timeline-item" key={`${item.time}-${index}`}>
          <time dateTime={item.time}>{new Date(item.time).toLocaleString('vi-VN', { timeZone: 'UTC' })} UTC</time>
          <span>{item.event}</span><small>Nguồn: {item.source || 'Chưa có dữ liệu'}</small>
        </div>
      )) : <p className="fi-empty-line">Chưa có dữ liệu thời gian.</p>}
    </section>
  )
}

function EventSummary({ event }: { event: any }) {
  const detection = event.detection || {}
  const acquisitionTime = formatAcquisitionTime(detection.acq_time)
  const locationText = formatAdministrativeLocation(event.location)
  return (
    <section className="fi-section" aria-labelledby="fi-summary-title">
      <div className="fi-section-heading"><Flame size={16} /><h2 id="fi-summary-title">Phát hiện điểm nhiệt</h2><span className="fi-suspected">{event.status}</span></div>
      <dl className="fi-data-grid">
          <div><dt>Mã sự kiện</dt><dd>{event.event_id}</dd></div>
        <div><dt>Nguồn</dt><dd>{detection.source || 'Chưa có dữ liệu'} · {detection.source_status || 'Chưa có dữ liệu'}</dd></div>
        <div><dt>Thời gian phát hiện</dt><dd>{detection.acq_date || 'Chưa có dữ liệu'}{acquisitionTime ? ` · ${acquisitionTime}` : ''}</dd></div>
        <div><dt>Độ tin cậy FIRMS</dt><dd>{detection.confidence ?? 'Chưa có dữ liệu'}</dd></div>
        <div><dt>Vệ tinh / thiết bị</dt><dd>{[detection.satellite, detection.instrument].filter(Boolean).join(' / ') || 'Chưa có dữ liệu'}</dd></div>
        <div><dt>Vị trí phát hiện</dt><dd>{typeof detection.latitude === 'number' && typeof detection.longitude === 'number' ? `${detection.latitude.toFixed(6)}, ${detection.longitude.toFixed(6)}` : 'Chưa có dữ liệu tọa độ'}</dd></div>
        <div><dt>Địa giới</dt><dd>{locationText}</dd></div>
        <div><dt>Chất lượng địa giới</dt><dd>{event.location?.verified_by_boundary ? '✓ Xác định bằng polygon' : '⚠ Chưa xác định'}</dd></div>
      </dl>
      {event.villageReference && <div className="fi-reference">Điểm tham chiếu gần nhất: <b>{event.villageReference.name}</b>{event.distanceKm != null ? ` · ${event.distanceKm} km từ tọa độ FIRMS` : ''}</div>}
    </section>
  )
}

function EventInvestigation({ event, health }: { event: any; health: any }) {
  const ai = event.ai_analysis
  return (
    <main className="fi-investigation">
      <div className="fi-page-head">
        <div><div className="fi-eyebrow">ĐIỀU TRA · XÁC MINH ĐIỂM NGHI NGỜ</div><h1>Điều tra sự kiện</h1><p>Phát hiện FIRMS là tín hiệu quan sát, không phải vụ cháy đã xác nhận.</p></div>
        <div className="fi-head-actions">
          <Link className="fi-button" to="/events"><ArrowLeft size={15} /> Danh sách</Link>
          <Link className="fi-button primary" to={fireEventMapPath(event.event_id)}><MapPin size={15} /> Xem trên bản đồ</Link>
        </div>
      </div>
      <div className="fi-event-id">{event.event_id}</div>
      <div className="fi-investigation-grid">
        <div className="fi-main-column">
          <EventSummary event={event} />
          <EventEvidence event={event} health={health} />
          <EventTimeline event={event} />
        </div>
        <aside className="fi-side-column">
          <EventVerification event={event} />
          <section className="fi-section fi-ai" aria-labelledby="fi-ai-title">
            <div className="fi-section-heading"><h2 id="fi-ai-title">Phân tích AI</h2></div>
            {ai ? <>
              <p><b>DỮ LIỆU QUAN SÁT</b><br />{String(ai.observed || 'Chưa có dữ liệu')}</p>
              <p><b>SUY LUẬN AI</b><br />{String(ai.inference || 'Chưa có dữ liệu')}</p>
              <p><b>ĐỀ XUẤT</b><br />{String(ai.recommendation || 'Chưa có dữ liệu')}</p>
              <small>{String(ai.source || 'Nguồn phân tích chưa được cung cấp')}</small>
            </> : <p className="fi-empty-line">Phân tích AI chưa khả dụng — chưa có đủ dữ liệu đầu vào.</p>}
          </section>
        </aside>
      </div>
    </main>
  )
}

function InvestigationStyles() {
  return <style>{`
    .fire-intel{--fi-ink:#172421;--fi-muted:#60716c;--fi-line:#dce5e1;--fi-green:#176b52;--fi-pale:#f3f7f5;background:#f4f7f5;color:var(--fi-ink);min-height:calc(100vh - 56px);padding:20px;}
    .fi-investigation{max-width:1440px;margin:0 auto;}
    .fi-page-head{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap;margin-bottom:8px;}
    .fi-eyebrow{font-size:11px;font-weight:800;color:var(--fi-green);}
    .fi-page-head h1{font-size:25px;line-height:1.2;margin:5px 0 0;font-weight:800;}
    .fi-page-head p{margin:5px 0 0;color:var(--fi-muted);font-size:13px;}
    .fi-head-actions{display:flex;gap:8px;flex-wrap:wrap;}
    .fi-button{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--fi-line);border-radius:7px;padding:8px 11px;background:#fff;color:var(--fi-ink);font-size:12px;font-weight:700;text-decoration:none;}
    .fi-button.primary{background:var(--fi-green);border-color:var(--fi-green);color:#fff;}
    .fi-event-id{font-size:11px;color:var(--fi-muted);font-family:monospace;margin:10px 0;overflow-wrap:anywhere;}
    .fi-investigation-grid{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(280px,.85fr);gap:12px;align-items:start;}
    .fi-main-column,.fi-side-column{display:grid;gap:12px;min-width:0;}
    .fi-section{background:#fff;border:1px solid var(--fi-line);border-radius:7px;padding:15px;min-width:0;}
    .fi-section-heading{display:flex;align-items:center;gap:8px;color:var(--fi-green);margin-bottom:12px;}
    .fi-section-heading h2{margin:0;color:var(--fi-ink);font-size:14px;line-height:1.3;font-weight:800;}
    .fi-suspected{margin-left:auto;border:1px solid #e8d59b;background:#fff9e7;color:#765200;border-radius:4px;padding:4px 7px;font-size:10px;font-weight:800;}
    .fi-data-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 18px;margin:0;}
    .fi-data-grid div{padding:8px 0;border-top:1px solid #edf1ef;min-width:0;}
    .fi-data-grid dt{font-size:10px;text-transform:uppercase;color:var(--fi-muted);font-weight:800;}
    .fi-data-grid dd{margin:3px 0 0;font-size:12px;overflow-wrap:anywhere;}
    .fi-reference{margin-top:10px;background:#f5f8f6;border-left:3px solid #9aafa5;padding:8px 10px;font-size:11px;color:#4f625a;}
    .fi-evidence-list{display:grid;}
    .fi-evidence-row{display:grid;grid-template-columns:22px minmax(0,1fr) auto;align-items:center;gap:8px;padding:9px 0;border-top:1px solid #edf1ef;}
    .fi-evidence-mark{font-size:15px;font-weight:900;text-align:center;}
    .fi-evidence-mark.yes,.fi-evidence-state.yes{color:#176b52;}
    .fi-evidence-mark.missing,.fi-evidence-state.missing{color:#708079;}
    .fi-evidence-mark.unavailable,.fi-evidence-state.unavailable{color:#946b15;}
    .fi-evidence-copy{display:grid;gap:2px;min-width:0;}
    .fi-evidence-copy b{font-size:12px;}
    .fi-evidence-copy span,.fi-evidence-state{font-size:10px;color:var(--fi-muted);}
    .fi-evidence-state{white-space:nowrap;}
    .fi-provenance,.fi-unsynced{font-size:11px;color:var(--fi-muted);line-height:1.5;margin:10px 0 0;}
    .fi-community-report{display:grid;gap:5px;margin-top:10px;padding:10px;border:1px solid #e6eeea;border-left:3px solid #7f9a8c;border-radius:5px;font-size:11px;overflow-wrap:anywhere;}
    .fi-community-report p{margin:0;white-space:pre-wrap;}
    .fi-community-report span,.fi-community-report figcaption{color:var(--fi-muted);}
    .fi-report-relation{display:grid;gap:3px;padding:8px;background:#f3f7f5;border-radius:4px;font-size:10px;}
    .fi-report-relation b{color:#6c5418;font-weight:700;}
    .fi-community-report a{color:#176b52;font-weight:700;text-decoration:none;}
    .fi-community-report figure{margin:4px 0;}
    .fi-community-report img{display:block;max-width:100%;max-height:360px;object-fit:contain;background:#edf2ef;}
    .fi-community-report figcaption{font-size:10px;margin-top:4px;}
    .fi-lifecycle{display:grid;gap:6px;}
    .fi-life-step{font-size:11px;color:#87958f;display:flex;gap:7px;align-items:center;}
    .fi-life-step.current{color:#765200;font-weight:800;}
    .fi-checklist{display:grid;gap:7px;margin-top:14px;padding-top:11px;border-top:1px solid #edf1ef;}
    .fi-checklist label{font-size:11px;display:flex;gap:8px;align-items:center;color:var(--fi-muted);}
    .fi-checklist input{accent-color:var(--fi-green);margin:0;}
    .fi-unsynced{border-top:1px solid #edf1ef;padding-top:10px;}
    .fi-ai p{font-size:12px;line-height:1.55;margin:8px 0;color:var(--fi-muted);}
    .fi-ai p b{color:var(--fi-green);font-size:10px;}
    .fi-ai small{color:var(--fi-muted);}
    .fi-empty-line{font-size:12px;color:var(--fi-muted);line-height:1.5;margin:0;}
    .fi-timeline-item{display:grid;grid-template-columns:minmax(135px,auto) 1fr;gap:5px 12px;padding:9px 0;border-top:1px solid #edf1ef;font-size:12px;}
    .fi-timeline-item time{font-variant-numeric:tabular-nums;color:var(--fi-green);font-weight:700;}
    .fi-timeline-item small{grid-column:2;color:var(--fi-muted);font-size:10px;}
    .fi-list-layout{display:grid;grid-template-columns:minmax(260px,.72fr) minmax(0,1.5fr);gap:12px;margin-top:14px;}
    .fi-mobile-tabs{display:none;}
    .fi-system-status{font-size:11px;font-weight:700;color:var(--fi-muted);}
    .fi-feed-panel{background:#fff;border:1px solid var(--fi-line);border-radius:7px;min-width:0;overflow:hidden;}
    .fi-feed-head{padding:12px 14px;border-bottom:1px solid var(--fi-line);display:flex;justify-content:space-between;align-items:center;gap:8px;}
    .fi-feed-head h2{font-size:13px;margin:0;}
    .fi-status{display:inline-flex;align-items:center;gap:6px;font-size:10px;font-weight:800;color:var(--fi-muted);}
    .fi-status i{width:7px;height:7px;background:#9aa8a2;border-radius:50%;}
    .fi-status.live{color:#176b52;}.fi-status.live i{background:#2b8a65;}
    .fi-status.cached,.fi-status.stale{color:#85620f;}.fi-status.cached i,.fi-status.stale i{background:#c08a1c;}
    .fi-event-list{max-height:62vh;overflow:auto;}
    .fi-event-row{border-bottom:1px solid #edf1ef;}
    .fi-event-row.selected{background:#f2f7f4;box-shadow:inset 3px 0 #176b52;}
    .fi-event-link{display:block;width:100%;min-height:44px;padding:12px 14px;border:0;background:transparent;color:inherit;text-align:left;font:inherit;cursor:pointer;}
    .fi-event-link:hover,.fi-event-link[aria-pressed="true"]{background:#f2f7f4;}
    .fi-event-link strong{font-size:12px;display:block;overflow-wrap:anywhere;}
    .fi-event-link span{display:block;font-size:10px;color:var(--fi-muted);margin-top:4px;}
    .fi-event-link .fi-select-hint{color:var(--fi-green);font-weight:700;}
    .fi-details-link{display:inline-flex;align-items:center;min-height:36px;margin:0 14px 8px;padding:0 8px;color:var(--fi-green);font-size:11px;font-weight:700;text-decoration:none;}
    .fi-map-panel{height:min(67vh,720px);min-height:460px;overflow:hidden;border:1px solid var(--fi-line);background:#e6ece8;}
    .fi-empty-state{padding:24px 14px;font-size:12px;color:var(--fi-muted);line-height:1.5;}
    .fi-skeleton{height:54px;margin:9px 12px;border-radius:5px;background:linear-gradient(90deg,#eef2ef 25%,#e3eae5 37%,#eef2ef 63%);background-size:400% 100%;animation:fi-shimmer 1.4s ease infinite;}
    @keyframes fi-shimmer{to{background-position:-100% 0}}
    @media(max-width:900px){.fi-investigation-grid,.fi-list-layout{grid-template-columns:1fr}.fi-mobile-tabs{display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-top:12px;padding:3px;border:1px solid var(--fi-line);border-radius:8px;background:#fff}.fi-mobile-tabs button{min-height:44px;border:0;border-radius:6px;background:transparent;color:var(--fi-muted);font:inherit;font-size:12px;font-weight:700}.fi-mobile-tabs button.active{background:#e8f1ec;color:var(--fi-green)}.fi-feed-panel.mobile-hidden,.fi-map-panel.mobile-hidden{display:none}.fi-event-list{max-height:calc(100vh - 260px)}.fi-map-panel{height:calc(100vh - 260px);min-height:360px}.fi-page-head{align-items:flex-start}}
    @media(max-width:540px){.fire-intel{padding:12px}.fi-data-grid{grid-template-columns:1fr}.fi-evidence-row{grid-template-columns:20px minmax(0,1fr)}.fi-evidence-state{grid-column:2}.fi-page-head h1{font-size:21px}.fi-timeline-item{grid-template-columns:1fr}.fi-timeline-item small{grid-column:1}}
  `}</style>
}

export function EventsList() {
  const { status, events, alerts, error, health, healthStatus, retry } = useFireEventFeed()
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [mobilePane, setMobilePane] = useState<'list' | 'map'>('list')
  const eventRefs = useRef(new Map<string, HTMLElement>())
  const systemStatus = healthStatus === 'LOADING' ? 'ĐANG KIỂM TRA' : healthStatus === 'UNAVAILABLE' ? 'CHƯA RÕ' : health.summary?.all_live ? 'LIVE' : 'DEGRADED'
  const observation = events
    .map(event => ({ date: event.detection.acq_date, time: formatAcquisitionTime(event.detection.acq_time) }))
    .filter(item => typeof item.date === 'string' && item.date)
    .sort((left, right) => `${right.date} ${right.time || ''}`.localeCompare(`${left.date} ${left.time || ''}`))[0]

  const selectEvent = (event: any) => {
    const eventId = String(event.hotspot_id || event.event_id)
    setSelectedEventId(eventId)
    window.dispatchEvent(new CustomEvent('ecochain-watch-fire', {
      detail: {
        eventId,
        lat: event.lat,
        lon: event.lon,
        acq_date: event.detection?.acq_date,
        acq_time: event.detection?.acq_time,
        sourceStatus: event.detection?.source_status,
      },
    }))
    if (window.matchMedia('(max-width: 900px)').matches) setMobilePane('map')
  }

  useEffect(() => {
    const highlight = (event: Event) => {
      const eventId = (event as CustomEvent).detail?.eventId
      if (typeof eventId !== 'string') return
      const matchingEvent = events.find(item => item.hotspot_id === eventId || item.event_id === eventId)
      if (!matchingEvent) return
      const stableId = String(matchingEvent.hotspot_id || matchingEvent.event_id)
      setSelectedEventId(stableId)
      requestAnimationFrame(() => eventRefs.current.get(stableId)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }))
    }
    window.addEventListener('ecochain-highlight-fire-signal', highlight)
    return () => window.removeEventListener('ecochain-highlight-fire-signal', highlight)
  }, [events])

  return (
    <div className="fire-intel"><InvestigationStyles />
      <main className="fi-investigation">
        <header className="fi-page-head">
          <div>
            <div className="fi-eyebrow">THEO DÕI ĐIỂM NGHI NGỜ</div>
            <h1>Sự kiện cháy</h1>
            <p>{status === 'LOADING' ? 'Đang tải dữ liệu FIRMS…' : isLiveSourceStatus(status) ? `${events.length} phát hiện FIRMS · ${alerts.length} tín hiệu trong quy trình xác minh.` : 'Phát hiện FIRMS là tín hiệu quan sát, không phải vụ cháy đã xác nhận.'}</p>
            {status !== 'LOADING' && isLiveSourceStatus(status) && <small className="fi-freshness">Nguồn FIRMS {status}{observation ? ` · Quan sát gần nhất ${observation.date}${observation.time ? ` ${observation.time}` : ''}` : ' · Chưa có thời điểm quan sát'}</small>}
          </div>
          <div className="fi-head-actions">
            <span className="fi-system-status">● Hệ thống {systemStatus}</span>
            <StatusPill status={status === 'LOADING' ? 'ĐANG TẢI' : status} />
            {status !== 'LOADING' && <button className="fi-button" onClick={retry} aria-label="Tải lại danh sách FIRMS"><RotateCw size={14} /> Thử lại</button>}
          </div>
        </header>
        <BacktestCard />
        <div className="fi-mobile-tabs" role="group" aria-label="Chế độ xem tín hiệu">
          <button className={mobilePane === 'list' ? 'active' : ''} aria-pressed={mobilePane === 'list'} onClick={() => setMobilePane('list')}>Danh sách ({eventCountLabel(status, events.length)})</button>
          <button className={mobilePane === 'map' ? 'active' : ''} aria-pressed={mobilePane === 'map'} onClick={() => setMobilePane('map')}>Bản đồ ({eventCountLabel(status, alerts.length)})</button>
        </div>
        <div className="fi-list-layout">
          <section className={`fi-feed-panel${mobilePane === 'map' ? ' mobile-hidden' : ''}`} aria-label="Danh sách phát hiện FIRMS">
            <div className="fi-feed-head"><h2>Phát hiện FIRMS</h2><span aria-live="polite">{eventCountLabel(status, events.length)}</span></div>
            <div className="fi-event-list">
              {status === 'LOADING' && <div aria-label="Đang tải danh sách FIRMS" aria-busy="true"><div className="fi-skeleton" /><div className="fi-skeleton" /><div className="fi-skeleton" /></div>}
              {status !== 'LOADING' && events.length === 0 && (
                <div className="fi-empty-state" role={error ? 'alert' : undefined}>
                  {error ? `Không thể tải dữ liệu FIRMS: ${error}` : isLiveSourceStatus(status) ? 'Không có tín hiệu trong khoảng thời gian đã chọn.' : `FIRMS ${status} — không có dữ liệu khả dụng.`}
                </div>
              )}
              {events.map(event => {
                const stableId = String(event.hotspot_id || event.event_id)
                return (
                  <article className={`fi-event-row${selectedEventId === stableId ? ' selected' : ''}`} key={stableId}
                    ref={element => { if (element) eventRefs.current.set(stableId, element); else eventRefs.current.delete(stableId) }}>
                    <button className="fi-event-link" type="button" aria-pressed={selectedEventId === stableId} onClick={() => selectEvent(event)}>
                      <strong>{event.status} · {event.event_id}</strong>
                      <span>{event.detection.acq_date || 'Chưa có ngày'}{formatAcquisitionTime(event.detection.acq_time) ? ` · ${formatAcquisitionTime(event.detection.acq_time)}` : ''}</span>
                      <span>{typeof event.lat === 'number' && typeof event.lon === 'number' ? `${event.lat.toFixed(6)}, ${event.lon.toFixed(6)}` : 'Chưa có dữ liệu tọa độ'}</span>
                      <span>{formatAdministrativeLocation(event.location)}</span>
                      {event.villageReference && <span>Điểm tham chiếu gần nhất: {event.villageReference.name}{event.distanceKm != null ? ` · ${event.distanceKm} km` : ''}</span>}
                      <span className="fi-select-hint">Chọn để xem trên bản đồ</span>
                    </button>
                    <Link className="fi-details-link" to={`/events/${encodeURIComponent(event.event_id)}`}>Chi tiết</Link>
                  </article>
                )
              })}
            </div>
          </section>
          <div className={`fi-map-panel${mobilePane === 'list' ? ' mobile-hidden' : ''}`}>
            <MapView fill fireAlerts={alerts} fireAlertsStatus={status} />
          </div>
        </div>
      </main>
    </div>
  )
}

export default function FireEventIntelligence() {
  const { id = '' } = useParams()
  const { status, events, health } = useFireEventFeed()
  const event = findFireEventById(events, id)
  return (
    <div className="fire-intel"><InvestigationStyles />
      {event ? <EventInvestigation event={event} health={health} /> : (
        <main className="fi-investigation">
          <header className="fi-page-head"><div><div className="fi-eyebrow">THEO DÕI ĐIỂM NGHI NGỜ</div><h1>Không tìm thấy sự kiện</h1><p>Chỉ tra cứu bằng mã sự kiện, không dò theo địa điểm lân cận.</p></div><StatusPill status={status === 'LOADING' ? 'ĐANG TẢI' : status} /></header>
          {status !== 'LOADING' && <p className="fi-empty-line">Sự kiện này không có trong dữ liệu FIRMS hiện tại.</p>}
          <Link className="fi-button" to="/events"><ArrowLeft size={15} /> Danh sách sự kiện</Link>
        </main>
      )}
    </div>
  )
}
