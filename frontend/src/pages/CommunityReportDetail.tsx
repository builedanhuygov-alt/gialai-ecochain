import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, MapPin } from 'lucide-react'
import { API_BASE, photoUrl } from '../services/api'

type Report = {
  report_id: string
  location: { latitude: number; longitude: number }
  reported_at: string | null
  description: string
  photo: { available: boolean; url: string | null }
  photos: { photo_id: string; url: string; gps: number[] | null; uploaded_at: string | null; verification_status: string }[]
  status: string
  linked_event_id: string | null
  match_distance_km: number | null
}

export default function CommunityReportDetail() {
  const { reportId = '' } = useParams()
  const [report, setReport] = useState<Report | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'unavailable'>('loading')
  const [confs, setConfs] = useState<any[]>([])
  const [nick, setNick] = useState('')
  const [clat, setClat] = useState('')
  const [clon, setClon] = useState('')
  const [cmsg, setCmsg] = useState('')
  const loadConfs = ()=>{
    fetch(`${API_BASE}/api/citizen/fire-reports/${encodeURIComponent(reportId)}/confirmations`, { cache: 'no-store' })
      .then(r=> r.ok ? r.json() : null).then(j=> setConfs(j?.confirmations || [])).catch(()=> {})
  }
  useEffect(() => {
    let active = true
    fetch(`${API_BASE}/api/citizen/fire-reports/${encodeURIComponent(reportId)}`, { cache: 'no-store' })
      .then(response => {
        if (response.status === 404) throw new Error('NOT_FOUND')
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.json()
      })
      .then(data => { if (active) { setReport(data); setState('ready'); loadConfs() } })
      .catch(error => { if (active) setState(String(error).includes('NOT_FOUND') ? 'missing' : 'unavailable') })
    return () => { active = false }
  }, [reportId])

  const locate = ()=>{
    if(!navigator.geolocation){ setCmsg('Trình duyệt không hỗ trợ định vị.'); return }
    navigator.geolocation.getCurrentPosition(
      p=> { setClat(String(p.coords.latitude.toFixed(6))); setClon(String(p.coords.longitude.toFixed(6))); setCmsg('') },
      ()=> setCmsg('Không lấy được vị trí — nhập tay kinh/vĩ độ.'),
      { timeout: 10000 })
  }
  const vote = async (confirmed: boolean)=>{
    setCmsg('')
    if(!nick.trim()){ setCmsg('Nhập biệt danh trước khi xác minh.'); return }
    if(clat === '' || clon === ''){ setCmsg('Cần GPS của bạn (trong ~1 km quanh báo cáo).'); return }
    try{
      const r = await fetch(`${API_BASE}/api/citizen/fire-reports/${encodeURIComponent(reportId)}/confirm`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: nick.trim(), confirmed,
          latitude: Number(clat), longitude: Number(clon),
          device_id: (()=>{ try{
            let d = localStorage.getItem('ecogl_device'); if(!d){ d = `dev-${Math.random().toString(36).slice(2)}`; localStorage.setItem('ecogl_device', d) } return d
          }catch{ return undefined } })() }),
      })
      const j = await r.json().catch(()=> ({}))
      if(!r.ok) throw new Error(j.detail || `HTTP ${r.status}`)
      setCmsg(`Đã ghi nhận (${j.confirms} xác nhận). Trạng thái: ${j.report_status}`)
      setReport((cur: any)=> cur ? { ...cur, status: j.report_status } : cur)
      loadConfs()
    }catch(e: any){ setCmsg(String(e.message || e)) }
  }

  return (
    <main style={{ maxWidth: 860, margin: '0 auto', padding: 20, color: '#17251f' }}>
      <Link to="/community" style={{ display: 'inline-flex', gap: 7, alignItems: 'center', color: '#176b52', textDecoration: 'none', fontSize: 12, fontWeight: 800 }}><ArrowLeft size={15} /> Quay lại cộng đồng</Link>
      <h1 style={{ fontSize: 22, margin: '14px 0 4px' }}>Chi tiết báo cáo cộng đồng</h1>
      {state === 'loading' && <p>Đang tải báo cáo…</p>}
      {state === 'missing' && <p>Không tìm thấy báo cáo đã lưu.</p>}
      {state === 'unavailable' && <p>Máy chủ báo cáo hiện chưa khả dụng.</p>}
      {report && (
        <article style={{ marginTop: 14, border: '1px solid #dce6e1', borderRadius: 8, padding: 16, background: '#fff' }}>
          <div style={{ fontSize: 11, color: '#63736c' }}>MÃ BÁO CÁO · {report.report_id}</div>
          <div style={{ fontSize: 12, marginTop: 8 }}>Thời gian máy chủ: {report.reported_at ? new Date(report.reported_at).toLocaleString('vi-VN') : 'Chưa có dữ liệu'}</div>
          <div style={{ fontSize: 12, marginTop: 6 }}><MapPin size={13} /> {report.location.latitude}, {report.location.longitude}</div>
          <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, fontSize: 14 }}>{report.description}</p>
          <div style={{ fontSize: 11, color: '#63736c' }}>Trạng thái báo cáo: {report.status}</div>
          {report.linked_event_id ? (
            <p style={{ fontSize: 12, background: '#f2f7f4', padding: 10, borderRadius: 5 }}>
              Gần phát hiện FIRMS <Link to={`/events/${encodeURIComponent(report.linked_event_id)}`}>{report.linked_event_id}</Link>
              {report.match_distance_km != null ? ` · ${report.match_distance_km} km` : ''}. Khoảng cách không xác nhận đây là cùng đám cháy.
            </p>
          ) : <p style={{ fontSize: 12, color: '#63736c' }}>Báo cáo độc lập, hiện chưa liên kết FIRMS event.</p>}
          {report.photos?.length > 0 ? report.photos.map(photo => (
            <figure key={photo.photo_id} style={{ margin: '12px 0' }}>
              <img src={photoUrl(photo.url)} alt={`Ảnh thực địa của báo cáo ${report.report_id}`} style={{ width: '100%', maxHeight: 520, objectFit: 'contain', background: '#edf2ef' }} />
              <figcaption style={{ fontSize: 11, color: '#63736c', marginTop: 5 }}>
                Ảnh thực địa · tải lên {photo.uploaded_at ? new Date(photo.uploaded_at).toLocaleString('vi-VN') : 'chưa có thời gian'}
                {photo.gps ? ` · Tọa độ báo cáo đính kèm khi tải ảnh ${photo.gps[0]}, ${photo.gps[1]}` : ' · Ảnh chưa có GPS riêng'}
              </figcaption>
            </figure>
          )) : <p style={{ fontSize: 12, color: '#63736c' }}>Chưa có ảnh thực địa.</p>}
          <section aria-label="Xác minh báo cáo" style={{ marginTop: 16, borderTop: '1px solid #dce6e1', paddingTop: 12 }}>
            <h2 style={{ fontSize: 15, margin: '0 0 4px' }}>Xác minh ({confs.filter(c=> c.confirmed).length} 👍 / {confs.filter(c=> !c.confirmed).length} 👎)</h2>
            <p style={{ fontSize: 11, color: '#63736c', margin: '0 0 8px' }}>
              Luật: mỗi người/thiết bị 1 lần · người báo không tự xác nhận · GPS trong ~1 km · trong 24 giờ.
            </p>
            {confs.map(c=> (
              <div key={c.id} style={{ fontSize: 12, padding: '4px 0' }}>
                <b>{c.user_id}</b> {c.confirmed ? '👍 xác nhận' : '👎 phản đối'}
                <span style={{ color: '#63736c' }}> · {c.created_at ? new Date(c.created_at).toLocaleString('vi-VN') : ''}</span>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              <input value={nick} onChange={e=> setNick(e.target.value)} placeholder="Biệt danh" aria-label="Biệt danh"
                style={{ border: '1px solid #dce6e1', borderRadius: 8, padding: '8px 10px', fontSize: 13 }} />
              <input value={clat} onChange={e=> setClat(e.target.value)} placeholder="Vĩ độ của bạn" aria-label="Vĩ độ của bạn"
                style={{ border: '1px solid #dce6e1', borderRadius: 8, padding: '8px 10px', fontSize: 13, width: 130 }} />
              <input value={clon} onChange={e=> setClon(e.target.value)} placeholder="Kinh độ của bạn" aria-label="Kinh độ của bạn"
                style={{ border: '1px solid #dce6e1', borderRadius: 8, padding: '8px 10px', fontSize: 13, width: 130 }} />
              <button onClick={locate} style={{ border: '1px solid #dce6e1', background: '#fff', borderRadius: 999, padding: '8px 12px', fontSize: 12 }}>📍 Vị trí tôi</button>
              <button onClick={()=> vote(true)} style={{ background: '#0F766E', color: '#fff', border: 0, borderRadius: 999, padding: '8px 16px', fontSize: 13, fontWeight: 700 }}>👍 Xác nhận cháy</button>
              <button onClick={()=> vote(false)} style={{ background: '#fff', border: '1px solid #dce6e1', borderRadius: 999, padding: '8px 16px', fontSize: 13 }}>👎 Không cháy</button>
            </div>
            {cmsg && <p role="status" style={{ fontSize: 12, marginTop: 8 }}>{cmsg}</p>}
          </section>
        </article>
      )}
    </main>
  )
}
