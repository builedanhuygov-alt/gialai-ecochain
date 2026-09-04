import { useEffect, useState } from 'react'
import { useScope } from '../store/useScope'

const LEVELS = [
  { lv:'I', label:'Thấp', color:'bg-sky-500', text:'text-sky-600', bg:'bg-sky-50', border:'border-sky-200' },
  { lv:'II', label:'Trung bình', color:'bg-emerald-500', text:'text-emerald-600', bg:'bg-emerald-50', border:'border-emerald-200' },
  { lv:'III', label:'Cao', color:'bg-amber-400', text:'text-amber-600', bg:'bg-amber-50', border:'border-amber-200' },
  { lv:'IV', label:'Nguy hiểm', color:'bg-orange-500', text:'text-orange-600', bg:'bg-orange-50', border:'border-orange-200' },
  { lv:'V', label:'Cực kỳ nguy hiểm', color:'bg-red-600', text:'text-red-600', bg:'bg-red-50', border:'border-red-200' },
]

const API = ((import.meta as any).env?.VITE_API_BASE || 'http://localhost:8000').replace(/\/$/, '')
// Tọa độ đại diện từng khu vực để AI lấy vệ tinh/thời tiết/FIRMS đúng ô
const AREA_COORDS: [string, number, number][] = [
  ['Chư Prông', 13.55, 107.65], ['Ia Mơr', 13.55, 107.65], ['Kon Ka Kinh', 14.25, 108.45],
  ['An Khê', 13.98, 108.65], ['Hội Sơn', 13.92, 108.68], ['Quy Nhơn', 13.78, 109.21],
]
const coordsFor = (area:string): [number, number] => {
  for(const [k, lat, lon] of AREA_COORDS) if(area.includes(k)) return [lat, lon]
  return [13.9, 108.3]
}

