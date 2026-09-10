import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api, API_BASE } from '../services/api'

type SavedSim = {
  id: string
  scenario: string
  params: Record<string, number>
  affected: { villages: number; roads: number; farms: number }
  scores: Record<string, number>
}

const UI2TYPE: Record<string, string> = {
  Flood: 'DISASTER', Heat: 'CLIMATE', Forest: 'FOREST', Road: 'LOGISTICS', Compound: 'COMPOUND',
}
const SCENARIOS = Object.keys(UI2TYPE)
const INTERVENTIONS = ['No intervention', 'Pre-position team', 'Close road + reroute'] as const
const SCORE_METRICS = [
  ['risk', 'Rủi ro'], ['cost', 'Chi phí'], ['co2', 'CO₂'],
  ['forest', 'Rừng'], ['logistics', 'Logistics'], ['resilience', 'Chống chịu'],
] as const

const riskColor = (r?: string) =>
  r === 'HIGH' ? '#DC2626' : r === 'MODERATE' ? '#F59E0B' : '#0F766E'

function Slider({ label, value, min, max, unit, onChange }: {
  label: string; value: number; min: number; max: number; unit: string; onChange: (v: number)=>void
}){
  return (
    <label style={{display:'block', fontSize:13}}>
      <div style={{display:'flex', justifyContent:'space-between'}}><span>{label}</span><b>+{value}{unit}</b></div>
      <input type="range" min={min} max={max} value={value} onChange={e=> onChange(Number(e.target.value))} style={{width:'100%'}} aria-label={label} />
    </label>
  )
}

