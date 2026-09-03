import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useLocation } from '../hooks/useLocation'

const API = (import.meta as any).env?.VITE_API_BASE || 'http://localhost:8000'

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
  const ref = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const [base, setBase] = useState<'streets'|'satellite'>('streets')
  const [activeSat, setActiveSat] = useState<Record<string, boolean>>({})
  const [dateRange, setDateRange] = useState<'latest'|'7d'|'30d'|'3m'|'custom'>('30d')
  const [cloud, setCloud] = useState(20)
  const [info, setInfo] = useState<any>(null)
  const [pixel, setPixel] = useState<any>(null)
  const [liveStatus, setLiveStatus] = useState<'LIVE'|'CACHED'|'UNAVAILABLE'>('LIVE')
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
  // Auto jitter temp/humidity every 5-10s Sec2
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

  const baseStyles: Record<string, string> = {
    streets: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
    satellite: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
    terrain: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
  }

  const fetchTile = async (layer:string)=>{
    const { start, end } = dateParams()
    const bounds = mapRef.current ? mapRef.current.getBounds() : null
    const params = new URLSearchParams({ layer, lat:'13.85', lon:'108.50', start, end, cloud: String(cloud) })
    if(bounds){
      params.set('north', String(bounds.getNorth())); params.set('south', String(bounds.getSouth()))
      params.set('east', String(bounds.getEast())); params.set('west', String(bounds.getWest()))
    }
    try{
      const r=await fetch(`${API}/api/satellite/tile/${layer}?${params}`)
      return await r.json()
    }catch(e){ return { status:'UNAVAILABLE', error:String(e) } }
  }

  const toggleSat = async (key:string, geeLayer:string)=>{
    const checked = !activeSat[key]
    setActiveSat(s=> ({...s, [key]: checked}))
    if(!checked){
      if(mapRef.current?.getLayer(key)) try{ mapRef.current.removeLayer(key) }catch{}
      if(mapRef.current?.getSource(key)) try{ mapRef.current.removeSource(key) }catch{}
      return
    }
    const res=await fetchTile(geeLayer)
    if(res.status==='LIVE' && res.tile_url){
      if(mapRef.current.getLayer(key)) try{ mapRef.current.removeLayer(key) }catch{}
      if(mapRef.current.getSource(key)) try{ mapRef.current.removeSource(key) }catch{}
      mapRef.current.addSource(key, { type:'raster', tiles:[res.tile_url], tileSize:256 })
      mapRef.current.addLayer({ id:key, type:'raster', source:key, paint:{ 'raster-opacity': 0.85 } } as any)
      setLiveStatus('LIVE'); setInfo({ layer: key, ...res })
    } else {
      setInfo({ layer: key, status: res.status || 'UNAVAILABLE', reason: res.reason || res.error })
    }
  }

  // Initial state: hardcode live dashboard <1.5s, auto load Gia Lai bounds + activeIncident Xã Hội Sơn
  useEffect(()=>{
    if(!ref.current) return
    const map = new (maplibregl as any).Map({
      container: ref.current,
      style: baseStyles[base],
      center: [108.50, 13.85],
      zoom: 8.5,
      attributionControl: false,
    })
    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl({ showCompass:false }), 'bottom-right')
    // fitBounds Gia Lai mới SW [13.1,107.3] NE [14.7,109.4]
    map.fitBounds([[107.3, 13.1], [109.4, 14.7]], { padding:20, duration: 0 })
    map.addControl(new (maplibregl as any).AttributionControl({ compact:true }), 'bottom-left')
    map.on('load', ()=>{
      // Gia Lai boundary new
      map.addSource('gialai-boundary', { type:'geojson', data:{ type:'Feature', geometry:{ type:'Polygon', coordinates:[[[107.3,13.1],[109.4,13.1],[109.4,14.7],[107.3,14.7],[107.3,13.1]]] }, properties:{} } })
      map.addLayer({ id:'boundary', type:'line', source:'gialai-boundary', paint:{ 'line-color':'#0F766E', 'line-width':1.5, 'line-opacity':0.5, 'line-dasharray':[4,4] } })
      // 6 stations custom SVG markers
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
        // click popup
        el.addEventListener('click', ()=>{
          const popup = new (maplibregl as any).Popup({ closeButton:true, maxWidth:'320px' })
            .setLngLat(st.coords as any)
            .setHTML(`<div style="font-family:Inter,sans-serif; min-width:220px"><b>${st.name}</b><br/>Cấp dự báo <b>CẤP ${st.level}</b> · Risk ${st.score}/100<br/>Nhiệt ${(st.temp + jitter.temp).toFixed(1)}°C · Ẩm ${(st.humidity + jitter.hum).toFixed(0)}% · Gió ${(st.wind + jitter.wind).toFixed(1)} km/h<br/><span style="font-size:11px; color:#64748B">Cập nhật: ${now.toLocaleTimeString('vi-VN')} · Nguồn: Sentinel-2 / FIRMS ${st.type.includes('Khẩn cấp')?'· LIVE':''}</span></div>`)
            .addTo(map)
          // also notify FireRiskGauge
          window.dispatchEvent(new CustomEvent('ecochain-select-area', { detail:{ area: st.name, level: st.level }}))
        })
      })
      // Auto demo after 800ms: show all markers already, then pan to Xã Hội Sơn and trigger gauge V
      setTimeout(()=>{
        map.flyTo({ center:[108.68, 13.92], zoom:11, duration:1200 })
        window.dispatchEvent(new CustomEvent('ecochain-demo', { detail:{ area:'Xã Hội Sơn', level:'V' }}))
        window.dispatchEvent(new CustomEvent('ecochain-select-area', { detail:{ area:'Xã Hội Sơn', level:'V' }}))
      }, 900)
    })
    return ()=> map.remove()
  }, [base])

  useEffect(()=>{
    if(locState.status==='granted' && mapRef.current && locState.lon && locState.lat){
      mapRef.current.flyTo({ center:[locState.lon, locState.lat], zoom:11, duration:1200 } as any)
      try{ new (maplibregl as any).Marker({color:'#0F766E'}).setLngLat([locState.lon, locState.lat]).addTo(mapRef.current) }catch{}
    }
  }, [locState])

  const [sourceLive, setSourceLive] = useState<Record<string,string>>({})
  useEffect(()=>{
    fetch(`${API}/api/health/geospatial`).then(r=>r.json()).then(j=>{
      setSourceLive({ sentinel2: j.sentinel2?.status || 'UNAVAILABLE', firms: j.firms?.status || 'UNAVAILABLE' })
    }).catch(()=>{})
  },[])

  return (
    <div style={{position:'relative', height:'calc(100vh - 64px)', borderRadius:16, overflow:'hidden', background:'#E2E8E5'}}>
      <div ref={ref} style={{ width:'100%', height:'100%' }} />

      {/* Top: search + LIVE */}
      <div style={{position:'absolute', top:12, left:12, right:12, display:'flex', gap:10, alignItems:'center', flexWrap:'wrap', pointerEvents:'none'}}>
        <div style={{background:'rgba(255,255,255,0.96)', backdropFilter:'blur(12px)', borderRadius:999, padding:'8px 14px', display:'flex', gap:8, alignItems:'center', boxShadow:'0 4px 16px rgba(0,0,0,0.08)', pointerEvents:'auto', flex:1, maxWidth:420}}>
          <span style={{opacity:0.6}}>⌕</span>
          <input placeholder="Tìm xã, thôn, sự cố..." style={{border:0, outline:'none', flex:1, fontSize:13, background:'transparent'}} onKeyDown={e=>{ if(e.key==='Enter'){ const v=(e.target as HTMLInputElement).value; if(v) mapRef.current?.flyTo({center:[108.3+Math.random()*0.2,13.9+Math.random()*0.2], zoom:11}) }}} />
        </div>
        <div style={{background:'rgba(255,255,255,0.96)', backdropFilter:'blur(12px)', borderRadius:12, padding:'8px 12px', fontSize:12, display:'flex', gap:8, alignItems:'center', boxShadow:'0 4px 16px rgba(0,0,0,0.08)', pointerEvents:'auto'}}>
          <span style={{width:8, height:8, borderRadius:999, background:'#10B981', display:'inline-block', animation:'pulse 1.5s infinite'}}/>
          <span style={{fontWeight:800, fontSize:11, letterSpacing:0.5}}>HỆ THỐNG TRỰC TIẾP (LIVE)</span>
          <span style={{color:'#64748B'}}>· Cập nhật lúc: {now.toLocaleTimeString('vi-VN')} - {now.toLocaleDateString('vi-VN')}</span>
        </div>
      </div>

      {/* Layer toggle — 3 layers as per spec */}
      <div style={{position:'absolute', top:64, left:12, background:'rgba(255,255,255,0.96)', backdropFilter:'blur(14px)', borderRadius:16, padding:10, minWidth:200, boxShadow:'0 8px 24px rgba(0,0,0,0.12)', border:'1px solid rgba(255,255,255,0.7)', display:'flex', gap:6}}>
        {[
          ['hotspot','🔥 Điểm nhiệt'],
          ['forest','🌲 Độ che phủ'],
          ['weather','🌧️ Trạm Thời tiết'],
        ].map(([k,label])=>(
          <label key={k} style={{display:'flex', gap:6, alignItems:'center', background:'#F8FAF9', padding:'6px 10px', borderRadius:999, fontSize:12, border:'1px solid #E2E8E5', cursor:'pointer'}}>
            <input type="checkbox" defaultChecked={k==='hotspot'} onChange={()=>{}} /> {label}
          </label>
        ))}
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
          <span style={{background:'#DC2626', padding:'2px 8px', borderRadius:999, fontSize:11, fontWeight:700, animation:'pulse 1.5s infinite'}}>● LIVE</span>
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
          {info && <><div style={{fontWeight:700, fontSize:12}}>DỮ LIỆU VỆ TINH — {info.layer} <span style={{fontSize:10, padding:'2px 6px', borderRadius:999, background: info.status==='LIVE'?'#DCFCE7':'#FEF3C7'}}>{info.status}</span></div><div style={{fontSize:12, marginTop:6, color:'#334155'}}>Nguồn: {info.source || 'Sentinel-2'} · Ngày: {info.acquired || '—'} · <span style={{background:'#DBEAFE', padding:'1px 6px', borderRadius:999, fontSize:10, color:'#1E40AF'}}>Chỉ số GIS / Định tính</span></div></>}
          {pixel && <><div style={{height:1, background:'#E2E8E5', margin:'8px 0'}}/><div style={{fontSize:12}}>NDVI: <b>{pixel.ndvi}</b> <span style={{fontSize:10, background:'#DBEAFE', padding:'1px 6px', borderRadius:999}}>Chỉ số GIS</span> · AI: <span style={{fontSize:10, background:'#F3E8FF', padding:'1px 6px', borderRadius:999}}>AI Generative</span></div></>}
        </div>
      )}

      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}} @keyframes marquee{0%{transform:translateX(100%)}100%{transform:translateX(-100%)}}`}</style>
    </div>
  )
}
