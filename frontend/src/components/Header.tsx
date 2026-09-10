import { Bell, Bot, Menu } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ModeSwitch from './ModeSwitch'
import { api, API_BASE } from '../services/api'
import { useLang } from '../i18n'

export default function Header({ onMenu }: { onMenu: ()=>void }) {
  const [now, setNow] = useState(new Date())
  const [activeCount, setActiveCount] = useState(0)
  // Chấm trạng thái phản ánh backend THẬT (không xanh tĩnh khi mất kết nối).
  const [backendUp, setBackendUp] = useState<boolean | null>(null)
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<any[]>([])
  const [open, setOpen] = useState(false)
  useEffect(()=>{
    if(q.trim().length < 2){ setHits([]); return }
    const id = setTimeout(async ()=>{
      try{
        const API = API_BASE
        const r = await fetch(`${API}/api/search/global?q=${encodeURIComponent(q.trim())}`)
        const j = await r.json()
        setHits(Array.isArray(j.results) ? j.results.slice(0, 8) : [])
        setOpen(true)
      }catch{ setHits([]) }
    }, 300)
    return ()=> clearTimeout(id)
  },[q])
  const go = (h: any)=>{
    setOpen(false); setQ(h.name || '')
    window.dispatchEvent(new CustomEvent('ecochain-search', { detail: h }))
  }
  const { t } = useLang()
  useEffect(()=>{
    const id=setInterval(()=> setNow(new Date()), 1000)
    const ping = ()=>{
      fetch(`${API_BASE}/api/health`, { cache:'no-store' })
        .then(r=> setBackendUp(r.ok))
        .catch(()=> setBackendUp(false))
    }
    ping()
    const id2=setInterval(ping, 60000)
    api.alertList().then((d: any)=> {
      const rows = Array.isArray(d) ? d : []
      setActiveCount(rows.filter((a: any)=> a.status === 'ACTIVE').length)
    }).catch(()=> {})
    return ()=> { clearInterval(id); clearInterval(id2) }
  },[])
  const timeStr = now.toLocaleTimeString('vi-VN', {hour:'2-digit', minute:'2-digit', second:'2-digit'}) + ' - ' + now.toLocaleDateString('vi-VN')
  return (
    <header className="header">
      <button className="menu" onClick={onMenu} aria-label="Menu"><Menu size={20}/></button>

      <div className="scope">
        <span style={{fontWeight:700}}>Gia Lai</span>
        <span className="scope-badge">TRỰC TIẾP</span>
        <ModeSwitch />
      </div>
      <div className="hdr-search" style={{position:'relative', flex:1, maxWidth:420, margin:'0 16px', display:'flex', alignItems:'center', background:'#F8FAF9', border:'1px solid #E2E8E5', borderRadius:999, padding:'6px 12px', gap:8}}>
        <span style={{opacity:0.5}}>⌕</span>
        <input value={q} onChange={e=> setQ(e.target.value)} placeholder={t('hdr.search')} style={{border:0, outline:'none', flex:1, fontSize:13, background:'transparent'}} onKeyDown={e=>{ if(e.key==='Enter' && hits.length) go(hits[0]) }} onFocus={()=> hits.length && setOpen(true)} onBlur={()=> setTimeout(()=> setOpen(false), 150)} />
        {open && hits.length > 0 && (
          <div style={{position:'absolute', top:'110%', left:0, right:0, background:'#fff', border:'1px solid #E2E8E5', borderRadius:12, boxShadow:'0 8px 24px rgba(0,0,0,0.12)', zIndex:50, overflow:'hidden'}}>
            {hits.map((h, i)=> (
              <button key={i} onMouseDown={()=> go(h)} style={{display:'flex', gap:8, width:'100%', textAlign:'left', padding:'8px 12px', fontSize:13, border:0, background:'#fff', cursor:'pointer'}}>
                <span>{h.type === 'Incident' ? '🚨' : '📍'}</span>
                <span style={{flex:1}}><b>{h.name}</b> <span style={{color:'#64748B', fontSize:11}}>{h.level || h.type}</span></span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="header-right">
        <span className="status" title={backendUp === null ? 'Đang kiểm tra backend…' : backendUp ? 'Backend phản hồi' : 'Mất kết nối backend — dữ liệu hiển thị có thể cũ'}>
          <span className="dot live" style={{animation:'pulse 1.5s infinite', background: backendUp === false ? '#DC2626' : '#10B981'}}/>
          {backendUp === false ? 'Mất kết nối' : t('hdr.live')}
        </span>
        <span className="meta">Cập nhật: {timeStr}</span>
        <span title="Giao diện tiếng Việt" style={{display:'flex', gap:4, alignItems:'center'}}>
          <span style={{border:'1px solid #0F766E', background:'#0F766E', color:'#fff', borderRadius:999, padding:'4px 8px', fontSize:11, fontWeight:700}}>VI</span>
        </span>
        <button className="icon-btn" aria-label={t('hdr.notif')} onClick={()=> nav('/notifications')}><Bell size={18}/>{activeCount > 0 && <span className="badge">{activeCount}</span>}</button>
        <button className="assistant" aria-label={t('hdr.assistant')} onClick={()=> window.dispatchEvent(new CustomEvent('ecochain-open-ai', { detail:{} }))}><Bot size={16}/> {t('hdr.assistant')}</button>
        <div className="user">QT</div>
      </div>

      <style>{`
        .header{ height:64px; background:#FFFFFF; border-bottom:1px solid #E2E8E5; display:flex; align-items:center; gap:16px; padding:0 20px; position:sticky; top:0; z-index:10; }
        .menu{ display:none; background:#fff; border:1px solid #E2E8E5; border-radius:10px; padding:8px; }
        .scope{ display:flex; gap:8px; align-items:center; }
        .scope select{ background:#F8FAF9; border:1px solid #E2E8E5; border-radius:10px; padding:8px 10px; font-size:13px; font-weight:600; }
        .scope-badge{ font-size:11px; letter-spacing:0.6px; background:#0F766E; color:#fff; padding:4px 8px; border-radius:999px; }
        .header-right{ margin-left:auto; display:flex; gap:12px; align-items:center; }
        .status{ font-size:12px; color:#0F766E; font-weight:600; display:flex; gap:6px; align-items:center; }
        .dot{ width:8px; height:8px; border-radius:999px; background:#10B981; display:inline-block; }
        .meta{ font-size:12px; color:#64748B; }
        .demo{ font-size:11px; border:1px solid #E2E8E5; padding:6px 10px; border-radius:999px; background:#fff; }
        .demo.on{ background:#FEF3C7; border-color:#F59E0B; color:#92400E; }
        .icon-btn{ position:relative; background:#fff; border:1px solid #E2E8E5; border-radius:999px; width:36px; height:36px; display:grid; place-items:center; }
        .badge{ position:absolute; top:-6px; right:-6px; background:#DC2626; color:#fff; font-size:10px; padding:2px 5px; border-radius:999px; }
        .assistant{ background:#0B1412; color:#fff; border-radius:999px; padding:8px 12px; font-size:13px; display:flex; gap:6px; align-items:center; }
        .user{ width:32px; height:32px; border-radius:999px; background:#0F766E; color:#fff; display:grid; place-items:center; font-weight:700; font-size:12px; }
        @media (max-width: 900px){
          .menu{ display:grid; }
          .meta, .status{ display:none; }
          .assistant span{ display:none; }
        }
      `}</style>
    </header>
  )
}
