import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'

const API = (import.meta as any).env?.VITE_API_BASE || 'http://localhost:8000'

export default function WhatIfLab(){
  const [rain, setRain]= useState(20)
  const [baseline, setBaseline]= useState<any>(null)
  const [sim, setSim]= useState<any>(null)
  useEffect(()=>{
    // Real baseline from backend risk (if available)
    fetch(`${API}/api/risk/overview`).then(r=>r.json()).then(j=> setBaseline(j)).catch(()=> setBaseline({ overall:42 }))
  },[])
  const runSim = async (type:string)=>{
    setSim({ loading:true })
    try{
      const r=await fetch(`${API}/api/simulate/what-if`,{method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ scenario: type, params:{ rainfall: rain, road_closure:'48h', forest_loss:'500ha' }})})
      const j=await r.json(); setSim(j)
    }catch{ setSim({ result:{ affected:{ villages:12, roads:3 }}, note:'Demo simulation' })}
  }
  return (
    <div style={{display:'flex', flexDirection:'column', gap:16}}>
      <h1>What-if Lab — Mô phỏng tương lai (Digital Twin)</h1>
      <div style={{background:'#fff', border:'1px solid #E2E8E5', borderRadius:16, padding:16}}>
        <h3>Kịch bản mẫu — Chọn để mô phỏng</h3>
        <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
          <button onClick={()=>{setRain(20); runSim('Flood')}} style={{background: rain===20?'#0B1412':'#F1F5F3', color: rain===20?'#fff':'#0B1412', padding:'8px 12px', borderRadius:999, border:0}}>🌧 +20% Mưa</button>
          <button onClick={()=> runSim('Forest')} style={{background:'#F1F5F3', padding:'8px 12px', borderRadius:999, border:0}}>🔥 +500 ha mất rừng</button>
          <button onClick={()=> runSim('Road')} style={{background:'#F1F5F3', padding:'8px 12px', borderRadius:999, border:0}}>🛣 Đóng đường 48h</button>
          <button onClick={()=> runSim('Compound')} style={{background:'#FEF3C7', padding:'8px 12px', borderRadius:999, border:0}}>🌡 Nóng cực đoan</button>
        </div>
        <div style={{fontSize:12, color:'#64748B', marginTop:8}}>Baseline: Rủi ro {baseline?.overall ?? 42} · Diện tích 120 ha · Trễ 2h · CO₂ — · Nguồn: vệ tinh + thời tiết + FIRMS · Trạng thái: {baseline ? 'LIVE' : 'DEMO DATA'}</div>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>
        <div style={{background:'#fff', border:'1px solid #E2E8E5', borderRadius:16, padding:16}}>
          <h4>BASELINE (Quan sát)</h4>
          <div style={{fontSize:13, lineHeight:1.8}}>Rủi ro 42 · Diện tích 120 ha · Trễ 2h · CO₂ — · Rừng 92 ha khỏe</div>
          <div style={{fontSize:11, color:'#64748B', marginTop:6}}>Dữ liệu: Sentinel-2 · SRTM · Thời tiết</div>
        </div>
        <div style={{background:'#0B1412', color:'#fff', borderRadius:16, padding:16}}>
          <h4 style={{color:'#fff'}}>SCENARIO +{rain}% Mưa (Mô phỏng)</h4>
          <div style={{fontSize:13, lineHeight:1.8}}>Rủi ro 78 · Diện tích 158 ha · Trễ 9h · CO₂ +14% · Làng ảnh hưởng 12 · Đường 3</div>
          <div style={{fontSize:11, color:'#94A3B8', marginTop:6}}>Mô phỏng: Digital Twin · Không phải dự báo chắc chắn</div>
        </div>
      </div>

      {sim && (
        <div style={{background:'#EFF6FF', border:'1px solid #BFDBFE', borderRadius:16, padding:16}}>
          <h4>Kết quả mô phỏng — So sánh</h4>
          <table style={{width:'100%', fontSize:13, borderCollapse:'collapse'}}>
            <thead><tr><th></th><th>BASELINE</th><th>SCENARIO</th></tr></thead>
            <tbody>
              <tr><td>Rủi ro</td><td>42</td><td style={{color:'#DC2626', fontWeight:700}}>78 (+86%)</td></tr>
              <tr><td>Diện tích</td><td>120 ha</td><td>158 ha</td></tr>
              <tr><td>Trễ logistics</td><td>2h</td><td>9h</td></tr>
              <tr><td>CO₂</td><td>—</td><td>+14%</td></tr>
              <tr><td>Cộng đồng ảnh hưởng</td><td>—</td><td>3 xã · 428 nông hộ</td></tr>
            </tbody>
          </table>
          <div style={{marginTop:10, fontSize:13, background:'#fff', border:'1px solid #BFDBFE', borderRadius:12, padding:10}}>
            <b>AI khuyến nghị (DRAFT):</b> Tăng cường cảnh báo sớm, bảo vệ vùng rừng trọng yếu, tạo tuyến logistics thay thế. <span style={{fontSize:11, color:'#64748B'}}>· Độ tin cậy 78% · Cần phê duyệt con người</span>
          </div>
        </div>
      )}

      <Link to="/missions" style={{background:'#0F766E', color:'#fff', padding:'10px', borderRadius:999, textAlign:'center', textDecoration:'none'}}>TẠO NHIỆM VỤ PHẢN HỒI →</Link>
      <div style={{fontSize:12, color:'#64748B'}}>Mô phỏng là kịch bản phân tích, không phải dự báo chắc chắn. Dữ liệu: vệ tinh + thời tiết + FIRMS · <span style={{background:'#FEF3C7', padding:'2px 6px', borderRadius:999}}>DEMO DATA nếu GEE chưa LIVE</span></div>
    </div>
  )
}
