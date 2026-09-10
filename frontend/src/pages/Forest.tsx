import MapView from '../components/MapView'
import { useEffect, useState } from 'react'
import { Tabs } from '../components/Tabs'
import { API_BASE } from '../services/api'

const API = API_BASE

export default function Forest(){
  const [tab, setTab] = useState('Tổng quan')
  const [stats, setStats] = useState<any>(null)
  const [ndvi, setNdvi] = useState<any>(null)
  const [proposals, setProposals] = useState<any[]>([])
  useEffect(()=>{
    fetch(`${API}/api/forest/statistics`).then(r=>r.json()).then(j=>setStats(j)).catch(()=>{})
    fetch(`${API}/api/v1/satellite/ndvi?bbox=107.0,12.9,109.6,15.0`).then(r=>r.json()).then(j=>setNdvi(j)).catch(()=>{})
    fetch(`${API}/api/forest/proposals`).then(r=>r.json()).then(j=>setProposals(Array.isArray(j) ? j.slice(0,5) : [])).catch(()=>{})
  },[])
  return (
    <div className="page">
      <h1>Trí tuệ Rừng</h1>
      <Tabs tabs={['Tổng quan','Sức khỏe','Bất thường']} onSelect={setTab} />
      <div className="kpis"><div>Diện tích 12,430 ha</div><div>Sức khỏe {ndvi?.ndvi?.mean ?? 78.4}</div><div>Bất thường {proposals.length}</div></div>
      <div style={{fontSize:11, color:'#64748B'}}>ForestGuard: {stats ? `đang giám sát ${stats.areas_monitored ?? 0} khu · chờ xử lý ${stats.pending_signals ?? 0} · rủi ro cao ${stats.high_risk ?? 0} ` : 'đang tải... '}<span style={{fontSize:10, padding:'2px 6px', borderRadius:999, background:stats?'#DCFCE7':'#FEF3C7'}}>{stats?'LIVE':'DEMO DATA'}</span></div>
      {tab === 'Tổng quan' && <MapView />}
      {tab === 'Sức khỏe' && (
        <div className="card">🌿 NDVI Gia Lai: <b>{ndvi?.ndvi?.mean ?? '…'}</b> (min {ndvi?.ndvi?.min ?? '…'} · max {ndvi?.ndvi?.max ?? '…'}) · {ndvi?.source ?? ''} · <span style={{fontSize:10, padding:'2px 6px', borderRadius:999, background: ndvi?.status==='LIVE' ? '#DCFCE7' : '#FEF3C7'}}>{ndvi?.status ?? 'đang tải'}</span><div style={{fontSize:11, color:'#64748B', marginTop:6}}>Công thức NDVI = (B08 − B04)/(B08 + B04) · Sentinel-2</div></div>
      )}
      {tab === 'Bất thường' && (
        <div style={{display:'grid', gap:8}}>
          {proposals.length === 0 && <div className="card">Chưa có bất thường nào.</div>}
          {proposals.map(p=> (
            <div key={p.id} className="card">🔥 {p.title || p.data_type} · {p.status} · AI {p.confidence ?? '?'}%</div>
          ))}
        </div>
      )}
      <div className="grid">
        <div className="card">NDVI Trend — Healthy vs Change (GEE Sentinel-2 ● Connected, 14:32)</div>
        <div className="card">AI Detections — 🔥 High fire risk · 2 community confirmations · 87% confidence <span style={{fontSize:10, padding:'2px 6px', borderRadius:999, background:'#FEF3C7'}}>DEMO DATA</span> <button>Review</button><div style={{fontSize:11, color:'#64748B', marginTop:6}}>Công thức Nesterov/FWI + NDVI (deterministic) · LLM Gemini 2.5 chỉ diễn giải văn bản</div></div>
      </div>
      <style>{`.page{display:flex; flex-direction:column; gap:16px} .kpis{display:flex; gap:12px} .kpis div{background:#fff; border:1px solid #E2E8E5; border-radius:12px; padding:12px; flex:1} .grid{display:grid; grid-template-columns:1fr 1fr; gap:14px} .card{background:#fff; border:1px solid #E2E8E5; border-radius:12px; padding:16px} h1{font-size:18px; font-weight:800} @media (max-width: 640px){ .kpis{ flex-direction:column; } .grid{ grid-template-columns:1fr; } }`}</style>
    </div>
  )
}