export default function FireRiskGauge({ compact=false, onSelect }: { compact?:boolean; onSelect?:(lv:string)=>void }){
  const { scope } = useScope()
  const [level, setLevel] = useState('I')
  const [flash, setFlash] = useState(false)
  const [score, setScore] = useState<number | null>(null)
  const [conf, setConf] = useState<number | null>(null)
  const [factors, setFactors] = useState<string[]>([])
  const [inputs, setInputs] = useState<string>('')
  const [status, setStatus] = useState<string>('—')
  const [manual, setManual] = useState(false)
  const [loading, setLoading] = useState(false)

  // AI vệ tinh: NDVI (GEE Sentinel-2) + thời tiết + FIRMS + địa hình → score → cấp I-V
  const analyze = async (area:string)=>{
    const [lat, lon] = coordsFor(area)
    const unit = area || 'GiaLai'
    setLoading(true)
    try{
      const r = await fetch(`${API}/api/fire/risk?administrative_unit_id=${encodeURIComponent(unit)}&lat=${lat}&lon=${lon}`)
      const j = await r.json()
      if(j.warning_level){ setLevel(j.warning_level); setManual(false) }
      setScore(j.risk_score ?? null); setConf(j.confidence ?? null)
      setFactors(Object.keys(j.factors || {}))
      const ev = j.evidence || {}
      setInputs(`NDVI ${ev.satellite?.ndvi ?? '?'} · ${ev.weather?.temperature ?? '?'}°C · FIRMS ${Array.isArray(ev.hotspots) ? ev.hotspots.length : (ev.hotspots ?? 0)} điểm`)
      setStatus(j.status || 'LIVE')
    }catch{ setStatus('UNAVAILABLE') }
    setLoading(false)
  }

  useEffect(()=>{ analyze(scope.commune || scope.village || '') }, [scope.commune, scope.village])

  // Listen to map selection → chạy lại AI cho khu vực đó
  useEffect(()=>{
    const handler = (e:any)=>{
      const d = e.detail || {}
      const area = d.area || d.commune || ''
      if(area) analyze(String(area))
    }
    window.addEventListener('ecochain-demo' as any, handler)
    window.addEventListener('ecochain-select-area' as any, handler)
    return ()=> {
      window.removeEventListener('ecochain-demo' as any, handler)
      window.removeEventListener('ecochain-select-area' as any, handler)
    }
  },[])

  useEffect(()=>{
    const isHigh = level==='IV' || level==='V'
    setFlash(isHigh)
  },[level])

  const idx = LEVELS.findIndex(l=> l.lv===level)
  const pct = ((idx+0.5)/5)*100

  return (
    <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden ${compact ? 'p-3' : 'p-4'}`}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[11px] font-extrabold tracking-[0.08em] text-slate-700">CẤP DỰ BÁO CHÁY RỪNG GIA LAI</h3>
        <span className={`text-[10px] font-bold px-2 py-1 rounded-full border ${LEVELS[idx]?.bg} ${LEVELS[idx]?.border} ${LEVELS[idx]?.text}`}>CẤP {level}</span>
      </div>

      {/* AI vệ tinh: đầu vào + trạng thái thật */}
      <div className="flex items-center gap-2 text-[10px] text-slate-500">
        <span>🛰️ {loading ? 'AI đang phân tích vệ tinh...' : inputs || 'Chờ AI vệ tinh'}</span>
        <span className={`px-2 py-0.5 rounded-full font-bold ${status==='LIVE' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>{status}</span>
        {manual && <span className="px-2 py-0.5 rounded-full font-bold bg-slate-100 text-slate-500 border border-slate-200">Chọn tay</span>}
        <button onClick={()=> analyze(scope.commune || scope.village || '')} className="ml-auto underline hover:text-slate-700">Tính lại</button>
      </div>
      {(score !== null || conf !== null) && (
        <div className="flex items-center gap-2 text-[11px] text-slate-600">
          {score !== null && <span>Risk <b>{score}/100</b></span>}
          {conf !== null && <span>Tin cậy <b>{conf}%</b></span>}
          {factors.length > 0 && <span className="truncate">· {factors.join(', ')}</span>}
        </div>
      )}

      {/* Gauge */}
      <div className="relative h-9 bg-slate-100 rounded-full flex overflow-hidden p-1 gap-1">
        {LEVELS.map(l=>(
          <button
            key={l.lv}
            onClick={()=> { setLevel(l.lv); setManual(true); onSelect?.(l.lv) }}
            title="Chọn tay để thử kịch bản (AI tính lại khi đổi khu vực)"
            className={`flex-1 rounded-full text-[11px] font-bold transition-all flex items-center justify-center relative z-10 ${level===l.lv ? 'text-white shadow-md' : 'text-slate-600 hover:bg-white/60'}`}
            style={level===l.lv ? {background: l.color.replace('bg-','')} : {}}
          >
            {level===l.lv && <span className={`absolute inset-0 rounded-full ${l.color} -z-10`} />}
            <span className="relative">{l.lv}</span>
          </button>
        ))}
        {/* Needle */}
        <div className="absolute top-0 bottom-0 w-0.5 bg-slate-900 z-20 transition-all duration-700 ease-out" style={{ left:`calc(${pct}% - 1px)` }}>
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-slate-900 rotate-45 rounded-sm" />
        </div>
        {/* Background colors */}
        <div className="absolute inset-1 flex rounded-full overflow-hidden opacity-30 pointer-events-none">
          {LEVELS.map(l=> <div key={l.lv} className={`flex-1 ${l.color}`} />)}
        </div>
      </div>
      <div className="flex justify-between text-[10px] text-slate-500 mt-1 px-1">
        <span>I</span><span>II</span><span>III</span><span>IV</span><span>V</span>
      </div>

      {/* Labels */}
      <div className="grid grid-cols-5 gap-1 mt-3">
        {LEVELS.map(l=>(
          <div key={l.lv} onClick={()=> setLevel(l.lv)} className={`text-center py-1.5 rounded-xl border text-[10px] leading-tight cursor-pointer transition-all ${level===l.lv ? `${l.bg} ${l.border} ${l.text} font-bold shadow-sm` : 'bg-white border-slate-100 text-slate-500 hover:border-slate-200'}`}>
            <div className="font-extrabold">{l.lv}</div>
            <div className="hidden sm:block text-[9px] mt-0.5 leading-none">{l.label}</div>
          </div>
        ))}
      </div>

      {/* Flash warning IV/V */}
      {flash && (
        <div className="mt-3 bg-red-50 border border-red-200 rounded-xl px-3 py-2 flex items-center gap-2 animate-pulse">
          <span className="w-2 h-2 bg-red-600 rounded-full animate-ping" />
          <span className="text-xs font-extrabold text-red-700 tracking-wide">CẢNH BÁO: Kích hoạt kịch bản giám sát AI khẩn cấp</span>
        </div>
      )}

      <div className="mt-3 inline-flex items-center gap-1.5 text-[10px] font-semibold tracking-wide text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
        <span className="w-1.5 h-1.5 bg-emerald-600 rounded-full" />
        Tiêu chuẩn Chi cục Kiểm lâm
      </div>
    </div>
  )
}
