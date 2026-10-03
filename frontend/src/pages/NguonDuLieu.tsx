import { useEffect, useState } from 'react'
import { API_BASE } from '../services/api'
import { C, DarkPage, ModeBadge, Panel } from '../components/trungtam/Dark'

type Nguon = {
  ten: string; duLieu: string; trangThai: string; capNhat: string; cheDo: string; doPhu: string; ghiChu?: string
}

export default function NguonDuLieu(){
  const [rows, setRows] = useState<Nguon[]>([])
  const [dangTai, setDangTai] = useState(true)

  useEffect(()=>{
    const tai = async ()=>{
      const get = async (p: string)=> fetch(`${API_BASE}${p}`).then(r=> r.ok ? r.json() : null).catch(()=> null)
      const [geo, gee, ai, wx] = await Promise.all([
        get('/api/health/geospatial'), get('/api/earth-engine/status'), get('/api/ai/health'),
        get('/api/weather/current?lat=13.9&lon=108.3'),
      ])
      const live = (s: any)=> s === 'LIVE' ? 'DỮ LIỆU THẬT' : 'GIẢ LẬP / CHƯA CÓ'
      const out: Nguon[] = [
        { ten: 'NASA FIRMS', duLieu: 'Điểm nóng VIIRS', trangThai: geo?.firms?.status || 'CHƯA RÕ',
          capNhat: geo?.firms?.last_updated || geo?.updated_at || '—', cheDo: live(geo?.firms?.status),
          doPhu: 'Toàn tỉnh Gia Lai', ghiChu: 'Điểm nhiệt nhân tạo (sân bay/KCN) bị loại khỏi cảnh báo.' },
        { ten: 'Thời tiết', duLieu: 'Nhiệt độ/ẩm/gió/mưa hiện tại', trangThai: wx?.status || 'CHƯA RÕ',
          capNhat: wx?.retrieved_at ? new Date(wx.retrieved_at * 1000).toLocaleString('vi-VN') : '—',
          cheDo: live(wx?.status), doPhu: 'Theo tọa độ truy vấn', ghiChu: 'Miễn phí, không cần key.' },
        { ten: 'Vệ tinh', duLieu: 'NDVI Sentinel-2', trangThai: geo?.sentinel2?.status || gee?.connected ? 'LIVE' : 'CHƯA RÕ',
          capNhat: '—', cheDo: gee?.connected ? 'DỮ LIỆU THẬT' : 'GIẢ LẬP / CHƯA CÓ',
          doPhu: 'Tùy vùng truy vấn', ghiChu: gee?.connected ? `Dự án ${gee?.project || ''}` : 'Chưa cấu hình key ở backend — dùng nhãn giả lập.' },
        { ten: 'Địa hình', duLieu: 'Độ cao Terrarium', trangThai: 'LIVE',
          capNhat: '—', cheDo: 'DỮ LIỆU THẬT', doPhu: 'Lát cắt ngoài', ghiChu: 'Chỉ dùng hiển thị 3D.' },
        { ten: 'Trí tuệ nhân tạo', duLieu: 'Diễn giải nguy cơ', trangThai: ai?.llm?.status || 'CHƯA RÕ',
          capNhat: '—', cheDo: live(ai?.llm?.status), doPhu: 'Theo yêu cầu',
          ghiChu: 'Không có LLM thì dùng công thức cố định có ghi rõ, không giả vờ AI đang chạy.' },
        { ten: 'Cộng đồng', duLieu: 'Báo cáo + ảnh hiện trường', trangThai: 'LIVE',
          capNhat: '—', cheDo: 'NGƯỜI DÙNG NHẬP', doPhu: 'Toàn tỉnh', ghiChu: 'Xác minh 1 người/thiết bị 1 lần, GPS ~1 km, 24 giờ.' },
      ]
      setRows(out); setDangTai(false)
    }
    tai()
  },[])

  return (
    <DarkPage>
      <header style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, letterSpacing: 1.2, color: C.muted }}>GIALAI ECOCHAIN · MINH BẠCH NGUỒN</div>
        <h1 style={{ margin: '2px 0 0', fontSize: 22 }}>Nguồn dữ liệu</h1>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
          Mỗi nguồn ghi rõ trạng thái, thời điểm cập nhật và chế độ. Thiếu key thì giữ chế độ giả lập, không gọi là trực tiếp.
        </div>
      </header>
      <Panel title="DANH SÁCH NGUỒN">
        {dangTai && <div style={{ fontSize: 13, color: C.muted }}>Đang kiểm tra các nguồn…</div>}
        {rows.map(r=> (
          <div key={r.ten} style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 10, padding: '10px 0', borderTop: `1px solid ${C.line}`, fontSize: 13 }}>
            <div><b>{r.ten}</b><div style={{ fontSize: 11, color: C.muted }}>{r.duLieu}</div></div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ border: `1px solid ${C.line}`, borderRadius: 999, padding: '2px 10px', fontSize: 11 }}>{r.trangThai}</span>
              <ModeBadge origin={r.cheDo === 'DỮ LIỆU THẬT' ? 'LIVE' : r.cheDo === 'NGƯỜI DÙNG NHẬP' ? 'USER_INPUT' : 'DEMO / SIMULATED'} />
              <span style={{ fontSize: 11, color: C.muted }}>Cập nhật: {r.capNhat} · Phủ: {r.doPhu}</span>
              {r.ghiChu && <span style={{ fontSize: 11, color: C.muted, width: '100%' }}>{r.ghiChu}</span>}
            </div>
          </div>
        ))}
      </Panel>
    </DarkPage>
  )
}
