import { useEffect, useState } from 'react'

const API = (import.meta as any).env?.VITE_API_BASE || 'http://localhost:8000'

export default function Carbon(){
  const [live, setLive] = useState<any>(null)
  useEffect(()=>{
    // CarbonGuard AI: NDVI + diện tích rừng Gia Lai → ước tính carbon
    fetch(`${API}/api/carbon/analyze`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({administrative_unit_id:'GiaLai',forest_area_ha:692722,ndvi:0.62,period:'2026-09'})}).then(r=>r.json()).then(j=>setLive(j)).catch(()=>{})
  },[])
  return (
    <div className="page">
      <h1>Carbon — ESTIMATE</h1>
      <div className="card">Forest Carbon: {live ? `${Math.round(live.estimated_carbon_stock_t||0).toLocaleString()} tCO₂e · Tin cậy ${live.confidence||'?'}%` : '1.2M tCO₂e (range 0.9–1.5M, Medium confidence)'} · Trend ↑ · Not carbon credit certification <span style={{fontSize:10, padding:'2px 6px', borderRadius:999, background:live?'#DCFCE7':'#FEF3C7'}}>{live?'LIVE · CarbonGuard':'DEMO DATA'}</span></div>
      <div className="card">Historical vs Forecast chart (MapLibre + Recharts)</div>
      <style>{`.card{background:#fff; border:1px solid #E2E8E5; border-radius:12px; padding:16px; margin-top:12px}`}</style>
    </div>
  )
}
