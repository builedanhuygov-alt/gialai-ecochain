import { MetricCard, AIInsightCard, AlertCard } from '../components/Cards'
import MapView from '../components/MapView'
import WeatherCard from '../components/WeatherCard'
import { StaggerContainer, StaggerItem } from '../motion/primitives'
import { mockKPIs, mockAlerts } from '../services/mockProvider'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LineChart, Line, ResponsiveContainer } from 'recharts'
import { api, API_BASE } from '../services/api'

const RISK_ICON: Record<string,string> = { FIRE:'🔥', FLOOD:'🌊', LANDSLIDE:'⛰️', DROUGHT:'☀️', HEAT:'🌡️' }

function isDemoOrigin(o: unknown){
  return /DEMO|SIMULATED|MOCK/i.test(String(o || ''))
}

export default function Dashboard() {
  const [selected, setSelected] = useState<string|null>(null)
  const [selectedInfo, setSelectedInfo] = useState<any|null>(null)
  const [pending, setPending] = useState<string[]>([])
  const [kpis, setKpis] = useState<any[]|null>(null)
  const [liveAlerts, setLiveAlerts] = useState<any[]|null>(null)
  const [trend, setTrend] = useState<any[]|null>(null)
  const [badge, setBadge] = useState('ĐANG TẢI…')
  const nav = useNavigate()

  useEffect(()=>{
    // real commune/station name clicked on the map (MapView dispatches this)
    const h = (e: any)=> setSelected(e.detail?.area || null)
    window.addEventListener('ecochain-select-area', h)
    return ()=> window.removeEventListener('ecochain-select-area', h)
  },[])

  useEffect(()=>{
    // KPIs + alerts come from real backend endpoints. mockProvider is ONLY a
    // labeled offline fallback — never presented as live data.
    Promise.all([
      api.forestStats().catch(()=> null),
      api.riskOverview().catch(()=> null),
      api.dashboard().catch(()=> null),
      api.alertList('ACTIVE').catch(()=> []),
    ]).then(([stats, overview, green, alerts]: any[])=>{
      const origins = [stats?.origin, overview?.origin, green?.origin].filter(Boolean)
      if(!stats && !overview && !green){
        setBadge('NGOẠI TUYẾN — SỐ MINH HỌA')
        setKpis(null); setLiveAlerts(null)
        return
      }
      setBadge(origins.some(isDemoOrigin) ? 'DỮ LIỆU DEMO' : 'DỮ LIỆU TRỰC TIẾP')
      const num = (v: unknown)=> typeof v === 'number' ? v : 0
      setKpis([
        { label:'Vùng giám sát', value:String(num(stats?.areas_monitored)), unit:'vùng', trend:'trực tiếp', dir:'flat', status:'good' },
        { label:'Tín hiệu chờ xử lý', value:String(num(stats?.pending_signals)), unit:'', trend:'trực tiếp', dir:'flat', status:'warn' },
        { label:'Cộng đồng đã xác minh', value:String(num(stats?.community_verified)), unit:'', trend:'trực tiếp', dir:'flat', status:'good' },
        { label:'Cảnh báo nghiêm trọng', value:String(num(overview?.critical_alerts)), unit:'', trend:'trực tiếp', dir:'flat', status:'danger' },
        { label:'Rủi ro cao', value:String(num(stats?.high_risk)), unit:'vùng', trend:'trực tiếp', dir:'flat', status:'warn' },
        { label:'Trang trại truy xuất', value:String(num(green?.traceable_farms)), unit:'', trend:'trực tiếp', dir:'flat', status:'neutral' },
        { label:'Lô EUDR sẵn sàng', value:String(num(green?.eudr_ready_lots)), unit:'', trend:'trực tiếp', dir:'flat', status:'neutral' },
        { label:'Tuyến xanh', value:String(num(green?.green_routes)), unit:'', trend:'trực tiếp', dir:'flat', status:'neutral' },
      ])
      const rows = Array.isArray(alerts) ? alerts.slice(0,3) : []
      setLiveAlerts(rows.map((a:any)=> ({
        id: a.id,
        icon: RISK_ICON[String(a.risk_type||'').toUpperCase()] || '⚠️',
        title: a.title || `${a.risk_type || 'Cảnh báo'} — ${a.level || ''}`,
        loc: a.administrative_unit_id || '',
        time: String(a.created_at || '').slice(0,16).replace('T',' '),
        status: a.status || '',
      })))
    }).catch(()=> { setBadge('NGOẠI TUYẾN — SỐ MINH HỌA'); setKpis(null); setLiveAlerts(null) })
    // trend from real risk history; empty state when no records yet
    api.riskHistory('Gia Lai').then((h:any)=>{
      const recs = Array.isArray(h?.records) ? h.records : []
      setTrend(recs.length ? recs.slice(-12).map((r:any)=> ({ v: r.score })) : [])
    }).catch(()=> setTrend([]))
  },[])

  useEffect(()=>{
    // real pending work: PENDING approvals + ACTIVE alerts
    const API = API_BASE
    Promise.all([
      fetch(`${API}/api/approvals`).then(r=> r.ok ? r.json() : []).catch(()=> []),
      api.alertList().catch(()=> []),
    ]).then(([ap, al]: any[])=>{
      const items: string[] = []
      const pa = (Array.isArray(ap) ? ap : []).filter((a:any)=> a.status === 'PENDING').slice(0,2)
      pa.forEach((a:any)=> items.push(`Duyệt ${a.action || 'hành động'} — kế hoạch ${String(a.plan_id || '').slice(0,8)}`))
      const aa = (Array.isArray(al) ? al : []).filter((a:any)=> a.status === 'ACTIVE').slice(0, 3 - pa.length)
      aa.forEach((a:any)=> items.push(`${a.title || 'Cảnh báo'} — ${a.administrative_unit_id || ''}`))
      setPending(items)
    }).catch(()=> {})
  },[])

  useEffect(()=>{
    if(!selected){ setSelectedInfo(null); return }
    api.riskProfile(selected).then(setSelectedInfo).catch(()=> setSelectedInfo(null))
  },[selected])

  const askAI = (area: string)=>{
    window.dispatchEvent(new CustomEvent('ecochain-open-ai', { detail:{ query: `Phân tích nguy cơ cháy rừng tại ${area}, Gia Lai` } }))
  }
  const shownKpis = kpis || mockKPIs
  const shownAlerts = liveAlerts || mockAlerts
  return (
    <div className="dash">
      <div className="welcome">
        <div style={{display:'flex', gap:12, alignItems:'center'}}>
          <img src="/logo.svg" alt="GIALAI EcoChain" style={{width:48, height:48, borderRadius:12}} />
          <div>
            <h1>GIALAI EcoChain — Trí tuệ Môi trường Gia Lai</h1>
            <p>Hiện trạng · Rủi ro ở đâu? · Vì sao? · Cần làm gì?</p>
          </div>
        </div>
        <span className="demo-badge">{badge}</span>
      </div>

      <StaggerContainer>
        <div className="kpi-grid">
          {shownKpis.slice(0,4).map(k=> <StaggerItem key={k.label}><MetricCard {...k} icon={<span>●</span>} /></StaggerItem>)}
        </div>
        <div className="kpi-grid">
          {shownKpis.slice(4,8).map(k=> <StaggerItem key={k.label}><MetricCard {...k} icon={<span>■</span>} /></StaggerItem>)}
        </div>
      </StaggerContainer>

      <WeatherCard />
      <MapView onSelect={(_t, id)=> setSelected(id)} />

      {selected && (
        <div className="panel">
          <h3>{selected}{selectedInfo ? ` — Điểm rủi ro ${selectedInfo.overall_score ?? '?'}/100 (${selectedInfo.overall_level ?? ''})` : ' — chưa có dữ liệu'}</h3>
          <div className="panel-grid">
            <div>Mức: {selectedInfo?.overall_level || '—'}</div>
            <div>Độ tin cậy: {selectedInfo?.confidence ?? '—'}%</div>
            <div>Yếu tố: {selectedInfo?.breakdown ? Object.keys(selectedInfo.breakdown).length : 0}</div>
            <div>Nguồn: API trực tiếp</div>
          </div>
          <div className="panel-actions">
            <button className="btn primary" onClick={()=> nav('/forest')}>Xem chi tiết</button>
            <button className="btn" onClick={()=> askAI(selected)}>Chạy phân tích AI</button>
            <button className="btn" onClick={()=> nav('/what-if')}>Xem kịch bản</button>
            <button className="btn" onClick={()=> nav('/missions')}>Tạo nhiệm vụ</button>
          </div>
        </div>
      )}

      <div className="two-col">
        <AIInsightCard />
        <div className="alerts">
          <div className="card-title">CẢNH BÁO{liveAlerts ? '' : ' (MINH HỌA)'}</div>
          {shownAlerts.map(a=> <AlertCard key={a.id} {...a} />)}
        </div>
      </div>

      <div className="two-col">
        <div className="chart-card">
          <div className="card-title">Xu hướng rủi ro</div>
          <div style={{height:160}}>
            {trend === null && <div style={{fontSize:13, color:'#64748B'}}>Đang tải…</div>}
            {trend !== null && trend.length === 0 && <div style={{fontSize:13, color:'#64748B'}}>Chưa có dữ liệu lịch sử — chạy phân tích để tạo bản ghi.</div>}
            {trend !== null && trend.length > 0 && (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend}>
                <Line type="monotone" dataKey="v" stroke="#0F766E" strokeWidth={2} dot={false}/>
              </LineChart>
            </ResponsiveContainer>
            )}
          </div>
        </div>
        <div className="chart-card">
          <div className="card-title">Việc chờ xử lý</div>
          <ul className="action-list">
            {pending.length === 0 && <li>Không có việc tồn đọng 🎉</li>}
            {pending.map((p, i)=> <li key={i}>{p}</li>)}
          </ul>
        </div>
      </div>

      <style>{`
        .dash{ display:flex; flex-direction:column; gap:18px; }
        .welcome{ background:#fff; border:1px solid #E2E8E5; border-radius:16px; padding:18px; display:flex; justify-content:space-between; align-items:center; }
        .welcome h1{ font-size:18px; font-weight:800; margin:0; }
        .welcome p{ font-size:13px; color:#64748B; margin:4px 0 0; }
        .demo-badge{ background:#FEF3C7; color:#92400E; padding:6px 10px; border-radius:999px; font-size:11px; font-weight:700; }
        .kpi-grid{ display:grid; grid-template-columns: repeat(4, 1fr); gap:14px; }
        .panel{ background:#fff; border:1px solid #E2E8E5; border-radius:16px; padding:16px; }
        .panel-grid{ display:grid; grid-template-columns: repeat(4,1fr); gap:12px; margin:12px 0; font-size:13px; }        .panel-actions{ display:flex; gap:8px; flex-wrap:wrap; }
        .btn{ padding:8px 12px; border-radius:999px; border:1px solid #E2E8E5; background:#fff; font-size:13px; }
        .btn.primary{ background:#0F766E; color:#fff; border-color:#0F766E; }
        .two-col{ display:grid; grid-template-columns: 1fr 1fr; gap:14px; }
        .chart-card, .alerts{ background:#fff; border:1px solid #E2E8E5; border-radius:16px; padding:16px; }
        .card-title{ font-size:12px; letter-spacing:0.6px; font-weight:700; color:#0F1E1A; margin-bottom:10px; }
        .action-list{ margin:0; padding-left:18px; font-size:13px; display:flex; flex-direction:column; gap:8px; }
        @media (max-width: 1100px){ .kpi-grid{ grid-template-columns: repeat(2,1fr); } .two-col{ grid-template-columns:1fr; } }
        @media (max-width: 600px){ .kpi-grid{ grid-template-columns:1fr; } .panel-grid{ grid-template-columns: repeat(2,1fr); } }
      `}</style>
    </div>
  )
}
