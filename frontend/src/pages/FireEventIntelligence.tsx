import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Clock3, Flame, MapPin, Radio, ShieldCheck } from 'lucide-react'
import MapView from '../components/MapView'
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

function formatAcquisitionTime(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const match = value.match(/^(\d{2})(\d{2})$/)
  return match ? `${match[1]}:${match[2]} UTC` : value
}

function useFireEventFeed() {
  const [feed, setFeed] = useState<{ status: string; events: any[]; error: string | null }>({
    status: 'LOADING', events: [], error: null,
  })
  const [health, setHealth] = useState<any>(null)

  useEffect(() => {
    let active = true
    fetch(`${API}/api/villages/fire-alert`, { cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.json()
      })
      .then(payload => {
        if (!active) return
        if (!isLiveSourceStatus(payload?.status)) {
          setFeed({ status: payload?.status || 'UNAVAILABLE', events: [], error: null })
          return
        }
        setFeed({ status: payload.status, events: buildEventListFromAlerts(payload), error: null })
      })
      .catch(error => {
        if (active) setFeed({ status: 'UNAVAILABLE', events: [], error: String(error) })
      })
    fetch(`${API}/api/health/geospatial`, { cache: 'no-store' })
      .then(response => response.ok ? response.json() : null)
      .then(payload => { if (active) setHealth(payload) })
      .catch(() => { if (active) setHealth(null) })
    return () => { active = false }
  }, [])

  return { ...feed, health }
}

function StatusPill({ status }: { status: string }) {
  const live = ['LIVE', 'CACHED'].includes(status)
  return <span className={`fi-status${live ? ' live' : ''}`}><i />{status}</span>
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
        <EvidenceRow label="Sentinel-2" state={satelliteState(s2Status, evidence.sentinel2)} detail={evidence.sentinel2 === true ? 'Bằng chứng gắn với sự kiện' : s2Status ? `Health nguồn: ${s2Status} · chưa có ảnh gắn với sự kiện` : 'Chưa có dữ liệu gắn với sự kiện'} />
        <EvidenceRow label="Sentinel-1" state={satelliteState(s1Status, evidence.sentinel1)} detail={evidence.sentinel1 === true ? 'Bằng chứng gắn với sự kiện' : s1Status ? `Health nguồn: ${s1Status} · chưa có ảnh gắn với sự kiện` : 'Chưa có dữ liệu gắn với sự kiện'} />
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
    .fi-feed-panel{background:#fff;border:1px solid var(--fi-line);border-radius:7px;min-width:0;overflow:hidden;}
    .fi-feed-head{padding:12px 14px;border-bottom:1px solid var(--fi-line);display:flex;justify-content:space-between;align-items:center;gap:8px;}
    .fi-feed-head h2{font-size:13px;margin:0;}
    .fi-status{display:inline-flex;align-items:center;gap:6px;font-size:10px;font-weight:800;color:var(--fi-muted);}
    .fi-status i{width:7px;height:7px;background:#9aa8a2;border-radius:50%;}
    .fi-status.live{color:#176b52;}.fi-status.live i{background:#2b8a65;}
    .fi-event-list{max-height:62vh;overflow:auto;}
    .fi-event-link{display:block;padding:12px 14px;border-bottom:1px solid #edf1ef;color:inherit;text-decoration:none;}
    .fi-event-link:hover,.fi-event-link[aria-current="page"]{background:#f2f7f4;}
    .fi-event-link strong{font-size:12px;display:block;overflow-wrap:anywhere;}
    .fi-event-link span{display:block;font-size:10px;color:var(--fi-muted);margin-top:4px;}
    .fi-map-panel{height:min(67vh,720px);min-height:460px;overflow:hidden;border:1px solid var(--fi-line);background:#e6ece8;}
    .fi-empty-state{padding:24px 14px;font-size:12px;color:var(--fi-muted);line-height:1.5;}
    @media(max-width:900px){.fi-investigation-grid,.fi-list-layout{grid-template-columns:1fr}.fi-event-list{max-height:300px}.fi-map-panel{height:55vh;min-height:360px}}
    @media(max-width:540px){.fire-intel{padding:12px}.fi-data-grid{grid-template-columns:1fr}.fi-evidence-row{grid-template-columns:20px minmax(0,1fr)}.fi-evidence-state{grid-column:2}.fi-page-head h1{font-size:21px}.fi-timeline-item{grid-template-columns:1fr}.fi-timeline-item small{grid-column:1}}
  `}</style>
}

export function EventsList() {
  const { status, events, error } = useFireEventFeed()
  return (
    <div className="fire-intel"><InvestigationStyles />
      <main className="fi-investigation">
        <header className="fi-page-head">
          <div><div className="fi-eyebrow">THEO DÕI ĐIỂM NGHI NGỜ</div><h1>Thông tin sự kiện</h1><p>Phát hiện FIRMS là tín hiệu quan sát, không phải vụ cháy đã xác nhận.</p></div>
          <StatusPill status={status === 'LOADING' ? 'ĐANG TẢI' : status} />
        </header>
        <div className="fi-list-layout">
          <section className="fi-feed-panel" aria-label="FIRMS events">
            <div className="fi-feed-head"><h2>Danh sách phát hiện</h2><span>{events.length}</span></div>
            <div className="fi-event-list">
              {status === 'LOADING' && <div className="fi-empty-state">Đang tải dữ liệu FIRMS…</div>}
              {status !== 'LOADING' && events.length === 0 && <div className="fi-empty-state">{error ? 'FIRMS unavailable — không tạo sự kiện giả.' : status === 'LIVE' || status === 'CACHED' || status === 'STALE' ? 'Chưa có dữ liệu phát hiện.' : `FIRMS ${status} — không tạo sự kiện giả.`}</div>}
              {events.map(event => (
                <Link className="fi-event-link" to={`/events/${encodeURIComponent(event.event_id)}`} key={event.event_id}>
                  <strong>{event.status} · {event.event_id}</strong>
                  <span>{event.detection.acq_date || 'Chưa có ngày'}{formatAcquisitionTime(event.detection.acq_time) ? ` · ${formatAcquisitionTime(event.detection.acq_time)}` : ''}</span>
                  <span>{typeof event.lat === 'number' && typeof event.lon === 'number' ? `${event.lat.toFixed(6)}, ${event.lon.toFixed(6)}` : 'Chưa có dữ liệu tọa độ'}</span>
                  <span>{formatAdministrativeLocation(event.location)}</span>
                  {event.villageReference && <span>Điểm tham chiếu gần nhất: {event.villageReference.name}{event.distanceKm != null ? ` · ${event.distanceKm} km` : ''}</span>}
                </Link>
              ))}
            </div>
          </section>
          <div className="fi-map-panel"><MapView fill /></div>
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
