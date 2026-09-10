import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../services/api'

type Approval = { id: string; plan_id?: string; action?: string; status?: string }

export default function Governance(){
  const [stats, setStats] = useState<any>(null)
  const [items, setItems] = useState<Approval[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')

  const refresh = async ()=>{
    setLoading(true)
    try{
      const [g, a] = await Promise.all([api.governance(), api.approvals()])
      setStats(g)
      setItems(Array.isArray(a) ? a : [])
      setError('')
    }catch(e:any){ setError(String(e.message || e).slice(0, 200)) }
    finally{ setLoading(false) }
  }
  useEffect(()=>{ refresh() },[])

  const decide = async (id: string, ok: boolean)=>{
    setMsg('')
    try{
      if(ok) await api.approveApproval(id)
      else await api.rejectApproval(id)
      setMsg(ok ? 'Đã duyệt — kế hoạch chuyển sang thực thi.' : 'Đã từ chối.')
      refresh()
    }catch(e:any){
      const m = String(e.message || e)
      setMsg(m.includes('401') ? 'Cần đăng nhập.' : m.includes('403') ? 'Cần quyền admin — hãy đăng nhập tài khoản admin.' : m.slice(0, 200))
    }
  }

  const pending = items.filter(a=> a.status === 'PENDING')
  const done = items.filter(a=> a.status !== 'PENDING')

  return (
    <div style={{display:'flex', flexDirection:'column', gap:12}}>
      <h1>Quản trị & Phê duyệt</h1>
      {loading && <div className="card">Đang tải…</div>}
      {error && <div className="card">⚠ {error}</div>}
      {stats && (
        <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
          <div className="card" style={{flex:1, minWidth:140}}><b>{stats.ai_decisions ?? 0}</b><div style={{fontSize:11, color:'#64748B'}}>Quyết định AI</div></div>
          <div className="card" style={{flex:1, minWidth:140}}><b>{stats.human_decisions ?? 0}</b><div style={{fontSize:11, color:'#64748B'}}>Quyết định con người</div></div>
          <div className="card" style={{flex:1, minWidth:140}}><b>{stats.pending_approvals ?? pending.length}</b><div style={{fontSize:11, color:'#64748B'}}>Chờ duyệt</div></div>
        </div>
      )}
      {msg && <div className="card">{msg} <Link to="/login">Đăng nhập</Link> · <Link to="/audit">Xem nhật ký</Link></div>}
      <h3 style={{margin:'4px 0 0'}}>Chờ duyệt ({pending.length})</h3>
      {pending.length === 0 && !loading && <div className="card">Không có yêu cầu nào chờ duyệt.</div>}
      {pending.map(a=> (
        <div key={a.id} className="card" style={{borderLeft:'4px solid #F59E0B'}}>
          <div style={{display:'flex', justifyContent:'space-between', gap:8, flexWrap:'wrap'}}>
            <div><b>{a.action || 'Hành động'}</b><div style={{fontSize:11, color:'#64748B'}}>kế hoạch {String(a.plan_id || '').slice(0,8)} · {String(a.id).slice(0,8)}</div></div>
            <div style={{display:'flex', gap:6}}>
              <button onClick={()=> decide(a.id, true)} style={{background:'#0F766E', color:'#fff', border:0, borderRadius:999, padding:'6px 14px', fontWeight:700}}>Duyệt</button>
              <button onClick={()=> decide(a.id, false)} style={{background:'#fff', border:'1px solid #E2E8E5', borderRadius:999, padding:'6px 14px'}}>Từ chối</button>
            </div>
          </div>
        </div>
      ))}
      {done.length > 0 && (
        <>
          <h3 style={{margin:'8px 0 0'}}>Đã xử lý ({done.length})</h3>
          {done.slice(0,10).map(a=> (
            <div key={a.id} className="card" style={{opacity:0.85}}>
              <b>{a.action || 'Hành động'}</b> — {a.status}
              <span style={{fontSize:11, color:'#64748B'}}> · kế hoạch {String(a.plan_id || '').slice(0,8)}</span>
            </div>
          ))}
        </>
      )}
      <style>{`.card{background:#fff; border:1px solid #E2E8E5; border-radius:12px; padding:12px}`}</style>
    </div>
  )
}
