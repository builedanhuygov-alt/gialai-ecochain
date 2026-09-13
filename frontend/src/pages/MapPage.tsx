import MapView from '../components/MapView'
export default function MapPage(){
  return (
    <div className="page">
      <h1>Live Eco Map</h1>
      <MapView onSelect={(t)=> console.log(t)} />
      {/* RC: legend duy nhất nằm trong MapView (single-source). Không legend thứ hai. */}

    </div>
  )
}
