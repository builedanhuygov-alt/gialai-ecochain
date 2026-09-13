import { useEffect, useMemo, useRef, useState } from 'react'
import { api, photoUrl, uploadProposalPhoto } from '../services/api'
import { useLang } from '../i18n'
import {
  AlertTriangle, Clock, Eye, Flame, Image as ImageIcon, MapPin, Radio,
  RefreshCw, Search, ShieldCheck,
} from 'lucide-react'

type Post = {
  id: string; status: string; title?: string; administrative_unit_id?: string
  confidence?: number; data_type?: string; source?: string; created_at?: string
  proposed_by?: string; payload?: any
}
type Detail = Post & {
  confirmations?: { user_id: string; confirmed: boolean; comment?: string }[]
  photos?: { id: number; file_hash: string; is_duplicate?: boolean }[]
}

type Sev = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
type VStatus = 'CHỜ XÁC MINH' | 'ĐANG XÁC MINH' | 'ĐÃ XÁC MINH' | 'ĐÃ DUYỆT' | 'BỊ TỪ CHỐI'

const SEV_COLOR: Record<Sev, string> = { CRITICAL: '#DC2626', HIGH: '#EA580C', MEDIUM: '#D97706', LOW: '#15803D' }
const SEV_VI: Record<Sev, string> = { CRITICAL: 'NGUY CẤP', HIGH: 'CAO', MEDIUM: 'TRUNG BÌNH', LOW: 'THẤP' }

// API status → verification state (derived, no invented states)
export function toVStatus(status: string, confirmCount: number): VStatus {
  if (status === 'OFFICIAL_VERIFIED' || status === 'VERIFIED') return 'ĐÃ DUYỆT'
  if (status === 'COMMUNITY_VERIFIED') return 'ĐÃ XÁC MINH'
  if (status === 'REJECTED') return 'BỊ TỪ CHỐI'
  return confirmCount > 0 ? 'ĐANG XÁC MINH' : 'CHỜ XÁC MINH'
}

// Severity from AI confidence (API posts carry no severity field).
// Never escalates to CRITICAL — that requires human/field confirmation.
export function sevOfConfidence(conf?: number): Sev {
  if (typeof conf !== 'number') return 'MEDIUM'
  if (conf >= 80) return 'HIGH'
  if (conf >= 50) return 'MEDIUM'
  return 'LOW'
}

export type TrustInput = {
  status: string; confirmations: number; hasPhoto: boolean; source?: string;
}
// Report trust score (0–98): transparent heuristic, labeled as report
// confidence — NOT a scientific probability.
export function trustOf(t: TrustInput): number {
  let s = 45
  if (t.status === 'OFFICIAL_VERIFIED' || t.status === 'VERIFIED') s += 15
  else if (t.status === 'COMMUNITY_VERIFIED') s += 12
  if (t.hasPhoto) s += 10
  s += Math.min(15, t.confirmations * 5)
  const src = (t.source || '').toLowerCase()
  if (/kiểm lâm|đội hiện trường|hat kiem lam/.test(src)) s += 10
  else if (/camera/.test(src)) s += 5
  else if (/cộng đồng|cong dong|community/.test(src)) s += 3
  return Math.min(98, s)
}

const avatarColor = (name?: string)=>{
  const colors = ['#0F766E','#6366F1','#F59E0B','#EC4899','#0EA5E9','#84CC16']
  let h = 0
  for(const c of (name || 'E')) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return colors[h % colors.length]
}

function timeAgo(s?: string){  if(!s) return ''
  const t = new Date(s).getTime()
  if(Number.isNaN(t)) return s
  const m = Math.max(0, Math.round((Date.now() - t) / 60000))
  if(m < 1) return 'vừa xong'
  if(m < 60) return `${m} phút trước`
  const h = Math.round(m / 60)
  if(h < 24) return `${h} giờ trước`
  return `${Math.round(h / 24)} ngày trước`
}

// ── Demo field reports (DỮ LIỆU MINH HỌA — shown ONLY when the live feed
// is empty; verify actions are disabled for these rows) ──────────────────────
export type DemoReport = {
  id: string; title: string; desc: string; area: string; minsAgo: number;
  source: string; sev: Sev; status: VStatus;
  flags: { smoke?: boolean; fire?: boolean; spread?: boolean; support?: boolean };
  yes: number; no: number; photos: number;
}
export const DEMO_REPORTS: DemoReport[] = [
  { id: 'FR-0926-014', title: 'Phát hiện khói dày phía Bắc khu vực rừng phòng hộ',
    desc: 'Quan sát thấy cột khói lớn từ khu vực rừng phía Bắc, gió đang thổi về NE. Tầm nhìn giảm, cần kiểm tra hiện trường trước khi gió đổi hướng.',
    area: 'Xã Sơn, Gia Lai', minsAgo: 2, source: 'Đội hiện trường', sev: 'HIGH', status: 'CHỜ XÁC MINH',
    flags: { smoke: true, spread: true }, yes: 2, no: 0, photos: 2 },
  { id: 'FR-0926-011', title: 'Có dấu hiệu cháy thực bì gần tuyến đường',
    desc: 'Vệt khói mỏng dọc tuyến đường tuần tra, mùi khét nhẹ. Chưa thấy lửa hở, đề nghị tổ gần nhất kiểm tra.',
    area: 'Ia Mơr, Chư Prông', minsAgo: 26, source: 'Cộng đồng', sev: 'MEDIUM', status: 'ĐANG XÁC MINH',
    flags: { smoke: true }, yes: 1, no: 0, photos: 1 },
  { id: 'FR-0926-009', title: 'Camera hiện trường ghi nhận vùng nhiệt bất thường',
    desc: 'Camera tháp canh ghi nhận vùng nhiệt tăng đột biến lúc rạng sáng. Đang đối chiếu ảnh vệ tinh, chưa điều động.',
    area: 'Kbang, Gia Lai', minsAgo: 58, source: 'Camera', sev: 'MEDIUM', status: 'CHỜ XÁC MINH',
    flags: { fire: true }, yes: 0, no: 0, photos: 0 },
  { id: 'FR-0926-007', title: 'Đội tuần tra xác nhận không còn lửa',
    desc: 'Kiểm tra thực địa điểm báo cháy hôm qua: không còn lửa hở, còn âm ỉ gốc cây đã xử lý. Đề xuất đóng báo cáo.',
    area: 'An Khê, Gia Lai', minsAgo: 180, source: 'Kiểm lâm', sev: 'LOW', status: 'ĐÃ XÁC MINH',
    flags: {}, yes: 3, no: 0, photos: 1 },
]

