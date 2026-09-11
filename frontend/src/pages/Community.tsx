import { useEffect, useRef, useState } from 'react'
import { api, photoUrl, uploadProposalPhoto } from '../services/api'
import { useLang } from '../i18n'

type Post = {
  id: string; status: string; title?: string; administrative_unit_id?: string
  confidence?: number; data_type?: string; source?: string; created_at?: string
  proposed_by?: string; payload?: any
}
type Detail = Post & {
  confirmations?: { user_id: string; confirmed: boolean; comment?: string }[]
  photos?: { id: number; file_hash: string; is_duplicate?: boolean }[]
}

const VERIFIED = ['COMMUNITY_VERIFIED', 'OFFICIAL_VERIFIED', 'VERIFIED']
const statusStyle = (s: string): [string, string] =>
  s === 'OFFICIAL_VERIFIED' ? ['Đã duyệt chính thức', '#DCFCE7']
  : s === 'COMMUNITY_VERIFIED' ? ['Cộng đồng đã xác minh', '#DBEAFE']
  : s === 'VERIFIED' ? ['Đã xác minh', '#DCFCE7']
  : s === 'REJECTED' ? ['Bị từ chối', '#FEE2E2']
  : ['Chờ xác minh', '#FEF3C7']

const avatarColor = (name?: string)=>{
  const colors = ['#0F766E','#6366F1','#F59E0B','#EC4899','#0EA5E9','#84CC16']
  let h = 0
  for(const c of (name || '?')) h = (h * 31 + c.charCodeAt(0)) >>> 0
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

function Gallery(){
  const [open, setOpen] = useState<string | null>(null)
  const [photos, setPhotos] = useState<any[]>([])
  const [loaded, setLoaded] = useState(false)
  useEffect(()=>{
    api.recentPhotos(6).then((d: any)=> setPhotos(Array.isArray(d?.photos) ? d.photos : [])).catch(()=> setPhotos([])).finally(()=> setLoaded(true))
  },[])
  return (
    <div className="card">
      <b>📷 Ảnh thực địa Gia Lai</b>
      <div style={{fontSize:11, color:'#64748B', margin:'2px 0 8px'}}>Ảnh thật do cộng đồng tải lên (xác minh hash + vị trí) — không dùng ảnh minh họa nước ngoài</div>
      {loaded && photos.length === 0 && (
        <div style={{fontSize:13, background:'#F8FAF9', borderRadius:10, padding:'12px'}}>
          Chưa có ảnh thực địa nào. Hãy là người đầu tiên báo cáo kèm ảnh ở mục bên dưới 📷
        </div>
      )}
      {photos.length > 0 && (
      <div className="photo-grid" style={{display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:8}}>
        {photos.map((p:any)=> (
          <button key={p.id} onClick={()=> setOpen(photoUrl(p.url))} style={{border:0, padding:0, background:'none', cursor:'zoom-in'}}>
            <img src={photoUrl(p.thumb_url || p.url)} alt={`Ảnh hiện trường ${p.id}`} loading="lazy" style={{width:'100%', height:110, objectFit:'cover', borderRadius:10, display:'block'}} />
          </button>
        ))}
      </div>
      )}
      {open && (
        <div onClick={()=> setOpen(null)} style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.8)', zIndex:60, display:'grid', placeItems:'center', padding:16}}>
          <figure style={{margin:0, maxWidth:640, width:'100%'}}>
            <img src={open} alt="Ảnh hiện trường" style={{width:'100%', borderRadius:12}} />
          </figure>
        </div>
      )}
      <style>{`@media (max-width: 640px){ .photo-grid{ grid-template-columns:repeat(2, 1fr) !important; } }`}</style>
    </div>
  )
}

