import MapView from '../components/MapView'
import { useEffect, useState } from 'react'
import { Tabs } from '../components/Tabs'

const API = (import.meta as any).env?.VITE_API_BASE || 'http://localhost:8000'

export default function Forest(){
  const [stats, setStats] = useState<any>(null)
  useEffect(()=>{
    fetch(`${API}/api/forest/statistics`).then(r=>r.json()).then(j=>setStats(j)).catch(()=>{})
  },[])
  return (
    <div className="page">
      <h1>Trí tuệ Rừng</h1>
      <Tabs tabs={['Tổng quan','Sức khỏe','Bất thường']} />
      <div className="kpis"><div>Diện tích 12,430 ha</div><div>Sức khỏe 78.4</div><div>Bất thường 3</div></div>
      <div style={{fontSize:11, color:'#64748B'}}>ForestGuard: {stats ? `đang giám sát ${stats.areas_monitored ?? 0} khu · chờ xử lý ${stats.pending_signals ?? 0} · rủi ro cao ${stats.high_risk ?? 0} ` : 'đang tải... '}<span style={{fontSize:10, padding:'2px 6px', borderRadius:999, background:stats?'#DCFCE7':'#FEF3C7'}}>{stats?'LIVE':'DEMO DATA'}</span></div>
      <MapView />
      <div className="grid">
        <div className="card">NDVI Trend — Healthy vs Change (GEE Sentinel-2 ● Connected, 14:32)</div>
        <div className="card">AI Detections — 🔥 High fire risk · 2 community confirmations · 87% confidence <span style={{fontSize:10, padding:'2px 6px', borderRadius:999, background:'#FEF3C7'}}>DEMO DATA</span> <button>Review</button><div style={{fontSize:11, color:'#64748B', marginTop:6}}>Công thức Nesterov/FWI + NDVI (deterministic) · LLM Gemini 2.5 chỉ diễn giải văn bản</div></div>
      </div>
      <style>{`.page{display:flex; flex-direction:column; gap:16px} .kpis{display:flex; gap:12px} .kpis div{background:#fff; border:1px solid #E2E8E5; border-radius:12px; padding:12px; flex:1} .grid{display:grid; grid-template-columns:1fr 1fr; gap:14px} .card{background:#fff; border:1px solid #E2E8E5; border-radius:12px; padding:16px} h1{font-size:18px; font-weight:800}`}</style>
    </div>
  )
}
