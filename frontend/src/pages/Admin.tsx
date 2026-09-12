import { useEffect, useState } from 'react'
import ModelSwitcher from '../components/ModelSwitcher'
import { api, API_BASE } from '../services/api'

const API = API_BASE

const SERVICES = [
  { key: 'gee', name: 'Google Earth Engine', env: 'GEE_PROJECT_ID / GEE_SERVICE_ACCOUNT / GEE_PRIVATE_KEY' },
  { key: 'sentinel_hub', name: 'Sentinel Hub (S2/S1)', env: 'SENTINELHUB_CLIENT_ID / SENTINELHUB_CLIENT_SECRET' },
  { key: 'firms', name: 'NASA FIRMS (điểm nóng)', env: 'FIRMS_MAP_KEY' },
  { key: 'llm', name: 'AI (Gemini/Groq)', env: 'GEMINI_API_KEY / GROQ_API_KEY' },
  { key: 'weather', name: 'Thời tiết (Open-Meteo)', env: 'không cần key' },
  { key: 'database', name: 'Database', env: 'DATABASE_URL' },
]

function statusColor(s?: string){
  if(s === 'LIVE') return '#DCFCE7'
  if(s === 'DEMO' || s === 'CACHED') return '#FEF3C7'
  return '#FEE2E2'
}

function FeedbackTriage(){
  const [rows, setRows] = useState<any[]>([])
  const [msg, setMsg] = useState('')
  const token = (()=>{ try{ return sessionStorage.getItem('ecogl_admin_token') }catch{ return null } })()
  const load = async ()=>{
    if(!token){ setMsg('Đăng nhập admin ở mục ModelSwitcher để xem báo lỗi'); return }
    try{
      const r = await fetch(`${API}/api/feedback`, { headers:{ Authorization:`Bearer ${token}` } })
      if(r.status === 401 || r.status === 403){ setMsg('Phiên admin hết hạn hoặc không đủ quyền'); return }
      setRows(await r.json()); setMsg('')
    }catch(e:any){ setMsg(String(e.message || e)) }
  }
  useEffect(()=>{ load() },[])
  const resolve = async (id: number)=>{
    if(!token) return
    const r = await fetch(`${API}/api/feedback/${id}/resolve`, { method:'POST', headers:{ Authorization:`Bearer ${token}` } })
    if(r.ok){ setRows(rs => rs.map(x => x.id === id ? { ...x, status:'RESOLVED' } : x)) }
  }
  const open = rows.filter(r => r.status !== 'RESOLVED')
  return (
    <div className="card" style={{background:'#fff', border:'1px solid #E2E8E5', borderRadius:12, padding:16, marginTop:12}}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <h3 style={{margin:0}}>🐞 Báo lỗi từ người dùng {open.length > 0 && <span style={{fontSize:11, background:'#DC2626', color:'#fff', padding:'2px 8px', borderRadius:999}}>{open.length} chưa xử lý</span>}</h3>
        <button onClick={load} style={{fontSize:12, background:'#fff', border:'1px solid #E2E8E5', borderRadius:999, padding:'4px 10px'}}>↻ Tải lại</button>
      </div>
      {msg && <div style={{marginTop:8, fontSize:12, color:'#64748B'}}>{msg}</div>}
      {rows.length === 0 && !msg && <div style={{marginTop:8, fontSize:13, color:'#64748B'}}>Chưa có báo lỗi nào.</div>}
      {rows.slice(0, 20).map(f=> (
        <div key={f.id} style={{marginTop:8, border:'1px solid #E2E8E5', borderRadius:10, padding:'8px 10px', fontSize:13, opacity: f.status === 'RESOLVED' ? 0.6 : 1}}>
          <div style={{display:'flex', justifyContent:'space-between', gap:8}}>
            <b>#{f.id} [{f.category}]</b>
            <span style={{fontSize:11, background:'#F1F5F3', padding:'2px 8px', borderRadius:999}}>{f.status}</span>
          </div>
          <div style={{marginTop:4}}>{f.message}</div>
          <div style={{fontSize:11, color:'#64748B', marginTop:2}}>{f.page_url} · {f.contact} · {f.created_at}</div>
          {f.status !== 'RESOLVED' && <button onClick={()=> resolve(f.id)} style={{marginTop:6, fontSize:12, background:'#0F766E', color:'#fff', border:0, borderRadius:999, padding:'4px 12px'}}>Đánh dấu đã xử lý</button>}
        </div>
      ))}
    </div>
  )
}