function Lessons(){
  const [rows, setRows] = useState<any[]>([])
  useEffect(()=>{
    api.learning().then((d: any)=> setRows(Array.isArray(d) ? d.slice(0, 5) : [])).catch(()=> setRows([]))
  },[])
  if(rows.length === 0) return null
  return (
    <div className="card">
      <b>📚 Bài học từ thực tế</b>
      <div style={{fontSize:11, color:'#64748B', margin:'2px 0 8px'}}>AI dự đoán → thực địa kiểm chứng → ghi nhận để lần sau chính xác hơn</div>
      {rows.map((l: any, i: number)=> (
        <div key={i} style={{fontSize:13, border:'1px solid #F1F5F9', borderRadius:10, padding:'8px 10px', marginTop:6}}>
          <div>🔮 Dự đoán: {l.prediction || '—'}</div>
          <div>✅ Thực tế: {l.outcome || '—'}</div>
          <span style={{fontSize:11, padding:'2px 8px', borderRadius:999, background: l.prediction_correct ? '#DCFCE7' : '#FEE2E2', fontWeight:700}}>
            {l.prediction_correct ? 'AI ĐÚNG' : 'AI SAI — đã học'}
          </span>
        </div>
      ))}
    </div>
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
    <div className="card">
      <b>🤖 Nhiệm vụ AI đề xuất</b>
      <div style={{fontSize:11, color:'#64748B', margin:'2px 0 8px'}}>Sinh từ cảnh báo đang hoạt động — bấm để tạo nhiệm vụ thật</div>
      {items.map((a: any)=> (
        <div key={a.id} style={{display:'flex', gap:8, alignItems:'center', fontSize:13, border:'1px solid #F1F5F9', borderRadius:10, padding:'8px 10px', marginTop:6}}>
          <div style={{flex:1}}><b>{a.title || a.risk_type}</b> · {a.administrative_unit_id} · mức {a.level}</div>
          {made[a.id]
            ? <a href="/missions" style={{fontSize:12, color:'#0F766E', fontWeight:700}}>Đã tạo ✓ xem</a>
            : <button onClick={()=> create(a)} style={{fontSize:12, background:'#0F766E', color:'#fff', border:0, borderRadius:999, padding:'6px 12px'}}>Tạo nhiệm vụ</button>}
        </div>
      ))}
    </div>
  )
}

