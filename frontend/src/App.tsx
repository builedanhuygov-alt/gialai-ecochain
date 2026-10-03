import { BrowserRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, MotionConfig } from 'framer-motion'
import { lazy, Suspense, useEffect, useState } from 'react'
import AppShell from './components/AppShell'
import ErrorBoundary from './components/ErrorBoundary'
import { PageTransition } from './motion/primitives'
import { LangProvider } from './i18n'
import { API_BASE, api } from './services/api'
import { useScope } from './store/useScope'
const EcoMap = lazy(()=> import('./pages/EcoMap'))
const MapPage = lazy(()=> import('./pages/MapPage'))
const EventIntelligence = lazy(()=> import('./pages/FireEventIntelligence'))
const EventsList = lazy(()=> import('./pages/FireEventIntelligence').then(m=> ({ default: m.EventsList })))
const FireSim = lazy(()=> import('./pages/FireSim'))
const Missions = lazy(()=> import('./pages/Missions'))
const Forest = lazy(()=> import('./pages/Forest'))
const Community = lazy(()=> import('./pages/Community'))
const CommunityReportDetail = lazy(()=> import('./pages/CommunityReportDetail'))
const TrungTamChiHuy = lazy(()=> import('./pages/TrungTamChiHuy'))
const BanDo3D = lazy(()=> import('./pages/BanDo3D'))
const ChayLichSu = lazy(()=> import('./pages/ChayLichSu'))
const PhongThiNghiem = lazy(()=> import('./pages/PhongThiNghiem'))
const NguonDuLieu = lazy(()=> import('./pages/NguonDuLieu'))
const Notifications = lazy(()=> import('./pages/Notifications'))
const Admin = lazy(()=> import('./pages/Admin'))
const Audit = lazy(()=> import('./pages/Audit'))
const Login = lazy(()=> import('./pages/Login'))
const Viewer = lazy(()=> import('./pages/Viewer'))

const TITLES: Record<string,string> = {
  '/': 'Bản đồ cháy rừng Gia Lai',
  '/events': 'Sự kiện cháy', '/firesim': 'Mô phỏng lan lửa', '/missions': 'Nhiệm vụ thực địa',
  '/map': 'Bản đồ', '/forest': 'Rừng', '/community': 'Cộng đồng',
  '/trung-tam-chi-huy': 'Trung tâm chỉ huy', '/ban-do-3d': 'Bản đồ 3D',
  '/chay-lich-su': 'Vụ cháy đã ghi nhận', '/phong-thi-nghiem': 'Phòng thí nghiệm',
  '/nguon-du-lieu': 'Nguồn dữ liệu', '/thong-bao': 'Thông báo', '/nhat-ky': 'Nhật ký',
  '/admin': 'Quản trị', '/notifications': 'Thông báo', '/audit': 'Nhật ký', '/login': 'Đăng nhập',
  '/viewer': 'Hiện trường 360°',
}

function NotFound(){
  return (
    <div style={{maxWidth:480, margin:'64px auto', textAlign:'center', background:'#fff', border:'1px solid #E2E8E5', borderRadius:16, padding:32}}>
      <div style={{fontSize:40}}>🧭</div>
      <h1 style={{fontSize:20, fontWeight:800}}>Không tìm thấy trang</h1>
      <p style={{fontSize:13, color:'#64748B'}}>Địa chỉ không tồn tại. Về bản đồ cháy rừng Gia Lai:</p>
      <a href="/" style={{display:'inline-block', background:'#0F766E', color:'#fff', padding:'8px 20px', borderRadius:999, fontSize:13, fontWeight:700, textDecoration:'none'}}>Về bản đồ</a>
    </div>
  )
}

