import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
// ⚠️ BẮT BUỘC 1: Import CSS của MapLibre (Nếu thiếu map sẽ trắng/vỡ) — phải ở đầu file
import 'maplibre-gl/dist/maplibre-gl.css'
// Fallback nếu dùng Leaflet (không dùng nhưng giữ để tránh thiếu CSS)
// import 'leaflet/dist/leaflet.css'; 
import { useLocation } from '../hooks/useLocation'

const API = ((import.meta as any).env?.VITE_API_BASE || 'http://localhost:8000').replace(/[\r\n]/g, "").trim().replace(/\/$/, "")
const TILE_FIX = (url: string) => url.replace(/[\r\n]/g, "").trim()

// 8 điểm phủ Gia Lai mới (Tây Nguyên + Bình Định cũ — sáp nhập 2025, 15,536km2)
const STATIONS = [
  { id:1, name:'Trạm Kiểm lâm Ia Mơr - Huyện Chư Prông (Biên giới Campuchia)', coords:[107.65, 13.55] as [number,number], level:'V', score:88, type:'Cảnh báo Khẩn cấp', temp:34, humidity:28, wind:18 },
  { id:2, name:'Trạm Bảo tồn VQG Kon Ka Kinh', coords:[108.45, 14.25] as [number,number], level:'II', score:32, type:'An toàn', temp:26, humidity:65, wind:8 },
  { id:3, name:'Trạm Đèo An Khê (TX. An Khê - gió phơn)', coords:[108.65, 13.98] as [number,number], level:'V', score:91, type:'Điểm nóng', temp:36, humidity:22, wind:24 },
  { id:4, name:'Trạm Vĩnh Thạnh - Huyện Vĩnh Thạnh', coords:[108.90, 14.25] as [number,number], level:'IV', score:78, type:'Cảnh báo', temp:33, humidity:30, wind:16 },
  { id:5, name:'Trạm Quy Nhơn - Ven biển (Bình Định cũ)', coords:[109.21, 13.78] as [number,number], level:'III', score:45, type:'Giám sát ven biển', temp:29, humidity:55, wind:10 },
  { id:6, name:'Trạm Bồng Sơn - Hoài Nhơn (Bắc Gia Lai mới)', coords:[109.02, 14.42] as [number,number], level:'II', score:28, type:'An toàn ven biển', temp:27, humidity:68, wind:7 },
  { id:7, name:'Trạm An Nhơn - Đồng bằng', coords:[109.01, 13.89] as [number,number], level:'III', score:52, type:'Giám sát đồng bằng', temp:30, humidity:52, wind:9 },
  { id:8, name:'Trạm Xã Hội Sơn', coords:[108.68, 13.92] as [number,number], level:'I', score:15, type:'An toàn / Đã dập tắt', temp:27, humidity:70, wind:6 },
]

