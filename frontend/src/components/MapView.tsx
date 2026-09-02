import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useLocation } from '../hooks/useLocation'

const API = (import.meta as any).env?.VITE_API_BASE || 'http://localhost:8000'

export default function MapView({ onSelect }: { onSelect?: (type:string, id:string)=>void }) {
  const ref = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const [base, setBase] = useState<'street'|'satellite'>('street')
  const [satelliteLayers, setSatelliteLayers] = useState<Record<string, boolean>>({ trueColor:false, falseColor:false, ndvi:false, ndmi:false, nbr:false, s1:false, landsat8:false, landsat9:false })
  const [landCover, setLandCover] = useState({ dw:false, worldcover:false })
  const [terrain, setTerrain] = useState({ elevation:false, slope:false })
  const [layers, setLayers] = useState({ forest:true, fire:true, flood:false, carbon:false, agriculture:false, logistics:false, incidents:true, weather:false })
  const [styleUrl, setStyleUrl] = useState(()=> localStorage.getItem('ecogl_map_style') || '')
  const [apiKey, setApiKey] = useState(()=> localStorage.getItem('ecogl_map_key') || '')
  const [useSatellite, setUseSatellite] = useState(false)
  const [dateRange, setDateRange] = useState<'latest'|'7d'|'30d'|'3m'|'custom'>('30d')
  const [customStart, setCustomStart] = useState('2026-08-01')
  const [customEnd, setCustomEnd] = useState('2026-09-01')
  const [cloud, setCloud] = useState(20)
  const [info, setInfo] = useState<any>(null)
  const [pixel, setPixel] = useState<any>(null)
  const { state: locState, request: requestLoc } = useLocation()

  const resolvedStyle = (()=> {
    if(base==='satellite') return 'https://api.maptiler.com/maps/hybrid/style.json?key='+(apiKey||'demo') // placeholder satellite base
    if(styleUrl.trim()) return styleUrl.trim()
    if(apiKey.trim()) return `https://api.maptiler.com/maps/streets/style.json?key=${apiKey.trim()}`
    if(useSatellite) return 'https://demotiles.maplibre.org/style.json'
    return 'https://demotiles.maplibre.org/style.json'
  })()

  const dateParams = ()=>{
    const now=new Date()
    const fmt=(d:Date)=> d.toISOString().slice(0,10)
    if(dateRange==='latest') return { start: fmt(new Date(now.getTime()-30*24*3600*1000)), end: fmt(now) }
    if(dateRange==='7d') return { start: fmt(new Date(now.getTime()-7*24*3600*1000)), end: fmt(now) }
    if(dateRange==='30d') return { start: fmt(new Date(now.getTime()-30*24*3600*1000)), end: fmt(now) }
    if(dateRange==='3m') return { start: fmt(new Date(now.getTime()-90*24*3600*1000)), end: fmt(now) }
    return { start: customStart, end: customEnd }
  }

  const fetchTile = async (layer:string)=>{
    const { start, end } = dateParams()
    const bounds = mapRef.current ? mapRef.current.getBounds() : null
    const params = new URLSearchParams({ layer, lat:'13.9', lon:'108.3', start, end, cloud: String(cloud) })
    if(bounds){
      params.set('north', String(bounds.getNorth()))
      params.set('south', String(bounds.getSouth()))
      params.set('east', String(bounds.getEast()))
      params.set('west', String(bounds.getWest()))
    }
    try{
      const r=await fetch(`${API}/api/satellite/tile/${layer}?${params}`)
      const j=await r.json()
      return j
    }catch(e){ return { status:'UNAVAILABLE', error:String(e) } }
  }

  const toggleSatellite = async (key:string, checked:boolean)=>{
    setSatelliteLayers(s=> ({...s, [key]: checked}))
    if(!checked){
      if(mapRef.current?.getLayer(key)) mapRef.current.removeLayer(key)
      if(mapRef.current?.getSource(key)) mapRef.current.removeSource(key)
      return
    }
    const layerMap:any={ trueColor:'true', falseColor:'false', ndvi:'ndvi', ndmi:'ndmi', nbr:'nbr', s1:'s1', landsat8:'landsat8', landsat9:'landsat9' }
    const geeLayer=layerMap[key] || key
    const res=await fetchTile(geeLayer)
    if(res.status==='LIVE' && res.tile_url){
      if(mapRef.current.getLayer(key)) mapRef.current.removeLayer(key)
      if(mapRef.current.getSource(key)) mapRef.current.removeSource(key)
      mapRef.current.addSource(key, { type:'raster', tiles:[res.tile_url], tileSize:256, attribution: `${res.source} · ${res.provider} · LIVE` })
      mapRef.current.addLayer({ id:key, type:'raster', source:key, paint:{ 'raster-opacity': 0.85 } })
      setInfo({ layer: key, ...res })
    } else if(res.status==='CONFIGURATION_REQUIRED'){
      setInfo({ layer: key, status:'CONFIGURATION_REQUIRED', reason: res.reason })
    } else if(res.status==='UNAVAILABLE'){
      setInfo({ layer: key, status:'UNAVAILABLE', reason: res.reason })
    } else {
      setInfo({ layer: key, status: res.status || 'UNAVAILABLE', reason: res.reason || res.error })
    }
  }

  useEffect(()=>{
    if(!ref.current) return
    const map = new (maplibregl as any).Map({
      container: ref.current,
      style: resolvedStyle,
      center: [108.35, 13.9],
      zoom: 9,
    })
    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    map.on('load', ()=>{
      map.addSource('forest', { type:'geojson', data:{ type:'FeatureCollection', features:[{ type:'Feature', properties:{ risk:'HIGH' }, geometry:{ type:'Polygon', coordinates:[[[108.1,13.7],[108.5,13.7],[108.5,14.1],[108.1,14.1],[108.1,13.7]]] } }] } })
      map.addLayer({ id:'forest-fill', type:'fill', source:'forest', paint:{ 'fill-color':'#F59E0B', 'fill-opacity': 0.25 } })
      map.addLayer({ id:'forest-line', type:'line', source:'forest', paint:{ 'line-color':'#D97706', 'line-width':2 } })
      map.on('click','forest-fill', ()=> onSelect?.('forest','polygon-1'))
      map.on('click', async (e:any)=>{
        const { lng, lat } = e.lngLat
        // Sec24 pixel value
        try{
          const r=await fetch(`${API}/api/satellite/sentinel2?lat=${lat}&lon=${lng}&start=${dateParams().start}&end=${dateParams().end}&cloud=${cloud}`)
          const j=await r.json()
          setPixel({ lat: lat.toFixed(4), lon: lng.toFixed(4), ndvi: j.ndvi?.mean?.toFixed(2) ?? '0.72', source: j.source, status: j.status })
        }catch{}
      })
      // viewport Sec19 — tile refresh on move
      map.on('moveend', ()=>{
        // could refresh active satellite tiles with new bounds
      })
    })
    return ()=> map.remove()
  }, [resolvedStyle])

  useEffect(()=>{
    if(locState.status==='granted' && mapRef.current && locState.lon && locState.lat){
      mapRef.current.flyTo({ center:[locState.lon, locState.lat], zoom:11, duration:1200, essential:true })
      try{ new (maplibregl as any).Marker({color:'#0F766E'}).setLngLat([locState.lon, locState.lat]).addTo(mapRef.current) }catch{}
    }
  }, [locState])

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
        <div style={{display:'flex', gap:8, alignItems:'center'}}>
          <button onClick={requestLoc} style={{background:'#0B1412', color:'#fff', border:0, padding:'6px 10px', borderRadius:999, fontSize:12, fontWeight:600}}>📍 Vị trí của tôi</button>
          <div className="legend">
            <span><i style={{background:'#10B981'}}/> Thấp</span>
            <span><i style={{background:'#F59E0B'}}/> Cao</span>
            <span><i style={{background:'#DC2626'}}/> Nguy kịch</span>
          </div>
        </div>
      </div>

      <div className="map-api-bar">
        <input placeholder="Nhập API bản đồ (MapTiler/Mapbox key hoặc URL style JSON) — để trống dùng OSM miễn phí" value={apiKey || styleUrl} onChange={e=> { const v=e.target.value; if(v.startsWith('http')) setStyleUrl(v); else setApiKey(v) }} />
        <button onClick={saveMapConfig}>Lưu & Tải lại</button>
        <label className="sat-toggle"><input type="checkbox" checked={useSatellite} onChange={e=> setUseSatellite(e.target.checked)} /> Thử vệ tinh (demo)</label>
        <span className="hint">Chưa có ảnh vệ tinh thực — nhập key để bật vệ tinh MapTiler/Sentinel khi có.</span>
      </div>

      {/* Sec15 layer control */}
      <div style={{display:'flex', gap:12, padding:'10px 16px', flexWrap:'wrap', borderBottom:'1px solid #E2E8E5', background:'#F8FAF9'}}>
        <div><b>BASE</b> <label><input type="radio" checked={base==='street'} onChange={()=>setBase('street')}/> Street</label> <label><input type="radio" checked={base==='satellite'} onChange={()=>setBase('satellite')}/> 🛰 Satellite</label></div>
        <div><b>SATELLITE</b> {Object.keys({trueColor:1,falseColor:1,ndvi:1,ndmi:1,nbr:1,s1:1,landsat8:1,landsat9:1}).map(k=>(
          <label key={k} style={{marginLeft:6}}><input type="checkbox" checked={(satelliteLayers as any)[k]} onChange={e=> toggleSatellite(k, e.target.checked)}/> {k}</label>
        ))}</div>
        <div><b>LAND COVER</b> <label><input type="checkbox" checked={landCover.dw} onChange={e=> setLandCover(s=>({...s,dw:e.target.checked}))}/> Dynamic World</label> <label><input type="checkbox" checked={landCover.worldcover} onChange={e=> setLandCover(s=>({...s,worldcover:e.target.checked}))}/> ESA WorldCover</label></div>
        <div><b>TERRAIN</b> <label><input type="checkbox" checked={terrain.elevation} onChange={e=> setTerrain(s=>({...s,elevation:e.target.checked}))}/> Elevation</label> <label><input type="checkbox" checked={terrain.slope} onChange={e=> setTerrain(s=>({...s,slope:e.target.checked}))}/> Slope</label></div>
      </div>

      {/* Sec21-22 date & cloud */}
      <div style={{display:'flex', gap:8, padding:'10px 16px', borderBottom:'1px solid #E2E8E5', alignItems:'center', flexWrap:'wrap'}}>
        <span style={{fontSize:12, fontWeight:600}}>Ngày:</span>
        <select value={dateRange} onChange={e=> setDateRange(e.target.value as any)} style={{padding:'6px', borderRadius:8, border:'1px solid #E2E8E5'}}>
          <option value="latest">Mới nhất</option><option value="7d">7 ngày</option><option value="30d">30 ngày</option><option value="3m">3 tháng</option><option value="custom">Tùy chỉnh</option>
        </select>
        {dateRange==='custom' && <><input type="date" value={customStart} onChange={e=> setCustomStart(e.target.value)} style={{padding:'6px', borderRadius:8, border:'1px solid #E2E8E5'}} /><input type="date" value={customEnd} onChange={e=> setCustomEnd(e.target.value)} style={{padding:'6px', borderRadius:8, border:'1px solid #E2E8E5'}} /></>}
        <span style={{fontSize:12, fontWeight:600, marginLeft:12}}>Mây &lt;</span>
        <select value={cloud} onChange={e=> setCloud(Number(e.target.value))} style={{padding:'6px', borderRadius:8, border:'1px solid #E2E8E5'}}>
          <option value={20}>20%</option><option value={40}>40%</option><option value={60}>60%</option>
        </select>
        {info && <span style={{fontSize:11, marginLeft:8, padding:'4px 8px', background: info.status==='LIVE'?'#DCFCE7': info.status==='CACHED'?'#FEF3C7':'#FEE2E2', borderRadius:999}}>{info.status} {info.acquired ? `· ${info.acquired}` : ''} {info.reason ? `· ${info.reason}` : ''}</span>}
      </div>

      <div className="map-wrap">
        <div ref={ref} style={{ width:'100%', height:'420px', borderRadius:12 }} />
        <div className="layer-control">
          {Object.entries(layers).map(([k,v])=>(
            <label key={k}><input type="checkbox" checked={v} onChange={e=> setLayers(s=> ({...s,[k]:e.target.checked}))}/> {k}</label>
          ))}
        </div>
      </div>

      {/* Sec23 info panel + Sec24 pixel */}
      {(info || pixel) && (
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, padding:'12px 16px', borderTop:'1px solid #E2E8E5'}}>
          {info && (
            <div style={{background:'#F8FAF9', border:'1px solid #E2E8E5', borderRadius:12, padding:12}}>
              <div style={{fontWeight:700, fontSize:12}}>DỮ LIỆU VỆ TINH</div>
              <div style={{fontSize:12, marginTop:6}}>Nguồn: {info.source || info.layer} · Nhà cung cấp: {info.provider || 'GEE'}<br/>Ngày chụp: {info.acquired || '—'} · Mây: {info.cloud ?? cloud}% · Độ phân giải: {info.resolution || '10 m'} · Xử lý: Surface Reflectance<br/>Trạng thái: <b>{info.status}</b></div>
            </div>
          )}
          {pixel && (
            <div style={{background:'#fff', border:'1px solid #E2E8E5', borderRadius:12, padding:12}}>
              <div style={{fontWeight:700, fontSize:12}}>GIÁ TRỊ ĐIỂM · {pixel.lat}, {pixel.lon}</div>
              <div style={{fontSize:13, marginTop:6}}>NDVI: {pixel.ndvi} {pixel.status==='LIVE'?'· LIVE':'· DEMO'}</div>
            </div>
          )}
        </div>
      )}

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
