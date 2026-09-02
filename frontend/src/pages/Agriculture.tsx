import MapView from '../components/MapView'
export default function Agriculture(){
  return (
    <div className="page">
      <h1>Agriculture AI — Coffee Health 68% Healthy · 24% Moderate · 8% Stressed</h1>
      <div className="grid"><div className="card">Crop Health · Production · Weather · Harvest</div><div className="card">Farm polygons — Gia Lai coffee zones</div></div>
      <MapView />
      <style>{`.grid{display:grid; grid-template-columns:1fr 1fr; gap:14px} .card{background:#fff; border:1px solid #E2E8E5; border-radius:12px; padding:16px}`}</style>
    </div>
  )
}
