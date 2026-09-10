import { useEffect, useState } from 'react'
import { API_BASE } from '../services/api'
const API = API_BASE

// where each agent's output is actually surfaced (honest mapping)
const POWERS: Record<string, { map?: string; pages: [string, string][] }> = {
  ForestGuard: { map: 'popup NDVI + vùng rừng trên Bản đồ', pages: [['/forest', 'Forest'], ['/map', 'Bản đồ']] },
  FireRisk: { map: 'CẤP cháy popup xã + trạm quan trắc', pages: [['/disaster', 'Disaster'], ['/map', 'Bản đồ']] },
  DisasterGuard: { pages: [['/disaster', 'Disaster (đa thiên tai)']] },
  CarbonGuard: { pages: [['/carbon', 'Carbon']] },
  EUDRGuard: { pages: [['/eudr', 'EUDR']] },
}
// admin token lives in sessionStorage (cleared when the tab closes), never localStorage.
const token = ()=> sessionStorage.getItem('ecogl_admin_token') || ''
const authHeaders = (): Record<string, string> => token() ? { Authorization: `Bearer ${token()}` } : {}

export default function ModelSwitcher(){
  const [models, setModels]= useState<any[]>([])
  const [mode, setMode]= useState<any>(null)
  const [user, setUser]= useState('')
  const [pass, setPass]= useState('')
  const [me, setMe]= useState<any>(null)
  const [msg, setMsg]= useState('')

  const load = async ()=>{
    try{
      const [m, md] = await Promise.all([
        fetch(`${API}/api/models/switch/list`).then(r=>r.json()),
        fetch(`${API}/api/mode`).then(r=>r.json()),
      ])
      setModels(m); setMode(md)
    }catch{ setModels([{agent:'ForestGuard',active:'v1.0',available:['v1.0']}]) }
  }
  useEffect(()=>{ load() },[])

  const login = async ()=>{
    setMsg('')
    const r = await fetch(`${API}/api/auth/login`, {
      method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body: new URLSearchParams({ username: user, password: pass }),
    })
    if(!r.ok){ setMsg('Đăng nhập thất bại'); return }
    const j = await r.json()
    sessionStorage.setItem('ecogl_admin_token', j.access_token)
    const m = await fetch(`${API}/api/auth/me`, { headers: authHeaders() }).then(x=>x.json()).catch(()=> null)
    setMe(m); setMsg(m?.role === 'admin' ? '' : 'Tài khoản này không phải admin — chỉ xem được')
  }
  const logout = ()=>{ sessionStorage.removeItem('ecogl_admin_token'); setMe(null) }

  const doSwitch = async (agent: string, version: string)=>{
    setMsg('')
    const r = await fetch(`${API}/api/models/switch`, {
      method:'POST', headers:{'Content-Type':'application/json', ...authHeaders()},
      body: JSON.stringify({ agent, version }),
    })
    const j = await r.json().catch(()=> ({}))
    if(!r.ok){ setMsg(`Đổi thất bại: ${j.detail || r.status}`); return }
    setMsg(`${agent} → ${version} (đã audit)`)
    load()
  }

  const setModeApi = async (m: string)=>{
    setMsg('')
    const r = await fetch(`${API}/api/mode`, {
      method:'POST', headers:{'Content-Type':'application/json', ...authHeaders()},
      body: JSON.stringify({ mode: m }),
    })
    const j = await r.json().catch(()=> ({}))
    if(!r.ok){ setMsg(`Đổi mode thất bại: ${j.detail || r.status}`); return }
    setMode(j)
  }

  const isAdmin = me?.role === 'admin'
  const live = mode?.mode === 'REAL'

  return (
    <div style={{background:'#fff', border:'1px solid #E2E8E5', borderRadius:16, padding:16}}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', gap:8, flexWrap:'wrap'}}>
        <h3 style={{margin:0}}>Trạng thái hệ thống</h3>
        <span style={{background: live ? '#DCFCE7' : '#FEF3C7', border:`1px solid ${live ? '#86EFAC' : '#FCD34D'}`, padding:'6px 12px', borderRadius:999, fontSize:12, fontWeight:700, color: live ? '#166534' : '#92400E'}}>
          ● {mode ? `${mode.mode} · ${mode.source}` : 'Đang tải...'}
        </span>
      </div>
      <div style={{fontSize:12, color:'#64748B', marginTop:6}}>
        Mode từ <b>{mode?.source}</b>{mode && !mode.persistent && ' — chỉ hiệu lực trên instance hiện tại, restart/serverless khác có thể khác. Muốn cố định: set biến môi trường DEMO_MODE.'}
      </div>

      {!me ? (
        <div style={{marginTop:10, display:'flex', gap:6, flexWrap:'wrap', alignItems:'center'}}>
          <input value={user} onChange={e=> setUser(e.target.value)} placeholder="admin username" aria-label="Tên đăng nhập" style={{border:'1px solid #E2E8E5', borderRadius:8, padding:'6px 10px', fontSize:13}} />
          <input value={pass} onChange={e=> setPass(e.target.value)} type="password" placeholder="password" aria-label="Mật khẩu" style={{border:'1px solid #E2E8E5', borderRadius:8, padding:'6px 10px', fontSize:13}} onKeyDown={e=> { if(e.key === 'Enter') login() }} />
          <button onClick={login} style={{background:'#0B1412', color:'#fff', border:0, borderRadius:999, padding:'6px 14px'}}>Đăng nhập admin</button>
        </div>
      ) : (
        <div style={{marginTop:10, fontSize:13}}>Đăng nhập: <b>{me.username}</b> ({me.role}) <button onClick={logout} style={{marginLeft:8, fontSize:12, background:'#fff', border:'1px solid #E2E8E5', borderRadius:999, padding:'2px 10px'}}>Đăng xuất</button></div>
      )}
      {msg && <div style={{marginTop:8, fontSize:12, background:'#FEF3C7', padding:'6px 10px', borderRadius:8}}>{msg}</div>}

      <div style={{marginTop:12, display:'grid', gap:8}}>
        {models.map(m=>(
          <div key={m.agent} style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 10px', border:'1px solid #E2E8E5', borderRadius:10, background:'#F8FAF9', gap:8, flexWrap:'wrap'}}>
            <span style={{fontSize:13, fontWeight:600}}>{m.agent}
              <span style={{display:'block', fontWeight:400, fontSize:11, color:'#64748B'}}>
                Chạy ở: {POWERS[m.agent]?.map ? `🗺 ${POWERS[m.agent].map} · ` : ''}{POWERS[m.agent]?.pages.map(([to, label], i)=> <a key={to} href={to} style={{color:'#0F766E'}}>{i > 0 ? ' · ' : ''}{label}</a>)}
              </span>
            </span>
            {isAdmin ? (
              <select value={m.active} onChange={e=> doSwitch(m.agent, e.target.value)} aria-label={`Phiên bản ${m.agent}`} style={{fontSize:12, padding:'4px 8px', borderRadius:999, border:'1px solid #E2E8E5'}}>
                {m.available.map((v: string)=> <option key={v} value={v}>{v}{v === m.active ? ' ✓' : ''}</option>)}
              </select>
            ) : (
              <span style={{fontSize:12, padding:'4px 8px', background:'#fff', border:'1px solid #E2E8E5', borderRadius:999}}>{m.active} ✓</span>
            )}
          </div>
        ))}
      </div>
      {isAdmin && (
        <div style={{marginTop:10, display:'flex', gap:6}}>
          <button onClick={()=> setModeApi('DEMO')} style={{fontSize:12, padding:'6px 12px', borderRadius:999, border:'1px solid #E2E8E5', background: mode?.mode === 'DEMO' ? '#0B1412' : '#fff', color: mode?.mode === 'DEMO' ? '#fff' : '#000'}}>DEMO</button>
          <button onClick={()=> setModeApi('REAL')} style={{fontSize:12, padding:'6px 12px', borderRadius:999, border:'1px solid #E2E8E5', background: mode?.mode === 'REAL' ? '#0F766E' : '#fff', color: mode?.mode === 'REAL' ? '#fff' : '#000'}}>REAL</button>
        </div>
      )}
      <div style={{fontSize:11, color:'#64748B', marginTop:8}}>Chỉ liệt kê phiên bản thật sự tồn tại trong code (hiện tại: v1.0). Đổi bản không tồn tại bị từ chối + audit log.</div>
    </div>
  )
}