function AgentBoard(){
  const [agents, setAgents] = useState<any[]>([])
  const load = async ()=>{
    try{ const d: any = await api.agentsStatus(); setAgents(Array.isArray(d) ? d : []) }catch{}
  }
  useEffect(()=>{ load() },[])
  const toggle = async (name: string, enabled: boolean)=>{
    try{ await api.toggleAgent(name, !enabled); load() }catch{}
  }
  if(agents.length === 0) return null
  return (
    <div className="card" style={{background:'#fff', border:'1px solid #E2E8E5', borderRadius:12, padding:16, marginTop:12}}>
      <h3 style={{margin:'0 0 8px'}}>Từng agent — bật/tắt không cần restart</h3>
      {agents.map((a: any)=> (
        <div key={a.agent} style={{display:'flex', gap:8, alignItems:'center', fontSize:13, border:'1px solid #F1F5F9', borderRadius:8, padding:'6px 10px', marginTop:6}}>
          <span style={{width:10, height:10, borderRadius:999, background: a.enabled ? '#10B981' : '#DC2626'}} />
          <b style={{flex:1}}>{a.agent}</b>
          <span style={{fontSize:11, color:'#64748B'}}>{a.status}{a.last_run ? ` · chạy ${a.last_run}` : ''}</span>
          <button onClick={()=> toggle(a.agent, !!a.enabled)} style={{fontSize:12, border:'1px solid #E2E8E5', background: a.enabled ? '#fff' : '#0B1412', color: a.enabled ? '#000' : '#fff', borderRadius:999, padding:'4px 12px'}}>{a.enabled ? 'Tạm dừng' : 'Bật lại'}</button>
        </div>
      ))}
    </div>
  )
}

