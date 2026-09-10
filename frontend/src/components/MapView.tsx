import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
// ⚠️ BẮT BUỘC 1: Import CSS của MapLibre (Nếu thiếu map sẽ trắng/vỡ) — phải ở đầu file
import 'maplibre-gl/dist/maplibre-gl.css'
// Fallback nếu dùng Leaflet (không dùng nhưng giữ để tránh thiếu CSS)
// import 'leaflet/dist/leaflet.css'; 
import { useLocation } from '../hooks/useLocation'
import { API_BASE, api } from '../services/api'
import DemoTour from './DemoTour'
import { getMode } from './ModeSwitch'

// Điểm từng cháy 2026 — tọa độ chuẩn do người dùng cung cấp, bấm vào xem thời gian + bài báo
const HIST_FIRES = [
  { name: 'Cháy rừng dương TK62/TK150 (~30ha)', place: 'Xã Phù Mỹ Đông · 14°12′20″N 109°09′25″E', coords: [109.15694, 14.20556] as [number, number], time: '20-21/7/2026', note: '13h20 20/7 phát hiện, 23h bùng lại (tàn qua băng), 21h 21/7 kiểm soát · ~500 người + băng trắng', press: 'Dân trí (Doãn Công) 21/7 · VOV Tây Nguyên 22/7/2026 · Sở NN&MT Gia Lai' },
  { name: 'Cháy TK213 + núi Đầu Voi', place: 'Xã Hội Sơn – Hòa Hội · 14.09715, 108.99686', coords: [108.9968596, 14.0971548] as [number, number], time: 'Tháng 7-8/2026 (Đầu Voi khống chế tối 22/8)', note: 'Thực bì + rừng trồng · đồi cao hiểm trở, gió lớn', press: 'Tiền Phong 24/8/2026 · Cổng TTĐT tỉnh Gia Lai' },
  { name: 'Cháy rừng keo đèo Cây Cốc', place: 'Thôn An Chiểu, xã Hoài Ân · 11°43′43.5″N 109°11′55.7″E', coords: [109.19881, 11.72875] as [number, number], time: '23-24/8/2026 (bùng lại trưa 24/8)', note: '~100 người + quân đội · nguyên nhân ban đầu: đốt thực bì', press: 'UBND xã Hoài Ân (Tiền Phong 24/8/2026)' },
  { name: 'Cháy núi Vũng Chua TK330b/330c (4,23ha)', place: 'KP12, P. Quy Nhơn Nam · 13°44′25″N 109°11′30″E', coords: [109.19167, 13.74028] as [number, number], time: '27/8/2026 (đo đạc 30/8)', note: 'Thực bì dưới bạch đàn · dốc đứng, xe CC không vào được · 500+ người + flycam quét băng cản lửa', press: '<a href="https://baogialai.com.vn/hon-500-nguoi-tham-gia-dap-tat-chay-rung-tai-phuong-quy-nhon-nam-post596298.html" target="_blank">Báo Gia Lai: 500 người dập cháy Quy Nhơn Nam</a> · <a href="https://gialai.dcs.vn/an-ninh-quoc-phong/-/view-content/609439/hon-500-nguoi-tham-gia-dap-tat-chay-rung-tai-phuong-quy-nhon-nam" target="_blank">Cổng ĐCS Gia Lai</a> · <a href="https://www.vietnam.vn/en/giai-cuu-hai-nguoi-mac-ket-tren-dinh-nui-trong-vu-chay-rung-o-quy-nhon" target="_blank">Vietnam.vn: giải cứu 2 người mắc kẹt</a>' },
]
// Cháy nhà/cơ sở dân sự 2025-2026 — icon 🏠/🏭 xanh, phân biệt cháy rừng 🔥
const CIV_FIRES = [
  { kind: '🏠', name: 'Cháy nhà dân (phóng hỏa, ~300tr)', place: 'Thôn Cảnh An, xã Tuy Phước Tây · 13°52′15″N 109°06′10″E', coords: [109.10278, 13.87083] as [number, number], time: '26/8/2026', note: 'Thiệt hại tài sản ~300 triệu' },
  { kind: '🏭', name: 'Cháy nhà xưởng Cty Tân Đại Hưng', place: 'Lô B6.0 KCN Nhơn Hội, P. Quy Nhơn Đông · 13°48′45″N 109°14′10″E', coords: [109.23611, 13.8125] as [number, number], time: '26/4/2026', note: 'Cháy lớn nhà xưởng công ty' },
  { kind: '🏠', name: 'Cháy nhà dân (2 trẻ tử vong)', place: 'Thôn 5 (110 QL25), xã Chư Sê · 13°39′21″N 108°08′44″E', coords: [108.14556, 13.65583] as [number, number], time: '21/3/2026', note: 'Tử vong do ngạt khói' },
  { kind: '🏠', name: 'Sự cố nghĩa trang Pleiku', place: 'P. Diên Hồng, TP Pleiku · 13°58′35″N 107°59′45″E', coords: [107.99583, 13.97639] as [number, number], time: '24/12/2025', note: 'Phát hiện thi thể bốc cháy' },
  { kind: '🏠', name: 'Cháy tiệm spa (nghi phóng hỏa)', place: 'Đường Đỗ Trạc, P. An Khê · 13°57′10″N 108°40′20″E', coords: [108.67222, 13.95278] as [number, number], time: '19/10/2025', note: '1 tử vong, 3 bị thương' },
  { kind: '🏠', name: 'Cháy nhà nội đô', place: '33 đường 31/3, P. Quy Nhơn · 13°46′12″N 109°13′05″E', coords: [109.21806, 13.77] as [number, number], time: '14/12/2025', note: 'Khống chế kịp thời' },
  { kind: '🏠', name: 'Cháy nhà liền kề', place: 'Xã Yang Nam, H. Kông Chro · 13°32′40″N 108°33′15″E', coords: [108.55417, 13.54444] as [number, number], time: '8/5/2025', note: 'Thiệt hại lớn tài sản' },
]
// Vùng trọng điểm cháy rừng Phù Cát — marker cam, chưa cháy nhưng cảnh báo cao
const RISK_ZONES = [
  { name: 'Trọng điểm: Núi Lỗ Gáo, Mũi Đá Mỏ', place: 'Thôn Chánh Thắng, xã Cát Thành · 14°02′30″N 109°10′45″E', coords: [109.17917, 14.04167] as [number, number], note: 'Rừng trồng kinh tế, dốc nhiều đá, còn bom mìn sót lại · từng cháy 133ha', press: '<a href="https://baogialai.com.vn/chay-133-ha-rung-trong-o-xa-cat-thanh-post520560.html" target="_blank">Báo Gia Lai: cháy 133ha Cát Thành</a>' },
  { name: 'Trọng điểm: Dốc đèo Cách Thử', place: 'Thôn Trung Lương, xã Cát Hải · 13°57′12″N 109°15′00″E', coords: [109.25, 13.95333] as [number, number], note: 'Ven biển gió rất mạnh, thảm thực vật dễ bén lửa mùa hanh khô', press: '<a href="https://thuonghieucongluan.com.vn/binh-dinh-lai-them-mot-vu-hoa-hoan-a195513.html" target="_blank">Thương hiệu & Công luận</a>' },
  { name: 'Trọng điểm: Núi Bà & Hồ Suối Chay', place: 'Xã Cát Trinh · 13°58′40″N 109°04′55″E', coords: [109.08194, 13.97778] as [number, number], note: 'Rừng PH đầu nguồn, 68+ đỉnh, thảm thực vật dày', press: '<a href="https://mgmcar.com/ho-suoi-chay.html" target="_blank">Hồ Suối Chay</a>' },
  { name: 'Trọng điểm: rừng trồng Ia Ko – Ia Le', place: 'H. Chư Pưh · 13°20′00″N 107°58′00″E', coords: [107.96667, 13.33333] as [number, number], note: 'Rừng trồng ven biên giới, báo động cấp V các tháng 1-4 hàng năm', press: 'Báo Gia Lai EN (PCCCR đầu mùa khô)' },
  { name: 'Trọng điểm: rừng Phú Thiện', place: 'Phú Thiện · 13°35′15″N 108°07′30″E', coords: [108.125, 13.5875] as [number, number], note: 'Điểm nhiệt VIIRS lẻ tẻ do đốt dọn nương rẫy sát bìa rừng', press: 'Global Forest Watch' },
]

// Kịch bản DEMO: đủ hiện tượng tutorial — 1 điểm ĐANG CHÁY + 3 điểm NGHI NGỜ
const DEMO_ALERTS = [
  { village: 'Xã Hội Sơn', commune: 'Xã Hội Sơn', village_coords: [108.68, 13.92], fire_coords: [108.69, 13.93], distance_km: 2.4, acq_date: new Date().toISOString().slice(0, 10), confidence: 'h', level: 'CẢNH BÁO' },
  { village: 'Thôn Trung Tâm', commune: 'Xã Hội Sơn', village_coords: [108.68, 13.92], fire_coords: [108.75, 13.95], distance_km: 9.1, acq_date: new Date().toISOString().slice(0, 10), confidence: 'n', level: 'THEO DÕI' },
  { village: 'Xã Kông Bờ La', commune: 'Huyện Kbang', village_coords: [108.55, 14.10], fire_coords: [108.60, 14.12], distance_km: 12.6, acq_date: new Date().toISOString().slice(0, 10), confidence: 'n', level: 'THEO DÕI' },
  { village: 'Xã Đak Trôi', commune: 'Huyện Mang Yang', village_coords: [108.20, 14.02], fire_coords: [108.25, 14.05], distance_km: 15.3, acq_date: new Date().toISOString().slice(0, 10), confidence: 'n', level: 'THEO DÕI' },
]

const API = API_BASE.replace(/[\r\n]/g, "").trim().replace(/\/$/, "")
const TILE_FIX = (url: string) => url.replace(/[\r\n]/g, "").trim()

// (Trạm cố định đã thay bằng điểm CẤP cháy từng xã — vector, không lệch khi zoom)

