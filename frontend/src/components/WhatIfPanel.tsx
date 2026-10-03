import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../services/api'

export type WhatIfState = {
  temperature: number  // °C
  humidity: number     // %
  rain7d: number       // mm / 7 ngày
  vegDry: number       // 0-100 độ khô thực vật
  wind: number         // km/h
  hotspotKm: number | null  // km tới điểm nóng gần nhất (null = không có)
  windDir: number      // độ, chỉ hiển thị hướng (không phải mô hình vật lý)
}

// Ánh xạ công khai, hiện ngay dưới thanh trượt:
// - mưa ngày = mưa 7 ngày / 7
// - NDVI = 0.7 − độ khô/100 × 0.6
// - có điểm nóng (≤5 km) → hotspot_count = 1, xa hơn → 0
export function rainfallFromDryDays(dryDays: number): number {
  return dryDays >= 1 ? 0 : 3
}

export function ndviFromVegDry(vegDry: number): number {
  return Math.round((0.7 - (vegDry / 100) * 0.6) * 100) / 100
}

export function toCalculateBody(s: WhatIfState): Record<string, unknown> {
  return {
    temperature: s.temperature,
    humidity: s.humidity,
    rainfall: Math.round((s.rain7d / 7) * 10) / 10,
    wind_speed: s.wind,
    ndvi: ndviFromVegDry(s.vegDry),
    ndmi: 0.25,
    hotspots: s.hotspotKm !== null && s.hotspotKm <= 5 ? [{ latitude: 0, longitude: 0 }] : [],
  }
}

const LIMITS: Record<string, [number, number, number]> = {
  temperature: [15, 45, 1],
  humidity: [5, 100, 1],
  rain7d: [0, 200, 5],
  vegDry: [0, 100, 5],
  wind: [0, 80, 1],
  hotspotKm: [0, 20, 1],
  windDir: [0, 360, 5],
}

const LABEL: Record<string, string> = {
  temperature: 'Nhiệt độ (°C)',
  humidity: 'Độ ẩm (%)',
  rain7d: 'Mưa 7 ngày (mm)',
  vegDry: 'Độ khô thực vật (0–100)',
  wind: 'Gió (km/h)',
  hotspotKm: 'Khoảng cách điểm nóng (km)',
  windDir: 'Hướng gió (độ, chỉ tham khảo)',
}

const PRESETS: Record<string, Partial<WhatIfState>> = {
  'Khô hơn': { temperature: 38, humidity: 20, rain7d: 0, vegDry: 80, wind: 25 },
  'Mưa tăng': { temperature: 29, humidity: 85, rain7d: 50, vegDry: 20, wind: 8 },
  'Gió mạnh': { temperature: 35, humidity: 30, rain7d: 0, vegDry: 60, wind: 40 },
}

type Calc = {
  score: number | null; level: string | null; factors: Record<string, string>
  advice: string[]; data_completeness?: number; origin?: string
}

const MAC_DINH: WhatIfState = { temperature: 33, humidity: 45, rain7d: 10, vegDry: 50, wind: 12, hotspotKm: null, windDir: 90 }