function Gallery(){
  const [open, setOpen] = useState<string | null>(null)
  const [photos, setPhotos] = useState<any[]>([])
  const [loaded, setLoaded] = useState(false)
  useEffect(()=>{
    api.recentPhotos(6).then((d: any)=> setPhotos(Array.isArray(d?.photos) ? d.photos : [])).catch(()=> setPhotos([])).finally(()=> setLoaded(true))
  },[])
  useEffect(()=>{
    const h = (e: KeyboardEvent)=> { if(e.key === 'Escape') setOpen(null) }
    window.addEventListener('keydown', h)
    return ()=> window.removeEventListener('keydown', h)
  },[])
  return (
    <section className="cmn-panel" aria-label="Ảnh hiện trường">
      <div className="cmn-kicker">ẢNH HIỆN TRƯỜNG</div>
      <div className="cmn-sub">Hình ảnh do mạng lưới hiện trường cung cấp</div>
      {loaded && photos.length === 0 && (
        <div className="cmn-empty">
          <ImageIcon size={20} />
          <b>CHƯA CÓ ẢNH HIỆN TRƯỜNG</b>
          <p>Hình ảnh xác minh sẽ xuất hiện tại đây.</p>
        </div>
      )}
      {photos.length > 0 && (
      <div style={{display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:8, marginTop:10}}>
        {photos.map((p:any)=> (
          <button key={p.id} onClick={()=> setOpen(photoUrl(p.url))} aria-label={`Xem ảnh hiện trường ${p.id}`}
            style={{border:0, padding:0, background:'none', cursor:'zoom-in'}}>
            <img src={photoUrl(p.thumb_url || p.url)} alt={`Ảnh hiện trường ${p.id}`} loading="lazy"
              style={{width:'100%', height:96, objectFit:'cover', borderRadius:10, display:'block', border:'1px solid #E2E8E5'}} />
          </button>
        ))}
      </div>
      )}
      {open && (
        <div onClick={()=> setOpen(null)} role="dialog" aria-label="Xem ảnh hiện trường"
          style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.8)', zIndex:60, display:'grid', placeItems:'center', padding:16}}>
          <figure style={{margin:0, maxWidth:640, width:'100%'}}>
            <img src={open} alt="Ảnh hiện trường" style={{width:'100%', borderRadius:12}} />
            <figcaption style={{color:'#fff', fontSize:12, marginTop:8, textAlign:'center'}}>Ảnh do cộng đồng tải lên · ESC để đóng</figcaption>
          </figure>
        </div>
      )}
    </section>
  )
}

function Lessons(){
  const [rows, setRows] = useState<any[]>([])
  useEffect(()=>{
    api.learning().then((d: any)=> setRows(Array.isArray(d) ? d.slice(0, 5) : [])).catch(()=> setRows([]))
  },[])
  if(rows.length === 0) return null
  return (
    <section className="cmn-panel" aria-label="Bài học thực tế">
      <div className="cmn-kicker">BÀI HỌC TỪ THỰC TẾ</div>
      <div className="cmn-sub">AI dự đoán → thực địa kiểm chứng → ghi nhận để lần sau chính xác hơn</div>
      {rows.map((l: any, i: number)=> (
        <div key={i} style={{fontSize:13, border:'1px solid #F1F5F9', borderRadius:10, padding:'8px 10px', marginTop:6}}>
          <div>🔮 Dự đoán: {l.prediction || 'MISSING'}</div>
          <div>✅ Thực tế: {l.outcome || 'MISSING'}</div>
          <span style={{fontSize:11, padding:'2px 8px', borderRadius:999, background: l.prediction_correct ? '#DCFCE7' : '#FEE2E2', fontWeight:700}}>
            {l.prediction_correct ? 'AI ĐÚNG' : 'AI SAI. Đã học'}
          </span>
        </div>
      ))}
    </section>
  )
}

function SuggestedMissions(){
  const [items, setItems] = useState<any[]>([])
  const [made, setMade] = useState<Record<string, string>>({})
  useEffect(()=>{
    api.alertList('ACTIVE').then((d: any)=>{
      const rows = (Array.isArray(d) ? d : []).slice(0, 3)
      setItems(rows)
    }).catch(()=> setItems([]))
  },[])
  const create = async (a: any)=>{
    try{
      const r: any = await api.createMission({
        goal: `Xác minh ${a.title || 'điểm nguy cơ'} tại ${a.administrative_unit_id || ''}`.trim(),
        scope: a.administrative_unit_id || 'Province',
      })
      setMade(m => ({ ...m, [a.id]: r.mission_id || 'đã tạo' }))
    }catch{}
  }
  if(items.length === 0) return null
  return (
    <section className="cmn-panel" aria-label="Nhiệm vụ AI đề xuất">
      <div className="cmn-kicker">NHIỆM VỤ AI ĐỀ XUẤT</div>
      <div className="cmn-sub">Sinh từ cảnh báo đang hoạt động — bấm để tạo nhiệm vụ thật</div>
      {items.map((a: any)=> (
        <div key={a.id} style={{display:'flex', gap:8, alignItems:'center', fontSize:13, border:'1px solid #F1F5F9', borderRadius:10, padding:'8px 10px', marginTop:6}}>
          <div style={{flex:1}}><b>{a.title || a.risk_type}</b> · {a.administrative_unit_id} · mức {a.level}</div>
          {made[a.id]
            ? <a href="/missions" style={{fontSize:12, color:'#0F766E', fontWeight:700}}>Đã tạo ✓ xem</a>
            : <button onClick={()=> create(a)} style={{fontSize:12, background:'#0F766E', color:'#fff', border:0, borderRadius:999, padding:'6px 12px'}}>Tạo nhiệm vụ</button>}
        </div>
      ))}
    </section>
  )
}