export default function MapView({ onSelect }: { onSelect?: (type:string, id:string)=>void }) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect
  const [_base] = useState<'streets'|'satellite'>('streets')
  void _base
  // Priority 1: Default Esri World Imagery (ổn định nhất) — không google_s
  const [baseXyz, setBaseXyz] = useState<string>('esri')
  const [activeSat, setActiveSat] = useState<Record<string, boolean>>({})
  const [dateRange, setDateRange] = useState<'latest'|'7d'|'30d'|'3m'|'custom'>('30d')
  const [cloud, setCloud] = useState(20)
  const [info, setInfo] = useState<any>(null)
  const [pixel] = useState<any>(null)
  void pixel
  const [liveStatus, setLiveStatus] = useState<'LIVE'|'CACHED'|'STALE'|'CONFIGURATION_REQUIRED'|'UNAVAILABLE'|'DEMO'>('UNAVAILABLE')
  const [now, setNow] = useState(new Date())
  const [tickerIdx, setTickerIdx] = useState(0)
  const [showLayers, setShowLayers] = useState(false)
  const communesRef = useRef<any>(null)
  const communeFireClickRef = useRef<any>(null)
  const [communesCount, setCommunesCount] = useState<number>(0)
  const [communesError, setCommunesError] = useState<string>('')
  // Cấp cháy từng xã: 'live' = API trả đủ, 'degraded' = API fail/thiếu —
  // KHÔNG bao giờ hiển thị số mặc định như dữ liệu thật.
  const [levelsState, setLevelsState] = useState<'loading'|'live'|'degraded'>('loading')
  const [search, setSearch] = useState('')
  const [suggests, setSuggests] = useState<any[]>([])
  const { state: locState, request: requestLoc } = useLocation()

  // URL tài sản tương thích cả Vercel (/) và GitHub Pages (/gialai-ecochain/)
  const assetUrl = (f:string)=>{
    const b = ((import.meta as any).env?.BASE_URL || '/') as string
    return (b.endsWith('/') ? b : b + '/') + f
  }
  // Tìm không dấu: "phu my" vẫn ra "Phù Mỹ" (giống API /search/global)
  const normVi = (s:string)=> (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  // Cache-buster cho geojson tĩnh — tăng GEOJSON_V mỗi lần regenerate để diệt CDN/browser cache cũ
  const GEOJSON_V = 'v4'
  const fetchJson = async (files:string[])=>{
    let last:any = null
    for(const f of files){
      const busted = f.includes('?') ? f : `${f}?v=${GEOJSON_V}`
      for(const u of [assetUrl(busted), busted, '/' + busted]){
        try{ const r = await fetch(u); if(r.ok) return await r.json() }catch(e){ last = e }
      }
    }
    throw last || new Error('fetch failed: ' + files.join(','))
  }
  // Lớp nền raster luôn nằm dưới cùng (trước layer vector thấp nhất hiện có)
  const bottomLayerId = (map:any)=>{
    for(const id of ['boundary-fill','boundary','communes-fill']) try{ if(map.getLayer(id)) return id }catch{}
    return undefined
  }
  const LEVEL_VI: Record<string,string> = { I:'Thấp', II:'Trung bình', III:'Cao', IV:'Nguy hiểm', V:'Cực kỳ nguy hiểm' }
  const hazardVi = (t:string)=> ({ FIRE:'Cháy', FLOOD:'Lũ', LANDSLIDE:'Sạt lở', DROUGHT:'Hạn', HEAT:'Nắng nóng', STORM:'Bão' } as any)[t] || t
  const LEVEL_COLOR: Record<string,string> = { I:'#0EA5E9', II:'#10B981', III:'#F59E0B', IV:'#F97316', V:'#DC2626' }
  // Popup xã + chẩn đoán AI vệ tinh (I-V) — mở ngay, AI điền sau
  const communePopup = async (f:any, lngLat:any, map:any)=>{
    const base = `<div style="font-family:Inter,sans-serif"><b>${f.ten_xa||''}</b><br/><span style="font-size:11px;color:#64748B">mã ${f.ma_xa||''} · ${f.dtich_km2||''} km² · dân số ${f.dan_so||''}</span>`
    const popup = new (maplibregl as any).Popup({ closeButton:true, maxWidth:'320px' }).setLngLat(lngLat).setHTML(base + `<br/>⏳ AI vệ tinh đang chẩn đoán...</div>`).addTo(map)
    window.dispatchEvent(new CustomEvent('ecochain-select-area', { detail:{ area: f.ten_xa } }))
    onSelectRef.current?.('commune', f.ten_xa || ('ma-' + f.ma_xa))
    try{
      const [fr, ds] = await Promise.all([
        fetch(TILE_FIX(`${API}/api/fire/risk?administrative_unit_id=${encodeURIComponent(f.ten_xa||('ma-'+f.ma_xa))}&lat=${lngLat[1].toFixed(4)}&lon=${lngLat[0].toFixed(4)}`)).then(r=>r.json()).catch(()=> null),
        fetch(TILE_FIX(`${API}/api/disaster/summary?administrative_unit_id=${encodeURIComponent(f.ten_xa||('ma-'+f.ma_xa))}&lat=${lngLat[1].toFixed(4)}&lon=${lngLat[0].toFixed(4)}`)).then(r=>r.json()).catch(()=> null),
      ])
      if(!fr) throw new Error('unavailable')
      const j = fr
      const lv = j.warning_level || 'I', c = LEVEL_COLOR[lv] || '#64748B'
      const ev = j.evidence || {}
      const n = Array.isArray(ev.hotspots) ? ev.hotspots.length : (ev.hotspots ?? 0)
      const sigs = (ds?.signals || []).filter((s:any)=> s.risk_type !== 'FIRE').slice(0,4)
      const sigHtml = sigs.length ? `<div style="font-size:11px;color:#334155;margin-top:4px">🛡️ Đa thiên tai (DisasterGuard): ${sigs.map((s:any)=> `${hazardVi(s.risk_type)} <b>${s.score}</b>`).join(' · ')}</div>` : ''
      const miss = Array.isArray(j.missing) && j.missing.length ? `<div style="font-size:10px;color:#B45309;margin-top:2px">Thiếu: ${j.missing.join(', ')} — tin cậy đã hạ tương ứng</div>` : ''
      popup.setHTML(base + `<br/><div style="margin-top:6px;display:flex;gap:6px;align-items:center"><span style="background:${c};color:#fff;font-weight:800;font-size:12px;padding:2px 10px;border-radius:999">CẤP ${lv} · ${LEVEL_VI[lv]||''}</span><span style="font-size:11px">Risk <b>${j.risk_score ?? '?'}/100</b></span><span style="font-size:10px;background:${j.status==='LIVE'?'#DCFCE7':'#FEF3C7'};padding:2px 6px;border-radius:999">${j.status||''}</span></div><div style="font-size:11px;color:#334155;margin-top:4px">🛰️ NDVI ${ev.satellite?.ndvi ?? '?'} · ${ev.weather?.temperature ?? '?'}°C · FIRMS ${n} điểm · Tin cậy ${j.confidence ?? '?'}%</div>${sigHtml}${miss}<div style="font-size:10px;color:#64748B">${Object.keys(j.factors||{}).join(', ')}</div></div>`)
    }catch{ popup.setHTML(base + `<br/><span style="font-size:11px;color:#B45309">AI chưa kết nối (UNAVAILABLE) — thử lại sau</span></div>`) }
  }
  const communeBounds = (feat:any)=>{
    let minx=1e9, miny=1e9, maxx=-1e9, maxy=-1e9
    const walk=(c:any)=>{ if(typeof c[0]==='number'){ if(c[0]<minx)minx=c[0]; if(c[0]>maxx)maxx=c[0]; if(c[1]<miny)miny=c[1]; if(c[1]>maxy)maxy=c[1] } else c.forEach(walk) }
    walk(feat.geometry.coordinates)
    return [[minx,miny],[maxx,maxy]]
  }
  const selectCommune = (props:any)=>{
    const map = mapRef.current
    if(!map || !communesRef.current) return
    const feat = communesRef.current.features?.find((f:any)=> String(f.properties?.ma_xa)===String(props.ma_xa))
    // Unit without boundary (e.g. Phường Thống Nhất — polygon pending):
    // don't crash, explain honestly instead of flying nowhere.
    if(!feat || !feat.geometry){
      void new (maplibregl as any).Popup({ closeButton:true, maxWidth:'300px' })
        .setLngLat(map.getCenter() as any)
        .setHTML(`<div style="font-family:Inter,sans-serif"><b>${props.ten_xa || props.name || ''}</b><br/><span style="font-size:11px;color:#B45309">Chưa có ranh giới trên bản đồ — đang bổ sung polygon.</span></div>`)
        .addTo(map)
      setSuggests([]); setSearch(props.ten_xa||'')
      return
    }
    try{
      map.fitBounds(communeBounds(feat) as any, { padding:40, duration:800 })
      const cx=(communeBounds(feat)[0][0]+communeBounds(feat)[1][0])/2, cy=(communeBounds(feat)[0][1]+communeBounds(feat)[1][1])/2
      communePopup(feat.properties, [cx,cy], map)
    }catch{}
    setSuggests([]); setSearch(props.ten_xa||'')
  }

  // THEO DÕI một điểm nghi ngờ: bay tới vị trí cháy + kiểm tra Sentinel-2 + model đã chạy chưa
  const watchFire = async (a:any)=>{
    const map = mapRef.current
    const flon = a.fire_coords?.[0], flat = a.fire_coords?.[1]
    if(map && flon && flat){
      try{ map.flyTo({ center:[flon, flat], zoom:12, duration:1200 }) }catch{}
      try{
        void new (maplibregl as any).Popup({ closeButton:true, maxWidth:'320px' })
          .setLngLat([flon, flat] as any)
          .setHTML(`<div style="font-family:Inter,sans-serif; min-width:220px"><b>🔥 Điểm nhiệt gần ${a.village || ''}</b><br/>${a.commune || ''} · cách ${a.distance_km ?? '?'}km<br/>🕒 ${a.acq_date || ''} · Tin cậy ${a.confidence || '?'}<br/>📍 ${Number(flat).toFixed(4)}, ${Number(flon).toFixed(4)}</div>`)
          .addTo(map)
      }catch{}
    }
    onSelectRef.current?.('watch', a.village || a.commune || '')
    window.dispatchEvent(new CustomEvent('ecochain-select-area', { detail:{ area: a.village || a.commune } }))
    setInfo({ layer:'watch', status:'ANALYZING', source:'FIRMS + Sentinel-2 + FireRisk', village:a.village, commune:a.commune,
      fire:{ lon:flon, lat:flat, date:a.acq_date, distance_km:a.distance_km, confidence:a.confidence } })
    let sentinel:any = { status:'UNAVAILABLE' }
    try{
      if(flon && flat){
        const d=0.05
        const r=await fetch(TILE_FIX(`${API}/api/v1/satellite/ndvi?bbox=${flon-d},${flat-d},${flon+d},${flat+d}`))
        const j=await r.json()
        sentinel={ status:j.status, source:j.source || 'Sentinel Hub', ndvi:j.ndvi, acquired:j.acquired || j.acquired_at, reason:j.reason }
      }
    }catch(e){ sentinel={ status:'UNAVAILABLE', reason:String(e) } }
    let model:any = { status:'UNAVAILABLE' }
    try{
      const r=await fetch(TILE_FIX(`${API}/api/fire/risk?administrative_unit_id=${encodeURIComponent(a.commune || a.village || '')}&lat=${flat || 13.9}&lon=${flon || 108.3}`))
      const j=await r.json()
      model={ status:j.status, risk_score:j.risk_score, warning_level:j.warning_level, label:j.label, confidence:j.confidence }
    }catch(e){ model={ status:'UNAVAILABLE', reason:String(e) } }
    setInfo((prev:any)=> prev && prev.layer==='watch'
      ? { ...prev, status: model.status && model.status !== 'UNAVAILABLE' ? model.status : 'CACHED', sentinel, model }
      : prev)
  }

  // Header search → fly to commune / coords
  useEffect(()=>{
    const h = (e:any)=>{
      const d = e.detail || {}
      const map = mapRef.current
      try{
        const feats = communesRef.current?.features || []
        const q = normVi(String(d.name || ''))
        const f = feats.find((x:any)=>{
          const n = normVi(String(x.properties?.ten_xa || ''))
          return n && (n.includes(q) || (q && n.startsWith(q.slice(0, 6))))
        })
        if(f && map){ selectCommune(f.properties); return }
      }catch{}
      if(d.lat && d.lng && map){
        try{
          map.flyTo({ center:[d.lng, d.lat], zoom:12, duration:1200 })
          void new (maplibregl as any).Popup({ closeButton:true, maxWidth:'300px' })
            .setLngLat([d.lng, d.lat] as any)
            .setHTML(`<div style="font-family:Inter,sans-serif"><b>${d.name || 'Vị trí'}</b><br/><span style="font-size:11px;color:#64748B">${d.level || d.type || ''} · ${d.lat}, ${d.lng}</span></div>`)
            .addTo(map)
        }catch{}
        window.dispatchEvent(new CustomEvent('ecochain-select-area', { detail:{ area: d.name } }))
        onSelectRef.current?.('search', d.name || '')
      }
    }
    window.addEventListener('ecochain-search' as any, h)
    return ()=> window.removeEventListener('ecochain-search' as any, h)
  },[])

  // Ticker chạy bằng DỮ LIỆU THẬT (cảnh báo chính thức + alerts đang hoạt động).
  // Không còn tin mẫu cứng ("Trạm An Khê gửi chỉ số...") — chưa tải được thì
  // hiện đúng một dòng "đang kết nối", không bịa tin.
  const [tickerLines, setTickerLines] = useState<string[]>(['⏳ Đang kết nối dữ liệu trực tiếp…'])
  useEffect(()=>{
    Promise.all([
      fetch(`${API}/api/fire/warnings`).then(r=> r.ok ? r.json() : []).catch(()=> []),
      api.alertList('ACTIVE').catch(()=> []),
    ]).then(([warns, alerts]: any[])=>{
      const lines: string[] = []
      ;(Array.isArray(warns) ? warns : []).slice(0,3).forEach((w:any)=>{
        const scope = String(w.scope || '').split(';')[0].slice(0, 80)
        lines.push(`🔥 CẤP ${w.level || '?'} — ${scope} (${String(w.source || '').slice(0, 32)})`)
      })
      ;(Array.isArray(alerts) ? alerts : []).slice(0,3).forEach((a:any)=>{
        lines.push(`⚠ ${a.title || 'Cảnh báo'} — ${a.administrative_unit_id || ''}`)
      })
      if(lines.length) setTickerLines(lines)
      else setTickerLines(['✓ Không có cảnh báo cháy đang hoạt động — hệ thống vẫn giám sát'])
    }).catch(()=> {})
  },[])

  useEffect(()=>{
    const id=setInterval(()=> setNow(new Date()), 1000)
    return ()=> clearInterval(id)
  },[])
  useEffect(()=>{
    const id=setInterval(()=> setTickerIdx(i=> (i+1)%tickerLines.length), 3500)
    return ()=> clearInterval(id)
  },[])

  const dateParams = ()=>{
    const d=new Date()
    const fmt=(x:Date)=> x.toISOString().slice(0,10)
    if(dateRange==='latest') return { start: fmt(new Date(d.getTime()-30*24*3600*1000)), end: fmt(d) }
    if(dateRange==='7d') return { start: fmt(new Date(d.getTime()-7*24*3600*1000)), end: fmt(d) }
    if(dateRange==='30d') return { start: fmt(new Date(d.getTime()-30*24*3600*1000)), end: fmt(d) }
    if(dateRange==='3m') return { start: fmt(new Date(d.getTime()-90*24*3600*1000)), end: fmt(d) }
    return { start:'2026-08-01', end:'2026-09-01' }
  }

  // XYZ Tile URLs — Esri mặc định, OSM fallback, không Google làm default
  const XYZ_TILES: Record<string, { url: string, attribution: string }> = {
    esri: { url: TILE_FIX('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'), attribution: '© Esri World Imagery' },
    osm: { url: TILE_FIX('https://tile.openstreetmap.org/{z}/{x}/{y}.png'), attribution: '© OpenStreetMap' },
    eox: { url: TILE_FIX('https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg'), attribution: '© EOX Sentinel-2 cloudless' },
  }
  const DEFAULT_TILE_URL = XYZ_TILES.esri.url
  void DEFAULT_TILE_URL
  // ⚠️ BẮT BUỘC 2: Dùng Style miễn phí KHÔNG CẦN API KEY của CARTO/OSM
  const baseStyles: Record<string, string> = {
    streets: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
    satellite: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
    terrain: 'https://demotiles.maplibre.org/style.json',
  }
  void baseStyles

  const fetchTile = async (layer:string)=>{
    const { start, end } = dateParams()
    const bounds = mapRef.current ? mapRef.current.getBounds() : null
    const params = new URLSearchParams({ layer, lat:'13.85', lon:'108.50', start, end, cloud: String(cloud) })
    if(bounds){
      params.set('north', String(bounds.getNorth())); params.set('south', String(bounds.getSouth()))
      params.set('east', String(bounds.getEast())); params.set('west', String(bounds.getWest()))
    }
    try{
      const r=await fetch(TILE_FIX(`${API}/api/satellite/tile/${layer}?${params}`))
      if(!r.ok) throw new Error('GEE Service chưa sẵn sàng')
      const j=await r.json()
      if(j.tile_url) j.tile_url = TILE_FIX(j.tile_url)
      return j
    }catch(e){
      console.warn(`Lớp ${layer} chưa khả dụng (Chế độ Fallback BaseMap):`, e)
      return { status:'UNAVAILABLE', error:String(e) }
    }
  }

  // 🛡️ Fallback chống sập khi Backend GEE trả về CONFIGURATION_REQUIRED — strip \r\n
  const addGEETileLayer = async (layerId: string, tileType: string) => {
    const map = mapRef.current
    if (!map) return
    try {
      const res = await fetch(TILE_FIX(`${API}/api/satellite/tile/${tileType}?layer=${tileType}&lat=13.85&lon=108.5&start=2026-08-10&end=2026-09-03&cloud=20`))
      if (!res.ok) throw new Error('GEE Service chưa sẵn sàng')
      const data = await res.json()
      if (data.tile_url) {
        const url = TILE_FIX(data.tile_url)
        if (map.getSource(layerId)) {
          (map.getSource(layerId) as maplibregl.RasterTileSource).setTiles([url])
        } else {
          map.addSource(layerId, { type:'raster', tiles:[url], tileSize:256 })
          map.addLayer({ id:layerId, type:'raster', source:layerId, paint:{ 'raster-opacity': 0.8 } })
        }
      }
    } catch (err) {
      console.warn(`Lớp ${tileType} chưa khả dụng (Chế độ Fallback BaseMap):`, err)
    }
  }
  void addGEETileLayer

  const switchBaseXyz = (id: string)=>{
    setBaseXyz(id)
  }

  // Effect 2 — đổi basemap không destroy map (tránh race)
  useEffect(()=>{
    const map = mapRef.current
    if(!map) return
    if(!map.isStyleLoaded()) {
      map.once('load', ()=> switchBaseXyz(baseXyz))
      return
    }
    const sourceId = "base-xyz"
    const layerId = "base-xyz"
    if(map.getLayer(layerId)) try{ map.removeLayer(layerId)}catch{}
    if(map.getSource(sourceId)) try{ map.removeSource(sourceId)}catch{}
    if(baseXyz==='carto') return
    const tile = XYZ_TILES[baseXyz]
    if(!tile) return
    // Fallback Esri → OSM → static — nền luôn nằm DƯỚI vector (boundary/communes)
    const before = bottomLayerId(map)
    try{
      map.addSource(sourceId, { type:'raster', tiles:[TILE_FIX(tile.url)], tileSize:256, attribution: tile.attribution } as any)
      if(before) map.addLayer({ id: layerId, type:'raster', source: sourceId } as any, before)
      else map.addLayer({ id: layerId, type:'raster', source: sourceId } as any)
    }catch(e){
      console.warn('Base tile add failed, fallback OSM', e)
      const osm = XYZ_TILES.osm
      try{
        map.addSource(sourceId, { type:'raster', tiles:[osm.url], tileSize:256, attribution: osm.attribution } as any)
        if(before && map.getLayer(before)) map.addLayer({ id: layerId, type:'raster', source: sourceId } as any, before)
        else map.addLayer({ id: layerId, type:'raster', source: sourceId } as any)
      }catch{}
    }
  }, [baseXyz])

  const hotspotMarkers = useRef<any[]>([])
  const [hotCount, setHotCount] = useState(0)
  const [opacity, setOpacity] = useState(0.85)
  const applyOpacity = (v: number)=>{
    setOpacity(v)
    const map = mapRef.current
    if(!map) return
    for(const id of ['ndvi', 's1']){
      try{ if(map.getLayer(id)) map.setPaintProperty(id, 'raster-opacity', v) }catch{}
    }
  }
  const fitHotspots = ()=>{
    const map = mapRef.current
    const pts = hotspotMarkers.current
      .map((m:any)=> { try{ const l = m.getLngLat(); return [l.lng, l.lat] }catch{ return null } })
      .filter(Boolean) as [number, number][]
    if(map && pts.length){
      const lons = pts.map(p=> p[0]), lats = pts.map(p=> p[1])
      try{ map.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding:60, duration:1000 }) }catch{}
    }
  }
  const ndviValue = (n: any): number | null =>{
    if(typeof n === 'number') return n
    if(n && typeof n.mean === 'number') return n.mean
    return null
  }
  const toggleSat = async (key:string, geeLayer:string)=>{
    const checked = !activeSat[key]
    setActiveSat(s=> ({...s, [key]: checked}))
    if(!checked){
      if(key==='hotspot'){
        hotspotMarkers.current.forEach((m:any)=>{ try{ m.remove() }catch{} }); hotspotMarkers.current=[]
        setHotCount(0)
        setInfo(null)
        return
      }
      if(mapRef.current?.getLayer(key)) try{ mapRef.current.removeLayer(key) }catch{}
      if(mapRef.current?.getSource(key)) try{ mapRef.current.removeSource(key) }catch{}
      return
    }
    // Hotspot: FIRMS API — bypass Vercel cache real-time
    if(key==='hotspot'){
      try{
        const r=await fetch(TILE_FIX(`${API}/api/v1/hotspots/live?t=${Date.now()}`), { cache: 'no-store', headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' } })
        const data=await r.json()
        if(data.status==='LIVE' || data.status==='CACHED' || data.status==='DEMO'){
          const fires = data.fires || data.hotspots || []
          fires.slice(0,20).forEach((f:any)=>{
            const el=document.createElement('div')
            el.style.width='14px'; el.style.height='14px'; el.style.borderRadius='999px'; el.style.background='#DC2626'; el.style.border='2px solid #fff'; el.style.boxShadow='0 0 8px rgba(220,38,38,0.8)'; el.style.cursor='pointer'
            el.title='Điểm nóng cháy — bấm để xem chi tiết'
            const lng = f.longitude || f.lon || 108.3, lat = f.latitude || f.lat || 13.9
            const m=new (maplibregl as any).Marker({ element: el }).setLngLat([lng, lat] as any).addTo(mapRef.current)
            el.addEventListener('click', ()=>{
              const conf = String(f.confidence || 'n').toUpperCase()
              const confVi = conf.startsWith('H') ? 'Cao' : conf.startsWith('N') ? 'Thường' : conf.startsWith('L') ? 'Thấp' : conf
              void new (maplibregl as any).Popup({ closeButton:true, maxWidth:'320px' })
                .setLngLat([lng, lat] as any)
                .setHTML(`<div style="font-family:Inter,sans-serif; min-width:220px"><b>🔥 Điểm nóng cháy rừng</b><br/>Vệ tinh <b>${f.satellite || data.satellite || 'VIIRS'}</b> (${f.instrument || ''}) · Độ tin cậy <b>${confVi}</b><br/>🌡 Độ sáng <b>${f.brightness ?? '?'} K</b>${f.frp ? ` · Công suất bức xạ <b>${f.frp} MW</b>` : ''}<br/>🕒 Phát hiện: <b>${f.acq_date || ''} ${f.acq_time || ''}</b><br/>📍 ${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}<br/><span style="font-size:10px;color:#64748B">Nguồn: NASA FIRMS · ${data.status || ''} · Đây là điểm nhiệt vệ tinh, cần xác minh thực địa trước khi kết luận cháy</span></div>`)
                .addTo(mapRef.current)
              window.dispatchEvent(new CustomEvent('ecochain-select-area', { detail:{ area: `Điểm nóng ${Number(lat).toFixed(2)}, ${Number(lng).toFixed(2)}` } }))
              onSelectRef.current?.('hotspot', `${lat},${lng}`)
            })
            hotspotMarkers.current.push(m)
          })
          const displayStatus = data.status
          setHotCount(fires.slice(0,20).length)
          setLiveStatus(displayStatus as any); setInfo({ layer:'hotspot', status: displayStatus, source:'NASA FIRMS', satellite: data.satellite || 'VIIRS', acquired: data.date || fires[0]?.acq_date || data.acquired || new Date().toISOString().slice(0,10), date: data.date || new Date().toISOString().slice(0,10), count: fires.length, bbox: data.bbox })
        } else {
          console.warn('FIRMS chưa khả dụng:', data.reason || data.error)
          setInfo({ layer:'hotspot', status: data.status || 'UNAVAILABLE', source:'NASA FIRMS', reason: data.reason || data.error })
        }
      }catch(err){
        console.warn('FIRMS hotspot lỗi:', err)
        setInfo({ layer:'hotspot', status:'UNAVAILABLE', source:'NASA FIRMS', reason:String(err) })
      }
      return
    }
    // NDVI fallback: GEE tile UNAVAILABLE → Sentinel Hub NDVI stats
    if(key==='ndvi'){
      try{
        const res=await fetchTile(geeLayer)
        if(res.status==='LIVE' && res.tile_url && mapRef.current){
          if(mapRef.current?.getLayer(key)) try{ mapRef.current.removeLayer(key) }catch{}
          if(mapRef.current?.getSource(key)) try{ mapRef.current.removeSource(key) }catch{}
          mapRef.current.addSource(key, { type:'raster', tiles:[TILE_FIX(res.tile_url)], tileSize:256 })
          mapRef.current.addLayer({ id:key, type:'raster', source:key, paint:{ 'raster-opacity': 0.85 } } as any)
          setLiveStatus('LIVE'); setInfo({ layer: key, source: res.source || 'Sentinel-2', ...res, acquired: res.acquired || res.metadata?.acquired })
          return
        }
        // Fallback Sentinel Hub NDVI stats
        console.warn(`NDVI GEE UNAVAILABLE, fallback Sentinel Hub`, res.reason)
        const r2=await fetch(TILE_FIX(`${API}/api/v1/satellite/ndvi?bbox=107.0,12.9,109.6,15.0`))
        const j2=await r2.json()
        setInfo({ layer:'ndvi', status: j2.status || 'DEMO', source: j2.source || 'Sentinel Hub', satellite: j2.satellite, acquired: j2.acquired || j2.acquired_at || new Date().toISOString().slice(0,10), ndvi: j2.ndvi, reason: j2.reason, bbox: j2.bbox })
        return
      }catch(err){
        console.warn('NDVI fallback lỗi:', err)
        setInfo({ layer:'ndvi', status:'UNAVAILABLE', source:'Sentinel Hub', reason:String(err) })
        return
      }
    }
    try{
      const res=await fetchTile(geeLayer)
      if(res.status==='LIVE' && res.tile_url && mapRef.current){
        if(mapRef.current?.getLayer(key)) try{ mapRef.current.removeLayer(key) }catch{}
        if(mapRef.current?.getSource(key)) try{ mapRef.current.removeSource(key) }catch{}
        mapRef.current.addSource(key, { type:'raster', tiles:[TILE_FIX(res.tile_url)], tileSize:256 })
        mapRef.current.addLayer({ id:key, type:'raster', source:key, paint:{ 'raster-opacity': 0.85 } } as any)
        setLiveStatus('LIVE'); setInfo({ layer: key, source: res.source || 'Sentinel-2', ...res, acquired: res.acquired || res.metadata?.acquired })
      } else {
        console.warn(`Lớp ${geeLayer} chưa khả dụng (Fallback BaseMap):`, res.reason || res.error)
        setInfo({ layer: key, status: res.status || 'UNAVAILABLE', source: res.source || 'Sentinel-2', reason: res.reason || res.error, acquired: res.acquired || res.metadata?.acquired })
      }
    }catch(err){
      console.warn(`Lớp ${geeLayer} lỗi:`, err)
      setInfo({ layer: key, status:'UNAVAILABLE', reason:String(err) })
    }
  }

  const [sourceLive, setSourceLive] = useState<Record<string,string>>({})
  const [health, setHealth] = useState<any>(null)
  void health
  const [villages, setVillages] = useState<any[]>([])
  const [fireAlerts, setFireAlerts] = useState<any[]>([])
  const [mode, setMode] = useState<string>(() => getMode())
  const [tourOpen, setTourOpen] = useState(false)
  const [bannerOff, setBannerOff] = useState<string>('')
  const burning = fireAlerts.filter((a:any)=>a.level==='CẢNH BÁO')
  const suspicious = fireAlerts.filter((a:any)=>a.level!=='CẢNH BÁO')
  const burnKey = burning.map((a:any)=>a.village).join('|')
  // Trigger resize sau khi DOM mount (fix height 0)
  useEffect(()=>{
    if(!mapRef.current) return
    const t=setTimeout(()=> mapRef.current?.resize(), 300)
    return ()=> clearTimeout(t)
  }, [])
  // Hiển thị xã/thôn phân định + highlight 20km khi có cháy
  useEffect(()=>{
    if(!mapRef.current || !villages.length) return
    const existing = (mapRef.current as any)._villageMarkers as any[] || []
    existing.forEach((m:any)=>{ try{ m.remove()}catch{} })
    const markers:any[]=[]
    villages.forEach((v:any)=>{
      const alert = fireAlerts.find((a:any)=> a.village===v.village)
      const el=document.createElement('div')
      el.style.padding='4px 6px'; el.style.borderRadius='8px'; el.style.fontSize='10px'; el.style.fontWeight='700'
      el.style.background= alert ? (alert.level==='CẢNH BÁO' ? '#DC2626' : '#F59E0B') : 'rgba(255,255,255,0.95)'
      el.style.color= alert ? '#fff' : '#334155'; el.style.border= alert ? '2px solid #fff' : '1px solid #E2E8E5'
      el.style.boxShadow='0 2px 6px rgba(0,0,0,0.15)'; el.textContent= v.village
      if(alert) el.title=`${v.commune} — ${alert.distance_km}km từ điểm cháy ${alert.fire_coords?.join(',')} — ${alert.level}`
      const m=new (maplibregl as any).Marker({ element: el, anchor:'bottom' }).setLngLat(v.coords as any).addTo(mapRef.current!)
      markers.push(m)
      if(alert && !mapRef.current!.getSource(`circle-${v.id}`)){
        const circle={ type:'Feature', geometry:{ type:'Point', coordinates: v.coords }, properties:{ radius: 20 } }
        mapRef.current!.addSource(`circle-${v.id}`, { type:'geojson', data: circle })
        try{
          mapRef.current!.addLayer({ id:`circle-${v.id}`, type:'circle', source:`circle-${v.id}`, paint:{ 'circle-radius': 40, 'circle-color': alert.level==='CẢNH BÁO' ? '#DC2626' : '#F59E0B', 'circle-opacity': 0.12, 'circle-stroke-width': 2, 'circle-stroke-color': alert.level==='CẢNH BÁO' ? '#DC2626' : '#F59E0B' } })
        }catch{}
      }
    })
    ;(mapRef.current as any)._villageMarkers = markers
  }, [villages, fireAlerts])
  // Effect 1 — chỉ init map một lần — dùng inline style OSM để tránh CORS style JSON
  useEffect(()=>{
    if(!mapContainer.current || mapRef.current) return
    const inlineStyle: any = {
      version: 8,
      glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.p14',
      sources: {
        osm: { type:'raster', tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize:256, attribution:'© OpenStreetMap' }
      },
      layers: [{ id:'osm', type:'raster', source:'osm' }]
    }
    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: inlineStyle as any,
      center: [108.41, 13.85],
      zoom: 7.8,
      maxBounds: [[107.0, 11.5],[109.7, 15.1]],
      attributionControl: false,
    })
    // Fallback nếu style lỗi → dùng Esri Satellite (loại bỏ Google tiles: xám khi không key)
    map.on('error', (e:any)=>{
      if(e?.error?.message?.includes('style') || e?.styleURL?.includes('cartocdn')){
        console.warn('Style lỗi, fallback Esri Satellite', e)
        if(!map.getSource('base-xyz')){
          map.addSource('base-xyz', { type:'raster', tiles:['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize:256, attribution:'© Esri World Imagery' } as any)
          map.addLayer({ id:'base-xyz', type:'raster', source:'base-xyz' } as any)
        }
      }
    })
    mapRef.current = map as any
    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    // Toàn cảnh Gia Lai: bounds thực từ gialai_135.geojson [107.45,12.99,109.36,14.70]
    map.fitBounds([[107.45, 12.99], [109.36, 14.70]], { padding:30, duration:0 })
    map.addControl(new (maplibregl as any).AttributionControl({ compact:true }), 'bottom-left')
    map.on('load', ()=>{
      console.log('✅ MapLibre loaded successfully!')
      map.resize()
      // Thêm nền Google Satellite mặc định nếu baseXyz != carto
      if(baseXyz!=='carto' && !map.getSource('base-xyz')){
        const tile = XYZ_TILES[baseXyz]
        if(tile){
          map.addSource('base-xyz', { type:'raster', tiles:[tile.url], tileSize:256, attribution: tile.attribution } as any)
          map.addLayer({ id:'base-xyz', type:'raster', source:'base-xyz' } as any)
        }
      }
      // Ranh tỉnh Gia Lai thực (viền ngoài, không lỗ) — file nhẹ 26KB
      fetchJson(['gialai_province.geojson']).then((prov:any)=>{
        if(!map.getSource('gialai-boundary')){
          map.addSource('gialai-boundary', { type:'geojson', data: prov })
          map.addLayer({ id:'boundary-fill', type:'fill', source:'gialai-boundary', paint:{ 'fill-color':'#0F766E', 'fill-opacity':0.04 } })
          map.addLayer({ id:'boundary', type:'line', source:'gialai-boundary', paint:{ 'line-color':'#B91C1C', 'line-width':3, 'line-opacity':1 } })
          map.addLayer({ id:'province-label', type:'symbol', source:'gialai-boundary', layout:{ 'text-field':'TỈNH GIA LAI', 'text-size':16, 'text-font':['Open Sans ExtraBold','Arial Unicode MS Bold'] } as any, paint:{ 'text-color':'#B91C1C', 'text-halo-color':'#fff', 'text-halo-width':2 } })
        }
      }).catch(()=>{ // fallback bbox nếu thiếu file
        if(!map.getSource('gialai-boundary')){
          map.addSource('gialai-boundary', { type:'geojson', data:{ type:'Feature', geometry:{ type:'Polygon', coordinates:[[[107.0,12.9],[109.6,12.9],[109.6,15.0],[107.0,15.0],[107.0,12.9]]] }, properties:{} } })
          map.addLayer({ id:'boundary', type:'line', source:'gialai-boundary', paint:{ 'line-color':'#0F766E', 'line-width':1.5, 'line-opacity':0.5, 'line-dasharray':[4,4] } })
        }
      })
      // 135 xã: bản nhẹ 836KB trước, rớt mới tải bản full 3.8MB
      fetchJson(['gialai_135_light.geojson','gialai_135.geojson']).then(async (fc:any)=>{
        const feats = fc.features || []
        communesRef.current = fc
        setCommunesCount(feats.length)
        setCommunesError('')
        console.log(`✅ Đã tải ${feats.length} xã/phường Gia Lai`)
        if(!map.getSource('gialai-communes')){
          map.addSource('gialai-communes', { type:'geojson', data: fc })
          // Màu pastel phân biệt từng xã như ảnh mẫu baogialai — categorical theo ma_xa % 12
          const pastel = ['#fbb4ae','#b3cde3','#ccebc5','#decbe4','#fed9a6','#ffffcc','#e5d8bd','#fddaec','#f2f2f2','#b3e2cd','#cbd5e8','#e6f5c9'] as any
          const fillExpr = ['match', ['%', ['to-number', ['get','ma_xa']], 12], 0, pastel[0], 1, pastel[1], 2, pastel[2], 3, pastel[3], 4, pastel[4], 5, pastel[5], 6, pastel[6], 7, pastel[7], 8, pastel[8], 9, pastel[9], 10, pastel[10], pastel[11]] as any
          map.addLayer({ id:'communes-fill', type:'fill', source:'gialai-communes', paint:{ 'fill-color': fillExpr, 'fill-opacity': 0.85 } })
          map.addLayer({ id:'communes-line', type:'line', source:'gialai-communes', paint:{ 'line-color':'#ffffff', 'line-width':1.2, 'line-opacity':1 } })
          map.addLayer({ id:'communes-label', type:'symbol', source:'gialai-communes', minzoom:7.5, layout:{ 'text-field':['get','ten_xa'], 'text-size':11, 'text-allow-overlap':false, 'text-ignore-placement':false, 'text-font':['Open Sans Bold','Arial Unicode MS Bold'] } as any, paint:{ 'text-color':'#111', 'text-halo-color':'#fff', 'text-halo-width':1.5 } })
          map.on('click','communes-fill',(e:any)=>{
            const f=e.features?.[0]?.properties
            if(!f) return
            communePopup(f, e.lngLat, map)
          })
          // Mỗi xã 1 điểm CẤP cháy (vector — cố định khi zoom, bấm hiện mức độ)
          try{
            const pts = feats.map((ft:any)=>{
              let minx=1e9,miny=1e9,maxx=-1e9,maxy=-1e9
              const walk=(c:any)=>{ if(typeof c[0]==='number'){ if(c[0]<minx)minx=c[0]; if(c[0]>maxx)maxx=c[0]; if(c[1]<miny)miny=c[1]; if(c[1]>maxy)maxy=c[1] } else c.forEach(walk) }
              try{ walk(ft.geometry.coordinates) }catch{ return null }
              if(minx>maxx) return null
              return { ma:String(ft.properties?.ma_xa ?? ''), name:ft.properties?.ten_xa || '', lon:(minx+maxx)/2, lat:(miny+maxy)/2 }
            }).filter(Boolean)
            const rl = await fetch(TILE_FIX(`${API}/api/fire/commune-levels`), { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ units: pts.slice(0,200).map((p:any)=>({ id:p.ma, name:p.name, lat:p.lat, lon:p.lon })) }) })
            if(!rl.ok) throw new Error(`commune-levels HTTP ${rl.status}`)
            const rj = await rl.json()
            const byKey: Record<string,any> = {}
            ;(rj.levels || []).forEach((l:any)=>{ byKey[l.key]=l })
            // API thiếu/trả rỗng một phần => degraded: hiển thị "chưa có dữ liệu",
            // KHÔNG điền số mặc định giống nhau cho mọi xã.
            const liveCount = Object.keys(byKey).length
            const degraded = liveCount === 0 || (rj.failed || 0) > 0
            setLevelsState(degraded ? 'degraded' : 'live')
            const fcPts = { type:'FeatureCollection', features: pts.map((p:any)=>{
              const lv = byKey[p.ma] || byKey[p.name] || null
              return { type:'Feature', geometry:{ type:'Point', coordinates:[p.lon, p.lat] }, properties:{ ma_xa:p.ma, ten_xa:p.name, live: !!lv, level: lv?.level || '—', score: lv?.score ?? null, confidence: lv?.confidence ?? null } }
            }) }
            if(map.getSource('commune-fire-points')){ try{ map.removeLayer('commune-fire-label'); map.removeLayer('commune-fire'); map.removeSource('commune-fire-points') }catch{} }
            map.addSource('commune-fire-points', { type:'geojson', data: fcPts } as any)
            const lvColor = ['match',['get','level'],'I','#0EA5E9','II','#10B981','III','#F59E0B','IV','#F97316','V','#DC2626','#9CA3AF'] as any
            map.addLayer({ id:'commune-fire', type:'circle', source:'commune-fire-points', paint:{ 'circle-radius':11, 'circle-color':lvColor, 'circle-stroke-color':'#fff', 'circle-stroke-width':2 } } as any)
            map.addLayer({ id:'commune-fire-label', type:'symbol', source:'commune-fire-points', layout:{ 'text-field':['get','level'], 'text-size':10, 'text-font':['Open Sans Bold','Arial Unicode MS Bold'] } as any, paint:{ 'text-color':'#fff' } } as any)
            try{ if(communeFireClickRef.current) map.off('click','commune-fire',communeFireClickRef.current) }catch{}
            communeFireClickRef.current = (e:any)=>{
              const f=e.features?.[0]?.properties
              if(!f) return
              const body = f.live
                ? `Cấp cháy <b>CẤP ${f.level}</b> · Risk <b>${f.score}/100</b><br/><span style="font-size:11px;color:#64748B">Tin cậy ${f.confidence}% · AI tính theo từng xã · Nguồn: vệ tinh + thời tiết + FIRMS</span>`
                : `<span style="font-size:12px;color:#B45309;font-weight:700">Chưa có dữ liệu cấp cháy</span><br/><span style="font-size:11px;color:#64748B">API không phản hồi — bấm vào xã để chẩn đoán trực tiếp</span>`
              void new (maplibregl as any).Popup({ closeButton:true, maxWidth:'300px' })
                .setLngLat(e.lngLat)
                .setHTML(`<div style="font-family:Inter,sans-serif; min-width:200px"><b>${f.ten_xa}</b><br/>${body}</div>`)
                .addTo(map)
              window.dispatchEvent(new CustomEvent('ecochain-select-area', { detail:{ area: f.ten_xa } }))
              onSelectRef.current?.('commune-point', f.ten_xa)
            }
            map.on('click','commune-fire',communeFireClickRef.current)
          }catch(e){ console.warn('Không tải được CẤP cháy từng xã', e); setLevelsState('degraded') }
        }
      }).catch(e=>{ console.warn('Không tải được ranh xã', e); setCommunesError('Không tải được ranh xã — kiểm tra file public/') })
      // (Điểm trạm HTML đã bỏ — thay bằng lớp điểm CẤP từng xã bên dưới)
      // Vùng trọng điểm — marker cam ⚠, phân biệt điểm từng cháy (đen/vàng)
      RISK_ZONES.forEach(h=>{
        const el=document.createElement('div')
        el.style.width='24px'; el.style.height='24px'; el.style.borderRadius='999px'; el.style.display='grid'; el.style.placeItems='center'
        el.style.background='#F59E0B'; el.style.color='#fff'; el.style.fontSize='13px'; el.style.border='2px solid #fff'; el.style.cursor='pointer'
        el.textContent='⚠'; el.title=`${h.name} — ${h.place} (trọng điểm)`
        el.addEventListener('click', ()=>{
          new (maplibregl as any).Popup({ closeButton:true, maxWidth:'320px' }).setLngLat(h.coords as any)
            .setHTML(`<div style="font-family:Inter,sans-serif"><b>${h.name}</b><br/>${h.place}<br/><span style="font-size:11px;color:#92400E">🟠 TRỌNG ĐIỂM — ${h.note}</span><br/><span style="font-size:10px;color:#64748B">📰 ${h.press}</span></div>`).addTo(map)
        })
        new (maplibregl as any).Marker({ element: el }).setLngLat(h.coords as any).addTo(map)
      })
      // Điểm từng cháy — marker đen/xám + ghi chú, phân biệt điểm nóng FIRMS live
      HIST_FIRES.forEach(h=>{
        const el=document.createElement('div')
        el.style.width='24px'; el.style.height='24px'; el.style.borderRadius='999px'; el.style.display='grid'; el.style.placeItems='center'
        el.style.background='#1F2937'; el.style.color='#FBBF24'; el.style.fontSize='13px'; el.style.border='2px solid #FBBF24'; el.style.cursor='pointer'
        el.textContent='🔥'; el.title=`${h.name} — ${h.place} (từng cháy)`
        el.addEventListener('click', ()=>{
          const hAny = h as any
          new (maplibregl as any).Popup({ closeButton:true, maxWidth:'320px' }).setLngLat(h.coords as any)
            .setHTML(`<div style="font-family:Inter,sans-serif"><b>${h.name}</b><br/>${h.place}<br/><span style="font-size:12px;color:#B91C1C;font-weight:700">🕒 ${hAny.time||''}</span><br/><span style="font-size:11px;color:#92400E">⚠ TỪNG CHÁY — ${h.note}</span><br/><span style="font-size:10px;color:#64748B">📰 Bài báo: ${hAny.press||'—'}</span></div>`).addTo(map)
        })
        new (maplibregl as any).Marker({ element: el }).setLngLat(h.coords as any).addTo(map)
      })
      // Cháy nhà/cơ sở — marker xanh 🏠/🏭, popup thời gian + ghi chú (tọa độ ước tính trung tâm)
      CIV_FIRES.forEach(h=>{
        const el=document.createElement('div')
        el.style.width='24px'; el.style.height='24px'; el.style.borderRadius='999px'; el.style.display='grid'; el.style.placeItems='center'
        el.style.background='#1E40AF'; el.style.fontSize='13px'; el.style.border='2px solid #fff'; el.style.cursor='pointer'
        el.textContent=h.kind; el.title=`${h.name} — ${h.place} (cháy nhà/cơ sở)`
        el.addEventListener('click', ()=>{
          new (maplibregl as any).Popup({ closeButton:true, maxWidth:'300px' }).setLngLat(h.coords as any)
            .setHTML(`<div style="font-family:Inter,sans-serif"><b>${h.kind} ${h.name}</b><br/>${h.place}<br/><span style="font-size:12px;color:#1E40AF;font-weight:700">🕒 ${h.time}</span><br/><span style="font-size:11px;color:#334155">${h.note}</span><br/><span style="font-size:10px;color:#64748B">Tọa độ ước tính trung tâm khu vực (bảo mật GPS thô)</span></div>`).addTo(map)
        })
        new (maplibregl as any).Marker({ element: el }).setLngLat(h.coords as any).addTo(map)
      })
      // Giữ toàn cảnh tỉnh — không auto zoom vào xã; chỉ fit lại sau khi tải communes
      map.once('idle', ()=> map.fitBounds([[107.45, 12.99], [109.36, 14.70]], { padding:30, duration:0 }))
    })
    return () => { map.remove(); (mapRef as any).current = null }
  }, [])

  useEffect(()=>{
    if(locState.status==='granted' && mapRef.current && locState.lon && locState.lat){
      mapRef.current.flyTo({ center:[locState.lon, locState.lat], zoom:11, duration:1200 } as any)
      try{ new (maplibregl as any).Marker({color:'#0F766E'}).setLngLat([locState.lon, locState.lat]).addTo(mapRef.current) }catch{}
    }
  }, [locState])

  useEffect(()=>{
    fetch(`${API}/api/health/geospatial`).then(r=>r.json()).then(j=>{
      setSourceLive({ sentinel2: j.sentinel2?.status || 'UNAVAILABLE', firms: j.firms?.status || 'UNAVAILABLE', gee: j.gee?.status || 'UNAVAILABLE' })
      setHealth(j)
      const overall = j.summary?.all_live ? 'LIVE' : (j.firms?.status==='CONFIGURATION_REQUIRED' ? 'CONFIGURATION_REQUIRED' : 'UNAVAILABLE')
      setLiveStatus(overall as any)
    }).catch(()=> setLiveStatus('UNAVAILABLE'))
    // Xã/thôn delineation
    fetch(`${API}/api/villages`).then(r=>r.json()).then(v=> setVillages(v)).catch(()=>{})
    // Chế độ DEMO/LIVE + tour tutorial
    const onMode=(e:any)=>{
      const m=e.detail?.mode||getMode()
      setMode(m)
      if(m==='demo'){ setFireAlerts(DEMO_ALERTS as any[]); try{ if(!sessionStorage.getItem('ecogl_tour_done')) setTourOpen(true) }catch{ setTourOpen(true) } }
      else { setTourOpen(false); loadAlerts() }
    }
    const onTour=(e:any)=>{
      const a=e.detail?.action
      if(a==='burning' && mapRef.current) mapRef.current.flyTo({ center:[108.68, 13.92], zoom:11, duration:1000 } as any)
      if(a==='layers') setShowLayers(true)
      if(a==='hotspot') toggleSat('hotspot','VIIRS_SNPP_NRT')
    }
    window.addEventListener('ecochain-mode', onMode)
    window.addEventListener('ecochain-tour', onTour)
    // 20km fire notification — LIVE poll mỗi 60s; DEMO dùng kịch bản mẫu
    const loadAlerts=()=> fetch(TILE_FIX(`${API}/api/villages/fire-alert?t=${Date.now()}`), { cache:'no-store' }).then(r=>r.json()).then(j=>{
      if(getMode()==='demo'){ setFireAlerts(DEMO_ALERTS as any[]); return }
      setFireAlerts(j.alerts || [])
      if(j.alerts?.length){
        const msg = `🔥 ${j.alerts.length} thôn/xã trong 20km có cháy: ${j.alerts.slice(0,2).map((a:any)=>`${a.village} (${a.distance_km}km)`).join(', ')}`
        console.warn(msg)
        if(Notification && Notification.permission==='granted') new Notification('Cảnh báo cháy 20km', { body: msg })
      }
    }).catch(()=>{ if(getMode()==='demo') setFireAlerts(DEMO_ALERTS as any[]) })
    if(getMode()==='demo'){ setFireAlerts(DEMO_ALERTS as any[]); try{ if(!sessionStorage.getItem('ecogl_tour_done')) setTourOpen(true) }catch{ setTourOpen(true) } }
    else loadAlerts()
    const int=setInterval(()=>{ if(getMode()==='live') loadAlerts() }, 60000)
    if(Notification && Notification.permission==='default') Notification.requestPermission()
    return ()=>{ clearInterval(int); window.removeEventListener('ecochain-mode', onMode); window.removeEventListener('ecochain-tour', onTour) }
  },[])

  return (
    // ⚠️ BẮT BUỘC 3: Div chứa map PHẢI CÓ height/width cố định (Tránh h-0) + resize trigger
    <div className="relative w-full h-[calc(100vh-56px)] min-h-[500px] bg-slate-900 relative z-0" style={{position:'relative', height:'calc(100vh - 56px)', borderRadius:0, overflow:'hidden', background:'#0f172a'}}>
      <div ref={mapContainer} className="w-full h-full min-h-[500px] relative z-0 absolute inset-0" style={{ width:'100%', height:'100%', minHeight:'500px' }} />

      {/* Top: gọn để full view — search nhỏ + dot LIVE */}
      <div style={{position:'absolute', top:10, left:60, right:60, display:'flex', gap:8, alignItems:'center', justifyContent:'center', pointerEvents:'none'}}>
        <div style={{position:'relative', pointerEvents:'auto', width:280, maxWidth:'40vw'}}>
        <div style={{background:'rgba(255,255,255,0.92)', backdropFilter:'blur(12px)', borderRadius:999, padding:'6px 12px', display:'flex', gap:6, alignItems:'center', boxShadow:'0 4px 16px rgba(0,0,0,0.08)', width:'100%'}}>
          <span style={{opacity:0.6}}>⌕</span>
          <input value={search} placeholder={`Tìm xã...${communesCount?` (${communesCount} xã)`:''}`} style={{border:0, outline:'none', flex:1, fontSize:12, background:'transparent', minWidth:0}} onChange={e=>{ const v=e.target.value; setSearch(v); const all=communesRef.current?.features||[]; const q=normVi(v.trim()); setSuggests(!q?[]:all.filter((f:any)=> normVi(f.properties?.ten_xa||'').includes(q)).slice(0,8).map((f:any)=>f.properties)) }} onKeyDown={e=>{ if(e.key==='Enter' && suggests[0]) selectCommune(suggests[0]) }} />
        </div>
        {suggests.length>0 && <div style={{position:'absolute', top:'100%', left:0, right:0, marginTop:6, background:'#fff', borderRadius:12, boxShadow:'0 8px 24px rgba(0,0,0,0.15)', overflow:'hidden', zIndex:20}}>
          {suggests.map((s:any)=> <button key={s.ma_xa} onClick={()=>selectCommune(s)} style={{display:'block', width:'100%', textAlign:'left', padding:'8px 12px', fontSize:12, border:0, background:'transparent', cursor:'pointer', borderBottom:'1px solid #F1F5F9'}}>{s.ten_xa} <span style={{color:'#94A3B8'}}>· {s.ma_xa}</span></button>)}
        </div>}
        </div>
        <div title={`${mode==='demo'?'DEMO tutorial':liveStatus} · FIRMS ${sourceLive.firms||'…'} · GEE ${sourceLive.gee||'…'} · Sentinel-2 ${sourceLive.sentinel2||'…'} · ${now.toLocaleTimeString('vi-VN')}`} style={{background:'rgba(15,23,42,0.75)', backdropFilter:'blur(12px)', border:'1px solid rgba(255,255,255,0.15)', borderRadius:999, padding:'6px 10px', fontSize:11, display:'flex', gap:6, alignItems:'center', color:'#fff', pointerEvents:'auto', whiteSpace:'nowrap'}}>
          {(()=>{
            if(mode==='demo') return (<><span style={{width:8, height:8, borderRadius:999, background:'#F59E0B', display:'inline-block'}}/><span style={{fontWeight:800}}>DEMO</span></>)
            const live = [sourceLive.firms, sourceLive.gee, sourceLive.sentinel2].filter(s=> s==='LIVE').length
            const known = [sourceLive.firms, sourceLive.gee, sourceLive.sentinel2].filter(Boolean).length
            if(known > 0 && live === known) return (<><span style={{width:8, height:8, borderRadius:999, background:'#10B981', display:'inline-block'}}/><span style={{fontWeight:800}}>Dữ liệu: ĐẦY ĐỦ</span></>)
            if(live > 0) return (<><span style={{width:8, height:8, borderRadius:999, background:'#F59E0B', display:'inline-block'}}/><span style={{fontWeight:800}}>Dữ liệu: MỘT PHẦN</span></>)
            return (<><span style={{width:8, height:8, borderRadius:999, background:'#EF4444', display:'inline-block'}}/><span style={{fontWeight:800}}>Dữ liệu: NGOẠI TUYẾN</span></>)
          })()}
        </div>
      </div>
      {/* Cấp cháy từng xã chưa tải được: nói rõ, điểm xám = chưa có dữ liệu */}
      {levelsState==='degraded' && (
        <div style={{position:'absolute', top:56, left:'50%', transform:'translateX(-50%)', zIndex:15, background:'rgba(69,26,3,0.92)', color:'#FDE68A', borderRadius:999, padding:'6px 14px', fontSize:11, fontWeight:700, boxShadow:'0 4px 12px rgba(0,0,0,0.2)', maxWidth:'92vw', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>⚠️ Cấp cháy từng xã chưa tải đủ — điểm xám là CHƯA CÓ DỮ LIỆU, không phải mức an toàn</div>
      )}

      {/* Banner treo: ĐANG CHÁY (đỏ) / NGHI NGỜ warning (vàng) — từ quét FIRMS 20km mỗi 60s */}
      {burnKey && bannerOff!==burnKey ? (
        <div style={{position:'absolute', top:56, left:'50%', transform:'translateX(-50%)', zIndex:15, background:'#DC2626', color:'#fff', borderRadius:999, padding:'8px 12px 8px 16px', display:'flex', gap:10, alignItems:'center', boxShadow:'0 8px 24px rgba(220,38,38,0.5)', fontSize:12, fontWeight:800, maxWidth:'92vw', animation:'pulse 1.5s infinite'}}>
          <span>🔥 ĐANG CHÁY: {burning[0]?.village} ({burning[0]?.commune}){burning.length>1?` +${burning.length-1} điểm`:''} · {burning[0]?.distance_km}km · {burning[0]?.acq_date||''}</span>
          <button onClick={()=>setBannerOff(burnKey)} title="Ẩn banner" style={{border:0, borderRadius:999, background:'rgba(255,255,255,0.25)', color:'#fff', width:22, height:22, cursor:'pointer', fontWeight:800}}>✕</button>
        </div>
      ) : !burnKey && suspicious.length>0 ? (
        <div style={{position:'absolute', top:56, left:'50%', transform:'translateX(-50%)', zIndex:15, background:'rgba(245,158,11,0.95)', color:'#451A03', borderRadius:999, padding:'6px 14px', fontSize:11, fontWeight:700, boxShadow:'0 4px 12px rgba(0,0,0,0.15)', maxWidth:'92vw', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>⚠ {suspicious.length} điểm nghi ngờ trong 20km — quét FIRMS mỗi 60s</div>
      ) : null}

      {/* Control Panel — Glassmorphism + Collapse/Expand, logic giữ nguyên */}
      {!showLayers ? (
        <button onClick={()=>setShowLayers(true)} title="Mở bảng điều khiển lớp phủ" style={{position:'absolute', top:64, left:12, zIndex:10, width:38, height:38, display:'grid', placeItems:'center', background:'rgba(15,23,42,0.75)', backdropFilter:'blur(12px)', WebkitBackdropFilter:'blur(12px)', border:'1px solid rgba(255,255,255,0.15)', borderRadius:12, color:'#fff', fontSize:16, cursor:'pointer', boxShadow:'0 8px 24px rgba(0,0,0,0.25)', transition:'transform .25s ease, opacity .25s ease'}}>⚙️</button>
      ) : (
      <div style={{position:'absolute', top:64, left:12, zIndex:10, width:270, maxHeight:'calc(100% - 220px)', overflow:'auto', background:'rgba(15,23,42,0.75)', backdropFilter:'blur(12px)', WebkitBackdropFilter:'blur(12px)', borderRadius:12, border:'1px solid rgba(255,255,255,0.15)', boxShadow:'0 8px 24px rgba(0,0,0,0.25)', padding:10, display:'flex', flexDirection:'column', gap:8, color:'#fff', transition:'transform .3s ease, opacity .3s ease', transform:'translateX(0)', opacity:1}}>
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
          <div style={{fontSize:12, fontWeight:800, letterSpacing:.3}}>Lớp phủ bản đồ</div>
          <button onClick={()=>setShowLayers(false)} title="Thu gọn" style={{width:26, height:26, display:'grid', placeItems:'center', background:'rgba(255,255,255,0.1)', border:'1px solid rgba(255,255,255,0.15)', borderRadius:8, color:'#fff', fontSize:13, cursor:'pointer'}}>━</button>
        </div>
        <div style={{fontSize:11, fontWeight:700, opacity:.9}}>Nền bản đồ</div>
        <div style={{display:'flex', background:'rgba(255,255,255,0.1)', borderRadius:999, padding:3, gap:3}}>
          {([['osm','🗺️ Thường'],['esri','🛰️ Vệ tinh']] as [string,string][]).map(([v,label])=>(
            <button key={v} onClick={()=>switchBaseXyz(v)} style={{flex:1, border:0, borderRadius:999, padding:'6px 0', fontSize:12, fontWeight:700, cursor:'pointer', background:baseXyz===v?'#fff':'transparent', color:baseXyz===v?'#0B1412':'#fff'}}>{label}</button>
          ))}
        </div>
        <div style={{height:1, background:'rgba(255,255,255,0.15)'}}/>
        <div style={{fontSize:11, fontWeight:700, opacity:.9}}>Lớp AI/GEE</div>
        {[
          ['hotspot','🔥 Điểm nhiệt FIRMS', 'hotspot', 'VIIRS_SNPP_NRT'],
          ['ndvi','🌿 NDVI', 'ndvi', 'ndvi'],
          ['s1','📡 Sentinel-1 VV/VH', 's1', 's1'],
        ].map(([k,label, key, geeLayer])=>(
          <label key={k} style={{display:'flex', gap:6, alignItems:'center', background: activeSat[key]?'rgba(16,185,129,0.25)':'rgba(255,255,255,0.08)', padding:'6px 8px', borderRadius:8, fontSize:12, border:'1px solid rgba(255,255,255,0.15)', cursor:'pointer', color:'#fff'}}>
            <input type="checkbox" checked={!!activeSat[key as string]} onChange={()=> toggleSat(key as string, geeLayer as string)} /> {label}
            <span style={{fontSize:10, padding:'1px 6px', borderRadius:999, background: sourceLive[key==='hotspot'?'firms': key==='ndvi'?'sentinel2':'sentinel1']==='LIVE'?'#DCFCE7':'#FEF3C7', color:'#000'}}>{sourceLive[key==='hotspot'?'firms': key==='ndvi'?'sentinel2':'sentinel1'] || '...'}</span>
          </label>
        ))}
        {(activeSat.ndvi || activeSat.s1) && (
          <label style={{display:'block', fontSize:11, background:'rgba(255,255,255,0.08)', padding:'6px 8px', borderRadius:8}}>
            <div style={{display:'flex', justifyContent:'space-between'}}><span>Độ phủ lớp raster</span><b>{Math.round(opacity * 100)}%</b></div>
            <input type="range" min={10} max={100} value={Math.round(opacity * 100)} onChange={e=> applyOpacity(Number(e.target.value) / 100)} style={{width:'100%'}} aria-label="Độ phủ lớp raster" />
          </label>
        )}
        {activeSat.hotspot && (
          <div style={{fontSize:11, background:'rgba(220,38,38,0.25)', padding:'6px 8px', borderRadius:8, display:'flex', justifyContent:'space-between', alignItems:'center'}}>
            <span>🔥 {hotCount} điểm nóng trên bản đồ</span>
            <button onClick={fitHotspots} style={{border:0, borderRadius:999, padding:'4px 10px', fontSize:11, fontWeight:700, cursor:'pointer'}}>Phóng tới</button>
          </div>
        )}
        {activeSat.ndvi && info?.layer === 'ndvi' && ndviValue(info.ndvi) !== null && (
          <div style={{fontSize:11, background:'rgba(255,255,255,0.08)', padding:'6px 8px', borderRadius:8}}>
            <div style={{display:'flex', justifyContent:'space-between'}}><span>🌿 NDVI khu vực</span><b>{ndviValue(info.ndvi)!.toFixed(2)}</b></div>
            <div style={{position:'relative', height:8, borderRadius:999, marginTop:6, background:'linear-gradient(90deg,#8B5A2B,#F59E0B,#84CC16,#0F766E)'}}>
              <div style={{position:'absolute', left:`${Math.min(100, Math.max(0, (ndviValue(info.ndvi)! + 0.2) / 1.2 * 100))}%`, top:-3, width:2, height:14, background:'#fff'}} />
            </div>
            <div style={{display:'flex', justifyContent:'space-between', fontSize:10, opacity:0.8, marginTop:2}}><span>đất trống</span><span>rừng khỏe</span></div>
          </div>
        )}
        <div style={{fontSize:11, opacity:0.6, color:'#e2e8f0'}}>{communesError ? communesError : `Đã tải ${communesCount||'…'} xã · bbox 107.0,12.9,109.6,15.0`}</div>
      </div>)}

      {/* Right controls — icon gọn để full view */}
      <div style={{position:'absolute', top:64, right:12, display:'flex', flexDirection:'column', gap:8, zIndex:10}}>
        <button onClick={requestLoc} title="Vị trí của tôi" style={{width:38, height:38, display:'grid', placeItems:'center', background:'rgba(255,255,255,0.92)', border:0, borderRadius:12, boxShadow:'0 4px 12px rgba(0,0,0,0.08)', fontSize:16}}>📍</button>
        <button onClick={async()=>{
          const bounds = mapRef.current?.getBounds()
          const bbox = bounds ? `${bounds.getWest().toFixed(1)},${bounds.getSouth().toFixed(1)},${bounds.getEast().toFixed(1)},${bounds.getNorth().toFixed(1)}` : '107.0,12.9,109.6,15.0'
          const center = mapRef.current?.getCenter()
          const tileUrl = XYZ_TILES[baseXyz]?.url || 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
          setInfo({ layer:'smoke', status:'ANALYZING', source:'Gemini Vision' })
          try{
            const r=await fetch(`${API}/api/ai/smoke/detect`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ tile_url: tileUrl, lat: center?.lat || 13.9, lon: center?.lng || 108.3, bbox }) })
            const j=await r.json()
            const isSmoke = j.result?.is_smoke
            setInfo({ layer:'smoke', status: j.status, source:'Gemini Vision', satellite: tileUrl.includes('arcgis')?'Esri':tileUrl.includes('eox')?'Sentinel-2':'Google', acquired: new Date().toISOString().slice(0,10), is_smoke: isSmoke, confidence: j.result?.confidence, reason: j.result?.reason, alert: j.result?.alert, bbox })
            if(isSmoke){
              // Thêm marker cảnh báo khói
              const el=document.createElement('div'); el.style.width='22px'; el.style.height='22px'; el.style.borderRadius='999px'; el.style.background='#DC2626'; el.style.border='3px solid #fff'; el.style.boxShadow='0 0 12px rgba(220,38,38,1)'; el.style.animation='pulse 1s infinite'
              new (maplibregl as any).Marker({ element: el }).setLngLat([center?.lng || 108.3, center?.lat || 13.9] as any).addTo(mapRef.current)
            }
          }catch(e){ setInfo({ layer:'smoke', status:'UNAVAILABLE', reason:String(e) }) }
        }} style={{background: info?.layer==='smoke' && info?.is_smoke ? '#DC2626':'rgba(255,255,255,0.96)', color: info?.layer==='smoke' && info?.is_smoke ? '#fff':'#0B1412', backdropFilter:'blur(12px)', border:0, borderRadius:12, padding:'10px 12px', boxShadow:'0 4px 12px rgba(0,0,0,0.08)', fontSize:12, fontWeight:700}}>{info?.layer==='smoke' && info?.status==='ANALYZING' ? '⏳ Đang phân tích...' : '🤖 AI phát hiện khói'}</button>
        <div style={{background:'rgba(255,255,255,0.96)', backdropFilter:'blur(12px)', borderRadius:12, padding:10, fontSize:11, boxShadow:'0 4px 12px rgba(0,0,0,0.08)'}}>
          <div style={{fontWeight:800}}>Huyền thoại (mỗi xã 1 điểm màu theo CẤP — bấm để xem)</div>
          <div><i style={{width:10,height:10,borderRadius:999,background:'#0EA5E9',display:'inline-block',marginRight:6}}/> CẤP I-II</div>
          <div><i style={{width:10,height:10,borderRadius:999,background:'#F59E0B',display:'inline-block',marginRight:6}}/> CẤP III-IV</div>
          <div><i style={{width:10,height:10,borderRadius:999,background:'#DC2626',display:'inline-block',marginRight:6}}/> CẤP V</div>
          <div><i style={{width:10,height:10,borderRadius:999,background:'#1F2937',border:'2px solid #FBBF24',display:'inline-block',marginRight:6}}/> Từng cháy Hè 2026</div>
          <div><i style={{width:10,height:10,borderRadius:999,background:'#F59E0B',display:'inline-block',marginRight:6}}/> Vùng trọng điểm</div>
          <div><i style={{width:10,height:10,borderRadius:999,background:'#1E40AF',display:'inline-block',marginRight:6}}/> Cháy nhà/cơ sở</div>
          {info?.layer==='smoke' && info?.is_smoke && <div style={{marginTop:6, padding:'6px 8px', background:'#FEE2E2', borderRadius:8, color:'#991B1B', fontWeight:700}}>🚨 {info.alert?.message || 'Phát hiện khói'}<br/><span style={{fontWeight:400, fontSize:10}}>Độ tin cậy {(info.confidence*100).toFixed(0)}% · {info.reason}</span></div>}
          {info?.layer==='smoke' && info?.is_smoke===false && <div style={{marginTop:6, padding:'6px 8px', background:'#DCFCE7', borderRadius:8, color:'#065F46'}}>✓ Không có khói — an toàn</div>}
        </div>
      </div>

      {/* Bottom ticker + timeline */}
      <div style={{position:'absolute', bottom:0, left:0, right:0, background:'rgba(11,20,18,0.94)', color:'#fff', padding:'8px 12px', display:'flex', flexDirection:'column', gap:6}}>
        <div style={{display:'flex', gap:10, alignItems:'center', overflow:'hidden', whiteSpace:'nowrap'}}>
          <span style={{background: liveStatus==='LIVE'?'#10B981': liveStatus==='DEMO'?'#F59E0B':'#B45309', padding:'2px 8px', borderRadius:999, fontSize:11, fontWeight:700}}>{liveStatus==='LIVE'?'● TRỰC TIẾP': liveStatus==='DEMO'?'● DEMO':'● NGUỒN HẠN CHẾ'}</span>
          <span style={{fontSize:12, animation:'marquee 18s linear infinite'}}>{tickerLines[tickerIdx]}</span>
        </div>
        <div style={{display:'flex', gap:8, alignItems:'center', background:'rgba(255,255,255,0.08)', borderRadius:10, padding:'6px 10px'}}>
          <span style={{fontSize:11, fontWeight:700}}>Dòng thời gian:</span>
          <select value={dateRange} onChange={e=> setDateRange(e.target.value as any)} style={{padding:'4px 8px', borderRadius:8, border:0, fontSize:12}}>
            <option value="latest">Mới nhất</option><option value="7d">7 ngày</option><option value="30d">30 ngày</option><option value="3m">3 tháng</option>
          </select>
          <span style={{fontSize:11, opacity:0.8}}>Mây &lt; <select value={cloud} onChange={e=> setCloud(Number(e.target.value))} style={{padding:'2px 6px', borderRadius:6, border:0, fontSize:11}}><option value={20}>20%</option><option value={40}>40%</option></select></span>
        </div>
      </div>

      {/* Panel quét FIRMS: ĐANG CHÁY (đỏ) + NGHI NGỜ warning (vàng) */}
      {fireAlerts.length>0 && (
        <div className="fire-panel" style={{position:'absolute', bottom:80, left:12, background:'rgba(255,255,255,0.98)', backdropFilter:'blur(12px)', borderRadius:12, padding:12, minWidth:280, maxWidth:360, boxShadow:'0 8px 24px rgba(0,0,0,0.15)', border: burning.length ? '2px solid #DC2626' : '1px solid #F59E0B'}}>
          {burning.length>0 && <div style={{fontWeight:800, fontSize:12, color:'#DC2626'}}>🔥 ĐANG CHÁY ≤5km ({burning.length})</div>}
          {burning.length>0 && <div style={{maxHeight:110, overflow:'auto', marginTop:6, display:'flex', flexDirection:'column', gap:6}}>
            {burning.map((a:any, i:number)=>(
              <div key={'b'+i} style={{display:'flex', justifyContent:'space-between', alignItems:'center', background:'#FEE2E2', padding:'6px 8px', borderRadius:8, fontSize:11}}>
                <div><b>{a.village}</b> <span style={{color:'#64748B'}}>({a.commune})</span><br/><span style={{fontSize:10, color:'#334155'}}>{a.distance_km}km từ cháy · {a.acq_date || '2026-09-04'}</span></div>
                <button onClick={()=> watchFire(a)} style={{fontSize:10, padding:'2px 6px', borderRadius:999, background:'#DC2626', color:'#fff', border:0, cursor:'pointer'}}>XEM</button>
              </div>
            ))}
          </div>}
          {suspicious.length>0 && <div style={{fontWeight:800, fontSize:12, color:'#92400E', marginTop:burning.length?8:0}}>⚠ NGHI NGỜ ≤20km — warning ({suspicious.length})</div>}
          {suspicious.length>0 && <div style={{maxHeight:100, overflow:'auto', marginTop:6, display:'flex', flexDirection:'column', gap:6}}>
            {suspicious.map((a:any, i:number)=>(
              <div key={'s'+i} style={{display:'flex', justifyContent:'space-between', alignItems:'center', background:'#FEF3C7', padding:'6px 8px', borderRadius:8, fontSize:11}}>
                <div><b>{a.village}</b> <span style={{color:'#64748B'}}>({a.commune})</span><br/><span style={{fontSize:10, color:'#334155'}}>{a.distance_km}km từ điểm nhiệt · {a.acq_date || '2026-09-04'}</span></div>
                <button onClick={()=> watchFire(a)} style={{fontSize:10, padding:'2px 6px', borderRadius:999, background:'#F59E0B', color:'#fff', border:0, cursor:'pointer'}}>THEO DÕI</button>
              </div>
            ))}
          </div>}
          <div style={{fontSize:10, color:'#64748B', marginTop:6}}>Quét FIRMS mỗi 60s · Bán kính 20km · Gia Lai 107.0,12.9,109.6,15.0</div>
        </div>
      )}
      {fireAlerts.length===0 && villages.length>0 && (
        <div style={{position:'absolute', bottom:80, left:12, background:'rgba(255,255,255,0.9)', backdropFilter:'blur(12px)', borderRadius:12, padding:'10px 12px', fontSize:11, boxShadow:'0 4px 12px rgba(0,0,0,0.1)'}}>
          ✓ {villages.length} điểm tham chiếu đang theo dõi (mẫu, không đầy đủ thôn/xã) — không có cháy trong 20km
        </div>
      )}
      {(info || pixel) && (
        <div className="info-panel" style={{position:'absolute', bottom:80, right:12, background:'rgba(255,255,255,0.96)', backdropFilter:'blur(12px)', borderRadius:12, padding:12, minWidth:280, maxWidth:360, boxShadow:'0 8px 24px rgba(0,0,0,0.12)'}}>
          {info && info.layer==='watch' && <><div style={{fontWeight:700, fontSize:12}}>👁 THEO DÕI — {info.village} <span style={{fontSize:10, padding:'2px 6px', borderRadius:999, background: info.status==='ANALYZING' ? '#FEF3C7' : '#DCFCE7'}}>{info.status === 'ANALYZING' ? 'ĐANG KIỂM TRA...' : info.status}</span></div><div style={{fontSize:12, marginTop:6, color:'#334155'}}>📍 Điểm cháy: {info.fire?.lat?.toFixed(4)}, {info.fire?.lon?.toFixed(4)} · cách {info.fire?.distance_km}km · {info.fire?.date} · tin cậy {info.fire?.confidence}</div><div style={{fontSize:12, marginTop:6}}>🛰️ Sentinel-2: {info.sentinel ? <><b>{info.sentinel.status}</b> · NDVI <b>{info.sentinel.ndvi ?? '—'}</b> · {info.sentinel.source}{info.sentinel.acquired ? ` · ${info.sentinel.acquired}` : ''}</> : 'Đang kiểm tra...'}</div><div style={{fontSize:12, marginTop:4}}>🤖 Model FireRisk: {info.model ? <><b>{info.model.status === 'UNAVAILABLE' ? 'CHƯA CHẠY' : info.model.status}</b>{info.model.risk_score !== undefined && <> · Rủi ro <b>{info.model.risk_score}/100</b> · CẤP <b>{info.model.warning_level}</b> · tin cậy {info.model.confidence}%</>}</> : 'Đang kiểm tra...'}</div></>}
          {info && info.layer!=='watch' && <><div style={{fontWeight:700, fontSize:12}}>DỮ LIỆU VỆ TINH — {info.layer} <span style={{fontSize:10, padding:'2px 6px', borderRadius:999, background: info.status==='LIVE'?'#DCFCE7': info.status==='DEMO'?'#FEF3C7': info.status==='CONFIGURATION_REQUIRED'?'#FEF3C7':'#FEE2E2'}}>{info.status==='CONFIGURATION_REQUIRED' ? 'DEMO · Cache Vệ tinh Gia Lai' : info.status}</span></div><div style={{fontSize:12, marginTop:6, color:'#334155'}}>Nguồn: {info.status==='CONFIGURATION_REQUIRED' ? 'Esri/Sentinel Tile tĩnh · DEMO Cache' : (info.source || 'Sentinel-2')} · Ngày: {info.acquired || info.date || '—'} {info.status==='CONFIGURATION_REQUIRED' && <span style={{color:'#F59E0B'}}>· Fallback BaseMap</span>}</div>
          {info.layer==='smoke' && info.is_smoke && <div style={{marginTop:6, padding:'6px 8px', background:'#FEE2E2', borderRadius:8, color:'#991B1B', fontSize:11, fontWeight:700}}>🚨 {info.alert?.message}<br/><span style={{fontWeight:400}}>Độ tin cậy {(info.confidence*100).toFixed(0)}% · {info.reason}</span></div>}
          </>}
          {pixel && <><div style={{height:1, background:'#E2E8E5', margin:'8px 0'}}/><div style={{fontSize:12}}>NDVI: <b>{pixel.ndvi}</b></div></>}
        </div>
      )}

      {mode==='demo' && !tourOpen && <button onClick={()=>setTourOpen(true)} style={{position:'absolute', bottom:76, right:12, zIndex:20, border:0, borderRadius:999, background:'#F59E0B', color:'#000', fontWeight:800, fontSize:12, padding:'8px 14px', cursor:'pointer', boxShadow:'0 4px 12px rgba(0,0,0,0.2)'}}>▶ Tutorial DEMO</button>}
      {mode==='demo' && tourOpen && <DemoTour onDone={()=>setTourOpen(false)} />}

      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}} @keyframes marquee{0%{transform:translateX(100%)}100%{transform:translateX(-100%)}}
      @media (max-width: 640px){
        .fire-panel{ top:108px !important; bottom:auto !important; left:12px !important; right:12px !important; min-width:0 !important; max-width:none !important; max-height:30vh; overflow:auto; }
        .info-panel{ left:12px !important; right:12px !important; min-width:0 !important; max-width:none !important; max-height:28vh; overflow:auto; }
      }`}</style>
    </div>
  )
}
