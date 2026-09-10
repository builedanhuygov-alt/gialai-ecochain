import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { API_BASE } from '../services/api'

export function currentUser(): { username: string; role: string } | null {
  try{
    const raw = sessionStorage.getItem('ecogl_user')
    return raw ? JSON.parse(raw) : null
  }catch{ return null }
}

export function logout(){
  try{
    sessionStorage.removeItem('ecogl_admin_token')
    sessionStorage.removeItem('ecogl_user')
  }catch{}
  window.dispatchEvent(new CustomEvent('ecochain-auth'))
}

export default function Login(){
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'login'|'register'>('login')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const nav = useNavigate()

  const submit = async ()=>{
    if(!username.trim() || !password){ setError('Nhập tên đăng nhập và mật khẩu.'); return }
    setBusy(true); setError('')
    try{
      if(mode === 'register'){
        const r = await fetch(`${API_BASE}/api/auth/register`, {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ username: username.trim(), password }),
        })
        if(!r.ok) throw new Error(await r.text())
      }
      const fd = new URLSearchParams({ username: username.trim(), password })
      const r = await fetch(`${API_BASE}/api/auth/login`, {
        method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body: fd,
      })
      if(!r.ok) throw new Error(r.status === 401 ? 'Sai tên đăng nhập hoặc mật khẩu.' : await r.text())
      const j = await r.json()
      let role = j.role || 'viewer'
      try{
        const me = await fetch(`${API_BASE}/api/auth/me`, { headers:{ Authorization:`Bearer ${j.access_token}` } })
        if(me.ok){ const mj = await me.json(); role = mj.role || role }
      }catch{}
      try{
        sessionStorage.setItem('ecogl_admin_token', j.access_token)
        sessionStorage.setItem('ecogl_user', JSON.stringify({ username: username.trim(), role }))
      }catch{}
      window.dispatchEvent(new CustomEvent('ecochain-auth'))
      nav('/admin')
    }catch(e:any){
      setError(String(e.message || e).slice(0, 300))
    }finally{ setBusy(false) }
  }

  return (
    <div style={{maxWidth:400, margin:'48px auto', background:'#fff', border:'1px solid #E2E8E5', borderRadius:16, padding:24}}>
      <h1 style={{fontSize:18, fontWeight:800, marginBottom:4}}>Đăng nhập</h1>
      <p style={{fontSize:12, color:'#64748B', marginTop:0}}>Tài khoản đầu tiên là <b>admin</b> — các tài khoản sau là viewer. Duyệt/phê duyệt chính thức cần quyền admin.</p>
      <div style={{display:'flex', gap:8, margin:'12px 0'}}>
        {(['login','register'] as const).map(m=>(
          <button key={m} onClick={()=> setMode(m)} style={{flex:1, padding:'8px', borderRadius:999, border:'1px solid #0F766E', background: mode===m ? '#0F766E' : '#fff', color: mode===m ? '#fff' : '#0F766E', fontSize:13, fontWeight:700}}>{m === 'login' ? 'Đăng nhập' : 'Đăng ký'}</button>
        ))}
      </div>
      <input value={username} onChange={e=> setUsername(e.target.value)} placeholder="Tên đăng nhập" autoComplete="username"
        style={{width:'100%', padding:'10px 12px', borderRadius:10, border:'1px solid #E2E8E5', fontSize:14, marginBottom:8, boxSizing:'border-box'}} />
      <input value={password} onChange={e=> setPassword(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter') submit() }}
        type="password" placeholder="Mật khẩu" autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
        style={{width:'100%', padding:'10px 12px', borderRadius:10, border:'1px solid #E2E8E5', fontSize:14, marginBottom:12, boxSizing:'border-box'}} />
      {error && <div style={{fontSize:12, color:'#B91C1C', background:'#FEE2E2', borderRadius:8, padding:'8px 10px', marginBottom:12, wordBreak:'break-word'}}>{error}</div>}
      <button onClick={submit} disabled={busy} style={{width:'100%', padding:'10px', borderRadius:999, border:0, background:'#0F766E', color:'#fff', fontSize:14, fontWeight:800}}>
        {busy ? 'Đang xử lý…' : mode === 'login' ? 'Đăng nhập' : 'Đăng ký & đăng nhập'}
      </button>
      <div style={{marginTop:12, fontSize:12}}><Link to="/">← Về bản đồ</Link></div>
    </div>
  )
}