export default function WhatIfLab(){
  const [scenario, setScenario] = useState<string>('Flood')
  const [rain, setRain] = useState(20)
  const [heat, setHeat] = useState(2)
  const [forestLoss, setForestLoss] = useState(500)
  const [roadHours, setRoadHours] = useState(48)
  const [baseline, setBaseline] = useState<any>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [slots, setSlots] = useState<SavedSim[]>([])
  const [serverCompare, setServerCompare] = useState<any>(null)
  const [intervention, setIntervention] = useState<string>(INTERVENTIONS[0])
  const [resp, setResp] = useState<any>(null)
  const [cascade, setCascade] = useState<any>(null)
  const [cascadeFor, setCascadeFor] = useState('')
  const [question, setQuestion] = useState('')

  useEffect(()=>{
    fetch(`${API_BASE}/api/risk/overview`)
      .then(r=>r.json()).then(j=> setBaseline(j)).catch(()=> setBaseline({ overall:42 }));
    // reload persisted scenarios (WhatIfEngine) so refresh doesn't lose work
    (async ()=>{
      try{
        const list: any = await api.scenariosList()
        const last = (Array.isArray(list) ? list : []).slice(-3)
        const hydrated: SavedSim[] = []
        for(const s of last){
          try{
            const [full, card]: any[] = await Promise.all([
              api.scenarioGet(s.id).catch(()=> ({})),
              api.scenarioScorecard(s.id).catch(()=> ({})),
            ])
            const sc = { ...card, ...(full.score || {}) }
            hydrated.push({
              id: s.id, scenario: full.name || s.name || s.type || 'Scenario',
              params: full.params || {},
              affected: { villages: 0, roads: 0, farms: 0 },
              scores: {
                risk: sc.risk ?? 50, cost: sc.cost ?? 50, co2: sc.co2 ?? 50,
                forest: sc.forest ?? 50, logistics: sc.logistics ?? 50, resilience: sc.resilience ?? 50,
              },
            })
          }catch{}
        }
        if(hydrated.length){
          setSlots(hydrated)
          setServerCompare(await api.scenariosCompare(hydrated.map(x=> x.id)).catch(()=> null))
        }
      }catch{}
    })()
  },[])

  const params = { rainfall_pct: rain, heat_c: heat, forest_loss_ha: forestLoss, road_closure_h: roadHours }

  const run = async ()=>{
    setRunning(true); setError('')
    try{
      // 1) affected counts (simulation_engine) + 2) persisted scenario + 9-dim score (WhatIfEngine)
      const [sim, sc] = await Promise.all([
        api.simWhatIf(scenario, params),
        api.scenarioCreate(`${scenario} ${rain}%/${heat}°/${forestLoss}ha/${roadHours}h`, UI2TYPE[scenario], params),
      ])
      const scores: any = await api.scenarioScorecard(sc.id)
      const slot: SavedSim = {
        id: sc.id, scenario,
        params: { ...params },
        affected: sim.result?.affected ?? { villages: 0, roads: 0, farms: 0 },
        scores: {
          risk: scores.risk ?? 50, cost: scores.cost ?? 50, co2: scores.co2 ?? 50,
          forest: scores.forest ?? 50, logistics: scores.logistics ?? 50, resilience: scores.resilience ?? 50,
        },
      }
      const next = [...slots.slice(-2), slot]
      setSlots(next)
      setServerCompare(await api.scenariosCompare(next.map(s=> s.id)).catch(()=> null))
    }catch(e:any){ setError(String(e.message || e)) }
    finally{ setRunning(false) }
  }

  const runIntervention = async (v: string)=>{
    setIntervention(v)
    try{ setResp(await api.simResponse(v)) }catch(e:any){ setResp({ error: String(e.message || e) }) }
  }

  const showCascade = async (s: SavedSim)=>{
    if(cascadeFor === s.id){ setCascadeFor(''); setCascade(null); return }
    setCascadeFor(s.id)
    try{ setCascade(await api.simCascade(s.scenario)) }catch(e:any){ setCascade({ error: String(e.message || e) }) }
  }

  const askNL = async ()=>{
    const q = question.trim()
    if(!q) return
    setError('')
    try{
      const r: any = await api.nlWhatIf(q)
      const p = r.params || {}
      const num = (v: any) => { const m = String(v ?? '').match(/-?\d+/); return m ? Number(m[0]) : null }
      const rr = num(p.rainfall); if(rr !== null) setRain(Math.min(60, Math.abs(rr)))
      const hh = num(p.road_closure); if(hh !== null) setRoadHours(Math.min(120, Math.abs(hh)))
      const ff = num(p.forest_loss); if(ff !== null) setForestLoss(Math.min(2000, Math.abs(ff)))
      if(r.scenario_id) setError(`Đã parse câu hỏi → scenario ${r.scenario_id}. Kéo slider kiểm tra rồi bấm Chạy.`)
    }catch(e:any){ setError(String(e.message || e)) }
  }

  const chartData = SCORE_METRICS.map(([k, label])=> ({
    metric: label,
    ...Object.fromEntries(slots.map((s, i)=> [`${String.fromCharCode(65+i)} · ${s.scenario}`, s.scores[k] ?? 0])),
  }))
  const slotColors = ['#0F766E', '#F59E0B', '#6366F1']
  const worst = slots.length > 1
    ? slots.reduce((a, b)=> (a.scores.risk ?? 0) >= (b.scores.risk ?? 0) ? a : b)
    : null

  return (
    <div style={{display:'flex', flexDirection:'column', gap:16}}>
      <h1>What-if Lab — Mô phỏng tương lai (Digital Twin)</h1>

      <div style={{background:'#fff', border:'1px solid #E2E8E5', borderRadius:16, padding:16}}>
        <h3>1 · Dựng kịch bản</h3>
        <div style={{display:'flex', gap:8, flexWrap:'wrap', marginBottom:12}}>
          {SCENARIOS.map(s=> (
            <button key={s} onClick={()=> setScenario(s)} style={{background: scenario===s ? '#0B1412' : '#F1F5F3', color: scenario===s ? '#fff' : '#0B1412', padding:'8px 12px', borderRadius:999, border:0}}>{s}</button>
          ))}
        </div>
        <div className="ctl-grid">
          <Slider label="🌧 Mưa tăng" value={rain} min={0} max={60} unit="%" onChange={setRain} />
          <Slider label="🌡 Nóng thêm" value={heat} min={0} max={5} unit="°C" onChange={setHeat} />
          <Slider label="🔥 Mất rừng" value={forestLoss} min={0} max={2000} unit=" ha" onChange={setForestLoss} />
          <Slider label="🛣 Đóng đường" value={roadHours} min={0} max={120} unit="h" onChange={setRoadHours} />
        </div>
        <div style={{display:'flex', gap:8, marginTop:12}}>
          <input value={question} onChange={e=> setQuestion(e.target.value)} placeholder="Hỏi bằng tiếng Việt, vd: mưa lớn 30%, quốc lộ tắc 48h…" aria-label="Hỏi kịch bản" style={{flex:1, border:'1px solid #E2E8E5', borderRadius:999, padding:'8px 14px', fontSize:13}} onKeyDown={e=> { if(e.key === 'Enter') askNL() }} />
          <button onClick={askNL} style={{background:'#fff', border:'1px solid #0F766E', color:'#0F766E', padding:'8px 14px', borderRadius:999}}>Parse → slider</button>
        </div>
        <button onClick={run} disabled={running} style={{marginTop:12, background:'#0F766E', color:'#fff', padding:'10px 20px', borderRadius:999, border:0, fontWeight:700}}>
          {running ? 'Đang mô phỏng...' : `▶ Chạy ${scenario} → lưu slot ${String.fromCharCode(65 + (slots.length % 3))}`}
        </button>
        {error && <div style={{marginTop:8, fontSize:13, color:'#92400E', background:'#FEF3C7', padding:'6px 10px', borderRadius:8}}>{error}</div>}
        <div style={{fontSize:12, color:'#64748B', marginTop:8}}>Baseline rủi ro hiện tại: {baseline?.overall ?? '…'} · Nguồn: vệ tinh + thời tiết + FIRMS · {baseline ? 'LIVE' : 'DEMO DATA'} · Kịch bản được lưu DB (WhatIfEngine)</div>
      </div>

      {slots.length > 0 && (
        <div style={{background:'#fff', border:'1px solid #E2E8E5', borderRadius:16, padding:16}}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
            <h3>2 · So sánh kịch bản A/B/C ({slots.length}/3)</h3>
            <button onClick={()=> { setSlots([]); setServerCompare(null) }} style={{fontSize:12, background:'#fff', border:'1px solid #E2E8E5', borderRadius:999, padding:'4px 10px'}}>Xóa hết</button>
          </div>
          {worst && <div style={{fontSize:13, marginBottom:8}}>Rủi ro cao nhất (server compare baseline <b>{serverCompare?.baseline ?? '…'}</b>): <b>slot {String.fromCharCode(65 + slots.indexOf(worst))} · {worst.scenario}</b> — risk {worst.scores.risk}</div>}
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="metric" />
              <YAxis domain={[0, 100]} />
              <Tooltip />
              <Legend />
              {slots.map((s, i)=> <Bar key={s.id} dataKey={`${String.fromCharCode(65+i)} · ${s.scenario}`} fill={slotColors[i % 3]} />)}
            </BarChart>
          </ResponsiveContainer>
          <div className="slot-grid" style={{marginTop:10}}>
            {slots.map((s, i)=> (
              <div key={s.id} style={{border:'1px solid #E2E8E5', borderRadius:12, padding:10, fontSize:12, lineHeight:1.7}}>
                <b>Slot {String.fromCharCode(65+i)} · {s.scenario}</b> <span style={{color:'#64748B'}}>id {String(s.id).slice(0,8)}</span><br/>
                {s.params.rainfall_pct !== undefined ? <>Mưa +{s.params.rainfall_pct}% · +{s.params.heat_c}°C · {s.params.forest_loss_ha} ha · {s.params.road_closure_h}h<br/></> : <>Kịch bản đã lưu trong DB<br/></>}
                🏘 {s.affected.villages} làng · 🛣 {s.affected.roads} đường · 🚜 {s.affected.farms} trại<br/>
                Risk {s.scores.risk} · CO₂ {s.scores.co2} · Rừng {s.scores.forest} · Chống chịu {s.scores.resilience}<br/>
                <button onClick={()=> showCascade(s)} style={{fontSize:11, marginTop:4, background:'#EFF6FF', border:'1px solid #BFDBFE', borderRadius:999, padding:'2px 8px'}}>⛓ Cascade {cascadeFor === s.id ? '▴' : '▾'}</button>{' '}
                <button onClick={()=> setSlots(x => x.filter(y => y.id !== s.id))} style={{fontSize:11, marginTop:4, background:'#fff', border:'1px solid #E2E8E5', borderRadius:999, padding:'2px 8px'}}>Xóa</button>
                {cascadeFor === s.id && cascade && !cascade.error && (
                  <div style={{marginTop:6, background:'#F8FAF9', borderRadius:8, padding:8}}>
                    <div>⛓ {(cascade.cascade || []).join(' → ')}</div>
                    <div style={{marginTop:4}}>{Object.entries(cascade.temporal || {}).map(([t, v])=> <div key={t}><b>{t}</b>: {String(v)}</div>)}</div>
                    {cascade.spatial && <div style={{marginTop:4, color:'#64748B'}}>Bắt đầu: {cascade.spatial.starts} · Lan: {cascade.spatial.affected} · {cascade.spatial.spreads}</div>}
                  </div>
                )}
                {cascadeFor === s.id && cascade?.error && <div style={{color:'#DC2626'}}>{cascade.error}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{background:'#0B1412', color:'#fff', borderRadius:16, padding:16}}>
        <h3 style={{color:'#fff'}}>3 · Thử biện pháp ứng phó</h3>
        <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
          {INTERVENTIONS.map(v=> (
            <button key={v} onClick={()=> runIntervention(v)} style={{background: intervention===v ? '#0F766E' : '#1F2937', color:'#fff', padding:'8px 12px', borderRadius:999, border:0}}>{v}</button>
          ))}
        </div>
        {resp && !resp.error && (
          <div style={{marginTop:10, fontSize:14}}>Rủi ro còn lại: <b style={{color: riskColor(resp.risk)}}>{resp.risk}</b> <span style={{fontSize:11, color:'#94A3B8'}}>với “{resp.intervention}”</span></div>
        )}
        {resp?.error && <div style={{marginTop:8, fontSize:13, color:'#FCA5A5'}}>{resp.error}</div>}
      </div>

      <Link to="/missions" style={{background:'#0F766E', color:'#fff', padding:'10px', borderRadius:999, textAlign:'center', textDecoration:'none'}}>TẠO NHIỆM VỤ PHẢN HỒI →</Link>
      <div style={{fontSize:12, color:'#64748B'}}>Mô phỏng là kịch bản phân tích (seeded, chạy lại ra số giống nhau), không phải dự báo chắc chắn. Dữ liệu: vệ tinh + thời tiết + FIRMS · <span style={{background:'#FEF3C7', padding:'2px 6px', borderRadius:999}}>DEMO DATA nếu GEE chưa LIVE</span></div>
    </div>
  )
}
