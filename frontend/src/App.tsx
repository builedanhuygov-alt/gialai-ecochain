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
  const [ans, setAns] = useState<string|null>(null)
  const ask = ()=>{
    if(q.toLowerCase().includes('rủi ro') || q.toLowerCase().includes('risk')) setAns('3 xã có nguy cơ cháy cao. Cao nhất: Xã A 87/100 Tin cậy 89% — khô hạn thực bì, bất thường vệ tinh. Nguồn: Sentinel-2 · Thời tiết · Báo cáo đã xác minh. [Mở bản đồ]')
    else setAns('EcoGL AI đã phân tích vệ tinh + báo cáo đã xác minh · Tin cậy 82% · 2 giờ trước')
  }
  return (
    <>
      <button className="fab" onClick={()=> setOpen(true)} aria-label="Trợ lý AI">🤖</button>
      {open && (
        <div className="ai-drawer" role="dialog" aria-modal="true">
          <div className="ai-head">Trợ lý AI EcoGL <button onClick={()=>setOpen(false)}>✕</button></div>
          <div className="suggestions">
            <button onClick={()=>setQ('Xã nào rủi ro cao nhất')}>Xã rủi ro cao nhất</button>
            <button onClick={()=>setQ('Bất thường rừng')}>Bất thường rừng</button>
            <button onClick={()=>setQ('Tối ưu logistics')}>Tối ưu logistics</button>
          </div>
          <textarea value={q} onChange={e=>setQ(e.target.value)} placeholder="Hỏi về tỉnh Gia Lai..." aria-label="Hỏi AI" />
          <button className="ask" onClick={ask}>Hỏi AI</button>
          {ans && <div className="answer">{ans}</div>}
        </div>
      )}
      <style>{`
        .fab{ position:fixed; bottom:20px; right:20px; width:56px; height:56px; border-radius:999px; background:#0B1412; color:#fff; border:0; font-size:22px; box-shadow:0 8px 24px rgba(0,0,0,0.2); }
        .ai-drawer{ position:fixed; bottom:90px; right:20px; width:360px; background:#fff; border:1px solid #E2E8E5; border-radius:16px; padding:16px; box-shadow:0 8px 24px rgba(0,0,0,0.12); }
        .ai-head{ display:flex; justify-content:space-between; font-weight:700; font-size:13px; }
        .suggestions{ display:flex; flex-wrap:wrap; gap:6px; margin:10px 0; }
        .suggestions button{ font-size:12px; background:#F1F5F3; border:0; padding:6px 10px; border-radius:999px; }
        textarea{ width:100%; height:80px; border:1px solid #E2E8E5; border-radius:12px; padding:10px; font-size:13px; }
        .ask{ margin-top:8px; background:#0F766E; color:#fff; border:0; padding:8px 12px; border-radius:999px; width:100%; }
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
