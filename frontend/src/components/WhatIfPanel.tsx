import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../services/api'

export type WhatIfState = {
  temperature: number  // °C
  humidity: number     // %
  dryDays: number      // consecutive days without rain
  wind: number         // km/h
}

// "Số ngày không mưa" maps to model rainfall input. Shown in UI so the
// assumption is explicit, not hidden: >=1 dry day -> 0 mm, else 3 mm.
export function rainfallFromDryDays(dryDays: number): number {
  return dryDays >= 1 ? 0 : 3
}

export function toCalculateBody(s: WhatIfState): Record<string, unknown> {
  return {
    temperature: s.temperature,
    humidity: s.humidity,
    rainfall: rainfallFromDryDays(s.dryDays),
    wind_speed: s.wind,
  }
}

const LIMITS: Record<keyof WhatIfState, [number, number, number]> = {
  temperature: [15, 45, 1],
  humidity: [5, 100, 1],
  dryDays: [0, 30, 1],
  wind: [0, 80, 1],
}

const LABEL: Record<keyof WhatIfState, string> = {
  temperature: 'Nhiệt độ (°C)',
  humidity: 'Độ ẩm (%)',
  dryDays: 'Số ngày không mưa',
  wind: 'Gió (km/h)',
}

type Calc = {
  score: number | null; level: string | null; factors: Record<string, string>
  advice: string[]; data_completeness?: number; origin?: string
}

export default function WhatIfPanel(){
  const [open, setOpen] = useState(false)
  const [area, setArea] = useState<{ name: string; lat: number; lon: number } | null>(null)
  const [state, setState] = useState<WhatIfState>({ temperature: 33, humidity: 45, dryDays: 3, wind: 12 })
  const [base, setBase] = useState<Calc | null>(null)
  const [cur, setCur] = useState<Calc | null>(null)
  const [loading, setLoading] = useState(false)
  const timer = useRef<any>(null)

  // Init from the currently selected area (map clicks dispatch this event).
  useEffect(()=>{
    const h = async (e: any)=>{
      const d = e.detail || {}
      if (typeof d.lat !== 'number' || typeof d.lon !== 'number') return
      const name = String(d.area || 'Khu vực đang chọn')
      setArea({ name, lat: d.lat, lon: d.lon })
      try {
        const [wx, brief] = await Promise.all([
          api.weatherNow(d.lat, d.lon),
          api.fireBrief(name, d.lat, d.lon).catch(()=> null),
        ])
        const init: WhatIfState = {
          temperature: Number(wx?.temperature ?? 33),
          humidity: Number(wx?.humidity ?? 45),
          dryDays: Number(brief?.dry_days ?? 3),
          wind: Number(wx?.wind_speed ?? 12),
        }
        setState(init)
        const b = await api.fireRiskCalculate(toCalculateBody(init)) as Calc
        setBase(b); setCur(b)
      } catch { /* offline: keep defaults, show honest-empty */ }
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
      } catch { /* keep last good value */ }
      setLoading(false)
    }, 250)
  },[])

  const set = (k: keyof WhatIfState, v: number)=>{
    const next = { ...state, [k]: v }
    setState(next)
    recalc(next)
  }

  const delta = (base?.score !== null && base?.score !== undefined && cur?.score !== null && cur?.score !== undefined)
    ? (cur!.score as number) - (base!.score as number) : null

  return (
    <section aria-label="Điều gì xảy ra nếu" style={{
      background: '#fff', border: '1px solid #E2E8E5', borderRadius: 12,
      padding: 12, margin: '12px 0',
    }}>
      <button onClick={()=> setOpen(o=> !o)} aria-expanded={open}
        style={{all: 'unset', cursor: 'pointer', width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
        <b style={{fontSize: 14}}>Điều gì xảy ra nếu…</b>
        <span style={{fontSize: 12, color: '#64748B'}}>{open ? '▴' : '▾'}</span>
      </button>
      {!open && <div style={{fontSize: 12, color: '#64748B', marginTop: 4}}>Kéo thanh trượt để thử điều kiện khô/nóng hơn.</div>}
      {open && (
        <div style={{marginTop: 8}}>
          <div style={{fontSize: 12, fontWeight: 800, color: '#92400E', background: '#FEF3C7',
            border: '1px solid #FCD34D', borderRadius: 8, padding: '6px 10px'}}>
            THỬ NGHIỆM — không phải dự báo
          </div>
          <div style={{fontSize: 12, color: '#64748B', marginTop: 6}}>
            Khu vực: <b>{area ? `${area.name} (${area.lat.toFixed(2)}, ${area.lon.toFixed(2)})` : 'chưa chọn — bấm một xã trên bản đồ'}</b>
          </div>
          {(Object.keys(LIMITS) as (keyof WhatIfState)[]).map(k=> {
            const [mn, mx, step] = LIMITS[k]
            return (
              <label key={k} style={{display: 'block', marginTop: 8, fontSize: 13}}>
                <span style={{display: 'flex', justifyContent: 'space-between'}}>
                  <span>{LABEL[k]}</span><b>{state[k]}</b>
                </span>
                <input type="range" min={mn} max={mx} step={step} value={state[k]}
                  onChange={e=> set(k, Number(e.target.value))}
                  aria-label={LABEL[k]} style={{width: '100%'}} />
              </label>
            )
          })}
          <div style={{fontSize: 11, color: '#64748B'}}>Mưa mô hình ≈ {rainfallFromDryDays(state.dryDays)} mm (suy từ số ngày khô).</div>
          <div style={{display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, flexWrap: 'wrap'}}>
            <button onClick={()=> { api.fireRiskCalculate(toCalculateBody(state)).then(r=> { setBase(r as Calc); setCur(r as Calc) }).catch(()=> {}) }}
              style={{fontSize: 12, background: '#fff', border: '1px solid #E2E8E5', borderRadius: 999, padding: '6px 14px'}}>
              Đặt lại (lấy hiện tại làm gốc)
            </button>
            {loading && <span style={{fontSize: 12, color: '#64748B'}}>Đang tính…</span>}
          </div>
          {cur && cur.score !== null && (
            <div style={{marginTop: 10, background: '#F8FAF9', borderRadius: 8, padding: 10}}>
              <div style={{fontSize: 20, fontWeight: 800}}>
                {cur.score} <span style={{fontSize: 13}}>CẤP {cur.level}</span>
                {delta !== null && delta !== 0 && (
                  <span style={{fontSize: 13, color: delta > 0 ? '#DC2626' : '#0F766E', marginLeft: 8}}>
                    {delta > 0 ? '+' : ''}{delta} điểm so với gốc
                  </span>
                )}
              </div>
              {Object.keys(cur.factors || {}).length > 0 && (
                <div style={{fontSize: 12, marginTop: 4}}>Do: {Object.entries(cur.factors).map(([k, v])=> `${k} ${v}`).join(' · ')}</div>
              )}
              {(cur.advice || []).map((a, i)=> <div key={i} style={{fontSize: 12, marginTop: 4}}>→ {a}</div>)}
            </div>
          )}
          {(!cur || cur.score === null) && (
            <div style={{fontSize: 13, color: '#64748B', marginTop: 10}}>Không có dữ liệu.</div>
          )}
        </div>
      )}
    </section>
  )
}
