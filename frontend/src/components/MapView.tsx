import { useEffect, useMemo, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
// ⚠️ BẮT BUỘC 1: Import CSS của MapLibre (Nếu thiếu map sẽ trắng/vỡ) — phải ở đầu file
import 'maplibre-gl/dist/maplibre-gl.css'
// Fallback nếu dùng Leaflet (không dùng nhưng giữ để tránh thiếu CSS)
// import 'leaflet/dist/leaflet.css'; 
import { useLocation } from '../hooks/useLocation'
import { API_BASE, api } from '../services/api'
import DemoTour from './DemoTour'
import ForecastCard from './ForecastCard'
import AssetDrawer, { HoverPreview, groupNearby, haversineKm, stripHtml } from './AssetDrawer'
import type { DrawerItem } from './AssetDrawer'
import { getMode } from './ModeSwitch'

// Icon/label asset dùng chung cho marker + drawer + legend.
// RC B2: legend render từ đúng các hằng số này (không hardcode riêng,
// không gộp icon khác icon) — marker nào vẽ thì legend có đúng icon đó.
const ICON_OF: Record<string,string> = { watchtower:'🗼', camera:'📷', water:'🌊', firetruck:'🚒', pump:'🔧', team:'⛺', station:'🏕️', hydro:'⚡' }
const TYPE_OF: Record<string,string> = { watchtower:'Chòi canh', camera:'Camera', water:'Nguồn nước', firetruck:'Xe chữa cháy', pump:'Máy bơm', team:'Tổ kiểm lâm', station:'Trạm', hydro:'Thủy điện' }
// RC B2: màu CẤP xã — một nguồn duy nhất cho cả vòng tròn map lẫn legend.
const LEVEL_COLORS: Record<string,string> = { I:'#0EA5E9', II:'#10B981', III:'#F59E0B', IV:'#F97316', V:'#DC2626' }
const LEVEL_ORDER = ['I','II','III','IV','V']
const ASSET_KEYS = ['water','hydro','station','team','firetruck','pump','camera','watchtower'] as const

// M9/M11: vị trí tương đối trong tỉnh Gia Lai — tính thuần từ bbox thực
// [107.4514,12.996,109.3635,14.7031] của gialai_boundary.geojson, không API mới.
// Không suy được (ngoài tỉnh) → null → caller không hiển thị (không bịa).
export function provinceContext(lon:number, lat:number): string | null {
  const W=107.4514, S=12.996, E=109.3635, N=14.7031
  if(typeof lon!=='number' || typeof lat!=='number') return null
  if(!(lon>=W-0.05 && lon<=E+0.05 && lat>=S-0.05 && lat<=N+0.05)) return null
  const x=(lon-W)/(E-W), y=(lat-S)/(N-S)
  if(x>=0.33 && x<=0.67 && y>=0.25 && y<=0.75) return 'Trung tâm tỉnh'
  const ew = x<0.33 ? 'Tây Gia Lai' : x>0.67 ? 'Đông Gia Lai' : 'Gia Lai'
  const edge = Math.min(lon-W, E-lon, lat-S, N-lat)
  const tail = edge<0.12 ? 'giáp ranh tỉnh' : (y>0.75 ? 'phía Bắc' : y<0.25 ? 'phía Nam' : '')
  return tail ? `${ew} · ${tail}` : ew
}

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

export default function MapView({ onSelect, fill }: { onSelect?: (type:string, id:string)=>void; fill?: boolean }) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect
  const [_base] = useState<'streets'|'satellite'>('streets')
  void _base
  // Priority 1: Default Esri World Imagery (ổn định nhất) — không google_s
  const [baseXyz, setBaseXyz] = useState<string>(()=>{
    try{
      const v = localStorage.getItem('ecogl_basemap')
      return v && ['esri', 'terrain', 'osm', 'hybrid'].includes(v) ? v : 'esri'
    }catch{ return 'esri' }
  })
  const [baseOpen, setBaseOpen] = useState(false)
  const [activeSat, setActiveSat] = useState<Record<string, boolean>>({})
  const [dateRange, setDateRange] = useState<'latest'|'7d'|'30d'|'3m'|'custom'>('30d')
  const [cloud, setCloud] = useState(20)
  const [info, setInfo] = useState<any>(null)
  const [liveStatus, setLiveStatus] = useState<'LIVE'|'CACHED'|'STALE'|'CONFIGURATION_REQUIRED'|'UNAVAILABLE'|'DEMO'>('UNAVAILABLE')
  const [now, setNow] = useState(new Date())
  const [showLayers, setShowLayers] = useState(false)
  const [showProvince, setShowProvince] = useState(true)
  const [showCommunes, setShowCommunes] = useState(true)
  // P2/P3 Executive Clean Mode — một nút ẩn toàn bộ chrome, giữ map + cảnh báo.
  const [execView, setExecView] = useState(false)
  // P11 presentation: 10s không tương tác → ẩn controls (chuột động là hiện).
  const [idleing, setIdleing] = useState(false)
  const idleTimer = useRef<any>(null)
  const poke = ()=>{
    setIdleing(prev=> prev ? false : prev)
    try{ clearTimeout(idleTimer.current) }catch{}
    idleTimer.current = setTimeout(()=> setIdleing(true), 10000)
  }
  useEffect(()=>{ poke(); return ()=>{ try{ clearTimeout(idleTimer.current) }catch{} } },[])
  // M7/M9: hiển thị mặc định chỉ Fire/Water/Communities/Stations.
  // Camera/Tower/Resources/Hydro + sự cố lịch sử ẩn mặc định (opt-in).
  const [assetVis, setAssetVis] = useState<Record<string, boolean>>({
    water:true, station:true,
    camera:false, watchtower:false, firetruck:false, pump:false, team:false, hydro:false,
    historical:false,
  })
  const assetVisRef = useRef(assetVis)
  assetVisRef.current = assetVis
  // M5: ref cho toggle ranh giới (callback map-load đọc giá trị mới nhất).
  const showProvinceRef = useRef(showProvince)
  showProvinceRef.current = showProvince
  const showCommunesRef = useRef(showCommunes)
  showCommunesRef.current = showCommunes
  const assetMarkersRef = useRef<{ m:any; type:string }[]>([])
  const histMarkersRef = useRef<{ m:any; group:string }[]>([])
  // M8: một Operational Status duy nhất — bấm để mở chi tiết nguồn.
  const [statusOpen, setStatusOpen] = useState(false)
  // 3D địa hình (MapLibre terrain, DEM miễn phí Terrarium — không cần key)
  const [terrain3d, setTerrain3d] = useState(false)
  useEffect(()=>{
    const map = mapRef.current as any
    if(!map) return
    try{
      if(terrain3d){
        if(!map.getSource('terrain-dem')){
          map.addSource('terrain-dem', { type:'raster-dem', tiles:['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'], tileSize:256, maxzoom:15, encoding:'terrarium' } as any)
        }
        map.setTerrain({ source:'terrain-dem', exaggeration:1.2 })
        map.easeTo({ pitch: 60, duration: animDur(500) })
      }else{
        map.setTerrain(null)
        try{ map.easeTo({ pitch: 0, duration: animDur(450) }) }catch{}
      }
    }catch(e){ console.warn('3D terrain failed', e); setTerrain3d(false) }
  },[terrain3d])
  // Kết quả mô phỏng lan truyền cháy (polygons + xã ảnh hưởng)
  const [spreadInfo, setSpreadInfo] = useState<any>(null)
  const runSpread = async (lon:number, lat:number)=>{
    try{
      setSpreadInfo({ loading:true })
      const r = await fetch(TILE_FIX(`${API}/api/fire/spread`), { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ lon, lat, hours:[1,3,6] }) })
      const j = await r.json()
      const map = mapRef.current as any
      if(map){
        try{ if(map.getLayer('spread-fill')) map.removeLayer('spread-fill'); if(map.getSource('spread-src')) map.removeSource('spread-src') }catch{}
        const feats = (j.steps || []).map((s:any)=> ({ type:'Feature', properties:{ hour:s.hour, area_ha:s.area_ha },
          geometry: s.polygon }))
        map.addSource('spread-src', { type:'geojson', data:{ type:'FeatureCollection', features: feats } } as any)
        // M6: forecast = outline + fill mờ — nền địa hình đọc được.
        map.addLayer({ id:'spread-fill', type:'fill', source:'spread-src', paint:{ 'fill-color':'#DC2626', 'fill-opacity':0.18, 'fill-opacity-transition':{ duration:220 }, 'fill-outline-color':'#7F1D1D' } } as any)
        map.addLayer({ id:'spread-outline', type:'line', source:'spread-src', paint:{ 'line-color':'#DC2626', 'line-width':2, 'line-opacity':0.9, 'line-opacity-transition':{ duration:220 } } } as any)
        enforceOrder(map)
      }
      setSpreadInfo(j)
    }catch(e:any){ setSpreadInfo({ error: String(e.message || e).slice(0, 200) }) }
  }
  // M5: toggle chỉ đổi visibility — không reload data, không fetch lại.
  useEffect(()=>{
    const map = mapRef.current
    if(!map) return
    for(const id of ['province-boundary','province-label']){
      try{ if(map.getLayer(id)) map.setLayoutProperty(id, 'visibility', showProvince ? 'visible' : 'none') }catch{}
    }
  },[showProvince])
  useEffect(()=>{
    const map = mapRef.current
    if(!map) return
    for(const id of ['communes-fill','communes-casing','communes-line','communes-label']){
      try{ if(map.getLayer(id)) map.setLayoutProperty(id, 'visibility', showCommunes ? 'visible' : 'none') }catch{}
    }
  },[showCommunes])
  const communesRef = useRef<any>(null)
  const communeFireClickRef = useRef<any>(null)
  const [communesCount, setCommunesCount] = useState<number>(0)
  const [communesError, setCommunesError] = useState<string>('')
  // Cấp cháy từng xã: 'live' = API trả đủ, 'degraded' = API fail/thiếu —
  // KHÔNG bao giờ hiển thị số mặc định như dữ liệu thật.
  const [levelsState, setLevelsState] = useState<'loading'|'live'|'degraded'>('loading')
  // RC B2: tuyến tiếp cận có thật trên map không — legend chỉ hiện 🛣️ khi có.
  const [hasRoutes, setHasRoutes] = useState(false)
  // M10: Command Strip — xã nguy hiểm nhất + driver + hành động (từ API sẵn có,
  // không score/confidence). null = chưa có dữ liệu → không hiển thị.
  const [execStrip, setExecStrip] = useState<any>(null)
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
  const GEOJSON_V = 'v5'
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
  // Đưa nền raster xuống đáy tuyệt đối — ranh giới/bản đồ vector không bao giờ bị che.
  const lowerBase = (map:any)=>{
    try{
      if(!map.getLayer('base-xyz')) return
      const layers = (map.getStyle()?.layers || []).map((l:any)=> l.id)
      const firstOverlay = layers.find((id:string)=> id !== 'base-xyz' && id !== 'osm')
      if(firstOverlay) map.moveLayer('base-xyz', firstOverlay)
    }catch{}
  }
  // M4: thứ tự cartography chuẩn EOC —
  // Satellite ↓ Province Boundary ↓ Commune Boundary ↓ Assets/Routes ↓ Fire ↓ Labels.
  // Province luôn dưới xã nhưng đậm hơn (width/contrast), labels luôn trên cùng.
  const enforceOrder = (map:any)=>{
    try{
      const order = ['base-xyz','base-xyz-labels','osm',
        'province-boundary',
        'communes-fill','communes-casing','communes-line',
        'asset-routes','spread-fill','spread-outline','commune-fire',
        'communes-label','commune-fire-label','province-label']
      for(const id of order){
        if(map.getLayer(id)) map.moveLayer(id)
      }
    }catch{}
  }
  // Chờ style load xong mới addSource/addLayer — tránh race "Style is not done loading".
  const whenLoaded = async (map:any)=>{
    if(map.isStyleLoaded()) return
    await new Promise<void>(res=>{ try{ map.once('load', ()=> res()) }catch{ res() } })
  }
  const LEVEL_VI: Record<string,string> = { I:'Thấp', II:'Trung bình', III:'Cao', IV:'Nguy hiểm', V:'Cực kỳ nguy hiểm' }
  const hazardVi = (t:string)=> ({ FIRE:'Cháy', FLOOD:'Lũ', LANDSLIDE:'Sạt lở', DROUGHT:'Hạn', HEAT:'Nắng nóng', STORM:'Bão' } as any)[t] || t
  // P1: drawer xã + chẩn đoán async điền dần (mở ngay, không che bản đồ).
  // P3: danh bạ xã từ geojson thật — dân số + liên hệ + trụ sở; sơ tán
  // chưa có dữ liệu nên ghi MISSING rõ ràng (không bịa phương án).
  const communePopup = async (f:any, lngLat:any, _map:any)=>{
    void _map
    const key = `commune:${f.ma_xa || f.ten_xa}`
    const hq = stripHtml(f.tru_so)
    const contact = stripHtml(f.lanh_dao)
    const baseItem: DrawerItem = {
      key, kind:'commune', icon:'🏘️', name: f.ten_xa || '', typeLabel:'Xã/phường',
      lon: lngLat[0], lat: lngLat[1],
      note: [f.ma_xa ? `mã ${f.ma_xa}` : '', f.dtich_km2 ? `${f.dtich_km2} km²` : '', f.dan_so ? `dân số ${f.dan_so}` : ''].filter(Boolean).join(' · ') || undefined,
      contact: contact || undefined,
      evac:'MISSING: chưa có phương án sơ tán',
      diagnosis: { loading: true },
    }
    if(hq) baseItem.note = [baseItem.note, `Trụ sở: ${hq}`].filter(Boolean).join(' · ')
    // M11: province context vào drawer (chỉ text suy được, không có → bỏ qua).
    try{ const pctx = provinceContext(lngLat[0], lngLat[1]); if(pctx) baseItem.note = [baseItem.note, pctx].filter(Boolean).join(' · ') }catch{}
    openersRef.current.set(key, { open:()=> openDrawer({ ...baseItem, diagnosis: { loading: true } }), lon: lngLat[0], lat: lngLat[1] })
    bumpOpeners()
    openDrawer(baseItem)
    const patchDiagnosis = (patch: Partial<NonNullable<DrawerItem['diagnosis']>>)=>{
      setDrawer(d=> (d && d.item.key === key) ? { item: { ...d.item, diagnosis: { ...(d.item.diagnosis || {}), ...patch } } } : d)
    }
    window.dispatchEvent(new CustomEvent('ecochain-select-area', { detail:{ area: f.ten_xa, lat: lngLat[1], lon: lngLat[0] } }))
    onSelectRef.current?.('commune', f.ten_xa || ('ma-' + f.ma_xa))
    try{
      const [fr, ds] = await Promise.all([
        fetch(TILE_FIX(`${API}/api/fire/risk?administrative_unit_id=${encodeURIComponent(f.ten_xa||('ma-'+f.ma_xa))}&lat=${lngLat[1].toFixed(4)}&lon=${lngLat[0].toFixed(4)}`)).then(r=>r.json()).catch(()=> null),
        fetch(TILE_FIX(`${API}/api/disaster/summary?administrative_unit_id=${encodeURIComponent(f.ten_xa||('ma-'+f.ma_xa))}&lat=${lngLat[1].toFixed(4)}&lon=${lngLat[0].toFixed(4)}`)).then(r=>r.json()).catch(()=> null),
      ])
      if(!fr) throw new Error('unavailable')
      const j = fr
      const lv = j.warning_level || 'I'
      const ev = j.evidence || {}
      const n = Array.isArray(ev.hotspots) ? ev.hotspots.length : (ev.hotspots ?? 0)
      const sigs = (ds?.signals || []).filter((s:any)=> s.risk_type !== 'FIRE').slice(0,4)
      const frt = (j as any).forecast_rating || null
      patchDiagnosis({
        loading: false, level: lv, label: LEVEL_VI[lv] || '',
        driver: frt?.major_risk_driver || undefined,
        action: ((frt?.recommended_action || [])[0]) || undefined,
        coverage: frt?.data_coverage_status || undefined,
        firms: n, temp: ev.weather?.temperature ?? null,
        sigs: sigs.length ? sigs.map((s:any)=> `${hazardVi(s.risk_type)} ${s.score}`).join(' · ') : undefined,
        missing: Array.isArray(j.missing) && j.missing.length ? j.missing.join(', ') : undefined,
      })
      // Full forecast card (template cuối) mở từ nút "Bản tin" trong drawer.
      // (Xem onForecast ở render AssetDrawer — cùng /fire/forecast-rating.)
      // Bản tin AI xã: mưa 14 ngày + lý do + xã cần theo dõi (không bịa số)
      fetch(TILE_FIX(`${API}/api/fire/brief?administrative_unit_id=${encodeURIComponent(f.ten_xa||('ma-'+f.ma_xa))}&lat=${lngLat[1].toFixed(4)}&lon=${lngLat[0].toFixed(4)}`)).then(r=> r.ok ? r.json() : null).then((b:any)=>{
        if(!b) return
        const reasons = (b.reasons || []).join(' · ')
        const watch = (b.watch_communes || []).map((w:any)=> w.name).join(' · ')
        patchDiagnosis({ rain14: b.rain_14d_mm ?? null, dryDays: b.dry_days ?? null, firms: b.firms_nearby ?? n, watch: watch || undefined,
          brief: reasons || undefined })
      }).catch(()=> {})
      // Ảnh vệ tinh tĩnh — CHỈ khi backend trả URL http(s) thật (GEE live).
      // mock:// hoặc thiếu URL => không render gì, tránh ảnh giả.
      fetch(TILE_FIX(`${API}/api/forest/satellite/thumbnail?lat=${lngLat[1].toFixed(4)}&lon=${lngLat[0].toFixed(4)}`)).then(r=> r.ok ? r.json() : null).then((t:any)=>{
        const url = t?.thumbnail_url
        if(!url || !String(url).startsWith('http')) return
        patchDiagnosis({ thumbUrl: url })
      }).catch(()=> {})
    }catch{ patchDiagnosis({ loading: false, error:'AI chưa kết nối (UNAVAILABLE). Thử lại sau.' }) }
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
      try{
        const cc = map.getCenter() as any
        openDrawer({ key:`commune:${props.ma_xa || props.ten_xa || props.name}`, kind:'commune',
          icon:'🏘️', name: props.ten_xa || props.name || '', typeLabel:'Xã/phường',
          lon: cc.lng, lat: cc.lat,
          diagnosis:{ error:'MISSING: chưa có ranh giới trên bản đồ. Đang bổ sung polygon.' } })
      }catch{}
      setSuggests([]); setSearch(props.ten_xa||'')
      return
    }
    try{
      map.fitBounds(communeBounds(feat) as any, { padding:40, duration:animDur(450) })
      const cx=(communeBounds(feat)[0][0]+communeBounds(feat)[1][0])/2, cy=(communeBounds(feat)[0][1]+communeBounds(feat)[1][1])/2
      communePopup(feat.properties, [cx,cy], map)
    }catch{}
    setSuggests([]); setSearch(props.ten_xa||'')
  }

  // RC B3: THEO DÕI một điểm nghi ngờ — bay tới vị trí + bản tin CẤP/driver/
  // action/coverage từ /fire/risk sẵn có (forecast_rating). Không Risk/100,
  // không Tin cậy %, không NDVI — đúng kiến trúc Executive.
  const watchFire = async (a:any)=>{
    const map = mapRef.current
    const flon = a.fire_coords?.[0], flat = a.fire_coords?.[1]
    if(map && flon && flat){
      try{ map.flyTo({ center:[flon, flat], zoom:12, duration:animDur(600) }) }catch{}
      const akey = `alert:${a.village || a.commune || flat},${flon}`
      const buildAlertItem = (): DrawerItem => ({
        key: akey,
        kind:'alert', icon: a.level === 'CẢNH BÁO' ? '🔥' : '⚠️',
        name: `Điểm nghi ngờ — ${a.village || a.commune || ''}`,
        typeLabel: a.level === 'CẢNH BÁO' ? 'Đang cháy' : 'Theo dõi',
        lon:flon, lat:flat, status: a.level || undefined,
        priority: a.distance_km != null ? `cách ${a.distance_km}km` : undefined,
        note: (fl => { try{ return fl ? provinceContext(fl[0], fl[1]) || undefined : undefined }catch{ return undefined } })(a.fire_coords),
        fire:{ date: a.acq_date },
      })
      openersRef.current.set(akey, { open:()=> openDrawer(buildAlertItem()), lon:flon, lat:flat })
      openDrawer(buildAlertItem())
    }
    onSelectRef.current?.('watch', a.village || a.commune || '')
    window.dispatchEvent(new CustomEvent('ecochain-select-area', { detail:{ area: a.village || a.commune, lat: flat, lon: flon } }))
    setInfo({ layer:'watch', status:'ANALYZING', source:'FIRMS + FireRisk', village:a.village, commune:a.commune,
      fire:{ lon:flon, lat:flat, date:a.acq_date, distance_km:a.distance_km }, rating:null })
    let status = 'UNAVAILABLE'
    let rating:any = null
    try{
      const r=await fetch(TILE_FIX(`${API}/api/fire/risk?administrative_unit_id=${encodeURIComponent(a.commune || a.village || '')}&lat=${flat || 13.9}&lon=${flon || 108.3}`))
      const j=await r.json()
      status = j.status || 'CACHED'
      const fr = j.forecast_rating || {}
      rating = {
        level: j.warning_level || 'MISSING',
        label: j.label || 'MISSING',
        driver: fr.major_risk_driver || 'MISSING',
        action: (fr.recommended_action || [])[0] || 'MISSING',
        coverage: fr.data_coverage_status || 'MISSING',
      }
      if(!j.warning_level) rating = null
    }catch{ status = 'UNAVAILABLE'; rating = null }
    setInfo((prev:any)=> prev && prev.layer==='watch'
      ? { ...prev, status, rating }
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
          map.flyTo({ center:[d.lng, d.lat], zoom:12, duration:animDur(600) })
          const skey = `location:${Number(d.lat).toFixed(4)},${Number(d.lng).toFixed(4)}`
          const buildLocItem = (): DrawerItem => ({
            key: skey, kind:'location', icon:'📍', name: d.name || 'Vị trí',
            typeLabel:'Kết quả tìm kiếm', lon: d.lng, lat: d.lat,
            note: [d.level || d.type || ''].filter(Boolean).join(' · ') || undefined,
          })
          openersRef.current.set(skey, { open:()=> openDrawer(buildLocItem()), lon: d.lng, lat: d.lat })
          openDrawer(buildLocItem())
        }catch{}
        window.dispatchEvent(new CustomEvent('ecochain-select-area', { detail:{ area: d.name, lat: d.lat, lon: d.lng } }))
        onSelectRef.current?.('search', d.name || '')
      }
    }
    window.addEventListener('ecochain-search' as any, h)
    return ()=> window.removeEventListener('ecochain-search' as any, h)
  },[])

  // P6: dòng cảnh báo ticker cũ đã gộp vào nút "Dữ liệu" — không fetch riêng.

  useEffect(()=>{
    const id=setInterval(()=> setNow(new Date()), 1000)
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
  // terrain = OpenTopoMap (keyless, CC-BY-SA); hybrid = Esri imagery + nhãn Esri Reference.
  const XYZ_TILES: Record<string, { url: string, attribution: string, tiles?: string[], overlay?: { tiles: string[], attribution: string } }> = {
    esri: { url: TILE_FIX('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'), attribution: '© Esri World Imagery' },
    osm: { url: TILE_FIX('https://tile.openstreetmap.org/{z}/{x}/{y}.png'), attribution: '© OpenStreetMap' },
    eox: { url: TILE_FIX('https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg'), attribution: '© EOX Sentinel-2 cloudless' },
    terrain: { url: TILE_FIX('https://a.tile.opentopomap.org/{z}/{x}/{y}.png'), attribution: '© OpenTopoMap (CC-BY-SA)',
      tiles: ['https://a.tile.opentopomap.org/{z}/{x}/{y}.png', 'https://b.tile.opentopomap.org/{z}/{x}/{y}.png', 'https://c.tile.opentopomap.org/{z}/{x}/{y}.png'].map(TILE_FIX) },
    hybrid: { url: TILE_FIX('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'), attribution: '© Esri World Imagery',
      overlay: { tiles: [TILE_FIX('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}')], attribution: '© Esri Reference' } },
  }
  // Switcher nền bản đồ: thumbnail tĩnh z10 trên tâm Gia Lai (chỉ để chọn, không phải dữ liệu).
  const BASE_LAYERS = [
    { id: 'esri', label: 'Vệ tinh', icon: '🛰️', thumb: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/10/472/820' },
    { id: 'terrain', label: 'Địa hình', icon: '⛰️', thumb: 'https://a.tile.opentopomap.org/10/820/472.png' },
    { id: 'osm', label: 'Đường phố', icon: '🗺️', thumb: 'https://tile.openstreetmap.org/10/820/472.png' },
    { id: 'hybrid', label: 'Lai', icon: '🛣️', thumb: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/10/472/820' },
  ]
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
          map.addLayer({ id:layerId, type:'raster', source:layerId, paint:{ 'raster-opacity': 0.6, 'raster-opacity-transition':{ duration:220 } } })
        }
      }
    } catch (err) {
      console.warn(`Lớp ${tileType} chưa khả dụng (Chế độ Fallback BaseMap):`, err)
    }
  }
  void addGEETileLayer

  const switchBaseXyz = (id: string)=>{
    setBaseXyz(id)
    setBaseOpen(false)
    try{ localStorage.setItem('ecogl_basemap', id) }catch{}
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
    if(map.getLayer('base-xyz-labels')) try{ map.removeLayer('base-xyz-labels')}catch{}
    if(map.getSource('base-xyz-labels')) try{ map.removeSource('base-xyz-labels')}catch{}
    if(baseXyz==='carto') return
    const tile = XYZ_TILES[baseXyz]
    if(!tile) return
    // Fallback Esri → OSM → static — nền luôn nằm DƯỚI vector (boundary/communes)
    try{
      map.addSource(sourceId, { type:'raster', tiles: tile.tiles || [TILE_FIX(tile.url)], tileSize:256, attribution: tile.attribution } as any)
      map.addLayer({ id: layerId, type:'raster', source: sourceId } as any)
      if(tile.overlay){
        map.addSource('base-xyz-labels', { type:'raster', tiles: tile.overlay.tiles, tileSize:256, attribution: tile.overlay.attribution } as any)
        map.addLayer({ id:'base-xyz-labels', type:'raster', source:'base-xyz-labels' } as any)
      }
      lowerBase(map)
      enforceOrder(map)
    }catch(e){
      console.warn('Base tile add failed, fallback OSM', e)
      const osm = XYZ_TILES.osm
      try{
        map.addSource(sourceId, { type:'raster', tiles:[osm.url], tileSize:256, attribution: osm.attribution } as any)
        map.addLayer({ id: layerId, type:'raster', source: sourceId } as any)
        lowerBase(map)
      }catch{}
    }
  }, [baseXyz])

  const hotspotMarkers = useRef<any[]>([])
  const [hotCount, setHotCount] = useState(0)
  const [opacity, setOpacity] = useState(0.6)
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
      try{ map.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding:60, duration:animDur(500) }) }catch{}
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
            el.style.width='14px'; el.style.height='14px'; el.style.borderRadius='999px';             el.style.background='#DC2626'; el.style.border='2px solid #fff'; el.style.boxShadow='0 0 8px rgba(220,38,38,0.8)'; el.style.cursor='pointer'; el.classList.add('mk-pop')
            el.title='Điểm nóng cháy. Bấm để xem chi tiết'
            const lng = f.longitude || f.lon || 108.3, lat = f.latitude || f.lat || 13.9
            const conf = String(f.confidence || 'n').toUpperCase()
            const confVi = conf.startsWith('H') ? 'Cao' : conf.startsWith('N') ? 'Thường' : conf.startsWith('L') ? 'Thấp' : conf
            const artificial = f.suspect_artificial
            const m=new (maplibregl as any).Marker({ element: el }).setLngLat([lng, lat] as any).addTo(mapRef.current)
            const hkey = `hotspot:${Number(lat).toFixed(3)},${Number(lng).toFixed(3)}`
            const buildHotItem = (): DrawerItem => ({
              key:hkey, kind:'hotspot', icon: artificial ? '🌡️' : '🔥',
              name: artificial ? 'Điểm nhiệt nghi nhân tạo' : `Điểm nóng ${Number(lat).toFixed(2)}, ${Number(lng).toFixed(2)}`,
              typeLabel: artificial ? 'Nhiệt nhân tạo (không tính là cháy)' : 'Điểm nóng cháy rừng',
              lon:lng, lat, status:`${f.satellite || data.satellite || 'VIIRS'} · tin cậy ${confVi}`,
              priority: f.frp ? `${f.frp} MW` : (f.brightness ? `${f.brightness} K` : undefined),
              note: artificial ? `Gần ${f.artificial_source?.name || 'hạ tầng phát nhiệt'} (${f.artificial_source?.distance_km ?? 'MISSING'} km)` : `Nguồn: NASA FIRMS · ${data.status || 'MISSING'}. Điểm nhiệt vệ tinh, cần xác minh thực địa`,
              fire:{ date:`${f.acq_date || ''} ${f.acq_time || ''}`.trim(), confidence: confVi },
            })
            openersRef.current.set(hkey, { open:()=> openDrawer(buildHotItem()), el, lon:lng, lat })
            wireHover(el, artificial ? 'Điểm nhiệt nghi nhân tạo' : 'Điểm nóng', f.satellite || 'VIIRS', ()=>{
              const d = distCenter(lng, lat)
              return `tin cậy ${confVi}${d != null ? ` · cách tâm ${d.toFixed(1)}km` : ''}`
            })
            el.addEventListener('click', (ev)=>{
              try{ (ev as any).stopPropagation() }catch{}
              openDrawer(buildHotItem())
              window.dispatchEvent(new CustomEvent('ecochain-select-area', { detail:{ area: `Điểm nóng ${Number(lat).toFixed(2)}, ${Number(lng).toFixed(2)}`, lat, lon: lng } }))
              onSelectRef.current?.('hotspot', `${lat},${lng}`)
            })
            hotspotMarkers.current.push(m)
          })
          bumpOpeners()
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
          mapRef.current.addLayer({ id:key, type:'raster', source:key, paint:{ 'raster-opacity': 0.6, 'raster-opacity-transition':{ duration:220 } } } as any)
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
        mapRef.current.addLayer({ id:key, type:'raster', source:key, paint:{ 'raster-opacity': 0.6, 'raster-opacity-transition':{ duration:220 } } } as any)
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
  // Nhãn thôn tham chiếu chỉ hiện khi zoom gần (>=9) — tránh đè nhau ở tầm tỉnh.
  const [mapZoom, setMapZoom] = useState(7.8)
  const [mode, setMode] = useState<string>(() => getMode())
  const [tourOpen, setTourOpen] = useState(false)
  const [bannerOff, setBannerOff] = useState<string>('')
  // P1–P6 Asset Drawer thay popup nổi: single selection, ghim, deep-link, hover.
  const [drawer, setDrawer] = useState<{ item: DrawerItem } | null>(null)
  const [pinned, setPinned] = useState(false)
  const pinnedRef = useRef(false)
  pinnedRef.current = pinned
  // P2 leave: drawer ở lại 190ms chạy fade+slide rồi mới unmount.
  const [leaving, setLeaving] = useState(false)
  const leavingRef = useRef(false)
  const closeTimer = useRef<any>(null)
  useEffect(()=> ()=>{ try{ clearTimeout(closeTimer.current) }catch{} },[])
  const [hover, setHover] = useState<{ x:number; y:number; name:string; type:string; meta:string } | null>(null)
  const openersRef = useRef(new Map<string, { open:()=>void; el?: HTMLElement; lon:number; lat:number }>())
  const pendingAssetRef = useRef<string | null>(null)
  const lastOpenAt = useRef(0)
  const [openerTick, setOpenerTick] = useState(0)
  const allAssetsRef = useRef<any[]>([])
  const waterListRef = useRef<any[]>([])
  const hlRef = useRef<HTMLElement | null>(null)
  const bumpOpeners = ()=> setOpenerTick(t=> t + 1)
  const unhighlight = ()=>{ const el = hlRef.current; if(el){ try{ el.classList.remove('marker-selected'); el.style.zIndex='' }catch{} } hlRef.current = null }
  const syncUrl = (key:string|null)=>{ try{ const u = new URL(window.location.href); if(key) u.searchParams.set('asset', key); else u.searchParams.delete('asset'); window.history.replaceState(null,'',u) }catch{} }
  const openDrawer = (item: DrawerItem)=>{
    lastOpenAt.current = Date.now()
    try{ clearTimeout(closeTimer.current) }catch{}
    setLeaving(false); leavingRef.current = false
    setPinned(false); pinnedRef.current = false
    setDrawer({ item }); setHover(null)
    unhighlight()
    // P3: ring nở một lần + glow tĩnh qua class (không nhấp nháy).
    const o = openersRef.current.get(item.key)
    if(o?.el){ try{ o.el.classList.remove('marker-selected'); void (o.el as any).offsetWidth; o.el.classList.add('marker-selected'); o.el.style.zIndex='30' }catch{} hlRef.current = o.el }
    syncUrl(item.key)
  }
  const closeDrawer = ()=>{
    if(leavingRef.current) return
    setLeaving(true); leavingRef.current = true
    unhighlight(); syncUrl(null)
    try{ clearTimeout(closeTimer.current) }catch{}
    closeTimer.current = setTimeout(()=>{ setDrawer(null); setLeaving(false); leavingRef.current = false }, 190)
  }
  // Reduced motion: camera nhảy tức thì thay vì bay.
  const animDur = (ms:number)=> (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) ? 0 : ms
  const distCenter = (lon:number, lat:number)=>{ try{ const c = mapRef.current?.getCenter() as any; return c ? haversineKm(lon, lat, c.lng, c.lat) : null }catch{ return null } }
  const canHover = ()=> typeof window !== 'undefined' && (window.matchMedia?.('(hover: hover)').matches ?? false)
  const wireHover = (el: HTMLElement, name: string, type: string, meta: ()=>string)=>{
    if(!canHover()) return
    el.addEventListener('mouseenter', (e:any)=>{ setHover({ x: e.clientX ?? 0, y: e.clientY ?? 0, name, type, meta: meta() }) })
    el.addEventListener('mousemove', (e:any)=>{ const x = e.clientX, y = e.clientY; setHover(h=> h && h.name === name ? { ...h, x: x ?? h.x, y: y ?? h.y } : h) })
    el.addEventListener('mouseleave', ()=> setHover(null))
  }
  // P9 pools lân cận từ dữ liệu sẵn có (ops + nước + xã + lịch sử + tuyến).
  const nearbyFor = (item: DrawerItem)=>{
    const ops = (allAssetsRef.current||[]).filter((a:any)=> a.status==='active' && typeof a.latitude==='number' && typeof a.longitude==='number')
    const waters = waterListRef.current||[]
    const feats = communesRef.current?.features || []
    const wpool = waters.filter((a:any)=> typeof a.latitude==='number').map((a:any)=>({ key:`water:${a.id}`, icon: a.asset_type==='hydro' ? '⚡' : '🌊', name:a.name, sub: a.asset_type==='hydro' ? 'Thủy điện' : 'Hồ chứa', lon:a.longitude, lat:a.latitude }))
    const spool = ops.filter((a:any)=> !['route'].includes(a.asset_type)).map((a:any)=>({ key:`asset:${a.id}`, icon: ICON_OF[a.asset_type]||'📍', name:a.name, sub: TYPE_OF[a.asset_type]||a.asset_type, lon:a.longitude, lat:a.latitude }))
    const rpool = ops.filter((a:any)=> a.geometry && (a.geometry.type==='LineString'||a.geometry.type==='MultiLineString')).map((a:any)=>{
      const coords = a.geometry.type==='LineString' ? a.geometry.coordinates : (a.geometry.coordinates[0]||[])
      const mid = coords[Math.floor(coords.length/2)] || [a.longitude||0, a.latitude||0]
      return { key:`route:${a.id}`, icon:'🛣️', name:a.name, sub:'Tuyến tiếp cận', lon:mid[0], lat:mid[1] }
    })
    const cpool = feats.slice(0, 400).map((ft:any)=>{
      let minx=1e9,miny=1e9,maxx=-1e9,maxy=-1e9
      const walk=(c:any)=>{ if(typeof c[0]==='number'){ if(c[0]<minx)minx=c[0]; if(c[0]>maxx)maxx=c[0]; if(c[1]<miny)miny=c[1]; if(c[1]>maxy)maxy=c[1] } else c.forEach(walk) }
      try{ walk(ft.geometry.coordinates) }catch{ return null }
      if(minx>maxx) return null
      return { key:`commune:${ft.properties?.ma_xa}`, icon:'🏘️', name:ft.properties?.ten_xa||'', sub:'Xã', lon:(minx+maxx)/2, lat:(miny+maxy)/2 }
    }).filter(Boolean) as { key:string; icon:string; name:string; sub?:string; lon:number; lat:number }[]
    const hpool = [
      ...HIST_FIRES.map((h,i)=>({ key:`hist:${i}`, icon:'🔥', name:h.name, sub:'Từng cháy', lon:h.coords[0], lat:h.coords[1] })),
      ...CIV_FIRES.map((h,i)=>({ h, i })).filter(({h})=> /tử vong|thi thể/i.test(h.note||'')).map(({h,i})=>({ key:`civ:${i}`, icon:h.kind, name:h.name, sub:'Sự cố', lon:h.coords[0], lat:h.coords[1] })),
    ]
    return groupNearby(item.lon, item.lat, [
      { group:'Water', pts: wpool }, { group:'Stations', pts: spool },
      { group:'Routes', pts: rpool }, { group:'Communities', pts: cpool },
      { group:'Historical', pts: hpool },
    ], 5, 3)
  }
  // Nearby tính lại khi drawer đổi hoặc registry nạp thêm (mở deep-link sớm).
  const nearbyMemo = useMemo(()=> drawer ? nearbyFor(drawer.item) : [], [drawer, openerTick]) // eslint-disable-line react-hooks/exhaustive-deps
  // P6 deep-link ?asset=… — đọc 1 lần khi mount, resolve khi data sẵn sàng.
  useEffect(()=>{
    try{ const a = new URLSearchParams(window.location.search).get('asset'); if(a) pendingAssetRef.current = a }catch{}
  },[])
  useEffect(()=>{
    const p = pendingAssetRef.current
    if(!p) return
    const o = openersRef.current.get(p)
    if(o){ pendingAssetRef.current = null; o.open() }
  },[openerTick])
  // P3 ESC luôn đóng drawer (kể cả ghim).
  useEffect(()=>{
    const onKey = (e:KeyboardEvent)=>{ if(e.key === 'Escape') closeDrawer() }
    window.addEventListener('keydown', onKey)
    return ()=> window.removeEventListener('keydown', onKey)
  },[])
  const burning = fireAlerts.filter((a:any)=>a.level==='CẢNH BÁO')
  const suspicious = fireAlerts.filter((a:any)=>a.level!=='CẢNH BÁO')
  const burnKey = burning.map((a:any)=>a.village).join('|')
  // M9: đám cháy nằm đâu trong tỉnh — từ tọa độ FIRMS sẵn có, không API mới.
  const burnCtx = (()=>{
    const f = burning[0]?.fire_coords
    if(!f) return null
    try{ return provinceContext(f[0], f[1]) }catch{ return null }
  })()
  // P6: một từ trạng thái duy nhất cho cả pill top + ticker đáy.
  const coverage = (()=>{
    if(mode==='demo') return { word:'DEMO', color:'#F59E0B' }
    const live = [sourceLive.firms, sourceLive.gee, sourceLive.sentinel2].filter(s=> s==='LIVE').length
    const known = [sourceLive.firms, sourceLive.gee, sourceLive.sentinel2].filter(Boolean).length
    if(known > 0 && live === known) return { word:'ĐẦY ĐỦ', color:'#10B981' }
    if(live > 0) return { word:'MỘT PHẦN', color:'#F59E0B' }
    return { word:'NGOẠI TUYẾN', color:'#EF4444' }
  })()
  // Trigger resize sau khi DOM mount (fix height 0)
  useEffect(()=>{
    if(!mapRef.current) return
    const t=setTimeout(()=> mapRef.current?.resize(), 300)
    return ()=> clearTimeout(t)
  }, [])
  // Tài sản vận hành (chòi/cam/bể/xe/máy bơm/tổ/trạm) do kiểm lâm nhập GPS.
  // Không có tài sản thì không vẽ gì — tuyệt đối không bịa marker mẫu.
  useEffect(()=>{
    let cancelled = false
    const markers: any[] = []
    assetMarkersRef.current = []
    const visNow = assetVisRef.current
    const applyMark = (el: HTMLElement, type: string)=>{
      if(visNow[type] === false) el.style.display = 'none'
    }
    api.assetsList().then((rows: any)=>{
      if(cancelled || !mapRef.current || !Array.isArray(rows)) return
      allAssetsRef.current = rows
      // Hồ chứa curated (16 hồ thật) — marker xanh dương phân biệt bể mini
      try{
        fetch(`${API_BASE}/api/water/assets`).then(r=> r.ok ? r.json() : null).then((w:any)=>{
          const list = Array.isArray(w?.assets) ? w.assets : []
          if(cancelled || !mapRef.current) return
          waterListRef.current = list
          list.forEach((a:any)=>{
            if(typeof a.latitude !== 'number' || typeof a.longitude !== 'number') return
            const wtype = a.asset_type === 'hydro' ? 'hydro' : 'water'
            const el = document.createElement('div')
            el.style.cssText = 'width:26px;height:26px;border-radius:999px;display:grid;place-items:center;background:#0369A1;color:#fff;font-size:14px;border:2px solid #fff;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,0.3)'; el.classList.add('mk-pop')
            el.textContent = a.asset_type === 'hydro' ? '⚡' : '🌊'
            applyMark(el, wtype)
            el.title = `${a.name} (${a.capacity_m3 ? (a.capacity_m3 / 1e6).toFixed(0) + ' triệu m³' : 'chưa rõ dung tích'})`
            const m = new (maplibregl as any).Marker({ element: el }).setLngLat([a.longitude, a.latitude] as any).addTo(mapRef.current!)
            markers.push(m)
            assetMarkersRef.current.push({ m, type: wtype })
            const wtypeLabel = wtype === 'hydro' ? 'Thủy điện' : 'Hồ chứa'
            const wcap = a.capacity_m3 ? `${(a.capacity_m3 / 1e6).toFixed(0)} triệu m³` : null
            const buildWaterItem = (): DrawerItem => ({
              key:`water:${a.id}`, kind: wtype as 'water', icon: wtype === 'hydro' ? '⚡' : '🌊',
              name: a.name, typeLabel: wtypeLabel, lon: a.longitude, lat: a.latitude,
              status: a.status === 'verified' ? 'ĐÃ XÁC MINH' : 'CẦN XÁC MINH',
              priority: wcap || undefined, manager: a.manager,
              note: [a.commune, a.water_area_ha ? `${a.water_area_ha} ha` : '', (()=>{ try{ return provinceContext(a.longitude, a.latitude) }catch{ return null } })() || ''].filter(Boolean).join(' · ') || undefined,
              assetId: a.id, viewer: a.viewer || null,
            })
            openersRef.current.set(`water:${a.id}`, { open: ()=> openDrawer(buildWaterItem()), el, lon: a.longitude, lat: a.latitude })
            wireHover(el, a.name, wtypeLabel, ()=>{
              const d = distCenter(a.longitude, a.latitude)
              return `${wcap || 'chưa rõ dung tích'}${d != null ? ` · cách tâm ${d.toFixed(1)}km` : ''}`
            })
            el.addEventListener('click', (ev)=>{ try{ (ev as any).stopPropagation() }catch{} openDrawer(buildWaterItem()) })
          })
          bumpOpeners()
        }).catch(()=> {})
      }catch{}
      rows.filter((a:any)=> a.status === 'active').forEach((a:any)=>{
        if(typeof a.latitude !== 'number' || typeof a.longitude !== 'number') return
        const el = document.createElement('div')
        el.style.cssText = 'width:26px;height:26px;border-radius:999px;display:grid;place-items:center;background:#0B1412;color:#fff;font-size:14px;border:2px solid #fff;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,0.3)'; el.classList.add('mk-pop')
        el.textContent = ICON_OF[a.asset_type] || '📍'
        applyMark(el, a.asset_type)
        el.title = `${a.name} (${TYPE_OF[a.asset_type] || a.asset_type})`
        const m = new (maplibregl as any).Marker({ element: el }).setLngLat([a.longitude, a.latitude] as any).addTo(mapRef.current!)
        markers.push(m)
        assetMarkersRef.current.push({ m, type: a.asset_type })
        const atypeLabel = TYPE_OF[a.asset_type] || a.asset_type
        const v = a.viewer || (a.viewer_url ? { viewer_type:'panoee', viewer_url:a.viewer_url, verification_status:'field_check_required' } : null)
        const buildAssetItem = (): DrawerItem => ({
          key:`asset:${a.id}`, kind:'asset', icon: ICON_OF[a.asset_type] || '📍',
          name: a.name, typeLabel: atypeLabel, lon: a.longitude, lat: a.latitude,
          status:'ĐANG HOẠT ĐỘNG',
          priority: a.capacity_liters ? `${a.capacity_liters} L` : (a.coverage_radius_m ? `Phủ sóng ${a.coverage_radius_m} m` : undefined),
          manager: a.manager, contact: a.contact || a.contact_phone, note: a.note,
          assetId: a.id, previewImageUrl: a.preview_image_url || null, viewer: v,
        })
        openersRef.current.set(`asset:${a.id}`, { open: ()=> openDrawer(buildAssetItem()), el, lon: a.longitude, lat: a.latitude })
        wireHover(el, a.name, atypeLabel, ()=>{
          const d = distCenter(a.longitude, a.latitude)
          return `${a.capacity_liters ? a.capacity_liters + ' L' : 'đang hoạt động'}${d != null ? ` · cách tâm ${d.toFixed(1)}km` : ''}`
        })
        el.addEventListener('click', (ev)=>{ try{ (ev as any).stopPropagation() }catch{} openDrawer(buildAssetItem()) })
      })
      bumpOpeners()
      // Tuyến tiếp cận (LineString) — vẽ đường, không marker
      try{
        const lines = (rows as any[]).filter((a:any)=> a.status === 'active' && a.geometry && (a.geometry.type === 'LineString' || a.geometry.type === 'MultiLineString'))
        if(lines.length && mapRef.current && !mapRef.current.getSource('asset-routes')){
          mapRef.current.addSource('asset-routes', { type:'geojson', data:{ type:'FeatureCollection', features: lines.map((a:any)=> ({ type:'Feature', properties:{ name:a.name, rid:a.id }, geometry:a.geometry })) } } as any)
          mapRef.current.addLayer({ id:'asset-routes', type:'line', source:'asset-routes', paint:{ 'line-color':'#0F766E', 'line-width':3, 'line-dasharray':[2,1.5] } } as any)
          try{ setHasRoutes(true) }catch{}
          enforceOrder(mapRef.current)
          try{
            mapRef.current.on('click', 'asset-routes', (e:any)=>{
              const rid = e.features?.[0]?.properties?.rid
              const hit = lines.find((a:any)=> String(a.id) === String(rid)) || lines[0]
              if(!hit) return
              const coords = hit.geometry.type === 'LineString' ? hit.geometry.coordinates : (hit.geometry.coordinates[0] || [])
              const mid = coords[Math.floor(coords.length / 2)] || [0, 0]
              const o = openersRef.current.get(`route:${hit.id}`)
              if(o) o.open()
              else openDrawer({ key:`route:${hit.id}`, kind:'route', icon:'🛣️', name:hit.name, typeLabel:'Tuyến tiếp cận', lon:mid[0], lat:mid[1], status:'ĐANG HOẠT ĐỘNG', assetId:hit.id, viewer:null })
            })
          }catch{}
        }
        // P6 deep-link + nearby cho tuyến (không marker).
        for(const a of lines){
          const coords = a.geometry.type === 'LineString' ? a.geometry.coordinates : (a.geometry.coordinates[0] || [])
          const mid = coords[Math.floor(coords.length / 2)] || [0, 0]
          const buildRouteItem = (): DrawerItem => ({
            key:`route:${a.id}`, kind:'route', icon:'🛣️', name:a.name, typeLabel:'Tuyến tiếp cận',
            lon:mid[0], lat:mid[1], status:'ĐANG HOẠT ĐỘNG',
            note:[a.road_condition, a.manager, a.contact].filter(Boolean).join(' · ') || undefined,
            survey:{ road: a.road_condition ?? null, surface: a.surface_type ?? null,
              seasonal: a.seasonal_access ?? null, vehicleLimit: a.max_vehicle_tons ?? null,
              source: a.source ?? null, verified: a.verification_date ?? null },
            assetId:a.id, viewer:null,
          })
          openersRef.current.set(`route:${a.id}`, { open:()=> openDrawer(buildRouteItem()), lon:mid[0], lat:mid[1] })
        }
        bumpOpeners()
      }catch{}
      ;(mapRef.current as any)._assetMarkers = markers
    }).catch(()=> {})
    return ()=>{ cancelled = true; try{ ((mapRef.current as any)?._assetMarkers || []).forEach((m:any)=> m.remove()) }catch{} assetMarkersRef.current = [] }
  },[])
  // M7/M9: bật/tắt marker theo nhóm hiển thị (không tải lại dữ liệu).
  useEffect(()=>{
    for(const { m, type } of assetMarkersRef.current){
      try{ (m.getElement() as HTMLElement).style.display = assetVis[type] === false ? 'none' : '' }catch{}
    }
    for(const { m, group } of histMarkersRef.current){
      try{ (m.getElement() as HTMLElement).style.display = (group === 'historical' && !assetVis.historical) ? 'none' : '' }catch{}
    }
  },[assetVis])
  // Hiển thị xã/thôn phân định + highlight 20km khi có cháy
  useEffect(()=>{
    if(!mapRef.current || !villages.length) return
    const existing = (mapRef.current as any)._villageMarkers as any[] || []
    existing.forEach((m:any)=>{ try{ m.remove()}catch{} })
    ;(mapRef.current as any)._villageMarkers = []
    if(mapZoom < 9) return // tầm tỉnh: ẩn nhãn thôn cho thoáng, vẫn giữ chấm CẤP xã
    const markers:any[]=[]
    villages.forEach((v:any)=>{
      const alert = fireAlerts.find((a:any)=> a.village===v.village)
      const el=document.createElement('div')
      el.style.padding='4px 6px'; el.style.borderRadius='8px'; el.style.fontSize='10px'; el.style.fontWeight='700'
      el.style.background= alert ? (alert.level==='CẢNH BÁO' ? '#DC2626' : '#F59E0B') : 'rgba(255,255,255,0.95)'
      el.style.color= alert ? '#fff' : '#334155'; el.style.border= alert ? '2px solid #fff' : '1px solid #E2E8E5'
      el.style.boxShadow='0 2px 6px rgba(0,0,0,0.15)'; el.textContent= v.village
      if(alert) el.title=`${v.commune} · ${alert.distance_km}km từ điểm cháy ${alert.fire_coords?.join(',')} · ${alert.level}`
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
  }, [villages, fireAlerts, mapZoom])
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
    // M4: zoom xuống góc dưới-phải (trên đã có cụm search/status/layers).
    // Thanh đáy cao cố định 46px nên nav + attribution lùi lên theo (CSS dưới).
    map.addControl(new maplibregl.NavigationControl(), 'bottom-right')
    // P3 click-off: click nền bản đồ đóng drawer (trừ khi ghim); guard 400ms
    // để không nuốt chính click vừa mở drawer (layer click nổi bọt tới map).
    map.on('click', ()=>{ if(!pinnedRef.current && Date.now() - lastOpenAt.current > 400) closeDrawer() })
    // Theo dõi zoom để ẩn/hiện nhãn thôn tham chiếu (chống đè nhau tầm tỉnh)
    map.on('zoomend', ()=>{ try{ setMapZoom(map.getZoom()) }catch{} })
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
      // M1-M4: Ranh tỉnh Gia Lai duy nhất (gialai_boundary.geojson ~26KB, 1 feature
      // GIA LAI) — KHÔNG load 33 tỉnh còn lại, KHÔNG render toàn quốc.
      fetchJson(['gialai_boundary.geojson','gialai_province.geojson']).then(async (prov:any)=>{
        await whenLoaded(map)
        if(!map.getSource('gialai-boundary')){
          // Dọn layer cũ nếu còn từ bản trước (đỏ alert) — style mới thuần cartography.
          for(const old of ['boundary-fill','boundary']) try{ if(map.getLayer(old)) map.removeLayer(old) }catch{}
          map.addSource('gialai-boundary', { type:'geojson', data: prov })
          // M2: line thuần kiểu ArcGIS/QGIS — không fill, không glow, không animation.
          map.addLayer({ id:'province-boundary', type:'line', source:'gialai-boundary',
            paint:{ 'line-color':'#E5F3FF', 'line-width':2, 'line-opacity':0.9,
              'line-join':'round', 'line-cap':'round' } } as any)
          // M3: đúng 1 label GIA LAI tại centroid — chỉ ở zoom ngắm tỉnh, không spam/lặp.
          try{
            if(map.getLayer('province-label')) map.removeLayer('province-label')
            if(map.getSource('gialai-centroid')) map.removeSource('gialai-centroid')
            const feat = prov?.features?.[0]
            const c = feat?.properties?.centroid
            if(Array.isArray(c)){
              map.addSource('gialai-centroid', { type:'geojson',
                data:{ type:'FeatureCollection', features:[{ type:'Feature',
                  properties:{ name:'GIA LAI' }, geometry:{ type:'Point', coordinates:c } }] } } as any)
              map.addLayer({ id:'province-label', type:'symbol', source:'gialai-centroid',
                minzoom:6, maxzoom:9,
                layout:{ 'text-field':'GIA LAI', 'text-size':15, 'text-letter-spacing':0.25,
                  'text-font':['Open Sans ExtraBold','Arial Unicode MS Bold'],
                  'text-allow-overlap':true, 'text-ignore-placement':true } as any,
                paint:{ 'text-color':'#E5F3FF', 'text-halo-color':'rgba(11,20,18,0.85)', 'text-halo-width':1.5 } })
            }
          }catch{}
          if(!showProvinceRef.current) for(const id of ['province-boundary','province-label']){
            try{ if(map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none') }catch{}
          }
          enforceOrder(map)
          lowerBase(map)
        }
      }).catch(()=>{ // fallback bbox nếu thiếu file
        if(!map.getSource('gialai-boundary')){
          map.addSource('gialai-boundary', { type:'geojson', data:{ type:'Feature', geometry:{ type:'Polygon', coordinates:[[[107.0,12.9],[109.6,12.9],[109.6,15.0],[107.0,15.0],[107.0,12.9]]] }, properties:{} } })
          map.addLayer({ id:'province-boundary', type:'line', source:'gialai-boundary', paint:{ 'line-color':'#E5F3FF', 'line-width':2, 'line-opacity':0.9 } })
        }
      })
      // 135 xã: bản nhẹ 836KB trước, rớt mới tải bản full 3.8MB
      fetchJson(['gialai_135_light.geojson','gialai_135.geojson']).then(async (fc:any)=>{
        await whenLoaded(map)
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
          map.addLayer({ id:'communes-fill', type:'fill', source:'gialai-communes', paint:{ 'fill-color': fillExpr, 'fill-opacity': 0.25, 'fill-opacity-transition':{ duration:220 } } })
          // RC M5: viền xã mảnh (1.5/1px) để ranh tỉnh (2px, không đổi) luôn nổi hơn.
          // Không glow, không animation.
          map.addLayer({ id:'communes-casing', type:'line', source:'gialai-communes', paint:{ 'line-color':'#0B1412', 'line-width':1.5, 'line-opacity':0.55 } })
          map.addLayer({ id:'communes-line', type:'line', source:'gialai-communes', paint:{ 'line-color':'#ffffff', 'line-width':1, 'line-opacity':1 } })
          map.addLayer({ id:'communes-label', type:'symbol', source:'gialai-communes', minzoom:7.5, layout:{ 'text-field':['get','ten_xa'], 'text-size':11, 'text-allow-overlap':false, 'text-ignore-placement':false, 'text-font':['Open Sans Bold','Arial Unicode MS Bold'] } as any, paint:{ 'text-color':'#111', 'text-halo-color':'#fff', 'text-halo-width':1.5 } })
          if(!showCommunesRef.current) for(const cid of ['communes-fill','communes-casing','communes-line','communes-label']){
            try{ if(map.getLayer(cid)) map.setLayoutProperty(cid, 'visibility', 'none') }catch{}
          }
          enforceOrder(map)
          lowerBase(map)
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
            // M10: xã nguy hiểm nhất (V>IV>III>II>I) cho Command Strip — chỉ dùng
            // field API đã trả (level/driver/action), không tính score mới.
            try{
              const rank = (l:string)=> l==='V'?0:l==='IV'?1:l==='III'?2:l==='II'?3:l==='I'?4:5
              const live = (rj.levels||[]).filter((l:any)=> l.level && l.level!=='MISSING')
              live.sort((a:any,b:any)=> rank(a.level)-rank(b.level))
              const top = live[0] || null
              setExecStrip(top ? { level: top.level, driver: top.driver || null,
                action: top.action || null, commune: top.name } : null)
            }catch{ setExecStrip(null) }
            const fcPts = { type:'FeatureCollection', features: pts.map((p:any)=>{
              const lv = byKey[p.ma] || byKey[p.name] || null
              return { type:'Feature', geometry:{ type:'Point', coordinates:[p.lon, p.lat] }, properties:{ ma_xa:p.ma, ten_xa:p.name, live: !!lv, level: lv?.level || 'MISSING', score: lv?.score ?? null, confidence: lv?.confidence ?? null, driver: (lv as any)?.driver || null, action: (lv as any)?.action || null, coverage: (lv as any)?.coverage || null } }
            }) }
            if(map.getSource('commune-fire-points')){ try{ map.removeLayer('commune-fire-label'); map.removeLayer('commune-fire'); map.removeSource('commune-fire-points') }catch{} }
            map.addSource('commune-fire-points', { type:'geojson', data: fcPts } as any)
            // RC B2: màu vòng tròn build từ LEVEL_COLORS (cùng nguồn với legend).
            const lvColor = ['match',['get','level'], ...LEVEL_ORDER.flatMap(lv=> [lv, LEVEL_COLORS[lv]]), '#9CA3AF'] as any
            map.addLayer({ id:'commune-fire', type:'circle', source:'commune-fire-points', paint:{ 'circle-radius':11, 'circle-color':lvColor, 'circle-stroke-color':'#fff', 'circle-stroke-width':2 } } as any)
            // Điểm MISSING: vòng xám, không chữ (tránh chữ MISSING đè bản đồ).
            map.addLayer({ id:'commune-fire-label', type:'symbol', source:'commune-fire-points', layout:{ 'text-field':['case', ['==',['get','level'],'MISSING'], '', ['get','level']], 'text-size':10, 'text-font':['Open Sans Bold','Arial Unicode MS Bold'] } as any, paint:{ 'text-color':'#fff' } } as any)
            enforceOrder(map)
            try{ if(communeFireClickRef.current) map.off('click','commune-fire',communeFireClickRef.current) }catch{}
            communeFireClickRef.current = (e:any)=>{
              const f=e.features?.[0]?.properties
              if(!f) return
              const ckey = `communept:${f.ma_xa || f.ten_xa}`
              const buildPtItem = (): DrawerItem => ({
                key: ckey, kind:'communePoint', icon:'🏘️', name: f.ten_xa, typeLabel:'Điểm CẤP cháy xã',
                lon: e.lngLat.lng, lat: e.lngLat.lat,
                status: f.live ? (f.level === 'MISSING' ? 'MISSING' : `CẤP ${f.level}`) : 'MISSING',
                note: (()=>{ try{ return provinceContext(e.lngLat.lng, e.lngLat.lat) || undefined }catch{ return undefined } })(),
                diagnosis: f.live ? {
                  level: f.level, driver: (f as any).driver, action: (f as any).action,
                  coverage: (f as any).coverage,
                } : { error:'MISSING: API không phản hồi. Bấm vào xã để chẩn đoán trực tiếp.' },
              })
              openersRef.current.set(ckey, { open:()=> openDrawer(buildPtItem()), lon: e.lngLat.lng, lat: e.lngLat.lat })
              openDrawer(buildPtItem())
              window.dispatchEvent(new CustomEvent('ecochain-select-area', { detail:{ area: f.ten_xa, lat: e.lngLat.lat, lon: e.lngLat.lng } }))
              onSelectRef.current?.('commune-point', f.ten_xa)
            }
            map.on('click','commune-fire',communeFireClickRef.current)
            }catch(e){ console.warn('Không tải được CẤP cháy từng xã', e); setLevelsState('degraded'); setExecStrip(null) }
        }
      }).catch(e=>{ console.warn('Không tải được ranh xã', e); setCommunesError('Không tải được ranh xã. Kiểm tra file public/') })
      // (Điểm trạm HTML đã bỏ — thay bằng lớp điểm CẤP từng xã bên dưới)
      // Vùng trọng điểm — marker cam ⚠, phân biệt điểm từng cháy (đen/vàng)
      RISK_ZONES.forEach((h, ri)=>{
        const el=document.createElement('div')
        el.style.width='26px'; el.style.height='26px'; el.style.borderRadius='999px'; el.style.display='grid'; el.style.placeItems='center'
        el.style.background='#F59E0B'; el.style.color='#fff'; el.style.fontSize='14px'; el.style.border='2px solid #fff'; el.style.cursor='pointer'; el.style.boxShadow='0 2px 6px rgba(0,0,0,0.3)'; el.classList.add('mk-pop')
        el.textContent='⚠'; el.title=`${h.name} · ${h.place} (trọng điểm)`
        const buildRiskItem = (): DrawerItem => ({
          key:`risk:${ri}`, kind:'risk', icon:'⚠', name: h.name, typeLabel:'Vùng trọng điểm',
          lon: h.coords[0], lat: h.coords[1], status:'CẢNH BÁO CAO',
          note: `${h.place} · ${h.note}`,
        })
        openersRef.current.set(`risk:${ri}`, { open:()=> openDrawer(buildRiskItem()), el, lon: h.coords[0], lat: h.coords[1] })
        wireHover(el, h.name, 'Vùng trọng điểm', ()=>{
          const d = distCenter(h.coords[0], h.coords[1])
          return `chưa cháy · cảnh báo cao${d != null ? ` · cách tâm ${d.toFixed(1)}km` : ''}`
        })
        el.addEventListener('click', (ev)=>{
          try{ (ev as any).stopPropagation() }catch{}
          openDrawer(buildRiskItem())
        })
        const rm = new (maplibregl as any).Marker({ element: el }).setLngLat(h.coords as any).addTo(map)
        histMarkersRef.current.push({ m: rm, group:'risk' })
      })
      // M9: điểm từng cháy rừng 2026 = Historical Incidents (opt-in, mặc định ẩn).
      HIST_FIRES.forEach((h, hi)=>{
        const el=document.createElement('div')
        el.style.width='26px'; el.style.height='26px'; el.style.borderRadius='999px'; el.style.display='grid'; el.style.placeItems='center'
        el.style.background='#1F2937'; el.style.color='#FBBF24'; el.style.fontSize='14px'; el.style.border='2px solid #fff'; el.style.cursor='pointer'; el.style.boxShadow='0 2px 6px rgba(0,0,0,0.3)'; el.classList.add('mk-pop')
        if(!assetVisRef.current.historical) el.style.display='none'
        el.textContent='🔥'; el.title=`${h.name} · ${h.place} (từng cháy)`
        const hAny = h as any
        const buildHistItem = (): DrawerItem => ({
          key:`hist:${hi}`, kind:'hist', icon:'🔥', name: h.name, typeLabel:'Từng cháy (lịch sử)',
          lon: h.coords[0], lat: h.coords[1], status:'ĐÃ KIỂM SOÁT',
          note: `${h.place} · ${hAny.time || ''} · ${h.note}`,
        })
        openersRef.current.set(`hist:${hi}`, { open:()=> openDrawer(buildHistItem()), el, lon: h.coords[0], lat: h.coords[1] })
        wireHover(el, h.name, 'Từng cháy Hè 2026', ()=>{
          const d = distCenter(h.coords[0], h.coords[1])
          return `${hAny.time || ''}${d != null ? ` · cách tâm ${d.toFixed(1)}km` : ''}`
        })
        el.addEventListener('click', (ev)=>{
          try{ (ev as any).stopPropagation() }catch{}
          openDrawer(buildHistItem())
        })
        const hm = new (maplibregl as any).Marker({ element: el }).setLngLat(h.coords as any).addTo(map)
        histMarkersRef.current.push({ m: hm, group:'historical' })
      })
      // Cháy nhà/cơ sở — sự cố TỬ VONG vào Historical (opt-in); còn lại hiện thường.
      CIV_FIRES.forEach((h, ci)=>{
        const isFatal = /tử vong|thi thể/i.test(h.note || '')
        const el=document.createElement('div')
        el.style.width='26px'; el.style.height='26px'; el.style.borderRadius='999px'; el.style.display='grid'; el.style.placeItems='center'
        el.style.background='#1E40AF'; el.style.fontSize='14px'; el.style.border='2px solid #fff'; el.style.cursor='pointer'; el.style.boxShadow='0 2px 6px rgba(0,0,0,0.3)'; el.classList.add('mk-pop')
        if(isFatal && !assetVisRef.current.historical) el.style.display='none'
        el.textContent=h.kind; el.title=`${h.name} · ${h.place} (cháy nhà/cơ sở)`
        const buildCivItem = (): DrawerItem => ({
          key:`civ:${ci}`, kind:'civ', icon: h.kind, name: h.name, typeLabel:'Cháy nhà/cơ sở',
          lon: h.coords[0], lat: h.coords[1], status: h.time,
          note: `${h.place} · ${h.note} (tọa độ ước tính trung tâm)`,
        })
        openersRef.current.set(`civ:${ci}`, { open:()=> openDrawer(buildCivItem()), el, lon: h.coords[0], lat: h.coords[1] })
        wireHover(el, h.name, 'Cháy nhà/cơ sở', ()=>{
          const d = distCenter(h.coords[0], h.coords[1])
          return `${h.time}${d != null ? ` · cách tâm ${d.toFixed(1)}km` : ''}`
        })
        el.addEventListener('click', (ev)=>{
          try{ (ev as any).stopPropagation() }catch{}
          openDrawer(buildCivItem())
        })
        const cm = new (maplibregl as any).Marker({ element: el }).setLngLat(h.coords as any).addTo(map)
        histMarkersRef.current.push({ m: cm, group: isFatal ? 'historical' : 'civ' })
      })
      // Giữ toàn cảnh tỉnh — không auto zoom vào xã; chỉ fit lại sau khi tải communes
      map.once('idle', ()=> map.fitBounds([[107.45, 12.99], [109.36, 14.70]], { padding:30, duration:0 }))
      bumpOpeners()
    })
    return () => { map.remove(); (mapRef as any).current = null }
  }, [])

  useEffect(()=>{
    if(locState.status==='granted' && mapRef.current && locState.lon && locState.lat){
      mapRef.current.flyTo({ center:[locState.lon, locState.lat], zoom:11, duration:animDur(600) } as any)
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
      if(a==='burning' && mapRef.current) mapRef.current.flyTo({ center:[108.68, 13.92], zoom:11, duration:animDur(500) } as any)
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
    // fill=true: lấp đầy khung cha (dùng khi embed preview) — mặc định giữ nguyên.
    <div className={`relative w-full ${fill ? '' : 'h-[calc(100vh-56px)] min-h-[500px]'} bg-slate-900 relative z-0${idleing ? ' presenting' : ''}`} style={{position:'relative', height: fill ? '100%' : 'calc(100vh - 56px)', borderRadius:0, overflow:'hidden', background:'#0f172a'}}
      onPointerMove={poke} onKeyDown={poke} onWheel={poke} onClick={poke}>
      <div ref={mapContainer} className="w-full h-full relative z-0 absolute inset-0" style={{ width:'100%', height:'100%', minHeight: fill ? 0 : '500px' }} />

      {/* M7 Visibility Mode: top bar (search + status) ẩn hoàn toàn ở execView —
          chỉ giữ Map + Province + Fire + Assets + banner/strip. Mở lại bằng nút Hiện giao diện. */}
      {!execView && <div className="chrome" style={{position:'absolute', top:10, left:60, right:60, display:'flex', gap:8, alignItems:'center', justifyContent:'center', pointerEvents:'none'}}>
        <div style={{position:'relative', pointerEvents:'auto', width:280, maxWidth:'40vw'}}>
        <div style={{background:'#fff', border:'1px solid #E2E8E5', borderRadius:12, padding:'8px 14px', display:'flex', gap:8, alignItems:'center', boxShadow:'0 8px 24px rgba(0,0,0,0.12)', width:'100%'}}>
          <span style={{opacity:0.6, fontSize:13}}>⌕</span>
          <input value={search} placeholder={`Tìm xã...${communesCount?` (${communesCount} xã)`:''}`} style={{border:0, outline:'none', flex:1, fontSize:13, background:'transparent', minWidth:0}} onChange={e=>{ const v=e.target.value; setSearch(v); const all=communesRef.current?.features||[]; const q=normVi(v.trim()); setSuggests(!q?[]:all.filter((f:any)=> normVi(f.properties?.ten_xa||'').includes(q)).slice(0,8).map((f:any)=>f.properties)) }} onKeyDown={e=>{ if(e.key==='Enter' && suggests[0]) selectCommune(suggests[0]) }} />
        </div>
        {suggests.length>0 && <div style={{position:'absolute', top:'100%', left:0, right:0, marginTop:6, background:'#fff', borderRadius:12, boxShadow:'0 8px 24px rgba(0,0,0,0.15)', overflow:'hidden', zIndex:20}}>
          {suggests.map((s:any)=> <button key={s.ma_xa} onClick={()=>selectCommune(s)} style={{display:'block', width:'100%', textAlign:'left', padding:'8px 12px', fontSize:12, border:0, background:'transparent', cursor:'pointer', borderBottom:'1px solid #F1F5F9'}}>{s.ten_xa} <span style={{color:'#94A3B8'}}>· {s.ma_xa}</span></button>)}
        </div>}
        </div>
        {!execView && <div style={{position:'relative', pointerEvents:'auto'}}>
        <div title="Trạng thái vận hành — xem chi tiết ở thanh đáy" className="chip-x" style={{background:'#fff', border:'1px solid #E2E8E5', borderRadius:12, padding:'8px 14px', fontSize:12, display:'flex', gap:8, alignItems:'center', color:'#0B1412', whiteSpace:'nowrap', boxShadow:'0 8px 24px rgba(0,0,0,0.12)'}}>
          {(()=>{
            const dot = (c:string)=> <span style={{width:8, height:8, borderRadius:999, background:c, display:'inline-block', flex:'none'}}/>
            if(mode==='demo') return (<>{dot('#F59E0B')}<span style={{fontWeight:800}}>📡 DEMO</span></>)
            const live = [sourceLive.firms, sourceLive.gee, sourceLive.sentinel2].filter(s=> s==='LIVE').length
            const known = [sourceLive.firms, sourceLive.gee, sourceLive.sentinel2].filter(Boolean).length
            if(known > 0 && live === known) return (<>{dot('#10B981')}<span style={{fontWeight:800}}>Dữ liệu: ĐẦY ĐỦ</span></>)
            if(live > 0) return (<>{dot('#D97706')}<span style={{fontWeight:800, background:'#FFFBEB', border:'1px solid #FDE68A', color:'#92400E', borderRadius:999, padding:'2px 10px'}}>Dữ liệu: MỘT PHẦN</span></>)
            return (<>{dot('#EF4444')}<span style={{fontWeight:800}}>Dữ liệu: NGOẠI TUYẾN</span></>)
          })()}
        </div>
        </div>}
      </div>}
      {/* M10 Command Strip — thanh đầu trả lời 4 câu hỏi (CẤP/driver/hành động/xã),
          hiện cả ở Clean Mode. Không score, không confidence. */}
      {execStrip?.level && (
        <div style={{background:'rgba(11,20,18,0.92)', color:'#fff', borderRadius:12, padding:'8px 14px', display:'flex', gap:12, alignItems:'center', fontSize:12, boxShadow:'0 8px 24px rgba(0,0,0,0.3)', maxWidth:'92vw', pointerEvents:'auto', flexWrap:'wrap', justifyContent:'center'}}>
          <span>🔥 <b>CẤP {execStrip.level}</b></span>
          {execStrip.driver && execStrip.driver!=='MISSING' && <span>⚠ {execStrip.driver}</span>}
          {execStrip.action && <span>✅ {execStrip.action}</span>}
          {execStrip.commune && <span>🏘️ {execStrip.commune}</span>}
        </div>
      )}
      {/* M11: banner xếp cột — degraded + cháy/nghi ngờ không bao giờ đè nhau. */}
      <div style={{position:'absolute', top:56, left:'50%', transform:'translateX(-50%)', zIndex:15, display:'flex', flexDirection:'column', gap:6, alignItems:'center', maxWidth:'92vw', pointerEvents:'none'}}>
      {/* P10 one-attention: khi banner cháy hiện thì degraded nhường (ghi chú
          gộp vào banner cháy) — một thời điểm một điểm nhấn. */}
      {levelsState==='degraded' && !(burnKey && bannerOff!==burnKey) && (
        <div style={{background:'rgba(69,26,3,0.92)', color:'#FDE68A', borderRadius:999, padding:'6px 14px', fontSize:11, fontWeight:700, boxShadow:'0 4px 12px rgba(0,0,0,0.2)', maxWidth:'92vw', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', pointerEvents:'auto'}}>⚠️ Cấp cháy từng xã chưa tải đủ. Điểm xám là MISSING, không phải mức an toàn</div>
      )}

      {/* Banner treo: ĐANG CHÁY (đỏ) / NGHI NGỜ warning (vàng) — từ quét FIRMS 20km mỗi 60s */}
      {burnKey && bannerOff!==burnKey ? (
        <div style={{background:'#DC2626', color:'#fff', borderRadius:999, padding:'8px 12px 8px 16px', display:'flex', gap:10, alignItems:'center', boxShadow:'0 8px 24px rgba(220,38,38,0.5)', fontSize:12, fontWeight:800, maxWidth:'92vw', pointerEvents:'auto'}}>
          <span>🔥 ĐANG CHÁY: {burning[0]?.village} ({burning[0]?.commune}){burning.length>1?` +${burning.length-1} điểm`:''} · {burning[0]?.distance_km}km · {burning[0]?.acq_date||''}{burnCtx ? ` · ${burnCtx}` : ''}{levelsState==='degraded' ? ' · CẤP xã thiếu dữ liệu' : ''}</span>
          <button onClick={()=>setBannerOff(burnKey)} title="Ẩn banner" style={{border:0, borderRadius:999, background:'rgba(255,255,255,0.25)', color:'#fff', width:22, height:22, cursor:'pointer', fontWeight:800}}>✕</button>
        </div>
      ) : !burnKey && suspicious.length>0 ? (
        <div style={{background:'rgba(245,158,11,0.95)', color:'#451A03', borderRadius:999, padding:'6px 14px', fontSize:11, fontWeight:700, boxShadow:'0 4px 12px rgba(0,0,0,0.15)', maxWidth:'92vw', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', pointerEvents:'auto'}}>⚠ {suspicious.length} điểm nghi ngờ trong 20km — quét FIRMS mỗi 60s</div>
      ) : null}
      </div>

      {/* Kết quả mô phỏng lan truyền: polygons theo giờ + xã ảnh hưởng thật */}
      {spreadInfo && (
        <div style={{position:'absolute', left:12, top:112, zIndex:10, width:300, maxWidth:'80vw', background:'rgba(255,255,255,0.97)', borderRadius:12, padding:12, boxShadow:'0 8px 24px rgba(0,0,0,0.2)', border:'1px solid #FECACA'}}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
            <b style={{fontSize:12}}>🔥 Mô phỏng lan truyền</b>
            <button onClick={()=> { setSpreadInfo(null); try{ const m = mapRef.current as any; if(m?.getLayer('spread-fill')) m.removeLayer('spread-fill'); if(m?.getLayer('spread-outline')) m.removeLayer('spread-outline'); if(m?.getSource('spread-src')) m.removeSource('spread-src') }catch{} }} style={{border:0, background:'transparent', cursor:'pointer'}}>✕</button>
          </div>
          {spreadInfo.loading && <div style={{fontSize:12, color:'#64748B', marginTop:6}}>Đang mô phỏng theo gió thực tế…</div>}
          {spreadInfo.error && <div style={{fontSize:12, color:'#B91C1C', marginTop:6}}>⚠ {spreadInfo.error}</div>}
          {spreadInfo.steps && (
            <div style={{marginTop:6, display:'flex', flexDirection:'column', gap:6}}>
              {spreadInfo.steps.map((s:any)=> (
                <div key={s.hour} style={{fontSize:11, background:'#FEF2F2', borderRadius:8, padding:'6px 8px'}}>
                   <b>Sau {s.hour}h:</b> lan {s.length_km} km · {s.area_ha} ha · gió {spreadInfo.inputs?.wind_speed_kmh ?? 'MISSING'} km/h
                  {(s.affected_communes?.length > 0) && <div style={{marginTop:2}}>🏘️ {s.affected_communes.map((c:any)=> c.name).join(' · ')}</div>}
                </div>
              ))}
              <div style={{fontSize:10, color:'#64748B'}}>Mô hình ellipse heuristic theo gió/dốc · gió: {spreadInfo.wind_source || ''} · {spreadInfo.disclaimer || ''}</div>
            </div>
          )}
        </div>
      )}

      {/* Control Panel — Glassmorphism + Collapse/Expand, logic giữ nguyên */}
      {execView ? (
        <button onClick={()=> setExecView(false)} title="Hiện giao diện đầy đủ" style={{position:'absolute', top:64, left:12, zIndex:10, display:'flex', gap:6, alignItems:'center', background:'rgba(255,255,255,0.95)', border:'1px solid #E2E8E5', borderRadius:999, padding:'8px 16px', fontSize:12, fontWeight:800, cursor:'pointer', boxShadow:'0 4px 12px rgba(0,0,0,0.15)'}}>👁 Hiện giao diện</button>
      ) : !showLayers ? (
        <button onClick={()=>setShowLayers(true)} title="Mở bảng điều khiển lớp phủ" style={{position:'absolute', top:64, left:12, zIndex:10, width:38, height:38, display:'grid', placeItems:'center', background:'rgba(15,23,42,0.75)', backdropFilter:'blur(12px)', WebkitBackdropFilter:'blur(12px)', border:'1px solid rgba(255,255,255,0.15)', borderRadius:12, color:'#fff', fontSize:16, cursor:'pointer', boxShadow:'0 8px 24px rgba(0,0,0,0.25)', transition:'transform .25s ease, opacity .25s ease'}} className="chrome">☰</button>
      ) : (
      <div style={{position:'absolute', top:64, left:12, zIndex:10, width:270, maxHeight:'calc(100% - 220px)', overflow:'auto', background:'rgba(15,23,42,0.75)', backdropFilter:'blur(12px)', WebkitBackdropFilter:'blur(12px)', borderRadius:12, border:'1px solid rgba(255,255,255,0.15)', boxShadow:'0 8px 24px rgba(0,0,0,0.25)', padding:10, display:'flex', flexDirection:'column', gap:8, color:'#fff', transition:'transform .3s ease, opacity .3s ease', transform:'translateX(0)', opacity:1}}>
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
          <div style={{fontSize:12, fontWeight:800, letterSpacing:.3}}>Lớp phủ bản đồ</div>
          <button onClick={()=>setShowLayers(false)} title="Thu gọn" style={{width:26, height:26, display:'grid', placeItems:'center', background:'rgba(255,255,255,0.1)', border:'1px solid rgba(255,255,255,0.15)', borderRadius:8, color:'#fff', fontSize:13, cursor:'pointer'}}>━</button>
        </div>
        {/* P2/P3: một nút ẩn toàn bộ chrome → Executive Clean Mode */}
        <button onClick={()=>{ setExecView(true); setShowLayers(false) }} title="Ẩn giao diện — chỉ giữ bản đồ + cảnh báo" style={{border:'1px solid rgba(255,255,255,0.25)', background:'rgba(255,255,255,0.12)', borderRadius:999, padding:'7px 0', fontSize:12, fontWeight:800, cursor:'pointer', color:'#fff'}}>👁 Ẩn giao diện</button>
        <div style={{fontSize:11, fontWeight:700, opacity:.9}}>Nền bản đồ</div>
        <div style={{display:'flex', background:'rgba(255,255,255,0.1)', borderRadius:999, padding:3, gap:3}}>
          {([['osm','🗺️ Phố'],['terrain','⛰️ Hình'],['esri','🛰️ Vệ tinh'],['hybrid','🛣️ Lai']] as [string,string][]).map(([v,label])=>(
            <button key={v} onClick={()=>switchBaseXyz(v)} style={{flex:1, border:0, borderRadius:999, padding:'6px 0', fontSize:11, fontWeight:700, cursor:'pointer', background:baseXyz===v?'#fff':'transparent', color:baseXyz===v?'#0B1412':'#fff'}}>{label}</button>
          ))}
        </div>
        <div style={{height:1, background:'rgba(255,255,255,0.15)'}}/>
        <div style={{fontSize:11, fontWeight:700, opacity:.9}}>Ranh giới hành chính</div>
        <label style={{display:'flex', gap:6, alignItems:'center', background: showProvince?'rgba(16,185,129,0.25)':'rgba(255,255,255,0.08)', padding:'6px 8px', borderRadius:8, fontSize:12, border:'1px solid rgba(255,255,255,0.15)', cursor:'pointer', color:'#fff'}}>
          <input type="checkbox" checked={showProvince} onChange={()=> setShowProvince(v=> !v)} /> ☑ Ranh giới tỉnh
        </label>
        <label style={{display:'flex', gap:6, alignItems:'center', background: showCommunes?'rgba(16,185,129,0.25)':'rgba(255,255,255,0.08)', padding:'6px 8px', borderRadius:8, fontSize:12, border:'1px solid rgba(255,255,255,0.15)', cursor:'pointer', color:'#fff'}}>
          <input type="checkbox" checked={showCommunes} onChange={()=> setShowCommunes(v=> !v)} /> ☑ Ranh giới xã
        </label>
        <label style={{display:'flex', gap:6, alignItems:'center', background: terrain3d?'rgba(16,185,129,0.25)':'rgba(255,255,255,0.08)', padding:'6px 8px', borderRadius:8, fontSize:12, border:'1px solid rgba(255,255,255,0.15)', cursor:'pointer', color:'#fff'}}>
          <input type="checkbox" checked={terrain3d} onChange={()=> setTerrain3d(v=> !v)} /> ⛰️ 3D địa hình (kéo chuột phải để nghiêng)
        </label>
        <div style={{fontSize:11, fontWeight:700, opacity:.9}}>Lớp AI/GEE</div>
        {[
          ['hotspot','🔥 Điểm nhiệt FIRMS', 'hotspot', 'VIIRS_SNPP_NRT'],
          ['ndvi','🌿 NDVI', 'ndvi', 'ndvi'],
          ['s1','📡 Sentinel-1 VV/VH', 's1', 's1'],
        ].map(([k,label, key, geeLayer])=>(
          <label key={k} style={{display:'flex', gap:6, alignItems:'center', background: activeSat[key]?'rgba(16,185,129,0.25)':'rgba(255,255,255,0.08)', padding:'6px 8px', borderRadius:8, fontSize:12, border:'1px solid rgba(255,255,255,0.15)', cursor:'pointer', color:'#fff'}}>
            <input type="checkbox" checked={!!activeSat[key as string]} onChange={()=> toggleSat(key as string, geeLayer as string)} /> {label}
          </label>
        ))}
        <div style={{fontSize:11, fontWeight:700, opacity:.9}}>Tài sản & sự cố (mặc định: 💧🏕️)</div>
        {([['water','🌊 Hồ chứa'],['station','🏕️ Trạm'],['team','⛺ Tổ kiểm lâm'],['firetruck','🚒 Xe chữa cháy'],['pump','🔧 Máy bơm'],['watchtower','🗼 Chòi canh'],['camera','📷 Camera'],['hydro','⚡ Thủy điện'],['historical','📜 Sự cố lịch sử (opt-in)']] as [string,string][]).map(([k,label])=>(
          <label key={k} style={{display:'flex', gap:6, alignItems:'center', background: assetVis[k]?'rgba(16,185,129,0.25)':'rgba(255,255,255,0.08)', padding:'6px 8px', borderRadius:8, fontSize:12, border:'1px solid rgba(255,255,255,0.15)', cursor:'pointer', color:'#fff'}}>
            <input type="checkbox" checked={!!assetVis[k]} onChange={()=> setAssetVis(s=> ({...s, [k]:!s[k]}))} /> {label}
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
        <div style={{fontSize:11, opacity:0.6, color:'#e2e8f0'}}>{communesError ? communesError : (communesCount ? `Đã tải ${communesCount} xã · bbox 107.0,12.9,109.6,15.0` : 'Đang tải ranh xã')}</div>
      </div>)}

      {/* Base layer switcher (Google-Maps style) — collapsed icon, expands to
          thumbnail grid; same state as panel toggle; persisted to localStorage */}
      {!execView && !showLayers && (
      <div className="chrome" style={{position:'absolute', top:110, left:12, zIndex:10}}>
        {!baseOpen ? (
          <button onClick={()=> setBaseOpen(true)} title="Đổi nền bản đồ" aria-label="Đổi nền bản đồ"
            style={{width:44, height:44, display:'grid', placeItems:'center', background:'#fff', border:'1px solid #E2E8E5', borderRadius:12, boxShadow:'0 8px 24px rgba(0,0,0,0.12)', fontSize:18, cursor:'pointer'}}>
            {(BASE_LAYERS.find(l=> l.id===baseXyz)?.icon) || '🗺️'}
          </button>
        ) : (
          <div className="sw-pop" style={{background:'#fff', border:'1px solid #E2E8E5', borderRadius:12, boxShadow:'0 8px 24px rgba(0,0,0,0.12)', padding:10, width:228}}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8}}>
              <b style={{fontSize:12}}>Nền bản đồ</b>
              <button onClick={()=> setBaseOpen(false)} aria-label="Thu gọn" style={{border:0, background:'transparent', cursor:'pointer', fontSize:13, fontWeight:800, color:'#64748B'}}>✕</button>
            </div>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8}}>
              {BASE_LAYERS.map(l=> {
                const on = baseXyz === l.id
                return (
                  <button key={l.id} onClick={()=> switchBaseXyz(l.id)} title={l.label}
                    style={{border: on ? '2px solid #0F766E' : '1px solid #E2E8E5', borderRadius:10, padding:0, overflow:'hidden', cursor:'pointer',
                      background: on ? '#ECFDF5' : '#fff', boxShadow: on ? '0 2px 8px rgba(15,118,110,0.25)' : 'none',
                      transition:'border-color 200ms cubic-bezier(0.4,0,0.2,1), background-color 200ms cubic-bezier(0.4,0,0.2,1), box-shadow 200ms cubic-bezier(0.4,0,0.2,1)'}}>
                    <span style={{position:'relative', display:'block', width:'100%', height:52, background:'#F1F5F9'}}>
                      <img src={l.thumb} alt="" loading="lazy" onError={e=> { (e.target as HTMLImageElement).style.display='none' }}
                        style={{width:'100%', height:'100%', objectFit:'cover', display:'block'}} />
                      <span style={{position:'absolute', left:4, bottom:4, fontSize:12, background:'rgba(255,255,255,0.9)', borderRadius:6, padding:'0 4px'}}>{l.icon}</span>
                    </span>
                    <span style={{display:'block', fontSize:11, fontWeight:800, padding:'5px 4px', color: on ? '#0F766E' : '#0B1412'}}>{l.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>)}

      {/* Right controls — icon gọn để full view */}
      {!execView && (
      <div className="chrome" style={{position:'absolute', top:64, right:12, display:'flex', flexDirection:'column', gap:8, zIndex:10}}>
        <button onClick={requestLoc} title="Vị trí của tôi" style={{width:38, height:38, display:'grid', placeItems:'center', background:'#fff', border:'1px solid #E2E8E5', borderRadius:12, boxShadow:'0 8px 24px rgba(0,0,0,0.12)', fontSize:16}}>📍</button>
        <button onClick={async()=>{
          const bounds = mapRef.current?.getBounds()
          const bbox = bounds ? `${bounds.getWest().toFixed(1)},${bounds.getSouth().toFixed(1)},${bounds.getEast().toFixed(1)},${bounds.getNorth().toFixed(1)}` : '107.0,12.9,109.6,15.0'
          const center = mapRef.current?.getCenter()
          const tileUrl = XYZ_TILES[baseXyz]?.url || 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
          setInfo({ layer:'smoke', status:'ANALYZING', source:'Gemini Vision' })
          try{
            const r=await fetch(`${API}/api/ai/smoke/detect`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ tile_url: tileUrl, lat: center?.lat || 13.9, lon: center?.lng || 108.3, bbox }) })
            const j=await r.json()
            const analyzed = j.status === 'LIVE'
            const isSmoke = analyzed ? j.result?.is_smoke === true : null
            setInfo({ layer:'smoke', status: j.status, source:'Gemini Vision', satellite: tileUrl.includes('arcgis')?'Esri':tileUrl.includes('eox')?'Sentinel-2':'Google', acquired: new Date().toISOString().slice(0,10), is_smoke: isSmoke, reason: j.result?.reason || (analyzed ? undefined : 'AI khói chưa khả dụng (thiếu key/thiếu ảnh). Không kết luận, không vẽ marker'), alert: j.result?.alert, bbox })
            if(isSmoke){
              // Chỉ vẽ marker khi Vision THẬT xác nhận khói — không vẽ từ fallback
              const el=document.createElement('div'); el.style.width='22px'; el.style.height='22px'; el.style.borderRadius='999px'; el.style.background='#DC2626'; el.style.border='3px solid #fff'; el.style.boxShadow='0 0 12px rgba(220,38,38,1)'; el.classList.add('mk-pop')
              new (maplibregl as any).Marker({ element: el }).setLngLat([center?.lng || 108.3, center?.lat || 13.9] as any).addTo(mapRef.current)
            }
          }catch(e){ setInfo({ layer:'smoke', status:'UNAVAILABLE', reason:String(e) }) }
        }} style={{background: info?.layer==='smoke' && info?.is_smoke ? '#DC2626':'#fff', color: info?.layer==='smoke' && info?.is_smoke ? '#fff':'#0B1412', border:'1px solid #E2E8E5', borderRadius:999, padding:'10px 16px', boxShadow:'0 8px 24px rgba(0,0,0,0.12)', fontSize:12, fontWeight:700, display:'flex', gap:8, alignItems:'center'}}>{info?.layer==='smoke' && info?.status==='ANALYZING' ? '⏳ Đang phân tích' : '🤖 AI phát hiện khói'}</button>
        <div className="ecomap-legend" style={{background:'#fff', border:'1px solid #E2E8E5', borderRadius:12, padding:'12px 14px', fontSize:12, boxShadow:'0 8px 24px rgba(0,0,0,0.12)', maxHeight:260, overflow:'auto'}}>
          <div style={{fontWeight:800, fontSize:12}}>Chú giải — chỉ lớp đang bật</div>
          {/* RC B2: màu CẤP + icon tài sản lấy từ LEVEL_COLORS/ICON_OF/TYPE_OF
              (cùng nguồn với code vẽ marker) — không gộp icon khác icon. */}
          <div className="eleg-sec">CẤP CHÁY XÃ</div>
          {LEVEL_ORDER.map(lv=> (
            <div key={lv} style={{display:'flex', gap:6, alignItems:'center'}}>
              <span style={{width:10, height:10, borderRadius:999, background:LEVEL_COLORS[lv], display:'inline-block', flex:'none'}} />Cấp {lv}
            </div>
          ))}
          {levelsState==='degraded' && <div>⬜ Điểm xám — MISSING (chưa có dữ liệu)</div>}
          <div className="eleg-sec">RANH GIỚI</div>
          {showProvince && <div style={{display:'flex', gap:6, alignItems:'center'}}><span style={{width:18, borderTop:'2px solid #E5F3FF', display:'inline-block'}} />Tỉnh</div>}
          {showCommunes && <div style={{display:'flex', gap:6, alignItems:'center'}}><span style={{width:18, borderTop:'1px solid #ffffff', outline:'1px solid #0B1412', display:'inline-block'}} />Xã</div>}
          <div className="eleg-sec">TÀI SẢN</div>
          {ASSET_KEYS.map(k=> assetVis[k] ? <div key={k}>{ICON_OF[k]} {TYPE_OF[k]}</div> : null)}
          <div className="eleg-sec">ĐỐI TƯỢNG</div>
          {levelsState==='degraded'
            ? <div>🏘️ Điểm CẤP xã — MISSING (bấm vào xã để chẩn đoán)</div>
            : <div>🏘️ Điểm CẤP từng xã (bấm để xem)</div>}
          {hasRoutes && <div>🛣️ Tuyến tiếp cận</div>}
          {activeSat.hotspot && <div>🔥 Điểm nóng FIRMS</div>}
          {activeSat.hotspot && <div>🌡️ Nhiệt nhân tạo (loại khỏi cảnh báo)</div>}
          {activeSat.ndvi && <div>🌿 NDVI (raster)</div>}
          {activeSat.s1 && <div>📡 Sentinel-1 (raster)</div>}
          <div>⚠ Vùng trọng điểm (chưa cháy)</div>
          <div>🏠 Cháy nhà · 🏭 Cháy cơ sở</div>
          {assetVis.historical && <div>🔥 Từng cháy 2026 · 🏠 Sự cố tử vong</div>}
          <div>📍 Vị trí tìm kiếm</div>
          {info?.layer==='smoke' && info?.is_smoke && <div style={{marginTop:6, padding:'6px 8px', background:'#FEE2E2', borderRadius:8, color:'#991B1B', fontWeight:700}}>🚨 {info.alert?.message || 'Phát hiện khói'}<br/><span style={{fontWeight:400, fontSize:10}}>Vision phát hiện khói. {info.reason}</span></div>}
          {info?.layer==='smoke' && info?.is_smoke===false && info?.status==='LIVE' && <div style={{marginTop:6, padding:'6px 8px', background:'#DCFCE7', borderRadius:8, color:'#065F46'}}>✓ Không có khói — an toàn</div>}
          {info?.layer==='smoke' && info?.is_smoke!==true && info?.is_smoke!==false && <div style={{marginTop:6, padding:'6px 8px', background:'#FEF3C7', borderRadius:8, color:'#92400E'}}>{info.reason || 'AI khói chưa khả dụng. Không kết luận.'}</div>}
        </div>
      </div>)}

      {/* P6 minimal ticker — một nút trạng thái (bấm mở chi tiết) + mốc
          thời gian + lọc mây. Không badge rải, không marquee. */}
      {!execView && (
      <div className="chrome" style={{position:'absolute', bottom:'env(safe-area-inset-bottom, 0px)', left:0, right:0, height:52, background:'#fff', borderTop:'1px solid #E2E8E5', color:'#0B1412', padding:'0 16px', display:'flex', gap:0, alignItems:'center', overflowX:'auto', whiteSpace:'nowrap', boxShadow:'0 -4px 16px rgba(0,0,0,0.06)'}}>
        <span style={{position:'relative', flex:'none', paddingRight:16}}>
        <button onClick={()=> setStatusOpen(o=> !o)} aria-expanded={statusOpen} title="Trạng thái vận hành — bấm để xem chi tiết từng nguồn"
          style={{background:'transparent', border:0, color:'#0B1412', fontSize:12, fontWeight:800, cursor:'pointer', display:'flex', gap:8, alignItems:'center', padding:0}}>
          <span style={{width:8, height:8, borderRadius:999, background:coverage.color, display:'inline-block'}}/>⚠ Dữ liệu: {coverage.word} <span style={{opacity:0.6, fontSize:10}}>{statusOpen ? '▴' : '▾'}</span>
        </button>
        {statusOpen && (
          <div className="anim-pop" style={{position:'fixed', left:12, bottom:'calc(46px + env(safe-area-inset-bottom, 0px) + 8px)', background:'#fff', color:'#0B1412', borderRadius:12, boxShadow:'0 8px 24px rgba(0,0,0,0.25)', padding:'10px 12px', fontSize:11, minWidth:230, zIndex:40, whiteSpace:'normal'}}>
            <div style={{fontWeight:800, marginBottom:6}}>Trạng thái vận hành</div>
            {[['FIRMS', sourceLive.firms],['GEE', sourceLive.gee],['Sentinel-2', sourceLive.sentinel2]].map(([k, v]: any)=> (
              <div key={k} style={{display:'flex', justifyContent:'space-between', gap:12, padding:'3px 0', borderTop:'1px solid #F1F5F9'}}>
                <span>{k}</span><b style={{color: v === 'LIVE' ? '#166534' : '#92400E'}}>{v || 'MISSING'}</b>
              </div>
            ))}
            <div style={{display:'flex', justifyContent:'space-between', gap:12, padding:'3px 0', borderTop:'1px solid #F1F5F9'}}>
              <span>Tổng thể</span><b>{liveStatus}</b>
            </div>
            <div style={{color:'#64748B', fontSize:10, marginTop:4}}>Cập nhật: {now.toLocaleTimeString('vi-VN')}</div>
          </div>
        )}
        </span>
        <label style={{fontSize:12, fontWeight:700, display:'flex', gap:8, alignItems:'center', flex:'none', paddingLeft:16, borderLeft:'1px solid #E2E8E5', height:32}}>Thời gian:
          <select value={dateRange} onChange={e=> setDateRange(e.target.value as any)} style={{height:32, padding:'0 10px', borderRadius:8, border:'1px solid #E2E8E5', background:'#F8FAFC', fontSize:12, fontWeight:700}} aria-label="Mốc thời gian ảnh vệ tinh">
            <option value="latest">Mới nhất</option><option value="7d">7 ngày</option><option value="30d">30 ngày</option><option value="3m">3 tháng</option>
          </select>
        </label>
        <label style={{fontSize:12, fontWeight:700, display:'flex', gap:8, alignItems:'center', flex:'none', paddingLeft:16, borderLeft:'1px solid #E2E8E5', height:32}}>Mây &lt; <select value={cloud} onChange={e=> setCloud(Number(e.target.value))} style={{height:32, padding:'0 10px', borderRadius:8, border:'1px solid #E2E8E5', background:'#F8FAFC', fontSize:12, fontWeight:700}} aria-label="Lọc mây"><option value={20}>20%</option><option value={40}>40%</option></select></label>
      </div>)}

      {/* Panel quét FIRMS: ĐANG CHÁY (đỏ) + NGHI NGỜ warning (vàng) */}
      {fireAlerts.length>0 && (
        <div className="fire-panel" style={{position:'absolute', bottom:'max(58px, calc(58px + env(safe-area-inset-bottom, 0px)))', left:12, background:'rgba(255,255,255,0.98)', backdropFilter:'blur(12px)', borderRadius:12, padding:12, minWidth:280, maxWidth:360, boxShadow:'0 8px 24px rgba(0,0,0,0.15)', border: burning.length ? '2px solid #DC2626' : '1px solid #F59E0B'}}>
          {burning.length>0 && <div style={{fontWeight:800, fontSize:12, color:'#DC2626'}}>🔥 ĐANG CHÁY ≤5km ({burning.length})</div>}
          {burning.length>0 && <div style={{maxHeight:110, overflow:'auto', marginTop:6, display:'flex', flexDirection:'column', gap:6}}>
            {burning.map((a:any, i:number)=>(
              <div key={'b'+i} style={{display:'flex', justifyContent:'space-between', alignItems:'center', background:'#FEE2E2', padding:'6px 8px', borderRadius:8, fontSize:11}}>
                <div><b>{a.village}</b> <span style={{color:'#64748B'}}>({a.commune})</span><br/><span style={{fontSize:10, color:'#334155'}}>{a.distance_km}km từ cháy · {a.acq_date || 'MISSING'}</span></div>
                <button onClick={()=> watchFire(a)} style={{fontSize:10, padding:'2px 6px', borderRadius:999, background:'#DC2626', color:'#fff', border:0, cursor:'pointer'}}>XEM</button>
              </div>
            ))}
          </div>}
          {suspicious.length>0 && <div style={{fontWeight:800, fontSize:12, color:'#92400E', marginTop:burning.length?8:0}}>⚠ NGHI NGỜ ≤20km — warning ({suspicious.length})</div>}
          {suspicious.length>0 && <div style={{maxHeight:100, overflow:'auto', marginTop:6, display:'flex', flexDirection:'column', gap:6}}>
            {suspicious.map((a:any, i:number)=>(
              <div key={'s'+i} style={{display:'flex', justifyContent:'space-between', alignItems:'center', background:'#FEF3C7', padding:'6px 8px', borderRadius:8, fontSize:11}}>
                <div><b>{a.village}</b> <span style={{color:'#64748B'}}>({a.commune})</span><br/><span style={{fontSize:10, color:'#334155'}}>{a.distance_km}km từ điểm nhiệt · {a.acq_date || 'MISSING'}</span></div>
                <button onClick={()=> watchFire(a)} style={{fontSize:10, padding:'2px 6px', borderRadius:999, background:'#F59E0B', color:'#fff', border:0, cursor:'pointer'}}>THEO DÕI</button>
              </div>
            ))}
          </div>}
          <div style={{fontSize:10, color:'#64748B', marginTop:6}}>Quét FIRMS mỗi 60s · Bán kính 20km · Gia Lai 107.0,12.9,109.6,15.0</div>
        </div>
      )}
      {fireAlerts.length===0 && villages.length>0 && (
        <div style={{position:'absolute', bottom:'max(64px, calc(64px + env(safe-area-inset-bottom, 0px)))', left:12, background:'#fff', border:'1px solid #E2E8E5', borderRadius:12, padding:'10px 14px', fontSize:11, boxShadow:'0 8px 24px rgba(0,0,0,0.12)', maxWidth:'min(420px, 90vw)'}}>
          ✓ {villages.length} điểm tham chiếu đang theo dõi (mẫu, không đầy đủ thôn/xã). Không có cháy trong 20km
        </div>
      )}
      {/* M11: info-panel chừa gutter phải cho nav (ẩn ở Clean Mode) */}
      {!execView && info && (
        <div className="info-panel" style={{position:'absolute', bottom:'max(58px, calc(58px + env(safe-area-inset-bottom, 0px)))', right:76, background:'rgba(255,255,255,0.96)', backdropFilter:'blur(12px)', borderRadius:12, padding:12, minWidth:280, maxWidth:360, boxShadow:'0 8px 24px rgba(0,0,0,0.12)'}}>
          {info && info.layer==='watch' && <><div style={{fontWeight:700, fontSize:12}}>👁 THEO DÕI · {info.village} <span style={{fontSize:10, color:'#64748B'}}>{info.status === 'ANALYZING' ? 'ĐANG KIỂM TRA' : info.status}</span></div><div style={{fontSize:12, marginTop:6, color:'#334155'}}>📍 Điểm cháy: {info.fire?.lat?.toFixed(4)}, {info.fire?.lon?.toFixed(4)} · cách {info.fire?.distance_km}km · {info.fire?.date || 'MISSING'}</div>{info.status === 'ANALYZING' && <div style={{fontSize:12, marginTop:6, color:'#64748B'}}>Đang lấy bản tin CẤP...</div>}{info.status !== 'ANALYZING' && (info.rating ? <div style={{fontSize:12, marginTop:6, display:'flex', flexDirection:'column', gap:3}}><div>🔥 CẤP <b>{info.rating.level}</b> · {info.rating.label}</div><div>⚠ Driver: <b>{info.rating.driver}</b></div><div>✅ Hành động: <b>{info.rating.action}</b></div><div style={{color:'#64748B', fontSize:11}}>Độ phủ: {info.rating.coverage}</div></div> : <div style={{fontSize:12, marginTop:6, color:'#B45309'}}>MISSING: chưa có bản tin. FIELD_VERIFICATION_REQUIRED.</div>)}</>}
          {info && info.layer==='forecast' && <><div style={{fontWeight:700, fontSize:12}}>📋 BẢN TIN DỰ BÁO — {info.name}</div><div style={{marginTop:6}}>
            {info.status==='LOADING' && <span style={{fontSize:12, color:'#64748B'}}>Đang lấy bản tin</span>}
            {info.status!=='LOADING' && info.rating && <ForecastCard area={info.name} rating={info.rating} firms={info.firms} temp={info.temp != null ? `${info.temp}°C` : 'MISSING'} condition={info.condition} updated={info.updated} />}
            {info.status!=='LOADING' && !info.rating && <span style={{fontSize:12, color:'#B91C1C'}}>Không lấy được bản tin (UNAVAILABLE).</span>}
          </div></>}
          {info && info.layer!=='watch' && info.layer!=='forecast' && <><div style={{fontWeight:700, fontSize:12}}>DỮ LIỆU VỆ TINH — {info.layer} <span style={{fontSize:10, color:'#64748B'}}>{info.status==='CONFIGURATION_REQUIRED' ? 'DEMO · Cache Vệ tinh Gia Lai' : info.status}</span></div><div style={{fontSize:12, marginTop:6, color:'#334155'}}>Nguồn: {info.status==='CONFIGURATION_REQUIRED' ? 'Esri/Sentinel Tile tĩnh · DEMO Cache' : (info.source || 'Sentinel-2')} · Ngày: {info.acquired || info.date || 'MISSING'} {info.status==='CONFIGURATION_REQUIRED' && <span style={{color:'#F59E0B'}}>· Fallback BaseMap</span>}</div>
          {info.layer==='smoke' && info.is_smoke && <div style={{marginTop:6, padding:'6px 8px', background:'#FEE2E2', borderRadius:8, color:'#991B1B', fontSize:11, fontWeight:700}}>🚨 {info.alert?.message || 'Phát hiện khói'}<br/><span style={{fontWeight:400}}>Vision phát hiện khói. {info.reason}</span></div>}
          </>}
        </div>
      )}

      {mode==='demo' && !tourOpen && !execView && <button onClick={()=>setTourOpen(true)} style={{position:'absolute', bottom:'max(58px, calc(58px + env(safe-area-inset-bottom, 0px)))', right:76, zIndex:20, border:0, borderRadius:999, background:'#F59E0B', color:'#000', fontWeight:800, fontSize:12, padding:'8px 14px', cursor:'pointer', boxShadow:'0 4px 12px rgba(0,0,0,0.2)'}}>▶ Tutorial DEMO</button>}
      {mode==='demo' && tourOpen && <DemoTour onDone={()=>setTourOpen(false)} />}

      {/* P1 Asset Detail Drawer (single selection) + P4 hover preview */}
      {drawer && <AssetDrawer item={drawer.item} pinned={pinned} leaving={leaving}
        nearby={nearbyMemo}
        onClose={closeDrawer} onTogglePin={()=> { setPinned(p=> !p); pinnedRef.current = !pinnedRef.current }}
        onFocus={(it)=>{ try{ mapRef.current?.easeTo({ center:[it.lon, it.lat], duration:animDur(500) }) }catch{} }}
        onSimulate={(lon, lat)=> runSpread(lon, lat)}
        onSelect={(key)=>{ const o = openersRef.current.get(key); if(o) o.open() }}
        onForecast={async (it)=>{
          setInfo({ layer:'forecast', status:'LOADING', name: it.name })
          const r = await api.forecastRating(it.name, it.lat, it.lon, 'commune')
          setInfo(r && r.rating
            ? { layer:'forecast', status:'LIVE', name: it.name, rating: r.rating,
                firms: r.firms_hotspot_count, temp: r.measured?.temperature,
                condition: r.measured?.condition, updated: r.updated_at }
            : { layer:'forecast', status:'UNAVAILABLE', name: it.name })
        }} />}
      {hover && !drawer && <HoverPreview x={hover.x} y={hover.y} name={hover.name} type={hover.type} meta={hover.meta} />}

      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}} @keyframes marquee{0%{transform:translateX(100%)}100%{transform:translateX(-100%)}}
      @keyframes mk-pop{ 0%{ opacity:0; transform:scale(0); } 60%{ opacity:1; transform:scale(1.1); } 100%{ opacity:1; transform:scale(1); } }
      .mk-pop{ animation:mk-pop 300ms cubic-bezier(0.32,0.72,0,1); transition:transform 180ms cubic-bezier(0.4,0,0.2,1), box-shadow 180ms cubic-bezier(0.4,0,0.2,1); }
      .mk-pop:hover{ transform:scale(1.15); }
      @keyframes sw-pop{ from{ opacity:0; transform:scale(0.92); } to{ opacity:1; transform:scale(1); } }
      .sw-pop{ animation:sw-pop 220ms cubic-bezier(0.32,0.72,0,1); transform-origin:top left; }
      /* P2/P11 chrome + presenting: controls mờ dần 200ms sau 10s idle */
      .chrome{ transition: opacity 200ms cubic-bezier(0.16,1,0.3,1); }
      .presenting .chrome{ opacity:0 !important; pointer-events:none !important; }
      .presenting .maplibregl-ctrl-bottom-right{ opacity:0; pointer-events:none; }
      .maplibregl-ctrl-bottom-right{ transition: opacity 200ms cubic-bezier(0.16,1,0.3,1); }
      /* M4/M11: nav + attribution lùi lên trên thanh đáy 46px (cố định) + safe-area */
      .maplibregl-ctrl-bottom-right{ margin:0 10px max(56px, calc(56px + env(safe-area-inset-bottom, 0px))) 0; }
      .maplibregl-ctrl-bottom-left{ margin:0 0 max(56px, calc(56px + env(safe-area-inset-bottom, 0px))) 10px; }
      /* EcoMap overlay consistency: shared radius/shadow treatment */
      .ecomap-legend{ scrollbar-width:thin; scrollbar-color:#CBD5D1 transparent; }
      .ecomap-legend::-webkit-scrollbar{ width:6px; }
      .ecomap-legend::-webkit-scrollbar-thumb{ background:#CBD5D1; border-radius:999px; }
      .ecomap-legend::-webkit-scrollbar-track{ background:transparent; }
      .eleg-sec{ font-size:10px; font-weight:800; color:#64748B; letter-spacing:0.8px; border-top:1px solid #F1F5F9; padding-top:8px; margin-top:8px; }
      .ecomap-legend > div:not(.eleg-sec):not(:first-child){ display:flex; gap:8px; align-items:center; padding:3px 6px; border-radius:6px; line-height:1.5; }
      .ecomap-legend > div:not(.eleg-sec):not(:first-child):hover{ background:#F8FAFC; }
      /* Zoom/nav controls grouped as one floating card */
      .maplibregl-ctrl-group{ background:#fff !important; border:1px solid #E2E8E5 !important; border-radius:12px !important; box-shadow:0 8px 24px rgba(0,0,0,0.12) !important; overflow:hidden; }
      .maplibregl-ctrl-group button{ width:38px !important; height:38px !important; }
      .maplibregl-ctrl-group button + button{ border-top:1px solid #F1F5F9 !important; }
      .maplibregl-ctrl-attrib{ font-size:10px !important; }
      @media (max-width: 640px){
        .fire-panel{ top:108px !important; bottom:auto !important; left:12px !important; right:12px !important; min-width:0 !important; max-width:none !important; max-height:30vh; overflow:auto; }
        .info-panel{ left:12px !important; right:12px !important; min-width:0 !important; max-width:none !important; max-height:28vh; overflow:auto; }
      }`}</style>
    </div>
  )
}
