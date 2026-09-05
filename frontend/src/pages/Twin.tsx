import { useState } from 'react'
export default function Twin(){
  const [ran, setRan] = useState(false)
  const [loading, setLoading] = useState(false)
  const [res, setRes] = useState<any>(null)
  const run = async()=>{
    setLoading(true)
    try{
      const API=(import.meta as any).env?.VITE_API_BASE||'http://localhost:8000'
      const r=await fetch(`${API}/api/simulate/what-if`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scenario:'Compound',params:{rainfall:'+20%',temp:'+2C',road_closure:'48h',crop:'-10%'}})}).then(x=>x.json())
      setRes({...r, status:'LIVE'})
    }catch{ setRes({risk_delta:-18, co2_delta:12, status:'DEMO DATA'}) }
    setRan(true); setLoading(false)
  }
  return (
    <div className="page">
      <h1>DIGITAL TWIN — Gia Lai Environmental System — CURRENT · FORECAST · SCENARIO</h1>
      <div className="whatif"><h3>WHAT-IF SCENARIO</h3><div>Rainfall +20% · Temp +2°C · Road Closure 48h · Crop -10% <button className="run" onClick={run} disabled={loading}>{loading?'Đang chạy...':'RUN SIMULATION'}</button></div></div>
      {!ran ? <div className="result" style={{color:'#64748B'}}>Chưa chạy mô phỏng — bấm RUN để tính từ Weather + NDVI hiện tại.</div>
      : <div className="result">Result: {res?.result ? Object.entries(res.result).slice(0,4).map(([k,v])=>`${k}: ${typeof v==='object'?JSON.stringify(v):v}`).join(' · ') : `Risk ${res?.risk_delta ?? -22}% · CO₂ +${res?.co2_delta ?? 14}%`} · {res?.status||'DEMO DATA'} · {new Date().toLocaleTimeString('vi-VN')} — {res?.note||'Baseline vs A · 2024→2030'}</div>}
      <style>{`.whatif{background:#fff; border:1px solid #E2E8E5; border-radius:16px; padding:16px} .run{background:#0F766E; color:#fff; border:0; padding:8px 12px; border-radius:999px; margin-left:12px} .result{background:#fff; border:1px solid #E2E8E5; border-radius:16px; padding:16px; margin-top:12px}`}</style>
    </div>
  )
}
