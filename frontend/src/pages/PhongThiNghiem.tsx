import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import WhatIfPanel from '../components/WhatIfPanel'
import { API_BASE } from '../services/api'
import { C, DarkPage, Panel } from '../components/trungtam/Dark'

const TEN_YEU_TO: Record<string, string> = {
  fuel_dryness: 'Thảm khô', weather_danger: 'Thời tiết nguy hiểm', firms_proximity: 'Gần điểm nóng',
  wind: 'Gió', rainfall_deficit: 'Thiếu mưa', terrain: 'Địa hình', historical_community: 'Lịch sử/cộng đồng',
}

export default function PhongThiNghiem(){
  const [cauHinh, setCauHinh] = useState<any>(null)
  useEffect(()=>{
    fetch(`${API_BASE}/api/fire-risk/config`).then(r=> r.ok ? r.json() : null).then(setCauHinh).catch(()=> {})
  },[])
  return (
    <DarkPage>
      <header style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, letterSpacing: 1.2, color: C.muted }}>GIALAI ECOCHAIN · PHÒNG THÍ NGHIỆM</div>
        <h1 style={{ margin: '2px 0 0', fontSize: 22 }}>Giả định tình huống cháy</h1>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
          Kéo thanh trượt để thử điều kiện khác. Mọi kết quả đều là <b>THỬ NGHIỆM — không phải dự báo</b>.
        </div>
      </header>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(280px, 360px)', gap: 12 }}>
        <div style={{ background: '#fff', color: '#0B1412', borderRadius: 14, padding: 4 }}>
          <WhatIfPanel />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Panel title="CÔNG THỨC ĐANG DÙNG">
            {!cauHinh && <div style={{ fontSize: 13, color: C.muted }}>Đang tải cấu hình…</div>}
            {cauHinh && (
              <>
                {Object.entries(cauHinh.weights || {}).map(([k, v])=> (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', borderTop: `1px solid ${C.line}` }}>
                    <span>{TEN_YEU_TO[k] || k}</span><b>{Math.round(Number(v) * 100)}%</b>
                  </div>
                ))}
                <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>
                  Ngưỡng cấp: {(cauHinh.thresholds || []).map((t: any)=> `≤${t.lte}→${t.level}`).join(' · ')}
                </div>
                <div style={{ fontSize: 11, color: C.warn, marginTop: 4 }}>Chỉ số tham khảo, trọng số chưa hiệu chuẩn.</div>
              </>
            )}
          </Panel>
          <Panel title="MÔ PHỎNG LAN LỬA">
            <div style={{ fontSize: 13, color: C.muted }}>
              Xem lửa lan theo giờ với gió và địa hình hiện tại (mô hình heuristic, ghi rõ mô phỏng).
            </div>
            <Link to="/firesim" style={{ display: 'inline-block', marginTop: 8, background: C.accent, color: '#06281F',
              padding: '8px 18px', borderRadius: 999, fontSize: 13, fontWeight: 800, textDecoration: 'none' }}>
              Mở mô phỏng lan lửa
            </Link>
          </Panel>
        </div>
      </div>
    </DarkPage>
  )
}
