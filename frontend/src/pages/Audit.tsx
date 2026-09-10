import { useEffect, useState } from 'react'
import { api } from '../services/api'

export default function Audit(){
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(()=>{
    api.auditLog().then((d: any)=> setRows(Array.isArray(d) ? d : [])).finally(()=> setLoading(false))
  },[])
  return (
    <div style={{display:'flex', flexDirection:'column', gap:12}}>
      <h1>Nhật ký hệ thống</h1>
      {loading && <div className="card">Đang tải...</div>}
      {!loading && rows.length === 0 && <div className="card">Chưa có bản ghi nào.</div>}
      {rows.map((l: any, i: number)=> (
        <div key={i} className="card" style={{fontFamily:'monospace', fontSize:12}}>
          <b>{l.created_at}</b> · {l.action} · {l.resource_type}{l.resource_id ? `/${String(l.resource_id).slice(0,8)}` : ''}{l.detail ? ` — ${String(l.detail).slice(0,120)}` : ''}
        </div>
      ))}
      <style>{`.card{background:#fff; border:1px solid #E2E8E5; border-radius:12px; padding:12px}`}</style>
    </div>
  )
}
