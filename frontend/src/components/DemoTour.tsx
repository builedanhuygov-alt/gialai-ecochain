import { useState } from 'react'

// Tutorial DEMO 5 bước — hiện đủ hiện tượng: banner cháy, warning, lớp phủ, AI khói, tìm xã
const STEPS = [
  { title: '1/5 · Chào mừng bản DEMO', body: 'Đây là kịch bản tutorial: mọi hiện tượng cháy/warning đều là dữ liệu mẫu để bạn bấm thử. Bản LIVE mới là số liệu thật.', action: null as string | null },
  { title: '2/5 · Banner ĐANG CHÁY', body: 'Điểm cháy mẫu ở Xã Hội Sơn (≤5km) treo banner đỏ trên cùng. Bấm ✕ để ẩn, có điểm mới sẽ hiện lại.', action: 'burning' },
  { title: '3/5 · Điểm NGHI NGỜ', body: 'Các điểm vàng THEO DÕI (≤20km) là diện quét warning — xem chi tiết ở panel góc trái dưới bản đồ.', action: null },
  { title: '4/5 · Lớp phủ bản đồ', body: 'Nút ⚙️ mở panel: switch Thường/Vệ tinh + bật Điểm nhiệt FIRMS, NDVI, Sentinel-1.', action: 'layers' },
  { title: '5/5 · AI + Tìm xã', body: 'Bấm “AI phát hiện khói” để Vision phân tích khung hình. Ô “Tìm xã…” gõ tên 1 trong 135 xã để bay tới.', action: 'hotspot' },
]

export default function DemoTour({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0)
  const go = (d: number) => {
    const n = i + d
    if (n >= STEPS.length) { try { sessionStorage.setItem('ecogl_tour_done', '1') } catch {} ; onDone(); return }
    setI(n)
    const act = STEPS[n].action
    if (act) window.dispatchEvent(new CustomEvent('ecochain-tour', { detail: { action: act } }))
  }
  const s = STEPS[i]
  return (
    <div style={{ position: 'absolute', bottom: 76, left: '50%', transform: 'translateX(-50%)', zIndex: 30, width: 340, maxWidth: '92vw', background: 'rgba(15,23,42,0.92)', backdropFilter: 'blur(12px)', color: '#fff', borderRadius: 14, border: '1px solid rgba(255,255,255,0.2)', padding: 14, boxShadow: '0 12px 32px rgba(0,0,0,0.35)' }}>
      <div style={{ fontSize: 13, fontWeight: 800 }}>{s.title} <span style={{ fontSize: 10, background: '#F59E0B', color: '#000', padding: '2px 6px', borderRadius: 999 }}>DEMO</span></div>
      <div style={{ fontSize: 12, marginTop: 6, lineHeight: 1.6, opacity: 0.92 }}>{s.body}</div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button onClick={() => { try { sessionStorage.setItem('ecogl_tour_done', '1') } catch {} ; onDone() }} style={{ flex: 1, border: '1px solid rgba(255,255,255,0.3)', background: 'transparent', color: '#fff', borderRadius: 999, padding: '8px 0', fontSize: 12, cursor: 'pointer' }}>Bỏ qua</button>
        {i > 0 && <button onClick={() => go(-1)} style={{ flex: 1, border: '1px solid rgba(255,255,255,0.3)', background: 'transparent', color: '#fff', borderRadius: 999, padding: '8px 0', fontSize: 12, cursor: 'pointer' }}>← Trước</button>}
        <button onClick={() => go(1)} style={{ flex: 2, border: 0, background: '#F59E0B', color: '#000', borderRadius: 999, padding: '8px 0', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>{i === STEPS.length - 1 ? 'Hoàn thành ✓' : 'Tiếp →'}</button>
      </div>
    </div>
  )
}
