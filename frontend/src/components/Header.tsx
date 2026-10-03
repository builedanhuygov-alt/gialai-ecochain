import { Bell, Bot, Menu, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ModeSwitch from './ModeSwitch'
import { api, API_BASE } from '../services/api'
import { useLang } from '../i18n'
import { systemStatusFromHealth, systemStatusLabel } from '../utils/statusModel'

function groupHits(hits: any[]) {
  const places: any[] = []
  const incidents: any[] = []
  for (const hit of hits) {
    if (/incident|event|firms|hotspot|alert/i.test(String(hit.type || hit.level || ''))) incidents.push(hit)
    else places.push(hit)
  }
  return { places, incidents }
}

export default function Header({ onMenu }: { onMenu: ()=>void }) {
  const [syncedAt, setSyncedAt] = useState<Date | null>(null)
  const [activeCount, setActiveCount] = useState<number | null>(null)
  const [backendUp, setBackendUp] = useState<boolean | null>(null)
  const [sourceStatuses, setSourceStatuses] = useState<string[]>([])
  const [user, setUser] = useState<{ username: string; role: string } | null>(null)
  useEffect(()=>{
    const load = ()=>{
      try{
        const raw = sessionStorage.getItem('ecogl_user')
        setUser(raw ? JSON.parse(raw) : null)
      }catch{ setUser(null) }
    }
    load()
    window.addEventListener('ecochain-auth', load)
    return ()=> window.removeEventListener('ecochain-auth', load)
  },[])
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<any[]>([])
  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const grouped = useMemo(()=> groupHits(hits), [hits])
  const flatHits = useMemo(()=> [...grouped.places, ...grouped.incidents], [grouped])

  useEffect(()=>{
    if(q.trim().length < 2){ setHits([]); setSearching(false); setSearchError(null); return }
    let cancelled = false
    setSearching(true)
    setSearchError(null)
    const id = setTimeout(async ()=>{
      try{
        const r = await fetch(`${API_BASE}/api/search/global?q=${encodeURIComponent(q.trim())}`)
        const j = await r.json()
        if (cancelled) return
        setHits(Array.isArray(j.results) ? j.results.slice(0, 10) : [])
        setOpen(true)
        setActiveIdx(0)
      }catch{
        if (!cancelled) { setHits([]); setSearchError('Không tìm được kết quả.'); setOpen(true) }
      } finally {
        if (!cancelled) setSearching(false)
      }
    }, 280)
    return ()=> { cancelled = true; clearTimeout(id) }
  },[q])

  const go = (h: any)=>{
    if (!h) return
    setOpen(false); setQ(h.name || '')
    window.dispatchEvent(new CustomEvent('ecochain-search', { detail: h }))
    if (h.type === 'Incident' && h.id) nav(`/events/${encodeURIComponent(h.id)}`)
  }

  const { t } = useLang()
  useEffect(()=>{
    const ping = ()=>{
      Promise.all([
        fetch(`${API_BASE}/api/health`, { cache:'no-store' }).then(r=> r.ok).catch(()=> false),
        fetch(`${API_BASE}/api/health/geospatial`, { cache:'no-store' }).then(r=> r.ok ? r.json() : null).catch(()=> null),
      ]).then(([up, geo])=>{
        setBackendUp(up)
        setSyncedAt(new Date())
        const statuses = geo ? [geo.firms?.status, geo.gee?.status, geo.sentinel2?.status] : []
        setSourceStatuses(statuses.filter(Boolean).map(String))
      })
    }
    ping()
    const id2=setInterval(ping, 60000)
    api.alerts().then((d: any)=> {
      const rows = Array.isArray(d) ? d : []
      setActiveCount(rows.filter((a: any)=> a.status === 'ACTIVE').length)
    }).catch(()=> setActiveCount(null))
    return ()=> { clearInterval(id2) }
  },[])

  const system = systemStatusFromHealth(backendUp, sourceStatuses)
  const timeStr = syncedAt
    ? syncedAt.toLocaleTimeString('vi-VN', {hour:'2-digit', minute:'2-digit'})
    : '…'
  const showDropdown = open && q.trim().length >= 2

  return (
    <header className="header">
      <button className="menu" onClick={onMenu} aria-label="Menu"><Menu size={20}/></button>

      <div className="scope">
        <span style={{fontWeight:700}}>Gia Lai</span>
        <ModeSwitch />
      </div>
      <div className="hdr-search" style={{position:'relative', flex:1, maxWidth:440, margin:'0 16px', display:'flex', alignItems:'center', background:'#F8FAF9', border:'1px solid #E2E8E5', borderRadius:999, padding:'6px 12px', gap:8}}>
        <span style={{opacity:0.5}}>⌕</span>
        <input
          ref={inputRef}
          value={q}
          onChange={e=> setQ(e.target.value)}
          placeholder={t('hdr.search')}
          aria-label={t('hdr.search')}
          aria-expanded={showDropdown}
          aria-controls="hdr-search-results"
          style={{border:0, outline:'none', flex:1, fontSize:13, background:'transparent'}}
          onKeyDown={e=>{
            if(e.key==='Escape'){ setOpen(false); setQ(''); return }
            if(e.key==='ArrowDown'){ e.preventDefault(); setActiveIdx(i=> Math.min(flatHits.length-1, i+1)); setOpen(true) }
            if(e.key==='ArrowUp'){ e.preventDefault(); setActiveIdx(i=> Math.max(0, i-1)) }
            if(e.key==='Enter' && flatHits[activeIdx]) go(flatHits[activeIdx])
          }}
          onFocus={()=> q.trim().length >= 2 && setOpen(true)}
          onBlur={()=> setTimeout(()=> setOpen(false), 150)}
        />
        {q && <button type="button" aria-label="Xóa tìm kiếm" onClick={()=>{ setQ(''); setHits([]); inputRef.current?.focus() }}
          style={{border:0, background:'transparent', color:'#64748B', padding:0, display:'grid'}}><X size={14}/></button>}
        {showDropdown && (
          <div id="hdr-search-results" role="listbox" style={{position:'absolute', top:'110%', left:0, right:0, background:'#fff', border:'1px solid #E2E8E5', borderRadius:12, boxShadow:'0 8px 24px rgba(0,0,0,0.12)', zIndex:50, overflow:'hidden'}}>
            {searching && <div style={{padding:'10px 12px', fontSize:12, color:'#64748B'}}>Đang tìm…</div>}
            {!searching && searchError && <div style={{padding:'10px 12px', fontSize:12, color:'#92400E'}}>{searchError}</div>}
            {!searching && !searchError && hits.length === 0 && <div style={{padding:'10px 12px', fontSize:12, color:'#64748B'}}>Không có địa điểm hoặc sự cố khớp “{q.trim()}”.</div>}
            {!searching && grouped.places.length > 0 && (
              <div>
                <div style={{fontSize:10, fontWeight:800, letterSpacing:0.6, color:'#64748B', padding:'8px 12px 4px'}}>ĐỊA ĐIỂM</div>
                {grouped.places.map((h, i)=> (
                  <button key={`p-${i}`} role="option" aria-selected={flatHits[activeIdx]===h} onMouseDown={()=> go(h)}
                    style={{display:'flex', gap:8, width:'100%', textAlign:'left', padding:'8px 12px', fontSize:13, border:0, background: flatHits[activeIdx]===h ? '#F1F5F3' : '#fff', cursor:'pointer'}}>
                    <span>📍</span>
                    <span style={{flex:1}}><b>{h.name}</b> <span style={{color:'#64748B', fontSize:11}}>{h.level || h.type}</span></span>
                  </button>
                ))}
              </div>
            )}
            {!searching && grouped.incidents.length > 0 && (
              <div>
                <div style={{fontSize:10, fontWeight:800, letterSpacing:0.6, color:'#64748B', padding:'8px 12px 4px'}}>SỰ CỐ</div>
                {grouped.incidents.map((h, i)=> (
                  <button key={`i-${i}`} role="option" aria-selected={flatHits[activeIdx]===h} onMouseDown={()=> go(h)}
                    style={{display:'flex', gap:8, width:'100%', textAlign:'left', padding:'8px 12px', fontSize:13, border:0, background: flatHits[activeIdx]===h ? '#F1F5F3' : '#fff', cursor:'pointer'}}>
                    <span>🚨</span>
                    <span style={{flex:1}}><b>{h.name}</b> <span style={{color:'#64748B', fontSize:11}}>{h.level || h.type}</span></span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="header-right">
        <span className="status" title={system === 'CHECKING' ? 'Đang kiểm tra backend…' : system === 'LIVE' ? 'Hệ thống phản hồi, nguồn chính LIVE' : system === 'DEGRADED' ? 'Hệ thống chạy, một phần nguồn cache/thiếu' : 'Mất kết nối backend'}>
          <span className="dot live" style={{animation: system === 'LIVE' ? 'pulse 1.5s infinite' : 'none', background: system === 'OFFLINE' ? '#DC2626' : system === 'DEGRADED' ? '#D97706' : system === 'CHECKING' ? '#94A3B8' : '#10B981'}}/>
          ● {systemStatusLabel(system)}
        </span>
        <span className="meta" title="Lần ping hệ thống gần nhất, không phải thời điểm FIRMS">Đồng bộ {timeStr}</span>
        <span title="Giao diện tiếng Việt" style={{fontSize:12, color:'#64748B', fontWeight:700}}>VI</span>
        <button className="icon-btn" aria-label={t('hdr.notif')} onClick={()=> nav('/notifications')}><Bell size={18}/>{typeof activeCount === 'number' && activeCount > 0 && <span key={activeCount} className="badge badge-pop">{activeCount}</span>}</button>
        <button className="assistant" aria-label={t('hdr.assistant')} onClick={()=> window.dispatchEvent(new CustomEvent('ecochain-open-ai', { detail:{} }))}><Bot size={16}/> {t('hdr.assistant')}</button>
        {user ? (
          <button className="user" title={`${user.username} (${user.role}) — bấm để đăng xuất`}
            onClick={()=>{ try{ sessionStorage.removeItem('ecogl_admin_token'); sessionStorage.removeItem('ecogl_user') }catch{}; window.dispatchEvent(new CustomEvent('ecochain-auth')); nav('/login') }}
            style={{border:0, cursor:'pointer', textTransform:'uppercase'}}>
            {user.username.slice(0, 2)}
          </button>
        ) : (
          <button className="user" title="Đăng nhập" onClick={()=> nav('/login')}
            style={{border:0, cursor:'pointer', background:'#fff', color:'#0F766E', borderWidth:1, borderStyle:'solid', borderColor:'#0F766E'}}>→</button>
        )}
      </div>

      <style>{`
        .header{ height:64px; background:#FFFFFF; border-bottom:1px solid #E2E8E5; display:flex; align-items:center; gap:16px; padding:0 20px; position:sticky; top:0; z-index:10; }
        .hdr-search{ transition:box-shadow 200ms cubic-bezier(0.4,0,0.2,1), border-color 200ms cubic-bezier(0.4,0,0.2,1); }
        .hdr-search:focus-within{ box-shadow:0 0 0 3px rgba(15,118,110,0.15); border-color:#0F766E !important; }
        .menu{ display:none; background:#fff; border:1px solid #E2E8E5; border-radius:10px; padding:8px; }
        .scope{ display:flex; gap:8px; align-items:center; }
        .header-right{ margin-left:auto; display:flex; gap:12px; align-items:center; }
        .status{ font-size:12px; color:#0F766E; font-weight:600; display:flex; gap:6px; align-items:center; }
        .dot{ width:8px; height:8px; border-radius:999px; background:#10B981; display:inline-block; }
        .meta{ font-size:12px; color:#64748B; }
        .icon-btn{ position:relative; background:#fff; border:1px solid #E2E8E5; border-radius:999px; width:36px; height:36px; display:grid; place-items:center; }
        .badge{ position:absolute; top:-6px; right:-6px; background:#DC2626; color:#fff; font-size:10px; padding:2px 5px; border-radius:999px; }
        .assistant{ background:#0B1412; color:#fff; border-radius:999px; padding:8px 12px; font-size:13px; display:flex; gap:6px; align-items:center; }
        .user{ width:32px; height:32px; border-radius:999px; background:#0F766E; color:#fff; display:grid; place-items:center; font-weight:700; font-size:12px; }
        @media (max-width: 900px){
          .menu{ display:grid; }
          .meta{ display:none; }
          .assistant span{ display:none; }
        }
      `}</style>
    </header>
  )
}