function AssetBoard(){
  const TYPES = [['watchtower','🗼 Chòi canh'],['camera','📷 Camera'],['water','🌊 Bể/nước'],['firetruck','🚒 Xe chữa cháy'],['pump','🔧 Máy bơm'],['team','⛺ Tổ kiểm lâm'],['station','🏕️ Trạm'],['route','🛣️ Tuyến tiếp cận'],['community_hall','🏡 Nhà rông'],['risk_point','🌲 Điểm nguy cơ cao']]
  const [items, setItems] = useState<any[]>([])
  const [msg, setMsg] = useState('')
  const EMPTY = { asset_type:'watchtower', name:'', latitude:'', longitude:'', status:'active', capacity_liters:'', coverage_radius_m:'', note:'', viewer_url:'', geometry:'', contact:'', route_type:'', road_condition:'', district:'', commune:'', manager:'', source:'', contact_person:'', contact_phone:'', organization:'', verification_date:'', surface_type:'', max_vehicle_tons:'', seasonal_access:'', preview_image_url:'', capture_date:'', capture_source:'', has_streetview:'' }
  const [f, setF] = useState({ ...EMPTY })
  const [gaps, setGaps] = useState<any>(null)
  const token = (()=>{ try{ return sessionStorage.getItem('ecogl_admin_token') }catch{ return null } })()
  const load = async ()=>{
    try{ const d: any = await api.assetsList(); setItems(Array.isArray(d) ? d : []) }catch{}
    try{ setGaps(await api.opsGaps()) }catch{ setGaps(null) }
  }
  useEffect(()=>{ load() },[])
  const create = async ()=>{
    setMsg('')
    if(!f.name.trim() || !f.latitude || !f.longitude){ setMsg('Nhập tên + lat/lon.'); return }
    if(!token){ setMsg('Cần đăng nhập (bất kỳ tài khoản nào) mới thêm được tài sản.'); return }
    try{
      const body: any = { asset_type: f.asset_type, name: f.name.trim(), latitude: Number(f.latitude), longitude: Number(f.longitude), status: f.status, note: f.note.trim() || undefined }
      if(f.capacity_liters) body.capacity_liters = Number(f.capacity_liters)
      if(f.coverage_radius_m) body.coverage_radius_m = Number(f.coverage_radius_m)
      if(f.viewer_url.trim()) body.viewer_url = f.viewer_url.trim()
      if(f.contact.trim()) body.contact = f.contact.trim()
      if(f.route_type.trim()) body.route_type = f.route_type.trim()
      if(f.road_condition) body.road_condition = f.road_condition
      if(f.district.trim()) body.district = f.district.trim()
      if(f.commune.trim()) body.commune = f.commune.trim()
      if(f.manager.trim()) body.manager = f.manager.trim()
      if(f.source.trim()) body.source = f.source.trim()
      if(f.contact_person.trim()) body.contact_person = f.contact_person.trim()
      if(f.contact_phone.trim()) body.contact_phone = f.contact_phone.trim()
      if(f.organization.trim()) body.organization = f.organization.trim()
      if(f.verification_date.trim()) body.verification_date = f.verification_date.trim()
      if(f.surface_type) body.surface_type = f.surface_type
      if(f.max_vehicle_tons) body.max_vehicle_tons = Number(f.max_vehicle_tons)
      if(f.seasonal_access) body.seasonal_access = f.seasonal_access
      if(f.preview_image_url.trim()) body.preview_image_url = f.preview_image_url.trim()
      if(f.capture_date.trim()) body.capture_date = f.capture_date.trim()
      if(f.capture_source.trim()) body.capture_source = f.capture_source.trim()
      if(f.has_streetview !== '') body.has_streetview = f.has_streetview === 'yes'
      if(f.geometry.trim()){
        try{ body.geometry = JSON.parse(f.geometry) }
        catch{ setMsg('geometry phải là GeoJSON LineString/Polygon hợp lệ.'); return }
      }
      await api.createAsset(body)
      setF({ ...EMPTY })
      setMsg('Đã thêm tài sản — hiện ngay trên bản đồ.')
      load()
    }catch(e:any){ setMsg(String(e.message || e).slice(0, 200)) }
  }
  const remove = async (id: string)=>{
    try{ await api.deleteAsset(id); load() }catch(e:any){ setMsg(String(e.message || e).slice(0, 200)) }
  }
  const icon = (t: string)=> (TYPES.find(x=> x[0] === t)?.[1] || '📍').split(' ')[0]
  return (
    <div className="card" style={{background:'#fff', border:'1px solid #E2E8E5', borderRadius:12, padding:16, marginTop:12}}>
      <h3 style={{margin:'0 0 4px'}}>🏕️ Tài sản vận hành ({items.length})</h3>
      <div style={{fontSize:11, color:'#64748B', marginBottom:8}}>Chòi/cam/bể/xe/máy bơm/tổ/trạm do kiểm lâm nhập GPS — bản đồ vẽ ngay, bản tin AI đo “nguồn nước gần nhất” từ đây.</div>
      <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
        <select value={f.asset_type} onChange={e=> setF({...f, asset_type: e.target.value})} style={{border:'1px solid #E2E8E5', borderRadius:8, padding:'6px 8px', fontSize:12}}>
          {TYPES.map(([v, l])=> <option key={v} value={v}>{l}</option>)}
        </select>
        <input value={f.name} onChange={e=> setF({...f, name: e.target.value})} placeholder="Tên (vd: Chòi Ia HDreh 01)" aria-label="Tên tài sản" style={{border:'1px solid #E2E8E5', borderRadius:8, padding:'6px 10px', fontSize:12, flex:'1 1 160px'}} />
        <input value={f.latitude} onChange={e=> setF({...f, latitude: e.target.value})} placeholder="Vĩ độ" aria-label="Vĩ độ" style={{border:'1px solid #E2E8E5', borderRadius:8, padding:'6px 10px', fontSize:12, width:90}} />
        <input value={f.longitude} onChange={e=> setF({...f, longitude: e.target.value})} placeholder="Kinh độ" aria-label="Kinh độ" style={{border:'1px solid #E2E8E5', borderRadius:8, padding:'6px 10px', fontSize:12, width:90}} />
        <input value={f.capacity_liters} onChange={e=> setF({...f, capacity_liters: e.target.value})} placeholder="Dung tích (lít)" aria-label="Dung tích" style={{border:'1px solid #E2E8E5', borderRadius:8, padding:'6px 10px', fontSize:12, width:110}} />
        <input value={f.coverage_radius_m} onChange={e=> setF({...f, coverage_radius_m: e.target.value})} placeholder="Phủ sóng (m)" aria-label="Bán kính phủ sóng" style={{border:'1px solid #E2E8E5', borderRadius:8, padding:'6px 10px', fontSize:12, width:110}} />
        <input value={f.viewer_url} onChange={e=> setF({...f, viewer_url: e.target.value})} placeholder="URL xem 360° (Panoee, có thì điền)" aria-label="URL 360" style={{border:'1px solid #E2E8E5', borderRadius:8, padding:'6px 10px', fontSize:12, flex:'1 1 200px'}} />
        <input value={f.contact} onChange={e=> setF({...f, contact: e.target.value})} placeholder="Liên hệ trạm (SĐT/người, có thì điền)" aria-label="Liên hệ trạm" style={{border:'1px solid #E2E8E5', borderRadius:8, padding:'6px 10px', fontSize:12, flex:'1 1 160px'}} />
        <input value={f.route_type} onChange={e=> setF({...f, route_type: e.target.value})} placeholder="Loại tuyến (tự do)" aria-label="Loại tuyến" style={{border:'1px solid #E2E8E5', borderRadius:8, padding:'6px 10px', fontSize:12, width:120}} />
        <select value={f.road_condition} onChange={e=> setF({...f, road_condition: e.target.value})} aria-label="Tình trạng đường" style={{border:'1px solid #E2E8E5', borderRadius:8, padding:'6px 8px', fontSize:12}}>
          <option value="">— Tình trạng đường —</option>
          {['GOOD','FAIR','POOR','BLOCKED'].map(v=> <option key={v} value={v}>{v}</option>)}
        </select>
        <select value={f.surface_type} onChange={e=> setF({...f, surface_type: e.target.value})} aria-label="Mặt đường" style={{border:'1px solid #E2E8E5', borderRadius:8, padding:'6px 8px', fontSize:12}}>
          <option value="">— Mặt đường —</option>
          {['PAVED','GRAVEL','FOREST_ROAD','TRAIL'].map(v=> <option key={v} value={v}>{v}</option>)}
        </select>
        <input value={f.max_vehicle_tons} onChange={e=> setF({...f, max_vehicle_tons: e.target.value})} placeholder="Tải trọng tối đa (tấn)" aria-label="Tải trọng tối đa" style={{border:'1px solid #E2E8E5', borderRadius:8, padding:'6px 10px', fontSize:12, width:140}} />
        <select value={f.seasonal_access} onChange={e=> setF({...f, seasonal_access: e.target.value})} aria-label="Tiếp cận theo mùa" style={{border:'1px solid #E2E8E5', borderRadius:8, padding:'6px 8px', fontSize:12}}>
          <option value="">— Tiếp cận mùa —</option>
          <option value="DRY_ONLY">DRY_ONLY (mùa khô)</option>
          <option value="YEAR_ROUND">YEAR_ROUND (quanh năm)</option>
        </select>
        <input value={f.district} onChange={e=> setF({...f, district: e.target.value})} placeholder="Huyện" aria-label="Huyện" style={{border:'1px solid #E2E8E5', borderRadius:8, padding:'6px 10px', fontSize:12, width:100}} />
        <input value={f.commune} onChange={e=> setF({...f, commune: e.target.value})} placeholder="Xã" aria-label="Xã" style={{border:'1px solid #E2E8E5', borderRadius:8, padding:'6px 10px', fontSize:12, width:120}} />
        <input value={f.manager} onChange={e=> setF({...f, manager: e.target.value})} placeholder="Quản lý (vd: Hạt Kiểm lâm)" aria-label="Đơn vị quản lý" style={{border:'1px solid #E2E8E5', borderRadius:8, padding:'6px 10px', fontSize:12, flex:'1 1 150px'}} />
        <input value={f.organization} onChange={e=> setF({...f, organization: e.target.value})} placeholder="Tổ chức" aria-label="Tổ chức" style={{border:'1px solid #E2E8E5', borderRadius:8, padding:'6px 10px', fontSize:12, width:120}} />
        <input value={f.contact_person} onChange={e=> setF({...f, contact_person: e.target.value})} placeholder="Người liên hệ" aria-label="Người liên hệ" style={{border:'1px solid #E2E8E5', borderRadius:8, padding:'6px 10px', fontSize:12, width:120}} />
        <input value={f.contact_phone} onChange={e=> setF({...f, contact_phone: e.target.value})} placeholder="SĐT liên hệ" aria-label="SĐT liên hệ" style={{border:'1px solid #E2E8E5', borderRadius:8, padding:'6px 10px', fontSize:12, width:110}} />
        <input value={f.verification_date} onChange={e=> setF({...f, verification_date: e.target.value})} placeholder="Kiểm chứng (YYYY-MM-DD)" aria-label="Ngày kiểm chứng" style={{border:'1px solid #E2E8E5', borderRadius:8, padding:'6px 10px', fontSize:12, width:160}} />
        <input value={f.source} onChange={e=> setF({...f, source: e.target.value})} placeholder="Nguồn (vd: field-survey)" aria-label="Nguồn dữ liệu" style={{border:'1px solid #E2E8E5', borderRadius:8, padding:'6px 10px', fontSize:12, width:140}} />
        <input value={f.preview_image_url} onChange={e=> setF({...f, preview_image_url: e.target.value})} placeholder="Ảnh xem trước (URL, có thì điền)" aria-label="Ảnh xem trước" style={{border:'1px solid #E2E8E5', borderRadius:8, padding:'6px 10px', fontSize:12, flex:'1 1 180px'}} />
        <input value={f.capture_date} onChange={e=> setF({...f, capture_date: e.target.value})} placeholder="Ngày chụp (YYYY-MM-DD)" aria-label="Ngày chụp" style={{border:'1px solid #E2E8E5', borderRadius:8, padding:'6px 10px', fontSize:12, width:150}} />
        <input value={f.capture_source} onChange={e=> setF({...f, capture_source: e.target.value})} placeholder="Nguồn ảnh (vd: flycam-đội-1)" aria-label="Nguồn ảnh" style={{border:'1px solid #E2E8E5', borderRadius:8, padding:'6px 10px', fontSize:12, width:150}} />
        <select value={f.has_streetview} onChange={e=> setF({...f, has_streetview: e.target.value})} aria-label="Có Street View" style={{border:'1px solid #E2E8E5', borderRadius:8, padding:'6px 8px', fontSize:12}}>
          <option value="">— Street View? —</option>
          <option value="yes">Có (đã kiểm chứng)</option>
          <option value="no">Không có</option>
        </select>
        <input value={f.geometry} onChange={e=> setF({...f, geometry: e.target.value})} placeholder='Tuyến: GeoJSON LineString (vd tuyến tiếp cận)' aria-label="Geometry tuyến" style={{border:'1px solid #E2E8E5', borderRadius:8, padding:'6px 10px', fontSize:12, flex:'1 1 200px'}} />
        <button onClick={create} style={{fontSize:12, background:'#0F766E', color:'#fff', border:0, borderRadius:999, padding:'6px 14px', fontWeight:700}}>Thêm</button>
      </div>
      {msg && <div style={{marginTop:8, fontSize:12}}>{msg}</div>}
      {gaps && (
        <div style={{marginTop:8, fontSize:11, background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:8, padding:'8px 10px'}}>
          <b>Khoảng trống dữ liệu</b> (từ /api/ops/gaps):
          {' '}hồ {gaps.water?.total} · thiếu liên hệ {gaps.water?.missing_contact?.length ?? '?'} ·
          {' '}trạm GPS {gaps.stations?.verified_gps ?? '?'} · thiếu GPS {gaps.stations?.missing_gps ?? '?'} · thiếu liên hệ {(gaps.stations?.missing_contact || []).length} ·
          {' '}tuyến {gaps.routes?.total ?? '?'} · thiếu đường {(gaps.routes?.missing_geometry || []).length} · thiếu tình trạng {(gaps.routes?.missing_road_condition || []).length} ·
          {' '}xem: {Object.entries(gaps.viewers || {}).map(([k, v])=> `${k}:${v}`).join(' ')}
        </div>
      )}
      {items.length === 0 && <div style={{marginTop:8, fontSize:12, color:'#64748B'}}>Chưa có tài sản nào — bản đồ và bản tin AI sẽ ghi rõ “chưa có” thay vì bịa.</div>}
      {items.map((a:any)=> (
        <div key={a.id} style={{marginTop:6, display:'flex', gap:8, alignItems:'center', fontSize:12, border:'1px solid #F1F5F9', borderRadius:8, padding:'6px 10px'}}>
          <span>{icon(a.asset_type)}</span>
          <b style={{flex:1}}>{a.name}</b>
          <span style={{color:'#64748B'}}>{a.latitude}, {a.longitude}</span>
          <span style={{fontSize:10, padding:'2px 8px', borderRadius:999, background: a.status==='active' ? '#DCFCE7' : '#FEE2E2'}}>{a.status}</span>
          <span title={a.viewer?.detail || ''} style={{fontSize:10, padding:'2px 8px', borderRadius:999, background: a.viewer?.viewer_type === 'none' ? '#F1F5F9' : '#DCFCE7'}}>🌐 {a.viewer?.viewer_type || '?'} · {a.viewer?.verification_status || '?'}</span>
          <a href={`/viewer/${a.id}`} style={{fontSize:11, color:'#0F766E', fontWeight:700}}>Xem</a>
          <button onClick={()=> remove(a.id)} title="Xóa (cần admin)" style={{fontSize:11, background:'#fff', border:'1px solid #E2E8E5', borderRadius:999, padding:'2px 8px'}}>Xóa</button>
        </div>
      ))}
    </div>
  )
}

