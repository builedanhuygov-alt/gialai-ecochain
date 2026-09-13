import MapView from '../components/MapView'
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { API_BASE } from '../services/api'
const API = API_BASE
export default function EcoMap(){
  const [fire, setFire]= useState<any>(null)
  const [selected, setSelected]= useState<any>(null)
  useEffect(()=>{
    fetch(`${API}/api/fire/risk?administrative_unit_id=GiaLai&lat=13.9&lon=108.3`).then(r=>r.json()).then(j=> setFire(j)).catch(()=>{})
  },[])
  return (
    <div style={{margin:-24, height:'calc(100vh - 64px)', position:'relative'}}>
      <MapView onSelect={(type,id)=> setSelected({type,id})} />
      {/* P1: gỡ banner Rủi ro/Tin cậy nổi — thông tin đã có ở Forecast Card,
          Alert Strip, Command Summary (không trùng, không thay popup mới). */}
      {selected && (
        <div style={{position:'absolute', bottom:20, left:20, background:'rgba(255,255,255,0.96)', backdropFilter:'blur(12px)', borderRadius:16, padding:16, minWidth:300, boxShadow:'0 8px 24px rgba(0,0,0,0.12)'}}>
          <div style={{fontWeight:700, fontSize:13}}>FOREST FIRE INTELLIGENCE</div>
          <div style={{fontSize:13, marginTop:6}}>CẤP {fire?.warning_level ?? 'MISSING'} · Chính thức: {fire?.official?.level ?? 'MISSING'} · Driver: {fire?.forecast_rating?.major_risk_driver ?? 'MISSING'}</div>
          <div style={{fontSize:12, color:'#64748B', marginTop:6}}>Vì sao: Nhiệt độ ↑ · Ẩm ↓ · NDMI ↓ · FIRMS hotspot ✓</div>
          <div style={{display:'flex', gap:6, marginTop:10}}>
            <Link to="/events/1" style={{background:'#0B1412', color:'#fff', padding:'6px 10px', borderRadius:999, fontSize:12, textDecoration:'none'}}>Điều tra</Link>
            <Link to="/what-if" style={{background:'#fff', border:'1px solid #E2E8E5', padding:'6px 10px', borderRadius:999, fontSize:12, textDecoration:'none', color:'inherit'}}>Mô phỏng</Link>
            <Link to="/missions" style={{background:'#0F766E', color:'#fff', padding:'6px 10px', borderRadius:999, fontSize:12, textDecoration:'none'}}>Tạo nhiệm vụ</Link>
          </div>
        </div>
      )}
    </div>
  )
}
