import MapView from '../components/MapView'
import { AIInsightCard } from '../components/Cards'
import WeatherCard from '../components/WeatherCard'
import { useState } from 'react'
import { Link } from 'react-router-dom'

export default function EcoMap(){
  const [preview, setPreview] = useState<any>(null)
  return (
    <div style={{display:'flex', flexDirection:'column', gap:16}}>
      <div style={{background:'#fff', border:'1px solid #E2E8E5', borderRadius:16, padding:12, display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <div>
          <div style={{fontWeight:800, fontSize:12, letterSpacing:0.6}}>GIALAI EcoChain</div>
          <div style={{fontSize:12, color:'#64748B'}}>Trí tuệ Môi trường · 28°C · Ít mây · Mưa 20% · 📍 Gia Lai</div>
        </div>
        <Link to="/events/1" style={{background:'#0F766E', color:'#fff', padding:'8px 12px', borderRadius:999, fontSize:13, textDecoration:'none'}}>Xem trí tuệ</Link>
      </div>

      <MapView onSelect={()=> setPreview({title:'Bất thường rừng', risk:'CAO', conf:87, evidence:['Sentinel-2 NDVI','Sentinel-1 SAR','FIRMS','Cộng đồng']})} />

      {preview && (
        <div style={{background:'#fff', border:'1px solid #E2E8E5', borderRadius:16, padding:16}}>
          <div style={{fontWeight:700}}>BẤT THƯỜNG RỪNG — Rủi ro {preview.risk} · Tin cậy {preview.conf}%</div>
          <div style={{fontSize:13, color:'#64748B', marginTop:6}}>Phát hiện: 2 giờ trước · Bằng chứng: {preview.evidence.join(' · ')}</div>
          <Link to="/events/1" style={{display:'inline-block', marginTop:10, background:'#0B1412', color:'#fff', padding:'8px 12px', borderRadius:999, fontSize:13, textDecoration:'none'}}>XEM TRÍ TUỆ →</Link>
        </div>
      )}

      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>
        <WeatherCard />
        <AIInsightCard />
      </div>

      <div style={{background:'#fff', border:'1px solid #E2E8E5', borderRadius:16, padding:16}}>
        <div style={{fontWeight:700, fontSize:12, letterSpacing:0.6}}>3 SỰ KIỆN RỦI RO CAO</div>
        <div style={{marginTop:10, display:'grid', gap:8}}>
          <Link to="/events/1" style={{display:'block', border:'1px solid #E2E8E5', borderRadius:12, padding:12, textDecoration:'none', color:'inherit'}}><b>🔥 Cháy — Thôn 1</b> · Nguy cơ cao · Tin cậy 87% · 2 xác nhận</Link>
          <Link to="/events/2" style={{display:'block', border:'1px solid #E2E8E5', borderRadius:12, padding:12, textDecoration:'none', color:'inherit'}}><b>🌊 Ngập — Xã Ia Grai</b> · Cảnh báo · 21 phút trước</Link>
          <Link to="/events/3" style={{display:'block', border:'1px solid #E2E8E5', borderRadius:12, padding:12, textDecoration:'none', color:'inherit'}}><b>🌳 Rừng — Khoảnh 4</b> · AI phát hiện</Link>
        </div>
      </div>
    </div>
  )
}