function DemoRunner(){
  const [out, setOut] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const run = async (fn: ()=> Promise<any>)=>{
    setBusy(true)
    try{ setOut(await fn()) }catch(e:any){ setOut({ error: String(e.message || e).slice(0, 200) }) }
    finally{ setBusy(false) }
  }
  return (
    <div className="card" style={{background:'#fff', border:'1px solid #E2E8E5', borderRadius:12, padding:16, marginTop:12}}>
      <h3 style={{margin:'0 0 8px'}}>Demo 3 phút</h3>
      <div style={{display:'flex', gap:8}}>
        <button onClick={()=> run(api.runDemo)} disabled={busy} style={{fontSize:13, background:'#0F766E', color:'#fff', border:0, borderRadius:999, padding:'8px 16px'}}>{busy ? 'Đang chạy...' : '▶ Chạy demo'}</button>
        <button onClick={()=> run(api.resetDemo)} disabled={busy} style={{fontSize:13, background:'#fff', border:'1px solid #E2E8E5', borderRadius:999, padding:'8px 16px'}}>Reset demo</button>
      </div>
      {out && (
        <div style={{marginTop:8, fontSize:12, background:'#F8FAF9', borderRadius:8, padding:8}}>
          {out.error ? out.error : (out.steps || []).map((s: string, i: number)=> <div key={i}>✓ {s}</div>) || out.status}
        </div>
      )}
    </div>
  )
}

