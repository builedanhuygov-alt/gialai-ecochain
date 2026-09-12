import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Link, useSearchParams } from 'react-router-dom'
import { api, API_BASE } from '../services/api'
import FireSimulationLayer, { setRouteMesh } from '../components/sim/FireSimLayers'
import FireFrontCanvas, { frontSupported } from '../components/sim/FireFrontCanvas'
import TwinScene from '../components/sim/TwinScene'
import type { TwinShow } from '../components/sim/TwinScene'

const API = API_BASE.replace(/\/$/, '')

function Slider({ label, value, min, max, step, unit, onChange }: {
  label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (v: number)=>void
}){
  return (
    <label style={{display:'block', fontSize:12}}>
      <div style={{display:'flex', justifyContent:'space-between'}}><span>{label}</span><b>{value}{unit}</b></div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e=> onChange(Number(e.target.value))} style={{width:'100%'}} aria-label={label} />
    </label>
  )
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean)=>void }){
  return (
    <label style={{display:'flex', gap:6, alignItems:'center', fontSize:12, cursor:'pointer'}}>
      <input type="checkbox" checked={value} onChange={e=> onChange(e.target.checked)} /> {label}
    </label>
  )
}

// Part B+D — 3D Interactive Wildfire Simulator + linked Response Plan.
// One sim change updates ellipses, threats, routes, water, impact AND plan.
export default function FireSim(){
  const [qp] = useSearchParams()
  const mapDiv = useRef<HTMLDivElement>(null)
  const [map, setMap] = useState<any>(null)
  const [lon, setLon] = useState(Number(qp.get('lon')) || 109.02)
  const [lat, setLat] = useState(Number(qp.get('lat')) || 14.06)
  const [wind, setWind] = useState(20)
  const [wdir, setWdir] = useState(90)
  const [temp, setTemp] = useState(36)
  const [rain, setRain] = useState(0)
  const [fuel, setFuel] = useState(500)
  const [slope, setSlope] = useState(12)
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [plan, setPlan] = useState<any>(null)
  const [planLoading, setPlanLoading] = useState(false)
  const [show, setShow] = useState({ ellipses:true, assets:true, routes:true, communities:true, wind:true })
  const [show3d, setShow3d] = useState({ ellipses:true, canopy:true, front:true, wind:true, assets:true, routes:true, communities:true, water:true })
  const [mode, setMode] = useState<'2d'|'3d'>(typeof window !== 'undefined' && window.innerWidth < 640 ? '2d' : '3d')
  const [waters, setWaters] = useState<any[]>([])
  const [opsAssets, setOpsAssets] = useState<any[]>([])
  const [demError, setDemError] = useState('')
  const [fps, setFps] = useState<number | null>(null)
  const [terrain3d, setTerrain3d] = useState(false)
  const [particles, setParticles] = useState(frontSupported())
  const [communeFc, setCommuneFc] = useState<any>(null)
  const [mapReady, setMapReady] = useState(false)
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640
  const timer = useRef<any>(null)

  // map init (lightweight OSM raster + Gia Lai bounds + terrain toggle)
  useEffect(()=>{
    if(!mapDiv.current || map) return
    const m = new maplibregl.Map({
      container: mapDiv.current,
      style: { version:8, sources:{ osm:{ type:'raster', tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize:256, attribution:'© OpenStreetMap' } }, layers:[{ id:'osm', type:'raster', source:'osm' }] } as any,
      center:[108.41, 13.85], zoom:7.8, maxBounds:[[107.0,11.5],[109.7,15.1]], attributionControl:false,
    })
    m.addControl(new maplibregl.NavigationControl(), 'top-right')
    m.fitBounds([[107.45,12.99],[109.36,14.70]], { padding:30, duration:0 })
    try{ if((m as any).loaded()) setMapReady(true); else m.once('load', ()=> setMapReady(true)) }catch{}
    setMap(m)
    return ()=>{ try{ m.remove() }catch{} }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[])
  useEffect(()=>{
    if(!map) return
    try{
      if(terrain3d){
        if(!map.getSource('terrain-dem'))
          map.addSource('terrain-dem', { type:'raster-dem', tiles:['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'], tileSize:256, maxzoom:15, encoding:'terrarium' } as any)
        map.setTerrain({ source:'terrain-dem', exaggeration:1.2 })
        map.easeTo({ pitch:60, duration:1000 })
      }else{ map.setTerrain(null); try{ map.easeTo({ pitch:0, duration:600 }) }catch{} }
    }catch{ setTerrain3d(false) }
  },[map, terrain3d])
  // commune boundaries once (desktop only — mobile uses panel list)
  useEffect(()=>{
    if(isMobile) return
    fetch('gialai_135_light.geojson').then(r=> r.ok ? r.json() : null)
      .then(j=> { if(j?.features) setCommuneFc(j) })
      .catch(()=> fetch('gialai_135.geojson').then(r=> r.ok ? r.json() : null).then(j=> { if(j?.features) setCommuneFc(j) }).catch(()=> {}))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[])
  // asset + water coords once (3D joins + route mesh; not per sim)
  useEffect(()=>{
    fetch(`${API}/api/assets`).then(r=> r.json()).then((rows: any[])=>{
      if(Array.isArray(rows)) setOpsAssets(rows)
    }).catch(()=> {})
    fetch(`${API}/api/water/assets`).then(r=> r.json()).then((j: any)=>{
      if(Array.isArray(j?.assets)) setWaters(j.assets)
    }).catch(()=> {})
  },[])
  // route geometries for RouteImpactMesh (colored by sim band)
  useEffect(()=>{
    if(!map || !mapReady || !data || !show.routes || mode !== '2d') return
    const byId: Record<string, any> = {}
    for(const a of opsAssets) byId[a.id] = a
    setRouteMesh(map, data.routes || [], byId)
  },[map, mapReady, data, show.routes, opsAssets, mode])

  const runSim = async (withPlan: boolean)=>{
    if(timer.current) clearTimeout(timer.current)
    setLoading(true); setError('')
    const body = { lon, lat, wind_speed_kmh: wind, wind_direction_deg: wdir, slope_deg: slope,
      temperature_c: temp, rain_mm: rain, forest_loss_ha: fuel }
    try{
      const d: any = await api.firesim(body)
      setData(d)
      try{ map?.flyTo({ center:[lon, lat], zoom:10.5, duration:1200 }) }catch{}
      if(withPlan){
        setPlanLoading(true)
        try{
          const p: any = await api.responsePlan({ lat, lon, wind_speed_kmh: wind, wind_direction_deg: wdir, slope_deg: slope })
          setPlan(p)
        }catch(e:any){ setPlan({ error: String(e.message || e).slice(0, 200) }) }
        finally{ setPlanLoading(false) }
      }
    }catch(e:any){ setError(String(e.message || e).slice(0, 200)) }
    finally{ setLoading(false) }
  }
  // B3 realtime: sliders re-run the SIM (debounced); plan regenerates on RUN (B8)
  const auto = ()=>{
    if(timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(()=> runSim(false), 500)
  }
  useEffect(()=>{ runSim(true); return ()=>{ if(timer.current) clearTimeout(timer.current) } },[]) // eslint-disable-line react-hooks/exhaustive-deps

  const imp = data?.impact
  return (
    <div style={{display:'flex', flexDirection:'column', gap:12}}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:8}}>
        <h1 style={{margin:0}}>🔥 Mô phỏng cháy 3D <span style={{fontSize:11, fontWeight:400, color:'#64748B'}}>ELLIPTICAL_HEURISTIC — phác thảo chiến thuật, không phải vật lý cháy</span></h1>
        <Link to="/command" style={{fontSize:12, color:'#0F766E', fontWeight:700}}>→ Chỉ huy</Link>
      </div>
      <div style={{display:'grid', gridTemplateColumns:'300px 1fr', gap:12}} className="firesim-grid">
        <div style={{display:'flex', flexDirection:'column', gap:10, background:'#fff', border:'1px solid #E2E8E5', borderRadius:12, padding:12}}>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8}}>
            <label style={{fontSize:12}}>Kinh độ<input value={lon} onChange={e=> { setLon(Number(e.target.value)); auto() }} type="number" step={0.01} style={{width:'100%', border:'1px solid #E2E8E5', borderRadius:8, padding:'4px 8px'}} /></label>
            <label style={{fontSize:12}}>Vĩ độ<input value={lat} onChange={e=> { setLat(Number(e.target.value)); auto() }} type="number" step={0.01} style={{width:'100%', border:'1px solid #E2E8E5', borderRadius:8, padding:'4px 8px'}} /></label>
          </div>
          <Slider label="🔥 Mất rừng (nhiên liệu)" value={fuel} min={0} max={2000} step={50} unit=" ha" onChange={v=> { setFuel(v); auto() }} />
          <Slider label="🌡️ Nhiệt độ" value={temp} min={20} max={45} step={1} unit="°C" onChange={v=> { setTemp(v); auto() }} />
          <Slider label="🌬️ Gió" value={wind} min={0} max={60} step={1} unit=" km/h" onChange={v=> { setWind(v); auto() }} />
          <Slider label="🧭 Hướng gió (tới)" value={wdir} min={0} max={359} step={5} unit="°" onChange={v=> { setWdir(v); auto() }} />
          <Slider label="🌧️ Mưa" value={rain} min={0} max={50} step={1} unit=" mm" onChange={v=> { setRain(v); auto() }} />
          <Slider label="⛰️ Dốc" value={slope} min={0} max={40} step={1} unit="°" onChange={v=> { setSlope(v); auto() }} />
          <button onClick={()=> runSim(true)} disabled={loading} style={{background:'#DC2626', color:'#fff', border:0, borderRadius:999, padding:'10px', fontWeight:800, cursor:'pointer'}}>
            {loading ? 'ĐANG CHẠY…' : '▶ RUN SIMULATION + PLAN'}
          </button>
          {error && <div style={{fontSize:12, color:'#B91C1C'}}>⚠ {error}</div>}
          <div style={{display:'flex', flexDirection:'column', gap:4, borderTop:'1px solid #F1F5F9', paddingTop:8}}>
            <b style={{fontSize:12}}>Lớp hiển thị {mode === '3d' ? '(3D)' : '(2D)'}</b>
            {mode === '2d' ? (
              <>
                {(Object.keys(show) as (keyof typeof show)[]).map(k=> (
                  <Toggle key={k} label={{ellipses:'Ellipse lan', assets:'Tài sản', routes:'Tuyến', communities:'Xã', wind:'Gió'}[k]} value={show[k]} onChange={v=> setShow(s=> ({...s, [k]:v}))} />
                ))}
                <Toggle label="⛰️ 3D địa hình (2D)" value={terrain3d} onChange={setTerrain3d} />
                <Toggle label="🔥 Vệt lửa động (2D)" value={particles} onChange={setParticles} />
              </>
            ) : (
              <>
                {(Object.keys(show3d) as (keyof typeof show3d)[]).map(k=> (
                  <Toggle key={k} label={{ellipses:'Ellipse lan', canopy:'Tán cây (proxy)', front:'Vệt lửa 3D', wind:'Mũi tên gió', assets:'Tài sản', routes:'Tuyến', communities:'Xã', water:'Đường lấy nước'}[k]} value={show3d[k]} onChange={v=> setShow3d(s=> ({...s, [k]:v}))} />
                ))}
              </>
            )}
          </div>
          {data?.ros && <div style={{fontSize:11, color:'#64748B'}}>ROS {data.ros.ros_kmh} km/h (nền {data.ros.base_ros_kmh} × T{data.ros.factors.temperature} × mưa{data.ros.factors.rain} × nhiên liệu{data.ros.factors.fuel})<br/>{data.ros.formula}</div>}
        </div>
        <div style={{position:'relative', minHeight:420, borderRadius:12, overflow:'hidden', border:'1px solid #E2E8E5'}} ref={mapDiv}>
          <div style={{position:'absolute', top:8, left:8, zIndex:7, display:'flex', gap:6}}>
            <button onClick={()=> setMode('2d')} style={{fontSize:11, fontWeight:700, borderRadius:999, border:'1px solid #E2E8E5', padding:'4px 12px', background: mode==='2d' ? '#0B1412' : '#fff', color: mode==='2d' ? '#fff' : '#0B1412', cursor:'pointer'}}>2D bản đồ</button>
            <button onClick={()=> { setDemError(''); setMode('3d') }} style={{fontSize:11, fontWeight:700, borderRadius:999, border:'1px solid #E2E8E5', padding:'4px 12px', background: mode==='3d' ? '#0B1412' : '#fff', color: mode==='3d' ? '#fff' : '#0B1412', cursor:'pointer'}}>3D Twin</button>
          </div>
          {mode === '2d' && map && mapReady && data && (
            <>
              <FireSimulationLayer map={map} data={data} show={show} communeFc={communeFc} isMobile={isMobile} />
              <FireFrontCanvas map={map} steps={data.spread?.steps} on={particles} />
            </>
          )}
          {mode === '3d' && data && !demError && (
            <TwinScene sim={data} waters={waters} opsAssets={opsAssets} communeFc={communeFc}
              show={show3d as TwinShow} onError={(m)=> setDemError(m)} onFps={setFps} />
          )}
          {mode === '3d' && demError && (
            <div style={{position:'absolute', inset:0, display:'grid', placeItems:'center', background:'#0B1412', color:'#fff', padding:24, textAlign:'center', zIndex:6}}>
              <div>
                <div style={{fontSize:14, fontWeight:800}}>Không dựng được địa hình 3D</div>
                <div style={{fontSize:12, color:'#FDE68A', marginTop:6}}>{demError} — không dùng mặt phẳng giả thay thế.</div>
                <button onClick={()=> setMode('2d')} style={{marginTop:10, background:'#0F766E', color:'#fff', border:0, borderRadius:999, padding:'8px 18px', fontWeight:700, cursor:'pointer'}}>Về 2D</button>
              </div>
            </div>
          )}
          <div style={{position:'absolute', top:8, left:8, marginTop:34, background:'rgba(255,255,255,0.95)', borderRadius:8, padding:'6px 10px', fontSize:11, zIndex:6}}>
            <b>🔴 hiện tại</b> · <b style={{color:'#F97316'}}>🟠 +1h</b> · <b style={{color:'#B45309'}}>🟡 +3h</b> · <b style={{color:'#525252'}}>⚫ +6h</b>
            {mode === '3d' && <span style={{color:'#64748B'}}> · địa hình DEM thật ×1.5{fps !== null && <> · {fps} FPS</>}</span>}
          </div>
          {mode === '3d' && (
            <div style={{position:'absolute', bottom:8, left:8, background:'rgba(255,255,255,0.92)', borderRadius:8, padding:'4px 10px', fontSize:10, color:'#64748B', zIndex:6}}>
              Cây = proxy tán từ ảnh vệ tinh (ESTIMATED) · kéo xoay / lăn zoom / chuột phải nghiêng
            </div>
          )}
        </div>
      </div>
      {imp && (
        <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))', gap:8}}>
          <div className="card" style={{background:'#fff', border:'1px solid #E2E8E5', borderRadius:12, padding:12}}>
            <b>🔥 Diện tích: {imp.area_affected_ha} ha</b>
            <div style={{fontSize:12, color:'#64748B'}}>ROS {imp.ros_kmh} km/h · tiến triển: {Object.entries(imp.progression || {}).map(([h, v]: any)=> `+${h}h ${v.length_km}km`).join(' · ')}</div>
          </div>
          <div className="card" style={{background:'#fff', border:'1px solid #E2E8E5', borderRadius:12, padding:12}}>
            <b>🏘️ {imp.communities_threatened} xã: {(imp.communes || []).join(', ') || '—'}</b>
            <div style={{fontSize:12, color:'#64748B'}}>Trạm ảnh hưởng: {(imp.stations_impacted || []).join(', ') || '—'}</div>
          </div>
          <div className="card" style={{background:'#fff', border:'1px solid #E2E8E5', borderRadius:12, padding:12}}>
            <b>💧 Nước ảnh hưởng: {(imp.water_impacted || []).join(', ') || '—'}</b>
            <div style={{fontSize:12, color:'#64748B'}}>Tuyến ảnh hưởng: {(imp.routes_impacted || []).join(', ') || '—'}</div>
          </div>
        </div>
      )}
      {data?.routes?.length > 0 && (
        <div style={{background:'#fff', border:'1px solid #E2E8E5', borderRadius:12, padding:12}}>
          <b>🛣️ Tác động tuyến</b>
          {data.routes.map((r: any)=> (
            <div key={r.id} style={{fontSize:12, display:'flex', gap:8, alignItems:'center', borderTop:'1px solid #F1F5F9', padding:'4px 0'}}>
              <span style={{width:10, height:10, borderRadius:999, background:r.color}} />
              <b>{r.route_name}</b><span style={{color:'#64748B'}}>{r.panel}</span>
            </div>
          ))}
        </div>
      )}
      {data?.waters?.length > 0 && (
        <div style={{background:'#fff', border:'1px solid #E2E8E5', borderRadius:12, padding:12, overflowX:'auto'}}>
          <b>💧 Nước: hiện tại vs mô phỏng</b>
          <table style={{fontSize:12, width:'100%', borderCollapse:'collapse'}}>
            <thead><tr style={{color:'#64748B', textAlign:'left'}}><th>Hồ</th><th>Km</th><th>ETA</th><th>Hiện tại</th><th>Mô phỏng</th><th>Ghi chú</th></tr></thead>
            <tbody>{data.waters.slice(0, 8).map((w: any)=> (
              <tr key={w.id} style={{borderTop:'1px solid #F1F5F9'}}>
                <td><b>{w.name}</b></td><td>{w.distance_km}</td><td>{w.current.travel_minutes}′</td>
                <td>{w.current.availability}</td>
                <td><span style={{background:w.simulated.color, color:'#fff', borderRadius:999, padding:'1px 8px', fontSize:11}}>{w.simulated.availability}</span></td>
                <td style={{color:'#64748B'}}>{w.note}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {(planLoading || plan) && (
        <div style={{background:'#fff', border:'1px solid #E2E8E5', borderRadius:12, padding:12}}>
          <b>🚒 Response Plan tái sinh (gió kịch bản {wind} km/h → {wdir}°)</b>
          {planLoading && <div style={{fontSize:12, color:'#64748B'}}>Đang tổng hợp…</div>}
          {plan && !planLoading && !plan.error && (
            <div style={{fontSize:12, display:'flex', flexDirection:'column', gap:4, marginTop:6}}>
              <div>CẤP <b>{plan.risk_summary?.level}</b> · {plan.command_status} · Nước: <b>{plan.primary_water?.name}</b> ({plan.primary_water?.priority}) · Trạm: <b>{plan.primary_station?.station_name || '—'}</b> · Tuyến: <b>{plan.primary_route?.route_name || '—'}</b></div>
              <div>🌐 {(plan.analyst_bulletin?.hinh_anh_hien_truong || []).join(' · ')}</div>
              <ul style={{margin:'4px 0 4px 16px', padding:0}}>{(plan.tactical_recommendations || []).slice(0, 6).map((r: string, i: number)=> <li key={i}>{r}</li>)}</ul>
              <Link to="/command" style={{fontSize:12, color:'#0F766E', fontWeight:700}}>Mở Command Center →</Link>
            </div>
          )}
          {plan?.error && <div style={{fontSize:12, color:'#B91C1C'}}>⚠ {plan.error}</div>}
        </div>
      )}
      <style>{`@media (max-width: 900px){ .firesim-grid{ grid-template-columns:1fr !important; } }`}</style>
    </div>
  )
}
