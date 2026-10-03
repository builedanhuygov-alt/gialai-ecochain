import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../services/api'

type Mission = {
  id: string; area?: string; risk_at_creation?: number | null;
  priority?: string; status?: string; due_at?: string | null;
  assignee?: string | null;
}

// Minimal field-mission list. The full closed-loop workflow (create from a
// risk cell, checklist, photo result, false-alarm stats) lands in step E.
export default function Missions(){
  const [missions, setMissions] = useState<Mission[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(()=>{
    api.missions().then((d: any)=>{
      setMissions(Array.isArray(d) ? d : (d?.missions || []))
    }).catch(()=> setMissions([])).finally(()=> setLoading(false))
  },[])

  return (
    <div className="page" style={{maxWidth: 860, margin: '0 auto', padding: 16}}>
      <h1>Nhiệm vụ thực địa</h1>
      <p style={{fontSize: 13, color: '#64748B'}}>
        Nhiệm vụ kiểm tra do kiểm lâm/admin tạo từ ô nguy cơ trên bản đồ.
        Chỉ số tham khảo, trọng số chưa hiệu chuẩn.
      </p>
      {loading && <p>Đang tải…</p>}
      {!loading && missions.length === 0 && (
        <div style={{background: '#fff', border: '1px solid #E2E8E5', borderRadius: 12, padding: 24, textAlign: 'center'}}>
          <div style={{fontSize: 14, fontWeight: 700}}>Chưa có nhiệm vụ</div>
          <div style={{fontSize: 13, color: '#64748B', marginTop: 6}}>
            Khi có ô nguy cơ cao, kiểm lâm tạo nhiệm vụ kiểm tra tại đây.
          </div>
          <Link to="/" style={{display: 'inline-block', marginTop: 12, background: '#0F766E', color: '#fff', padding: '8px 20px', borderRadius: 999, fontSize: 13, fontWeight: 700, textDecoration: 'none'}}>Về bản đồ</Link>
        </div>
      )}
      {!loading && missions.map(m=> (
        <div key={m.id} style={{background: '#fff', border: '1px solid #E2E8E5', borderRadius: 12, padding: 12, marginTop: 8}}>
          <div style={{fontWeight: 700}}>{m.area || m.id}</div>
          <div style={{fontSize: 12, color: '#64748B'}}>
            {[m.status, m.priority, m.assignee].filter(Boolean).join(' · ')}
            {typeof m.risk_at_creation === 'number' ? ` · risk lúc tạo: ${m.risk_at_creation}` : ''}
          </div>
        </div>
      ))}
    </div>
  )
}
