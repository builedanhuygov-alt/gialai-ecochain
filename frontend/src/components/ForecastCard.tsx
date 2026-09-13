import { useState } from 'react'

type Rating = {
  level: string; label: string; major_risk_driver: string;
  supporting_factors?: string[]; operational_status?: string;
  recommended_action?: string[]; data_coverage_status?: string;
  sources?: Record<string, boolean>; firms_hotspots?: number | string;
  components?: Record<string, string>;
}

// Executive palette.
export const LEVEL_COLOR: Record<string, string> = {
  I: '#2E8B57', II: '#3CB371', III: '#FFC107', IV: '#FF7043', V: '#D32F2F',
}
const LEVEL_ORDER = ['I', 'II', 'III', 'IV', 'V']
const headerText = (lv: string) => (lv === 'III' ? '#3B2F00' : '#fff')
// Action icon leo thang theo cấp.
export const actionIcon = (lv: string) => (lv === 'V' ? '🚨' : lv === 'IV' ? '🚒' : '✅')

// Keyword fallback — chỉ dùng khi không suy được từ components.
export function driverCategory(driver: string | null | undefined): string | null {
  if(!driver || driver === 'MISSING') return null
  if(/FIRMS|điểm nóng/i.test(driver)) return 'IGNITION'
  if(/địa hình|dốc|đồi|ridge/i.test(driver)) return 'TERRAIN'
  if(/thảm|NDVI|nhiên liệu|fuel/i.test(driver)) return 'FUEL'
  if(/nước|water|hồ/i.test(driver)) return 'WATER'
  if(/đường|tiếp cận|trạm|lực lượng|access/i.test(driver)) return 'ACCESS'
  if(/nhiệt|ẩm|gió|mưa|khô|nóng|hạn/i.test(driver)) return 'WEATHER'
  return null
}

const CALM = /không phát hiện|tốt|gần đây|ổn định|chưa cần/i

// Driver mạnh nhất theo thứ tự IGNITION > WEATHER > FUEL > TERRAIN >
// WATER > ACCESS — mọi câu chữ đều là dữ liệu thật từ engine
// (components / supporting_factors / firms count), không sinh lý do mới.
export function pickDriver(r: Rating): { category: string; text: string } | null {
  const comp = r.components || {}
  const sup = r.supporting_factors || []
  const firms = r.firms_hotspots
  const noteOf = (v?: string) => {
    if(!v || v === 'MISSING' || v === 'NOT_CONFIGURED') return null
    const i = v.indexOf(': ')
    return i >= 0 ? v.slice(i + 2) : null
  }
  const findSup = (re: RegExp) => sup.find(s => re.test(s)) || null
  if(comp.ignition === 'ACTIVE' && typeof firms === 'number')
    return { category: 'IGNITION', text: `${firms} điểm nóng FIRMS` }
  const wnote = noteOf(comp.weather_stress)
  if(comp.weather_stress?.startsWith('HIGH') && wnote)
    return { category: 'WEATHER', text: wnote }
  if(comp.fuel === 'HIGH')
    return { category: 'FUEL', text: findSup(/NDVI|thảm/i) || 'Thảm thực vật khô (NDVI thấp)' }
  if(comp.terrain === 'HIGH') {
    const t = findSup(/dốc|địa hình/i)
    if(t) return { category: 'TERRAIN', text: t }
  }
  if(comp.water === 'DISTANT')
    return { category: 'WATER', text: findSup(/nguồn nước|nước/i) || 'Nguồn nước ở xa' }
  if(comp.weather_stress?.startsWith('ELEVATED') && wnote)
    return { category: 'WEATHER', text: wnote }
  const d = r.major_risk_driver
  if(!d || d === 'MISSING') return null
  // Không có tín hiệu xấu nào đo được mà driver chỉ là câu êm
  // (VD "Độ ẩm tốt") → chip xanh ỔN ĐỊNH thay vì gán nhãn rủi ro sai.
  if(CALM.test(d) && comp.ignition !== 'ACTIVE') return { category: 'ỔN ĐỊNH', text: d }
  return { category: driverCategory(d) || 'WEATHER', text: d }
}

// Main message — một câu duy nhất từ firms_hotspots thật.
export function mainMessage(firms: number | string | undefined): string {
  if(typeof firms === 'number') return firms > 0
    ? 'Có điểm nóng FIRMS trong vùng theo dõi.'
    : 'Không phát hiện điểm nóng FIRMS trong vùng theo dõi.'
  return 'Dữ liệu FIRMS hiện chưa khả dụng.'
}

// Executive summary 1–2 câu: câu FIRMS + câu driver (trừ khi trùng/êm).
export function execSummary(r: Rating, firms: number | string | undefined): string[] {
  const first = mainMessage(firms)
  const d = r.major_risk_driver
  if(!d || d === 'MISSING' || CALM.test(d)) return [first]
  if(/FIRMS|điểm nóng/i.test(d)) return [first]
  const lowered = d.charAt(0).toLowerCase() + d.slice(1)
  return [first, `Nguy cơ hiện tại chủ yếu do ${lowered}.`]
}