export default function Community(){
  const { t } = useLang()
  const [nick, setNick] = useState(()=> localStorage.getItem('ecogl_nick') || `ban-${Math.floor(1000 + Math.random() * 9000)}`)
  const [posts, setPosts] = useState<Post[]>([])
  const [filter, setFilter] = useState<'NEED'|'DONE'|'ALL'>('NEED')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [comment, setComment] = useState('')
  const [report, setReport] = useState('')
  const [reportArea, setReportArea] = useState('')
  const [reportSent, setReportSent] = useState('')
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

  const shown = posts.filter(p =>
    filter === 'ALL' ? true : filter === 'NEED' ? !VERIFIED.includes(p.status) && p.status !== 'REJECTED' : VERIFIED.includes(p.status))
  const needCount = posts.filter(p => !VERIFIED.includes(p.status) && p.status !== 'REJECTED').length

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
    }catch(e:any){ setError(String(e.message || e).slice(0, 200)) }
  }

  const sendReport = async ()=>{
    if(!report.trim()) return
    try{
      const r: any = await api.mobileReport({ user_id: nick.trim() || 'anon', description: report.trim(), area: reportArea.trim() || undefined })
      setReportSent(`Đã gửi · mã ${r.report_id}`)
      setReport('')
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
    }catch(e:any){ setError(String(e.message || e).slice(0, 200)) }
    finally{ setUploadFor(null) }
  }

  return (
    <div style={{display:'flex', flexDirection:'column', gap:14, maxWidth:640, margin:'0 auto'}}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <h1>{t('com.title')} {needCount > 0 && <span style={{fontSize:12, background:'#F59E0B', color:'#fff', padding:'2px 8px', borderRadius:999}}>{needCount} {t('com.need')}</span>}</h1>
        <input value={nick} onChange={e=> setNick(e.target.value)} aria-label="Biệt danh" title="Biệt danh của bạn" style={{border:'1px solid #E2E8E5', borderRadius:999, padding:'6px 12px', fontSize:13, width:140}} />
      </div>

      <div style={{background:'#fff', border:'1px solid #E2E8E5', borderRadius:16, padding:14}}>
        <div style={{display:'flex', gap:8}}>
          <div style={{width:36, height:36, borderRadius:999, background: avatarColor(nick), color:'#fff', display:'grid', placeItems:'center', fontWeight:800}}>{(nick[0] || '?').toUpperCase()}</div>
          <input value={report} onChange={e=> setReport(e.target.value)} placeholder={`${nick} ơi, ${t('com.composerPh')}`} aria-label="Báo nhanh" style={{flex:1, border:0, outline:'none', fontSize:14, background:'#F8FAF9', borderRadius:999, padding:'8px 14px'}} onKeyDown={e=> { if(e.key === 'Enter') sendReport() }} />
        </div>
        <div style={{display:'flex', gap:6, marginTop:10, flexWrap:'wrap', alignItems:'center'}}>
          <input value={reportArea} onChange={e=> setReportArea(e.target.value)} placeholder={`📍 ${t('com.areaPh')}`} aria-label="Khu vực" style={{border:'1px solid #E2E8E5', borderRadius:999, padding:'6px 12px', fontSize:12, flex:1, minWidth:140}} />
          <button onClick={sendReport} style={{background:'#0F766E', color:'#fff', border:0, borderRadius:999, padding:'8px 16px', fontWeight:700}}>{t('com.post')}</button>
        </div>
        {reportSent && <div style={{marginTop:8, fontSize:12, color:'#0F766E'}}>{reportSent} · kênh mobile (beta), bài AI sẽ lên feed sau khi quét</div>}
        <div style={{marginTop:8, fontSize:11, color:'#64748B'}}>BÁO CÁO → XÁC MINH CỘNG ĐỒNG (2 lượt) → DUYỆT CHÍNH THỨC</div>
      </div>

      <div style={{display:'flex', gap:6}}>
        {([['NEED', t('com.need')],['DONE', t('com.done')],['ALL', t('com.all')]] as const).map(([v, label])=> (
          <button key={v} onClick={()=> setFilter(v)} style={{padding:'6px 12px', borderRadius:999, border:'1px solid #E2E8E5', background: filter===v ? '#0B1412' : '#fff', color: filter===v ? '#fff' : '#000'}}>{label}</button>
        ))}
        <button onClick={refresh} style={{marginLeft:'auto', padding:'6px 12px', borderRadius:999, border:'1px solid #E2E8E5', background:'#fff'}}>↻ {t('com.reload')}</button>
      </div>

      {loading && <div className="card">Đang tải feed...</div>}
      {error && <div className="card" style={{borderColor:'#F59E0B'}}>⚠ {error}</div>}
      {!loading && shown.length === 0 && <div className="card">Chưa có bài nào trong mục này.</div>}

      {shown.map(p=> {
        const [label, bg] = statusStyle(p.status)
        const confs = openId === p.id ? (detail?.confirmations ?? []) : []
        const yes = confs.filter(c=> c.confirmed).length
        const no = confs.filter(c=> !c.confirmed).length
        return (
          <article key={p.id} style={{background:'#fff', border:'1px solid #E2E8E5', borderRadius:16, padding:14}}>
            <div style={{display:'flex', gap:10, alignItems:'center'}}>
              <div style={{width:40, height:40, borderRadius:999, background: avatarColor((p as any).proposed_by || p.administrative_unit_id), color:'#fff', display:'grid', placeItems:'center', fontWeight:800, fontSize:16}}>
                {(((p as any).proposed_by || p.administrative_unit_id || '?')[0] || '?').toUpperCase()}
              </div>
              <div style={{flex:1}}>
                <div style={{fontWeight:700, fontSize:13}}>{(p as any).proposed_by || 'AI ForestGuard'}</div>
                <div style={{fontSize:11, color:'#64748B'}}>📍 {p.administrative_unit_id} · {timeAgo(p.created_at)}</div>
              </div>
              <span style={{fontSize:11, background: bg, padding:'4px 10px', borderRadius:999, fontWeight:700}}>{label}</span>
            </div>

            <button onClick={()=> open(p.id)} style={{all:'unset', cursor:'pointer', display:'block', width:'100%', marginTop:8}} aria-expanded={openId === p.id}>
              <div style={{fontSize:14, fontWeight:600}}>{p.title || p.data_type}</div>
              <div style={{fontSize:12, color:'#64748B', marginTop:2}}>AI tin cậy {p.confidence ?? '?'}% · Nguồn: {p.source || '?'} {openId === p.id ? '▴' : '▾'}</div>
            </button>
            <div style={{height:6, background:'#F1F5F9', borderRadius:999, marginTop:8}}>
              <div style={{width:`${Math.min(100, p.confidence ?? 0)}%`, height:'100%', borderRadius:999, background:'#0F766E'}} />
            </div>

            <div style={{display:'flex', gap:6, marginTop:10}}>
              <button onClick={()=> vote(p.id, true)} style={{flex:1, border:'1px solid #E2E8E5', background:'#F0FDF4', borderRadius:999, padding:'8px 0'}}>👍 {t('com.confirm')}{yes > 0 ? ` (${yes})` : ''}</button>
              <button onClick={()=> vote(p.id, false)} style={{flex:1, border:'1px solid #E2E8E5', background:'#FEF2F2', borderRadius:999, padding:'8px 0'}}>👎 {t('com.object')}{no > 0 ? ` (${no})` : ''}</button>
              <button onClick={()=> open(p.id)} style={{flex:1, border:'1px solid #E2E8E5', background:'#fff', borderRadius:999, padding:'8px 0'}}>💬 {confs.length > 0 ? `${confs.length} bình luận` : t('com.details')}</button>
              <button onClick={()=> { setUploadFor(p.id); setTimeout(()=> fileRef.current?.click(), 0) }} style={{flex:1, border:'1px solid #E2E8E5', background:'#fff', borderRadius:999, padding:'8px 0'}}>📷 {t('com.photo')}</button>
            </div>

            {openId === p.id && detail && (
              <div style={{marginTop:10, borderTop:'1px solid #F1F5F9', paddingTop:10, fontSize:13}}>
                <div style={{display:'flex', gap:6, marginBottom:8}}>
                  <input value={comment} onChange={e=> setComment(e.target.value)} placeholder={t('com.commentPh')} aria-label="Bình luận" style={{flex:1, border:'1px solid #E2E8E5', borderRadius:999, padding:'6px 12px', fontSize:12}} onKeyDown={e=> { if(e.key === 'Enter') vote(p.id, true) }} />
                </div>
                {(detail.photos?.length ?? 0) > 0 && (
                  <div style={{fontSize:12, color:'#334155', marginBottom:6}}>📷 {detail.photos!.length} ảnh bằng chứng {detail.photos!.some(x=> x.is_duplicate) && '(có ảnh trùng hash)'}</div>
                )}
                {(detail.photos?.some((x:any)=> x.thumb_url || x.url)) && (
                  <div style={{display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:6, marginBottom:8}}>
                    {detail.photos!.filter((x:any)=> x.thumb_url || x.url).map((x:any)=> (
                      <a key={x.id} href={photoUrl(x.url)} target="_blank" rel="noreferrer">
                        <img src={photoUrl(x.thumb_url || x.url)} alt="Ảnh bằng chứng" loading="lazy" style={{width:'100%', height:80, objectFit:'cover', borderRadius:8, display:'block'}} />
                      </a>
                    ))}
                  </div>
                )}
                {confs.length === 0 && <div style={{fontSize:12, color:'#64748B'}}>Chưa có xác minh nào — bạn là người đầu tiên?</div>}
                {confs.map((c, i)=> (
                  <div key={i} style={{display:'flex', gap:8, padding:'6px 0', borderBottom:'1px solid #F8FAF9'}}>
                    <div style={{width:28, height:28, borderRadius:999, background: avatarColor(c.user_id), color:'#fff', display:'grid', placeItems:'center', fontSize:12, fontWeight:800}}>{(c.user_id[0] || '?').toUpperCase()}</div>
                    <div><b>{c.user_id}</b> {c.confirmed ? '👍' : '👎'}{c.comment && <span> — {c.comment}</span>}</div>
                  </div>
                ))}
              </div>
            )}
          </article>
        )
      })}
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={e=> { if(uploadFor) onFile(uploadFor, e.target.files?.[0]); e.target.value = '' }} />
      <Gallery />
      <Lessons />
      <SuggestedMissions />
      <style>{`.card{background:#fff; border:1px solid #E2E8E5; border-radius:16px; padding:16px}`}</style>
    </div>
  )
}