export default function MapView({ onSelect }: { onSelect?: (type:string, id:string)=>void }) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  void onSelect
  const [_base] = useState<'streets'|'satellite'>('streets')
  void _base
  // Priority 1: Default Esri World Imagery (ổn định nhất) — không google_s
  const [baseXyz, setBaseXyz] = useState<string>('esri')
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

  // XYZ Tile URLs — Esri mặc định, OSM fallback, không Google làm default
  const XYZ_TILES: Record<string, { url: string, attribution: string }> = {
    esri: { url: TILE_FIX('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'), attribution: '© Esri World Imagery' },
    osm: { url: TILE_FIX('https://tile.openstreetmap.org/{z}/{x}/{y}.png'), attribution: '© OpenStreetMap' },
    google_s: { url: TILE_FIX('https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}'), attribution: '© Google Satellite' },
    google_y: { url: TILE_FIX('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}'), attribution: '© Google Hybrid' },
    eox: { url: TILE_FIX('https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg'), attribution: '© EOX Sentinel-2 cloudless' },
  }
  const DEFAULT_TILE_URL = XYZ_TILES.esri.url
  void DEFAULT_TILE_URL
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
  }

  // Effect 2 — đổi basemap không destroy map (tránh race)
  useEffect(()=>{
    const map = mapRef.current
    if(!map) return
    if(!map.isStyleLoaded()) {
      map.once('load', ()=> switchBaseXyz(baseXyz))
      return
    }
    const sourceId = "base-xyz"
    const layerId = "base-xyz"
    if(map.getLayer(layerId)) try{ map.removeLayer(layerId)}catch{}
    if(map.getSource(sourceId)) try{ map.removeSource(sourceId)}catch{}
    if(baseXyz==='carto') return
    const tile = XYZ_TILES[baseXyz]
    if(!tile) return
    // Fallback Esri → OSM → static
    try{
      map.addSource(sourceId, { type:'raster', tiles:[TILE_FIX(tile.url)], tileSize:256, attribution: tile.attribution } as any)
      map.addLayer({ id: layerId, type:'raster', source: sourceId } as any, 'boundary')
    }catch(e){
      console.warn('Base tile add failed, fallback OSM', e)
      const osm = XYZ_TILES.osm
      try{
        map.addSource(sourceId, { type:'raster', tiles:[osm.url], tileSize:256, attribution: osm.attribution } as any)
        map.addLayer({ id: layerId, type:'raster', source: sourceId } as any, 'boundary')
      }catch{}
    }
  }, [baseXyz])

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
    // Hotspot: FIRMS API — bypass Vercel cache real-time
    if(key==='hotspot'){
      try{
        const r=await fetch(TILE_FIX(`${API}/api/v1/hotspots/live?t=${Date.now()}`), { cache: 'no-store', headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' } })
        const data=await r.json()
        if(data.status==='LIVE' || data.status==='CACHED' || data.status==='DEMO'){
          const fires = data.fires || data.hotspots || []
          fires.slice(0,20).forEach((f:any)=>{
            const el=document.createElement('div')
            el.style.width='14px'; el.style.height='14px'; el.style.borderRadius='999px'; el.style.background='#DC2626'; el.style.border='2px solid #fff'; el.style.boxShadow='0 0 8px rgba(220,38,38,0.8)'
            const m=new (maplibregl as any).Marker({ element: el }).setLngLat([f.longitude || f.lon || 108.3, f.latitude || f.lat || 13.9] as any).addTo(mapRef.current)
            hotspotMarkers.current.push(m)
          })
          const displayStatus = data.status==='CACHED' ? 'LIVE' : data.status
          setLiveStatus(displayStatus as any); setInfo({ layer:'hotspot', status: displayStatus, source:'NASA FIRMS', satellite: data.satellite || 'VIIRS', acquired: data.date || fires[0]?.acq_date || data.acquired || new Date().toISOString().slice(0,10), date: data.date || new Date().toISOString().slice(0,10), count: fires.length, bbox: data.bbox })
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
    // NDVI fallback: GEE tile UNAVAILABLE → Sentinel Hub NDVI stats
    if(key==='ndvi'){
      try{
        const res=await fetchTile(geeLayer)
        if(res.status==='LIVE' && res.tile_url && mapRef.current){
          if(mapRef.current?.getLayer(key)) try{ mapRef.current.removeLayer(key) }catch{}
          if(mapRef.current?.getSource(key)) try{ mapRef.current.removeSource(key) }catch{}
          mapRef.current.addSource(key, { type:'raster', tiles:[TILE_FIX(res.tile_url)], tileSize:256 })
          mapRef.current.addLayer({ id:key, type:'raster', source:key, paint:{ 'raster-opacity': 0.85 } } as any)
          setLiveStatus('LIVE'); setInfo({ layer: key, source: res.source || 'Sentinel-2', ...res, acquired: res.acquired || res.metadata?.acquired })
          return
        }
        // Fallback Sentinel Hub NDVI stats
        console.warn(`NDVI GEE UNAVAILABLE, fallback Sentinel Hub`, res.reason)
        const r2=await fetch(TILE_FIX(`${API}/api/v1/satellite/ndvi?bbox=107.0,12.9,109.6,15.0`))
        const j2=await r2.json()
        setInfo({ layer:'ndvi', status: j2.status || 'DEMO', source: j2.source || 'Sentinel Hub', satellite: j2.satellite, acquired: j2.acquired || j2.acquired_at || new Date().toISOString().slice(0,10), ndvi: j2.ndvi, reason: j2.reason, bbox: j2.bbox })
        return
      }catch(err){
        console.warn('NDVI fallback lỗi:', err)
        setInfo({ layer:'ndvi', status:'UNAVAILABLE', source:'Sentinel Hub', reason:String(err) })
        return
      }
    }
    try{
      const res=await fetchTile(geeLayer)
      if(res.status==='LIVE' && res.tile_url && mapRef.current){
        if(mapRef.current?.getLayer(key)) try{ mapRef.current.removeLayer(key) }catch{}
        if(mapRef.current?.getSource(key)) try{ mapRef.current.removeSource(key) }catch{}
        mapRef.current.addSource(key, { type:'raster', tiles:[TILE_FIX(res.tile_url)], tileSize:256 })
        mapRef.current.addLayer({ id:key, type:'raster', source:key, paint:{ 'raster-opacity': 0.85 } } as any)
        setLiveStatus('LIVE'); setInfo({ layer: key, source: res.source || 'Sentinel-2', ...res, acquired: res.acquired || res.metadata?.acquired })
      } else {
        console.warn(`Lớp ${geeLayer} chưa khả dụng (Fallback BaseMap):`, res.reason || res.error)
        setInfo({ layer: key, status: res.status || 'UNAVAILABLE', source: res.source || 'Sentinel-2', reason: res.reason || res.error, acquired: res.acquired || res.metadata?.acquired })
      }
    }catch(err){
      console.warn(`Lớp ${geeLayer} lỗi:`, err)
      setInfo({ layer: key, status:'UNAVAILABLE', reason:String(err) })
    }
  }

  const [sourceLive, setSourceLive] = useState<Record<string,string>>({})
  const [health, setHealth] = useState<any>(null)
  const [villages, setVillages] = useState<any[]>([])
  const [fireAlerts, setFireAlerts] = useState<any[]>([])
  // Trigger resize sau khi DOM mount (fix height 0)
  useEffect(()=>{
    if(!mapRef.current) return
    const t=setTimeout(()=> mapRef.current?.resize(), 300)
    return ()=> clearTimeout(t)
  }, [])
  // Hiển thị xã/thôn phân định + highlight 20km khi có cháy
  useEffect(()=>{
    if(!mapRef.current || !villages.length) return
    const existing = (mapRef.current as any)._villageMarkers as any[] || []
    existing.forEach((m:any)=>{ try{ m.remove()}catch{} })
    const markers:any[]=[]
    villages.forEach((v:any)=>{
      const alert = fireAlerts.find((a:any)=> a.village===v.village)
      const el=document.createElement('div')
      el.style.padding='4px 6px'; el.style.borderRadius='8px'; el.style.fontSize='10px'; el.style.fontWeight='700'
      el.style.background= alert ? (alert.level==='CẢNH BÁO' ? '#DC2626' : '#F59E0B') : 'rgba(255,255,255,0.95)'
      el.style.color= alert ? '#fff' : '#334155'; el.style.border= alert ? '2px solid #fff' : '1px solid #E2E8E5'
      el.style.boxShadow='0 2px 6px rgba(0,0,0,0.15)'; el.textContent= v.village
      if(alert) el.title=`${v.commune} — ${alert.distance_km}km từ điểm cháy ${alert.fire_coords?.join(',')} — ${alert.level}`
      const m=new (maplibregl as any).Marker({ element: el, anchor:'bottom' }).setLngLat(v.coords as any).addTo(mapRef.current!)
      markers.push(m)
      if(alert && !mapRef.current!.getSource(`circle-${v.id}`)){
        const circle={ type:'Feature', geometry:{ type:'Point', coordinates: v.coords }, properties:{ radius: 20 } }
        mapRef.current!.addSource(`circle-${v.id}`, { type:'geojson', data: circle })
        try{
          mapRef.current!.addLayer({ id:`circle-${v.id}`, type:'circle', source:`circle-${v.id}`, paint:{ 'circle-radius': 40, 'circle-color': alert.level==='CẢNH BÁO' ? '#DC2626' : '#F59E0B', 'circle-opacity': 0.12, 'circle-stroke-width': 2, 'circle-stroke-color': alert.level==='CẢNH BÁO' ? '#DC2626' : '#F59E0B' } })
        }catch{}
      }
    })
    ;(mapRef.current as any)._villageMarkers = markers
  }, [villages, fireAlerts])
  // Effect 1 — chỉ init map một lần — dùng inline style OSM để tránh CORS style JSON
  useEffect(()=>{
    if(!mapContainer.current || mapRef.current) return
    const inlineStyle: any = {
      version: 8,
      sources: {
        osm: { type:'raster', tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize:256, attribution:'© OpenStreetMap' }
      },
      layers: [{ id:'osm', type:'raster', source:'osm' }]
    }
    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: inlineStyle as any,
      center: [108.6, 13.9],
      zoom: 8.5,
      maxBounds: [[107.0, 12.9],[109.6, 15.0]],
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
    map.fitBounds([[107.0, 12.9], [109.6, 15.0]], { padding:20, duration:0 })
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
      // Gia Lai mới (sáp nhập Bình Định) — 15,536 km2, 58 xã/phường — biên Campuchia đến Biển Đông
      map.addSource('gialai-boundary', { type:'geojson', data:{ type:'Feature', geometry:{ type:'Polygon', coordinates:[[[107.0,12.9],[109.6,12.9],[109.6,15.0],[107.0,15.0],[107.0,12.9]]] }, properties:{} } })
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
  }, [])

  useEffect(()=>{
    if(locState.status==='granted' && mapRef.current && locState.lon && locState.lat){
      mapRef.current.flyTo({ center:[locState.lon, locState.lat], zoom:11, duration:1200 } as any)
      try{ new (maplibregl as any).Marker({color:'#0F766E'}).setLngLat([locState.lon, locState.lat]).addTo(mapRef.current) }catch{}
    }
  }, [locState])

  useEffect(()=>{
    fetch(`${API}/api/health/geospatial`).then(r=>r.json()).then(j=>{
      setSourceLive({ sentinel2: j.sentinel2?.status || 'UNAVAILABLE', firms: j.firms?.status || 'UNAVAILABLE', gee: j.gee?.status || 'UNAVAILABLE' })
      setHealth(j)
      const overall = j.summary?.all_live ? 'LIVE' : (j.firms?.status==='CONFIGURATION_REQUIRED' ? 'CONFIGURATION_REQUIRED' : 'UNAVAILABLE')
      setLiveStatus(overall as any)
    }).catch(()=> setLiveStatus('UNAVAILABLE'))
    // Xã/thôn delineation
    fetch(`${API}/api/villages`).then(r=>r.json()).then(v=> setVillages(v)).catch(()=>{})
    // 20km fire notification — poll mỗi 60s
    const loadAlerts=()=> fetch(TILE_FIX(`${API}/api/villages/fire-alert?t=${Date.now()}`), { cache:'no-store' }).then(r=>r.json()).then(j=>{
      setFireAlerts(j.alerts || [])
      if(j.alerts?.length){
        const msg = `🔥 ${j.alerts.length} thôn/xã trong 20km có cháy: ${j.alerts.slice(0,2).map((a:any)=>`${a.village} (${a.distance_km}km)`).join(', ')}`
        console.warn(msg)
        if(Notification && Notification.permission==='granted') new Notification('Cảnh báo cháy 20km', { body: msg })
      }
    }).catch(()=>{})
    loadAlerts()
    const int=setInterval(loadAlerts, 60000)
    if(Notification && Notification.permission==='default') Notification.requestPermission()
    return ()=> clearInterval(int)
  },[])

  return (
    // ⚠️ BẮT BUỘC 3: Div chứa map PHẢI CÓ height/width cố định (Tránh h-0) + resize trigger
    <div className="relative w-full h-[calc(100vh-64px)] min-h-[500px] bg-slate-900 relative z-0" style={{position:'relative', height:'calc(100vh - 64px)', borderRadius:16, overflow:'hidden', background:'#0f172a'}}>
      <div ref={mapContainer} className="w-full h-full min-h-[500px] relative z-0 absolute inset-0" style={{ width:'100%', height:'100%', minHeight:'500px' }} />

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
        <div style={{fontSize:10, color:'#64748B'}}>Gia Lai bbox 107.0,12.9,109.6,15.0 · Zoom ~9.2</div>
      </div>

      {/* Right controls */}
      <div style={{position:'absolute', top:64, right:12, display:'flex', flexDirection:'column', gap:8}}>
        <button onClick={requestLoc} style={{background:'rgba(255,255,255,0.96)', backdropFilter:'blur(12px)', border:0, borderRadius:12, padding:'10px 12px', boxShadow:'0 4px 12px rgba(0,0,0,0.08)', fontSize:12, fontWeight:700}}>📍 Vị trí của tôi</button>
        <button onClick={async()=>{
          const bounds = mapRef.current?.getBounds()
          const bbox = bounds ? `${bounds.getWest().toFixed(1)},${bounds.getSouth().toFixed(1)},${bounds.getEast().toFixed(1)},${bounds.getNorth().toFixed(1)}` : '107.0,12.9,109.6,15.0'
          const center = mapRef.current?.getCenter()
          const tileUrl = XYZ_TILES[baseXyz]?.url || 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
          setInfo({ layer:'smoke', status:'ANALYZING', source:'Gemini Vision' })
          try{
            const r=await fetch(`${API}/api/ai/smoke/detect`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ tile_url: tileUrl, lat: center?.lat || 13.9, lon: center?.lng || 108.3, bbox }) })
            const j=await r.json()
            const isSmoke = j.result?.is_smoke
            setInfo({ layer:'smoke', status: j.status, source:'Gemini Vision', satellite: tileUrl.includes('arcgis')?'Esri':tileUrl.includes('eox')?'Sentinel-2':'Google', acquired: new Date().toISOString().slice(0,10), is_smoke: isSmoke, confidence: j.result?.confidence, reason: j.result?.reason, alert: j.result?.alert, bbox })
            if(isSmoke){
              // Thêm marker cảnh báo khói
              const el=document.createElement('div'); el.style.width='22px'; el.style.height='22px'; el.style.borderRadius='999px'; el.style.background='#DC2626'; el.style.border='3px solid #fff'; el.style.boxShadow='0 0 12px rgba(220,38,38,1)'; el.style.animation='pulse 1s infinite'
              new (maplibregl as any).Marker({ element: el }).setLngLat([center?.lng || 108.3, center?.lat || 13.9] as any).addTo(mapRef.current)
            }
          }catch(e){ setInfo({ layer:'smoke', status:'UNAVAILABLE', reason:String(e) }) }
        }} style={{background: info?.layer==='smoke' && info?.is_smoke ? '#DC2626':'rgba(255,255,255,0.96)', color: info?.layer==='smoke' && info?.is_smoke ? '#fff':'#0B1412', backdropFilter:'blur(12px)', border:0, borderRadius:12, padding:'10px 12px', boxShadow:'0 4px 12px rgba(0,0,0,0.08)', fontSize:12, fontWeight:700}}>{info?.layer==='smoke' && info?.status==='ANALYZING' ? '⏳ Đang phân tích...' : '🤖 AI phát hiện khói'}</button>
        <div style={{background:'rgba(255,255,255,0.96)', backdropFilter:'blur(12px)', borderRadius:12, padding:10, fontSize:11, boxShadow:'0 4px 12px rgba(0,0,0,0.08)'}}>
          <div style={{fontWeight:800}}>Huyền thoại</div>
          <div><i style={{width:10,height:10,borderRadius:999,background:'#0EA5E9',display:'inline-block',marginRight:6}}/> CẤP I-II</div>
          <div><i style={{width:10,height:10,borderRadius:999,background:'#F59E0B',display:'inline-block',marginRight:6}}/> CẤP III-IV</div>
          <div><i style={{width:10,height:10,borderRadius:999,background:'#DC2626',display:'inline-block',marginRight:6}}/> CẤP V</div>
          {info?.layer==='smoke' && info?.is_smoke && <div style={{marginTop:6, padding:'6px 8px', background:'#FEE2E2', borderRadius:8, color:'#991B1B', fontWeight:700}}>🚨 {info.alert?.message || 'Phát hiện khói'}<br/><span style={{fontWeight:400, fontSize:10}}>Độ tin cậy {(info.confidence*100).toFixed(0)}% · {info.reason}</span></div>}
          {info?.layer==='smoke' && info?.is_smoke===false && <div style={{marginTop:6, padding:'6px 8px', background:'#DCFCE7', borderRadius:8, color:'#065F46'}}>✓ Không có khói — an toàn</div>}
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

      {/* Panel xã/thôn 20km cảnh báo */}
      {fireAlerts.length>0 && (
        <div style={{position:'absolute', bottom:80, left:12, background:'rgba(255,255,255,0.98)', backdropFilter:'blur(12px)', borderRadius:12, padding:12, minWidth:280, maxWidth:360, boxShadow:'0 8px 24px rgba(0,0,0,0.15)', border: fireAlerts.some((a:any)=>a.level==='CẢNH BÁO') ? '2px solid #DC2626' : '1px solid #F59E0B'}}>
          <div style={{fontWeight:800, fontSize:12, color: fireAlerts.some((a:any)=>a.level==='CẢNH BÁO') ? '#DC2626' : '#92400E'}}>🔥 Cảnh báo cháy trong 20km ({fireAlerts.length} thôn/xã)</div>
          <div style={{fontSize:11, color:'#475569', marginTop:4}}>Tự động thông báo khi điểm nhiệt FIRMS trong 20km</div>
          <div style={{maxHeight:120, overflow:'auto', marginTop:8, display:'flex', flexDirection:'column', gap:6}}>
            {fireAlerts.map((a:any, i:number)=>(
              <div key={i} style={{display:'flex', justifyContent:'space-between', alignItems:'center', background: a.level==='CẢNH BÁO' ? '#FEE2E2' : '#FEF3C7', padding:'6px 8px', borderRadius:8, fontSize:11}}>
                <div><b>{a.village}</b> <span style={{color:'#64748B'}}>({a.commune})</span><br/><span style={{fontSize:10, color:'#334155'}}>{a.distance_km}km từ cháy · {a.acq_date || '2026-09-04'}</span></div>
                <span style={{fontSize:10, padding:'2px 6px', borderRadius:999, background: a.level==='CẢNH BÁO' ? '#DC2626' : '#F59E0B', color:'#fff'}}>{a.level}</span>
              </div>
            ))}
          </div>
          <div style={{fontSize:10, color:'#64748B', marginTop:6}}>Bán kính 20km · Cập nhật mỗi 60s · BBox Gia Lai 107.0,12.9,109.6,15.0</div>
        </div>
      )}
      {fireAlerts.length===0 && villages.length>0 && (
        <div style={{position:'absolute', bottom:80, left:12, background:'rgba(255,255,255,0.9)', backdropFilter:'blur(12px)', borderRadius:12, padding:'10px 12px', fontSize:11, boxShadow:'0 4px 12px rgba(0,0,0,0.1)'}}>
          ✓ {villages.length} thôn/xã Gia Lai đang theo dõi — không có cháy trong 20km
        </div>
      )}
      {(info || pixel) && (
        <div style={{position:'absolute', bottom:80, right:12, background:'rgba(255,255,255,0.96)', backdropFilter:'blur(12px)', borderRadius:12, padding:12, minWidth:280, maxWidth:360, boxShadow:'0 8px 24px rgba(0,0,0,0.12)'}}>
          {info && <><div style={{fontWeight:700, fontSize:12}}>DỮ LIỆU VỆ TINH — {info.layer} <span style={{fontSize:10, padding:'2px 6px', borderRadius:999, background: info.status==='LIVE'?'#DCFCE7': info.status==='DEMO'?'#FEF3C7': info.status==='CONFIGURATION_REQUIRED'?'#FEF3C7':'#FEE2E2'}}>{info.status==='CONFIGURATION_REQUIRED' ? 'DEMO · Cache Vệ tinh Gia Lai' : info.status}</span></div><div style={{fontSize:12, marginTop:6, color:'#334155'}}>Nguồn: {info.status==='CONFIGURATION_REQUIRED' ? 'Esri/Sentinel Tile tĩnh · DEMO Cache' : (info.source || 'Sentinel-2')} · Ngày: {info.acquired || info.date || '—'} {info.status==='CONFIGURATION_REQUIRED' && <span style={{color:'#F59E0B'}}>· Fallback BaseMap</span>}</div>
          {info.layer==='smoke' && info.is_smoke && <div style={{marginTop:6, padding:'6px 8px', background:'#FEE2E2', borderRadius:8, color:'#991B1B', fontSize:11, fontWeight:700}}>🚨 {info.alert?.message}<br/><span style={{fontWeight:400}}>Độ tin cậy {(info.confidence*100).toFixed(0)}% · {info.reason}</span></div>}
          </>}
          {pixel && <><div style={{height:1, background:'#E2E8E5', margin:'8px 0'}}/><div style={{fontSize:12}}>NDVI: <b>{pixel.ndvi}</b></div></>}
        </div>
      )}

      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}} @keyframes marquee{0%{transform:translateX(100%)}100%{transform:translateX(-100%)}}`}</style>
    </div>
  )
}