// Trend — chỉ khi có lịch sử (previousLevel). Không dữ liệu → null.
export function trendOf(prev: string | undefined, cur: string): string | null {
  const a = LEVEL_ORDER.indexOf(prev || ''), b = LEVEL_ORDER.indexOf(cur)
  if(a < 0 || b < 0) return null
  if(a === b) return '→ Ổn định'
  return b > a ? `↑ Tăng từ CẤP ${prev}` : `↓ Giảm từ CẤP ${prev}`
}

const DIV_VAR = 'var(--fc-line)'

// Executive Decision Card — hierarchy: CẤP → DRIVER → ACTION → SUMMARY →
// COVERAGE → chi tiết. Không NDVI ?, không Tin cậy %, không Risk /100.
export default function ForecastCard({ area, rating, firms, temp, condition, updated, previousLevel }: {
  area: string; rating: Rating | null | undefined;
  firms?: number | string; temp?: number | string | null;
  condition?: string | null; updated?: string | null;
  previousLevel?: string;
}){
  const [whyOpen, setWhyOpen] = useState(false)
  if(!rating) return (
    <div style={{fontSize:12, color:'#64748B'}}>Chưa có bản tin dự báo cho {area}.</div>
  )
  const lv = LEVEL_ORDER.includes(rating.level) ? rating.level : 'I'
  const c = LEVEL_COLOR[lv]
  const ht = headerText(lv)
  const aIcon = actionIcon(lv)
  const firmsVal = typeof firms === 'number' ? firms : rating.firms_hotspots
  const pick = pickDriver(rating)
  const summary = execSummary(rating, firmsVal)
  const trend = trendOf(previousLevel, lv)
  const src = rating.sources || {}
  const comp = rating.components || {}
  const states: [string, 'ok' | 'warn' | 'missing'][] = [
    ['Weather', src.Weather ? 'ok' : 'missing'],
    ['FIRMS', src.FIRMS ? 'ok' : 'missing'],
    ['GEE', src.GEE ? 'ok' : 'missing'],
    ['Sentinel', src.Sentinel ? 'ok' : 'missing'],
    ['Water', comp.water === 'DISTANT' ? 'warn' : (comp.water && comp.water !== 'MISSING' ? 'ok' : 'missing')],
    ['Terrain', comp.terrain && comp.terrain !== 'MISSING' ? 'ok' : 'missing'],
  ]
  const sq = { ok: '🟩', warn: '🟨', missing: '🟥' } as const
  const explainRows: [string, string][] = [
    ['Thời tiết', comp.weather_stress || 'MISSING'],
    ['Nhiên liệu', comp.fuel || 'MISSING'],
    ['Địa hình', comp.terrain || 'MISSING'],
    ['Nguồn nước', comp.water || 'MISSING'],
    ['Điểm cháy', comp.ignition || 'MISSING'],
    ['Vận hành', rating.operational_status || 'MISSING'],
  ]
  return (
    <div className="fccard" style={{borderRadius:12, overflow:'hidden', border:'1px solid var(--fc-line)', background:'var(--fc-bg)', color:'var(--fc-text)', width:'100%'}}>
      <style>{`.fccard{--fc-bg:#fff;--fc-text:#0B1412;--fc-sub:#64748B;--fc-line:#E2E8E5;--fc-soft:#F8FAFC}
@media (prefers-color-scheme: dark){.fccard{--fc-bg:#0F172A;--fc-text:#F1F5F9;--fc-sub:#94A3B8;--fc-line:#1E293B;--fc-soft:#1E293B}}`}</style>
      {/* 1. CẤP — lớn nhất (P6: blend màu 250ms, số morph fade) */}
      <div style={{background:c, color:ht, padding:'12px 14px', transition:'background-color 250ms cubic-bezier(0.16,1,0.3,1)'}}>
        <div style={{fontSize:13, fontWeight:800, opacity:0.95}}>🔥 {area}</div>
        <div key={lv} className="anim-level" style={{fontSize:32, fontWeight:800, lineHeight:1.15}}>CẤP {lv}</div>
        <div style={{fontSize:13, fontWeight:800, letterSpacing:1}}>{String(rating.label).toUpperCase()}</div>
        {trend && <div style={{fontSize:11, fontWeight:700, marginTop:4, opacity:0.95}}>{trend}</div>}
      </div>
      {/* Main message — một câu */}
      <div style={{padding:'10px 14px 0', fontSize:13, fontWeight:700}}>{mainMessage(firmsVal)}</div>
      {/* 2. DRIVER banner */}
      <div style={{padding:'10px 14px', display:'flex', flexDirection:'column', gap:6}}>
        <div style={{fontSize:11, fontWeight:800, letterSpacing:0.4, color:'var(--fc-sub)'}}>⚠ DRIVER CHÍNH</div>
        {pick ? (
          <>
            <div><span style={{display:'inline-block', background: pick.category === 'ỔN ĐỊNH' ? '#DCFCE7' : '#FEF3C7', color: pick.category === 'ỔN ĐỊNH' ? '#166534' : '#92400E', border:'1px solid #FCD34A', borderRadius:999, padding:'3px 12px', fontSize:12, fontWeight:800}}>
              {pick.category === 'ỔN ĐỊNH' ? '✓' : '⚠'} {pick.category}</span></div>
            <div style={{fontSize:13}}>{pick.text}</div>
          </>
        ) : (
          <div style={{fontSize:12, color:'#92400E', fontWeight:700}}>⚠ Chưa xác định — thiếu dữ liệu, cần xác minh thực địa.</div>
        )}
      </div>
      <div style={{height:1, background:DIV_VAR}} />
      {/* 3. ACTION banner */}
      <div style={{padding:'10px 14px', display:'flex', flexDirection:'column', gap:4}}>
        <div style={{fontSize:11, fontWeight:800, letterSpacing:0.4, color:'var(--fc-sub)'}}>{aIcon} HÀNH ĐỘNG</div>
        {(rating.recommended_action || []).map((a, i)=> (
          <div key={i} style={{fontSize: i === 0 ? 15 : 12, fontWeight: i === 0 ? 800 : 400}}>{i === 0 ? `${aIcon} ` : '· '}{a}</div>
        ))}
      </div>
      <div style={{height:1, background:DIV_VAR}} />
      {/* 4. SUMMARY 1–2 câu */}
      <div style={{padding:'10px 14px', display:'flex', flexDirection:'column', gap:2, fontSize:13}}>
        {summary.map((s, i)=> <div key={i}>{s}</div>)}
      </div>
      <div style={{height:1, background:DIV_VAR}} />
      {/* Key facts */}
      <div style={{padding:'10px 14px', fontSize:13, display:'flex', flexDirection:'column', gap:4}}>
        <div>📡 FIRMS: <b>{typeof firmsVal === 'number' ? `${firmsVal} điểm nóng` : 'MISSING'}</b></div>
        <div>🌡 <b>{temp ?? 'MISSING'}</b> · 🌧 <b>{condition ?? 'MISSING'}</b></div>
      </div>
      <div style={{height:1, background:DIV_VAR}} />
      {/* 5. COVERAGE heatmap */}
      <div style={{padding:'10px 14px', display:'flex', flexDirection:'column', gap:4}}>
        <div style={{fontSize:11, fontWeight:800, letterSpacing:0.4, color:'var(--fc-sub)'}}>🛰 ĐỘ PHỦ</div>
        <div style={{display:'flex', flexWrap:'wrap', gap:'4px 12px', fontSize:12}}>
          {states.map(([k, st])=> <span key={k}>{sq[st]} {k}</span>)}
        </div>
        <div style={{fontSize:13, fontWeight:800}}>{rating.data_coverage_status?.toUpperCase()}</div>
      </div>
      <div style={{height:1, background:DIV_VAR}} />
      {/* 6. CHI TIẾT — Tại sao? */}
      <div style={{padding:'10px 14px'}}>
        <button onClick={()=> setWhyOpen(o=> !o)} aria-expanded={whyOpen}
          style={{border:'1px solid var(--fc-line)', background:'var(--fc-soft)', color:'var(--fc-text)', borderRadius:999, padding:'6px 14px', fontSize:12, fontWeight:800, cursor:'pointer', width:'100%'}}>
          Tại sao? {whyOpen ? '▴' : '▾'}
        </button>
        {whyOpen && (
          <div style={{marginTop:8, display:'flex', flexDirection:'column', gap:4, fontSize:12}}>
            {explainRows.map(([k, v])=> (
              <div key={k} style={{display:'flex', justifyContent:'space-between', gap:8, borderTop:'1px solid var(--fc-line)', paddingTop:4}}>
                <span style={{color:'var(--fc-sub)', flex:'none'}}>{k}</span>
                <span style={{textAlign:'right', fontWeight:600}}>{v}</span>
              </div>
            ))}
            {(rating.supporting_factors || []).length > 0 && (
              <div style={{borderTop:'1px solid var(--fc-line)', paddingTop:4}}>
                {(rating.supporting_factors || []).map((s, i)=> <div key={i}>· {s}</div>)}
              </div>
            )}
          </div>
        )}
      </div>
      <div style={{padding:'0 14px 10px', color:'var(--fc-sub)', fontSize:11}}>🕒 Cập nhật: {updated ?? '—'}</div>
    </div>
  )
}
