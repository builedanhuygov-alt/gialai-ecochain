import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
// ⚠️ BẮT BUỘC 1: Import CSS của MapLibre (Nếu thiếu map sẽ trắng/vỡ)
import 'maplibre-gl/dist/maplibre-gl.css'
import { useLocation } from '../hooks/useLocation'

const API = ((import.meta as any).env?.VITE_API_BASE || 'http://localhost:8000').replace(/[\r\n]/g, "").trim().replace(/\/$/, "")
const TILE_FIX = (url: string) => url.replace(/[\r\n]/g, "").trim()

// 6 điểm phủ toàn tỉnh Gia Lai mới (Tây Nguyên + Bình Định cũ)
const STATIONS = [
  { id:1, name:'Trạm Kiểm lâm Ia Mơr - Huyện Chư Prông', coords:[107.65, 13.55] as [number,number], level:'V', score:88, type:'Cảnh báo Khẩn cấp', temp:34, humidity:28, wind:18 },
  { id:2, name:'Trạm Bảo tồn VQG Kon Ka Kinh', coords:[108.45, 14.25] as [number,number], level:'II', score:32, type:'An toàn', temp:26, humidity:65, wind:8 },
  { id:3, name:'Trạm Đèo An Khê (TX. An Khê - gió phơn)', coords:[108.65, 13.98] as [number,number], level:'V', score:91, type:'Điểm nóng', temp:36, humidity:22, wind:24 },
  { id:4, name:'Trạm Vĩnh Thạnh - Huyện Vĩnh Thạnh', coords:[108.90, 14.25] as [number,number], level:'IV', score:78, type:'Cảnh báo', temp:33, humidity:30, wind:16 },
  { id:5, name:'Trạm Phù Cát / Quy Nhơn - Ven biển', coords:[109.10, 13.90] as [number,number], level:'III', score:45, type:'Giám sát', temp:29, humidity:55, wind:10 },
  { id:6, name:'Trạm Xã Hội Sơn', coords:[108.68, 13.92] as [number,number], level:'I', score:15, type:'An toàn / Đã dập tắt', temp:27, humidity:70, wind:6 },
]

