import { BrowserRouter, Routes, Route } from 'react-router-dom'
import AppShell from './components/AppShell'
import Dashboard from './pages/Dashboard'
import MapPage from './pages/MapPage'
import Forest from './pages/Forest'
import Disaster from './pages/Disaster'
import Agriculture from './pages/Agriculture'
import Carbon from './pages/Carbon'
import EUDR from './pages/EUDR'
import Logistics from './pages/Logistics'
import Twin from './pages/Twin'
import Community from './pages/Community'
import Governance from './pages/Governance'
import Leaderboard from './pages/Leaderboard'
import Reports from './pages/Reports'
import Admin from './pages/Admin'
import { useState } from 'react'

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

export default function App(){
  return (
    <BrowserRouter>
      <AppShell>
        <Routes>
          <Route path="/" element={<Dashboard/>} />
          <Route path="/map" element={<MapPage/>} />
          <Route path="/forest" element={<Forest/>} />
          <Route path="/disaster" element={<Disaster/>} />
          <Route path="/agriculture" element={<Agriculture/>} />
          <Route path="/carbon" element={<Carbon/>} />
          <Route path="/eudr" element={<EUDR/>} />
          <Route path="/logistics" element={<Logistics/>} />
          <Route path="/twin" element={<Twin/>} />
          <Route path="/community" element={<Community/>} />
          <Route path="/actions" element={<Governance/>} />
          <Route path="/leaderboard" element={<Leaderboard/>} />
          <Route path="/reports" element={<Reports/>} />
          <Route path="/admin" element={<Admin/>} />
          <Route path="/notifications" element={<div className="card">Notifications — Critical/Warnings/Tasks — Groups by priority</div>} />
          <Route path="/audit" element={<div className="card">Audit Log — Timestamp · User · Action · Scope · Status</div>} />
        </Routes>
      </AppShell>
      <AIAssistant />
    </BrowserRouter>
  )
}
