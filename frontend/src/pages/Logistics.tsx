import MapView from '../components/MapView'
export default function Logistics(){
  return (
    <div className="page">
      <h1>Green Logistics — Route Optimizer</h1>
      <div className="modes"><span>Fastest</span><span>Lowest CO₂</span><span>Lowest Risk</span><span className="active">Balanced</span></div>
      <MapView />
      <div className="compare"><div>Route A: 82km 2h10 31kg CO₂ LOW</div><div>Route B: 91km 2h00 24kg CO₂ LOW — Greenest</div></div>
      <style>{`.modes{display:flex; gap:8px} .modes span{padding:6px 10px; background:#F1F5F3; border-radius:999px; font-size:13px} .modes .active{background:#0B1412; color:#fff} .compare{display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-top:12px} .compare div{background:#fff; border:1px solid #E2E8E5; border-radius:12px; padding:16px}`}</style>
    </div>
  )
}
