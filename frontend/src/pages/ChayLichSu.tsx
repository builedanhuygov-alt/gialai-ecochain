import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { API_BASE } from '../services/api'
import { C, DarkPage, ModeBadge, Panel } from '../components/trungtam/Dark'

type Chay = {
  id: string; level?: string; label?: string; source?: string
  issued_at?: string; scope?: string; administrative_unit_id?: string
  commune_name?: string
}

export default function ChayLichSu(){
  const [rows, setRows] = useState<Chay[]>([])
  const [trangThai, setTrangThai] = useState('loading')
  const [chon, setChon] = useState<Chay | null>(null)
  const [tenXa, setTenXa] = useState('')

  useEffect(()=>{
    fetch(`${API_BASE}/api/fire/warnings`)
      .then(r=> { if(!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(j=> { setRows(Array.isArray(j) ? j : []); setTrangThai('ready') })
      .catch(()=> setTrangThai('unavailable'))
  },[])

  useEffect(()=>{
    if(!chon?.administrative_unit_id){ setTenXa(''); return }
    fetch(`${API_BASE}/api/communes/${encodeURIComponent(chon.administrative_unit_id)}`)
      .then(r=> r.ok ? r.json() : null)
      .then(j=> setTenXa(j?.name || ''))
      .catch(()=> setTenXa(''))
  },[chon])

  return (
    <DarkPage>
      <header style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, letterSpacing: 1.2, color: C.muted }}>GIALAI ECOCHAIN · DỮ LIỆU LỊCH SỬ</div>
        <h1 style={{ margin: '2px 0 0', fontSize: 22 }}>Vụ cháy đã ghi nhận</h1>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
          Chỉ hiện vụ cháy có hồ sơ trong cơ sở dữ liệu. Không bịa thêm.
        </div>
      </header>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(280px, 380px)', gap: 12 }}>
        <Panel title={`DANH SÁCH (${rows.length})`}>
          {trangThai === 'loading' && <div style={{ fontSize: 13, color: C.muted }}>Đang tải…</div>}
          {trangThai === 'unavailable' && <div style={{ fontSize: 13, color: C.muted }}>Dịch vụ dữ liệu chưa khả dụng.</div>}
          {trangThai === 'ready' && rows.length === 0 && <div style={{ fontSize: 13, color: C.muted }}>Chưa có vụ cháy nào trong hồ sơ.</div>}
          {rows.map(r=> (
            <button key={r.id} onClick={()=> setChon(r)}
              style={{ display: 'block', width: '100%', textAlign: 'left', background: chon?.id === r.id ? '#13201D' : 'transparent',
                border: `1px solid ${C.line}`, borderRadius: 10, padding: '10px 12px', marginTop: 8, color: C.text, cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <b style={{ fontSize: 13 }}>Cấp {r.level || '—'} · {r.label || ''}</b>
                <span style={{ fontSize: 11, color: C.muted }}>{r.issued_at ? String(r.issued_at).slice(0, 10) : ''}</span>
              </div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{r.scope || r.id}</div>
              <div style={{ fontSize: 11, color: C.muted }}>Nguồn: {r.source || 'chưa rõ'}</div>
            </button>
          ))}
        </Panel>
        <Panel title="CHI TIẾT VỤ CHÁY">
          {!chon && <div style={{ fontSize: 13, color: C.muted }}>Chọn một vụ cháy để xem hồ sơ.</div>}
          {chon && (
            <>
              <div style={{ fontSize: 14, fontWeight: 800 }}>Cấp {chon.level || '—'}{chon.label ? ` · ${chon.label}` : ''}</div>
              <div style={{ fontSize: 13, marginTop: 8, display: 'grid', gap: 6 }}>
                <div><span style={{ color: C.muted }}>Mã hồ sơ: </span>{chon.id}</div>
                <div><span style={{ color: C.muted }}>Ngày ghi nhận: </span>{chon.issued_at || 'Chưa có dữ liệu'}</div>
                <div><span style={{ color: C.muted }}>Xã: </span>{tenXa || 'Chưa xác định'}</div>
                <div><span style={{ color: C.muted }}>Phạm vi: </span>{chon.scope || 'Chưa có dữ liệu'}</div>
                <div><span style={{ color: C.muted }}>Diện tích: </span>Chưa có dữ liệu</div>
                <div><span style={{ color: C.muted }}>Mức độ thiệt hại: </span>Chưa có dữ liệu</div>
                <div><span style={{ color: C.muted }}>Nguồn: </span>{chon.source || 'Chưa có dữ liệu'}</div>
              </div>
              <div style={{ marginTop: 10 }}><ModeBadge origin="LIVE" /></div>
              <div style={{ marginTop: 10 }}>
                <Link to="/" style={{ fontSize: 12, color: C.accent }}>Xem vị trí trên bản đồ</Link>
              </div>
            </>
          )}
        </Panel>
      </div>
    </DarkPage>
  )
}
