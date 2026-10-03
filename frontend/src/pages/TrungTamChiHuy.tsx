import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import MapView from '../components/MapView'
import { API_BASE } from '../services/api'
import { C, DarkPage, DataQuality, Metric, ModeBadge, Panel, RiskBar } from '../components/trungtam/Dark'

type Area = { name: string; lat: number; lon: number }

function useChonVung(): [Area | null, (a: Area) => void] {
  const [area, setArea] = useState<Area | null>(null)
  useEffect(()=>{
    const h = (e: any)=>{
      const d = e.detail || {}
      if (typeof d.lat === 'number' && typeof d.lon === 'number')
        setArea({ name: String(d.area || 'Khu vực đang chọn'), lat: d.lat, lon: d.lon })
    }
    window.addEventListener('ecochain-select-area', h)
    return ()=> window.removeEventListener('ecochain-select-area', h)
  },[])
  return [area, setArea]
}

export function useChiaSeVung() { return useChonVung() }

export default function TrungTamChiHuy(){
  const [area] = useChonVung()
  const [kpis, setKpis] = useState({ diemNong: 0, canhBao: 0, nhiemVu: 0, nguonTrucTuyen: 0, tongNguon: 0 })
  const [cheDo, setCheDo] = useState<string | null>(null)
  const [capNhat, setCapNhat] = useState('')
  const [canhBaoMoi, setCanhBaoMoi] = useState<any[]>([])
  const [quyetDinh, setQuyetDinh] = useState<any[]>([])
  const [suKien, setSuKien] = useState<any[]>([])
  const [ruiRo, setRuiRo] = useState<any>(null)
  const [dangTaiRuiRo, setDangTaiRuiRo] = useState(false)
  const [giaiThich, setGiaiThich] = useState<any>(null)

  useEffect(()=>{
    const tai = async ()=>{
      try{
        const [alert, firms, missions, geo] = await Promise.all([
          fetch(`${API_BASE}/api/alerts-unified`).then(r=> r.ok ? r.json() : []).catch(()=> []),
          fetch(`${API_BASE}/api/villages/fire-alert`).then(r=> r.ok ? r.json() : null).catch(()=> null),
          fetch(`${API_BASE}/api/missions`).then(r=> r.ok ? r.json() : null).catch(()=> null),
          fetch(`${API_BASE}/api/health/geospatial`).then(r=> r.ok ? r.json() : null).catch(()=> null),
        ])
        const firmsTrangThai = firms?.detection?.source_status || firms?.status || null
        const nguon = [geo?.firms?.status, geo?.gee?.status, geo?.sentinel2?.status].filter(Boolean)
        const trucTuyen = nguon.filter(s=> s === 'LIVE').length
        setKpis({
          diemNong: Array.isArray(firms?.fires) ? firms.fires.length : (firms?.fires ?? 0),
          canhBao: Array.isArray(alert) ? alert.filter((a: any)=> a.status === 'ACTIVE').length : 0,
          nhiemVu: Array.isArray(missions) ? missions.length : (missions?.missions?.length ?? missions?.count ?? 0),
          nguonTrucTuyen: trucTuyen, tongNguon: nguon.length,
        })
        const that = [firmsTrangThai, ...(nguon as string[])].filter(Boolean)
        setCheDo(that.length && that.every(s=> s === 'LIVE') ? 'LIVE' : 'DEMO / SIMULATED')
        setCapNhat(new Date().toLocaleString('vi-VN'))
        setCanhBaoMoi(Array.isArray(alert) ? alert.slice(0, 5) : [])
        const ms = Array.isArray(missions) ? missions : (missions?.missions || [])
        setQuyetDinh(ms.filter((m: any)=> m.result).slice(0, 5))
        const audit = await fetch(`${API_BASE}/api/forest/audit`).then(r=> r.ok ? r.json() : []).catch(()=> [])
        setSuKien(Array.isArray(audit) ? audit.slice(0, 8) : [])
      }catch{ /* khung vẫn hiện, số liệu thiếu ghi rõ */ }
    }
    tai()
    const id = setInterval(tai, 60000)
    return ()=> clearInterval(id)
  },[])

  useEffect(()=>{
    if(!area) return
    let huy = false
    const tai = async ()=>{
      setDangTaiRuiRo(true); setGiaiThich(null)
      try{
        const r = await fetch(`${API_BASE}/api/fire/risk?administrative_unit_id=${encodeURIComponent(area.name)}&lat=${area.lat}&lon=${area.lon}`)
        const j = r.ok ? await r.json() : null
        if(!huy) setRuiRo(j)
        if(j && j.risk_score !== undefined){
          try{
            const g = await fetch(`${API_BASE}/api/ai/pccc/synthesis`, { method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ fire_score: j.risk_score,
                firms_count: j?.evidence?.hotspots?.length ?? 0,
                weather: j?.evidence?.weather ?? {}, district: area.name }) })
            if(!huy) setGiaiThich(g.ok ? await g.json() : { status: 'UNAVAILABLE' })
          }catch{ if(!huy) setGiaiThich({ status: 'UNAVAILABLE' }) }
        }
      }catch{ if(!huy) setRuiRo(null) }
      if(!huy) setDangTaiRuiRo(false)
    }
    tai()
    return ()=> { huy = true }
  },[area])

  return (
    <DarkPage>
      <header style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: 1.2, color: C.muted }}>GIALAI ECOCHAIN · TRUNG TÂM CHỈ HUY</div>
          <h1 style={{ margin: '2px 0 0', fontSize: 22 }}>Điều hành chữa cháy rừng</h1>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: C.muted }}>● TRỰC TUYẾN</span>
          {cheDo ? <ModeBadge origin={cheDo} /> : <span style={{ fontSize: 12, color: C.muted }}>Đang kiểm tra nguồn…</span>}
          <span style={{ fontSize: 12, color: C.muted }}>Cập nhật: {capNhat || '—'}</span>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 12 }}>
        <Metric label="ĐIỂM NÓNG HIỆN TẠI" value={String(kpis.diemNong)} />
        <Metric label="CẢNH BÁO ĐANG HOẠT ĐỘNG" value={String(kpis.canhBao)} />
        <Metric label="NHIỆM VỤ THỰC ĐỊA" value={String(kpis.nhiemVu)} />
        <Metric label="NGUỒN TRỰC TUYẾN" value={`${kpis.nguonTrucTuyen}/${kpis.tongNguon}`} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(280px, 1fr)', gap: 12 }}>
        <Panel title="BẢN ĐỒ GIA LAI" right={<Link to="/" style={{ fontSize: 12, color: C.accent }}>Mở bản đồ đầy đủ</Link>}>
          <div style={{ height: 480, borderRadius: 10, overflow: 'hidden' }}>
            <MapView fill />
          </div>
        </Panel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Panel title="KHU VỰC ĐANG CHỌN">
            {!area && <div style={{ fontSize: 13, color: C.muted }}>Bấm một xã trên bản đồ để phân tích.</div>}
            {area && (
              <>
                <div style={{ fontSize: 14, fontWeight: 800 }}>{area.name}</div>
                <div style={{ fontSize: 12, color: C.muted }}>{area.lat.toFixed(4)}, {area.lon.toFixed(4)}</div>
                <div style={{ marginTop: 10 }}>
                  {dangTaiRuiRo && <div style={{ fontSize: 13, color: C.muted }}>Đang tính điểm nguy cơ…</div>}
                  {!dangTaiRuiRo && !ruiRo && <div style={{ fontSize: 13, color: C.muted }}>Không có dữ liệu.</div>}
                  {!dangTaiRuiRo && ruiRo && (
                    <>
                      <RiskBar score={ruiRo.risk_score ?? null} level={ruiRo.warning_level} />
                      <div style={{ marginTop: 8 }}>
                        <DataQuality missing={ruiRo.missing} completeness={ruiRo.data_completeness} />
                      </div>
                      {ruiRo.factors && Object.keys(ruiRo.factors).length > 0 && (
                        <div style={{ marginTop: 8, fontSize: 12 }}>
                          <b>YẾU TỐ CHÍNH</b>
                          {Object.entries(ruiRo.factors).map(([k, v])=> (
                            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderTop: `1px solid ${C.line}` }}>
                              <span>{k}</span><b>{String(v)}</b>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </>
            )}
          </Panel>
          <Panel title="GIẢI THÍCH AI">
            {!giaiThich && <div style={{ fontSize: 13, color: C.muted }}>Chọn khu vực để xem diễn giải.</div>}
            {giaiThich && (
              <>
                <ModeBadge origin={giaiThich.provider === 'Gemini' && giaiThich.status === 'LIVE' ? 'LIVE' : 'DEMO / SIMULATED'} />
                <div style={{ fontSize: 13, marginTop: 8, whiteSpace: 'pre-wrap' }}>
                  {typeof giaiThich.result === 'string' ? giaiThich.result
                    : giaiThich.result?.summary || giaiThich.note || giaiThich.reason || 'Chưa có diễn giải.'}
                </div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>
                  Điểm nguy cơ không phải xác suất cháy. Thiếu dữ liệu sẽ ghi rõ, không suy đoán.
                </div>
              </>
            )}
          </Panel>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12, marginTop: 12 }}>
        <Panel title="CẢNH BÁO GẦN ĐÂY" right={<Link to="/thong-bao" style={{ fontSize: 12, color: C.accent }}>Tất cả</Link>}>
          {canhBaoMoi.length === 0 && <div style={{ fontSize: 13, color: C.muted }}>Không có cảnh báo nào.</div>}
          {canhBaoMoi.map((a: any)=> (
            <div key={a.id} style={{ fontSize: 13, padding: '6px 0', borderTop: `1px solid ${C.line}` }}>
              <b>{a.level}</b> · {a.title || a.id}
              <div style={{ fontSize: 11, color: C.muted }}>{a.administrative_unit_id} · {a.status}</div>
            </div>
          ))}
        </Panel>
        <Panel title="QUYẾT ĐỊNH GẦN ĐÂY" right={<Link to="/missions" style={{ fontSize: 12, color: C.accent }}>Nhiệm vụ</Link>}>
          {quyetDinh.length === 0 && <div style={{ fontSize: 13, color: C.muted }}>Chưa có kết quả thực địa nào.</div>}
          {quyetDinh.map((m: any)=> (
            <div key={m.id} style={{ fontSize: 13, padding: '6px 0', borderTop: `1px solid ${C.line}` }}>
              <b>{m.result?.outcome}</b> · {m.area}
              <div style={{ fontSize: 11, color: C.muted }}>{m.assignee ? `Tổ ${m.assignee}` : ''} {m.result?.note || ''}</div>
            </div>
          ))}
        </Panel>
        <Panel title="SỰ KIỆN HỆ THỐNG" right={<Link to="/nhat-ky" style={{ fontSize: 12, color: C.accent }}>Nhật ký</Link>}>
          {suKien.length === 0 && <div style={{ fontSize: 13, color: C.muted }}>Chưa có sự kiện nào.</div>}
          {suKien.map((e: any, i: number)=> (
            <div key={i} style={{ fontSize: 12, padding: '4px 0', borderTop: `1px solid ${C.line}`, color: C.muted }}>
              {e.created_at} · {e.action} · {e.resource_type}
            </div>
          ))}
        </Panel>
      </div>
    </DarkPage>
  )
}
