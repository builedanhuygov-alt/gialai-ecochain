import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../services/api'
import { useScope } from '../store/useScope'

function Card({ children, style }: any){
  return <div className="card" style={{background:'#fff', border:'1px solid #E2E8E5', borderRadius:12, padding:12, ...style}}>{children}</div>
}

export default function Command(){
  const [firms, setFirms] = useState<any>(null)
  const [wx, setWx] = useState<any>(null)
  const [assets, setAssets] = useState<any[]>([])
  const [alerts, setAlerts] = useState<any[]>([])
  const [risk, setRisk] = useState<any>(null)
  const [commune, setCommune] = useState('')
  const [brief, setBrief] = useState<any>(null)
  const [briefLoading, setBriefLoading] = useState(false)
  const [planAlert, setPlanAlert] = useState('')
  const [plan, setPlan] = useState<any>(null)
  const [planLoading, setPlanLoading] = useState(false)
  const scopeCommunes = useScope(s=> s.communes)
  const scopeCommune = useScope(s=> s.scope.commune)

  useEffect(()=>{
    api.firmsLive().then(setFirms).catch(()=> setFirms(null))
    api.weatherNow().then(setWx).catch(()=> setWx(null))
    api.assetsList().then((d:any)=> setAssets(Array.isArray(d) ? d : [])).catch(()=> setAssets([]))
    api.alertList('ACTIVE').then((d:any)=> setAlerts(Array.isArray(d) ? d : [])).catch(()=> setAlerts([]))
    api.riskOverview().then(setRisk).catch(()=> setRisk(null))
  },[])

  useEffect(()=>{
    if(scopeCommune && !commune) setCommune(scopeCommune)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[scopeCommune])

  const loadBrief = async (name: string)=>{
    if(!name) return
    setBriefLoading(true)
    try{
      // centroid unknown here — brief resolves watch areas from name via backend
      const b: any = await api.fireBrief(name, 13.9, 108.3)
      setBrief(b)
    }catch{ setBrief(null) }
    finally{ setBriefLoading(false) }
  }
  useEffect(()=>{ if(commune) loadBrief(commune) },[commune]) // eslint-disable-line react-hooks/exhaustive-deps

  const runPlan = async (a: any)=>{
    setPlanAlert(a?.id || '')
    setPlanLoading(true)
    try{
      let lat = 13.9, lon = 108.3, geoNote = 'tọa độ mặc định tỉnh (cảnh báo thiếu geometry)'
      try{
        const d: any = await api.alertDetail(a.id)
        const g = d?.geometry
        const pt = g?.type === 'Point' ? g.coordinates
          : (Array.isArray(g) && typeof g[0] === 'number' ? g : null)
        if(pt && typeof pt[0] === 'number' && typeof pt[1] === 'number'){ lon = pt[0]; lat = pt[1]; geoNote = '' }
      }catch{}
      const p: any = await api.responsePlan({ lat, lon })
      setPlan({ ...p, _title: a?.title || `${lat},${lon}`, _geoNote: geoNote })
    }catch(e:any){ setPlan({ error: String(e.message || e).slice(0, 200) }) }
    finally{ setPlanLoading(false) }
  }

  const hotspots: any[] = firms?.hotspots || firms?.fires || []
  const waters = assets.filter(a=> a.asset_type === 'water' && a.status === 'active')
  const byType: Record<string, number> = {}
  assets.forEach(a=>{ if(a.status === 'active') byType[a.asset_type] = (byType[a.asset_type] || 0) + 1 })
  const cur = wx?.current || {}
  const liveCount = [firms?.status, wx?.status].filter(s=> s === 'LIVE').length

  return (
    <div style={{display:'flex', flexDirection:'column', gap:12}}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:8}}>
        <h1 style={{margin:0}}>Trung tâm Chỉ huy <span style={{fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:999, background: liveCount === 2 ? '#DCFCE7' : '#FEF3C7'}}>{liveCount === 2 ? 'TRỰC TIẾP' : 'MỘT PHẦN'}</span></h1>
        <Link to="/" style={{fontSize:12, color:'#0F766E', fontWeight:700}}>→ Mở bản đồ</Link>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(150px, 1fr))', gap:8}}>
        <Card><b style={{fontSize:20}}>🔥 {hotspots.length}</b><div style={{fontSize:11, color:'#64748B'}}>Điểm nhiệt FIRMS ({firms?.status || '…'})</div></Card>
        <Card><b style={{fontSize:20}}>🌬️ {cur.wind_speed_10m ?? cur.windspeed ?? '—'} <span style={{fontSize:12}}>km/h</span></b><div style={{fontSize:11, color:'#64748B'}}>{cur.temperature_2m ?? cur.temperature ?? '—'}°C · ẩm {cur.relative_humidity_2m ?? cur.humidity ?? '—'}%</div></Card>
        <Card><b style={{fontSize:20}}>🚒 {assets.filter(a=> a.status === 'active').length}</b><div style={{fontSize:11, color:'#64748B'}}>Tài sản đang hoạt động · 💧 {waters.length} bể/nước</div></Card>
        <Card><b style={{fontSize:20}}>⚠️ {alerts.length}</b><div style={{fontSize:11, color:'#64748B'}}>Cảnh báo ACTIVE · nghiêm trọng {risk?.critical_alerts ?? '—'}</div></Card>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(300px, 1fr))', gap:8}}>
        <Card>
          <b>⚠️ Cảnh báo đang hoạt động</b>
          {alerts.length === 0 && <div style={{fontSize:12, color:'#64748B', marginTop:6}}>Không có cảnh báo nào.</div>}
          {alerts.slice(0,5).map((a:any)=> (
            <div key={a.id} style={{fontSize:12, borderTop:'1px solid #F1F5F9', padding:'6px 0'}}>
              <b>{a.title || a.risk_type}</b> <span style={{color:'#64748B'}}>· {a.administrative_unit_id || ''} · {a.level || ''}</span>
            </div>
          ))}
          <div style={{marginTop:6}}><Link to="/notifications" style={{fontSize:12, color:'#0F766E', fontWeight:700}}>Xử lý →</Link></div>
        </Card>
        <Card>
          <b>🚒 Tài sản theo loại</b>
          {Object.keys(byType).length === 0 && <div style={{fontSize:12, color:'#64748B', marginTop:6}}>Chưa có tài sản — <Link to="/admin">nhập GPS trên trang Quản trị</Link>.</div>}
          {Object.entries(byType).map(([t, n])=> (
            <div key={t} style={{fontSize:12, display:'flex', justifyContent:'space-between', borderTop:'1px solid #F1F5F9', padding:'4px 0'}}><span>{t}</span><b>{n}</b></div>
          ))}
          <div style={{marginTop:6}}><Link to="/admin" style={{fontSize:12, color:'#0F766E', fontWeight:700}}>Quản lý tài sản →</Link></div>
        </Card>
      </div>

      <Card>
        <div style={{display:'flex', gap:8, alignItems:'center', flexWrap:'wrap'}}>
          <b>📋 Bản tin AI xã</b>
          <select value={commune} onChange={e=> setCommune(e.target.value)} style={{border:'1px solid #E2E8E5', borderRadius:8, padding:'6px 10px', fontSize:12, maxWidth:240}}>
            <option value="">— Chọn xã —</option>
            {scopeCommunes.slice(0, 200).map((c:string)=> <option key={c} value={c}>{c}</option>)}
          </select>
          {briefLoading && <span style={{fontSize:12, color:'#64748B'}}>Đang tổng hợp…</span>}
        </div>
        {brief && !briefLoading && (
          <div style={{marginTop:8, fontSize:12}}>
            <div>CẤP <b>{brief.level}</b> · điểm {brief.score}/100 · tin cậy {brief.confidence}% · mưa 14 ngày <b>{brief.rain_14d_mm ?? '?'}mm</b></div>
            {(brief.reasons || []).length > 0 && <ul style={{margin:'4px 0 4px 16px', padding:0}}>{brief.reasons.map((r:string, i:number)=> <li key={i}>{r}</li>)}</ul>}
            {brief.nearest_water && <div>💧 Nguồn nước gần nhất: <b>{brief.nearest_water.name}</b> ({brief.nearest_water.distance_km} km{brief.nearest_water.capacity_liters ? ` · ${brief.nearest_water.capacity_liters} L` : ''})</div>}
            {brief.nearest_station && <div>🏕️ Trạm/tổ gần nhất: <b>{brief.nearest_station.name}</b> ({brief.nearest_station.distance_km} km)</div>}
            {(brief.watch_communes || []).length > 0 && <div style={{color:'#64748B'}}>Theo dõi: {brief.watch_communes.map((w:any)=> w.name).join(' · ')}</div>}
          </div>
        )}
      </Card>
      <Card>
        <b>🚨 Kế hoạch tác chiến theo điểm cháy</b>
        <div style={{fontSize:11, color:'#64748B', margin:'2px 0 8px'}}>Bấm một cảnh báo để sinh kế hoạch: trạm/nước/tuyến gần nhất, lan truyền, đe dọa tài sản, FWI, khuyến nghị — mọi số đều ghi nguồn.</div>
        <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
          {alerts.length === 0 && <span style={{fontSize:12, color:'#64748B'}}>Chưa có cảnh báo để lập kế hoạch.</span>}
          {alerts.slice(0,6).map((a:any)=> (
            <button key={a.id} onClick={()=> runPlan(a)} disabled={planLoading}
              style={{fontSize:12, padding:'6px 12px', borderRadius:999, border: planAlert===a.id ? '2px solid #DC2626' : '1px solid #E2E8E5', background: planAlert===a.id ? '#FEF2F2' : '#fff', cursor:'pointer'}}>
              {(a.level || '') + ' ' + (a.title || a.id).slice(0, 40)}
            </button>
          ))}
        </div>
        {planLoading && <div style={{fontSize:12, color:'#64748B', marginTop:8}}>Đang tổng hợp kế hoạch…</div>}
        {plan && !planLoading && !plan.error && (
          <div style={{marginTop:8, fontSize:12, display:'flex', flexDirection:'column', gap:8}}>
            <div><b>{plan._title}</b> — CẤP <b>{plan.risk_summary?.level}</b> · điểm {plan.risk_summary?.score}/100 · tin cậy {plan.risk_summary?.confidence}% {plan._geoNote && <span style={{color:'#B45309'}}>({plan._geoNote})</span>}</div>
            <div>🌬️ Gió {plan.weather?.wind_speed_kmh ?? '?'} km/h → hướng {plan.weather?.wind_toward_deg ?? '?'}° · {plan.weather?.temperature ?? '?'}°C · ẩm {plan.weather?.humidity ?? '?'}%
              {plan.fwi && <span> · FWI cùng ngày: FFMC <b>{plan.fwi.ffmc}</b> / ISI <b>{plan.fwi.isi}</b> <span style={{color:'#64748B'}}>(Van Wagner, {plan.fwi.assumption})</span></span>}</div>
            <div>💧 {plan.nearest_water ? <>Nước: <b>{plan.nearest_water.name}</b> ({plan.nearest_water.distance_km} km{plan.nearest_water.capacity_liters ? ` · ${plan.nearest_water.capacity_liters} L` : ''})</> : 'Chưa có bể/nước.'}
              {' '}🏕️ {plan.nearest_station ? <>{plan.nearest_station.name} ({plan.nearest_station.distance_km} km, ~{plan.nearest_station.travel_minutes} phút)</> : 'Chưa có trạm/tổ.'}
              {' '}🛣️ {plan.nearest_route ? <>{plan.nearest_route.name} ({plan.nearest_route.distance_km} km)</> : 'Chưa có tuyến.'}</div>
            {(plan.spread?.steps || []).length > 0 && (
              <div>{plan.spread.steps.map((s:any)=> <span key={s.hour} style={{display:'inline-block', background:'#FEF2F2', borderRadius:8, padding:'4px 8px', marginRight:6, marginBottom:4}}>+{s.hour}h: {s.length_km} km · {s.area_ha} ha{(s.affected_communes?.length > 0) && <> · {s.affected_communes.map((c:any)=> c.name).join(', ')}</>}</span>)}</div>
            )}
            {(plan.asset_threats || []).filter((t:any)=> t.band !== 'SAFE').length > 0 && (
              <div>🛡️ Đe dọa tài sản: {plan.asset_threats.filter((t:any)=> t.band !== 'SAFE').slice(0,5).map((t:any)=> `${t.name} (${t.band}, ETA ${t.eta_hours}h)`).join(' · ')}</div>
            )}
            <div><b>🚒 Khuyến nghị:</b><ul style={{margin:'4px 0 4px 16px', padding:0}}>{(plan.tactical_recommendations || []).map((r:string, i:number)=> <li key={i}>{r}</li>)}</ul></div>
            <div style={{fontSize:10, color:'#64748B'}}>Di chuyển: {plan.travel_time?.assumption} · Mô hình: {plan.spread?.model}</div>
          </div>
        )}
        {plan?.error && <div style={{fontSize:12, color:'#B91C1C', marginTop:8}}>⚠ {plan.error}</div>}
      </Card>

      <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(300px, 1fr))', gap:8}}>
        <Card>
          <b>📍 Sự cố đang hoạt động ({alerts.length})</b>
          {alerts.slice(0,8).map((a:any)=> (
            <div key={a.id} style={{fontSize:12, borderTop:'1px solid #F1F5F9', padding:'4px 0'}}>{a.level || ''} · {a.title || a.risk_type} <span style={{color:'#64748B'}}>· {a.status}</span></div>
          ))}
          {alerts.length === 0 && <div style={{fontSize:12, color:'#64748B'}}>Không có.</div>}
        </Card>
        <Card>
          <b>🏕️ Trạng thái tài sản</b>
          {assets.length === 0 && <div style={{fontSize:12, color:'#64748B'}}>Chưa có tài sản.</div>}
          {['active','maintenance','inactive'].map(s=> {
            const n = assets.filter(a=> a.status === s).length
            return n > 0 ? <div key={s} style={{fontSize:12, display:'flex', justifyContent:'space-between'}}><span>{s}</span><b>{n}</b></div> : null
          })}
        </Card>
      </div>
      <style>{`.card{background:#fff; border:1px solid #E2E8E5; border-radius:12px; padding:12px}`}</style>
    </div>
  )
}
