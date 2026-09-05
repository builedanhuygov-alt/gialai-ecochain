import { useEffect, useState } from 'react'

const API = (import.meta as any).env?.VITE_API_BASE || 'http://localhost:8000'

export default function EUDR(){
  const [check, setCheck] = useState<any>(null)
  useEffect(()=>{
    fetch(`${API}/api/eudr/check?lot_id=GL-2026-00001`).then(r=>r.json()).then(j=>setCheck(j)).catch(()=>{})
  },[])
  return (
    <div className="page">
      <h1>EUDR Traceability — Due Diligence Support (Not certification)</h1>
      <div className="card">Flow: Farm → Collection Point → Processing → Factory → Exporter · Geolocation 100% · Forest Evidence 87% · Readiness 91/100 <span style={{fontSize:10, padding:'2px 6px', borderRadius:999, background:'#FEF3C7'}}>DEMO DATA — mở rộng, không phải lõi cháy rừng</span>{check && <div style={{fontSize:11, color:'#065F46', marginTop:6}}>EUDRGuard live: {JSON.stringify(check).slice(0,150)}... <span style={{fontSize:10, padding:'2px 6px', borderRadius:999, background:'#DCFCE7'}}>LIVE</span></div>}</div>
      <div className="card">QR Passport: ☕ GL-2026-00001 — Gia Lai · Verified Geolocation · Forest LOW · Scan for public view</div>
      <style>{`.card{background:#fff; border:1px solid #E2E8E5; border-radius:12px; padding:16px; margin-top:12px}`}</style>
    </div>
  )
}
