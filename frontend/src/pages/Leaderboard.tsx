import { useEffect, useState } from 'react'
import { API_BASE } from '../services/api'

const TYPES = ['SAFETY', 'RESPONSE', 'FOREST', 'COMMUNITY', 'PREPAREDNESS'] as const
const TYPE_VI: Record<string, string> = {
  SAFETY: 'An toàn', RESPONSE: 'Ứng phó', FOREST: 'Rừng',
  COMMUNITY: 'Cộng đồng', PREPAREDNESS: 'Sẵn sàng',
}

type Row = { rank: number; administrative_unit_id: string; score: number; period?: string; name?: string }

export default function Leaderboard(){
  const [tab, setTab] = useState<string>('SAFETY')
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [live, setLive] = useState<boolean | null>(null)

  useEffect(()=>{
    setLoading(true)
    Promise.all([
      fetch(`${API_BASE}/api/rankings/${tab}`).then(r=> r.ok ? r.json() : []).catch(()=> []),
      fetch(`${API_BASE}/api/forest/areas`).then(r=> r.ok ? r.json() : []).catch(()=> []),
    ]).then(([rk, areas]: any[])=>{
      const names: Record<string, string> = {}
      ;(Array.isArray(areas) ? areas : []).forEach((a: any)=>{ names[a.id] = a.name })
      const list: Row[] = Array.isArray(rk) ? rk.slice(0, 10) : []
      setRows(list.map(r=> ({ ...r, name: names[r.administrative_unit_id] || r.administrative_unit_id?.slice(0, 8) || '—' })))
      setLive(list.length > 0)
      setLoading(false)
    }).catch(()=> { setRows([]); setLive(false); setLoading(false) })
  },[tab])

  return (
    <div className="page">
      <h1>Bảng xếp hạng xã <span style={{fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:999, background: live ? '#DCFCE7' : '#FEF3C7'}}>{live ? 'DỮ LIỆU THẬT' : 'CHƯA CÓ DỮ LIỆU'}</span></h1>
      <div className="tabs">
        {TYPES.map(t=> (
          <button key={t} onClick={()=> setTab(t)} style={{background: tab===t ? '#0F766E' : '#F1F5F3', color: tab===t ? '#fff' : '#000', padding:'6px 10px', borderRadius:999, border:0, cursor:'pointer'}}>{TYPE_VI[t]}</button>
        ))}
      </div>
      {loading && <div style={{marginTop:12, fontSize:13, color:'#64748B'}}>Đang tải xếp hạng…</div>}
      {!loading && rows.length === 0 && <div style={{marginTop:12, fontSize:13, color:'#B45309'}}>Chưa có dữ liệu xếp hạng — chạy phân tích rủi ro để tạo bản ghi.</div>}
      {!loading && rows.length > 0 && (
      <table className="board"><thead><tr><th>#</th><th>Xã</th><th>Điểm</th><th>Kỳ</th></tr></thead>
      <tbody>{rows.map(r=> <tr key={r.rank + r.administrative_unit_id}><td>{r.rank}</td><td>{r.name}</td><td>{r.score}</td><td>{r.period || ''}</td></tr>)}</tbody></table>
      )}
      <div style={{marginTop:8, fontSize:11, color:'#64748B'}}>Tiêu chí công bằng: hiệu quả ứng phó, không phải số vụ việc. Nguồn: engine xếp hạng + ranh giới xã thật.</div>
      <style>{`.tabs{display:flex; gap:8px; font-size:13px; flex-wrap:wrap} table{background:#fff; border:1px solid #E2E8E5; border-radius:12px; width:100%; border-collapse:collapse; margin-top:12px} th,td{padding:10px; text-align:left; border-bottom:1px solid #E2E8E5; font-size:13px}`}</style>
    </div>
  )
}