function AIAssistant(){
  const tenGiaiDoan = (p: string): string => ({
    THINKING: 'Đang nghĩ', 'RETRIEVING DATA': 'Đang lấy dữ liệu', ANALYZING: 'Đang phân tích',
    GENERATING: 'Đang tổng hợp', COMPLETE: 'Xong', ERROR: 'Lỗi', PUTER: 'Puter',
  }[p] || p)
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(false)
  const [phase, setPhase] = useState<string>('')
  const [stream, setStream] = useState<string>('')
  const [result, setResult] = useState<any>(null)
  const [lichSu, setLichSu] = useState<{ role: string; content: string }[]>([])
  const [showInspector, setShowInspector] = useState(false)
  const [showFullAnswer, setShowFullAnswer] = useState(false)
  const [aiStatus, setAiStatus] = useState<any>(null)
  const API = API_BASE

  // Live status of every AI capability (LLM/RAG/streaming) on drawer open.
  useEffect(()=>{
    if(!open) return
    api.aiHealth().then(setAiStatus).catch(()=> setAiStatus(null))
  },[open])

  const runAiAction = async (kind: 'fire-risk'|'what-if'|'pccc')=>{
    setLoading(true); setPhase('THINKING'); setStream(''); setResult(null); setShowFullAnswer(false)
    try{
      let j: any
      if(kind === 'fire-risk'){
        setPhase('ANALYZING')
        j = await api.aiFireRisk()
      }else if(kind === 'what-if'){
        setPhase('ANALYZING')
        j = await api.aiWhatIf({ temperature: 3, rainfall: -30, wind: 20, lat: 13.9, lon: 108.3 })
      }else{
        setPhase('ANALYZING')
        j = await api.aiPccc({ fire_score: 77, firms_count: 2, weather: { temperature: 34, wind_speed: 20, humidity: 30 }, district: 'Gia Lai' })
      }
      setStream(JSON.stringify(j.structured_output || j.simulation || j, null, 2).slice(0, 800))
      setResult(j)
      setPhase('COMPLETE')
    }catch(e:any){
      let msg = String(e.message || e).slice(0, 400)
      try{ const jj = JSON.parse(String(e.message || '')); msg = jj.reason || msg }catch{}
      setStream(msg)
      setPhase('ERROR')
    }finally{ setLoading(false) }
  }

  // allow other pages (e.g. Dashboard) to open the assistant with a preset query
  useEffect(()=>{
    const h = (e: any)=>{
      if(e.detail?.query) setQ(e.detail.query)
      setOpen(true)
    }
    window.addEventListener('ecochain-open-ai', h)
    return ()=> window.removeEventListener('ecochain-open-ai', h)
  },[])
  
  const suggestions = [
    "Phân tích nguy cơ cháy rừng",
    "Kiểm tra biến động rừng 7 ngày",
    "Tìm vùng cây trồng bị stress",
    "Chạy kịch bản nhiệt độ +3°C",
    "Khu vực nào cần kiểm tra thực địa?",
    "Gia Lai hiện có khu vực nào nguy cơ cao?",
    "Vì sao khu vực này có nguy cơ cháy cao?"
  ]

  const ask = async (query?: string)=>{
    const qq = (query || q).trim()
    if(!qq) return
    setQ(qq)
    setLoading(true); setPhase('THINKING'); setStream(''); setResult(null); setShowFullAnswer(false)
    setLichSu(h=> [...h.slice(-10), { role: 'user', content: qq }])
    try{
      setPhase('RETRIEVING DATA')
      // Serverless functions time out — fail fast with a clear message instead
      // of hanging until the gateway kills the request.
      const ctrl = new AbortController()
      const timer = setTimeout(()=> ctrl.abort(), 28000)
      let r: Response
      try{
        r = await fetch(`${API}/api/ai/chat`, { method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ query: qq, lat:13.9, lon:108.3,
            conversation: [...lichSu.slice(-6), { role: 'user', content: qq }] }), signal: ctrl.signal })
      }catch(ab:any){
        throw new Error(ab?.name === 'AbortError' ? 'AI phản hồi quá lâu (quá 28s) — Vercel serverless giới hạn thời gian chạy. Hãy thử câu hỏi ngắn hơn hoặc thử lại.' : String(ab?.message || ab))
      }finally{ clearTimeout(timer) }
      if(!r.ok){
        let msg = await r.text()
        try{ const j = JSON.parse(msg); msg = j.reason || msg }catch{}
        throw new Error(msg)
      }
      const j = await r.json()
      setPhase('ANALYZING')
      // Simulate streaming for non-stream endpoint
      const content = j.answer || JSON.stringify(j.structured_output || j, null, 2)
      setStream(content.slice(0, 800))
      setPhase('GENERATING')
      setResult(j)
      setPhase('COMPLETE')
      if(j.answer) setLichSu(h=> [...h.slice(-10), { role: 'assistant', content: String(j.answer).slice(0, 800) }])
    }catch(e:any){
      const msg = String(e.message || e).slice(0,400)
      setStream(msg)
      setLichSu(h=> [...h.slice(-10), { role: 'assistant', content: msg }])
      setPhase('ERROR')
    }finally{ setLoading(false) }
  }

  // Puter.js path (optional): user-pays DeepSeek via the viewer's own Puter
  // account (popup auth on first use). Never touches backend keys. Failure
  // leaves all backend options intact.
  const ensurePuter = ()=> new Promise<any>((resolve, reject)=>{
    const w = window as any
    if(w.puter?.ai?.chat) return resolve(w.puter)
    const s = document.createElement('script')
    s.src = 'https://js.puter.com/v2/'
    s.async = true
    s.onload = ()=> (window as any).puter?.ai?.chat ? resolve((window as any).puter) : reject(new Error('Puter SDK chưa sẵn sàng'))
    s.onerror = ()=> reject(new Error('Không tải được Puter SDK (mạng/CSP)'))
    document.head.appendChild(s)
    setTimeout(()=> reject(new Error('Puter SDK quá lâu')), 15000)
  })
  const askPuter = async ()=>{
    const qq = q.trim(); if(!qq || loading) return
    setLoading(true); setPhase('PUTER'); setStream(''); setResult(null); setShowFullAnswer(false)
    try{
      const puter = await ensurePuter()
      const r = await puter.ai.chat(
        `Bạn là chuyên gia PCCC Gia Lai. Trả lời ngắn gọn, evidence-based: ${qq}`,
        { model: 'deepseek/deepseek-v4.1-flash' })
      const text = r?.message?.content || (typeof r === 'string' ? r : JSON.stringify(r).slice(0, 800))
      setStream(String(text).slice(0, 1200))
      setResult({ provider: 'Puter', model: 'deepseek/deepseek-v4.1-flash', billing: 'user-pays (tài khoản Puter của bạn)', risk: null })
      setPhase('COMPLETE')
    }catch(e:any){
      setStream('Puter AI chưa dùng được (' + String(e?.message || e).slice(0, 160) + '). Hãy đăng nhập Puter ở popup, hoặc dùng Phân tích/Stream (backend).')
      setPhase('ERROR')
    }finally{ setLoading(false) }
  }

  const askStream = async ()=>{
    const qq = q.trim(); if(!qq) return
    setLoading(true); setPhase('THINKING'); setStream(''); setResult(null); setShowFullAnswer(false)
    try{
      const r = await fetch(`${API}/api/ai/chat/stream`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ query: qq, lat:13.9, lon:108.3 }) })
      if(!r.ok || !r.body) throw new Error('Stream failed, falling back')
      const reader = r.body.getReader()
      const dec = new TextDecoder()
      let acc=''
      setPhase('RETRIEVING DATA')
      while(true){
        const {done, value} = await reader.read()
        if(done) break
        const chunk = dec.decode(value)
        chunk.split('\n\n').forEach(line=>{
          if(line.startsWith('data: ')){
            try{
              const d=JSON.parse(line.slice(6))
              if(d.type==='CHUNK'){ acc+=d.content; setStream(acc); setPhase('GENERATING') }
              else if(d.type==='RETRIEVING'){ setPhase('RETRIEVING DATA') }
              else if(d.type==='COMPLETE'){ setResult({ citations: d.citations, streaming: true }); setPhase('COMPLETE') }
            }catch{}
          }
        })
      }
      if(!acc) await ask()
    }catch{
      await ask()
    }finally{ setLoading(false) }
  }

  return (
    <>
      <button className="fab" onClick={()=> setOpen(true)} aria-label="Trợ lý AI môi trường">🌿</button>
      {open && (
        <div className="ai-drawer" role="dialog" aria-modal="true" style={{width:'min(420px, calc(100vw - 24px))', maxHeight:'85vh', overflow:'auto'}}>
          <div className="ai-head">Trí tuệ Môi trường Gia Lai <button onClick={()=>setOpen(false)}>✕</button></div>
          <div style={{fontSize:11, color:'#64748B', margin:'4px 0'}}>Luồng xử lý: câu hỏi → dữ liệu → công cụ → bằng chứng</div>
          <div className="suggestions">
            {suggestions.map(s=> <button key={s} onClick={()=> ask(s)}>{s}</button>)}
          </div>
          <div style={{display:'flex', gap:6, flexWrap:'wrap', margin:'8px 0', alignItems:'center'}}>
            <span style={{fontSize:10, color:'#64748B'}}>AI:</span>
            {[['LLM', aiStatus?.llm], ['RAG', aiStatus?.rag], ['Stream', aiStatus ? { status: aiStatus.streaming ? 'LIVE' : 'UNAVAILABLE' } : null]].map(([label, v]:any)=>(
              <span key={label as string} title={`${label}: ${v?.status || '…'}`}
                style={{fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:999,
                  background: !v ? '#F1F5F9' : v.status==='LIVE' ? '#DCFCE7' : v.status==='DEMO' ? '#FEF3C7' : '#FEE2E2',
                  color:'#0F1E1A'}}>{label} · {v?.status || '…'}</span>
            ))}
          </div>
          <div style={{display:'flex', gap:6, flexWrap:'wrap', marginBottom:8}}>
            <button onClick={()=> runAiAction('fire-risk')} disabled={loading} style={{fontSize:11, padding:'4px 10px', borderRadius:999, border:'1px solid #0F766E', background:'#fff', color:'#0F766E'}}>🔥 Nguy cơ cháy AI</button>
            <button onClick={()=> runAiAction('what-if')} disabled={loading} style={{fontSize:11, padding:'4px 10px', borderRadius:999, border:'1px solid #0F766E', background:'#fff', color:'#0F766E'}}>🧪 Kịch bản giả định</button>
            <button onClick={()=> runAiAction('pccc')} disabled={loading} style={{fontSize:11, padding:'4px 10px', borderRadius:999, border:'1px solid #0F766E', background:'#fff', color:'#0F766E'}}>🚒 Tổng hợp PCCC</button>
            <button onClick={()=> askPuter()} disabled={loading} title="Chat qua Puter.js (deepseek-v4.1-flash) — tính vào tài khoản Puter của bạn, không dùng khóa backend" style={{fontSize:11, padding:'4px 10px', borderRadius:999, border:'1px solid #7C3AED', background:'#fff', color:'#7C3AED'}}>✦ Hỏi Puter AI</button>
          </div>
          <textarea value={q} onChange={e=>setQ(e.target.value)} placeholder="Gia Lai hiện tại có khu vực nào nguy cơ cháy rừng cao?" aria-label="Hỏi AI" />
          <div style={{display:'flex', gap:8, marginTop:8}}>
            <button className="ask" onClick={()=>ask()} disabled={loading}>{loading? tenGiaiDoan(phase) : 'Phân tích'}</button>
            <button className="ask" onClick={askStream} disabled={loading} style={{background:'#0B1412'}}>{loading? '...' : 'Trực tiếp'}</button>
          </div>
          {loading && <div style={{marginTop:8, fontSize:12, background:'#FEF3C7', padding:'6px 10px', borderRadius:8}}>{tenGiaiDoan(phase)}... <span className="dot" style={{display:'inline-block', width:8, height:8, background:'#F59E0B', borderRadius:999, animation:'pulse 1s infinite'}}/></div>}
          {lichSu.length > 0 && (
            <div style={{marginTop:8, display:'flex', flexDirection:'column', gap:6, maxHeight:220, overflow:'auto'}} aria-label="Lịch sử trò chuyện">
              {lichSu.slice(-8).map((m, i)=> (
                <div key={i} style={{alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth:'90%',
                  background: m.role === 'user' ? '#0F766E' : '#F8FAF9', color: m.role === 'user' ? '#fff' : '#0F172A',
                  border: m.role === 'user' ? '0' : '1px solid #E2E8E5', borderRadius:12, padding:'6px 10px', fontSize:12}}>
                  {m.content}
                </div>
              ))}
            </div>
          )}
          {stream && <div className="answer-wrap">
            <div className="answer" style={{whiteSpace:'pre-wrap', maxHeight:showFullAnswer ? 420 : 180, overflow:'auto'}}>{stream.slice(0, showFullAnswer ? 6000 : 1200)}</div>
            {stream.length > 1200 && <button className="answer-toggle" onClick={()=> setShowFullAnswer(v=>!v)}>{showFullAnswer ? 'Thu gọn kết quả' : 'Xem đầy đủ kết quả'}</button>}
          </div>}
          {result && (
            <div className="ai-result-card">
              <div className="ai-result-head"><div style={{fontWeight:800, fontSize:12, letterSpacing:0.4}}>PHÂN TÍCH CHÁY</div><span>AI · {phase === 'COMPLETE' ? 'TRỰC TIẾP' : tenGiaiDoan(phase)}</span></div>
              {result.provider === 'Puter' && <div style={{fontSize:11, color:'#7C3AED', marginBottom:4}}>Nguồn: Puter · {result.model} · {result.billing}</div>}
              <div className="ai-risk-line">Điểm: <b>{result.risk?.score ?? result.structured_output?.risk?.score ?? '--'} / 100</b> · Mức <b>{result.risk?.band ?? '--'}</b></div>
              <div style={{fontSize:12}}>Độ tin cậy: <b>{Math.round((result.risk?.confidence ?? result.model_confidence ?? 0)*100) || result.risk?.confidence || '--'}%</b> · Độ đầy dữ liệu: {result.data_completeness ?? '--'}%</div>
              <div style={{fontSize:11, color:'#334155', marginTop:4}}>Tín hiệu: {Object.keys(result.factors || {}).join(', ') || 'thảm khô, thời tiết, FIRMS'}</div>
              <div style={{fontSize:11, marginTop:6}}>Bằng chứng: {result.evidence?.length ?? 0} nguồn · RAG: {result.rag?.retrieved_documents ?? 0} tài liệu</div>
              <div style={{display:'flex', gap:6, marginTop:8, flexWrap:'wrap'}}>
                <button onClick={()=> setShowInspector(v=>!v)} style={{fontSize:11, padding:'4px 8px', borderRadius:999, border:'1px solid #0F766E', background: showInspector?'#0F766E':'#fff', color: showInspector?'#fff':'#0F766E'}}>Chi tiết AI</button>
                <button onClick={()=> navigator.clipboard.writeText(JSON.stringify(result, null, 2))} style={{fontSize:11, padding:'4px 8px', borderRadius:999, border:'1px solid #E2E8E5'}}>Chép</button>
                <button onClick={()=> window.open(`${API}/api/ai/rag/search?q=${encodeURIComponent(q)}`,'_blank')} style={{fontSize:11, padding:'4px 8px', borderRadius:999, border:'1px solid #E2E8E5'}}>Bằng chứng</button>
              </div>
              {showInspector && (
                <div style={{marginTop:8, background:'#0B1412', color:'#A7F3D0', borderRadius:8, padding:10, fontSize:11, fontFamily:'monospace'}}>
                  <div>LUỒNG AI</div>
                  <div>Mục đích: {result.intent}</div>
                  <div>Tác vụ: {result.workflow?.agent}</div>
                  <div>Công cụ: {(result.workflow?.tools_used || []).join(', ')}</div>
                  <div>Truy xuất: {result.workflow?.retrieval_count} tài liệu</div>
                  <div>Nguồn dữ liệu: {result.workflow?.data_sources}</div>
                  <div>Cấu trúc: {String(result.workflow?.structured_valid)}</div>
                  <div>Mô hình: {result.workflow?.model} ({result.workflow?.provider})</div>
                  <div>Độ trễ: {result.workflow?.latency_ms}ms</div>
                  <div>Trạng thái: {result.workflow?.status}</div>
                </div>
              )}
              <div style={{fontSize:10, color:'#64748B', marginTop:6}}>Phân biệt: <b>QUAN TRẮC</b> vệ tinh/thời tiết · <b>SUY LUẬN AI</b> điểm nguy cơ · <b>MÔ PHỎNG</b> giả định · <b>CHÍNH THỨC</b> khi có xác minh</div>
              <div style={{fontSize:10, color:'#92400E', background:'#FEF3C7', padding:'4px 6px', borderRadius:6, marginTop:4}}>Citations: {(result.rag?.citations || []).slice(0,3).map((c:any)=> c.title).join(' · ') || 'Sentinel-2, FIRMS, Open-Meteo'}</div>
            </div>
          )}
          <div style={{marginTop:8, display:'flex', alignItems:'center', gap:6, fontSize:10, color:'#64748B'}}>
            <span>Quy trình:</span>
            <span style={{background: phase==='THINKING'?'#0F766E':'#E2E8E5', color: phase==='THINKING'?'#fff':'#64748B', padding:'2px 6px', borderRadius:999}}>NGƯỜI DÙNG</span>→
            <span style={{background: phase==='RETRIEVING DATA'?'#0F766E':'#E2E8E5', padding:'2px 6px', borderRadius:999}}>DỮ LIỆU</span>→
            <span style={{background: phase==='ANALYZING'?'#0F766E':'#E2E8E5', padding:'2px 6px', borderRadius:999}}>CÔNG CỤ</span>→<span style={{background: phase==='GENERATING'?'#0F766E':'#E2E8E5', padding:'2px 6px', borderRadius:999}}>AI</span>→<span style={{background: phase==='COMPLETE'?'#10B981':'#E2E8E5', color: phase==='COMPLETE'?'#fff':'#64748B', padding:'2px 6px', borderRadius:999}}>BẰNG CHỨNG</span>
          </div>
        </div>
      )}
      <style>{`
        .fab{ position:fixed; bottom:20px; right:20px; width:56px; height:56px; border-radius:999px; background:#0B1412; color:#fff; border:0; font-size:22px; box-shadow:0 8px 24px rgba(0,0,0,0.2); }
        .ai-drawer{ position:fixed; bottom:90px; right:20px; width:min(420px, calc(100vw - 24px)); background:#fff; border:1px solid #E2E8E5; border-radius:16px; padding:16px; box-shadow:0 8px 24px rgba(0,0,0,0.12); }
        @media (max-width: 640px){ .ai-drawer{ right:12px; bottom:84px; } }
        .ai-head{ display:flex; justify-content:space-between; font-weight:700; font-size:13px; }
        .suggestions{ display:flex; flex-wrap:wrap; gap:6px; margin:10px 0; }
        .suggestions button{ font-size:11px; background:#F1F5F3; border:0; padding:6px 10px; border-radius:999px; text-align:left; }
        textarea{ width:100%; height:80px; border:1px solid #E2E8E5; border-radius:12px; padding:10px; font-size:13px; }
        .ask{ margin-top:8px; background:#0F766E; color:#fff; border:0; padding:8px 12px; border-radius:999px; flex:1; }
        .answer{ margin-top:10px; background:#F8FAF9; border:1px solid #E2E8E5; border-radius:12px; padding:10px; font-size:13px; }
        .answer-wrap{ position:relative; }
        .answer-toggle{ margin-top:5px; border:0; background:transparent; color:#0F766E; font-size:11px; font-weight:800; cursor:pointer; padding:2px 0; }
        .ai-result-card{ margin-top:10px; border:1px solid #CBD5E1; border-radius:12px; padding:11px; background:#F8FAFC; color:#0F172A; }
        .ai-result-head{ display:flex; justify-content:space-between; gap:8px; align-items:center; margin-bottom:6px; color:#0F172A; }
        .ai-result-head span{ font-size:10px; color:#047857; background:#D1FAE5; border-radius:999px; padding:2px 7px; font-weight:800; }
        .ai-risk-line{ margin:4px 0; font-size:14px; color:#0F172A; }
      `}</style>
    </>
  )
}

