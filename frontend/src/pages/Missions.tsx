import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, API_BASE } from '../services/api'

type Mission = {
  id: string; area: string; cell_id?: string | null; zone?: string | null
  latitude?: number | null; longitude?: number | null
  risk_at_creation?: number | null; priority?: string; inspection_priority?: number | null
  decision?: string | null; decided_by?: string | null
  due_at?: string | null; status?: string; assignee?: string | null
  created_by?: string | null; checklist_steps?: string[]; checklist_done?: number[]
  created_at?: string | null
  result?: { outcome: string; note?: string | null; match_result?: string | null;
    vegetation?: string | null; smoke_heat?: string | null; human_activity?: string | null;
    water_source?: string | null; access?: string | null } | null
}

type DeXuat = {
  tieu_de: string; area: string; zone?: string; latitude: number; longitude: number
  risk: number | null; priority: number | null; muc: string; han: string; han_text: string
  ly_do: string[]; hotspot?: { khoang_cach_km: number; do_tin_cay?: string } | null
  top_yeu_to: string[]; viec_theo_yeu_to: { viec: string; ly_do: string }[]
  checklist: string[]; origin: string
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

const btn = (bg: string, color = '#fff'): any => ({ background: bg, color, border: bg === '#fff' ? '1px solid #E2E8E5' : 0,
  borderRadius: 999, padding: '12px 18px', fontSize: 14, fontWeight: 700, minHeight: 44, cursor: 'pointer' })

export default function Missions(){
  const [missions, setMissions] = useState<Mission[]>([])
  const [dexuats, setDexuats] = useState<DeXuat[]>([])
  const [nhatKy, setNhatKy] = useState<any[]>([])
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('ALL')
  const [openId, setOpenId] = useState<string | null>(null)
  const [detail, setDetail] = useState<Mission | null>(null)
  const [msg, setMsg] = useState('')
  const [area, setArea] = useState('')
  const [lat, setLat] = useState('')
  const [lon, setLon] = useState('')
  const [risk, setRisk] = useState('')
  const [priority, setPriority] = useState('NORMAL')
  const [outcome, setOutcome] = useState('FALSE_ALARM')
  const [note, setNote] = useState('')
  const [rlat, setRlat] = useState('')
  const [rlon, setRlon] = useState('')
  const [photoHash, setPhotoHash] = useState('')
  const [thucVat, setThucVat] = useState('')
  const [khoiNhiet, setKhoiNhiet] = useState('')
  const [hoatDong, setHoatDong] = useState('')
  const [nguonNuoc, setNguonNuoc] = useState('')
  const [tiepCan, setTiepCan] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = async ()=>{
    setLoading(true)
    try{
      const d: any = await api.missions()
      setMissions(Array.isArray(d) ? d : (d?.missions || []))
      const rec: any = await api.missionRecommendations()
      setDexuats(rec?.recommendations || [])
      const log: any = await api.missionDecisions()
      setNhatKy(log?.decisions || [])
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

  const quyetDinh = async (dx: DeXuat, decision: string)=>{
    setMsg('')
    try{
      const j = await authed('/api/missions/recommendations/decide', { method: 'POST',
        body: JSON.stringify({ decision, area: dx.area, zone: dx.zone, latitude: dx.latitude,
          longitude: dx.longitude, risk: dx.risk, priority: dx.priority, muc: dx.muc }) })
      setMsg(decision === 'XAC_NHAN' ? `Đã tạo nhiệm vụ ${j.mission_id}.` : `Đã ghi quyết định ${decision}.`)
      load()
    }catch(e: any){ setMsg(`Không ghi được (cần kiểm lâm/admin): ${String(e.message || e)}`) }
  }

  const xoaNhatKy = async (id: string)=>{
    setMsg('')
    try{
      await authed(`/api/missions/decisions/${id}`, { method: 'DELETE' })
      setMsg('Đã xóa mục nhật ký.')
      load()
    }catch(e: any){ setMsg(`Không xóa được (cần admin): ${String(e.message || e)}`) }
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

  const setStatus = async (id: string, status: string)=>{
    setMsg('')
    try{
      const d = await authed(`/api/missions/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) })
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
        vegetation: thucVat || undefined, smoke_heat: khoiNhiet || undefined,
        human_activity: hoatDong || undefined, water_source: nguonNuoc || undefined,
        access: tiepCan || undefined,
      })})
      setDetail(d); setNote(''); setPhotoHash('')
      load()
    }catch(e: any){ setMsg(String(e.message || e)) }
  }

  const shown = missions.filter(m=> filter === 'ALL' || m.status === filter)
  return (
    <div className="page" style={{maxWidth: 960, margin: '0 auto', padding: 16}}>
      <h1>Nhiệm vụ thực địa</h1>
      <p style={{fontSize: 13, color: '#64748B'}}>
        AI chỉ đề xuất — không tự giao nhiệm vụ, không tự phát cảnh báo.
      </p>
      <div role="alert" style={{ background: '#FEF2F2', border: '2px solid #DC2626', borderRadius: 12,
        padding: '10px 14px', fontSize: 13, fontWeight: 800, color: '#991B1B', marginTop: 8 }}>
        Cảnh báo chính thức: CHƯA CÓ — chỉ cơ quan có thẩm quyền mới ban hành.
      </div>

      <section aria-label="Đề xuất kiểm tra" style={{background: '#fff', border: '1px solid #E2E8E5', borderRadius: 12, padding: 12, marginTop: 12}}>
        <b style={{fontSize: 14}}>ĐỀ XUẤT KIỂM TRA THỰC ĐỊA {dexuats.length > 0 && `(${dexuats.length})`}</b>
        <div style={{fontSize: 12, color: '#64748B', marginTop: 4}}>
          Điều kiện: Risk ≥ 55 HOẶC điểm nóng ≤ 3 km. Ưu tiên chỉ để sắp thứ tự, không phải xác suất cháy.
        </div>
        {dexuats.length === 0 && <div style={{fontSize: 13, color: '#64748B', marginTop: 8}}>Chưa có đề xuất nào.</div>}
        {dexuats.map((dx, i)=> (
          <div key={i} style={{border: '1px solid #E2E8E5', borderRadius: 10, padding: 10, marginTop: 8}}>
            <div style={{display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap'}}>
              <b>{dx.area}{dx.zone ? ` · ${dx.zone}` : ''}</b>
              <span style={{fontSize: 12, fontWeight: 800, color: dx.muc === 'CAO' ? '#DC2626' : '#D97706'}}>
                ƯU TIÊN {dx.muc} · {dx.priority}/100
              </span>
            </div>
            <div style={{fontSize: 12, color: '#475569', marginTop: 4}}>
              Risk {dx.risk ?? '—'}{dx.hotspot ? ` · điểm nóng cách ${dx.hotspot.khoang_cach_km} km (tin cậy ${dx.hotspot.do_tin_cay || 'không rõ'})` : ''} · {dx.han_text}
            </div>
            <div style={{fontSize: 12, marginTop: 4}}>Lý do: {dx.ly_do.join(' · ')}</div>
            {dx.top_yeu_to.length > 0 && <div style={{fontSize: 12, color: '#475569'}}>Yếu tố: {dx.top_yeu_to.join(', ')}</div>}
            {dx.viec_theo_yeu_to.map((v, k)=> (
              <div key={k} style={{fontSize: 12, marginTop: 2}}>• <b>{v.viec}</b> — {v.ly_do}</div>
            ))}
            <div style={{display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap'}}>
              <button onClick={()=> quyetDinh(dx, 'XAC_NHAN')} style={btn('#0F766E')}>XÁC NHẬN</button>
              <button onClick={()=> quyetDinh(dx, 'TU_CHOI')} style={btn('#fff', '#000')}>TỪ CHỐI</button>
              <button onClick={()=> quyetDinh(dx, 'CAN_THEM_DU_LIEU')} style={btn('#fff', '#000')}>CẦN THÊM DỮ LIỆU</button>
            </div>
          </div>
        ))}
      </section>

      {stats && (
        <section aria-label="Thống kê" style={{background: '#fff', border: '1px solid #E2E8E5', borderRadius: 12, padding: 12, marginTop: 8}}>
          <b style={{fontSize: 13}}>Thống kê</b>
          <div style={{display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 13, marginTop: 6}}>
            <span>Tổng: <b>{stats.missions_total}</b></span>
            <span>Xác nhận cháy: <b>{stats.results?.CONFIRMED_FIRE || 0}</b></span>
            <span>Báo động giả: <b>{stats.results?.FALSE_ALARM || 0}</b></span>
            <span>Khớp mô hình–thực địa: <b>{stats.model_field?.MATCH ?? '—'}</b></span>
            <span>Lệch: <b>{stats.model_field?.MISMATCH ?? '—'}</b></span>
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
          <button onClick={create} style={btn('#0F766E')}>Tạo</button>
        </div>
      </section>

      {msg && <div role="status" style={{marginTop: 8, fontSize: 13, background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '8px 12px'}}>{msg}</div>}

      <div style={{display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap'}}>
        {[{v:'ALL',l:'Tất cả'},{v:'NEW',l:'Mới'},{v:'ASSIGNED',l:'Đã giao'},{v:'IN_PROGRESS',l:'Đang kiểm tra'},{v:'DONE',l:'Xong'}].map(s=> (
          <button key={s.v} onClick={()=> setFilter(s.v)}
            style={{padding: '10px 14px', minHeight: 44, borderRadius: 999, border: '1px solid #E2E8E5', background: filter === s.v ? '#0B1412' : '#fff', color: filter === s.v ? '#fff' : '#000', fontSize: 13}}>
            {s.l}
          </button>
        ))}
      </div>

      {loading && <p>Đang tải…</p>}
      {!loading && shown.length === 0 && (
        <div style={{background: '#fff', border: '1px solid #E2E8E5', borderRadius: 12, padding: 24, textAlign: 'center', marginTop: 8}}>
          <div style={{fontSize: 14, fontWeight: 700}}>Chưa có nhiệm vụ</div>
          <div style={{fontSize: 13, color: '#64748B', marginTop: 6}}>Khi có ô nguy cơ cao, kiểm lâm tạo nhiệm vụ kiểm tra tại đây.</div>
          <Link to="/" style={{display: 'inline-block', marginTop: 12, background: '#0F766E', color: '#fff', padding: '12px 20px', minHeight: 44, borderRadius: 999, fontSize: 13, fontWeight: 700, textDecoration: 'none'}}>Về bản đồ</Link>
        </div>
      )}
      {shown.map(m=> (
        <div key={m.id} style={{background: '#fff', border: '1px solid #E2E8E5', borderRadius: 12, padding: 12, marginTop: 8}}>
          <button onClick={()=> open(m.id)} aria-expanded={openId === m.id}
            style={{all: 'unset', cursor: 'pointer', width: '100%', display: 'block', minHeight: 44}}>
            <div style={{display: 'flex', justifyContent: 'space-between', gap: 8}}>
              <b>{m.area}</b>
              <span style={{fontSize: 11, padding: '2px 8px', borderRadius: 999, background: '#F1F5F9'}}>{tenTrangThai(m.status)}</span>
            </div>
            <div style={{fontSize: 12, color: '#64748B', marginTop: 4}}>
              {[m.priority, m.assignee ? `→ ${m.assignee}` : '', typeof m.risk_at_creation === 'number' ? `điểm lúc tạo: ${m.risk_at_creation}` : '',
                typeof m.inspection_priority === 'number' ? `ưu tiên kiểm tra: ${m.inspection_priority}` : ''].filter(Boolean).join(' · ')}
            </div>
          </button>
          {openId === m.id && detail && detail.id === m.id && (
            <div style={{marginTop: 10, borderTop: '1px solid #E2E8E5', paddingTop: 10}}>
              <div style={{fontSize: 12, fontWeight: 800}}>DANH SÁCH VIỆC</div>
              {(detail.checklist_steps || []).map((s: string, i: number)=> (
                <label key={i} style={{display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginTop: 6, minHeight: 44}}>
                  <input type="checkbox" checked={(detail.checklist_done || []).includes(i)}
                    onChange={()=> tick(detail.id, i, detail.checklist_done || [])} style={{width: 20, height: 20}} /> {s}
                </label>
              ))}
              <div style={{display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap'}}>
                {detail.status === 'NEW' && <button onClick={()=> setStatus(detail.id, 'ASSIGNED')} style={btn('#0F766E')}>Nhận nhiệm vụ</button>}
                {detail.status === 'ASSIGNED' && <button onClick={()=> setStatus(detail.id, 'IN_PROGRESS')} style={btn('#0F766E')}>Bắt đầu kiểm tra</button>}
              </div>
              {detail.status === 'IN_PROGRESS' && !detail.result && (
                <div style={{marginTop: 10, background: '#F8FAF9', borderRadius: 8, padding: 10}}>
                  <div style={{fontSize: 12, fontWeight: 800}}>GỬI KẾT QUẢ THỰC ĐỊA</div>
                  <div style={{display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6}}>
                    <select value={outcome} onChange={e=> setOutcome(e.target.value)} aria-label="Kết quả"
                      style={{border: '1px solid #E2E8E5', borderRadius: 8, padding: '8px 10px', fontSize: 13, minHeight: 44}}>
                      <option value="FALSE_ALARM">Báo động giả</option>
                      <option value="CONFIRMED_FIRE">Xác nhận cháy</option>
                      <option value="RESOLVED">Đã xử lý xong</option>
                    </select>
                    <input value={rlat} onChange={e=> setRlat(e.target.value)} placeholder="Vĩ độ tại chỗ" aria-label="Vĩ độ tại chỗ"
                      style={{flex: '1 1 100px', border: '1px solid #E2E8E5', borderRadius: 8, padding: '8px 10px', fontSize: 13}} />
                    <input value={rlon} onChange={e=> setRlon(e.target.value)} placeholder="Kinh độ tại chỗ" aria-label="Kinh độ tại chỗ"
                      style={{flex: '1 1 100px', border: '1px solid #E2E8E5', borderRadius: 8, padding: '8px 10px', fontSize: 13}} />
                  </div>
                  <input value={thucVat} onChange={e=> setThucVat(e.target.value)} placeholder="Thực vật (vd: thảm khô, cỏ tranh)" aria-label="Thực vật"
                    style={{width: '100%', marginTop: 6, border: '1px solid #E2E8E5', borderRadius: 8, padding: '8px 10px', fontSize: 13}} />
                  <input value={khoiNhiet} onChange={e=> setKhoiNhiet(e.target.value)} placeholder="Khói/nhiệt (vd: không thấy khói)" aria-label="Khói nhiệt"
                    style={{width: '100%', marginTop: 6, border: '1px solid #E2E8E5', borderRadius: 8, padding: '8px 10px', fontSize: 13}} />
                  <input value={hoatDong} onChange={e=> setHoatDong(e.target.value)} placeholder="Hoạt động con người (vd: không)" aria-label="Hoạt động con người"
                    style={{width: '100%', marginTop: 6, border: '1px solid #E2E8E5', borderRadius: 8, padding: '8px 10px', fontSize: 13}} />
                  <input value={nguonNuoc} onChange={e=> setNguonNuoc(e.target.value)} placeholder="Nguồn nước (vd: hồ cách 2km)" aria-label="Nguồn nước"
                    style={{width: '100%', marginTop: 6, border: '1px solid #E2E8E5', borderRadius: 8, padding: '8px 10px', fontSize: 13}} />
                  <input value={tiepCan} onChange={e=> setTiepCan(e.target.value)} placeholder="Tiếp cận (vd: đường đất vào được)" aria-label="Tiếp cận"
                    style={{width: '100%', marginTop: 6, border: '1px solid #E2E8E5', borderRadius: 8, padding: '8px 10px', fontSize: 13}} />
                  <input value={note} onChange={e=> setNote(e.target.value)} placeholder="Ghi chú hiện trường" aria-label="Ghi chú"
                    style={{width: '100%', marginTop: 6, border: '1px solid #E2E8E5', borderRadius: 8, padding: '8px 10px', fontSize: 13}} />
                  <div style={{display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap', alignItems: 'center'}}>
                    <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{display: 'none'}}
                      onChange={e=> { const f = e.target.files?.[0]; if(f) uploadPhoto(f); e.target.value = '' }} />
                    <button onClick={()=> fileRef.current?.click()} disabled={uploading} style={btn('#fff', '#000')}>{uploading ? 'Đang tải…' : '📷 Chụp/tải ảnh GPS'}</button>
                    {photoHash && <span style={{fontSize: 11, color: '#0F766E'}}>Ảnh đã gắn (hash {photoHash.slice(0, 10)}…)</span>}
                  </div>
                  <button onClick={()=> submitResult(detail.id)} style={{...btn('#0F766E'), marginTop: 8}}>Gửi kết quả</button>
                </div>
              )}
              {detail.result && (
                <div style={{marginTop: 10, fontSize: 13, background: detail.result.outcome === 'FALSE_ALARM' ? '#F1F5F9' : '#FEF2F2', borderRadius: 8, padding: 10}}>
                  <b>Kết quả: {detail.result.outcome}</b>
                  {detail.result.note && <div style={{marginTop: 4}}>{detail.result.note}</div>}
                  <div style={{marginTop: 6, fontWeight: 800}}>
                    AI PREDICTED vs FIELD OBSERVED → {detail.result.match_result === 'MATCH' ? 'MODEL–FIELD MATCH' : 'MODEL–FIELD MISMATCH'}
                  </div>
                  <div style={{fontSize: 11, color: '#64748B'}}>Chỉ để thống kê, chưa tự đổi trọng số.</div>
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      <section aria-label="Nhật ký quyết định" style={{background: '#fff', border: '1px solid #E2E8E5', borderRadius: 12, padding: 12, marginTop: 12}}>
        <b style={{fontSize: 14}}>NHẬT KÝ QUYẾT ĐỊNH</b>
        {nhatKy.length === 0 && <div style={{fontSize: 13, color: '#64748B', marginTop: 6}}>Chưa có quyết định nào.</div>}
        {nhatKy.map((d: any)=> (
          <div key={d.id} style={{display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, borderTop: '1px solid #F1F5F9', padding: '6px 0', marginTop: 4}}>
            <span>{d.timestamp ? String(d.timestamp).slice(0, 16).replace('T', ' ') : ''} · {d.area} · {d.action} · {d.detail}</span>
            <button onClick={()=> xoaNhatKy(d.id)} aria-label={`Xóa mục ${d.id}`}
              style={{border: '1px solid #E2E8E5', background: '#fff', borderRadius: 999, padding: '10px 14px', minHeight: 44, fontSize: 12}}>Xóa</button>
          </div>
        ))}
      </section>
    </div>
  )
}

function tenTrangThai(s?: string): string {
  if(s === 'NEW') return 'Mới'
  if(s === 'ASSIGNED') return 'Đã giao'
  if(s === 'IN_PROGRESS') return 'Đang kiểm tra'
  if(s === 'DONE') return 'Xong'
  return s || '—'
}
