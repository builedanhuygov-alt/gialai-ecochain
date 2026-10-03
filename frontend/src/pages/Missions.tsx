import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, API_BASE } from '../services/api'

type Mission = {
  id: string; area: string; cell_id?: string | null
  latitude?: number | null; longitude?: number | null
  risk_at_creation?: number | null; priority?: string
  due_at?: string | null; status?: string; assignee?: string | null
  created_by?: string | null; checklist_steps?: string[]; checklist_done?: number[]
  created_at?: string | null
  result?: { outcome: string; note?: string | null } | null
}

type Stats = {
  missions_total: number; by_status: Record<string, number>
  results: Record<string, number>; false_alarm_rate: number | null
  by_risk_band: Record<string, { missions: number; with_result: number; false_alarms: number; false_alarm_rate: number | null }>
}

const token = ()=>{ try{ return sessionStorage.getItem('ecogl_admin_token') }catch{ return null } }
const authHeaders = (): Record<string, string> => token() ? { Authorization: `Bearer ${token()}` } : {}

async function authed(path: string, init?: RequestInit){
  const r = await fetch(`${API_BASE}${path}`, {
    ...init, headers: { 'Content-Type': 'application/json', ...authHeaders(), ...(init?.headers || {}) },
  })
  const j = await r.json().catch(()=> ({}))
  if(!r.ok) throw new Error(j.detail || `HTTP ${r.status}`)
  return j
}

