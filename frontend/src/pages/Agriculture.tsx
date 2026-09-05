import MapView from '../components/MapView'
import { useEffect, useState } from 'react'

const API = (import.meta as any).env?.VITE_API_BASE || 'http://localhost:8000'

export default function Agriculture(){
  const [agri, setAgri] = useState<any>(null)
  useEffect(()=>{
    fetch(`${API}/api/predictive/agri?administrative_unit_id=GiaLai&crop=coffee`).then(r=>r.json()).then(j=>setAgri(j)).catch(()=>{})
  },[])
  return (
    <div className="page">
      <h1>Agriculture AI — Coffee Health 68% Healthy · 24% Moderate · 8% Stressed</h1>
      <div className="grid"><div className="card">Crop Health · Production · Weather · Harvest<div style={{fontSize:11, color:'#64748B', marginTop:6}}>PredictiveAgent: {agri ? `${JSON.stringify(agri).slice(0,120)}... ` : 'đang tải... '}<span style={{fontSize:10, padding:'2px 6px', borderRadius:999, background:agri?'#DCFCE7':'#FEF3C7'}}>{agri?'LIVE':'DEMO DATA'}</span></div></div><div className="card">Farm polygons — Gia Lai coffee zones</div></div>
      <MapView />
      <style>{`.grid{display:grid; grid-template-columns:1fr 1fr; gap:14px} .card{background:#fff; border:1px solid #E2E8E5; border-radius:12px; padding:16px}`}</style>
    </div>
  )
}
