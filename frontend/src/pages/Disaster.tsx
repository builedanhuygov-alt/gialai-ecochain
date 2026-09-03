import MapView from '../components/MapView'
import { Tabs } from '../components/Tabs'
import { FireWarningCard, FireIntelligencePanel } from '../components/FireComponents'
import { useEffect, useState } from 'react'
const API = (import.meta as any).env?.VITE_API_BASE || 'http://localhost:8000'
export default function Disaster(){
  const [fire, setFire]= useState<any>(null)
  const [official, setOfficial]= useState<any>(null)
  useEffect(()=>{
    fetch(`${API}/api/fire/risk?administrative_unit_id=GiaLai&lat=13.9&lon=108.3`).then(r=>r.json()).then(j=> setFire(j)).catch(()=>{})
    fetch(`${API}/api/fire/warnings`).then(r=>r.json()).then(j=> setOfficial(j[0])).catch(()=>{})
  },[])
  return (
    <div className="page">
      <h1>AI Thiên tai — Trí tuệ Lửa Rừng</h1>
      <Tabs tabs={['Cháy','Ngập','Hạn','Bão','Sạt lở']} defaultTab="Cháy" />
      <div style={{height:12}} />
      <div style={{display:'grid', gridTemplateColumns:'1.4fr 1fr', gap:14}}>
        <MapView />
        <div style={{display:'flex', flexDirection:'column', gap:12}}>
          <FireWarningCard level={fire?.warning_level || 'IV'} risk={fire?.risk_score ?? 82} confidence={fire?.confidence ?? 91} temp={fire?.elevation ? 35 : 35} />
          <FireIntelligencePanel official={official} ai={fire} discrepancy={!!(fire && official && fire.warning_level!==official.level)} />
        </div>
      </div>
      <div className="grid">
        <div className="card"><b>Risk Score 87 CRITICAL</b> — Fire risk elevated, vegetation dryness + satellite anomaly. <br/><small>Sources: Sentinel-2 · Weather · Verified reports · Confidence 89% <a>View Evidence</a></small></div>
        <div className="card">Forecast + AI Recommendations — Early warning 72h</div>
      </div>
      <style>{`.tabs{display:flex; gap:8px} .tabs span{padding:6px 10px; border-radius:999px; background:#F1F5F3; font-size:13px} .tabs .active{background:#0B1412; color:#fff} .grid{display:grid; grid-template-columns:1fr 1fr; gap:14px} .card{background:#fff; border:1px solid #E2E8E5; border-radius:12px; padding:16px}`}</style>
    </div>
  )
}
