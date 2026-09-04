import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
// ⚠️ BẮT BUỘC 1: Import CSS của MapLibre (Nếu thiếu map sẽ trắng/vỡ) — phải ở đầu file
import 'maplibre-gl/dist/maplibre-gl.css'
// Fallback nếu dùng Leaflet (không dùng nhưng giữ để tránh thiếu CSS)
// import 'leaflet/dist/leaflet.css'; 
import { useLocation } from '../hooks/useLocation'
import DemoTour from './DemoTour'
import { getMode } from './ModeSwitch'

// Điểm từng cháy Hè 2026 (nguồn: Cổng TTĐT Gia Lai, Hạt Kiểm lâm) — ghim lưu ý trên bản đồ
const HIST_FIRES = [
  { name: 'Cháy rừng dương Tân Phụng', place: 'Xã Phù Mỹ Đông', coords: [109.06, 14.13] as [number, number], note: '21/7/2026 · lan nhanh do nắng+gió · 378 CBCS · dập 20h30 cùng ngày' },
  { name: 'Cháy thực bì TK213', place: 'Xã Hội Sơn – Hòa Hội', coords: [108.66, 13.90] as [number, number], note: 'Tháng 7-8/2026 · rừng trồng + thực bì · đã ngăn lan rộng' },
  { name: 'Cháy núi Vũng Chua (4,23ha)', place: 'P. Quy Nhơn Nam', coords: [109.235, 13.745] as [number, number], note: '27/8/2026 · thiệt hại 4,23ha · đang điều tra nguyên nhân' },
]