function AccountPanel(){
  const [u, setU] = useState('')
  const [p, setP] = useState('')
  const [msg, setMsg] = useState('')
  const register = async ()=>{
    setMsg('')
    if(u.trim().length < 3 || p.length < 8){ setMsg('Tên ≥3 ký tự, mật khẩu ≥8 ký tự'); return }
    try{
      const r: any = await api.registerUser(u.trim(), p)
      setMsg(`Đã tạo ${r.username} — vai trò ${r.role}. Đăng nhập ở ModelSwitcher.`)
      setU(''); setP('')
    }catch(e:any){ setMsg(String(e.message || e).slice(0, 200)) }
  }
  return (
    <div className="card" style={{background:'#fff', border:'1px solid #E2E8E5', borderRadius:12, padding:16, marginTop:12}}>
      <h3 style={{margin:'0 0 8px'}}>Tài khoản (người đầu tiên = admin)</h3>
      <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
        <input value={u} onChange={e=> setU(e.target.value)} placeholder="Tên đăng nhập" aria-label="Tên đăng nhập mới" style={{border:'1px solid #E2E8E5', borderRadius:8, padding:'6px 10px', fontSize:13}} />
        <input value={p} onChange={e=> setP(e.target.value)} type="password" placeholder="Mật khẩu ≥8 ký tự" aria-label="Mật khẩu mới" style={{border:'1px solid #E2E8E5', borderRadius:8, padding:'6px 10px', fontSize:13}} onKeyDown={e=> { if(e.key === 'Enter') register() }} />
        <button onClick={register} style={{fontSize:13, background:'#0B1412', color:'#fff', border:0, borderRadius:999, padding:'6px 14px'}}>Tạo tài khoản</button>
      </div>
      {msg && <div style={{marginTop:8, fontSize:12}}>{msg}</div>}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: any }){  return (
    <div style={{border:'1px solid #E2E8E5', borderRadius:10, padding:'8px 10px'}}>
      <div style={{fontSize:20, fontWeight:800}}>{value ?? '—'}</div>
      <div style={{fontSize:11, color:'#64748B'}}>{label}</div>
    </div>
  )
}

