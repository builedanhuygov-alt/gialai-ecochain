import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

export default function MapView({ onSelect }: { onSelect?: (type:string, id:string)=>void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [layers, setLayers] = useState({ forest:true, fire:true, flood:false, carbon:false, agriculture:false, logistics:false, incidents:true })
  const [styleUrl, setStyleUrl] = useState(()=> localStorage.getItem('ecogl_map_style') || '')
  const [apiKey, setApiKey] = useState(()=> localStorage.getItem('ecogl_map_key') || '')
  const [useSatellite, setUseSatellite] = useState(false)

  const resolvedStyle = (()=> {
    if(styleUrl.trim()) return styleUrl.trim()
    if(apiKey.trim()) return `https://api.maptiler.com/maps/streets/style.json?key=${apiKey.trim()}`
    if(useSatellite) return 'https://demotiles.maplibre.org/style.json' // giữ OSM làm mặc định, chưa có vệ tinh thực
    return 'https://demotiles.maplibre.org/style.json'
  })()

  useEffect(()=>{
    if(!ref.current) return
    const map = new (maplibregl as any).Map({
      container: ref.current,
      style: resolvedStyle,
      center: [108.35, 13.9],
      zoom: 9,
    })
    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    // mock polygons
    map.on('load', ()=>{
      // Gia Lai mock forest polygon
      map.addSource('forest', { type:'geojson', data:{ type:'FeatureCollection', features:[{ type:'Feature', properties:{ risk:'HIGH' }, geometry:{ type:'Polygon', coordinates:[[[108.1,13.7],[108.5,13.7],[108.5,14.1],[108.1,14.1],[108.1,13.7]]] } }] } })
      map.addLayer({ id:'forest-fill', type:'fill', source:'forest', paint:{ 'fill-color':'#F59E0B', 'fill-opacity': 0.25 } })
      map.addLayer({ id:'forest-line', type:'line', source:'forest', paint:{ 'line-color':'#D97706', 'line-width':2 } })
      map.on('click','forest-fill', ()=> onSelect?.('forest','polygon-1'))
    })
    return ()=> map.remove()
  }, [])

  const saveMapConfig = ()=>{
    localStorage.setItem('ecogl_map_style', styleUrl)
    localStorage.setItem('ecogl_map_key', apiKey)
    location.reload()
  }

  return (
    <div className="map-card">
      <div className="map-head">
        <div>
          <div className="map-title">BẢN ĐỒ ECO TRỰC TIẾP</div>
          <div className="map-sub">Gia Lai · Rừng + Rủi ro + Sự cố {!styleUrl && !apiKey ? '· Đang dùng nền OSM miễn phí (chưa có vệ tinh)' : ''}</div>
        </div>
        <div className="legend">
          <span><i style={{background:'#10B981'}}/> Thấp</span>
          <span><i style={{background:'#F59E0B'}}/> Cao</span>
          <span><i style={{background:'#DC2626'}}/> Nguy kịch</span>
        </div>
      </div>

      <div className="map-api-bar">
        <input placeholder="Nhập API bản đồ (MapTiler/Mapbox key hoặc URL style JSON) — để trống dùng OSM miễn phí" value={apiKey || styleUrl} onChange={e=> { const v=e.target.value; if(v.startsWith('http')) setStyleUrl(v); else setApiKey(v) }} />
        <button onClick={saveMapConfig}>Lưu & Tải lại</button>
        <label className="sat-toggle"><input type="checkbox" checked={useSatellite} onChange={e=> setUseSatellite(e.target.checked)} /> Thử vệ tinh (demo)</label>
        <span className="hint">Chưa có ảnh vệ tinh thực — nhập key để bật vệ tinh MapTiler/Sentinel khi có.</span>
      </div>

      <div className="map-wrap">
        <div ref={ref} style={{ width:'100%', height:'380px', borderRadius:12 }} />
        <div className="layer-control">
          {Object.entries(layers).map(([k,v])=>(
            <label key={k}><input type="checkbox" checked={v} onChange={e=> setLayers(s=> ({...s,[k]:e.target.checked}))}/> {k}</label>
          ))}
        </div>
      </div>

      <style>{`
        .map-card{ background:#fff; border:1px solid #E2E8E5; border-radius:16px; overflow:hidden; }
        .map-head{ display:flex; justify-content:space-between; padding:14px 16px; border-bottom:1px solid #E2E8E5; }
        .map-title{ font-weight:800; letter-spacing:0.6px; font-size:12px; }
        .map-sub{ font-size:12px; color:#64748B; }
        .legend{ display:flex; gap:10px; font-size:12px; align-items:center; }
        .legend i{ width:10px; height:10px; border-radius:999px; display:inline-block; }
        .map-api-bar{ display:flex; gap:8px; padding:10px 16px; border-bottom:1px solid #E2E8E5; background:#F8FAF9; flex-wrap:wrap; align-items:center; }
        .map-api-bar input{ flex:1; min-width:260px; padding:8px 10px; border:1px solid #E2E8E5; border-radius:10px; font-size:12px; }
        .map-api-bar button{ background:#0F766E; color:#fff; border:0; padding:8px 12px; border-radius:999px; font-size:12px; font-weight:600; }
        .sat-toggle{ font-size:12px; display:flex; gap:6px; align-items:center; }
        .hint{ font-size:11px; color:#64748B; }
        .map-wrap{ position:relative; padding:12px; }
        .layer-control{ position:absolute; top:20px; left:20px; background:#fff; border:1px solid #E2E8E5; border-radius:12px; padding:10px; display:flex; flex-direction:column; gap:6px; font-size:12px; box-shadow:0 4px 12px rgba(0,0,0,0.08); }
      `}</style>
    </div>
  )
}
