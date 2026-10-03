import { useEffect, useState } from 'react'
import { api } from '../services/api'

type AlertRow = {
  id: string; level?: string; status?: string
  title?: string; administrative_unit_id?: string; priority?: string; created_at?: string
}

const levelColor = (l?: string) =>
  l === 'CRITICAL' ? '#DC2626' : l === 'HIGH' ? '#F59E0B' : '#0F766E'

// Read-only alert list (unified alerts). Acknowledge/verify actions live in
// the field-mission workflow, not here.
export default function Notifications(){
  const [rows, setRows] = useState<AlertRow[]>([])
  const [filter, setFilter] = useState<'ALL'|'CRITICAL'|'HIGH'>('ALL')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(()=>{
    setLoading(true)
    api.alerts()
      .then((d: any)=> setRows(Array.isArray(d) ? d : []))
      .catch((e)=> setError(String(e.message || e)))
      .finally(()=> setLoading(false))
  },[])

  const shown = rows.filter(a => filter === 'ALL' || a.level === filter)
  const active = rows.filter(a => a.status === 'ACTIVE').length

  return (
    <div style={{display:'flex', flexDirection:'column', gap:16}}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <h1>Thông báo {active > 0 && <span style={{fontSize:12, background:'#DC2626', color:'#fff', padding:'2px 8px', borderRadius:999}}>{active} đang hoạt động</span>}</h1>
        <div style={{display:'flex', gap:6}}>
          {(['ALL','CRITICAL','HIGH'] as const).map(f=> (
            <button key={f} onClick={()=> setFilter(f)} style={{padding:'6px 12px', borderRadius:999, border:'1px solid #E2E8E5', background: filter===f ? '#0B1412' : '#fff', color: filter===f ? '#fff' : '#000'}}>
              {f === 'ALL' ? 'Tất cả' : f === 'CRITICAL' ? 'Nguy kịch' : 'Cảnh báo'}
            </button>
          ))}
        </div>
      </div>

      {loading && <div className="card">Đang tải thông báo...</div>}
      {error && <div className="card" style={{borderColor:'#DC2626'}}>Lỗi: {error}</div>}
      {!loading && !error && shown.length === 0 && <div className="card">Không có thông báo nào.</div>}

      {shown.map(a=> (
        <div key={a.id} className="card" style={{borderLeft:`4px solid ${levelColor(a.level)}`}}>
          <div style={{display:'flex', justifyContent:'space-between', gap:8}}>
            <b>{a.title || a.id}</b>
            <span style={{fontSize:11, padding:'2px 8px', borderRadius:999, background:'#F1F5F3'}}>{a.status}</span>
          </div>
          <div style={{fontSize:12, color:'#64748B', marginTop:4}}>
            {a.level} · {a.administrative_unit_id} · {a.created_at}
          </div>
        </div>
      ))}
      <style>{`.card{background:#fff; border:1px solid #E2E8E5; border-radius:16px; padding:16px}`}</style>
    </div>
  )
}
