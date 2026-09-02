import { Link, useParams } from 'react-router-dom'
import { VerificationBadge } from '../components/Cards'

export default function EventIntelligence(){
  const { id } = useParams()
  return (
    <div style={{display:'flex', flexDirection:'column', gap:16}}>
      <div style={{background:'#fff', border:'1px solid #E2E8E5', borderRadius:16, padding:16}}>
        <div style={{fontSize:11, letterSpacing:0.6, color:'#DC2626', fontWeight:700}}>RỦI RO CAO · 87% TIN CẬY</div>
        <h1 style={{margin:'6px 0'}}>Phát hiện thay đổi rừng</h1>
        <div style={{fontSize:13, color:'#64748B'}}>Sự kiện #{id || '1'} · Thôn 1 · 2 giờ trước · <VerificationBadge status="PENDING" /></div>
      </div>

      <div style={{background:'#fff', border:'1px solid #E2E8E5', borderRadius:16, padding:16}}>
        <h3>TẠI SAO AI PHÁT HIỆN?</h3>
        <ul style={{fontSize:13, lineHeight:1.8}}>
          <li>✓ Bất thường NDVI Sentinel-2 <span style={{color:'#64748B'}}>· 14:32 · LIVE</span></li>
          <li>✓ Thay đổi SAR Sentinel-1 <span style={{color:'#64748B'}}>· 13:50</span></li>
          <li>✓ Độ ẩm thấp NDMI</li>
          <li>✓ Nhiệt độ trên ngưỡng</li>
          <li>✓ 2 báo cáo cộng đồng</li>
          <li>✓ Tín hiệu lửa FIRMS</li>
        </ul>
        <div style={{fontSize:12, color:'#64748B'}}>Nguồn: Sentinel-2 · Sentinel-1 · FIRMS · Thời tiết · Cộng đồng · Tin cậy 87% · Mô hình v1.0</div>
      </div>

      <div style={{background:'#fff', border:'1px solid #E2E8E5', borderRadius:16, padding:16}}>
        <h3>CHUỖI TÁC ĐỘNG</h3>
        <div style={{fontFamily:'monospace', fontSize:13, textAlign:'center'}}>RỪNG ↓ CÀ PHÊ ↓ ĐƯỜNG / LOGISTICS ↓ CARBON ↓ CỘNG ĐỒNG</div>
        <div style={{fontSize:13, color:'#334155', marginTop:8}}>Tác động môi trường không chỉ là điểm trên bản đồ.</div>
      </div>

      <div style={{background:'#FFF7ED', border:'1px solid #FDBA74', borderRadius:16, padding:16}}>
        <h3>Phân tích AI — DỰ THẢO</h3>
        <div>Rủi ro: <b>CAO</b> · Ưu tiên: P1 · Cần xác minh thực địa</div>
        <div style={{fontSize:12, color:'#92400E', marginTop:4}}>DRAFT — Chờ xác minh con người</div>
        <Link to="/what-if" style={{display:'inline-block', marginTop:10, background:'#0F766E', color:'#fff', padding:'8px 12px', borderRadius:999, textDecoration:'none'}}>MÔ PHỎNG TÁC ĐỘNG →</Link>
      </div>

      <div style={{display:'flex', gap:8}}>
        <Link to="/what-if" style={{flex:1, textAlign:'center', background:'#0B1412', color:'#fff', padding:'10px', borderRadius:999, textDecoration:'none'}}>Mô phỏng</Link>
        <Link to="/missions" style={{flex:1, textAlign:'center', background:'#fff', border:'1px solid #E2E8E5', padding:'10px', borderRadius:999, textDecoration:'none', color:'inherit'}}>Tạo nhiệm vụ</Link>
      </div>
    </div>
  )
}

export function EventsList(){
  return (
    <div style={{display:'grid', gap:12}}>
      <h1>Event Intelligence</h1>
      {[1,2,3].map(i=>(
        <Link key={i} to={`/events/${i}`} style={{background:'#fff', border:'1px solid #E2E8E5', borderRadius:12, padding:16, textDecoration:'none', color:'inherit'}}>
          <b>Sự kiện #{i}</b> · Rủi ro CAO · 87% · Thôn {i} · 2h trước
        </Link>
      ))}
    </div>
  )
}