function ConfigBoard({ geo }: { geo: any }){  return (
    <div style={{display:'grid', gap:8, marginTop:8}}>
      {geo.summary?.all_live && <div style={{fontSize:13, fontWeight:700, color:'#166534'}}>● Tất cả đã LIVE</div>}
      {SERVICES.map(sv=>{
        const g = geo[sv.key] || {}
        return (
          <div key={sv.key} style={{display:'flex', gap:10, alignItems:'center', border:'1px solid #E2E8E5', borderRadius:10, padding:'8px 10px', fontSize:13, flexWrap:'wrap'}}>
            <b style={{minWidth:180}}>{sv.name}</b>
            <span style={{background: statusColor(g.status), padding:'2px 10px', borderRadius:999, fontWeight:700, fontSize:12}}>{g.status || '?'}</span>
            <span style={{fontSize:11, color:'#64748B'}}>{g.configured === false ? 'chưa thiết lập' : g.configured ? 'đã thiết lập' : ''} · <code>{sv.env}</code></span>
          </div>
        )
      })}
      <div style={{fontSize:11, color:'#64748B'}}>Thiết lập key trong Environment Variables của backend rồi redeploy. Không bao giờ dán key lên web.</div>
    </div>
  )
}

function RecentAudit(){
  const [rows, setRows] = useState<any[]>([])
  useEffect(()=>{ api.auditLog().then((d: any)=> setRows(Array.isArray(d) ? d.slice(0, 3) : [])).catch(()=> setRows([])) },[])
  if(rows.length === 0) return null
  return (
    <div className="audit">Nhật ký mới nhất:<br/>{rows.map((l: any, i: number)=> (
      <div key={i}>{l.created_at} · {l.action} · {l.resource_type}{l.actor_id ? ` · ${l.actor_id}` : ''}</div>
    ))}</div>
  )
}

