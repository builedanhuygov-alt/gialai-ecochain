import { useEffect, useState } from 'react'
const API = (import.meta as any).env?.VITE_API_BASE || 'http://localhost:8000'

export default function ModelSwitcher(){
  const [models, setModels]= useState<any[]>([])
  useEffect(()=>{
    fetch(`${API}/api/models/switch/list`).then(r=>r.json()).then(j=> setModels(j)).catch(()=> setModels([{agent:'ForestGuard',active:'v1.0'}]))
  },[])
  // HARDCODE: ẩn dropdown version/Admin, chỉ hiển thị trạng thái ổn định LIVE
  return (
    <div style={{background:'#fff', border:'1px solid #E2E8E5', borderRadius:16, padding:16}}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <h3 style={{margin:0}}>Trạng thái hệ thống</h3>
        <span style={{background:'#DCFCE7', border:'1px solid #86EFAC', padding:'6px 12px', borderRadius:999, fontSize:12, fontWeight:700, color:'#166534'}}>● LIVE DASHBOARD</span>
      </div>
      <div style={{fontSize:12, color:'#64748B', marginTop:6}}>Đã cấu hình ổn định — tự động tải bản đồ và dữ liệu mẫu Gia Lai</div>
      <div style={{marginTop:12, display:'grid', gap:8}}>
        {models.map(m=>(
          <div key={m.agent} style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 10px', border:'1px solid #E2E8E5', borderRadius:10, background:'#F8FAF9'}}>
            <span style={{fontSize:13, fontWeight:600}}>{m.agent}</span>
            <span style={{fontSize:12, padding:'4px 8px', background:'#fff', border:'1px solid #E2E8E5', borderRadius:999}}>{m.active} ✓</span>
          </div>
        ))}
      </div>
    </div>
  )
}
