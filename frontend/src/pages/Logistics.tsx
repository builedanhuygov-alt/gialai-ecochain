import MapView from '../components/MapView'
import { useEffect, useState } from 'react'

const API = (import.meta as any).env?.VITE_API_BASE || 'http://localhost:8000'

export default function Logistics(){
  const [routes, setRoutes] = useState<any[] | null>(null)
  useEffect(()=>{
    fetch(`${API}/api/logistics/routes`).then(r=>r.json()).then(j=>setRoutes(j)).catch(()=>setRoutes([]))
  },[])
  return (
    <div className="page">
      <h1>Green Logistics — Route Optimizer</h1>
      <div className="modes"><span>Fastest</span><span>Lowest CO₂</span><span>Lowest Risk</span><span className="active">Balanced</span></div>
      <MapView />
      <div className="compare">{routes === null ? <div>Đang tải tuyến từ GreenRouteAgent...</div> : routes.length === 0 ? <div>Chưa có tuyến trong DB — ví dụ minh họa: Route A: 82km 2h10 31kg CO₂ LOW · Route B: 91km 2h00 24kg CO₂ LOW — Greenest <span style={{fontSize:10, padding:'2px 6px', borderRadius:999, background:'#FEF3C7'}}>DEMO DATA</span></div> : routes.slice(0,2).map((r:any)=> <div key={r.id}>Route {r.id?.slice(0,4)}: {r.origin}→{r.destination} · {r.distance_km}km · {r.risk_level} <span style={{fontSize:10, padding:'2px 6px', borderRadius:999, background:'#DCFCE7'}}>LIVE</span></div>)}</div>
      <style>{`.modes{display:flex; gap:8px} .modes span{padding:6px 10px; background:#F1F5F3; border-radius:999px; font-size:13px} .modes .active{background:#0B1412; color:#fff} .compare{display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-top:12px} .compare div{background:#fff; border:1px solid #E2E8E5; border-radius:12px; padding:16px}`}</style>
    </div>
  )
}
