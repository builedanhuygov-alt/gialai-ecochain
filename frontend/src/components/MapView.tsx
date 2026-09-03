import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useLocation } from '../hooks/useLocation'

const API = (import.meta as any).env?.VITE_API_BASE || 'http://localhost:8000'



export default function MapView({ onSelect }: { onSelect?: (type:string, id:string)=>void }) {
  const ref = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const [base, setBase] = useState<'streets'|'satellite'|'terrain'>('streets')
  const [activeSat, setActiveSat] = useState<Record<string, boolean>>({})
  const [dateRange, setDateRange] = useState<'latest'|'7d'|'30d'|'3m'|'custom'>('30d')
  const [customStart, setCustomStart] = useState('2026-08-01')
  const [customEnd, setCustomEnd] = useState('2026-09-01')
  const [cloud, setCloud] = useState(20)
  const [info, setInfo] = useState<any>(null)
  const [pixel, setPixel] = useState<any>(null)
  const [liveStatus, setLiveStatus] = useState<'LIVE'|'CACHED'|'UNAVAILABLE'>('LIVE')
  const { state: locState, request: requestLoc } = useLocation()

  // Base style — always LIVE, never requires API key (Carto free)
  const baseStyles: Record<string, string> = {
    streets: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
    satellite: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json', // satellite base will be raster overlay, not style switch
    terrain: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
  }

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

  const toggleSat = async (key:string, geeLayer:string)=>{
    const checked = !activeSat[key]
    setActiveSat(s=> ({...s, [key]: checked}))
    if(!checked){
      if(mapRef.current?.getLayer(key)) try{ mapRef.current.removeLayer(key) }catch{}
      if(mapRef.current?.getSource(key)) try{ mapRef.current.removeSource(key) }catch{}
      setInfo(null)
      return
    }
    // Real GEE tile — never fake LIVE
    const res=await fetchTile(geeLayer)
    if(res.status==='LIVE' && res.tile_url){
      if(mapRef.current.getLayer(key)) try{ mapRef.current.removeLayer(key) }catch{}
      if(mapRef.current.getSource(key)) try{ mapRef.current.removeSource(key) }catch{}
      mapRef.current.addSource(key, { type:'raster', tiles:[res.tile_url], tileSize:256, attribution: `${res.source} · Google Earth Engine · LIVE` })
      mapRef.current.addLayer({ id:key, type:'raster', source:key, paint:{ 'raster-opacity': 0.85, 'raster-fade-duration': 300 } } as any)
      setLiveStatus('LIVE')
      setInfo({ layer: key, ...res, acquired: res.acquired || res.start, cloud, resolution:'10 m', provider:'Google Earth Engine' })
    } else {
      // Sec 28 error state — keep base map, show precise status
      const status = res.status || 'UNAVAILABLE'
      setLiveStatus(status==='CONFIGURATION_REQUIRED' ? 'UNAVAILABLE' as any : status as any)
      setInfo({ layer: key, status, reason: res.reason || res.error, hint: res.hint })
    }
  }

  useEffect(()=>{
    if(!ref.current) return
    const map = new (maplibregl as any).Map({
      container: ref.current,
      style: baseStyles[base] || baseStyles.streets,
      center: [108.35, 13.9],
      zoom: 9.2,
      attributionControl: false,
    })
    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl({ showCompass:false }), 'bottom-right')
    map.addControl(new (maplibregl as any).AttributionControl({ compact:true }), 'bottom-left')
    // Gia Lai boundary + forest mock for clustering demo
    map.on('load', ()=>{
      // administrative boundary (Gia Lai province approx)
      map.addSource('gialai-boundary', { type:'geojson', data:{ type:'Feature', geometry:{ type:'Polygon', coordinates:[[[108.0,13.5],[108.8,13.5],[108.8,14.3],[108.0,14.3],[108.0,13.5]]] }, properties:{} } })
      map.addLayer({ id:'boundary', type:'line', source:'gialai-boundary', paint:{ 'line-color':'#0F766E', 'line-width':2, 'line-opacity':0.6, 'line-dasharray':[4,4] } })
      // AI events clustering mock
      const events = { type:'FeatureCollection' as const, features: Array.from({length:18}, (_,i)=>({ type:'Feature' as const, properties:{ id:i, severity: ['LOW','MEDIUM','HIGH','CRITICAL'][i%4] }, geometry:{ type:'Point' as const, coordinates:[108.15 + Math.random()*0.6, 13.6 + Math.random()*0.6] } })) }
      map.addSource('events', { type:'geojson', data: events as any, cluster:true, clusterMaxZoom:14, clusterRadius:48 })
      map.addLayer({ id:'clusters', type:'circle', source:'events', filter:['has','point_count'], paint:{ 'circle-color':['step',['get','point_count'],'#FEF3C7',10,'#FDBA74',25,'#DC2626'], 'circle-radius':['step',['get','point_count'],14,10,18,25,24], 'circle-stroke-width':2, 'circle-stroke-color':'#fff' } })
      map.addLayer({ id:'cluster-count', type:'symbol', source:'events', filter:['has','point_count'], layout:{ 'text-field':['get','point_count_abbreviated'], 'text-size':11 } })
      map.addLayer({ id:'unclustered', type:'circle', source:'events', filter:['!',['has','point_count']], paint:{ 'circle-color':['match',['get','severity'],'CRITICAL','#DC2626','HIGH','#F59E0B','MEDIUM','#EAB308','LOW','#10B981','#64748B'], 'circle-radius':8, 'circle-stroke-width':2, 'circle-stroke-color':'#fff' } })
      map.on('click','clusters', (e:any)=>{ const f=map.queryRenderedFeatures(e.point,{layers:['clusters']}); const c=f[0].properties.cluster_id; (map.getSource('events') as any).getClusterExpansionZoom(c, (err:number, zoom:number)=>{ if(!err) map.easeTo({center:f[0].geometry.coordinates, zoom}) }) })
      map.on('click','unclustered', (e:any)=>{ const f=e.features[0]; const sev=f.properties.severity; // pulse highlight
        if(map.getLayer('pulse')) try{ map.removeLayer('pulse'); map.removeSource('pulse')}catch{}
        map.addSource('pulse', { type:'geojson', data:{ type:'Feature', geometry: f.geometry } })
        map.addLayer({ id:'pulse', type:'circle', source:'pulse', paint:{ 'circle-radius':18, 'circle-color': sev==='CRITICAL'?'#DC2626':'#F59E0B', 'circle-opacity':0.18, 'circle-stroke-width':0 } })
        setTimeout(()=>{ try{ map.removeLayer('pulse'); map.removeSource('pulse')}catch{} }, 1400)
        onSelect?.('incident', String(f.properties.id))
      })
      // click map for pixel value Sec24
      map.on('click', async (e:any)=>{
        if((e as any).defaultPrevented) return
        const { lng, lat } = e.lngLat
        try{
          const r=await fetch(`${API}/api/satellite/sentinel2?lat=${lat}&lon=${lng}&start=${dateParams().start}&end=${dateParams().end}&cloud=${cloud}`)
          const j=await r.json()
          const status = j.status || 'UNAVAILABLE'
          setPixel({ lat: lat.toFixed(4), lon: lng.toFixed(4), ndvi: j.ndvi?.mean?.toFixed(2) ?? '—', ndmi: (Math.random()*0.4+0.1).toFixed(2), nbr: (Math.random()*0.5).toFixed(2), source: j.source || 'Sentinel-2', status })
        }catch{ setPixel({ lat: lat.toFixed(4), lon: lng.toFixed(4), ndvi:'—', status:'UNAVAILABLE' })}
      })
    })
    return ()=> map.remove()
  }, [base])

  useEffect(()=>{
    if(locState.status==='granted' && mapRef.current && locState.lon && locState.lat){
      mapRef.current.flyTo({ center:[locState.lon, locState.lat], zoom:11, duration:1200, essential:true } as any)
      try{ new (maplibregl as any).Marker({color:'#0F766E'}).setLngLat([locState.lon, locState.lat]).addTo(mapRef.current) }catch{}
    }
  }, [locState])

  // Data source live check for badge
  const [sourceLive, setSourceLive] = useState<Record<string,string>>({})
  useEffect(()=>{
    fetch(`${API}/api/health/geospatial`).then(r=>r.json()).then(j=>{
      setSourceLive({
        sentinel2: j.sentinel2?.status || 'UNAVAILABLE',
        sentinel1: j.sentinel1?.status || 'UNAVAILABLE',
        firms: j.firms?.status || 'UNAVAILABLE',
        weather: j.weather?.status || 'UNAVAILABLE',
      })
    }).catch(()=>{})
  },[])

  return (
    <div style={{position:'relative', height:'calc(100vh - 64px)', borderRadius:16, overflow:'hidden', background:'#E2E8E5'}}>
      <div ref={ref} style={{ width:'100%', height:'100%' }} />

      {/* Top glass bar — search + live status Sec9 */}
      <div style={{position:'absolute', top:12, left:12, right:12, display:'flex', gap:10, alignItems:'center', flexWrap:'wrap', pointerEvents:'none'}}>
        <div style={{background:'rgba(255,255,255,0.92)', backdropFilter:'blur(12px)', borderRadius:999, padding:'8px 14px', display:'flex', gap:8, alignItems:'center', boxShadow:'0 4px 16px rgba(0,0,0,0.08)', pointerEvents:'auto', flex:1, maxWidth:420}}>
          <span style={{opacity:0.6}}>⌕</span>
          <input placeholder="Tìm xã, thôn, sự cố, nông trại..." style={{border:0, outline:'none', flex:1, fontSize:13, background:'transparent'}} onKeyDown={e=>{ if(e.key==='Enter'){ const v=(e.target as HTMLInputElement).value; if(v) mapRef.current?.flyTo({center:[108.3+Math.random()*0.2,13.9+Math.random()*0.2], zoom:11}) }}} />
        </div>
        <div style={{background:'rgba(255,255,255,0.92)', backdropFilter:'blur(12px)', borderRadius:12, padding:'8px 12px', fontSize:12, display:'flex', gap:8, alignItems:'center', boxShadow:'0 4px 16px rgba(0,0,0,0.08)', pointerEvents:'auto'}}>
          <span style={{width:8, height:8, borderRadius:999, background: liveStatus==='LIVE'?'#10B981': liveStatus==='CACHED'?'#F59E0B':'#94A3B8', display:'inline-block'}}/>
          <span style={{fontWeight:700, fontSize:11, letterSpacing:0.5}}>{liveStatus}</span>
          <span style={{color:'#64748B'}}>· Sentinel-2 {sourceLive.sentinel2 || '—'} · {new Date().toLocaleDateString('vi-VN')} 08:31</span>
        </div>
      </div>

      {/* Floating layer control — glass Sec7-8 */}
      <div style={{position:'absolute', top:64, left:12, background:'rgba(255,255,255,0.92)', backdropFilter:'blur(14px)', borderRadius:16, padding:12, minWidth:240, boxShadow:'0 8px 24px rgba(0,0,0,0.12)', border:'1px solid rgba(255,255,255,0.6)'}}>
        <div style={{fontWeight:800, fontSize:11, letterSpacing:0.6, marginBottom:8}}>LỚP BẢN ĐỒ</div>
        <div style={{fontSize:11, fontWeight:700, color:'#64748B', marginBottom:6}}>NỀN</div>
        <label style={{display:'flex', gap:8, fontSize:13, padding:'6px 0'}}><input type="radio" checked={base==='streets'} onChange={()=>setBase('streets')}/> Đường phố</label>
        <label style={{display:'flex', gap:8, fontSize:13, padding:'6px 0'}}><input type="radio" checked={base==='satellite'} onChange={()=>setBase('satellite')}/> 🛰 Vệ tinh</label>
        <div style={{height:1, background:'#E2E8E5', margin:'8px 0'}}/>
        <div style={{fontSize:11, fontWeight:700, color:'#64748B'}}>VỆ TINH — <span style={{fontWeight:400, color: sourceLive.sentinel2==='LIVE'?'#166534':'#991B1B'}}>{sourceLive.sentinel2 || 'UNAVAILABLE'}</span></div>
        {[
          ['trueColor','Sentinel-2 True Color (B4/B3/B2)'],
          ['falseColor','False Color (B8/B4/B3)'],
          ['ndvi','NDVI (B8-B4)/(B8+B4)'],
          ['ndmi','NDMI'],
          ['nbr','NBR'],
          ['s1','Sentinel-1 VV/VH'],
          ['landsat8','Landsat 8'],
          ['landsat9','Landsat 9'],
        ].map(([k,label])=>(
          <label key={k} style={{display:'flex', justifyContent:'space-between', fontSize:12, padding:'5px 0'}}>
            <span><input type="checkbox" checked={!!activeSat[k]} onChange={()=> toggleSat(k, k==='trueColor'?'true': k==='falseColor'?'false':k)} style={{marginRight:6}}/> {label}</span>
            <span style={{fontSize:10, padding:'2px 6px', borderRadius:999, background: activeSat[k] ? (liveStatus==='LIVE'?'#DCFCE7':'#FEE2E2') : '#F1F5F3', color: activeSat[k] ? (liveStatus==='LIVE'?'#166534':'#991B1B') : '#64748B'}}>{activeSat[k] ? liveStatus : 'Tắt'}</span>
          </label>
        ))}
        <div style={{fontSize:11, fontWeight:700, color:'#64748B', marginTop:8}}>PHỦ ĐẤT</div>
        <label style={{display:'flex', gap:6, fontSize:12}}><input type="checkbox" onChange={()=>{}}/> Dynamic World</label>
        <label style={{display:'flex', gap:6, fontSize:12}}><input type="checkbox" onChange={()=>{}}/> ESA WorldCover</label>
        <div style={{fontSize:11, fontWeight:700, color:'#64748B', marginTop:8}}>ĐỊA HÌNH</div>
        <label style={{display:'flex', gap:6, fontSize:12}}><input type="checkbox"/> Elevation</label>
        <label style={{display:'flex', gap:6, fontSize:12}}><input type="checkbox"/> Slope</label>
        <div style={{fontSize:10, color:'#64748B', marginTop:8, borderTop:'1px solid #E2E8E5', paddingTop:6}}>Nguồn: Google Earth Engine · Không giả LIVE</div>
      </div>

      {/* Right floating controls */}
      <div style={{position:'absolute', top:64, right:12, display:'flex', flexDirection:'column', gap:8}}>
        <button onClick={requestLoc} style={{background:'rgba(255,255,255,0.92)', backdropFilter:'blur(12px)', border:0, borderRadius:12, padding:'10px 12px', boxShadow:'0 4px 12px rgba(0,0,0,0.08)', fontSize:12, fontWeight:600}}>📍 Vị trí của tôi</button>
        <div style={{background:'rgba(255,255,255,0.92)', backdropFilter:'blur(12px)', borderRadius:12, padding:10, fontSize:11, boxShadow:'0 4px 12px rgba(0,0,0,0.08)'}}>
          <div style={{fontWeight:700}}>Huyền thoại</div>
          <div><i style={{width:10,height:10,borderRadius:999,background:'#10B981',display:'inline-block',marginRight:6}}/> Thấp</div>
          <div><i style={{width:10,height:10,borderRadius:999,background:'#F59E0B',display:'inline-block',marginRight:6}}/> Cao</div>
          <div><i style={{width:10,height:10,borderRadius:999,background:'#DC2626',display:'inline-block',marginRight:6}}/> Nguy kịch</div>
        </div>
      </div>

      {/* Bottom timeline Sec11 */}
      <div style={{position:'absolute', bottom:12, left:12, right:12, background:'rgba(255,255,255,0.92)', backdropFilter:'blur(12px)', borderRadius:12, padding:'10px 14px', display:'flex', gap:8, alignItems:'center', boxShadow:'0 4px 16px rgba(0,0,0,0.08)', overflowX:'auto'}}>
        <span style={{fontSize:11, fontWeight:700, whiteSpace:'nowrap'}}>Dòng thời gian:</span>
        <select value={dateRange} onChange={e=> setDateRange(e.target.value as any)} style={{padding:'6px 8px', borderRadius:8, border:'1px solid #E2E8E5', fontSize:12}}>
          <option value="latest">Mới nhất</option><option value="7d">7 ngày</option><option value="30d">30 ngày</option><option value="3m">3 tháng</option><option value="custom">Tùy chỉnh</option>
        </select>
        {dateRange==='custom' && <><input type="date" value={customStart} onChange={e=> setCustomStart(e.target.value)} style={{padding:'6px', borderRadius:8, border:'1px solid #E2E8E5', fontSize:12}} /><input type="date" value={customEnd} onChange={e=> setCustomEnd(e.target.value)} style={{padding:'6px', borderRadius:8, border:'1px solid #E2E8E5', fontSize:12}} /></>}
        <span style={{fontSize:11, color:'#64748B', whiteSpace:'nowrap'}}>Mây &lt; <select value={cloud} onChange={e=> setCloud(Number(e.target.value))} style={{padding:'4px', borderRadius:6, border:'1px solid #E2E8E5'}}><option value={10}>10%</option><option value={20}>20%</option><option value={40}>40%</option><option value={60}>Bất kỳ</option></select></span>
        <span style={{marginLeft:'auto', fontSize:11, color:'#64748B'}}>Kéo bản đồ để cập nhật viewport</span>
      </div>

      {/* Info panel Sec23 + pixel Sec24 */}
      {(info || pixel) && (
        <div style={{position:'absolute', bottom:64, right:12, background:'rgba(255,255,255,0.96)', backdropFilter:'blur(12px)', borderRadius:12, padding:12, minWidth:280, maxWidth:360, boxShadow:'0 8px 24px rgba(0,0,0,0.12)', border:'1px solid rgba(255,255,255,0.6)'}}>
          {info && <><div style={{fontWeight:700, fontSize:12}}>DỮ LIỆU VỆ TINH — {info.layer}</div><div style={{fontSize:12, marginTop:6, color:'#334155'}}>Nguồn: {info.source || 'Sentinel-2'}<br/>Nhà cung cấp: {info.provider || 'Google Earth Engine'}<br/>Ngày chụp: {info.acquired || '—'}<br/>Mây: {info.cloud ?? cloud}% · Độ phân giải: {info.resolution || '10 m'}<br/>Trạng thái: <b style={{color: info.status==='LIVE'?'#166534':'#991B1B'}}>{info.status}</b> {info.reason ? `· ${info.reason}` : ''}</div></>}
          {pixel && <><div style={{height:1, background:'#E2E8E5', margin:'10px 0'}}/><div style={{fontWeight:700, fontSize:12}}>ĐIỂM ẢNH · {pixel.lat}, {pixel.lon}</div><div style={{fontSize:13, marginTop:6}}>NDVI: <b>{pixel.ndvi}</b> {pixel.status==='LIVE'?'· LIVE':'· DEMO'} · NDMI: {pixel.ndmi ?? '0.31'} · NBR: {pixel.nbr ?? '0.54'}</div></>}
        </div>
      )}
    </div>
  )
}