// NOTE (security): service-account private keys must NEVER touch the browser.
// They live only in backend env / secret manager. This page therefore has no
// key input — it only shows the live backend GEE status + setup instructions.
export default function Admin(){
  const [gee, setGee] = useState<any>(null)
  const [geo, setGeo] = useState<any>(null)
  const [cc, setCc] = useState<any>(null)
  const [gov, setGov] = useState<any>(null)
  useEffect(()=>{
    // one-time purge: older builds stored a GEE key in the browser — remove it
    try{ localStorage.removeItem('ecogl_gee_key') }catch{}
    fetch(`${API}/api/earth-engine/status`).then(r=>r.json()).then(setGee).catch(()=> setGee({ connected:false }))
    fetch(`${API}/api/health/geospatial`).then(r=>r.json()).then(setGeo).catch(()=> setGeo(null))
    fetch(`${API}/api/command-center`).then(r=>r.json()).then(setCc).catch(()=> setCc(null))
    fetch(`${API}/api/governance`).then(r=>r.json()).then(setGov).catch(()=> setGov(null))
  },[])
  const saveMap = ()=>{
    const v=(document.getElementById('map_key2') as HTMLInputElement)?.value || ''
    localStorage.setItem('ecogl_map_key', v); localStorage.setItem('ecogl_map_style', v); location.reload()
  }
  const connected = gee?.connected === true
  return (
    <div className="page">
      <h1>Quản trị — Người dùng · Vai trò · Nguồn dữ liệu · Agent · Sức khỏe hệ thống</h1>
      <div className="health"><div>Cơ sở dữ liệu ● Trực tuyến</div><div>API ● Trực tuyến</div><div>GEE ● {gee ? (connected ? 'Đã kết nối LIVE' : 'Chưa cấu hình (cần key ở backend)') : 'Đang kiểm tra...'}</div><div>AI Services ● Trực tuyến</div></div>

      <div className="card" style={{background:'#fff', border:'1px solid #E2E8E5', borderRadius:12, padding:16, marginTop:12}}>
        <h3>0. Tình trạng cấu hình (live từ backend)</h3>
        {!geo && <div style={{fontSize:13, color:'#64748B'}}>Đang kiểm tra...</div>}
        {geo && <ConfigBoard geo={geo} />}
      </div>

      <div className="card" style={{background:'#fff', border:'1px solid #E2E8E5', borderRadius:12, padding:16, marginTop:12}}>
        <h3 style={{margin:'0 0 8px'}}>Trung tâm chỉ huy (live)</h3>
        {!cc && !gov && <div style={{fontSize:13, color:'#64748B'}}>Đang tải...</div>}
        {(cc || gov) && (
          <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(130px, 1fr))', gap:8}}>
            <Stat label="Nguy kịch" value={cc?.active_critical} />
            <Stat label="Rủi ro cao" value={cc?.high_risk} />
            <Stat label="Chờ duyệt" value={gov?.pending_approvals} />
            <Stat label="QĐ con người" value={gov?.human_decisions} />
            <Stat label="QĐ AI" value={gov?.ai_decisions} />
          </div>
        )}
      </div>

      <div className="card" style={{background:'#fff', border:'1px solid #E2E8E5', borderRadius:12, padding:16, marginTop:12}}>
        <h3>1. Nhập API Bản đồ hiển thị (Map Tiles — cho Bản đồ trực tiếp)</h3>        <p style={{fontSize:12, color:'#64748B'}}>Dùng cho nền bản đồ, không phải dữ liệu vệ tinh phân tích. Để trống = OSM miễn phí. Có key thì dán vào đây hoặc ngay trên Bản đồ.</p>
        <input id="map_key2" placeholder="MapTiler key hoặc URL style JSON (https://api.maptiler.com/...)" style={{width:'100%', padding:'8px', border:'1px solid #E2E8E5', borderRadius:8, marginTop:8}} />
        <button onClick={saveMap} style={{marginTop:8, background:'#0F766E', color:'#fff', border:0, padding:'8px 12px', borderRadius:999}}>Lưu & Tải lại bản đồ</button>
        <div style={{fontSize:11, color:'#64748B', marginTop:6}}>Vị trí file: trình duyệt localStorage <code>ecogl_map_key</code> · Hoặc set <code>VITE_MAP_STYLE</code> trong <code>frontend/.env</code></div>
      </div>

      <div className="card" style={{background:'#FFF7ED', border:'1px solid #FDBA74', borderRadius:12, padding:16, marginTop:12}}>
        <h3>2. Vệ tinh EE Sentinel (Google Earth Engine — cho phân tích NDVI/Rừng)</h3>
        <p style={{fontSize:12, color:'#7C2D12'}}>Đây là cấu hình <b>backend</b>, không phải bản đồ nền. Cần Service Account của Google Cloud. <a href="https://code.earthengine.google.com" target="_blank">Lấy tại code.earthengine.google.com</a></p>
        <div style={{fontSize:13, marginTop:8}}>Trạng thái backend: <b>{gee ? (connected ? '● LIVE đã kết nối' : '○ chưa cấu hình — đang dùng DEMO DATA') : 'Đang kiểm tra...'}</b></div>
        <div style={{fontSize:12, color:'#DC2626', marginTop:8, background:'#fff', border:'1px solid #FECACA', borderRadius:8, padding:10}}>
          ⛔ Không bao giờ dán private key vào trình duyệt hay bất kỳ ô nhập web nào — key chỉ tồn tại trong biến môi trường backend / secret manager.
        </div>
        <div style={{fontSize:12, marginTop:10, background:'#fff', border:'1px solid #E2E8E5', borderRadius:8, padding:10}}>
          <b>Để bật vệ tinh thực (trên máy chủ backend):</b><br/>
          1. Mở file <code>backend/.env</code> (tạo từ <code>.env.example</code>)<br/>
          2. Điền:<br/>
          <code>GEE_PROJECT_ID=...</code><br/>
          <code>GEE_SERVICE_ACCOUNT=...@....iam.gserviceaccount.com</code><br/>
          <code>GEE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."</code><br/>
          3. Restart backend rồi kiểm tra <code>/api/earth-engine/status</code> phải trả <code>{`{"connected":true}`}</code><br/>
          <span style={{color:'#DC2626'}}>Không commit file .env lên Git!</span>
        </div>
      </div>

      <ModelSwitcher />
      <FeedbackTriage />
      <AgentBoard />
      <AssetBoard />
      <DemoRunner />
      <AccountPanel />
      <RecentAudit />
      <style>{`.health,.agents{display:grid; grid-template-columns:repeat(2,1fr); gap:12px; margin-top:12px} .health div,.agents div{background:#fff; border:1px solid #E2E8E5; border-radius:12px; padding:12px; font-size:13px} .audit{background:#fff; border:1px solid #E2E8E5; border-radius:12px; padding:12px; margin-top:12px; font-size:13px; font-family:monospace} @media (max-width: 640px){ .health,.agents{ grid-template-columns:1fr; } }`}</style>
    </div>
  )
}
