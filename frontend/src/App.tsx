import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { AnimatePresence, MotionConfig } from 'framer-motion'
import { lazy, Suspense, useState } from 'react'
import AppShell from './components/AppShell'
import { PageTransition } from './motion/primitives'
const EcoMap = lazy(()=> import('./pages/EcoMap'))
const MapPage = lazy(()=> import('./pages/MapPage'))
const EventIntelligence = lazy(()=> import('./pages/EventIntelligence'))
const EventsList = lazy(()=> import('./pages/EventIntelligence').then(m=> ({ default: m.EventsList })))
const WhatIfLab = lazy(()=> import('./pages/WhatIfLab'))
const Missions = lazy(()=> import('./pages/Missions'))
const Forest = lazy(()=> import('./pages/Forest'))
const Disaster = lazy(()=> import('./pages/Disaster'))
const Agriculture = lazy(()=> import('./pages/Agriculture'))
const Carbon = lazy(()=> import('./pages/Carbon'))
const EUDR = lazy(()=> import('./pages/EUDR'))
const Logistics = lazy(()=> import('./pages/Logistics'))
const Twin = lazy(()=> import('./pages/Twin'))
const Community = lazy(()=> import('./pages/Community'))
const Governance = lazy(()=> import('./pages/Governance'))
const Leaderboard = lazy(()=> import('./pages/Leaderboard'))
const Reports = lazy(()=> import('./pages/Reports'))
const Admin = lazy(()=> import('./pages/Admin'))

