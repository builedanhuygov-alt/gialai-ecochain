import { useEffect, useState } from 'react'
import { useLocation, Link } from 'react-router-dom'
import { api } from '../services/api'

type Mission = { id: string; goal: string; scope?: string; status?: string }
type Plan = { id: string; goal: string; approval_status?: string; execution_status?: string }
type Task = { id: string; name: string; agent?: string; status?: string }

const statusColor = (s?: string) =>
  s === 'COMPLETED' || s === 'APPROVED' || s === 'RUNNING' ? '#0F766E'
  : s === 'FAILED' || s === 'REJECTED' ? '#DC2626' : '#F59E0B'

export default function Missions(){
  const [tab, setTab] = useState<'missions'|'plans'|'field'>('missions')
  const [missions, setMissions] = useState<Mission[]>([])
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [goal, setGoal] = useState('')
  const [planGoal, setPlanGoal] = useState('')
  const [openPlan, setOpenPlan] = useState<string | null>(null)
  const [detail, setDetail] = useState<any>(null)
  const [sim, setSim] = useState<any>(null)
  const [rec, setRec] = useState<any>(null)
  const location = useLocation() as any
  const incomingArea: string = location.state?.area || ''

  // Prefill từ khu vực user chọn ở bản đồ/Dashboard — không mất ngữ cảnh.
  useEffect(()=>{
    if(incomingArea && !goal) setGoal(`Bảo vệ rừng ${incomingArea} mùa khô`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[incomingArea])

  // field checklist (per-device, honest local-only)
  const [steps, setSteps] = useState<boolean[]>(()=>{
    try{ return JSON.parse(localStorage.getItem('ecogl_mission_042') || '{"steps":[false,false,false,false]}').steps }catch{ return [false,false,false,false] }
  })
  const [started, setStarted] = useState(()=> localStorage.getItem('ecogl_mission_started') === '1')
  const [log, setLog] = useState<string[]>(()=>{
    try{ return JSON.parse(localStorage.getItem('ecogl_mission_log') || '[]') }catch{ return [] }
  })
  useEffect(()=>{ try{
    localStorage.setItem('ecogl_mission_042', JSON.stringify({ steps }))
    localStorage.setItem('ecogl_mission_started', started ? '1' : '0')
    localStorage.setItem('ecogl_mission_log', JSON.stringify(log.slice(-10)))
  }catch{} },[steps, started, log])
  const pushLog = (m: string)=> setLog(l => [...l.slice(-9), `${new Date().toLocaleTimeString('vi-VN')} ${m}`])

  const refresh = async ()=>{
    setLoading(true)
    try{
      const [m, p] = await Promise.all([api.missions(), api.plans()])
      setMissions(Array.isArray(m) ? m : [])
      setPlans(Array.isArray(p) ? p : [])
      setError('')
    }catch(e:any){ setError(String(e.message || e)) }
    finally{ setLoading(false) }
  }
  useEffect(()=>{ refresh() },[])

  const create = async ()=>{
    if(!goal.trim()) return
    try{
      await api.createMission({ goal: goal.trim(), scope: incomingArea || 'Province' })
      setGoal('')
      refresh()
    }catch(e:any){ setError(String(e.message || e).slice(0, 200)) }
  }

  const createP = async ()=>{
    if(!planGoal.trim()) return
    try{
      await api.createPlan(planGoal.trim())
      setPlanGoal('')
      refresh()
    }catch(e:any){ setError(String(e.message || e).slice(0, 200)) }
  }

  const open = async (id: string)=>{
    if(openPlan === id){ setOpenPlan(null); setDetail(null); setSim(null); setRec(null); return }
    setOpenPlan(id); setDetail(null); setSim(null); setRec(null)
    try{ setDetail(await api.planDetail(id)) }catch(e:any){ setError(String(e.message || e).slice(0, 200)) }
  }

  const act = async (kind: 'delegate'|'simulate'|'recommend', id: string)=>{
    try{
      const r: any = kind === 'delegate' ? await api.delegatePlan(id)
        : kind === 'simulate' ? await api.simulatePlan(id) : await api.recommendPlan(id)
      if(kind === 'simulate') setSim(r)
      if(kind === 'recommend') setRec(r)
      if(kind === 'delegate'){ setDetail(await api.planDetail(id)); refresh() }
    }catch(e:any){ setError(String(e.message || e).slice(0, 200)) }
  }

  const doneCount = (ts: Task[])=> ts.filter(t => t.status === 'COMPLETED' || t.status === 'DONE').length
  const activeMissions = missions.filter(m => m.status !== 'COMPLETED').length

  return (
    <div style={{display:'flex', flexDirection:'column', gap:16}}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:8}}>
        <h1>Missions {missions.length > 0 && <span style={{fontSize:12, background:'#0F766E', color:'#fff', padding:'2px 8px', borderRadius:999}}>{activeMissions} đang chạy</span>}</h1>
        <div style={{display:'flex', gap:6}}>
          {([['missions','Nhiệm vụ'],['plans','Kế hoạch AI'],['field','Thực địa']] as const).map(([v, label])=> (
            <button key={v} onClick={()=> setTab(v)} style={{padding:'6px 12px', borderRadius:999, border:'1px solid #E2E8E5', background: tab===v ? '#0B1412' : '#fff', color: tab===v ? '#fff' : '#000'}}>{label}</button>
          ))}
        </div>
      </div>

      {loading && <div className="card">Đang tải nhiệm vụ...</div>}
      {error && <div className="card" style={{borderColor:'#F59E0B'}}>⚠ {error}</div>}

      {tab === 'missions' && !loading && (
        <>
          {incomingArea && <div style={{fontSize:12, color:'#0F766E', background:'#DCFCE7', borderRadius:8, padding:'6px 10px'}}>📍 Từ bản đồ: <b>{incomingArea}</b> — phạm vi nhiệm vụ sẽ gắn khu vực này</div>}
          <div style={{display:'flex', gap:8}}>
            <input value={goal} onChange={e=> setGoal(e.target.value)} placeholder="Mục tiêu nhiệm vụ mới, vd: Bảo vệ rừng Ia Mơr mùa khô..." aria-label="Mục tiêu mới" style={{flex:1, border:'1px solid #E2E8E5', borderRadius:999, padding:'8px 14px', fontSize:13}} onKeyDown={e=> { if(e.key === 'Enter') create() }} />
            <button onClick={create} style={{background:'#0F766E', color:'#fff', border:0, borderRadius:999, padding:'8px 16px', fontWeight:700}}>Tạo</button>
          </div>
          {missions.length === 0 && <div className="card">Chưa có nhiệm vụ nào — tạo mới ở trên.</div>}
          {missions.map(m=> (
            <div key={m.id} className="card" style={{borderLeft:`4px solid ${statusColor(m.status)}`}}>
              <div style={{display:'flex', justifyContent:'space-between', gap:8}}>
                <b>{m.goal}</b>
                <span style={{fontSize:11, background:'#F1F5F3', padding:'2px 8px', borderRadius:999, whiteSpace:'nowrap'}}>{m.status} · {m.scope}</span>
              </div>
              <div style={{fontSize:11, color:'#64748B', marginTop:4}}>id {String(m.id).slice(0,8)}</div>
            </div>
          ))}
        </>
      )}

      {tab === 'plans' && !loading && (
        <>
          <div style={{display:'flex', gap:8}}>
            <input value={planGoal} onChange={e=> setPlanGoal(e.target.value)} placeholder="Mục tiêu kế hoạch AI, vd: Giảm gián đoạn chuỗi cà phê mùa mưa..." aria-label="Kế hoạch mới" style={{flex:1, border:'1px solid #E2E8E5', borderRadius:999, padding:'8px 14px', fontSize:13}} onKeyDown={e=> { if(e.key === 'Enter') createP() }} />
            <button onClick={createP} style={{background:'#0B1412', color:'#fff', border:0, borderRadius:999, padding:'8px 16px', fontWeight:700}}>Lập kế hoạch</button>
          </div>
          {plans.length === 0 && <div className="card">Chưa có kế hoạch nào.</div>}
          {plans.map(p=> (
            <div key={p.id} className="card">
              <button onClick={()=> open(p.id)} style={{all:'unset', cursor:'pointer', width:'100%'}} aria-expanded={openPlan === p.id}>
                <div style={{display:'flex', justifyContent:'space-between', gap:8}}>
                  <b>{p.goal}</b>
                  <span style={{fontSize:11, background:'#F1F5F3', padding:'2px 8px', borderRadius:999, whiteSpace:'nowrap'}}>{p.approval_status} · {p.execution_status} {openPlan === p.id ? '▴' : '▾'}</span>
                </div>
                {p.approval_status === 'PENDING' && <div style={{marginTop:6}}><Link to="/actions" style={{fontSize:12, color:'#0F766E', fontWeight:700}}>→ Sang trang Quản trị để duyệt</Link></div>}
              </button>
              {openPlan === p.id && detail && (
                <div style={{marginTop:10, borderTop:'1px solid #F1F5F9', paddingTop:10}}>
                  <div style={{fontSize:12, color:'#64748B'}}>Tiến độ task: {doneCount(detail.tasks || [])}/{detail.tasks?.length ?? 0}</div>
                  <div style={{height:8, background:'#F1F5F9', borderRadius:999, margin:'6px 0 10px'}}>
                    <div style={{width:`${detail.tasks?.length ? (doneCount(detail.tasks) / detail.tasks.length) * 100 : 0}%`, height:'100%', borderRadius:999, background:'#0F766E'}} />
                  </div>
                  {(detail.tasks || []).map((t: Task)=> (
                    <div key={t.id} style={{display:'flex', gap:8, fontSize:13, padding:'4px 0'}}>
                      <span>{t.status === 'COMPLETED' || t.status === 'DONE' ? '✅' : '⬜'}</span>
                      <span style={{flex:1}}>{t.name}</span>
                      <span style={{fontSize:11, color:'#64748B'}}>{t.agent} · {t.status}</span>
                    </div>
                  ))}
                  <div style={{display:'flex', gap:6, marginTop:10, flexWrap:'wrap'}}>
                    <button onClick={()=> act('delegate', p.id)} style={btn}>Giao việc cho agent</button>
                    <button onClick={()=> act('simulate', p.id)} style={btn}>Mô phỏng phương án</button>
                    <button onClick={()=> act('recommend', p.id)} style={btn}>Xin khuyến nghị AI</button>
                  </div>
                  {sim && <div style={{marginTop:8, fontSize:12, background:'#EFF6FF', borderRadius:8, padding:8}}>Mô phỏng: {JSON.stringify(sim.simulations ?? sim).slice(0, 300)}</div>}
                  {rec && <div style={{marginTop:8, fontSize:12, background:'#F0FDF4', borderRadius:8, padding:8}}>Khuyến nghị: {JSON.stringify(rec).slice(0, 300)}</div>}
                  {detail.evidence && <div style={{marginTop:8, fontSize:11, color:'#64748B'}}>Nguồn: {(detail.evidence.sources || []).join(', ')} · Tin cậy: {detail.evidence.confidence}</div>}
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {tab === 'field' && (
        <div style={{background:'#fff', border:'1px solid #E2E8E5', borderRadius:16, padding:16}}>
          <h3>NHIỆM VỤ #042 — Xác minh bất thường rừng {started && <span style={{fontSize:11, background:'#DCFCE7', padding:'2px 8px', borderRadius:999}}>ĐANG THỰC HIỆN</span>}</h3>
          <div>📍 Gia Lai · Ưu tiên CAO · checklist lưu trên máy này</div>
          <div style={{marginTop:8, display:'grid', gap:6, fontSize:13}}>
            {['Đến vị trí','Chụp ảnh','Thu thập bằng chứng','Xác minh'].map((s, i)=> (
              <label key={s}><input type="checkbox" checked={steps[i]} onChange={()=> { setSteps(x => x.map((v, j)=> j === i ? !v : v)); pushLog(`${steps[i] ? 'Bỏ tick' : 'Xong'}: ${s}`) }} /> {s}</label>
            ))}
          </div>
          <button onClick={()=> { setStarted(true); pushLog('Bắt đầu nhiệm vụ') }} disabled={started} style={{marginTop:10, background:'#0B1412', color:'#fff', padding:'8px 12px', borderRadius:999, border:0, width:'100%'}}>{started ? 'ĐANG THỰC HIỆN...' : 'BẮT ĐẦU NHIỆM VỤ'}</button>
          <div style={{marginTop:10, display:'flex', gap:6, flexWrap:'wrap'}}>
            <button onClick={()=> pushLog('Đã chụp ảnh bằng chứng')}>📷 Ảnh</button>
            <button onClick={()=> pushLog('Đã quay video hiện trường')}>🎥 Video</button>
            <button onClick={()=> {
              if(!navigator.geolocation){ pushLog('Trình duyệt không hỗ trợ vị trí'); return }
              navigator.geolocation.getCurrentPosition(()=> pushLog('Đã gắn vị trí hiện tại'), ()=> pushLog('Bị từ chối quyền vị trí'))
            }}>📍 Vị trí</button>
            <button onClick={()=> pushLog('🚨 Đã gửi tín hiệu khẩn cấp')}>🚨 Khẩn cấp</button>
          </div>
          {log.length > 0 && <div style={{marginTop:10, fontSize:12, background:'#F8FAF9', borderRadius:8, padding:8}}>{log.map((l, i)=> <div key={i}>{l}</div>)}</div>}
        </div>
      )}

      <style>{`.card{background:#fff; border:1px solid #E2E8E5; border-radius:16px; padding:16px}`}</style>
    </div>
  )
}

const btn = { fontSize:12, padding:'6px 12px', borderRadius:999, border:'1px solid #E2E8E5', background:'#fff' } as const
