import { useState } from 'react'
import { Link } from 'react-router-dom'

export default function WhatIfLab(){
  const [rain, setRain]= useState(20)
  return (
    <div style={{display:'flex', flexDirection:'column', gap:16}}>
      <h1>What-if Lab — Wow factor</h1>
      <div style={{background:'#fff', border:'1px solid #E2E8E5', borderRadius:16, padding:16}}>
        <h3>Kịch bản mẫu (3–5)</h3>
        <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
          <button onClick={()=>setRain(20)} style={{background: rain===20?'#0B1412':'#F1F5F3', color: rain===20?'#fff':'#0B1412', padding:'8px 12px', borderRadius:999, border:0}}>🌧 +20% Mưa</button>
          <button style={{background:'#F1F5F3', padding:'8px 12px', borderRadius:999, border:0}}>🔥 +500 ha mất rừng</button>
          <button style={{background:'#F1F5F3', padding:'8px 12px', borderRadius:999, border:0}}>🛣 Đóng đường 48h</button>
        </div>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>
        <div style={{background:'#fff', border:'1px solid #E2E8E5', borderRadius:16, padding:16}}>
          <h4>BASELINE</h4>
          <div>Rủi ro 42 · Diện tích 120 ha · Trễ 2h · CO₂ —</div>
        </div>
        <div style={{background:'#0B1412', color:'#fff', borderRadius:16, padding:16}}>
          <h4 style={{color:'#fff'}}>SCENARIO +{rain}% Mưa</h4>
          <div>Rủi ro 78 · Diện tích 158 ha · Trễ 9h · CO₂ +14%</div>
        </div>
      </div>

      <Link to="/missions" style={{background:'#0F766E', color:'#fff', padding:'10px', borderRadius:999, textAlign:'center', textDecoration:'none'}}>TẠO NHIỆM VỤ PHẢN HỒI →</Link>
      <div style={{fontSize:12, color:'#64748B'}}>Mô phỏng là kịch bản phân tích, không phải dự báo chắc chắn. Dữ liệu: vệ tinh + thời tiết + FIRMS.</div>
    </div>
  )
}
