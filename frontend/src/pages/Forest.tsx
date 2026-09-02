import MapView from '../components/MapView'
import { Tabs } from '../components/Tabs'
export default function Forest(){
  return (
    <div className="page">
      <h1>Trí tuệ Rừng</h1>
      <Tabs tabs={['Tổng quan','Sức khỏe','Bất thường']} />
      <div className="kpis"><div>Diện tích 12,430 ha</div><div>Sức khỏe 78.4</div><div>Bất thường 3</div></div>
      <MapView />
      <div className="grid">
        <div className="card">NDVI Trend — Healthy vs Change (GEE Sentinel-2 ● Connected, 14:32)</div>
        <div className="card">AI Detections — 🔥 High fire risk · 2 community confirmations · 87% confidence <button>Review</button></div>
      </div>
      <style>{`.page{display:flex; flex-direction:column; gap:16px} .kpis{display:flex; gap:12px} .kpis div{background:#fff; border:1px solid #E2E8E5; border-radius:12px; padding:12px; flex:1} .grid{display:grid; grid-template-columns:1fr 1fr; gap:14px} .card{background:#fff; border:1px solid #E2E8E5; border-radius:12px; padding:16px} h1{font-size:18px; font-weight:800}`}</style>
    </div>
  )
}
