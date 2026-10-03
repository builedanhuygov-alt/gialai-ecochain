import { useEffect, useState } from 'react'
import MapView from '../components/MapView'
import { API_BASE } from '../services/api'
import { C, DarkPage, ModeBadge, Panel } from '../components/trungtam/Dark'

export default function BanDo3D(){
  const [dem, setDem] = useState<string | null>(null)
  useEffect(()=>{
    fetch(`${API_BASE}/api/health/geospatial`).then(r=> r.ok ? r.json() : null).then(j=> {
      setDem(j?.dem ?? j?.terrain ?? null)
    }).catch(()=> {})
  },[])
  return (
    <DarkPage>
      <header style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, letterSpacing: 1.2, color: C.muted }}>GIALAI ECOCHAIN · BẢN ĐỒ 3D</div>
        <h1 style={{ margin: '2px 0 0', fontSize: 22 }}>Địa hình số Gia Lai</h1>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
          Địa hình dựng từ lát cắt độ cao ngoài (Terrarium). Dùng để xem dốc, thung lũng, hướng lan lửa —
          không thay số liệu nguy cơ. Bật “3D địa hình” trong bảng lớp phủ, kéo chuột phải để nghiêng.
        </div>
        <div style={{ marginTop: 8 }}>
          <ModeBadge origin={dem === null ? 'LIVE' : 'DEMO / SIMULATED'} />
        </div>
      </header>
      <Panel title="KHÔNG GIAN 3D">
        <div style={{ height: 560, borderRadius: 10, overflow: 'hidden' }}>
          <MapView fill start3d />
        </div>
      </Panel>
    </DarkPage>
  )
}
