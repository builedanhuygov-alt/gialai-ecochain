import { useEffect, useState } from 'react'
import { useLocation, Link, useNavigate } from 'react-router-dom'
import { Plus, Satellite, Search } from 'lucide-react'
import { api } from '../services/api'
import {
  CreateModal, DEMO_INCIDENTS, EMPTY_DRAFT, IncidentCard, IncidentDrawer, MsnEmpty, MsnStyles, Toast,
  filterIncidents, fmtAgo, sortIncidents,
} from '../components/MissionCenter'
import type { Filters, IStatus, Incident, IncidentDraft, Sev } from '../components/MissionCenter'

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
  const nav = useNavigate()
  const incomingArea: string = location.state?.area || ''

  // Incident workspace state (operational demo dataset, Missions page only)
  const [mainTab, setMainTab] = useState<'incident'|'missions'|'plans'|'field'>('incident')
  const [fq, setFq] = useState('')
  const [fsev, setFsev] = useState<'ALL'|Sev>('ALL')
  const [fstatus, setFstatus] = useState<'ALL'|IStatus>('ALL')
  const [farea, setFarea] = useState<string>('ALL')
  const [fsort, setFsort] = useState<'sev'|'new'|'risk'>('sev')
  const [fview, setFview] = useState<'list'|'compact'>('list')
  const [sel, setSel] = useState<Incident | null>(null)
  const [modal, setModal] = useState(false)
  const [draft, setDraft] = useState<IncidentDraft>(EMPTY_DRAFT)
  const [toast, setToast] = useState('')
  const [now, setNow] = useState(Date.now())
  useEffect(()=>{
    const id = setInterval(()=> setNow(Date.now()), 30000)
    return ()=> clearInterval(id)
  },[])
  useEffect(()=>{
    if(!toast) return
    const id = setTimeout(()=> setToast(''), 2600)
    return ()=> clearTimeout(id)
  },[toast])

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

  // Incident workspace derivations (demo dataset)
  const filters: Filters = { q: fq, sev: fsev, status: fstatus, area: farea }
  const incidents = sortIncidents(filterIncidents(DEMO_INCIDENTS, filters), fsort)
  const areas = [...new Set(DEMO_INCIDENTS.map(i => i.area))]
  const nLive = DEMO_INCIDENTS.filter(i => i.status === 'LIVE').length
  const nMon = DEMO_INCIDENTS.filter(i => i.status === 'MONITORING').length
  const nHigh = DEMO_INCIDENTS.filter(i => (i.sev === 'CRITICAL' || i.sev === 'HIGH') && i.status !== 'RESOLVED').length
  const nDone = DEMO_INCIDENTS.filter(i => i.status === 'RESOLVED').length

  const submitIncident = async ()=>{
    if(!draft.title.trim()) return
    try{
      await api.createMission({ goal: `Ứng phó sự cố: ${draft.title.trim()} (${draft.area || 'Gia Lai'})`, scope: draft.area || 'Province' })
      setDraft(EMPTY_DRAFT); setModal(false); setToast('Đã tạo sự cố — đồng bộ nhiệm vụ')
      refresh()
    }catch(e:any){ setError(String(e.message || e).slice(0, 200)) }
  }

  return (
    <div className="msn rise-in">
      <MsnStyles />
      {/* PAGE HEADER */}
      <div className="msn-head">
        <div style={{ flex: 1, minWidth: 200 }}>
          <h1 className="msn-title">Điều hành sự cố</h1>
          <div className="msn-sub">Quản lý, theo dõi và điều phối các sự cố cháy rừng · <span className="msn-tag">DỮ LIỆU MINH HỌA TÁC CHIẾN</span></div>
        </div>
        <button className="msn-btn primary" onClick={()=> setModal(true)}><Plus size={15} /> Tạo sự cố</button>
      </div>

      <div className="msn-tabs" style={{ marginTop: 12 }} role="tablist" aria-label="Missions">
        {([['incident','Sự cố'],['missions','Nhiệm vụ'],['plans','Kế hoạch AI'],['field','Thực địa']] as const).map(([v, label])=> (
          <button key={v} role="tab" aria-selected={mainTab === v} className={`msn-tab${mainTab === v ? ' on' : ''}`} onClick={()=> setMainTab(v)}>{label}</button>
        ))}
      </div>

      {mainTab === 'incident' && (
        <>
          {/* OPERATIONAL SUMMARY */}
          <div className="msn-stats" role="region" aria-label="Tổng quan tác chiến">
            <div className="msn-stat" style={{ borderLeftColor: '#22C55E' }}>
              <div className="n" style={{ color: '#22C55E' }}>{String(nLive).padStart(2, '0')}</div>
              <div className="l">ĐANG XỬ LÝ</div><div className="s">Sự cố live</div>
            </div>
            <div className="msn-stat" style={{ borderLeftColor: '#F59E0B' }}>
              <div className="n" style={{ color: '#F59E0B' }}>{String(nMon).padStart(2, '0')}</div>
              <div className="l">THEO DÕI</div><div className="s">Giám sát diễn biến</div>
            </div>
            <div className="msn-stat" style={{ borderLeftColor: '#EF4444' }}>
              <div className="n" style={{ color: '#EF4444' }}>{String(nHigh).padStart(2, '0')}</div>
              <div className="l">NGUY CƠ CAO</div><div className="s">Critical + High</div>
            </div>
            <div className="msn-stat" style={{ borderLeftColor: '#3B82F6' }}>
              <div className="n">{String(nDone).padStart(2, '0')}</div>
              <div className="l">ĐÃ HOÀN TẤT</div><div className="s">Đã nghiệm thu</div>
            </div>
          </div>

          {/* FILTER BAR */}
          <div className="msn-toolbar" role="toolbar" aria-label="Lọc sự cố">
            <div className="msn-search">
              <Search size={14} style={{ color: '#5B6E82', flex: 'none' }} />
              <input value={fq} onChange={e=> setFq(e.target.value)} placeholder="Tìm kiếm sự cố, mã sự cố, khu vực…" aria-label="Tìm kiếm sự cố" />
            </div>
            <select className="msn-select" value={fsev} onChange={e=> setFsev(e.target.value as 'ALL'|Sev)} aria-label="Mức độ">
              <option value="ALL">Mức độ: Tất cả</option>
              {(['CRITICAL','HIGH','MEDIUM','LOW'] as Sev[]).map(s=> <option key={s} value={s}>{s}</option>)}
            </select>
            <select className="msn-select" value={fstatus} onChange={e=> setFstatus(e.target.value as 'ALL'|IStatus)} aria-label="Trạng thái">
              <option value="ALL">Trạng thái: Tất cả</option>
              {(['LIVE','MONITORING','RESOLVED','OFFLINE'] as IStatus[]).map(s=> <option key={s} value={s}>{s}</option>)}
            </select>
            <select className="msn-select" value={farea} onChange={e=> setFarea(e.target.value)} aria-label="Khu vực">
              <option value="ALL">Khu vực: Tất cả</option>
              {areas.map(a=> <option key={a} value={a}>{a}</option>)}
            </select>
            <select className="msn-select" value={fsort} onChange={e=> setFsort(e.target.value as 'sev'|'new'|'risk')} aria-label="Sắp xếp">
              <option value="sev">Mức độ</option>
              <option value="new">Mới nhất</option>
              <option value="risk">Rủi ro</option>
            </select>
            <div className="msn-seg" role="group" aria-label="Chế độ xem">
              {(['list','compact'] as const).map(v=> (
                <button key={v} className={fview === v ? 'on' : ''} onClick={()=> setFview(v)} aria-pressed={fview === v}>
                  {v === 'list' ? 'LIST' : 'COMPACT'}
                </button>
              ))}
            </div>
          </div>

          {/* INCIDENT LIST */}
          <div className="msn-list" role="list" aria-label="Danh sách sự cố">
            {incidents.length === 0 && (
              <div className="msn-card">
                <MsnEmpty icon={<Satellite size={26} />} title="Không có sự cố đang hoạt động"
                  hint="Hiện chưa ghi nhận sự cố cháy rừng cần xử lý."
                  action={<><button className="msn-btn primary" onClick={()=> setModal(true)}><Plus size={15} /> Tạo sự cố</button>
                    <div className="msn-mut" style={{ marginTop: 10 }}><span className="msn-dot live" style={{ display: 'inline-block', marginRight: 6 }} />Hệ thống giám sát đang hoạt động</div></>} />
              </div>
            )}
            {fview === 'list' && incidents.map(e=> (
              <div key={e.id} role="listitem"><IncidentCard e={e} now={now} selected={sel?.id === e.id} onOpen={setSel} /></div>
            ))}
            {fview === 'compact' && incidents.map(e=> (
              <button key={e.id} role="listitem" onClick={()=> setSel(e)}
                style={{ display: 'flex', gap: 10, alignItems: 'center', width: '100%', textAlign: 'left', background: 'var(--m-panel)', border: sel?.id === e.id ? '1px solid #3B82F6' : '1px solid var(--m-line)', borderLeft: `4px solid ${e.sev === 'CRITICAL' ? '#EF4444' : e.sev === 'HIGH' ? '#F97316' : e.sev === 'MEDIUM' ? '#F59E0B' : '#22C55E'}`, borderRadius: 10, padding: '8px 12px', color: 'inherit', cursor: 'pointer' }}>
                <b className="msn-num" style={{ fontSize: 12 }}>{e.id}</b>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, fontWeight: 700 }}>{e.title}</span>
                <span className="msn-mut" style={{ whiteSpace: 'nowrap' }}>{e.area}</span>
                <b className="msn-num" style={{ fontSize: 14, color: e.riskScore >= 85 ? '#EF4444' : e.riskScore >= 70 ? '#F97316' : e.riskScore >= 40 ? '#F59E0B' : '#22C55E' }}>{e.riskScore}</b>
                <span className="msn-mut" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{e.status === 'LIVE' ? 'LIVE' : fmtAgo(e.updatedAt, now)}</span>
              </button>
            ))}
          </div>

          {sel && <IncidentDrawer e={sel} now={now} onClose={()=> setSel(null)}
            onCommand={()=> { setSel(null); nav('/command') }}
            onMission={()=> { setGoal(`Ứng phó ${sel.title} (${sel.area})`); setSel(null); setMainTab('missions'); setToast('Đã gắn sự cố vào nhiệm vụ mới') }} />}
          {modal && <CreateModal areas={areas} draft={draft} setDraft={setDraft} onClose={()=> setModal(false)} onSubmit={submitIncident} />}
          <Toast msg={toast} />
        </>
      )}

      {mainTab !== 'incident' && (
        <div style={{display:'flex', gap:6, marginTop:12}}>
          {([['missions',`Nhiệm vụ${activeMissions ? ` (${activeMissions})` : ''}`],['plans','Kế hoạch AI'],['field','Thực địa']] as const).map(([v, label])=> (
            <button key={v} onClick={()=> setTab(v)} style={{padding:'6px 12px', borderRadius:999, border:'1px solid #E2E8E5', background: tab===v ? '#0B1412' : '#fff', color: tab===v ? '#fff' : '#000'}}>{label}</button>
          ))}
        </div>
      )}

      {loading && mainTab !== 'incident' && <div className="card">Đang tải nhiệm vụ...</div>}
      {error && <div className="card" style={{borderColor:'#F59E0B'}}>⚠ {error}</div>}

      {mainTab === 'missions' && !loading && (
        <>
          {incomingArea && <div style={{fontSize:12, color:'#0F766E', background:'#DCFCE7', borderRadius:8, padding:'6px 10px', marginTop:12}}>📍 Từ bản đồ: <b>{incomingArea}</b> — phạm vi nhiệm vụ sẽ gắn khu vực này</div>}
          <div style={{display:'flex', gap:8, marginTop:12}}>
            <input value={goal} onChange={e=> setGoal(e.target.value)} placeholder="Mục tiêu nhiệm vụ mới, vd: Bảo vệ rừng Ia Mơr mùa khô..." aria-label="Mục tiêu mới" style={{flex:1, border:'1px solid #E2E8E5', borderRadius:999, padding:'8px 14px', fontSize:13}} onKeyDown={e=> { if(e.key === 'Enter') create() }} />
            <button onClick={create} style={{background:'#0F766E', color:'#fff', border:0, borderRadius:999, padding:'8px 16px', fontWeight:700}}>Tạo</button>
          </div>
          {missions.length === 0 && <div className="card" style={{marginTop:12}}>Chưa có nhiệm vụ nào — tạo mới ở trên.</div>}
          {missions.map(m=> (
            <div key={m.id} className="card" style={{marginTop:12, borderLeft:`4px solid ${statusColor(m.status)}`}}>
              <div style={{display:'flex', justifyContent:'space-between', gap:8}}>
                <b>{m.goal}</b>
                <span style={{fontSize:11, background:'#F1F5F3', padding:'2px 8px', borderRadius:999, whiteSpace:'nowrap'}}>{m.status} · {m.scope}</span>
              </div>
              <div style={{fontSize:11, color:'#64748B', marginTop:4}}>id {String(m.id).slice(0,8)}</div>
            </div>
          ))}
        </>
      )}

      {mainTab === 'plans' && !loading && (
        <>
          <div style={{display:'flex', gap:8, marginTop:12}}>
            <input value={planGoal} onChange={e=> setPlanGoal(e.target.value)} placeholder="Mục tiêu kế hoạch AI, vd: Giảm gián đoạn chuỗi cà phê mùa mưa..." aria-label="Kế hoạch mới" style={{flex:1, border:'1px solid #E2E8E5', borderRadius:999, padding:'8px 14px', fontSize:13}} onKeyDown={e=> { if(e.key === 'Enter') createP() }} />
            <button onClick={createP} style={{background:'#0B1412', color:'#fff', border:0, borderRadius:999, padding:'8px 16px', fontWeight:700}}>Lập kế hoạch</button>
          </div>
          {plans.length === 0 && <div className="card" style={{marginTop:12}}>Chưa có kế hoạch nào.</div>}
          {plans.map(p=> (
            <div key={p.id} className="card" style={{marginTop:12}}>
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

      {mainTab === 'field' && (
        <div style={{background:'#fff', border:'1px solid #E2E8E5', borderRadius:16, padding:16, marginTop:12}}>
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