function AnimatedRoutes(){
  const location = useLocation()
  const navigate = useNavigate()
  useEffect(()=>{
    const openFireEvent = (event: Event)=>{
      const eventId = (event as CustomEvent).detail?.eventId
      if(typeof eventId !== 'string' || !eventId) return
      if(location.pathname === '/events') {
        window.dispatchEvent(new CustomEvent('ecochain-highlight-fire-signal', { detail:{ eventId } }))
        return
      }
      navigate(`/events/${encodeURIComponent(eventId)}`)
    }
    const openCommunityReport = (event: Event)=>{
      const reportId = (event as CustomEvent).detail?.reportId
      if(typeof reportId === 'string' && reportId) navigate(`/community/reports/${encodeURIComponent(reportId)}`)
    }
    window.addEventListener('ecochain-open-fire-event', openFireEvent)
    window.addEventListener('ecochain-open-community-report', openCommunityReport)
    return ()=> {
      window.removeEventListener('ecochain-open-fire-event', openFireEvent)
      window.removeEventListener('ecochain-open-community-report', openCommunityReport)
    }
  },[navigate, location.pathname])
  useEffect(()=>{
    const base = Object.keys(TITLES).sort((a,b)=> b.length - a.length)
      .find(p=> p === '/' ? location.pathname === '/' : location.pathname.startsWith(p))
    document.title = `${base ? TITLES[base] + ' — ' : ''}GIALAI EcoChain`
  },[location.pathname])
  return (
    <Suspense fallback={<div style={{padding:24}}><div className="skeleton" style={{height:320}} /></div>}>
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          <Route path="/" element={<PageTransition><EcoMap/></PageTransition>} />
          <Route path="/trung-tam-chi-huy" element={<PageTransition><TrungTamChiHuy/></PageTransition>} />
          <Route path="/ban-do-3d" element={<PageTransition><BanDo3D/></PageTransition>} />
          <Route path="/chay-lich-su" element={<PageTransition><ChayLichSu/></PageTransition>} />
          <Route path="/phong-thi-nghiem" element={<PageTransition><PhongThiNghiem/></PageTransition>} />
          <Route path="/nguon-du-lieu" element={<PageTransition><NguonDuLieu/></PageTransition>} />
          <Route path="/thong-bao" element={<PageTransition><Notifications/></PageTransition>} />
          <Route path="/nhat-ky" element={<PageTransition><Audit/></PageTransition>} />
          <Route path="/events" element={<PageTransition><EventsList/></PageTransition>} />
          <Route path="/events/:id" element={<PageTransition><EventIntelligence/></PageTransition>} />
          <Route path="/firesim" element={<PageTransition><FireSim/></PageTransition>} />
          <Route path="/missions" element={<PageTransition><Missions/></PageTransition>} />
          {/* Legacy intelligence kept as hidden capabilities, not primary nav */}
          <Route path="/map" element={<PageTransition><MapPage/></PageTransition>} />
          <Route path="/forest" element={<PageTransition><Forest/></PageTransition>} />
          <Route path="/community" element={<PageTransition><Community/></PageTransition>} />
          <Route path="/community/reports/:reportId" element={<PageTransition><CommunityReportDetail/></PageTransition>} />
          <Route path="/admin" element={<PageTransition><Admin/></PageTransition>} />
          <Route path="/notifications" element={<PageTransition><Notifications/></PageTransition>} />
          <Route path="/audit" element={<PageTransition><Audit/></PageTransition>} />
          <Route path="/login" element={<PageTransition><Login/></PageTransition>} />
          <Route path="/viewer/:assetId" element={<PageTransition><Viewer/></PageTransition>} />
          <Route path="*" element={<PageTransition><NotFound/></PageTransition>} />
        </Routes>
      </AnimatePresence>
    </Suspense>
  )
}

export default function App(){
  // Shared area scope: map selections drive gauge/missions everywhere.
  useEffect(()=>{
    useScope.getState().loadHierarchy().catch(()=> {})
    const h = (e: any)=>{
      const d = e.detail || {}
      if(d.area) useScope.getState().setArea(String(d.area), d.lat, d.lon)
    }
    window.addEventListener('ecochain-select-area', h)
    return ()=> window.removeEventListener('ecochain-select-area', h)
  },[])
  return (
    <MotionConfig reducedMotion="user">
      <BrowserRouter>
        <LangProvider>
          <ErrorBoundary>
            <AppShell>
              <AnimatedRoutes />
            </AppShell>
          </ErrorBoundary>
          <AIAssistant />
        </LangProvider>
      </BrowserRouter>
    </MotionConfig>
  )
}