function AIAssistant(){
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(false)
  const [phase, setPhase] = useState<string>('')
  const [stream, setStream] = useState<string>('')
  const [result, setResult] = useState<any>(null)
  const [showInspector, setShowInspector] = useState(false)
  const API = (import.meta as any).env?.VITE_API_BASE || 'https://backend-delta-flame-42.vercel.app'
  
  const suggestions = [
    "Phân tích nguy cơ cháy rừng",
    "Kiểm tra biến động rừng 7 ngày",
    "Tìm vùng cây trồng bị stress",
    "Chạy kịch bản nhiệt độ +3°C",
    "Giải thích EUDR risk",
    "Gia Lai hiện có khu vực nào nguy cơ cao?",
    "Vì sao khu vực này có nguy cơ cháy cao?"
  ]

  const ask = async (query?: string)=>{
    const qq = (query || q).trim()
    if(!qq) return
    setQ(qq)
    setLoading(true); setPhase('THINKING'); setStream(''); setResult(null)
    try{
      setPhase('RETRIEVING DATA')
      const r = await fetch(`${API}/api/ai/chat`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ query: qq, lat:13.9, lon:108.3 }) })
      if(!r.ok) throw new Error(await r.text())
      const j = await r.json()
      setPhase('ANALYZING')
      // Simulate streaming for non-stream endpoint
      const content = JSON.stringify(j.structured_output || j, null, 2)
      setStream(content.slice(0, 800))
      setPhase('GENERATING')
      setResult(j)
      setPhase('COMPLETE')
    }catch(e:any){
      setStream(String(e.message || e).slice(0,400))
      setPhase('ERROR')
    }finally{ setLoading(false) }
  }

  const askStream = async ()=>{
    const qq = q.trim(); if(!qq) return
    setLoading(true); setPhase('THINKING'); setStream(''); setResult(null)
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
        <div className="ai-drawer" role="dialog" aria-modal="true" style={{width:420, maxHeight:'85vh', overflow:'auto'}}>
          <div className="ai-head">Trí tuệ Môi trường Gia Lai <button onClick={()=>setOpen(false)}>✕</button></div>
          <div style={{fontSize:11, color:'#64748B', margin:'4px 0'}}>Hệ thống điều phối: Master → RAG → Domain Agent → Tools → Evidence</div>
          <div className="suggestions">
            {suggestions.map(s=> <button key={s} onClick={()=> ask(s)}>{s}</button>)}
          </div>
          <textarea value={q} onChange={e=>setQ(e.target.value)} placeholder="Gia Lai hiện tại có khu vực nào nguy cơ cháy rừng cao?" aria-label="Hỏi AI" />
          <div style={{display:'flex', gap:8, marginTop:8}}>
            <button className="ask" onClick={()=>ask()} disabled={loading}>{loading? phase : 'Phân tích'}</button>
            <button className="ask" onClick={askStream} disabled={loading} style={{background:'#0B1412'}}>{loading? '...' : 'Stream'}</button>
          </div>
          {loading && <div style={{marginTop:8, fontSize:12, background:'#FEF3C7', padding:'6px 10px', borderRadius:8}}>{phase}... <span className="dot" style={{display:'inline-block', width:8, height:8, background:'#F59E0B', borderRadius:999, animation:'pulse 1s infinite'}}/></div>}
          {stream && <div className="answer" style={{whiteSpace:'pre-wrap', maxHeight:200, overflow:'auto'}}>{stream.slice(0,1200)}</div>}
          {result && (
            <div style={{marginTop:10, border:'1px solid #E2E8E5', borderRadius:12, padding:10, background:'#F8FAF9'}}>
              <div style={{fontWeight:700, fontSize:12}}>FIRE INTELLIGENCE</div>
              <div style={{fontSize:13}}>Risk: <b>{result.risk?.score ?? result.structured_output?.risk?.score ?? '--'} / 100</b> · Band <b>{result.risk?.band ?? '--'}</b></div>
              <div style={{fontSize:12}}>Confidence: <b>{Math.round((result.risk?.confidence ?? result.model_confidence ?? 0)*100) || result.risk?.confidence || '--'}%</b> · Data completeness: {result.data_completeness ?? '--'}%</div>
              <div style={{fontSize:11, color:'#334155', marginTop:4}}>Tín hiệu: {Object.keys(result.factors || {}).join(', ') || 'fuel dryness, weather, FIRMS'}</div>
              <div style={{fontSize:11, marginTop:6}}>Evidence: {result.evidence?.length ?? 0} sources · RAG: {result.rag?.retrieved_documents ?? 0} docs</div>
              <div style={{display:'flex', gap:6, marginTop:8, flexWrap:'wrap'}}>
                <button onClick={()=> setShowInspector(v=>!v)} style={{fontSize:11, padding:'4px 8px', borderRadius:999, border:'1px solid #0F766E', background: showInspector?'#0F766E':'#fff', color: showInspector?'#fff':'#0F766E'}}>AI Inspector</button>
                <button onClick={()=> navigator.clipboard.writeText(JSON.stringify(result, null, 2))} style={{fontSize:11, padding:'4px 8px', borderRadius:999, border:'1px solid #E2E8E5'}}>Copy</button>
                <button onClick={()=> window.open(`${API}/api/ai/rag/search?q=${encodeURIComponent(q)}`,'_blank')} style={{fontSize:11, padding:'4px 8px', borderRadius:999, border:'1px solid #E2E8E5'}}>Evidence</button>
              </div>
              {showInspector && (
                <div style={{marginTop:8, background:'#0B1412', color:'#A7F3D0', borderRadius:8, padding:10, fontSize:11, fontFamily:'monospace'}}>
                  <div>AI WORKFLOW</div>
                  <div>Intent: {result.intent}</div>
                  <div>Agent: {result.workflow?.agent}</div>
                  <div>Tools: {(result.workflow?.tools_used || []).join(', ')}</div>
                  <div>Retrieval: {result.workflow?.retrieval_count} docs</div>
                  <div>Data sources: {result.workflow?.data_sources}</div>
                  <div>Structured: {String(result.workflow?.structured_valid)}</div>
                  <div>Model: {result.workflow?.model} ({result.workflow?.provider})</div>
                  <div>Latency: {result.workflow?.latency_ms}ms</div>
                  <div>Status: {result.workflow?.status}</div>
                </div>
              )}
              <div style={{fontSize:10, color:'#64748B', marginTop:6}}>Phân biệt: <b>OBSERVED</b> vệ tinh/thời tiết · <b>AI INFERENCE</b> risk · <b>SIMULATION</b> What-if · <b>OFFICIAL</b> khi có xác minh</div>
              <div style={{fontSize:10, color:'#92400E', background:'#FEF3C7', padding:'4px 6px', borderRadius:6, marginTop:4}}>Citations: {(result.rag?.citations || []).slice(0,3).map((c:any)=> c.title).join(' · ') || 'Sentinel-2, FIRMS, Open-Meteo'}</div>
            </div>
          )}
          <div style={{marginTop:8, display:'flex', alignItems:'center', gap:6, fontSize:10, color:'#64748B'}}>
            <span>Pipeline:</span>
            <span style={{background: phase==='THINKING'?'#0F766E':'#E2E8E5', color: phase==='THINKING'?'#fff':'#64748B', padding:'2px 6px', borderRadius:999}}>USER</span>→
            <span style={{background: phase==='RETRIEVING DATA'?'#0F766E':'#E2E8E5', padding:'2px 6px', borderRadius:999}}>RAG</span>→
            <span style={{background: phase==='ANALYZING'?'#0F766E':'#E2E8E5', padding:'2px 6px', borderRadius:999}}>TOOLS</span>→<span style={{background: phase==='GENERATING'?'#0F766E':'#E2E8E5', padding:'2px 6px', borderRadius:999}}>AI</span>→<span style={{background: phase==='COMPLETE'?'#10B981':'#E2E8E5', color: phase==='COMPLETE'?'#fff':'#64748B', padding:'2px 6px', borderRadius:999}}>EVIDENCE</span>
          </div>
        </div>
      )}
      <style>{`
        .fab{ position:fixed; bottom:20px; right:20px; width:56px; height:56px; border-radius:999px; background:#0B1412; color:#fff; border:0; font-size:22px; box-shadow:0 8px 24px rgba(0,0,0,0.2); }
        .ai-drawer{ position:fixed; bottom:90px; right:20px; width:360px; background:#fff; border:1px solid #E2E8E5; border-radius:16px; padding:16px; box-shadow:0 8px 24px rgba(0,0,0,0.12); }
        .ai-head{ display:flex; justify-content:space-between; font-weight:700; font-size:13px; }
        .suggestions{ display:flex; flex-wrap:wrap; gap:6px; margin:10px 0; }
        .suggestions button{ font-size:11px; background:#F1F5F3; border:0; padding:6px 10px; border-radius:999px; text-align:left; }
        textarea{ width:100%; height:80px; border:1px solid #E2E8E5; border-radius:12px; padding:10px; font-size:13px; }
        .ask{ margin-top:8px; background:#0F766E; color:#fff; border:0; padding:8px 12px; border-radius:999px; flex:1; }
        .answer{ margin-top:10px; background:#F8FAF9; border:1px solid #E2E8E5; border-radius:12px; padding:10px; font-size:13px; }
      `}</style>
    </>
  )
}

