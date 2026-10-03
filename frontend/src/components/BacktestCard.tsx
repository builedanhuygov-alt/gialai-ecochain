import { useCallback, useEffect, useState } from 'react'
import { API_BASE } from '../services/api'

type Backtest = {
  status?: string
  precision?: number | null; recall?: number | null; f1?: number | null
  false_alarm_rate?: number | null; mean_lead_time_days?: number | null
  confusion?: { tp: number; fp: number; tn: number; fn: number }
  n_samples?: number; n_scored?: number; n_cells?: number
  period?: { start: string; end: string }; origin?: string
  sources?: { weather: string; fires: string }
  warning?: string; cached?: boolean; threshold?: number
}

const fmt = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : v.toFixed(2)

export default function BacktestCard(){
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<Backtest | null>(null)
  const [running, setRunning] = useState(false)
  const [threshold, setThreshold] = useState(60)

  const load = useCallback(async (t: number) => {
    setRunning(true)
    try {
      const url = `${API_BASE}/api/fire-risk/backtest?threshold=${t}`
      const r = await fetch(url)
      if (r.status === 202) {
        setData({ status: 'RUNNING' })
        setTimeout(async () => {
          try {
            const r2 = await fetch(url)
            if (r2.ok) setData(await r2.json())
          } catch { /* keep RUNNING state */ }
          setRunning(false)
        }, 4000)
        return
      }
      if (r.ok) setData(await r.json())
    } catch { /* offline — card stays honest-empty */ }
    setRunning(false)
  }, [])

  useEffect(()=>{ if(open && !data) load(threshold) },[open]) // eslint-disable-line

  const demo = data?.origin === 'DEMO / SIMULATED'
  return (
    <section aria-label="Kiểm chứng mô hình" style={{
      background: '#fff', border: '1px solid #E2E8E5', borderRadius: 12,
      padding: 12, margin: '12px 0',
    }}>
      <button onClick={()=> setOpen(o=> !o)} aria-expanded={open}
        style={{all: 'unset', cursor: 'pointer', width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
        <b style={{fontSize: 14}}>Kiểm chứng mô hình</b>
        <span style={{fontSize: 12, color: '#64748B'}}>{open ? '▴' : '▾'}</span>
      </button>
      {!open && <div style={{fontSize: 12, color: '#64748B', marginTop: 4}}>Precision / recall / F1 của công thức trên dữ liệu FIRMS lịch sử.</div>}
      {open && (
        <div style={{marginTop: 8}}>
          <div style={{display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap'}}>
            <label style={{fontSize: 12}}>Ngưỡng báo:
              <select value={threshold} onChange={e=> { const t = Number(e.target.value); setThreshold(t); setData(null); load(t) }}
                style={{marginLeft: 6, padding: '4px 8px', borderRadius: 8, border: '1px solid #E2E8E5'}}>
                {[40, 50, 60, 70, 80].map(t=> <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <button onClick={()=> { setData(null); load(threshold) }} disabled={running}
              style={{fontSize: 12, background: '#0F766E', color: '#fff', border: 0, borderRadius: 999, padding: '6px 14px'}}>
              {running ? 'Đang tính…' : 'Chạy lại'}
            </button>
          </div>
          {(!data || data.status === 'RUNNING') && (
            <div style={{fontSize: 13, color: '#64748B', marginTop: 8}}>Đang tính toán ngoài luồng — đợi vài giây rồi bấm “Chạy lại”.</div>
          )}
          {data && data.status !== 'RUNNING' && (
            <>
              {demo && (
                <div style={{marginTop: 8, background: '#FEF3C7', border: '1px solid #FCD34D', color: '#92400E',
                  borderRadius: 8, padding: '8px 10px', fontSize: 12, fontWeight: 700}}>
                  DỮ LIỆU GIẢ LẬP — nhãn cháy là mô phỏng, không phải độ chính xác thật.
                </div>
              )}
              <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8, marginTop: 8}}>
                {[['Precision', fmt(data.precision)], ['Recall', fmt(data.recall)], ['F1', fmt(data.f1)],
                  ['Báo động giả', fmt(data.false_alarm_rate)],
                  ['Lead time TB (ngày)', data.mean_lead_time_days ?? '—'],
                ].map(([k, v])=> (
                  <div key={k} style={{background: '#F8FAF9', borderRadius: 8, padding: '8px 10px'}}>
                    <div style={{fontSize: 18, fontWeight: 800}}>{v}</div>
                    <div style={{fontSize: 11, color: '#64748B'}}>{k}</div>
                  </div>
                ))}
              </div>
              <div style={{fontSize: 12, color: '#475569', marginTop: 8}}>
                Kỳ {data.period?.start} → {data.period?.end} · {data.n_cells} ô · {data.n_scored}/{data.n_samples} mẫu có điểm ·
                TP {data.confusion?.tp} / FP {data.confusion?.fp} / TN {data.confusion?.tn} / FN {data.confusion?.fn}
              </div>
              <div style={{fontSize: 12, color: '#475569', marginTop: 4}}>
                Thời tiết: {data.sources?.weather} · Cháy: {data.sources?.fires} ·
                Nguồn: <b>{data.origin}</b>{data.cached ? ' · (cache)' : ''}
              </div>
              {data.warning && <div style={{fontSize: 12, color: '#92400E', marginTop: 4}}>{data.warning}</div>}
            </>
          )}
        </div>
      )}
    </section>
  )
}

// Re-export for tests without DOM timing.
export function formatMetric(v: number | null | undefined): string { return fmt(v) }
