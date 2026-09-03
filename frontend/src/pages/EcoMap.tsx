import MapView from '../components/MapView'
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
const API = (import.meta as any).env?.VITE_API_BASE || 'http://localhost:8000'
export default function EcoMap(){
  const [fire, setFire]= useState<any>(null)
  const [selected, setSelected]= useState<any>(null)
  useEffect(()=>{
    fetch(`${API}/api/fire/risk?administrative_unit_id=GiaLai&lat=13.9&lon=108.3`).then(r=>r.json()).then(j=> setFire(j)).catch(()=>{})
  },[])
  return (
    <div style={{margin:-24, height:'calc(100vh - 64px)', position:'relative'}}>
      <MapView onSelect={(type,id)=> setSelected({type,id})} />
      {/* Hero fire risk overlay Sec37 */}
      {fire && (
        <div style={{position:'absolute', top:80, left:'50%', transform:'translateX(-50%)', background:'rgba(255,255,255,0.96)', backdropFilter:'blur(12px)', borderRadius:16, padding:'12px 16px', boxShadow:'0 8px 24px rgba(0,0,0,0.12)', border:'1px solid #FDBA74', display:'flex', gap:12, alignItems:'center', zIndex:5}}>
          <span style={{background:'#DC2626', color:'#fff', padding:'4px 8px', borderRadius:999, fontSize:12, fontWeight:800}}>🔥 CẤP {fire.warning_level || 'IV'}</span>
          <span style={{fontSize:13, fontWeight:600}}>Rừng Gia Lai · Rủi ro {fire.risk_score}/100 · Tin cậy {fire.confidence}%</span>
          <Link to="/events/1" style={{background:'#0F766E', color:'#fff', padding:'6px 10px', borderRadius:999, fontSize:12, textDecoration:'none'}}>Xem trí tuệ →</Link>
        </div>
      )}
      {selected && (
        <div style={{position:'absolute', bottom:20, left:20, background:'rgba(255,255,255,0.96)', backdropFilter:'blur(12px)', borderRadius:16, padding:16, minWidth:300, boxShadow:'0 8px 24px rgba(0,0,0,0.12)'}}>
          <div style={{fontWeight:700, fontSize:13}}>FOREST FIRE INTELLIGENCE</div>
          <div style={{fontSize:13, marginTop:6}}>AI Risk: {fire?.risk_score ?? 82}/100 · Official: {fire?.official?.level ?? 'III'} · AI: {fire?.warning_level ?? 'IV'}</div>
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