function AnimatedRoutes(){
  const location = useLocation()
  return (
    <Suspense fallback={<div style={{padding:24}}><div className="skeleton" style={{height:320}} /></div>}>
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          <Route path="/" element={<PageTransition><EcoMap/></PageTransition>} />
          <Route path="/events" element={<PageTransition><EventsList/></PageTransition>} />
          <Route path="/events/:id" element={<PageTransition><EventIntelligence/></PageTransition>} />
          <Route path="/what-if" element={<PageTransition><WhatIfLab/></PageTransition>} />
          <Route path="/missions" element={<PageTransition><Missions/></PageTransition>} />
          {/* Legacy intelligence kept as hidden capabilities, not primary nav */}
          <Route path="/map" element={<PageTransition><MapPage/></PageTransition>} />
          <Route path="/forest" element={<PageTransition><Forest/></PageTransition>} />
          <Route path="/disaster" element={<PageTransition><Disaster/></PageTransition>} />
          <Route path="/agriculture" element={<PageTransition><Agriculture/></PageTransition>} />
          <Route path="/carbon" element={<PageTransition><Carbon/></PageTransition>} />
          <Route path="/eudr" element={<PageTransition><EUDR/></PageTransition>} />
          <Route path="/logistics" element={<PageTransition><Logistics/></PageTransition>} />
          <Route path="/twin" element={<PageTransition><Twin/></PageTransition>} />
          <Route path="/community" element={<PageTransition><Community/></PageTransition>} />
          <Route path="/actions" element={<PageTransition><Governance/></PageTransition>} />
          <Route path="/leaderboard" element={<PageTransition><Leaderboard/></PageTransition>} />
          <Route path="/reports" element={<PageTransition><Reports/></PageTransition>} />
          <Route path="/admin" element={<PageTransition><Admin/></PageTransition>} />
          <Route path="/notifications" element={<PageTransition><div className="card">Thông báo — Nguy kịch/Cảnh báo/Nhiệm vụ — Theo mức độ</div></PageTransition>} />
          <Route path="/audit" element={<PageTransition><div className="card">Nhật ký — Thời gian · Người dùng · Hành động · Phạm vi · Trạng thái</div></PageTransition>} />
        </Routes>
      </AnimatePresence>
    </Suspense>
  )
}

export default function App(){
  return (
    <MotionConfig reducedMotion="user">
      <BrowserRouter>
        <AppShell>
          <AnimatedRoutes />
        </AppShell>
        <AIAssistant />
      </BrowserRouter>
    </MotionConfig>
  )
}
