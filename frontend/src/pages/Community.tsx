import { useState } from 'react'
import { Modal } from '../components/Modal'
import { StaggerContainer, StaggerItem } from '../motion/primitives'
export default function Community(){
  const [open, setOpen]= useState(false)
  return (
    <div className="page">
      <h1>Cộng đồng — Trí tuệ công dân</h1>
      <StaggerContainer>
        <div className="feed">
          <StaggerItem><div className="post"><img src="https://picsum.photos/600/300?random=1" alt="" loading="lazy"/><div className="meta">Báo cháy · Thôn 1 · 12 phút trước · <span className="badge">Cộng đồng đã xác minh</span> · 2 xác nhận · AI 87% <button>Xem xét</button></div></div></StaggerItem>
          <div className="upload"><button onClick={()=>setOpen(true)}>📷 Tải ảnh</button><button>🎥 Video</button><button>📍 Vị trí</button></div>
          <Modal open={open} onClose={()=>setOpen(false)} title="Tải lên báo cáo"><div style={{display:'grid', gap:8}}><input placeholder="Mô tả" style={{padding:'8px', border:'1px solid #E2E8E5', borderRadius:8}}/><button style={{background:'#0F766E', color:'#fff', border:0, padding:'8px 12px', borderRadius:999}}>Gửi báo cáo</button><div style={{fontSize:12, color:'#64748B'}}>Ảnh được hash · Xác minh cộng đồng · Lưu chuỗi bằng chứng</div></div></Modal>
          <div className="flow">BÁO CÁO → XÁC MINH CỘNG ĐỒNG → DUYỆT QUẢN TRỊ → ĐÃ XÁC NHẬN</div>
        </div>
      </StaggerContainer>
      <style>{`.post{background:#fff; border:1px solid #E2E8E5; border-radius:16px; overflow:hidden} .post img{width:100%} .meta{padding:12px; font-size:13px} .badge{background:#DBEAFE; color:#1E40AF; padding:4px 8px; border-radius:999px; font-size:11px} .upload{display:flex; gap:8px; margin-top:12px} .upload button{background:#fff; border:1px solid #E2E8E5; border-radius:999px; padding:8px 12px} .flow{background:#fff; border:1px solid #E2E8E5; border-radius:12px; padding:12px; margin-top:12px; text-align:center; font-size:13px; letter-spacing:0.4px}`}</style>
    </div>
  )
}
