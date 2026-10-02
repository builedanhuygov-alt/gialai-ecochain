import MapView from '../components/MapView'
export default function EcoMap(){
  return (
    <div style={{margin:-24, height:'calc(100vh - 64px)', position:'relative'}}>
      <MapView />
    </div>
  )
}