export default function MapView({ onSelect }: { onSelect?: (type:string, id:string)=>void }) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  void onSelect
  const [base] = useState<'streets'|'satellite'>('streets')
  // Mặc định Google Satellite để tránh CARTO Positron trắng do CORS/style GL
  const [baseXyz, setBaseXyz] = useState<string>('google_s')
  const [activeSat, setActiveSat] = useState<Record<string, boolean>>({})
  const [dateRange, setDateRange] = useState<'latest'|'7d'|'30d'|'3m'|'custom'>('30d')
  const [cloud, setCloud] = useState(20)
  const [info, setInfo] = useState<any>(null)
  const [pixel] = useState<any>(null)
  void pixel
  const [liveStatus, setLiveStatus] = useState<'LIVE'|'CACHED'|'STALE'|'CONFIGURATION_REQUIRED'|'UNAVAILABLE'|'DEMO'>('LIVE')
  const [now, setNow] = useState(new Date())
  const [tickerIdx, setTickerIdx] = useState(0)
  const { state: locState, request: requestLoc } = useLocation()

  const tickerLines = [
    "15:02:10 - Trạm An Khê vừa gửi chỉ số Độ ẩm: 32% (Cảnh báo gió phơn)",
    "15:01:45 - Vệ tinh Sentinel cập nhật ảnh quét vùng rừng Ia Mơr",
    "15:00:12 - Hệ thống hoàn tất kiểm tra 135 xã/phường tỉnh Gia Lai",
  ]

  useEffect(()=>{
    const id=setInterval(()=> setNow(new Date()), 1000)
    return ()=> clearInterval(id)
  },[])
  useEffect(()=>{
    const id=setInterval(()=> setTickerIdx(i=> (i+1)%tickerLines.length), 3500)
    return ()=> clearInterval(id)
  },[])
  const [jitter, setJitter]= useState({temp:0, hum:0, wind:0})
  useEffect(()=>{
    const id=setInterval(()=> setJitter({temp: (Math.random()-0.5)*0.4, hum: (Math.random()-0.5)*2, wind: (Math.random()-0.5)*0.6}), 7000)
    return ()=> clearInterval(id)
  },[])

  const dateParams = ()=>{
    const d=new Date()
    const fmt=(x:Date)=> x.toISOString().slice(0,10)
    if(dateRange==='latest') return { start: fmt(new Date(d.getTime()-30*24*3600*1000)), end: fmt(d) }
    if(dateRange==='7d') return { start: fmt(new Date(d.getTime()-7*24*3600*1000)), end: fmt(d) }
    if(dateRange==='30d') return { start: fmt(new Date(d.getTime()-30*24*3600*1000)), end: fmt(d) }
    if(dateRange==='3m') return { start: fmt(new Date(d.getTime()-90*24*3600*1000)), end: fmt(d) }
    return { start:'2026-08-01', end:'2026-09-01' }
  }

  // XYZ Tile URLs — dán trực tiếp vào MapLibre/Leaflet/OpenLayers (không cần API Key) — strip \r\n
  const XYZ_TILES: Record<string, { url: string, attribution: string }> = {
    esri: { url: TILE_FIX('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'), attribution: '© Esri World Imagery' },
    google_s: { url: TILE_FIX('https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}'), attribution: '© Google Satellite' },
    google_y: { url: TILE_FIX('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}'), attribution: '© Google Hybrid' },
    eox: { url: TILE_FIX('https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg'), attribution: '© EOX Sentinel-2 cloudless' },
  }
  // ⚠️ BẮT BUỘC 2: Dùng Style miễn phí KHÔNG CẦN API KEY của CARTO/OSM
  const baseStyles: Record<string, string> = {
    streets: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
    satellite: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
    terrain: 'https://demotiles.maplibre.org/style.json',
  }
  void baseStyles

  const fetchTile = async (layer:string)=>{
    const { start, end } = dateParams()
    const bounds = mapRef.current ? mapRef.current.getBounds() : null
    const params = new URLSearchParams({ layer, lat:'13.85', lon:'108.50', start, end, cloud: String(cloud) })
    if(bounds){
      params.set('north', String(bounds.getNorth())); params.set('south', String(bounds.getSouth()))
      params.set('east', String(bounds.getEast())); params.set('west', String(bounds.getWest()))
    }
    try{
      const r=await fetch(TILE_FIX(`${API}/api/satellite/tile/${layer}?${params}`))
      if(!r.ok) throw new Error('GEE Service chưa sẵn sàng')
      const j=await r.json()
      if(j.tile_url) j.tile_url = TILE_FIX(j.tile_url)
      return j
    }catch(e){
      console.warn(`Lớp ${layer} chưa khả dụng (Chế độ Fallback BaseMap):`, e)
      return { status:'UNAVAILABLE', error:String(e) }
    }
  }

  // 🛡️ Fallback chống sập khi Backend GEE trả về CONFIGURATION_REQUIRED — strip \r\n
  const addGEETileLayer = async (layerId: string, tileType: string) => {
    const map = mapRef.current
    if (!map) return
    try {
      const res = await fetch(TILE_FIX(`${API}/api/satellite/tile/${tileType}?layer=${tileType}&lat=13.85&lon=108.5&start=2026-08-10&end=2026-09-03&cloud=20`))
      if (!res.ok) throw new Error('GEE Service chưa sẵn sàng')
      const data = await res.json()
      if (data.tile_url) {
        const url = TILE_FIX(data.tile_url)
        if (map.getSource(layerId)) {
          (map.getSource(layerId) as maplibregl.RasterTileSource).setTiles([url])
        } else {
          map.addSource(layerId, { type:'raster', tiles:[url], tileSize:256 })
          map.addLayer({ id:layerId, type:'raster', source:layerId, paint:{ 'raster-opacity': 0.8 } })
        }
      }
    } catch (err) {
      console.warn(`Lớp ${tileType} chưa khả dụng (Chế độ Fallback BaseMap):`, err)
    }
  }
  void addGEETileLayer

  const switchBaseXyz = (id: string)=>{
    setBaseXyz(id)
    const map = mapRef.current
    if(!map) return
    if(map.getLayer('base-xyz')) try{ map.removeLayer('base-xyz')}catch{}
    if(map.getSource('base-xyz')) try{ map.removeSource('base-xyz')}catch{}
    if(id==='carto') return
    const tile = XYZ_TILES[id]
    if(!tile) return
    map.addSource('base-xyz', { type:'raster', tiles:[TILE_FIX(tile.url)], tileSize:256, attribution: tile.attribution } as any)
    map.addLayer({ id:'base-xyz', type:'raster', source:'base-xyz', paint:{ 'raster-opacity': 1 } } as any, 'boundary')
  }

  const hotspotMarkers = useRef<any[]>([])
  const toggleSat = async (key:string, geeLayer:string)=>{
    const checked = !activeSat[key]
    setActiveSat(s=> ({...s, [key]: checked}))
    if(!checked){
      if(key==='hotspot'){
        hotspotMarkers.current.forEach((m:any)=>{ try{ m.remove() }catch{} }); hotspotMarkers.current=[]
        setInfo(null)
        return
      }
      if(mapRef.current?.getLayer(key)) try{ mapRef.current.removeLayer(key) }catch{}
      if(mapRef.current?.getSource(key)) try{ mapRef.current.removeSource(key) }catch{}
      return
    }
    // Hotspot: FIRMS API (không qua GEE tile) — strip \r\n
    if(key==='hotspot'){
      try{
        const r=await fetch(TILE_FIX(`${API}/api/v1/hotspots/live`))
        const data=await r.json()
        if(data.status==='LIVE' || data.status==='DEMO'){
          const fires = data.fires || data.hotspots || []
          fires.slice(0,20).forEach((f:any)=>{
            const el=document.createElement('div')
            el.style.width='14px'; el.style.height='14px'; el.style.borderRadius='999px'; el.style.background='#DC2626'; el.style.border='2px solid #fff'; el.style.boxShadow='0 0 8px rgba(220,38,38,0.8)'
            const m=new (maplibregl as any).Marker({ element: el }).setLngLat([f.longitude || f.lon || 108.3, f.latitude || f.lat || 13.9] as any).addTo(mapRef.current)
            hotspotMarkers.current.push(m)
          })
          setLiveStatus(data.status as any); setInfo({ layer:'hotspot', status: data.status, source:'NASA FIRMS', satellite: data.satellite || 'VIIRS', acquired: fires[0]?.acq_date || new Date().toISOString().slice(0,10), count: fires.length, bbox: data.bbox })
        } else {
          console.warn('FIRMS chưa khả dụng:', data.reason || data.error)
          setInfo({ layer:'hotspot', status: data.status || 'UNAVAILABLE', source:'NASA FIRMS', reason: data.reason || data.error })
        }
      }catch(err){
        console.warn('FIRMS hotspot lỗi:', err)
        setInfo({ layer:'hotspot', status:'UNAVAILABLE', source:'NASA FIRMS', reason:String(err) })
      }
      return
    }
    try{
      const res=await fetchTile(geeLayer)
      if(res.status==='LIVE' && res.tile_url && mapRef.current){
        if(mapRef.current?.getLayer(key)) try{ mapRef.current.removeLayer(key) }catch{}
        if(mapRef.current?.getSource(key)) try{ mapRef.current.removeSource(key) }catch{}
        mapRef.current.addSource(key, { type:'raster', tiles:[res.tile_url], tileSize:256 })
        mapRef.current.addLayer({ id:key, type:'raster', source:key, paint:{ 'raster-opacity': 0.85 } } as any)
        setLiveStatus('LIVE'); setInfo({ layer: key, source: res.source || 'Sentinel-2', ...res })
      } else {
        console.warn(`Lớp ${geeLayer} chưa khả dụng (Fallback BaseMap):`, res.reason || res.error)
        setInfo({ layer: key, status: res.status || 'UNAVAILABLE', source: res.source || 'Sentinel-2', reason: res.reason || res.error, acquired: res.acquired })
      }
    }catch(err){
      console.warn(`Lớp ${geeLayer} lỗi:`, err)
      setInfo({ layer: key, status:'UNAVAILABLE', reason:String(err) })
    }
  }

  useEffect(()=>{
    if(!mapContainer.current || mapRef.current) return
    // Mặc định Google Satellite (XYZ) để tránh CARTO trắng do CORS — fallback BaseMap
    const initStyle = baseXyz==='carto' ? 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json' : 'https://demotiles.maplibre.org/style.json'
    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: initStyle,
      center: [108.35, 13.9],
      zoom: 9.2,
      maxBounds: [[106.5, 12.5],[110.0, 15.2]],
      attributionControl: false,
    })
    // Fallback nếu style CARTO lỗi CORS → chuyển Google Satellite
    map.on('error', (e:any)=>{
      if(e?.error?.message?.includes('style') || e?.styleURL?.includes('cartocdn')){
        console.warn('CARTO style lỗi, fallback Google Satellite', e)
        if(!map.getSource('base-xyz')){
          map.addSource('base-xyz', { type:'raster', tiles:['https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}'], tileSize:256, attribution:'© Google Satellite' } as any)
          map.addLayer({ id:'base-xyz', type:'raster', source:'base-xyz' } as any)
        }
      }
    })
    mapRef.current = map as any
    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    map.fitBounds([[107.3, 13.1], [109.4, 14.7]], { padding:20, duration:0 })
    map.addControl(new (maplibregl as any).AttributionControl({ compact:true }), 'bottom-left')
    map.on('load', ()=>{
      console.log('✅ MapLibre loaded successfully!')
      map.resize()
      // Thêm nền Google Satellite mặc định nếu baseXyz != carto
      if(baseXyz!=='carto' && !map.getSource('base-xyz')){
        const tile = XYZ_TILES[baseXyz]
        if(tile){
          map.addSource('base-xyz', { type:'raster', tiles:[tile.url], tileSize:256, attribution: tile.attribution } as any)
          map.addLayer({ id:'base-xyz', type:'raster', source:'base-xyz' } as any)
        }
      }
      // Gia Lai boundary
      map.addSource('gialai-boundary', { type:'geojson', data:{ type:'Feature', geometry:{ type:'Polygon', coordinates:[[[107.3,13.1],[109.4,13.1],[109.4,14.7],[107.3,14.7],[107.3,13.1]]] }, properties:{} } })
      map.addLayer({ id:'boundary', type:'line', source:'gialai-boundary', paint:{ 'line-color':'#0F766E', 'line-width':1.5, 'line-opacity':0.5, 'line-dasharray':[4,4] } })
      STATIONS.forEach(st=>{
        const isHigh = st.level==='IV' || st.level==='V'
        const el=document.createElement('div')
        el.style.width='28px'; el.style.height='28px'; el.style.borderRadius='999px'; el.style.display='grid'; el.style.placeItems='center'
        el.style.background= st.level==='V' ? '#DC2626' : st.level==='IV' ? '#F97316' : st.level==='III' ? '#F59E0B' : st.level==='II' ? '#10B981' : '#0EA5E9'
        el.style.color='#fff'; el.style.fontWeight='800'; el.style.fontSize='11px'; el.style.border='2px solid #fff'; el.style.boxShadow='0 2px 8px rgba(0,0,0,0.25)'; el.style.cursor='pointer'
        el.textContent= st.level
        el.title=`${st.name} — CẤP ${st.level}`
        if(isHigh){
          const pulse=document.createElement('div')
          pulse.style.position='absolute'; pulse.style.inset='-6px'; pulse.style.borderRadius='999px'; pulse.style.border='2px solid #DC2626'; pulse.style.animation='ping 1.5s cubic-bezier(0,0,0.2,1) infinite'; pulse.style.pointerEvents='none'
          const wrapper=document.createElement('div'); wrapper.style.position='relative'; wrapper.appendChild(pulse); wrapper.appendChild(el)
          new (maplibregl as any).Marker({ element: wrapper }).setLngLat(st.coords as any).addTo(map)
        } else {
          new (maplibregl as any).Marker({ element: el }).setLngLat(st.coords as any).addTo(map)
        }
        el.addEventListener('click', ()=>{
          void new (maplibregl as any).Popup({ closeButton:true, maxWidth:'320px' })
            .setLngLat(st.coords as any)
            .setHTML(`<div style="font-family:Inter,sans-serif; min-width:220px"><b>${st.name}</b><br/>Cấp dự báo <b>CẤP ${st.level}</b> · Risk ${st.score}/100<br/>Nhiệt ${(st.temp + jitter.temp).toFixed(1)}°C · Ẩm ${(st.humidity + jitter.hum).toFixed(0)}% · Gió ${(st.wind + jitter.wind).toFixed(1)} km/h<br/><span style="font-size:11px; color:#64748B">Cập nhật: ${now.toLocaleTimeString('vi-VN')} · Nguồn: Sentinel-2 / FIRMS ${st.type.includes('Khẩn cấp')?'· LIVE':''}</span></div>`)
            .addTo(map)
          window.dispatchEvent(new CustomEvent('ecochain-select-area', { detail:{ area: st.name, level: st.level }}))
        })
      })
      setTimeout(()=>{
        map.flyTo({ center:[108.68, 13.92], zoom:11, duration:1200 })
        window.dispatchEvent(new CustomEvent('ecochain-demo', { detail:{ area:'Xã Hội Sơn', level:'V' }}))
        window.dispatchEvent(new CustomEvent('ecochain-select-area', { detail:{ area:'Xã Hội Sơn', level:'V' }}))
      }, 900)
    })
    return () => { map.remove(); (mapRef as any).current = null }
  }, [base, baseXyz])

  useEffect(()=>{
    if(locState.status==='granted' && mapRef.current && locState.lon && locState.lat){
      mapRef.current.flyTo({ center:[locState.lon, locState.lat], zoom:11, duration:1200 } as any)
      try{ new (maplibregl as any).Marker({color:'#0F766E'}).setLngLat([locState.lon, locState.lat]).addTo(mapRef.current) }catch{}
    }
  }, [locState])

  const [sourceLive, setSourceLive] = useState<Record<string,string>>({})
  const [health, setHealth] = useState<any>(null)
  useEffect(()=>{
    fetch(`${API}/api/health/geospatial`).then(r=>r.json()).then(j=>{
      setSourceLive({ sentinel2: j.sentinel2?.status || 'UNAVAILABLE', firms: j.firms?.status || 'UNAVAILABLE', gee: j.gee?.status || 'UNAVAILABLE' })
      setHealth(j)
      const overall = j.summary?.all_live ? 'LIVE' : (j.firms?.status==='CONFIGURATION_REQUIRED' ? 'CONFIGURATION_REQUIRED' : 'UNAVAILABLE')
      setLiveStatus(overall as any)
    }).catch(()=> setLiveStatus('UNAVAILABLE'))
  },[])

  return (
    // ⚠️ BẮT BUỘC 3: Div chứa map PHẢI CÓ height/width cố định rõ ràng (Tránh h-0)
    <div className="relative w-full h-[calc(100vh-64px)] min-h-[500px] bg-slate-900" style={{position:'relative', height:'calc(100vh - 64px)', borderRadius:16, overflow:'hidden', background:'#0f172a'}}>
      <div ref={mapContainer} className="absolute inset-0 w-full h-full" style={{ width:'100%', height:'100%' }} />

      {/* Top: search + honest LIVE status */}
      <div style={{position:'absolute', top:12, left:12, right:12, display:'flex', gap:10, alignItems:'center', flexWrap:'wrap', pointerEvents:'none'}}>
        <div style={{background:'rgba(255,255,255,0.96)', backdropFilter:'blur(12px)', borderRadius:999, padding:'8px 14px', display:'flex', gap:8, alignItems:'center', boxShadow:'0 4px 16px rgba(0,0,0,0.08)', pointerEvents:'auto', flex:1, maxWidth:420}}>
          <span style={{opacity:0.6}}>⌕</span>
          <input placeholder="Tìm xã, thôn, sự cố..." style={{border:0, outline:'none', flex:1, fontSize:13, background:'transparent'}} onKeyDown={e=>{ if(e.key==='Enter'){ const v=(e.target as HTMLInputElement).value; if(v) mapRef.current?.flyTo({center:[108.3+Math.random()*0.2,13.9+Math.random()*0.2], zoom:11}) }}} />
          <span style={{fontSize:10, padding:'2px 6px', borderRadius:999, background: health?.firms?.status==='LIVE'?'#DCFCE7': health?.firms?.status==='DEMO'?'#FEF3C7':'#FEE2E2'}}>{health?.firms?.status || liveStatus}</span>
        </div>
        <div style={{background:'rgba(255,255,255,0.96)', backdropFilter:'blur(12px)', borderRadius:12, padding:'8px 12px', fontSize:12, display:'flex', gap:8, alignItems:'center', boxShadow:'0 4px 16px rgba(0,0,0,0.08)', pointerEvents:'auto'}}>
          <span style={{width:8, height:8, borderRadius:999, background: liveStatus==='LIVE'?'#10B981': liveStatus==='CACHED'?'#F59E0B': liveStatus==='CONFIGURATION_REQUIRED'?'#F59E0B':'#EF4444', display:'inline-block', animation: liveStatus==='LIVE'?'pulse 1.5s infinite':''}}/>
          <span style={{fontWeight:800, fontSize:11, letterSpacing:0.5}}>{liveStatus==='LIVE'?'HỆ THỐNG TRỰC TIẾP (LIVE)': liveStatus==='CACHED'?'DỮ LIỆU ĐỆM (CACHED)': liveStatus==='CONFIGURATION_REQUIRED'?'CẦN CẤU HÌNH': liveStatus==='DEMO'?'CHẾ ĐỘ DEMO':'KHÔNG KHẢ DỤNG'}</span>
          <span style={{color:'#64748B'}}>· Cập nhật lúc: {now.toLocaleTimeString('vi-VN')} - {now.toLocaleDateString('vi-VN')}</span>
          {health && <span style={{fontSize:10, background:'#F1F5F9', padding:'2px 6px', borderRadius:999}}>GEE:{health.gee?.status} FIRMS:{health.firms?.status} Sentinel:{health.sentinel2?.status}</span>}
        </div>
      </div>

      {/* Layer toggle — functional + XYZ base */}
      <div style={{position:'absolute', top:64, left:12, background:'rgba(255,255,255,0.96)', backdropFilter:'blur(14px)', borderRadius:16, padding:10, minWidth:260, boxShadow:'0 8px 24px rgba(0,0,0,0.12)', border:'1px solid rgba(255,255,255,0.7)', display:'flex', flexDirection:'column', gap:6}}>
        <div style={{fontSize:11, fontWeight:700}}>Nền bản đồ (XYZ — dán trực tiếp MapLibre/Leaflet)</div>
        <select value={baseXyz} onChange={e=> switchBaseXyz(e.target.value)} style={{padding:'6px 10px', borderRadius:999, border:'1px solid #E2E8E5', fontSize:12, background:'#F8FAF9'}}>
          <option value="carto">CARTO Positron (Vector xám nhẹ) — https://basemaps.cartocdn.com/gl/positron-gl-style/style.json</option>
          <option value="esri">Esri World Imagery — https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{'{'}z{'}'}/{'{'}y{'}'}/{'{'}x{'}'}</option>
          <option value="google_s">Google Satellite — https://mt1.google.com/vt/lyrs=s&x={`{x}`}&y={`{y}`}&z={`{z}`}</option>
          <option value="google_y">Google Hybrid — https://mt1.google.com/vt/lyrs=y&x={`{x}`}&y={`{y}`}&z={`{z}`}</option>
          <option value="eox">EOX Sentinel-2 cloudless — https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{'{'}z{'}'}/{'{'}y{'}'}/{'{'}x{'}'}.jpg</option>
        </select>
        <div style={{fontSize:10, color:'#64748B'}}>Nguồn: <a href="https://earthengine.google.com" target="_blank">GEE</a> · <a href="https://dataspace.copernicus.eu" target="_blank">Copernicus</a> · <a href="https://planetarycomputer.microsoft.com" target="_blank">Planetary Computer</a> · <a href="https://firms.modaps.eosdis.nasa.gov" target="_blank">NASA FIRMS</a></div>
        <div style={{height:1, background:'#E2E8E5', margin:'4px 0'}}/>
        <div style={{fontSize:11, fontWeight:700}}>Lớp AI/GEE (overlay)</div>
        {[
          ['hotspot','🔥 Điểm nhiệt FIRMS', 'hotspot', 'VIIRS_SNPP_NRT'],
          ['ndvi','🌿 NDVI', 'ndvi', 'ndvi'],
          ['s1','📡 Sentinel-1 VV/VH', 's1', 's1'],
        ].map(([k,label, key, geeLayer])=>(
          <label key={k} style={{display:'flex', gap:6, alignItems:'center', background: activeSat[key]?'#DCFCE7':'#F8FAF9', padding:'6px 10px', borderRadius:999, fontSize:12, border:'1px solid #E2E8E5', cursor:'pointer'}}>
            <input type="checkbox" checked={!!activeSat[key as string]} onChange={()=> toggleSat(key as string, geeLayer as string)} /> {label}
            <span style={{fontSize:10, padding:'1px 6px', borderRadius:999, background: sourceLive[key==='hotspot'?'firms': key==='ndvi'?'sentinel2':'sentinel1']==='LIVE'?'#DCFCE7':'#FEF3C7'}}>{sourceLive[key==='hotspot'?'firms': key==='ndvi'?'sentinel2':'sentinel1'] || '...'}</span>
          </label>
        ))}
        <div style={{fontSize:10, color:'#64748B'}}>Gia Lai bbox 107.3,13.1,109.4,14.7 · Zoom ~9.2</div>
      </div>

      {/* Right controls */}
      <div style={{position:'absolute', top:64, right:12, display:'flex', flexDirection:'column', gap:8}}>
        <button onClick={requestLoc} style={{background:'rgba(255,255,255,0.96)', backdropFilter:'blur(12px)', border:0, borderRadius:12, padding:'10px 12px', boxShadow:'0 4px 12px rgba(0,0,0,0.08)', fontSize:12, fontWeight:700}}>📍 Vị trí của tôi</button>
        <div style={{background:'rgba(255,255,255,0.96)', backdropFilter:'blur(12px)', borderRadius:12, padding:10, fontSize:11, boxShadow:'0 4px 12px rgba(0,0,0,0.08)'}}>
          <div style={{fontWeight:800}}>Huyền thoại</div>
          <div><i style={{width:10,height:10,borderRadius:999,background:'#0EA5E9',display:'inline-block',marginRight:6}}/> CẤP I-II</div>
          <div><i style={{width:10,height:10,borderRadius:999,background:'#F59E0B',display:'inline-block',marginRight:6}}/> CẤP III-IV</div>
          <div><i style={{width:10,height:10,borderRadius:999,background:'#DC2626',display:'inline-block',marginRight:6}}/> CẤP V</div>
        </div>
      </div>

      {/* Bottom ticker + timeline */}
      <div style={{position:'absolute', bottom:0, left:0, right:0, background:'rgba(11,20,18,0.94)', color:'#fff', padding:'8px 12px', display:'flex', flexDirection:'column', gap:6}}>
        <div style={{display:'flex', gap:10, alignItems:'center', overflow:'hidden', whiteSpace:'nowrap'}}>
          <span style={{background: liveStatus==='LIVE'?'#10B981': liveStatus==='DEMO'?'#F59E0B':'#64748B', padding:'2px 8px', borderRadius:999, fontSize:11, fontWeight:700}}>{liveStatus==='LIVE'?'● LIVE': liveStatus==='DEMO'?'● DEMO':'● '+liveStatus}</span>
          <span style={{fontSize:12, animation:'marquee 18s linear infinite'}}>{tickerLines[tickerIdx]}</span>
        </div>
        <div style={{display:'flex', gap:8, alignItems:'center', background:'rgba(255,255,255,0.08)', borderRadius:10, padding:'6px 10px'}}>
          <span style={{fontSize:11, fontWeight:700}}>Dòng thời gian:</span>
          <select value={dateRange} onChange={e=> setDateRange(e.target.value as any)} style={{padding:'4px 8px', borderRadius:8, border:0, fontSize:12}}>
            <option value="latest">Mới nhất</option><option value="7d">7 ngày</option><option value="30d">30 ngày</option><option value="3m">3 tháng</option>
          </select>
          <span style={{fontSize:11, opacity:0.8}}>Mây &lt; <select value={cloud} onChange={e=> setCloud(Number(e.target.value))} style={{padding:'2px 6px', borderRadius:6, border:0, fontSize:11}}><option value={20}>20%</option><option value={40}>40%</option></select></span>
        </div>
      </div>

      {(info || pixel) && (
        <div style={{position:'absolute', bottom:80, right:12, background:'rgba(255,255,255,0.96)', backdropFilter:'blur(12px)', borderRadius:12, padding:12, minWidth:280, maxWidth:360, boxShadow:'0 8px 24px rgba(0,0,0,0.12)'}}>
          {info && <><div style={{fontWeight:700, fontSize:12}}>DỮ LIỆU VỆ TINH — {info.layer} <span style={{fontSize:10, padding:'2px 6px', borderRadius:999, background: info.status==='LIVE'?'#DCFCE7': info.status==='DEMO'?'#FEF3C7': info.status==='CONFIGURATION_REQUIRED'?'#FEF3C7':'#FEE2E2'}}>{info.status==='CONFIGURATION_REQUIRED' ? 'DEMO · Cache Vệ tinh Gia Lai' : info.status}</span></div><div style={{fontSize:12, marginTop:6, color:'#334155'}}>Nguồn: {info.status==='CONFIGURATION_REQUIRED' ? 'Esri/Sentinel Tile tĩnh · DEMO Cache' : (info.source || 'Sentinel-2')} · Ngày: {info.acquired || '—'} {info.status==='CONFIGURATION_REQUIRED' && <span style={{color:'#F59E0B'}}>· Fallback BaseMap</span>}</div></>}
          {pixel && <><div style={{height:1, background:'#E2E8E5', margin:'8px 0'}}/><div style={{fontSize:12}}>NDVI: <b>{pixel.ndvi}</b></div></>}
        </div>
      )}

      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}} @keyframes marquee{0%{transform:translateX(100%)}100%{transform:translateX(-100%)}}`}</style>
    </div>
  )
}
