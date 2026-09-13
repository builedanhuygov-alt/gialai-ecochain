import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AlertTriangle, Bell, Flame, Wind } from 'lucide-react'
import { API_BASE, api } from '../services/api'
import { useScope } from '../store/useScope'
import { CommandBrief, CommandSummaryCard, ExecutiveAlertStrip, ExecutiveHeader, MissionBoard, SituationBoard, WallMode, buildBrief, buildMissions, levelTone, worstAlert } from '../components/CommandExec'
import {
  AISituationBrief, AlertFeed, AssetStatusPanel, CommandHead, CommandStatusStrip, CxCommandStyles, CxStyles,
  DecisionPanel, EnvContext, FieldIntel, IncidentDrawer, IncidentPanel, KPIBar,
  LiveEventStream, MissionMini, OperationalMapPreview, PriorityHierarchy, PriorityIncidents,
  RecommendedActions, ResponsePanel, RiskIndexPanel, SectionHead,
  alertSev, buildDecisions, buildHierarchy, buildInterpretation, buildRiskSignals, classifyEvent, confidenceBasis, sortAlerts, timeOf, timeSec, windDir,
} from '../components/CommandCenter'
import type { BriefData, CxEvent, SourceRow } from '../components/CommandCenter'

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
  // Command-center hero data — reuse of existing endpoints only (no new API).
  const [fireRisk, setFireRisk] = useState<any>(null)
  const [fireRiskLoading, setFireRiskLoading] = useState(true)
  const [ndvi, setNdvi] = useState<any>(null)
  const [proposals, setProposals] = useState<any[] | null>(null)
  const [incidents, setIncidents] = useState<any[] | null>(null)
  const [incidentsLoading, setIncidentsLoading] = useState(true)
  const [audit, setAudit] = useState<any[] | null>(null)
  const [auditLoading, setAuditLoading] = useState(true)
  const [missionsApi, setMissionsApi] = useState<any[]>([])
  const [twin, setTwin] = useState<any>(null)
  const [drawerAlert, setDrawerAlert] = useState<any>(null)
  const [updatedAt, setUpdatedAt] = useState('')
  const scopeCommunes = useScope(s=> s.communes)
  const scopeCommune = useScope(s=> s.scope.commune)

  useEffect(()=>{
    api.firmsLive().then(setFirms).catch(()=> setFirms(null))
    api.weatherNow().then(setWx).catch(()=> setWx(null))
    api.assetsList().then((d:any)=> setAssets(Array.isArray(d) ? d : [])).catch(()=> setAssets([]))
    api.alertList('ACTIVE').then((d:any)=> setAlerts(Array.isArray(d) ? d : [])).catch(()=> setAlerts([]))
    api.riskOverview().then(setRisk).catch(()=> setRisk(null))
    // Same endpoint FireRiskGauge uses — province-level score/confidence/factors.
    fetch(`${API_BASE}/api/fire/risk?administrative_unit_id=GiaLai&lat=13.9&lon=108.3`)
      .then(r=> r.json()).then(setFireRisk).catch(()=> setFireRisk(null)).finally(()=> setFireRiskLoading(false))
    // Same endpoint Forest/MapView use for NDVI status.
    fetch(`${API_BASE}/api/v1/satellite/ndvi?bbox=107.0,12.9,109.6,15.0`)
      .then(r=> r.json()).then(setNdvi).catch(()=> setNdvi(null))
    api.proposals().then((d:any)=> setProposals(Array.isArray(d) ? d : [])).catch(()=> setProposals(null))
    api.incidents().then((d:any)=> setIncidents(Array.isArray(d) ? d : [])).catch(()=> setIncidents(null)).finally(()=> setIncidentsLoading(false))
    api.auditLog().then((d:any)=> setAudit(Array.isArray(d) ? d : [])).catch(()=> setAudit(null)).finally(()=> setAuditLoading(false))
    api.missions().then((d:any)=> setMissionsApi(Array.isArray(d) ? d : [])).catch(()=> setMissionsApi([]))
    api.twinStates('gia-lai').then(setTwin).catch(()=> setTwin(null))
    setUpdatedAt(new Date().toLocaleTimeString('vi-VN', {hour:'2-digit', minute:'2-digit'}))
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

  const openAI = ()=> window.dispatchEvent(new CustomEvent('ecochain-open-ai', { detail:{} }))

  const hotspots: any[] = firms?.hotspots || firms?.fires || []
  void risk
  const cur = wx?.current || {}
  const liveCount = [firms?.status, wx?.status].filter(s=> s === 'LIVE').length
  // P1 Wall Mode (?wall=1) — màn hình tường 55–75".
  const [qp, setQp] = useSearchParams()
  const wall = qp.get('wall') === '1'
  useEffect(()=>{
    if(wall && !plan && !planLoading && alerts.length) runPlan(worstAlert(alerts))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[wall, alerts.length])
  // P2/P3/P8 executive derivations — từ state sẵn có, không API mới.
  const execLevel = plan?.risk_summary?.level || worstAlert(alerts)?.level || null
  const execComms: string[] = (plan?.threatened_communities || []).map((c:any)=> c.commune)
  const execAction = plan?.top_actions?.[0]
  const missions = buildMissions(plan, alerts)
  const briefText = buildBrief(plan, alerts, hotspots.length)

  // ── Command-center derivations (presentation only, same state) ──
  const fr = fireRisk?.warning_level ? fireRisk : null
  const wxMeta = wx?.metadata?.status || wx?.status || null
  const liveish = (s: unknown): SourceRow['status'] =>
    s === 'LIVE' || s === 'CACHED' || s === 'DEMO' || s === 'STALE' ? (s as SourceRow['status']) : 'UNAVAILABLE'
  const ndviMean = typeof ndvi?.ndvi?.mean === 'number' ? ndvi.ndvi.mean : null
  const wxWind = cur.wind_speed_10m ?? cur.windspeed ?? null
  const signals = buildRiskSignals({
    firmsCount: firms ? hotspots.length : null, firmsStatus: firms ? liveish(firms.status) : 'UNAVAILABLE',
    wind: wxWind, temp: cur.temperature_2m ?? cur.temperature ?? null,
    humidity: cur.relative_humidity_2m ?? cur.humidity ?? null,
    wxStatus: wx ? liveish(wxMeta) : 'UNAVAILABLE',
    ndvi: ndviMean, ndviStatus: ndvi ? liveish(ndvi.status) : 'UNAVAILABLE',
    proposals: proposals === null ? null : proposals.length,
  })
  const staleCount = [ndvi?.status, firms?.status].filter(s => s === 'CACHED').length
  const basis = fr ? confidenceBasis(fr.missing, staleCount) : null
  const sources: SourceRow[] = [
    { key:'NDVI', label:'NDVI Sentinel-2', status: ndvi ? liveish(ndvi.status) : 'UNAVAILABLE',
      detail: ndviMean != null ? ndviMean.toFixed(2) : undefined },
    { key:'FIRMS', label:'FIRMS hotspots', status: firms ? liveish(firms.status) : 'UNAVAILABLE',
      detail: firms ? `${hotspots.length} điểm` : undefined },
    { key:'WEATHER', label:'Thời tiết', status: wx ? (wxMeta === 'LIVE' ? 'LIVE' : 'UNAVAILABLE') : 'UNAVAILABLE',
      detail: cur.temperature_2m != null || cur.temperature != null ? `${cur.temperature_2m ?? cur.temperature}°C` : undefined },
    { key:'TERRAIN', label:'Địa hình', status: plan?.earth_intelligence?.terrain_driver ? 'LIVE' : 'MISSING',
      detail: plan?.earth_intelligence?.terrain_driver?.level },
    { key:'COMMUNITY', label:'Cộng đồng', status: proposals === null ? 'UNAVAILABLE' : 'LIVE',
      detail: proposals === null ? undefined : `${proposals.length} đề xuất` },
  ]
  const aiBrief: BriefData = fr ? {
    level: fr.warning_level, label: fr.label,
    coverage: fr.forecast_rating?.data_coverage_status || null,
    missing: Array.isArray(fr.missing) ? fr.missing : [],
    signals,
    interpretation: buildInterpretation(fr),
    recommendation: (fr.forecast_rating?.recommended_action || [])[0]
      || (plan?.top_actions?.[0] ? `${plan.top_actions[0].action}: ${plan.top_actions[0].title}` : null),
  } : null
  const nav = useNavigate()
  const windDeg = cur.wind_direction_10m ?? cur.winddirection ?? cur.wind_direction ?? null
  const criticalAlerts = alerts.filter((a:any)=> ['CRITICAL','V'].includes(a.level))
  // ── Command workspace derivations (presentation only, same state) ──
  const orderedAlerts = sortAlerts(alerts)
  const highCount = alerts.filter((a:any)=> alertSev(a) === 'HIGH').length
  const fieldCount = proposals === null ? 0 : proposals.length
  const teamsActive = assets.filter(a => (a?.asset_type === 'team' || a?.asset_type === 'station') && a?.status === 'active').length
  const missionsActive = missionsApi.filter(m => m?.status !== 'COMPLETED').length
  const backendUp = firms !== null && wx !== null
  const demoMode = firms?.status === 'DEMO'
  const decisions = buildDecisions(alerts, proposals, planAlert)
  const hier = buildHierarchy(alerts, proposals, missionsActive)
  const stripCells = [
    { label: 'ACTIVE INCIDENTS', value: String(alerts.length) },
    { label: 'CRITICAL', value: String(criticalAlerts.length), tone: criticalAlerts.length > 0 ? '#DC2626' : undefined },
    { label: 'HIGH RISK', value: String(highCount), tone: highCount > 0 ? '#EA580C' : undefined },
    { label: 'FIELD REPORTS', value: proposals === null ? '—' : String(fieldCount) },
    { label: 'TEAMS ACTIVE', value: String(teamsActive) },
    { label: 'MISSIONS', value: String(missionsActive) },
  ]
  const kpiLoading = fireRiskLoading || incidentsLoading
  const events: CxEvent[] = (audit || []).map((l:any)=> ({
    time: timeOf(l.created_at), kind: classifyEvent(l.action, l.resource_type),
    title: String(l.action || 'System event'),
    sub: [l.resource_type, l.resource_id ? String(l.resource_id).slice(0,8) : '', l.detail ? String(l.detail).slice(0,80) : ''].filter(Boolean).join(' · ') || undefined,
  }))

  if(wall){
    return (
      <WallMode alerts={alerts} plan={plan} planLoading={planLoading}
        firmsCount={hotspots.length} onPlan={runPlan} onExit={()=> setQp({})} />
    )
  }
  return (
    <div className="cx rise-in" style={{display:'flex', flexDirection:'column', gap:12}}>
      <CxStyles />
      <CommandHead live={liveCount === 2} updated={updatedAt || '…'} onAI={openAI} extra={
        <>
          <button onClick={()=> setQp({ wall:'1' })} title="Wall Mode: tự xoay cho màn hình tường 55–75 inch" style={{fontSize:12, fontWeight:800, borderRadius:10, border:'1px solid #E4E9E6', background:'#0B1412', color:'#fff', padding:'8px 14px', cursor:'pointer'}}>Wall</button>
          <Link to="/" style={{fontSize:12, color:'#0C5C54', fontWeight:800, textDecoration:'none'}}>Mở bản đồ →</Link>
        </>
      } />

      {/* P2 Executive Header — 6 facts, không mở panel */}
      <ExecutiveHeader level={execLevel} firmsCount={hotspots.length}
        communes={execComms.length ? execComms : alerts.map((a:any)=> a.title || a.administrative_unit_id).filter(Boolean).slice(0, 4)}
        topCommune={execComms[0] || null}
        waterName={plan?.primary_water?.name} stationName={plan?.primary_station?.station_name}
        actionText={execAction ? `${execAction.action}: ${execAction.title}` : (planLoading ? 'Đang lập kế hoạch…' : null)} />

      {/* Executive: dải cảnh báo — đọc trong 5 giây */}
      <ExecutiveAlertStrip alerts={alerts} plan={plan} planLoading={planLoading} onPlan={runPlan} />

      {/* ══ COMMAND WORKSPACE: Observe → Prioritize → Decide ══ */}
      <CxCommandStyles />
      <div className="cx-row" style={{ flexWrap: 'wrap' }} role="status" aria-label="Tình trạng lệnh">
        <span className={`cx-dot ${backendUp ? 'live' : 'bad'}`} />
        <b style={{ fontSize: 13 }}>{backendUp ? '● COMMAND ONLINE' : '○ OFFLINE'}</b>
        <span className="cx-mut">Cập nhật {updatedAt || '…'}</span>
        {demoMode && <span className="cx-chip demo">DEMO DATA</span>}
        {firms && firms.status !== 'LIVE' && firms.status !== 'DEMO' && <span className="cx-chip stale">{String(firms.status)}</span>}
      </div>
      <SectionHead kicker="00 · COMMAND" title="Điều hành tác chiến" />
      <CommandStatusStrip cells={stripCells} />
      <div className="cx-work" style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          <OperationalMapPreview live={liveCount === 2} />
          <div className="cx-duo2">
            <FieldIntel proposals={proposals} />
            <ResponsePanel assets={assets} missionsActive={missionsActive} />
          </div>
        </div>
        <div style={{ minWidth: 0 }}>
          <PriorityIncidents alerts={orderedAlerts} planAlert={planAlert} onOpen={setDrawerAlert} onPlan={runPlan} />
        </div>
      </div>
      <div className="cx-trio" style={{ marginTop: 12 }}>
        <AlertFeed events={events} />
        <DecisionPanel decisions={decisions} onDrawer={setDrawerAlert} onLink={(to) => nav(to)} />
        <PriorityHierarchy h={hier} />
      </div>
      <div className="cx-duo2" style={{ marginTop: 12 }}>
        <MissionMini missions={missionsApi} />
        <EnvContext twin={twin} />
      </div>

      {/* ══ PRIMARY: Risk → Why → Happening → Where ══ */}
      <SectionHead kicker="01 · PRIMARY" title="Rủi ro · Diễn giải AI · Dòng sự kiện · Bản đồ" />
      <div className="cx-grid cx-hero">
        <RiskIndexPanel loading={fireRiskLoading}
          score={fr?.risk_score ?? null} level={fr?.warning_level ?? null} label={fr?.label ?? null}
          confidence={fr?.confidence ?? null} sources={sources}
          signals={signals} basis={basis}
          analyzedAt={fr ? timeSec(fr.timestamp) : null}
          modelVersion={fr?.model_version || null}
          updated={fr ? `Nguồn: AI FireRisk · ${firms?.status || 'MISSING'}` : undefined} />
        <AISituationBrief loading={fireRiskLoading} brief={aiBrief} onOpenAI={openAI} />
      </div>

      <KPIBar loading={kpiLoading} items={[
        { key:'firms', label:'FIRMS HOTSPOTS', icon:<Flame size={15} />,
          value: firms ? hotspots.length : 'MISSING',
          sub: !firms ? 'DATA UNAVAILABLE' : firms.status !== 'LIVE' ? String(firms.status) : (hotspots.length === 0 ? 'No active detection' : `${hotspots.length} điểm`) },
        { key:'wind', label:'WIND', icon:<Wind size={15} />,
          value: (cur.wind_speed_10m ?? cur.windspeed) != null ? `${cur.wind_speed_10m ?? cur.windspeed} km/h` : 'MISSING',
          sub: windDeg != null ? windDir(windDeg) : (wx ? 'MISSING' : 'DATA UNAVAILABLE') },
        { key:'incidents', label:'ACTIVE INCIDENTS', icon:<AlertTriangle size={15} />,
          value: incidents === null ? 'MISSING' : incidents.length,
          sub: incidents === null ? 'DATA UNAVAILABLE' : (incidents.length === 0 ? 'No active incident' : `${incidents.length} đang xử lý`) },
        { key:'alerts', label:'ACTIVE ALERTS', icon:<Bell size={15} />,
          value: alerts.length,
          sub: criticalAlerts.length === 0 ? 'No critical alerts' : `${criticalAlerts.length} nghiêm trọng` },
      ]} />

      <LiveEventStream loading={auditLoading} events={events} />

      {/* ══ SECONDARY: Incidents + Assets + Situation ══ */}
      <SectionHead kicker="02 · SECONDARY" title="Sự cố · Tài sản · Tình hình" />
      <div className="cx-grid cx-half">
        <IncidentPanel loading={incidentsLoading} incidents={incidents} alertsCount={alerts.length} />
        <AssetStatusPanel assets={assets} />
      </div>
      <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(300px, 1fr))', gap:8}}>
        <CommandSummaryCard alerts={alerts} assets={assets} plan={plan} />
        <SituationBoard plan={plan} alerts={alerts} />
      </div>
      <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(300px, 1fr))', gap:8}}>
        <CommandBrief text={briefText} />
        <MissionBoard missions={missions} tone={levelTone(execLevel || undefined)} />
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
            {brief.nearest_water && <div>💧 Nguồn nước gần nhất: <b>{brief.nearest_water.name}</b> ({brief.nearest_water.distance_km} km{brief.nearest_water.capacity_m3 ? ` · ${brief.nearest_water.capacity_m3} m³` : brief.nearest_water.capacity_liters ? ` · ${brief.nearest_water.capacity_liters} L` : ''}{brief.nearest_water.priority ? ` · hạng ${brief.nearest_water.priority}` : ''})</div>}
            {brief.nearest_station && <div>🏕️ Trạm/tổ gần nhất: <b>{brief.nearest_station.name}</b> ({brief.nearest_station.distance_km} km)</div>}
            {(brief.watch_communes || []).length > 0 && <div style={{color:'#64748B'}}>Theo dõi: {brief.watch_communes.map((w:any)=> w.name).join(' · ')}</div>}
          </div>
        )}
      </Card>

      {/* ══ §11 Recommended actions (backend data only) ══ */}
      <RecommendedActions plan={plan} planLoading={planLoading} />

      {/* ══ OPERATIONS: Response Plan + Attack + Officer (giữ nguyên) ══ */}
      <SectionHead kicker="03 · OPERATIONS" title="Kế hoạch tác chiến · Phương án · Điều hành" />
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
            <div><b>{plan._title}</b> — CẤP <b>{plan.risk_summary?.level}</b> · điểm {plan.risk_summary?.score}/100 · tin cậy {plan.risk_summary?.confidence}% · trạng thái <b>{plan.command_status}</b> {plan._geoNote && <span style={{color:'#B45309'}}>({plan._geoNote})</span>} {plan.fire && <Link to={`/firesim?lat=${plan.fire.lat}&lon=${plan.fire.lon}`} style={{fontSize:11, color:'#0F766E', fontWeight:700}}> · 🔥 Mô phỏng 3D →</Link>}</div>
            <div>🌬️ Gió {plan.weather?.wind_speed_kmh ?? '?'} km/h → hướng {plan.weather?.wind_toward_deg ?? '?'}° · {plan.weather?.temperature ?? '?'}°C · ẩm {plan.weather?.humidity ?? '?'}%
              {plan.fwi && <span> · FWI cùng ngày: FFMC <b>{plan.fwi.ffmc}</b> / ISI <b>{plan.fwi.isi}</b> <span style={{color:'#64748B'}}>(Van Wagner, {plan.fwi.assumption})</span></span>}</div>
            <div>💧 {plan.primary_water ? <>Chính: <b>{plan.primary_water.name}</b> (hạng {plan.primary_water.priority}, {plan.primary_water.distance_km} km, ETA ~{plan.primary_water.eta_minutes} phút){plan.backup_water ? <> · Dự phòng: <b>{plan.backup_water.name}</b> ({plan.backup_water.distance_km} km)</> : ' · Không có dự phòng'}</> : 'Chưa có nguồn nước.'}</div>
            <div>🏕️ {plan.primary_station ? <>Chính: <b>{plan.primary_station.station_name}</b> ({plan.primary_station.distance_km} km, ~{plan.primary_station.eta_minutes} phút){plan.primary_station.contact ? <> · ☎ {plan.primary_station.contact}</> : ''}{plan.backup_station ? <> · Dự phòng: <b>{plan.backup_station.station_name}</b></> : ''}</> : 'Chưa có trạm/tổ.'}</div>
            <div>🛣️ {plan.primary_route ? <>{plan.primary_route.route_name} ({plan.primary_route.distance_km} km{plan.primary_route.road_condition ? ` · ${plan.primary_route.road_condition}` : ''}){plan.backup_route ? <> · Dự phòng: {plan.backup_route.route_name}</> : ''}</> : 'Chưa có tuyến.'}</div>
            {plan.affected_area && <div>📐 Vùng ảnh hưởng: tối đa <b>{plan.affected_area.max_area_ha} ha</b> · {plan.affected_area.n_communes} xã{plan.affected_area.communes?.length > 0 && <>: {plan.affected_area.communes.slice(0,5).join(', ')}</>}</div>}
            {(plan.spread?.steps || []).length > 0 && (
              <div>{plan.spread.steps.map((s:any)=> <span key={s.hour} style={{display:'inline-block', background:'#FEF2F2', borderRadius:8, padding:'4px 8px', marginRight:6, marginBottom:4}}>+{s.hour}h: {s.length_km} km · {s.area_ha} ha{(s.affected_communes?.length > 0) && <> · {s.affected_communes.map((c:any)=> c.name).join(', ')}</>}</span>)}</div>
            )}
            {(plan.asset_threats || []).filter((t:any)=> t.band !== 'SAFE').length > 0 && (
              <div>🛡️ Đe dọa tài sản: {plan.asset_threats.filter((t:any)=> t.band !== 'SAFE').slice(0,5).map((t:any)=> `${t.name} (${t.band}, ETA ${t.eta_hours}h)`).join(' · ')}</div>
            )}
            {(plan.water_threats || []).filter((t:any)=> t.band !== 'SAFE').length > 0 && (
              <div>🌊 Hồ bị đe dọa: {plan.water_threats.filter((t:any)=> t.band !== 'SAFE').slice(0,5).map((t:any)=> `${t.name} (${t.band})`).join(' · ')}</div>
            )}
            {plan.analyst_bulletin && (
              <div style={{background:'#F8FAFC', borderRadius:8, padding:8}}>
                <b>🔥 Bản tin AI (CẤP {plan.analyst_bulletin.cap_nguy_co?.level} · tin cậy {plan.analyst_bulletin.cap_nguy_co?.confidence}%)</b>
                <div>📍 {JSON.stringify(plan.analyst_bulletin.vi_tri)} · {plan.analyst_bulletin.tinh_hinh_chay}</div>
                <div>🌬️ {plan.analyst_bulletin.dieu_kien_thoi_tiet}</div>
                <div>📈 {plan.analyst_bulletin.huong_lan_du_kien}</div>
                <div>🏕️ {plan.analyst_bulletin.tram_trien_khai} · 💧 {plan.analyst_bulletin.nguon_nuoc_uu_tien} · 🛣️ {plan.analyst_bulletin.tuyen_tiep_can}</div>
                <div>❗ {(plan.analyst_bulletin.tai_san_bi_de_doa || []).join(' · ')}</div>
                {(plan.analyst_bulletin.hinh_anh_hien_truong || []).length > 0 && (
                  <div>🌐 {plan.analyst_bulletin.hinh_anh_hien_truong.join(' · ')}</div>
                )}
              </div>
            )}
            <div><b>🚒 Khuyến nghị:</b><ul style={{margin:'4px 0 4px 16px', padding:0}}>{(plan.tactical_recommendations || []).map((r:string, i:number)=> <li key={i}>{r}</li>)}</ul></div>
            {plan.earth_intelligence && <div>🧠 <b>Earth Intel:</b> {plan.earth_intelligence.recommended_action} <span style={{color:'#64748B'}}>(địa hình {plan.earth_intelligence.terrain_driver?.level} · nhiên liệu {plan.earth_intelligence.fuel_driver?.level} · thời tiết {plan.earth_intelligence.weather_driver?.level} · tiếp cận {plan.earth_intelligence.access_driver?.level})</span></div>}
            {(plan.deployment_plan || []).length > 0 && <div><b>📋 Triển khai:</b><ol style={{margin:'4px 0 4px 16px', padding:0}}>{plan.deployment_plan.map((d:any, i:number)=> <li key={i}>{d.detail}</li>)}</ol></div>}
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
        <Card>
          <b>🔥 Vùng rủi ro cao nhất</b>
          {(plan?.threatened_communities || []).length === 0 && <div style={{fontSize:12, color:'#64748B'}}>Chạy Response Plan ở trên để xếp hạng xã theo band.</div>}
          {(plan?.threatened_communities || []).slice(0,5).map((t:any)=> (
            <div key={t.code} style={{fontSize:12, display:'flex', justifyContent:'space-between', borderTop:'1px solid #F1F5F9', padding:'4px 0'}}>
              <span>{t.commune}</span><b>{t.band}{t.eta_hours != null && <> · ~{t.eta_hours}h</>}</b>
            </div>
          ))}
        </Card>
        <Card>
          <b>🚨 Cảnh báo điều hành</b>
          {((): any=> {
            const rows: string[] = []
            ;(alerts || []).filter((a:any)=> ['CRITICAL','V','IV'].includes(a.level)).slice(0,3)
              .forEach((a:any)=> rows.push(`${a.level} · ${a.title || a.risk_type}`))
            ;(plan?.threatened_assets || []).filter((t:any)=> t.band === 'CRITICAL').slice(0,3)
              .forEach((t:any)=> rows.push(`CRITICAL · ${t.name}`))
            if((plan?.risk_summary?.missing || []).length > 0)
              rows.push(`Thiếu dữ liệu: ${plan.risk_summary.missing.join(', ')}`)
            if(!rows.length) return <div style={{fontSize:12, color:'#64748B'}}>Không có cảnh báo mức cao.</div>
            return rows.map((r, i)=> <div key={i} style={{fontSize:12, borderTop:'1px solid #F1F5F9', padding:'4px 0'}}>{r}</div>)
          })()}
        </Card>
        <Card>
          <b>⚔️ Attack Plan</b>
          {!(plan?.deployment_plan || []).length && !(plan?.protection_plan || []).length &&
            <div style={{fontSize:12, color:'#64748B'}}>Chạy Response Plan để sinh phương án tấn công/phòng thủ.</div>}
          {(plan?.deployment_plan || []).slice(0,4).map((d:any, i:number)=> (
            <div key={i} style={{fontSize:12, borderTop:'1px solid #F1F5F9', padding:'4px 0'}}>▶ {d.detail}</div>
          ))}
          {(plan?.protection_plan || []).filter((p:any)=> p.protection === 'PROTECT_NOW').slice(0,3).map((p:any, i:number)=> (
            <div key={`p${i}`} style={{fontSize:12, borderTop:'1px solid #F1F5F9', padding:'4px 0'}}>🛡️ {p.detail}</div>
          ))}
        </Card>
        <Card>
          <b>🎖️ Operations Officer — TOP 5</b>
          {!(plan?.top_actions || []).length &&
            <div style={{fontSize:12, color:'#64748B'}}>Chạy Response Plan để sinh 5 hành động.</div>}
          {(plan?.top_actions || []).map((a:any, i:number)=> (
            <div key={i} style={{fontSize:12, borderTop:'1px solid #F1F5F9', padding:'4px 0'}}>
              <b>{a.action}</b> · {a.title}: {a.unit || 'MISSING'} <span style={{color:'#64748B'}}>({a.confidence})</span>
            </div>
          ))}
          {plan?.earth_intelligence?.best_intervention &&
            <div style={{fontSize:12, marginTop:4, background:'#EFF6FF', borderRadius:8, padding:6}}><b>Can thiệp tốt nhất:</b> {plan.earth_intelligence.best_intervention}</div>}
        </Card>
        <Card>
          <b>🧠 Risk Drivers</b>
          {!plan?.earth_intelligence &&
            <div style={{fontSize:12, color:'#64748B'}}>Chạy Response Plan để xem driver.</div>}
          {plan?.earth_intelligence && (
            <div style={{fontSize:12}}>
              <div>Chủ đạo: <b>{plan.earth_intelligence.major_risk_driver}</b> · Nút thắt: <b>{plan.earth_intelligence.major_bottleneck}</b></div>
              <div style={{color:'#64748B'}}>Địa hình {plan.earth_intelligence.terrain_driver?.level} · Nhiên liệu {plan.earth_intelligence.fuel_driver?.level} · Thời tiết {plan.earth_intelligence.weather_driver?.level} · Tiếp cận {plan.earth_intelligence.access_driver?.level}</div>
              {plan?.fire_behavior && <div style={{marginTop:4}}>🔥 <b>{plan.fire_behavior.behavior}</b> · {plan.fire_behavior.why}</div>}
            </div>
          )}
        </Card>
        <Card>
          <b>🛡️ Community Shield</b>
          {(plan?.threatened_communities || []).length === 0 &&
            <div style={{fontSize:12, color:'#64748B'}}>Chạy Response Plan để chấm shield.</div>}
          {(plan?.threatened_communities || []).slice(0,5).map((t:any)=> (
            <div key={t.code} title={`Nước: ${t.shield_components?.water_availability || '?'} · Trạm: ${t.shield_components?.response_availability || '?'} · Địa hình: ${t.shield_components?.terrain_difficulty || '?'}`} style={{fontSize:12, display:'flex', justifyContent:'space-between', borderTop:'1px solid #F1F5F9', padding:'4px 0'}}>
              <span>{t.commune}</span><b>{t.shield || t.band}</b>
            </div>
          ))}
        </Card>
      </div>
      <style>{`.card{background:#fff; border:1px solid #E2E8E5; border-radius:12px; padding:12px}`}</style>
      {drawerAlert && (
        <IncidentDrawer
          alert={drawerAlert} plan={plan} showPlan={planAlert === drawerAlert?.id}
          proposals={proposals} planLoading={planLoading}
          onClose={() => setDrawerAlert(null)} onRunPlan={runPlan}
        />
      )}
    </div>
  )
}