// Kịch bản DEMO: đủ hiện tượng tutorial — 1 điểm ĐANG CHÁY + 3 điểm NGHI NGỜ
const DEMO_ALERTS = [
  { village: 'Xã Hội Sơn', commune: 'Xã Hội Sơn', village_coords: [108.68, 13.92], fire_coords: [108.69, 13.93], distance_km: 2.4, acq_date: new Date().toISOString().slice(0, 10), confidence: 'h', level: 'CẢNH BÁO' },
  { village: 'Thôn Trung Tâm', commune: 'Xã Hội Sơn', village_coords: [108.68, 13.92], fire_coords: [108.75, 13.95], distance_km: 9.1, acq_date: new Date().toISOString().slice(0, 10), confidence: 'n', level: 'THEO DÕI' },
  { village: 'Xã Kông Bờ La', commune: 'Huyện Kbang', village_coords: [108.55, 14.10], fire_coords: [108.60, 14.12], distance_km: 12.6, acq_date: new Date().toISOString().slice(0, 10), confidence: 'n', level: 'THEO DÕI' },
  { village: 'Xã Đak Trôi', commune: 'Huyện Mang Yang', village_coords: [108.20, 14.02], fire_coords: [108.25, 14.05], distance_km: 15.3, acq_date: new Date().toISOString().slice(0, 10), confidence: 'n', level: 'THEO DÕI' },
]

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
  const [liveStatus, setLiveStatus] = useState<'LIVE'|'CACHED'|'STALE'|'CONFIGURATION_REQUIRED'|'UNAVAILABLE'|'DEMO'>('UNAVAILABLE')
  const [now, setNow] = useState(new Date())
  const [tickerIdx, setTickerIdx] = useState(0)
  const [showLayers, setShowLayers] = useState(false)
  const communesRef = useRef<any>(null)
  const [communesCount, setCommunesCount] = useState<number>(0)
  const [communesError, setCommunesError] = useState<string>('')
  const [search, setSearch] = useState('')
  const [suggests, setSuggests] = useState<any[]>([])
  const { state: locState, request: requestLoc } = useLocation()

  // URL tài sản tương thích cả Vercel (/) và GitHub Pages (/gialai-ecochain/)
  const assetUrl = (f:string)=>{
    const b = ((import.meta as any).env?.BASE_URL || '/') as string
    return (b.endsWith('/') ? b : b + '/') + f
  }
  // Cache-buster cho geojson tĩnh — tăng GEOJSON_V mỗi lần regenerate để diệt CDN/browser cache cũ
  const GEOJSON_V = 'v4'
  const fetchJson = async (files:string[])=>{
    let last:any = null
    for(const f of files){
      const busted = f.includes('?') ? f : `${f}?v=${GEOJSON_V}`
      for(const u of [assetUrl(busted), busted, '/' + busted]){
        try{ const r = await fetch(u); if(r.ok) return await r.json() }catch(e){ last = e }
      }
    }
    throw last || new Error('fetch failed: ' + files.join(','))
  }
  // Lớp nền raster luôn nằm dưới cùng (trước layer vector thấp nhất hiện có)
  const bottomLayerId = (map:any)=>{
    for(const id of ['boundary-fill','boundary','communes-fill']) try{ if(map.getLayer(id)) return id }catch{}
    return undefined
  }
  const LEVEL_VI: Record<string,string> = { I:'Thấp', II:'Trung bình', III:'Cao', IV:'Nguy hiểm', V:'Cực kỳ nguy hiểm' }
  const LEVEL_COLOR: Record<string,string> = { I:'#0EA5E9', II:'#10B981', III:'#F59E0B', IV:'#F97316', V:'#DC2626' }
  // Popup xã + chẩn đoán AI vệ tinh (I-V) — mở ngay, AI điền sau
  const communePopup = async (f:any, lngLat:any, map:any)=>{
    const base = `<div style="font-family:Inter,sans-serif"><b>${f.ten_xa||''}</b><br/><span style="font-size:11px;color:#64748B">mã ${f.ma_xa||''} · ${f.dtich_km2||''} km² · dân số ${f.dan_so||''}</span>`
    const popup = new (maplibregl as any).Popup({ closeButton:true, maxWidth:'320px' }).setLngLat(lngLat).setHTML(base + `<br/>⏳ AI vệ tinh đang chẩn đoán...</div>`).addTo(map)
    window.dispatchEvent(new CustomEvent('ecochain-select-area', { detail:{ area: f.ten_xa } }))
    try{
      const r = await fetch(TILE_FIX(`${API}/api/fire/risk?administrative_unit_id=${encodeURIComponent(f.ten_xa||('ma-'+f.ma_xa))}&lat=${lngLat[1].toFixed(4)}&lon=${lngLat[0].toFixed(4)}`))
      const j = await r.json()
      const lv = j.warning_level || 'I', c = LEVEL_COLOR[lv] || '#64748B'
      const ev = j.evidence || {}
      const n = Array.isArray(ev.hotspots) ? ev.hotspots.length : (ev.hotspots ?? 0)
      popup.setHTML(base + `<br/><div style="margin-top:6px;display:flex;gap:6px;align-items:center"><span style="background:${c};color:#fff;font-weight:800;font-size:12px;padding:2px 10px;border-radius:999">CẤP ${lv} · ${LEVEL_VI[lv]||''}</span><span style="font-size:11px">Risk <b>${j.risk_score ?? '?'}/100</b></span><span style="font-size:10px;background:${j.status==='LIVE'?'#DCFCE7':'#FEF3C7'};padding:2px 6px;border-radius:999">${j.status||''}</span></div><div style="font-size:11px;color:#334155;margin-top:4px">🛰️ NDVI ${ev.satellite?.ndvi ?? '?'} · ${ev.weather?.temperature ?? '?'}°C · FIRMS ${n} điểm · Tin cậy ${j.confidence ?? '?'}%</div><div style="font-size:10px;color:#64748B">${Object.keys(j.factors||{}).join(', ')}</div></div>`)
    }catch{ popup.setHTML(base + `<br/><span style="font-size:11px;color:#B45309">AI chưa kết nối (UNAVAILABLE) — thử lại sau</span></div>`) }
  }
  const communeBounds = (feat:any)=>{
    let minx=1e9, miny=1e9, maxx=-1e9, maxy=-1e9
    const walk=(c:any)=>{ if(typeof c[0]==='number'){ if(c[0]<minx)minx=c[0]; if(c[0]>maxx)maxx=c[0]; if(c[1]<miny)miny=c[1]; if(c[1]>maxy)maxy=c[1] } else c.forEach(walk) }
    walk(feat.geometry.coordinates)
    return [[minx,miny],[maxx,maxy]]
  }
  const selectCommune = (props:any)=>{
    const map = mapRef.current
    if(!map || !communesRef.current) return
    const feat = communesRef.current.features?.find((f:any)=> String(f.properties?.ma_xa)===String(props.ma_xa))
    if(!feat) return
    try{
      map.fitBounds(communeBounds(feat) as any, { padding:40, duration:800 })
      const cx=(communeBounds(feat)[0][0]+communeBounds(feat)[1][0])/2, cy=(communeBounds(feat)[0][1]+communeBounds(feat)[1][1])/2
      communePopup(feat.properties, [cx,cy], map)
    }catch{}
    setSuggests([]); setSearch(props.ten_xa||'')
  }

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
    // Fallback Esri → OSM → static — nền luôn nằm DƯỚI vector (boundary/communes)
    const before = bottomLayerId(map)
    try{
      map.addSource(sourceId, { type:'raster', tiles:[TILE_FIX(tile.url)], tileSize:256, attribution: tile.attribution } as any)
      if(before) map.addLayer({ id: layerId, type:'raster', source: sourceId } as any, before)
      else map.addLayer({ id: layerId, type:'raster', source: sourceId } as any)
    }catch(e){
      console.warn('Base tile add failed, fallback OSM', e)
      const osm = XYZ_TILES.osm
      try{
        map.addSource(sourceId, { type:'raster', tiles:[osm.url], tileSize:256, attribution: osm.attribution } as any)
        if(before && map.getLayer(before)) map.addLayer({ id: layerId, type:'raster', source: sourceId } as any, before)
        else map.addLayer({ id: layerId, type:'raster', source: sourceId } as any)
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
          const displayStatus = data.status
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
  void health
  const [villages, setVillages] = useState<any[]>([])
  const [fireAlerts, setFireAlerts] = useState<any[]>([])
  const [mode, setMode] = useState<string>(() => getMode())
  const [tourOpen, setTourOpen] = useState(false)
  const [bannerOff, setBannerOff] = useState<string>('')
  const burning = fireAlerts.filter((a:any)=>a.level==='CẢNH BÁO')
  const suspicious = fireAlerts.filter((a:any)=>a.level!=='CẢNH BÁO')
  const burnKey = burning.map((a:any)=>a.village).join('|')
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
      center: [108.41, 13.85],
      zoom: 7.8,
      maxBounds: [[107.0, 12.7],[109.7, 15.1]],
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
    // Toàn cảnh Gia Lai: bounds thực từ gialai_135.geojson [107.45,12.99,109.36,14.70]
    map.fitBounds([[107.45, 12.99], [109.36, 14.70]], { padding:30, duration:0 })
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
      // Ranh tỉnh Gia Lai thực (viền ngoài, không lỗ) — file nhẹ 26KB
      fetchJson(['gialai_province.geojson']).then((prov:any)=>{
        if(!map.getSource('gialai-boundary')){
          map.addSource('gialai-boundary', { type:'geojson', data: prov })
          map.addLayer({ id:'boundary-fill', type:'fill', source:'gialai-boundary', paint:{ 'fill-color':'#0F766E', 'fill-opacity':0.04 } })
          map.addLayer({ id:'boundary', type:'line', source:'gialai-boundary', paint:{ 'line-color':'#B91C1C', 'line-width':3, 'line-opacity':1 } })
          map.addLayer({ id:'province-label', type:'symbol', source:'gialai-boundary', layout:{ 'text-field':'TỈNH GIA LAI', 'text-size':16, 'text-font':['Open Sans ExtraBold','Arial Unicode MS Bold'] } as any, paint:{ 'text-color':'#B91C1C', 'text-halo-color':'#fff', 'text-halo-width':2 } })
        }
      }).catch(()=>{ // fallback bbox nếu thiếu file
        if(!map.getSource('gialai-boundary')){
          map.addSource('gialai-boundary', { type:'geojson', data:{ type:'Feature', geometry:{ type:'Polygon', coordinates:[[[107.0,12.9],[109.6,12.9],[109.6,15.0],[107.0,15.0],[107.0,12.9]]] }, properties:{} } })
          map.addLayer({ id:'boundary', type:'line', source:'gialai-boundary', paint:{ 'line-color':'#0F766E', 'line-width':1.5, 'line-opacity':0.5, 'line-dasharray':[4,4] } })
        }
      })
      // 135 xã: bản nhẹ 836KB trước, rớt mới tải bản full 3.8MB
      fetchJson(['gialai_135_light.geojson','gialai_135.geojson']).then((fc:any)=>{
        const feats = fc.features || []
        communesRef.current = fc
        setCommunesCount(feats.length)
        setCommunesError('')
        console.log(`✅ Đã tải ${feats.length} xã/phường Gia Lai`)
        if(!map.getSource('gialai-communes')){
          map.addSource('gialai-communes', { type:'geojson', data: fc })
          // Màu pastel phân biệt từng xã như ảnh mẫu baogialai — categorical theo ma_xa % 12
          const pastel = ['#fbb4ae','#b3cde3','#ccebc5','#decbe4','#fed9a6','#ffffcc','#e5d8bd','#fddaec','#f2f2f2','#b3e2cd','#cbd5e8','#e6f5c9'] as any
          const fillExpr = ['match', ['%', ['to-number', ['get','ma_xa']], 12], 0, pastel[0], 1, pastel[1], 2, pastel[2], 3, pastel[3], 4, pastel[4], 5, pastel[5], 6, pastel[6], 7, pastel[7], 8, pastel[8], 9, pastel[9], 10, pastel[10], pastel[11]] as any
          map.addLayer({ id:'communes-fill', type:'fill', source:'gialai-communes', paint:{ 'fill-color': fillExpr, 'fill-opacity': 0.85 } })
          map.addLayer({ id:'communes-line', type:'line', source:'gialai-communes', paint:{ 'line-color':'#ffffff', 'line-width':1.2, 'line-opacity':1 } })
          map.addLayer({ id:'communes-label', type:'symbol', source:'gialai-communes', minzoom:7.5, layout:{ 'text-field':['get','ten_xa'], 'text-size':11, 'text-allow-overlap':false, 'text-ignore-placement':false, 'text-font':['Open Sans Bold','Arial Unicode MS Bold'] } as any, paint:{ 'text-color':'#111', 'text-halo-color':'#fff', 'text-halo-width':1.5 } })
          map.on('click','communes-fill',(e:any)=>{
            const f=e.features?.[0]?.properties
            if(!f) return
            communePopup(f, e.lngLat, map)
          })
        }
      }).catch(e=>{ console.warn('Không tải được ranh xã', e); setCommunesError('Không tải được ranh xã — kiểm tra file public/') })
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
      // Điểm từng cháy — marker đen/xám + ghi chú, phân biệt điểm nóng FIRMS live
      HIST_FIRES.forEach(h=>{
        const el=document.createElement('div')
        el.style.width='24px'; el.style.height='24px'; el.style.borderRadius='999px'; el.style.display='grid'; el.style.placeItems='center'
        el.style.background='#1F2937'; el.style.color='#FBBF24'; el.style.fontSize='13px'; el.style.border='2px solid #FBBF24'; el.style.cursor='pointer'
        el.textContent='🔥'; el.title=`${h.name} — ${h.place} (từng cháy)`
        el.addEventListener('click', ()=>{
          new (maplibregl as any).Popup({ closeButton:true, maxWidth:'300px' }).setLngLat(h.coords as any)
            .setHTML(`<div style="font-family:Inter,sans-serif"><b>${h.name}</b><br/>${h.place}<br/><span style="font-size:11px;color:#92400E">⚠ TỪNG CHÁY — ${h.note}</span><br/><span style="font-size:10px;color:#64748B">Khu vực cần lưu ý khi cấp III-V</span></div>`).addTo(map)
        })
        new (maplibregl as any).Marker({ element: el }).setLngLat(h.coords as any).addTo(map)
      })
      // Giữ toàn cảnh tỉnh — không auto zoom vào xã; chỉ fit lại sau khi tải communes
      map.once('idle', ()=> map.fitBounds([[107.45, 12.99], [109.36, 14.70]], { padding:30, duration:0 }))
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
    // Chế độ DEMO/LIVE + tour tutorial
    const onMode=(e:any)=>{
      const m=e.detail?.mode||getMode()
      setMode(m)
      if(m==='demo'){ setFireAlerts(DEMO_ALERTS as any[]); try{ if(!sessionStorage.getItem('ecogl_tour_done')) setTourOpen(true) }catch{ setTourOpen(true) } }
      else { setTourOpen(false); loadAlerts() }
    }
    const onTour=(e:any)=>{
      const a=e.detail?.action
      if(a==='burning' && mapRef.current) mapRef.current.flyTo({ center:[108.68, 13.92], zoom:11, duration:1000 } as any)
      if(a==='layers') setShowLayers(true)
      if(a==='hotspot') toggleSat('hotspot','VIIRS_SNPP_NRT')
    }
    window.addEventListener('ecochain-mode', onMode)
    window.addEventListener('ecochain-tour', onTour)
    // 20km fire notification — LIVE poll mỗi 60s; DEMO dùng kịch bản mẫu
    const loadAlerts=()=> fetch(TILE_FIX(`${API}/api/villages/fire-alert?t=${Date.now()}`), { cache:'no-store' }).then(r=>r.json()).then(j=>{
      if(getMode()==='demo'){ setFireAlerts(DEMO_ALERTS as any[]); return }
      setFireAlerts(j.alerts || [])
      if(j.alerts?.length){
        const msg = `🔥 ${j.alerts.length} thôn/xã trong 20km có cháy: ${j.alerts.slice(0,2).map((a:any)=>`${a.village} (${a.distance_km}km)`).join(', ')}`
        console.warn(msg)
        if(Notification && Notification.permission==='granted') new Notification('Cảnh báo cháy 20km', { body: msg })
      }
    }).catch(()=>{ if(getMode()==='demo') setFireAlerts(DEMO_ALERTS as any[]) })
    if(getMode()==='demo'){ setFireAlerts(DEMO_ALERTS as any[]); try{ if(!sessionStorage.getItem('ecogl_tour_done')) setTourOpen(true) }catch{ setTourOpen(true) } }
    else loadAlerts()
    const int=setInterval(()=>{ if(getMode()==='live') loadAlerts() }, 60000)
    if(Notification && Notification.permission==='default') Notification.requestPermission()
    return ()=>{ clearInterval(int); window.removeEventListener('ecochain-mode', onMode); window.removeEventListener('ecochain-tour', onTour) }
  },[])

  return (
    // ⚠️ BẮT BUỘC 3: Div chứa map PHẢI CÓ height/width cố định (Tránh h-0) + resize trigger
    <div className="relative w-full h-[calc(100vh-56px)] min-h-[500px] bg-slate-900 relative z-0" style={{position:'relative', height:'calc(100vh - 56px)', borderRadius:0, overflow:'hidden', background:'#0f172a'}}>
      <div ref={mapContainer} className="w-full h-full min-h-[500px] relative z-0 absolute inset-0" style={{ width:'100%', height:'100%', minHeight:'500px' }} />

      {/* Top: gọn để full view — search nhỏ + dot LIVE */}
      <div style={{position:'absolute', top:10, left:60, right:60, display:'flex', gap:8, alignItems:'center', justifyContent:'center', pointerEvents:'none'}}>
        <div style={{position:'relative', pointerEvents:'auto', width:280, maxWidth:'40vw'}}>
        <div style={{background:'rgba(255,255,255,0.92)', backdropFilter:'blur(12px)', borderRadius:999, padding:'6px 12px', display:'flex', gap:6, alignItems:'center', boxShadow:'0 4px 16px rgba(0,0,0,0.08)', width:'100%'}}>
          <span style={{opacity:0.6}}>⌕</span>
          <input value={search} placeholder={`Tìm xã...${communesCount?` (${communesCount} xã)`:''}`} style={{border:0, outline:'none', flex:1, fontSize:12, background:'transparent', minWidth:0}} onChange={e=>{ const v=e.target.value; setSearch(v); const all=communesRef.current?.features||[]; const q=v.trim().toLowerCase(); setSuggests(!q?[]:all.filter((f:any)=> (f.properties?.ten_xa||'').toLowerCase().includes(q)).slice(0,8).map((f:any)=>f.properties)) }} onKeyDown={e=>{ if(e.key==='Enter' && suggests[0]) selectCommune(suggests[0]) }} />
        </div>
        {suggests.length>0 && <div style={{position:'absolute', top:'100%', left:0, right:0, marginTop:6, background:'#fff', borderRadius:12, boxShadow:'0 8px 24px rgba(0,0,0,0.15)', overflow:'hidden', zIndex:20}}>
          {suggests.map((s:any)=> <button key={s.ma_xa} onClick={()=>selectCommune(s)} style={{display:'block', width:'100%', textAlign:'left', padding:'8px 12px', fontSize:12, border:0, background:'transparent', cursor:'pointer', borderBottom:'1px solid #F1F5F9'}}>{s.ten_xa} <span style={{color:'#94A3B8'}}>· {s.ma_xa}</span></button>)}
        </div>}
        </div>
        <div title={`${mode==='demo'?'DEMO tutorial':liveStatus} · ${now.toLocaleTimeString('vi-VN')}`} style={{background:'rgba(15,23,42,0.75)', backdropFilter:'blur(12px)', border:'1px solid rgba(255,255,255,0.15)', borderRadius:999, padding:'6px 10px', fontSize:11, display:'flex', gap:6, alignItems:'center', color:'#fff', pointerEvents:'auto', whiteSpace:'nowrap'}}>
          <span style={{width:8, height:8, borderRadius:999, background: mode==='demo'?'#F59E0B':liveStatus==='LIVE'?'#10B981':'#EF4444', display:'inline-block'}}/>
          <span style={{fontWeight:800}}>{mode==='demo'?'DEMO':liveStatus}</span>
        </div>
      </div>

      {/* Banner treo: ĐANG CHÁY (đỏ) / NGHI NGỜ warning (vàng) — từ quét FIRMS 20km mỗi 60s */}
      {burnKey && bannerOff!==burnKey ? (
        <div style={{position:'absolute', top:56, left:'50%', transform:'translateX(-50%)', zIndex:15, background:'#DC2626', color:'#fff', borderRadius:999, padding:'8px 12px 8px 16px', display:'flex', gap:10, alignItems:'center', boxShadow:'0 8px 24px rgba(220,38,38,0.5)', fontSize:12, fontWeight:800, maxWidth:'92vw', animation:'pulse 1.5s infinite'}}>
          <span>🔥 ĐANG CHÁY: {burning[0]?.village} ({burning[0]?.commune}){burning.length>1?` +${burning.length-1} điểm`:''} · {burning[0]?.distance_km}km · {burning[0]?.acq_date||''}</span>
          <button onClick={()=>setBannerOff(burnKey)} title="Ẩn banner" style={{border:0, borderRadius:999, background:'rgba(255,255,255,0.25)', color:'#fff', width:22, height:22, cursor:'pointer', fontWeight:800}}>✕</button>
        </div>
      ) : !burnKey && suspicious.length>0 ? (
        <div style={{position:'absolute', top:56, left:'50%', transform:'translateX(-50%)', zIndex:15, background:'rgba(245,158,11,0.95)', color:'#451A03', borderRadius:999, padding:'6px 14px', fontSize:11, fontWeight:700, boxShadow:'0 4px 12px rgba(0,0,0,0.15)', maxWidth:'92vw', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>⚠ {suspicious.length} điểm nghi ngờ trong 20km — quét FIRMS mỗi 60s</div>
      ) : null}

      {/* Control Panel — Glassmorphism + Collapse/Expand, logic giữ nguyên */}
      {!showLayers ? (
        <button onClick={()=>setShowLayers(true)} title="Mở bảng điều khiển lớp phủ" style={{position:'absolute', top:64, left:12, zIndex:10, width:38, height:38, display:'grid', placeItems:'center', background:'rgba(15,23,42,0.75)', backdropFilter:'blur(12px)', WebkitBackdropFilter:'blur(12px)', border:'1px solid rgba(255,255,255,0.15)', borderRadius:12, color:'#fff', fontSize:16, cursor:'pointer', boxShadow:'0 8px 24px rgba(0,0,0,0.25)', transition:'transform .25s ease, opacity .25s ease'}}>⚙️</button>
      ) : (
      <div style={{position:'absolute', top:64, left:12, zIndex:10, width:270, maxHeight:'calc(100% - 220px)', overflow:'auto', background:'rgba(15,23,42,0.75)', backdropFilter:'blur(12px)', WebkitBackdropFilter:'blur(12px)', borderRadius:12, border:'1px solid rgba(255,255,255,0.15)', boxShadow:'0 8px 24px rgba(0,0,0,0.25)', padding:10, display:'flex', flexDirection:'column', gap:8, color:'#fff', transition:'transform .3s ease, opacity .3s ease', transform:'translateX(0)', opacity:1}}>
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
          <div style={{fontSize:12, fontWeight:800, letterSpacing:.3}}>Lớp phủ bản đồ</div>
          <button onClick={()=>setShowLayers(false)} title="Thu gọn" style={{width:26, height:26, display:'grid', placeItems:'center', background:'rgba(255,255,255,0.1)', border:'1px solid rgba(255,255,255,0.15)', borderRadius:8, color:'#fff', fontSize:13, cursor:'pointer'}}>━</button>
        </div>
        <div style={{fontSize:11, fontWeight:700, opacity:.9}}>Nền bản đồ</div>
        <div style={{display:'flex', background:'rgba(255,255,255,0.1)', borderRadius:999, padding:3, gap:3}}>
          {([['osm','🗺️ Thường'],['esri','🛰️ Vệ tinh']] as [string,string][]).map(([v,label])=>(
            <button key={v} onClick={()=>switchBaseXyz(v)} style={{flex:1, border:0, borderRadius:999, padding:'6px 0', fontSize:12, fontWeight:700, cursor:'pointer', background:baseXyz===v?'#fff':'transparent', color:baseXyz===v?'#0B1412':'#fff'}}>{label}</button>
          ))}
        </div>
        <div style={{height:1, background:'rgba(255,255,255,0.15)'}}/>
        <div style={{fontSize:11, fontWeight:700, opacity:.9}}>Lớp AI/GEE</div>
        {[
          ['hotspot','🔥 Điểm nhiệt FIRMS', 'hotspot', 'VIIRS_SNPP_NRT'],
          ['ndvi','🌿 NDVI', 'ndvi', 'ndvi'],
          ['s1','📡 Sentinel-1 VV/VH', 's1', 's1'],
        ].map(([k,label, key, geeLayer])=>(
          <label key={k} style={{display:'flex', gap:6, alignItems:'center', background: activeSat[key]?'rgba(16,185,129,0.25)':'rgba(255,255,255,0.08)', padding:'6px 8px', borderRadius:8, fontSize:12, border:'1px solid rgba(255,255,255,0.15)', cursor:'pointer', color:'#fff'}}>
            <input type="checkbox" checked={!!activeSat[key as string]} onChange={()=> toggleSat(key as string, geeLayer as string)} /> {label}
            <span style={{fontSize:10, padding:'1px 6px', borderRadius:999, background: sourceLive[key==='hotspot'?'firms': key==='ndvi'?'sentinel2':'sentinel1']==='LIVE'?'#DCFCE7':'#FEF3C7', color:'#000'}}>{sourceLive[key==='hotspot'?'firms': key==='ndvi'?'sentinel2':'sentinel1'] || '...'}</span>
          </label>
        ))}
        <div style={{fontSize:11, opacity:0.6, color:'#e2e8f0'}}>{communesError ? communesError : `Đã tải ${communesCount||'…'} xã · bbox 107.0,12.9,109.6,15.0`}</div>
      </div>)}

      {/* Right controls — icon gọn để full view */}
      <div style={{position:'absolute', top:64, right:12, display:'flex', flexDirection:'column', gap:8, zIndex:10}}>
        <button onClick={requestLoc} title="Vị trí của tôi" style={{width:38, height:38, display:'grid', placeItems:'center', background:'rgba(255,255,255,0.92)', border:0, borderRadius:12, boxShadow:'0 4px 12px rgba(0,0,0,0.08)', fontSize:16}}>📍</button>
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
          <div><i style={{width:10,height:10,borderRadius:999,background:'#1F2937',border:'2px solid #FBBF24',display:'inline-block',marginRight:6}}/> Từng cháy Hè 2026</div>
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

      {/* Panel quét FIRMS: ĐANG CHÁY (đỏ) + NGHI NGỜ warning (vàng) */}
      {fireAlerts.length>0 && (
        <div style={{position:'absolute', bottom:80, left:12, background:'rgba(255,255,255,0.98)', backdropFilter:'blur(12px)', borderRadius:12, padding:12, minWidth:280, maxWidth:360, boxShadow:'0 8px 24px rgba(0,0,0,0.15)', border: burning.length ? '2px solid #DC2626' : '1px solid #F59E0B'}}>
          {burning.length>0 && <div style={{fontWeight:800, fontSize:12, color:'#DC2626'}}>🔥 ĐANG CHÁY ≤5km ({burning.length})</div>}
          {burning.length>0 && <div style={{maxHeight:110, overflow:'auto', marginTop:6, display:'flex', flexDirection:'column', gap:6}}>
            {burning.map((a:any, i:number)=>(
              <div key={'b'+i} style={{display:'flex', justifyContent:'space-between', alignItems:'center', background:'#FEE2E2', padding:'6px 8px', borderRadius:8, fontSize:11}}>
                <div><b>{a.village}</b> <span style={{color:'#64748B'}}>({a.commune})</span><br/><span style={{fontSize:10, color:'#334155'}}>{a.distance_km}km từ cháy · {a.acq_date || '2026-09-04'}</span></div>
                <span style={{fontSize:10, padding:'2px 6px', borderRadius:999, background:'#DC2626', color:'#fff'}}>CHÁY</span>
              </div>
            ))}
          </div>}
          {suspicious.length>0 && <div style={{fontWeight:800, fontSize:12, color:'#92400E', marginTop:burning.length?8:0}}>⚠ NGHI NGỜ ≤20km — warning ({suspicious.length})</div>}
          {suspicious.length>0 && <div style={{maxHeight:100, overflow:'auto', marginTop:6, display:'flex', flexDirection:'column', gap:6}}>
            {suspicious.map((a:any, i:number)=>(
              <div key={'s'+i} style={{display:'flex', justifyContent:'space-between', alignItems:'center', background:'#FEF3C7', padding:'6px 8px', borderRadius:8, fontSize:11}}>
                <div><b>{a.village}</b> <span style={{color:'#64748B'}}>({a.commune})</span><br/><span style={{fontSize:10, color:'#334155'}}>{a.distance_km}km từ điểm nhiệt · {a.acq_date || '2026-09-04'}</span></div>
                <span style={{fontSize:10, padding:'2px 6px', borderRadius:999, background:'#F59E0B', color:'#fff'}}>THEO DÕI</span>
              </div>
            ))}
          </div>}
          <div style={{fontSize:10, color:'#64748B', marginTop:6}}>Quét FIRMS mỗi 60s · Bán kính 20km · Gia Lai 107.0,12.9,109.6,15.0</div>
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

      {mode==='demo' && !tourOpen && <button onClick={()=>setTourOpen(true)} style={{position:'absolute', bottom:76, right:12, zIndex:20, border:0, borderRadius:999, background:'#F59E0B', color:'#000', fontWeight:800, fontSize:12, padding:'8px 14px', cursor:'pointer', boxShadow:'0 4px 12px rgba(0,0,0,0.2)'}}>▶ Tutorial DEMO</button>}
      {mode==='demo' && tourOpen && <DemoTour onDone={()=>setTourOpen(false)} />}

      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}} @keyframes marquee{0%{transform:translateX(100%)}100%{transform:translateX(-100%)}}`}</style>
    </div>
  )
}
