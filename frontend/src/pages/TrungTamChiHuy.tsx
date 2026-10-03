import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import MapView from '../components/MapView'
import { API_BASE } from '../services/api'
import { C, CanhBaoChinhThuc, ChatLuongNguon, DarkPage, Metric, ModeBadge, Panel, RiskBar } from '../components/trungtam/Dark'

type Area = { name: string; lat: number; lon: number }

function khoangCachKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = (d: number)=> d * Math.PI / 180
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lon2 - lon1) / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(a))
}

function tuoiNgay(acq?: string | null): string {
  if(!acq) return 'không rõ tuổi'
  const d = Math.round((Date.now() - new Date(acq.length <= 10 ? acq + 'T12:00:00' : acq).getTime()) / 86400000)
  if(isNaN(d)) return 'không rõ tuổi'
  return d <= 0 ? 'hôm nay' : `${d} ngày trước`
}

export default function TrungTamChiHuy(){
  const [area, setArea] = useState<Area | null>(null)
  const [dangTimXa, setDangTimXa] = useState(true)
  const [kpis, setKpis] = useState({ diemNong: 0, tinHieu: 0, nhiemVu: 0, nguonTrucTuyen: 0, tongNguon: 0 })
  const [caoNhat, setCaoNhat] = useState<{ name: string; score: number; level: string } | null>(null)
  const [cheDo, setCheDo] = useState<string | null>(null)
  const [capNhat, setCapNhat] = useState('')
  const [tinHieuMoi, setTinHieuMoi] = useState<any[]>([])
  const [quyetDinh, setQuyetDinh] = useState<any[]>([])
  const [suKien, setSuKien] = useState<any[]>([])
  const [fires, setFires] = useState<any[]>([])
  const [ruiRo, setRuiRo] = useState<any>(null)
  const [dangTaiRuiRo, setDangTaiRuiRo] = useState(false)
  const [giaiThich, setGiaiThich] = useState<any>(null)
  const [lichSu, setLichSu] = useState<any[]>([])

  // Mở trang: tự tìm xã nguy cơ cao nhất qua /fire/commune-levels.
  useEffect(()=>{
    let huy = false
    const tim = async ()=>{
      setDangTimXa(true)
      try{
        const ds = await fetch(`${API_BASE}/api/communes?limit=500`).then(r=> r.ok ? r.json() : null)
        const rows = ds?.communes || []
        const units = rows.filter((u: any)=> Array.isArray(u.centroid)).map((u: any)=> ({ name: u.name, lat: u.centroid[0], lon: u.centroid[1] }))
        if(!units.length) return
        const lv = await fetch(`${API_BASE}/api/fire/commune-levels`, { method: 'POST',
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ units }) }).then(r=> r.ok ? r.json() : null)
        const list = lv?.levels || lv?.communes || []
        let best: any = null
        for(const it of list){
          const s = it.score ?? it.risk_score
          if(typeof s === 'number' && (!best || s > best.score)) best = { name: it.name, score: s, level: it.level, lat: it.lat, lon: it.lon }
        }
        if(!huy && best){
          const u = units.find((x: any)=> x.name === best.name)
          setCaoNhat({ name: best.name, score: best.score, level: best.level })
          setArea({ name: best.name, lat: u?.lat ?? 13.9, lon: u?.lon ?? 108.3 })
        }
      }catch{ /* giữ trạng thái chờ chọn tay */ }
      if(!huy) setDangTimXa(false)
    }
    tim()
    const h = (e: any)=>{
      const d = e.detail || {}
      if(typeof d.lat === 'number' && typeof d.lon === 'number'){
        setArea({ name: String(d.area || 'Khu vực đang chọn'), lat: d.lat, lon: d.lon })
        setCaoNhat(null)
      }
    }
    window.addEventListener('ecochain-select-area', h)
    return ()=> { huy = true; window.removeEventListener('ecochain-select-area', h) }
  },[])

  useEffect(()=>{
    const tai = async ()=>{
      try{
        const [alert, firms, missions, geo] = await Promise.all([
          fetch(`${API_BASE}/api/alerts-unified`).then(r=> r.ok ? r.json() : []).catch(()=> []),
          fetch(`${API_BASE}/api/villages/fire-alert`).then(r=> r.ok ? r.json() : null).catch(()=> null),
          fetch(`${API_BASE}/api/missions`).then(r=> r.ok ? r.json() : null).catch(()=> null),
          fetch(`${API_BASE}/api/health/geospatial`).then(r=> r.ok ? r.json() : null).catch(()=> null),
        ])
        const dsFires = Array.isArray(firms?.fires) ? firms.fires : []
        setFires(dsFires)
        const nguon = [geo?.firms?.status, geo?.gee?.status, geo?.sentinel2?.status].filter(Boolean)
        const trucTuyen = nguon.filter(s=> s === 'LIVE').length
        setKpis({
          diemNong: dsFires.length,
          tinHieu: Array.isArray(alert) ? alert.filter((a: any)=> a.status === 'ACTIVE').length : 0,
          nhiemVu: Array.isArray(missions) ? missions.length : (missions?.missions?.length ?? missions?.count ?? 0),
          nguonTrucTuyen: trucTuyen, tongNguon: nguon.length,
        })
        const firmsTrangThai = firms?.detection?.source_status || firms?.status || null
        const that = [firmsTrangThai, ...(nguon as string[])].filter(Boolean)
        setCheDo(that.length && that.every(s=> s === 'LIVE') ? 'LIVE' : 'DEMO / SIMULATED')
        setCapNhat(new Date().toLocaleString('vi-VN'))
        setTinHieuMoi(Array.isArray(alert) ? alert.slice(0, 5) : [])
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

  // Điểm + lịch sử + giải thích theo luật cho khu vực đang chọn.
  useEffect(()=>{
    if(!area) return
    let huy = false
    const tai = async ()=>{
      setDangTaiRuiRo(true); setGiaiThich(null)
      try{
        const r = await fetch(`${API_BASE}/api/fire/risk?administrative_unit_id=${encodeURIComponent(area.name)}&lat=${area.lat}&lon=${area.lon}`)
        const j = r.ok ? await r.json() : null
        if(huy) return
        setRuiRo(j)
        try{
          const h = await fetch(`${API_BASE}/api/fire/history?administrative_unit_id=${encodeURIComponent(area.name)}`)
          const hj = h.ok ? await h.json() : null
          if(!huy) setLichSu(Array.isArray(hj?.history) ? hj.history.slice(0, 4) : [])
        }catch{ if(!huy) setLichSu([]) }
        if(j){
          const ev = j.evidence || {}
          const body = {
            ndvi: ev.satellite?.ndvi ?? null, ndmi: ev.satellite?.ndmi ?? null, nbr: ev.satellite?.nbr ?? null,
            temperature: ev.weather?.temperature ?? null, humidity: ev.weather?.humidity ?? null,
            rainfall: ev.weather?.rainfall ?? null, wind_speed: ev.weather?.wind_speed ?? null,
            slope: ev.terrain?.slope ?? null, hotspots: ev.hotspots || [],
            community_count: ev.community ?? 0,
          }
          const [g, ch] = await Promise.all([
            fetch(`${API_BASE}/api/fire-risk/explain`, { method: 'POST',
              headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
              .then(r=> r.ok ? r.json() : null).catch(()=> null),
            fetch(`${API_BASE}/api/fire-risk/change?lat=${area.lat}&lon=${area.lon}&administrative_unit_id=${encodeURIComponent(area.name)}`)
              .then(r=> r.ok ? r.json() : null).catch(()=> null),
          ])
          if(huy) return
          if(g && g.score !== null){
            const ten: Record<string, string> = { fuel_dryness: 'Thực vật khô', weather_danger: 'Nhiệt độ',
              firms_proximity: 'Điểm nhiệt', wind: 'Gió', rainfall_deficit: 'Mưa',
              terrain: 'Địa hình', historical_community: 'Lịch sử/cộng đồng' }
            setGiaiThich({ giaiThich: g, ten, thayDoi: ch,
              bangChung: [
                { nguon: 'Vệ tinh', chiSo: 'NDVI', giaTri: ev.satellite?.ndvi ?? 'thiếu', luc: 'lúc phân tích' },
                { nguon: 'Thời tiết', chiSo: 'nhiệt/ẩm/gió', giaTri: [ev.weather?.temperature, ev.weather?.humidity, ev.weather?.wind_speed].map(v=> v ?? '—').join(' / '), luc: 'lúc phân tích' },
                { nguon: 'FIRMS', chiSo: 'điểm nóng', giaTri: `${(ev.hotspots || []).length} điểm (${ev.firms_status || 'không rõ'})`, luc: 'lúc phân tích' },
                { nguon: 'Cộng đồng', chiSo: 'báo cáo', giaTri: `${ev.community ?? 0} báo cáo`, luc: 'lúc phân tích' },
              ] })
          } else setGiaiThich({ trong: true })
        }
      }catch{ if(!huy){ setRuiRo(null); setGiaiThich({ trong: true }) } }
      if(!huy) setDangTaiRuiRo(false)
    }
    tai()
    return ()=> { huy = true }
  },[area])

  const diemGan = fires
    .map((f: any)=> ({ ...f, kc: (typeof f.latitude === 'number' && typeof f.longitude === 'number' && area)
      ? khoangCachKm(area.lat, area.lon, f.latitude, f.longitude) : null }))
    .filter((f: any)=> f.kc !== null)
    .sort((a: any, b: any)=> a.kc - b.kc)
    .slice(0, 5)

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

      <div style={{ marginBottom: 12 }}><CanhBaoChinhThuc /></div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 12 }}>
        <Metric label="NGUY CƠ CAO NHẤT" value={caoNhat ? `${caoNhat.score}` : '—'} sub={caoNhat ? `${caoNhat.name} · Cấp ${caoNhat.level}` : dangTimXa ? 'Đang tìm…' : 'Chưa rõ'} />
        <Metric label="ĐIỂM NÓNG HIỆN TẠI" value={String(kpis.diemNong)} />
        <Metric label="TÍN HIỆU ĐANG THEO DÕI" value={String(kpis.tinHieu)} sub="Chưa phải cảnh báo chính thức" />
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
            {dangTimXa && !area && <div style={{ fontSize: 13, color: C.muted }}>Đang tìm xã nguy cơ cao nhất…</div>}
            {!dangTimXa && !area && <div style={{ fontSize: 13, color: C.muted }}>Chưa rõ xã nào cao nhất — bấm một xã trên bản đồ.</div>}
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
                      <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
                        Độ tin cậy: {ruiRo.confidence ?? '—'}
                      </div>
                      <div style={{ marginTop: 8 }}>
                        <ChatLuongNguon rows={[
                          { nhom: 'Thời tiết', co: ruiRo.evidence?.weather?.temperature != null, chiTiet: 'nhiệt/ẩm/gió/mưa' },
                          { nhom: 'Vệ tinh', co: !!ruiRo.evidence?.satellite_ok, chiTiet: 'NDVI Sentinel' },
                          { nhom: 'Điểm nóng', co: ['LIVE', 'CACHED', 'STALE'].includes(ruiRo.evidence?.firms_status), chiTiet: ruiRo.evidence?.firms_status || 'không rõ' },
                          { nhom: 'Lịch sử', co: lichSu.length > 0, chiTiet: lichSu.length ? `${lichSu.length} lần đo` : 'chưa có lần đo trước' },
                          { nhom: 'Con người', co: (ruiRo.evidence?.community ?? 0) > 0, chiTiet: `${ruiRo.evidence?.community ?? 0} báo cáo` },
                        ]} />
                      </div>
                      <div style={{ marginTop: 8, fontSize: 12 }}>
                        <b>ĐIỂM NÓNG GẦN NHẤT</b>
                        {diemGan.length === 0 && <div style={{ color: C.muted }}>Không có điểm nóng quanh đây.</div>}
                        {diemGan.map((f: any, i: number)=> (
                          <div key={i} style={{ padding: '4px 0', borderTop: `1px solid ${C.line}` }}>
                            Cách {f.kc.toFixed(1)} km · độ tin cậy {f.confidence ?? 'không rõ'} · {tuoiNgay(f.acq_date)} · {f.satellite || 'VIIRS'}
                          </div>
                        ))}
                        <div style={{ color: C.warn, fontSize: 11, marginTop: 4 }}>
                          Đây là tín hiệu cần xác minh, không phải xác nhận cháy.
                        </div>
                      </div>
                      <div style={{ marginTop: 8, fontSize: 12 }}>
                        <b>XU HƯỚNG 4 NGÀY</b>
                        {lichSu.length >= 2 ? (
                          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                            {lichSu.map((h: any, i: number)=> (
                              <div key={i} style={{ flex: 1, textAlign: 'center', background: C.panelSolid, borderRadius: 8, padding: 6 }}>
                                <div style={{ fontWeight: 800 }}>{h.risk_score}</div>
                                <div style={{ fontSize: 10, color: C.muted }}>{String(h.date || '').slice(5)}</div>
                              </div>
                            ))}
                          </div>
                        ) : <div style={{ color: C.muted }}>Chưa đủ lần đo trước để vẽ xu hướng.</div>}
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
          </Panel>
          <Panel title="GIẢI THÍCH AI">
            {!giaiThich && <div style={{ fontSize: 13, color: C.muted }}>Chọn khu vực để xem diễn giải.</div>}
            {giaiThich?.trong && <div style={{ fontSize: 13, color: C.muted }}>Không có dữ liệu để diễn giải.</div>}
            {giaiThich && !giaiThich.trong && (
              <>
                <div style={{ fontSize: 11, fontWeight: 800, color: C.accent, border: `1px solid ${C.accent}`,
                  borderRadius: 999, padding: '2px 10px', display: 'inline-block' }}>
                  AI Explanation – rule-based (phân tích đóng góp, không phải mô hình học máy)
                </div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>
                  Độ tin cậy (độ đầy dữ liệu): <b style={{ color: C.text }}>
                    {Math.round((giaiThich.giaiThich.confidence ?? 0) * 100)}%</b> — khác với điểm nguy cơ.
                </div>
                <div style={{ fontSize: 12, fontWeight: 800, marginTop: 8 }}>BA YẾU TỐ ẢNH HƯỞNG CHÍNH</div>
                {giaiThich.giaiThich.top3.map((d: any)=> (
                  <div key={d.factor} style={{ marginTop: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                      <span>{giaiThich.ten[d.factor] || d.factor}</span><b>+{Number(d.contribution).toFixed(1)}</b>
                    </div>
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{d.mo_ta}</div>
                    <div style={{ height: 6, borderRadius: 999, background: '#1E3A36', marginTop: 2 }}>
                      <div style={{ width: `${Math.min(100, Math.max(4, d.contribution))}%`, height: '100%', borderRadius: 999, background: C.warn }} />
                    </div>
                  </div>
                ))}
                <div style={{ fontSize: 12, fontWeight: 800, marginTop: 10 }}>THANH ĐÓNG GÓP (TỔNG = ĐIỂM)</div>
                {giaiThich.giaiThich.bars.map((d: any)=> (
                  <div key={d.factor} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: C.muted, marginTop: 2 }}>
                    <span>{giaiThich.ten[d.factor] || d.factor} · điểm {d.score} × trọng số {d.trong_so}</span>
                    <b style={{ color: C.text }}>+{Number(d.contribution).toFixed(1)}</b>
                  </div>
                ))}
                {giaiThich.giaiThich.thieu.map((t: string, i: number)=> (
                  <div key={i} style={{ fontSize: 11, color: C.warn, marginTop: 4 }}>{t}</div>
                ))}
                <div style={{ fontSize: 12, fontWeight: 800, marginTop: 10 }}>ĐIỀU GÌ LÀM NGUY CƠ THAY ĐỔI?</div>
                {giaiThich.thayDoi ? (
                  <>
                    <div style={{ fontSize: 12, marginTop: 4 }}>{giaiThich.thayDoi.tom_tat}</div>
                    {(giaiThich.thayDoi.chenh_lech || []).map((t: any, i: number)=> (
                      <div key={i} style={{ fontSize: 12, marginTop: 2 }}>
                        {t.yeu_to}: <span style={{ color: t.delta > 0 ? '#F87171' : '#34D399', fontWeight: 700 }}>
                          ({t.delta > 0 ? '+' : ''}{t.delta})</span>
                      </div>
                    ))}
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{giaiThich.thayDoi.ghi_chu}</div>
                  </>
                ) : <div style={{ fontSize: 12, color: C.muted }}>Chưa tính được thay đổi.</div>}
                <div style={{ fontSize: 12, fontWeight: 800, marginTop: 10 }}>CHUỖI BẰNG CHỨNG</div>
                {giaiThich.bangChung.map((b: any, i: number)=> (
                  <div key={i} style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>
                    {b.nguon} · {b.chiSo}: <b style={{ color: C.text }}>{String(b.giaTri)}</b> · {b.luc}
                  </div>
                ))}
              </>
            )}
          </Panel>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12, marginTop: 12 }}>
        <Panel title="TÍN HIỆU GẦN ĐÂY" right={<Link to="/thong-bao" style={{ fontSize: 12, color: C.accent }}>Tất cả</Link>}>
          {tinHieuMoi.length === 0 && <div style={{ fontSize: 13, color: C.muted }}>Không có tín hiệu nào.</div>}
          {tinHieuMoi.map((a: any)=> (
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