export default function WhatIfPanel(){
  const [open, setOpen] = useState(false)
  const [area, setArea] = useState<{ name: string; lat: number; lon: number } | null>(null)
  const [state, setState] = useState<WhatIfState>(MAC_DINH)
  const [goc, setGoc] = useState<WhatIfState>(MAC_DINH)
  const [base, setBase] = useState<Calc | null>(null)
  const [cur, setCur] = useState<Calc | null>(null)
  const [loading, setLoading] = useState(false)
  const timer = useRef<any>(null)

  useEffect(()=>{
    const h = async (e: any)=>{
      const d = e.detail || {}
      if (typeof d.lat !== 'number' || typeof d.lon !== 'number') return
      const name = String(d.area || 'Khu vực đang chọn')
      setArea({ name, lat: d.lat, lon: d.lon })
      try {
        const [wx, brief, alert] = await Promise.all([
          api.weatherNow(d.lat, d.lon),
          api.fireBrief(name, d.lat, d.lon).catch(()=> null),
          fetch(`${(await import('../services/api')).API_BASE}/api/villages/fire-alert`).then(r=> r.ok ? r.json() : null).catch(()=> null),
        ])
        let gan: number | null = null
        const ds = Array.isArray(alert?.fires) ? alert.fires : []
        for(const f of ds){
          if(typeof f.latitude !== 'number' || typeof f.longitude !== 'number') continue
          const r = (x: number)=> x * Math.PI / 180
          const a = Math.sin(r(f.latitude - d.lat) / 2) ** 2 + Math.cos(r(d.lat)) * Math.cos(r(f.latitude)) * Math.sin(r(f.longitude - d.lon) / 2) ** 2
          const kc = 2 * 6371 * Math.asin(Math.sqrt(a))
          if(gan === null || kc < gan) gan = Math.round(kc * 10) / 10
        }
        const init: WhatIfState = {
          temperature: Number(wx?.temperature ?? 33),
          humidity: Number(wx?.humidity ?? 45),
          rain7d: brief?.rain_14d_mm != null ? Math.round(Number(brief.rain_14d_mm) / 2) : 10,
          vegDry: 50,
          wind: Number(wx?.wind_speed ?? 12),
          hotspotKm: gan,
          windDir: 90,
        }
        setState(init); setGoc(init)
        const b = await api.fireRiskCalculate(toCalculateBody(init)) as Calc
        setBase(b); setCur(b)
      } catch { /* ngoại tuyến: giữ mặc định, hiện khung trống trung thực */ }
    }
    window.addEventListener('ecochain-select-area', h)
    return ()=> window.removeEventListener('ecochain-select-area', h)
  },[])

  const recalc = useCallback((s: WhatIfState)=>{
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async ()=>{
      setLoading(true)
      try {
        const r = await api.fireRiskCalculate(toCalculateBody(s)) as Calc
        setCur(r)
      } catch { /* giữ giá trị tốt cuối cùng */ }
      setLoading(false)
    }, 250)
  },[])

  const set = (k: keyof WhatIfState, v: number)=>{
    const next = { ...state, [k]: v }
    setState(next)
    recalc(next)
  }

  const apDung = (p: Partial<WhatIfState>)=>{
    const next = { ...state, ...p }
    setState(next)
    recalc(next)
  }

  const veGoc = ()=>{
    setState(goc); setCur(base)
    if (timer.current) clearTimeout(timer.current)
  }

  const thayDoi = JSON.stringify(state) !== JSON.stringify(goc)
  const delta = (base?.score !== null && base?.score !== undefined && cur?.score !== null && cur?.score !== undefined)
    ? (cur!.score as number) - (base!.score as number) : null

  const khoi = (tieuDe: string, c: Calc | null)=> (
    <div style={{flex: 1, minWidth: 140, background: '#F8FAF9', borderRadius: 8, padding: 10}}>
      <div style={{fontSize: 11, fontWeight: 800, color: '#64748B'}}>{tieuDe}</div>
      {c && c.score !== null ? (
        <>
          <div style={{fontSize: 20, fontWeight: 800}}>{c.score} <span style={{fontSize: 12}}>CẤP {c.level}</span></div>
          <div style={{fontSize: 11, marginTop: 4}}>{Object.entries(c.factors || {}).map(([k, v])=> `${k} ${v}`).join(' · ') || '—'}</div>
        </>
      ) : <div style={{fontSize: 12, color: '#64748B'}}>Không có dữ liệu.</div>}
    </div>
  )

  return (
    <section aria-label="Điều gì xảy ra nếu" style={{
      background: '#fff', border: '1px solid #E2E8E5', borderRadius: 12,
      padding: 12, margin: '12px 0',
    }}>
      <button onClick={()=> setOpen(o=> !o)} aria-expanded={open}
        style={{all: 'unset', cursor: 'pointer', width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 44}}>
        <b style={{fontSize: 14}}>Điều gì xảy ra nếu…</b>
        <span style={{fontSize: 12, color: '#64748B'}}>{open ? '▴' : '▾'}</span>
      </button>
      {!open && <div style={{fontSize: 12, color: '#64748B', marginTop: 4}}>Kéo thanh trượt để thử điều kiện khô/nóng hơn.</div>}
      {open && (
        <div style={{marginTop: 8}}>
          <div style={{fontSize: 12, fontWeight: 800, color: '#92400E', background: '#FEF3C7',
            border: '1px solid #FCD34D', borderRadius: 8, padding: '6px 10px'}}>
            Mô phỏng – không phải dự báo thực tế
          </div>
          <div style={{fontSize: 12, color: '#64748B', marginTop: 6}}>
            Khu vực: <b>{area ? `${area.name} (${area.lat.toFixed(2)}, ${area.lon.toFixed(2)})` : 'chưa chọn — bấm một xã trên bản đồ'}</b>
          </div>
          <div style={{display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8}}>
            {Object.keys(PRESETS).map(p=> (
              <button key={p} onClick={()=> apDung(PRESETS[p])}
                style={{fontSize: 12, background: '#F1F5F9', border: '1px solid #E2E8E5', borderRadius: 999, padding: '10px 14px', minHeight: 44}}>
                {p}
              </button>
            ))}
            <button onClick={veGoc} disabled={!thayDoi}
              style={{fontSize: 12, background: '#fff', border: '1px solid #E2E8E5', borderRadius: 999, padding: '10px 14px', minHeight: 44, opacity: thayDoi ? 1 : 0.5}}>
              ↩ Về dữ liệu gốc
            </button>
          </div>
          {(Object.keys(LIMITS)).map(k=> {
            const [mn, mx, step] = LIMITS[k]
            if(k === 'hotspotKm' && state.hotspotKm === null) return null
            return (
              <label key={k} style={{display: 'block', marginTop: 8, fontSize: 13}}>
                <span style={{display: 'flex', justifyContent: 'space-between'}}>
                  <span>{LABEL[k]}</span><b>{k === 'hotspotKm' ? (state.hotspotKm ?? '—') : (state as any)[k]}</b>
                </span>
                <input type="range" min={mn} max={mx} step={step} value={(state as any)[k] ?? mn}
                  onChange={e=> set(k as keyof WhatIfState, Number(e.target.value))}
                  aria-label={LABEL[k]} style={{width: '100%', minHeight: 44}} />
              </label>
            )
          })}
          <div style={{fontSize: 11, color: '#64748B'}}>
            Ánh xạ: mưa ngày ≈ {(state.rain7d / 7).toFixed(1)} mm · NDVI ≈ {ndviFromVegDry(state.vegDry)}
            {state.hotspotKm !== null ? ` · ${state.hotspotKm <= 5 ? 'có' : 'không có'} điểm nóng tính trong điểm` : ' · chưa rõ điểm nóng'}.
            Hướng gió chỉ để tham khảo không gian, KHÔNG phải mô hình lan truyền cháy vật lý.
          </div>
          <div style={{display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap'}}>
            {khoi('GỐC', base)}
            {khoi('MÔ PHỎNG', cur)}
          </div>
          {delta !== null && delta !== 0 && (
            <div style={{fontSize: 14, fontWeight: 800, marginTop: 6, color: delta > 0 ? '#DC2626' : '#0F766E'}}>
              Chênh lệch: {delta > 0 ? '+' : ''}{delta} điểm
            </div>
          )}
          {loading && <span style={{fontSize: 12, color: '#64748B'}}>Đang tính…</span>}
          {cur && cur.score !== null && (
            <div style={{marginTop: 6}}>
              {(cur.advice || []).slice(0, 3).map((a, i)=> <div key={i} style={{fontSize: 12, marginTop: 4}}>→ {a}</div>)}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
