import MapView from '../components/MapView'
import { Tabs } from '../components/Tabs'
export default function Disaster(){
  return (
    <div className="page">
      <h1>AI Thiên tai</h1>
      <Tabs tabs={['Cháy','Ngập','Hạn','Bão','Sạt lở']} defaultTab="Cháy" />
      <div style={{height:12}} />
      <MapView />
      <div className="grid">
        <div className="card"><b>Risk Score 87 CRITICAL</b> — Fire risk elevated, vegetation dryness + satellite anomaly. <br/><small>Sources: Sentinel-2 · Weather · Verified reports · Confidence 89% <a>View Evidence</a></small></div>
        <div className="card">Forecast + AI Recommendations — Early warning 72h</div>
      </div>
      <style>{`.tabs{display:flex; gap:8px} .tabs span{padding:6px 10px; border-radius:999px; background:#F1F5F3; font-size:13px} .tabs .active{background:#0B1412; color:#fff} .grid{display:grid; grid-template-columns:1fr 1fr; gap:14px} .card{background:#fff; border:1px solid #E2E8E5; border-radius:12px; padding:16px}`}</style>
    </div>
  )
}
