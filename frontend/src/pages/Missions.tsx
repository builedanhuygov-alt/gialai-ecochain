import { useState } from 'react'

export default function Missions(){
  const [role, setRole]= useState<'public'|'verifier'>( 'public')
  return (
    <div style={{display:'flex', flexDirection:'column', gap:16}}>
      <div style={{display:'flex', justifyContent:'space-between'}}>
        <h1>Missions</h1>
        <select value={role} onChange={e=> setRole(e.target.value as any)} style={{padding:'6px 10px', borderRadius:999, border:'1px solid #E2E8E5'}}>
          <option value="public">Public / Community</option>
          <option value="verifier">Field Verifier</option>
        </select>
      </div>

      {role==='verifier' ? (
        <div style={{background:'#fff', border:'1px solid #E2E8E5', borderRadius:16, padding:16}}>
          <h3>MY MISSIONS — Field Verifier</h3>
          <div style={{border:'1px solid #E2E8E5', borderRadius:12, padding:12, marginTop:10}}>
            <b>NHIỆM VỤ #042 — Xác minh bất thường rừng</b><br/>
            📍 Gia Lai · Ưu tiên CAO · Vì vệ tinh + thời tiết + cộng đồng<br/>
            <div style={{marginTop:8, display:'grid', gap:6, fontSize:13}}>
              <label><input type="checkbox"/> Đến vị trí</label>
              <label><input type="checkbox"/> Chụp ảnh</label>
              <label><input type="checkbox"/> Thu thập bằng chứng</label>
              <label><input type="checkbox"/> Xác minh</label>
            </div>
            <button style={{marginTop:10, background:'#0B1412', color:'#fff', padding:'8px 12px', borderRadius:999, border:0, width:'100%'}}>BẮT ĐẦU NHIỆM VỤ</button>
            <div style={{marginTop:10, display:'flex', gap:6, flexWrap:'wrap'}}>
              <button>📷 Ảnh</button><button>🎥 Video</button><button>📍 Vị trí</button><button>🚨 Khẩn cấp</button>
            </div>
            <div style={{marginTop:8, fontSize:12, color:'#64748B'}}>Gửi: Kết quả + Ảnh + Vị trí + Mô tả → AI đánh giá</div>
          </div>
        </div>
      ) : (
        <div style={{background:'#fff', border:'1px solid #E2E8E5', borderRadius:16, padding:16}}>
          <h3>Nhiệm vụ #042 — Xác minh bất thường rừng</h3>
          <div>📍 Gia Lai · Ưu tiên CAO</div>
          <div style={{marginTop:8, fontSize:13, color:'#334155'}}>Nhiệm vụ chứa vị trí, sự kiện, ưu tiên, hành động khuyến nghị, bằng chứng cần thiết.</div>
          <button style={{marginTop:10, background:'#0F766E', color:'#fff', padding:'8px 12px', borderRadius:999, border:0}}>Bắt đầu</button>
        </div>
      )}

      <div style={{background:'#F8FAF9', border:'1px solid #E2E8E5', borderRadius:12, padding:12, fontSize:13}}>
        <b>Vòng lặp học tập:</b> AI dự đoán CAO (87%) → Thực địa XÁC NHẬN → So sánh → Đánh giá mô hình → Cập nhật Digital Twin<br/>
        <span style={{fontSize:12, color:'#64748B'}}>Dự đoán: Cháy 82% · Thực tế: Đã xác nhận cháy · Kết quả: ĐÚNG · Dùng cho cải tiến liên tục</span>
      </div>

      <div style={{background:'#fff', border:'1px solid #E2E8E5', borderRadius:16, padding:16}}>
        <h4>Tác động môi trường (khi sự kiện gần nông nghiệp)</h4>
        <div style={{fontSize:13, lineHeight:1.8}}>
          Rừng: -12 ha · Carbon: +X tCO₂e (ước tính) · EUDR: Nguy cơ truy xuất · Logistics: +2.4h trễ · Chỉ hiện khi liên quan
        </div>
      </div>
    </div>
  )
}