export default function Community(){
  const { t } = useLang()
  const [nick, setNick] = useState(()=> localStorage.getItem('ecogl_nick') || `ban-${Math.floor(1000 + Math.random() * 9000)}`)
  const [posts, setPosts] = useState<Post[]>([])
  const [q, setQ] = useState('')
  const [fStatus, setFStatus] = useState<'ALL'|VStatus>('ALL')
  const [fSev, setFSev] = useState<'ALL'|Sev>('ALL')
  const [fSource, setFSource] = useState<string>('ALL')
  const [sort, setSort] = useState<'new'|'priority'|'unverified'>('new')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [comment, setComment] = useState('')
  const [report, setReport] = useState('')
  const [reportArea, setReportArea] = useState('')
  const [reportSource, setReportSource] = useState('Cộng đồng')
  const [reportSev, setReportSev] = useState<Sev>('MEDIUM')
  const [flagSmoke, setFlagSmoke] = useState(false)
  const [flagFire, setFlagFire] = useState(false)
  const [flagSpread, setFlagSpread] = useState(false)
  const [flagSupport, setFlagSupport] = useState(false)
  const [reportSent, setReportSent] = useState('')
  const [toast, setToast] = useState('')
  const [preview, setPreview] = useState<{ src: string; meta: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploadFor, setUploadFor] = useState<string | null>(null)

  const refresh = async ()=>{
    try{
      const d: any = await api.proposals()
      setPosts(Array.isArray(d) ? d : [])
      setError('')
    }catch(e:any){ setError(String(e.message || e)) }
    finally{ setLoading(false) }
  }
  useEffect(()=>{ refresh() },[])
  useEffect(()=>{ try{ localStorage.setItem('ecogl_nick', nick) }catch{} },[nick])
  useEffect(()=>{
    if(!toast) return
    const id = setTimeout(()=> setToast(''), 2600)
    return ()=> clearTimeout(id)
  },[toast])
  useEffect(()=>{
    const h = (e: KeyboardEvent)=> { if(e.key === 'Escape') setPreview(null) }
    window.addEventListener('keydown', h)
    return ()=> window.removeEventListener('keydown', h)
  },[])

  const liveMode = posts.length > 0
  const openDetail = openId ? detail : null
  const openConfs = openDetail?.confirmations ?? []
  const openYes = openConfs.filter(c=> c.confirmed).length
  const openHasPhoto = (openDetail?.photos?.length ?? 0) > 0

  // Unified feed: live API rows, or labeled demo rows when the feed is empty.
  const feed = useMemo(()=>{
    if(liveMode){
      return posts.map(p=> {
        const confs = openId === p.id ? openConfs : []
        return {
          key: p.id, apiId: p.id, demo: false,
          title: p.title || p.data_type || 'Báo cáo hiện trường',
          desc: '', area: p.administrative_unit_id || '', createdAt: p.created_at || null,
          source: p.source || (p as any).proposed_by || 'Cộng đồng',
          sev: sevOfConfidence(p.confidence), status: toVStatus(p.status, confs.filter(c=> c.confirmed).length),
          flags: {} as Record<string, boolean>,
          yes: openId === p.id ? openYes : 0, no: 0,
          photos: openId === p.id && openHasPhoto ? (openDetail?.photos?.length ?? 0) : 0,
          hasPhoto: openId === p.id && openHasPhoto,
          trust: trustOf({ status: p.status, confirmations: openId === p.id ? openYes : 0, hasPhoto: openId === p.id && openHasPhoto, source: p.source }),
          by: (p as any).proposed_by || 'AI ForestGuard', rawStatus: p.status,
        }
      })
    }
    return DEMO_REPORTS.map(d=> ({
      key: d.id, apiId: null as string | null, demo: true,
      title: d.title, desc: d.desc, area: d.area,
      createdAt: new Date(Date.now() - d.minsAgo * 60000).toISOString(),
      source: d.source, sev: d.sev, status: d.status,
      flags: { smoke: d.flags.smoke, fire: d.flags.fire, spread: d.flags.spread, support: d.flags.support },
      yes: d.yes, no: d.no, photos: d.photos, hasPhoto: d.photos > 0,
      trust: trustOf({ status: d.status === 'ĐÃ XÁC MINH' ? 'COMMUNITY_VERIFIED' : 'PENDING', confirmations: d.yes, hasPhoto: d.photos > 0, source: d.source }),
      by: d.source, rawStatus: d.status,
    }))
  }, [posts, liveMode, openId, openDetail, openConfs, openYes, openHasPhoto])

  const sources = useMemo(()=> [...new Set(feed.map(f=> f.source))], [feed])
  const filtered = useMemo(()=>{
    const query = q.trim().toLowerCase()
    let rows = feed.filter(f =>
      (fStatus === 'ALL' || f.status === fStatus) &&
      (fSev === 'ALL' || f.sev === fSev) &&
      (fSource === 'ALL' || f.source === fSource) &&
      (!query || f.title.toLowerCase().includes(query) || f.area.toLowerCase().includes(query) || f.key.toLowerCase().includes(query)))
    const sevRank: Record<Sev, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }
    if(sort === 'priority') rows = [...rows].sort((a, b)=> sevRank[a.sev] - sevRank[b.sev] || b.trust - a.trust)
    else if(sort === 'unverified') rows = [...rows].sort((a, b)=> (a.status === 'CHỜ XÁC MINH' ? 0 : 1) - (b.status === 'CHỜ XÁC MINH' ? 0 : 1))
    else rows = [...rows].sort((a, b)=> +new Date(b.createdAt || 0) - +new Date(a.createdAt || 0))
    return rows
  }, [feed, q, fStatus, fSev, fSource, sort])

  const needCount = feed.filter(f=> f.status === 'CHỜ XÁC MINH' || f.status === 'ĐANG XÁC MINH').length
  const doneCount = feed.filter(f=> f.status === 'ĐÃ XÁC MINH' || f.status === 'ĐÃ DUYỆT').length
  const queue = [...feed]
    .filter(f=> f.status === 'CHỜ XÁC MINH' || f.status === 'ĐANG XÁC MINH')
    .sort((a, b)=> ({ CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 } as Record<Sev, number>)[a.sev] - ({ CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 } as Record<Sev, number>)[b.sev])
    .slice(0, 5)

  const open = async (id: string)=>{
    if(openId === id){ setOpenId(null); setDetail(null); return }
    setOpenId(id); setDetail(null)
    try{ setDetail(await api.proposalDetail(id)) }
    catch(e:any){ setDetail({ id, status: 'UNKNOWN', title: `Không tải được: ${e.message || e}` }) }
  }

  const vote = async (id: string, confirmed: boolean)=>{
    if(!nick.trim()){ setError('Nhập biệt danh trước khi xác minh'); return }
    try{
      const r: any = await api.confirmProposal(id, { user_id: nick.trim(), confirmed, comment: comment.trim() || undefined })
      setComment('')
      setPosts(ps => ps.map(p => p.id === id ? { ...p, status: r.proposal_status || p.status } : p))
      const d: any = await api.proposalDetail(id).catch(()=> null)
      if(d) setDetail(d)
      setToast(confirmed ? 'Đã ghi nhận xác minh' : 'Đã ghi nhận phản đối')
    }catch(e:any){ setError(String(e.message || e).slice(0, 200)) }
  }

  const sendReport = async ()=>{
    if(!report.trim()) return
    try{
      const tags = [`nguồn: ${reportSource}`, `mức: ${SEV_VI[reportSev]}`]
      const marks: string[] = []
      if(flagSmoke) marks.push('có khói')
      if(flagFire) marks.push('có lửa')
      if(flagSpread) marks.push('có nguy cơ lan')
      if(flagSupport) marks.push('cần hỗ trợ')
      if(marks.length) tags.push(`dấu hiệu: ${marks.join(', ')}`)
      const r: any = await api.mobileReport({ user_id: nick.trim() || 'anon', description: `${report.trim()} [${tags.join(' | ')}]`, area: reportArea.trim() || undefined })
      setReportSent(`Đã gửi · mã ${r.report_id}`)
      setReport(''); setReportArea(''); setFlagSmoke(false); setFlagFire(false); setFlagSpread(false); setFlagSupport(false)
      setToast('Đã gửi báo cáo hiện trường')
    }catch(e:any){ setError(String(e.message || e).slice(0, 200)) }
  }

  const onFile = async (id: string, f: File | undefined)=>{
    if(!f) return
    try{
      const r: any = await uploadProposalPhoto(id, f, nick.trim() || 'anon')
      setError('')
      const d: any = await api.proposalDetail(id).catch(()=> null)
      if(d) setDetail(d)
      if(r.is_duplicate) setError('Ảnh trùng với bằng chứng đã có (hash match) — vẫn được lưu để đối chiếu')
      else setToast('Đã tải ảnh bằng chứng')
    }catch(e:any){ setError(String(e.message || e).slice(0, 200)) }
    finally{ setUploadFor(null) }
  }

  return (
    <div className="cmn rise-in">
      <style>{`
        .cmn{ display:flex; flex-direction:column; gap:14px; }
        .cmn-tophead{ display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
        .cmn-title{ font-size:20px; font-weight:800; letter-spacing:-0.2px; margin:0; }
        .cmn-sub{ font-size:13px; color:#64748B; margin-top:2px; }
        .cmn-live{ display:inline-flex; gap:6px; align-items:center; font-size:11px; font-weight:800; letter-spacing:0.5px; color:#0F766E; }
        .cmn-dot{ width:8px; height:8px; border-radius:999px; background:#10B981; flex:none; animation:cmnpulse 2.4s ease-out infinite; }
        @keyframes cmnpulse{ 0%,100%{ opacity:1 } 50%{ opacity:0.35 } }
        .cmn-panel{ background:#fff; border:1px solid #E2E8E5; border-radius:14px; padding:14px 16px; min-width:0; animation:cmnin 200ms ease-out; }
        @keyframes cmnin{ from{ opacity:0; transform:translateY(4px) } to{ opacity:1; transform:none } }
        .cmn-kicker{ font-size:11px; font-weight:800; letter-spacing:1px; color:#64748B; }
        .cmn-sub2{ font-size:12px; color:#64748B; margin-top:2px; }
        .cmn-grid{ display:grid; gap:14px; grid-template-columns:minmax(0,7fr) minmax(280px,5fr); align-items:start; }
        @media (max-width:1024px){ .cmn-grid{ grid-template-columns:1fr; } }
        .cmn-side{ display:flex; flex-direction:column; gap:14px; min-width:0; }
        .cmn-toolbar{ display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
        .cmn-search{ display:flex; gap:8px; align-items:center; flex:1; min-width:180px; background:#fff; border:1px solid #E2E8E5; border-radius:10px; padding:8px 12px; }
        .cmn-search input{ flex:1; min-width:0; border:0; outline:none; font-size:13px; background:transparent; }
        .cmn-select{ background:#fff; border:1px solid #E2E8E5; border-radius:10px; padding:8px 10px; font-size:12px; font-weight:700; }
        .cmn-card{ background:#fff; border:1px solid #E2E8E5; border-left:4px solid #94A3B8; border-radius:12px; padding:12px 14px; transition:border-color 150ms ease-out, transform 150ms ease-out; animation:cmnin 200ms ease-out; }
        .cmn-card{ transition:transform 200ms cubic-bezier(0.32,0.72,0,1), border-color 200ms cubic-bezier(0.32,0.72,0,1), box-shadow 200ms cubic-bezier(0.32,0.72,0,1); }
        .cmn-card:hover{ transform:translateY(-2px); border-color:#CBD5D1; box-shadow:0 8px 24px rgba(11,20,18,0.08); }
        .cmn-sev{ display:inline-flex; gap:6px; align-items:center; font-size:11px; font-weight:800; letter-spacing:0.5px; border-radius:8px; padding:3px 10px; color:#fff; }
        .cmn-code{ font-size:11px; font-weight:800; letter-spacing:0.6px; color:#64748B; font-variant-numeric:tabular-nums; }
        .cmn-ttl{ margin:6px 0 0; font-size:15px; font-weight:800; line-height:1.4; }
        .cmn-meta{ display:flex; gap:6px; align-items:center; font-size:12px; color:#64748B; margin-top:4px; flex-wrap:wrap; }
        .cmn-desc{ font-size:13px; color:#334155; line-height:1.55; margin-top:6px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
        .cmn-flags{ display:flex; gap:6px; flex-wrap:wrap; margin-top:8px; }
        .cmn-flag{ font-size:11px; font-weight:700; border-radius:8px; padding:3px 10px; background:#F1F5F9; color:#334155; border:1px solid #E2E8E5; }
        .cmn-trust{ display:flex; gap:10px; align-items:center; margin-top:10px; }
        .cmn-bar{ flex:1; height:8px; border-radius:999px; background:#F1F5F9; overflow:hidden; min-width:60px; }
        .cmn-bar i{ display:block; height:100%; border-radius:999px; background:#0F766E; transition:width 200ms ease-out; }
        .cmn-actions{ display:flex; gap:8px; margin-top:10px; }
        .cmn-btn{ flex:1; border:1px solid #E2E8E5; background:#fff; border-radius:10px; padding:8px 0; font-size:12px; font-weight:800; cursor:pointer; transition:background 150ms ease-out; }
        .cmn-btn:hover{ background:#F8FAF9; }
        .cmn-btn.primary{ background:#0F766E; border-color:#0F766E; color:#fff; }
        .cmn-btn.primary:hover{ background:#0B5C54; }
        .cmn-btn:disabled{ opacity:0.55; cursor:default; }
        .cmn-qrow{ display:flex; gap:8px; align-items:center; padding:8px 0; border-top:1px solid #F1F5F9; font-size:12px; }
        .cmn-trow{ display:flex; gap:8px; padding:6px 0; border-bottom:1px solid #F8FAF9; font-size:12px; align-items:center; }
        .cmn-telemetry{ display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:10px; }
        .cmn-tele{ background:#F8FAF9; border-radius:10px; padding:8px 10px; }
        .cmn-tele .n{ font-size:20px; font-weight:800; font-variant-numeric:tabular-nums; line-height:1; }
        .cmn-tele .l{ font-size:10px; font-weight:800; letter-spacing:0.6px; color:#64748B; margin-top:2px; }
        .cmn-pipe{ display:flex; align-items:center; gap:0; margin-top:10px; }
        .cmn-step{ flex:1; text-align:center; font-size:10px; font-weight:800; letter-spacing:0.4px; color:#94A3B8; padding:6px 2px; border-top:3px solid #E2E8E5; }
        .cmn-step.done{ color:#0F766E; border-top-color:#0F766E; }
        .cmn-step.now{ color:#0B1412; border-top-color:#F59E0B; }
        .cmn-field label{ font-size:11px; font-weight:800; letter-spacing:0.6px; color:#64748B; display:block; margin-bottom:4px; }
        .cmn-field input, .cmn-field select, .cmn-field textarea{ width:100%; border:1px solid #E2E8E5; border-radius:10px; padding:8px 12px; font-size:13px; font-family:inherit; background:#fff; }
        .cmn-checks{ display:flex; gap:6px; flex-wrap:wrap; margin-top:8px; }
        .cmn-check{ display:inline-flex; gap:6px; align-items:center; font-size:12px; font-weight:700; border:1px solid #E2E8E5; border-radius:999px; padding:5px 12px; cursor:pointer; background:#fff; }
        .cmn-check.on{ background:#FEF3C7; border-color:#F59E0B; }
        .cmn-toast{ position:fixed; bottom:20px; left:50%; transform:translateX(-50%); background:#0F766E; color:#fff; font-size:13px; font-weight:700; border-radius:10px; padding:10px 18px; z-index:80; animation:cmnin 180ms ease-out; }
        .cmn-empty{ text-align:center; padding:28px 16px; }
        .cmn-empty b{ display:block; font-size:14px; margin-top:8px; }
        .cmn-empty p{ font-size:12px; color:#64748B; margin:4px 0 0; }
        .cmn-badge-demo{ font-size:10px; font-weight:800; letter-spacing:0.5px; border-radius:6px; padding:2px 8px; background:#FEF3C7; color:#92400E; border:1px dashed #F59E0B; }
        @media (max-width:640px){ .cmn-actions{ flex-wrap:wrap; } .cmn-btn{ flex:1 1 40%; } }
        @media (prefers-reduced-motion: reduce){ .cmn *{ animation:none !important; transition:none !important; } }
        button:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible{ outline:2px solid #0F766E; outline-offset:2px; }
      `}</style>

      {/* HEADER */}
      <div className="cmn-tophead">
        <div style={{ flex: 1, minWidth: 200 }}>
          <h1 className="cmn-title">Thông tin hiện trường</h1>
          <div className="cmn-sub">Mạng lưới báo cáo và xác minh tình hình cháy rừng</div>
        </div>
        <span className="cmn-live"><span className="cmn-dot" />MẠNG LƯỚI ĐANG HOẠT ĐỘNG</span>
        <input value={nick} onChange={e=> setNick(e.target.value)} aria-label="Biệt danh" title="Biệt danh của bạn (dùng khi xác minh)"
          style={{border:'1px solid #E2E8E5', borderRadius:10, padding:'8px 12px', fontSize:13, width:150}} />
      </div>

      {/* TRUST PIPELINE */}
      <div className="cmn-panel" aria-label="Quy trình xác minh">
        <div className="cmn-pipe" role="list">
          {['BÁO CÁO', 'CỘNG ĐỒNG XÁC MINH', 'KIỂM LÂM DUYỆT', 'CHỈ HUY'].map((s, i)=> {
            const stage = doneCount > 0 ? 2 : needCount > 0 ? 1 : 0
            return <div key={s} role="listitem" className={`cmn-step${i < stage ? ' done' : i === stage ? ' now' : ''}`}>{s}</div>
          })}
        </div>
        <div className="cmn-sub" style={{ marginTop: 6 }}>BÁO CÁO → XÁC MINH CỘNG ĐỒNG (2 lượt) → DUYỆT CHÍNH THỨC</div>
      </div>

      <div className="cmn-grid">
        {/* MAIN */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          {/* COMPOSER */}
          <section className="cmn-panel" aria-label="Báo cáo hiện trường">
            <div className="cmn-kicker">BÁO CÁO HIỆN TRƯỜNG</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <div style={{width:36, height:36, borderRadius:999, background: avatarColor(nick), color:'#fff', display:'grid', placeItems:'center', fontWeight:800, flex:'none'}}>{(nick[0] || 'E').toUpperCase()}</div>
              <input value={report} onChange={e=> setReport(e.target.value)} placeholder="Bạn đang quan sát điều gì?" aria-label="Mô tả hiện trường"
                style={{flex:1, border:0, outline:'none', fontSize:14, background:'#F8FAF9', borderRadius:10, padding:'8px 14px', minWidth:0}}
                onKeyDown={e=> { if(e.key === 'Enter') sendReport() }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
              <div className="cmn-field"><label htmlFor="cmn-area">KHU VỰC</label>
                <input id="cmn-area" value={reportArea} onChange={e=> setReportArea(e.target.value)} placeholder="📍 Xã / huyện / khu vực" aria-label="Khu vực" /></div>
              <div className="cmn-field"><label htmlFor="cmn-src">NGUỒN BÁO CÁO</label>
                <select id="cmn-src" value={reportSource} onChange={e=> setReportSource(e.target.value)}>
                  {['Kiểm lâm', 'Đội hiện trường', 'Cộng đồng', 'Camera', 'Khác'].map(s=> <option key={s} value={s}>{s}</option>)}
                </select></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
              <div className="cmn-field"><label htmlFor="cmn-sev">MỨC ĐỘ</label>
                <select id="cmn-sev" value={reportSev} onChange={e=> setReportSev(e.target.value as Sev)}>
                  {(Object.keys(SEV_VI) as Sev[]).map(s=> <option key={s} value={s}>{SEV_VI[s]}</option>)}
                </select></div>
              <div className="cmn-field"><label>DẤU HIỆU (TÙY CHỌN)</label>
                <div className="cmn-checks" style={{ marginTop: 0 }}>
                  {([[ 'smoke', 'Có khói', flagSmoke, setFlagSmoke ], [ 'fire', 'Có lửa', flagFire, setFlagFire ], [ 'spread', 'Lan', flagSpread, setFlagSpread ], [ 'support', 'Cần hỗ trợ', flagSupport, setFlagSupport ]] as const).map(([k, label, v, set])=> (
                    <button key={k} type="button" className={`cmn-check${v ? ' on' : ''}`} aria-pressed={v} onClick={()=> set(!v)}>{label}</button>
                  ))}
                </div></div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button onClick={sendReport} className="cmn-btn primary" style={{ flex: 1 }}>GỬI BÁO CÁO</button>
            </div>
            {reportSent && <div style={{marginTop:8, fontSize:12, color:'#0F766E'}}>{reportSent} · kênh mobile (beta), bài AI sẽ lên feed sau khi quét</div>}
          </section>

          {/* TOOLBAR */}
          <div className="cmn-toolbar" role="toolbar" aria-label="Lọc báo cáo" style={{ background:'#fff', border:'1px solid #E2E8E5', borderRadius:12, padding:'10px 12px' }}>
            <div className="cmn-search">
              <Search size={14} style={{ color:'#94A3B8', flex:'none' }} />
              <input value={q} onChange={e=> setQ(e.target.value)} placeholder="Tìm kiếm báo cáo..." aria-label="Tìm kiếm báo cáo" />
            </div>
            <select className="cmn-select" value={fStatus} onChange={e=> setFStatus(e.target.value as 'ALL'|VStatus)} aria-label="Trạng thái">
              <option value="ALL">Trạng thái: Tất cả</option>
              {(['CHỜ XÁC MINH','ĐANG XÁC MINH','ĐÃ XÁC MINH','ĐÃ DUYỆT','BỊ TỪ CHỐI'] as VStatus[]).map(s=> <option key={s} value={s}>{s}</option>)}
            </select>
            <select className="cmn-select" value={fSev} onChange={e=> setFSev(e.target.value as 'ALL'|Sev)} aria-label="Mức độ">
              <option value="ALL">Mức độ: Tất cả</option>
              {(Object.keys(SEV_VI) as Sev[]).map(s=> <option key={s} value={s}>{SEV_VI[s]}</option>)}
            </select>
            <select className="cmn-select" value={fSource} onChange={e=> setFSource(e.target.value)} aria-label="Nguồn">
              <option value="ALL">Nguồn: Tất cả</option>
              {sources.map(s=> <option key={s} value={s}>{s}</option>)}
            </select>
            <select className="cmn-select" value={sort} onChange={e=> setSort(e.target.value as 'new'|'priority'|'unverified')} aria-label="Sắp xếp">
              <option value="new">Mới nhất</option>
              <option value="priority">Ưu tiên cao</option>
              <option value="unverified">Chờ xác minh</option>
            </select>
            <button onClick={refresh} className="cmn-btn" style={{ flex: 'none', padding: '8px 12px' }} aria-label="Tải lại"><RefreshCw size={14} /> Tải lại</button>
          </div>

          {/* FEED */}
          <div role="list" aria-label="Báo cáo hiện trường" style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <div className="cmn-kicker">FIELD REPORTS · {filtered.length}</div>
            {loading && <div className="cmn-panel">Đang tải feed...</div>}
            {error && <div className="cmn-panel" style={{borderColor:'#F59E0B'}}>⚠ {error}</div>}
            {!loading && filtered.length === 0 && (
              <div className="cmn-panel">
                <div className="cmn-empty">
                  <Radio size={22} style={{ color:'#94A3B8' }} />
                  <b>CHƯA CÓ BÁO CÁO HIỆN TRƯỜNG</b>
                  <p>Thông tin từ mạng lưới hiện trường sẽ xuất hiện tại đây.</p>
                  <p style={{ marginTop: 6 }}><span className="cmn-live" style={{ justifyContent:'center' }}><span className="cmn-dot" />Mạng lưới đang hoạt động</span></p>
                </div>
              </div>
            )}
            {!liveMode && !loading && (
              <div className="cmn-panel" style={{ borderStyle:'dashed' }}>
                <span className="cmn-badge-demo">DỮ LIỆU MINH HỌA</span>
                <div className="cmn-sub" style={{ marginTop: 4 }}>Feed trực tiếp trống — hiển thị báo cáo mẫu để minh họa luồng xác minh.</div>
              </div>
            )}
            {filtered.map(f=> {
              const isOpen = openId === f.key && !f.demo
              const confs = isOpen ? openConfs : []
              return (
                <article key={f.key} role="listitem" className="cmn-card" style={{ borderLeftColor: SEV_COLOR[f.sev] }}>
                  <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
                    <span className="cmn-sev" style={{ background: SEV_COLOR[f.sev] }}>
                      {f.sev === 'CRITICAL' ? <AlertTriangle size={12} /> : f.sev === 'HIGH' ? <Flame size={12} /> : f.sev === 'MEDIUM' ? <Eye size={12} /> : <ShieldCheck size={12} />}
                      {f.status}
                    </span>
                    <span className="cmn-code">{f.demo ? f.key : `FW-${String(f.key).slice(0, 6).toUpperCase()}`}</span>
                    {f.demo && <span className="cmn-badge-demo">MINH HỌA</span>}
                    <span style={{ flex: 1 }} />
                    <span className="cmn-meta" style={{ marginTop: 0 }}><Clock size={12} />{f.createdAt ? timeAgo(f.createdAt) : ''}</span>
                  </div>
                  <h3 className="cmn-ttl">{f.title}</h3>
                  <div className="cmn-meta"><MapPin size={12} />{f.area || 'Gia Lai'}</div>
                  {f.desc && <div className="cmn-desc">{f.desc}</div>}
                  {(f.flags.smoke || f.flags.fire || f.flags.spread || f.flags.support) && (
                    <div className="cmn-flags" aria-label="Dấu hiệu">
                      {f.flags.smoke && <span className="cmn-flag">Có khói</span>}
                      {f.flags.fire && <span className="cmn-flag">Có lửa</span>}
                      {f.flags.spread && <span className="cmn-flag">Nguy cơ lan</span>}
                      {f.flags.support && <span className="cmn-flag">Cần hỗ trợ</span>}
                    </div>
                  )}
                  <div className="cmn-trust">
                    <span className="cmn-meta" style={{ marginTop: 0, whiteSpace:'nowrap' }}>Độ tin cậy báo cáo <b>{f.trust}%</b></span>
                    <span className="cmn-bar" role="progressbar" aria-valuenow={f.trust} aria-valuemin={0} aria-valuemax={100} aria-label={`Độ tin cậy ${f.trust}%`}><i style={{ width:`${f.trust}%` }} /></span>
                  </div>
                  <div className="cmn-meta">
                    <span>Nguồn: <b>{f.source}</b></span>
                    <span>·</span><span>Xác minh: <b>{f.yes} 👍 / {f.no} 👎</b></span>
                    {f.photos > 0 && <span>·</span>}
                    {f.photos > 0 && <span>📷 {f.photos} ảnh</span>}
                  </div>
                  <div className="cmn-actions">
                    {f.demo ? (
                      <button className="cmn-btn primary" disabled title="Dữ liệu minh họa — không thể xác minh">XÁC MINH</button>
                    ) : (
                      <button className="cmn-btn primary" onClick={()=> vote(f.apiId!, true)}>XÁC MINH{f.yes > 0 ? ` (${f.yes})` : ''}</button>
                    )}
                    {f.demo ? (
                      <button className="cmn-btn" disabled title="Dữ liệu minh họa">CHI TIẾT</button>
                    ) : (
                      <button className="cmn-btn" onClick={()=> open(f.apiId!)} aria-expanded={openId === f.key}>CHI TIẾT</button>
                    )}
                  </div>
                  {isOpen && openDetail && (
                    <div style={{marginTop:10, borderTop:'1px solid #F1F5F9', paddingTop:10, fontSize:13}}>
                      <div style={{display:'flex', gap:6, marginBottom:8}}>
                        <input value={comment} onChange={e=> setComment(e.target.value)} placeholder={t('com.commentPh')} aria-label="Bình luận" style={{flex:1, border:'1px solid #E2E8E5', borderRadius:10, padding:'6px 12px', fontSize:12, minWidth:0}} onKeyDown={e=> { if(e.key === 'Enter') vote(f.apiId!, true) }} />
                      </div>
                      {(openDetail.photos?.length ?? 0) > 0 && (
                        <div style={{fontSize:12, color:'#334155', marginBottom:6}}>📷 {openDetail.photos!.length} ảnh bằng chứng {openDetail.photos!.some(x=> x.is_duplicate) && '(có ảnh trùng hash)'}</div>
                      )}
                      {(openDetail.photos?.some((x:any)=> x.thumb_url || x.url)) && (
                        <div style={{display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:6, marginBottom:8}}>
                          {openDetail.photos!.filter((x:any)=> x.thumb_url || x.url).map((x:any)=> (
                            <button key={x.id} onClick={()=> setPreview({ src: photoUrl(x.url), meta: `${f.title} · ${f.area}` })}
                              aria-label={`Xem ảnh bằng chứng ${x.id}`}
                              style={{border:0, padding:0, background:'none', cursor:'zoom-in'}}>
                              <img src={photoUrl(x.thumb_url || x.url)} alt={`Ảnh bằng chứng ${x.id}`} loading="lazy"
                                style={{width:'100%', height:80, objectFit:'cover', borderRadius:8, display:'block'}} />
                            </button>
                          ))}
                        </div>
                      )}
                      {confs.length === 0 && <div style={{fontSize:12, color:'#64748B'}}>Chưa có xác minh nào. Bạn là người đầu tiên?</div>}
                      {confs.map((c, i)=> (
                        <div key={i} style={{display:'flex', gap:8, padding:'6px 0', borderBottom:'1px solid #F8FAF9', alignItems:'center'}}>
                          <div style={{width:28, height:28, borderRadius:999, background: avatarColor(c.user_id), color:'#fff', display:'grid', placeItems:'center', fontSize:12, fontWeight:800, flex:'none'}}>{(c.user_id[0] || 'E').toUpperCase()}</div>
                          <div><b>{c.user_id}</b> {c.confirmed ? '👍' : '👎'}{c.comment && <span> · {c.comment}</span>}</div>
                        </div>
                      ))}
                      <div style={{display:'flex', gap:6, marginTop:8, flexWrap:'wrap'}}>
                        <button className="cmn-btn" style={{ flex: 1 }} onClick={()=> vote(f.apiId!, false)}>👎 {t('com.object')}</button>
                        <button className="cmn-btn" style={{ flex: 1 }} onClick={()=> { setUploadFor(f.apiId!); setTimeout(()=> fileRef.current?.click(), 0) }}>📷 {t('com.photo')}</button>
                      </div>
                    </div>
                  )}
                </article>
              )
            })}
          </div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={e=> { if(uploadFor) onFile(uploadFor, e.target.files?.[0]); e.target.value = '' }} />
          <Gallery />
        </div>

        {/* SIDEBAR */}
        <aside className="cmn-side" aria-label="Thông tin tình báo">
          <section className="cmn-panel" aria-label="Trạng thái cộng đồng">
            <div className="cmn-kicker">COMMUNITY STATUS</div>
            <div className="cmn-live" style={{ marginTop: 6 }}><span className="cmn-dot" />NETWORK ONLINE</div>
            <div className="cmn-telemetry">
              <div className="cmn-tele"><div className="n">{feed.length}</div><div className="l">BÁO CÁO</div></div>
              <div className="cmn-tele"><div className="n">{needCount}</div><div className="l">CHỜ XÁC MINH</div></div>
              <div className="cmn-tele"><div className="n">{doneCount}</div><div className="l">ĐÃ XÁC MINH</div></div>
              <div className="cmn-tele"><div className="n">{new Set(feed.map(f=> f.by)).size}</div><div className="l">NGUỒN BÁO CÁO</div></div>
            </div>
          </section>

          <section className="cmn-panel" aria-label="Hàng chờ xác minh">
            <div className="cmn-kicker">VERIFICATION QUEUE</div>
            <div className="cmn-sub">{needCount} cần xử lý</div>
            {queue.length === 0 && <div className="cmn-sub" style={{ marginTop: 6 }}>Hàng chờ trống — mọi báo cáo đã được xử lý.</div>}
            {queue.map(f=> (
              <div key={f.key} className="cmn-qrow">
                <span style={{ width: 8, height: 8, borderRadius: 999, flex: 'none',
                  background: f.sev === 'CRITICAL' ? '#DC2626' : f.sev === 'HIGH' ? '#EA580C' : '#D97706' }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ display:'block', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{f.title}</b>
                  <span style={{ fontSize: 11, color: '#64748B' }}>{f.area}{f.createdAt ? ` · ${timeAgo(f.createdAt)}` : ''}</span>
                </span>
                {f.demo
                  ? <span className="cmn-badge-demo">MINH HỌA</span>
                  : <button className="cmn-btn" style={{ flex: 'none', padding: '6px 12px' }} onClick={()=> open(f.apiId!)}>XEM</button>}
              </div>
            ))}
          </section>

          <section className="cmn-panel" aria-label="Hoạt động gần đây">
            <div className="cmn-kicker">FIELD ACTIVITY</div>
            {[...filtered].slice(0, 6).map(f=> (
              <div key={f.key} className="cmn-trow">
                <span style={{ color:'#94A3B8', fontSize:11, minWidth:64 }}>{f.createdAt ? timeAgo(f.createdAt) : ''}</span>
                <span style={{ flex: 1, minWidth: 0 }}><b style={{ display:'block', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{f.title}</b>
                <span style={{ fontSize: 11, color: '#64748B' }}>{f.status}</span></span>
              </div>
            ))}
            {filtered.length === 0 && <div className="cmn-sub" style={{ marginTop: 6 }}>Chưa có hoạt động nào.</div>}
          </section>

          <Lessons />
          <SuggestedMissions />
        </aside>
      </div>

      {/* IMAGE PREVIEW MODAL */}
      {preview && (
        <div onClick={()=> setPreview(null)} role="dialog" aria-label="Xem ảnh hiện trường"
          style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.8)', zIndex:60, display:'grid', placeItems:'center', padding:16}}>
          <figure className="pop-in" style={{margin:0, maxWidth:640, width:'100%'}} onClick={e=> e.stopPropagation()}>
            <img src={preview.src} alt="Ảnh hiện trường" style={{width:'100%', borderRadius:12}} />
            <figcaption style={{color:'#fff', fontSize:12, marginTop:8, textAlign:'center', display:'flex', gap:8, justifyContent:'center', flexWrap:'wrap'}}>
              <span><b>BÁO CÁO</b> · {preview.meta}</span>
              <button onClick={()=> setPreview(null)} style={{background:'#fff', border:0, borderRadius:999, padding:'4px 14px', fontSize:12, fontWeight:700}}>Đóng (ESC)</button>
            </figcaption>
          </figure>
        </div>
      )}
      {toast && <div className="cmn-toast" role="status">{toast}</div>}
    </div>
  )
}
