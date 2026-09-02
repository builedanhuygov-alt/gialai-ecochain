import MapView from '../components/MapView'
export default function MapPage(){
  return (
    <div className="page">
      <h1>Live Eco Map</h1>
      <MapView onSelect={(t)=> console.log(t)} />
      <div className="legend-card">Risk Legend: <span>● Low</span> <span>● Moderate</span> <span>● High</span> <span>● Critical</span></div>
      <style>{`.legend-card{background:#fff; border:1px solid #E2E8E5; border-radius:12px; padding:12px; display:flex; gap:12px; font-size:12px}`}</style>
    </div>
  )
}
