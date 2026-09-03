import { useEffect, useState } from 'react'
const API = (import.meta as any).env?.VITE_API_BASE || 'http://localhost:8000'

export default function ModelSwitcher(){
  const [models, setModels]= useState<any[]>([])
  const [mode, setMode]= useState('DEMO')
  useEffect(()=>{
    fetch(`${API}/api/models/switch/list`).then(r=>r.json()).then(j=> setModels(j)).catch(()=> setModels([{agent:'ForestGuard',active:'v1.0'}]))
    fetch(`${API}/api/mode`).then(r=>r.json()).then(j=> setMode(j.mode)).catch(()=>{})
  },[])
  const switchModel = async (agent:string, v:string)=>{
    await fetch(`${API}/api/models/switch`,{method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({agent, version:v})})
    setModels(m=> m.map(x=> x.agent===agent ? {...x, active:v}:x))
  }
  const toggleMode = async ()=>{
    const newMode = mode==='DEMO'?'REAL':'DEMO'
    await fetch(`${API}/api/mode`,{method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({mode:newMode})}).catch(()=>{})
    setMode(newMode); location.reload()
  }
  return (
    <div style={{background:'#fff', border:'1px solid #E2E8E5', borderRadius:16, padding:16}}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <h3 style={{margin:0}}>Chế độ mô hình</h3>
        <button onClick={toggleMode} style={{background: mode==='DEMO'?'#FEF3C7':'#DCFCE7', border:'1px solid #E2E8E5', padding:'6px 12px', borderRadius:999, fontSize:12, fontWeight:700}}>{mode} → {mode==='DEMO'?'REAL':'DEMO'}</button>
      </div>
      <div style={{fontSize:12, color:'#64748B', marginTop:6}}>DEMO: dùng mock + DEMO DATA badge · REAL: chỉ LIVE khi provider thành công, không giả</div>
      <div style={{marginTop:12, display:'grid', gap:8}}>
        {models.map(m=>(
          <div key={m.agent} style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 10px', border:'1px solid #E2E8E5', borderRadius:10}}>
            <span style={{fontSize:13, fontWeight:600}}>{m.agent}</span>
            <select value={m.active} onChange={e=> switchModel(m.agent, e.target.value)} style={{padding:'6px', borderRadius:8, border:'1px solid #E2E8E5', fontSize:12}}>
              {m.available.map((v:string)=><option key={v} value={v}>{v}</option>)}
            </select>
          </div>
        ))}
      </div>
    </div>
  )
}