export default function Missions(){
  const [missions, setMissions] = useState<Mission[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('ALL')
  const [openId, setOpenId] = useState<string | null>(null)
  const [detail, setDetail] = useState<Mission | null>(null)
  const [msg, setMsg] = useState('')
  // create form (admin/ranger only — backend enforces)
  const [area, setArea] = useState('')
  const [lat, setLat] = useState('')
  const [lon, setLon] = useState('')
  const [risk, setRisk] = useState('')
  const [priority, setPriority] = useState('NORMAL')
  // result form
  const [outcome, setOutcome] = useState('FALSE_ALARM')
  const [note, setNote] = useState('')
  const [rlat, setRlat] = useState('')
  const [rlon, setRlon] = useState('')
  const [photoHash, setPhotoHash] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = async ()=>{
    setLoading(true)
    try{
      const d: any = await api.missions()
      setMissions(Array.isArray(d) ? d : (d?.missions || []))
      const s = await fetch(`${API_BASE}/api/missions-stats/summary`).then(r=> r.ok ? r.json() : null).catch(()=> null)
      setStats(s)
    }catch{ setMissions([]) }
    setLoading(false)
  }
  useEffect(()=>{ load() },[])

  const open = async (id: string)=>{
    if(openId === id){ setOpenId(null); setDetail(null); return }
    setOpenId(id); setMsg('')
    try{ setDetail(await authed(`/api/missions/${id}`)) }catch(e: any){ setMsg(String(e.message || e)) }
  }

  const create = async ()=>{
    setMsg('')
    if(!area.trim()){ setMsg('Nhập khu vực mục tiêu.'); return }
    try{
      await authed('/api/missions', { method: 'POST', body: JSON.stringify({
        area: area.trim(),
        latitude: lat === '' ? null : Number(lat),
        longitude: lon === '' ? null : Number(lon),
        risk_at_creation: risk === '' ? null : Number(risk),
        priority,
      })})
      setArea(''); setLat(''); setLon(''); setRisk('')
      load()
    }catch(e: any){ setMsg(`Không tạo được (cần admin/kiểm lâm): ${String(e.message || e)}`) }
  }

  const setStatus = async (id: string, status: string, assignee?: string)=>{
    setMsg('')
    try{
      const d = await authed(`/api/missions/${id}/status`, { method: 'PATCH',
        body: JSON.stringify(assignee ? { status, assignee } : { status }) })
      setDetail(d)
      load()
    }catch(e: any){ setMsg(String(e.message || e)) }
  }

  const tick = async (id: string, idx: number, done: number[])=>{
    const next = done.includes(idx) ? done.filter(i=> i !== idx) : [...done, idx]
    try{
      const d = await authed(`/api/missions/${id}/checklist`, { method: 'PATCH', body: JSON.stringify({ done: next }) })
      setDetail((cur: any)=> cur ? { ...cur, checklist_done: d.checklist_done } : cur)
    }catch(e: any){ setMsg(String(e.message || e)) }
  }

  const uploadPhoto = async (f: File)=>{
    setUploading(true); setMsg('')
    try{
      const fd = new FormData()
      fd.append('file', f)
      fd.append('source', 'field')
      fd.append('uploader_id', 'field-web')
      if(detail?.latitude != null) fd.append('lat', String(detail.latitude))
      if(detail?.longitude != null) fd.append('lng', String(detail.longitude))
      const r = await fetch(`${API_BASE}/api/evidence`, { method: 'POST', body: fd })
      const j = await r.json().catch(()=> ({}))
      if(!r.ok) throw new Error(j.detail || `HTTP ${r.status}`)
      setPhotoHash(j.file_hash || '')
      setMsg(j.is_duplicate ? 'Ảnh trùng với ảnh đã có — vẫn dùng được nhưng đã gắn cờ.' : 'Đã tải ảnh, lấy hash để gửi kết quả.')
    }catch(e: any){ setMsg(`Tải ảnh thất bại: ${String(e.message || e)}`) }
    setUploading(false)
  }

  const submitResult = async (id: string)=>{
    setMsg('')
    try{
      const d = await authed(`/api/missions/${id}/result`, { method: 'POST', body: JSON.stringify({
        outcome, note: note || undefined,
        latitude: rlat === '' ? null : Number(rlat),
        longitude: rlon === '' ? null : Number(rlon),
        photo_hash: photoHash || undefined,
      })})
      setDetail(d); setNote(''); setPhotoHash('')
      load()
    }catch(e: any){ setMsg(String(e.message || e)) }
  }

  const shown = missions.filter(m=> filter === 'ALL' || m.status === filter)
  return (
    <div className="page" style={{maxWidth: 860, margin: '0 auto', padding: 16}}>
      <h1>Nhiệm vụ thực địa</h1>
      <p style={{fontSize: 13, color: '#64748B'}}>
        Kiểm lâm/admin tạo nhiệm vụ từ ô nguy cơ · thực địa checklist + ảnh GPS ·
        kết quả khép vòng (xác nhận cháy / báo động giả). Chỉ số tham khảo, trọng số chưa hiệu chuẩn.
      </p>

      {stats && (
        <section aria-label="Thống kê" style={{background: '#fff', border: '1px solid #E2E8E5', borderRadius: 12, padding: 12, marginTop: 8}}>
          <b style={{fontSize: 13}}>Thống kê</b>
          <div style={{display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 13, marginTop: 6}}>
            <span>Tổng: <b>{stats.missions_total}</b></span>
            <span>Xác nhận cháy: <b>{stats.results?.CONFIRMED_FIRE || 0}</b></span>
            <span>Báo động giả: <b>{stats.results?.FALSE_ALARM || 0}</b></span>
            <span>Tỷ lệ báo động giả: <b>{stats.false_alarm_rate === null ? '—' : `${Math.round(stats.false_alarm_rate * 100)}%`}</b></span>
          </div>
          <div style={{fontSize: 11, color: '#64748B', marginTop: 4}}>Chỉ dùng để chỉnh trọng số sau này — không tự đổi mô hình.</div>
        </section>
      )}

      <section aria-label="Tạo nhiệm vụ" style={{background: '#fff', border: '1px solid #E2E8E5', borderRadius: 12, padding: 12, marginTop: 8}}>
        <b style={{fontSize: 13}}>Tạo nhiệm vụ (admin/kiểm lâm)</b>
        <div style={{display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8}}>
          <input value={area} onChange={e=> setArea(e.target.value)} placeholder="Khu vực (vd: Ô c012_031)" aria-label="Khu vực"
            style={{flex: '2 1 200px', border: '1px solid #E2E8E5', borderRadius: 8, padding: '8px 10px', fontSize: 13}} />
          <input value={lat} onChange={e=> setLat(e.target.value)} placeholder="Vĩ độ" aria-label="Vĩ độ"
            style={{flex: '1 1 90px', border: '1px solid #E2E8E5', borderRadius: 8, padding: '8px 10px', fontSize: 13}} />
          <input value={lon} onChange={e=> setLon(e.target.value)} placeholder="Kinh độ" aria-label="Kinh độ"
            style={{flex: '1 1 90px', border: '1px solid #E2E8E5', borderRadius: 8, padding: '8px 10px', fontSize: 13}} />
          <input value={risk} onChange={e=> setRisk(e.target.value)} placeholder="Điểm 0–100" aria-label="Điểm lúc tạo"
            style={{flex: '1 1 90px', border: '1px solid #E2E8E5', borderRadius: 8, padding: '8px 10px', fontSize: 13}} />
          <select value={priority} onChange={e=> setPriority(e.target.value)} aria-label="Mức ưu tiên"
            style={{border: '1px solid #E2E8E5', borderRadius: 8, padding: '8px 10px', fontSize: 13}}>
            {[{v:'LOW',l:'Thấp'},{v:'NORMAL',l:'Thường'},{v:'HIGH',l:'Cao'},{v:'CRITICAL',l:'Nguy kịch'}].map(p=> <option key={p.v} value={p.v}>{p.l}</option>)}
          </select>
          <button onClick={create} style={{background: '#0F766E', color: '#fff', border: 0, borderRadius: 999, padding: '8px 18px', fontSize: 13, fontWeight: 700}}>Tạo</button>
        </div>
      </section>

      {msg && <div role="status" style={{marginTop: 8, fontSize: 13, background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '8px 12px'}}>{msg}</div>}

      <div style={{display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap'}}>
        {[{v:'ALL',l:'Tất cả'},{v:'NEW',l:'Mới'},{v:'ASSIGNED',l:'Đã giao'},{v:'IN_PROGRESS',l:'Đang kiểm tra'},{v:'DONE',l:'Xong'}].map(s=> (
          <button key={s.v} onClick={()=> setFilter(s.v)}
            style={{padding: '6px 12px', borderRadius: 999, border: '1px solid #E2E8E5', background: filter === s.v ? '#0B1412' : '#fff', color: filter === s.v ? '#fff' : '#000', fontSize: 12}}>
            {s.l}
          </button>
        ))}
      </div>

      {loading && <p>Đang tải…</p>}
      {!loading && shown.length === 0 && (
        <div style={{background: '#fff', border: '1px solid #E2E8E5', borderRadius: 12, padding: 24, textAlign: 'center', marginTop: 8}}>
          <div style={{fontSize: 14, fontWeight: 700}}>Chưa có nhiệm vụ</div>
          <div style={{fontSize: 13, color: '#64748B', marginTop: 6}}>Khi có ô nguy cơ cao, kiểm lâm tạo nhiệm vụ kiểm tra tại đây.</div>
          <Link to="/" style={{display: 'inline-block', marginTop: 12, background: '#0F766E', color: '#fff', padding: '8px 20px', borderRadius: 999, fontSize: 13, fontWeight: 700, textDecoration: 'none'}}>Về bản đồ</Link>
        </div>
      )}
      {shown.map(m=> (
        <div key={m.id} style={{background: '#fff', border: '1px solid #E2E8E5', borderRadius: 12, padding: 12, marginTop: 8}}>
          <button onClick={()=> open(m.id)} aria-expanded={openId === m.id}
            style={{all: 'unset', cursor: 'pointer', width: '100%', display: 'block'}}>
            <div style={{display: 'flex', justifyContent: 'space-between', gap: 8}}>
              <b>{m.area}</b>
              <span style={{fontSize: 11, padding: '2px 8px', borderRadius: 999, background: '#F1F5F9'}}>{tenTrangThai(m.status)}</span>
            </div>
            <div style={{fontSize: 12, color: '#64748B', marginTop: 4}}>
              {[m.priority, m.assignee ? `→ ${m.assignee}` : '', typeof m.risk_at_creation === 'number' ? `risk lúc tạo: ${m.risk_at_creation}` : ''].filter(Boolean).join(' · ')}
            </div>
          </button>
          {openId === m.id && detail && detail.id === m.id && (
            <div style={{marginTop: 10, borderTop: '1px solid #E2E8E5', paddingTop: 10}}>
              <div style={{fontSize: 12, fontWeight: 800}}>CHECKLIST THỰC ĐỊA</div>
              {(detail.checklist_steps || []).map((s: string, i: number)=> (
                <label key={i} style={{display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginTop: 6}}>
                  <input type="checkbox" checked={(detail.checklist_done || []).includes(i)}
                    onChange={()=> tick(detail.id, i, detail.checklist_done || [])} /> {s}
                </label>
              ))}
              <div style={{display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap'}}>
                {detail.status === 'NEW' && <button onClick={()=> setStatus(detail.id, 'ASSIGNED')} style={btnPri}>Nhận nhiệm vụ</button>}
                {detail.status === 'ASSIGNED' && <button onClick={()=> setStatus(detail.id, 'IN_PROGRESS')} style={btnPri}>Bắt đầu kiểm tra</button>}
              </div>
              {detail.status === 'IN_PROGRESS' && !detail.result && (
                <div style={{marginTop: 10, background: '#F8FAF9', borderRadius: 8, padding: 10}}>
                  <div style={{fontSize: 12, fontWeight: 800}}>GỬI KẾT QUẢ</div>
                  <div style={{display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6}}>
                    <select value={outcome} onChange={e=> setOutcome(e.target.value)} aria-label="Kết quả"
                      style={{border: '1px solid #E2E8E5', borderRadius: 8, padding: '8px 10px', fontSize: 13}}>
                      <option value="FALSE_ALARM">Báo động giả</option>
                      <option value="CONFIRMED_FIRE">Xác nhận cháy</option>
                      <option value="RESOLVED">Đã xử lý xong</option>
                    </select>
                    <input value={rlat} onChange={e=> setRlat(e.target.value)} placeholder="Vĩ độ tại chỗ" aria-label="Vĩ độ tại chỗ"
                      style={{flex: '1 1 100px', border: '1px solid #E2E8E5', borderRadius: 8, padding: '8px 10px', fontSize: 13}} />
                    <input value={rlon} onChange={e=> setRlon(e.target.value)} placeholder="Kinh độ tại chỗ" aria-label="Kinh độ tại chỗ"
                      style={{flex: '1 1 100px', border: '1px solid #E2E8E5', borderRadius: 8, padding: '8px 10px', fontSize: 13}} />
                  </div>
                  <input value={note} onChange={e=> setNote(e.target.value)} placeholder="Ghi chú hiện trường" aria-label="Ghi chú"
                    style={{width: '100%', marginTop: 6, border: '1px solid #E2E8E5', borderRadius: 8, padding: '8px 10px', fontSize: 13}} />
                  <div style={{display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap', alignItems: 'center'}}>
                    <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{display: 'none'}}
                      onChange={e=> { const f = e.target.files?.[0]; if(f) uploadPhoto(f); e.target.value = '' }} />
                    <button onClick={()=> fileRef.current?.click()} disabled={uploading}
                      style={btnSec}>{uploading ? 'Đang tải…' : '📷 Chụp/tải ảnh GPS'}</button>
                    {photoHash && <span style={{fontSize: 11, color: '#0F766E'}}>Ảnh đã gắn (hash {photoHash.slice(0, 10)}…)</span>}
                  </div>
                  <button onClick={()=> submitResult(detail.id)} style={{...btnPri, marginTop: 8}}>Gửi kết quả</button>
                </div>
              )}
              {detail.result && (
                <div style={{marginTop: 10, fontSize: 13, background: detail.result.outcome === 'FALSE_ALARM' ? '#F1F5F9' : '#FEF2F2', borderRadius: 8, padding: 10}}>
                  <b>Kết quả: {detail.result.outcome}</b>
                  {detail.result.note && <div style={{marginTop: 4}}>{detail.result.note}</div>}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

const btnPri = { background: '#0F766E', color: '#fff', border: 0, borderRadius: 999, padding: '8px 16px', fontSize: 13, fontWeight: 700 } as const
const btnSec = { background: '#fff', color: '#000', border: '1px solid #E2E8E5', borderRadius: 999, padding: '8px 16px', fontSize: 13 } as const

function tenTrangThai(s?: string): string {
  if(s === 'NEW') return 'Mới'
  if(s === 'ASSIGNED') return 'Đã giao'
  if(s === 'IN_PROGRESS') return 'Đang kiểm tra'
  if(s === 'DONE') return 'Xong'
  return s || '—'
}
