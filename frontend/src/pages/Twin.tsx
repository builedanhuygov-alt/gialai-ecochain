import { useEffect, useState } from 'react'
import { api } from '../services/api'
import {
  Activity, ChevronRight, Layers, Plus, RotateCcw, Satellite,
} from 'lucide-react'

type ScRow = { id: string; name: string; type: string; version: number; status?: string }

const TYPES = ['COMPOUND', 'CLIMATE', 'DISASTER', 'FOREST', 'LOGISTICS', 'CARBON']
const STRIP_KEYS = ['CURRENT', 'FORECAST', 'SIMULATED', 'TARGET', 'ACTUAL'] as const
const STRIP_SUB: Record<string, string> = {
  CURRENT: 'Environmental Index', FORECAST: 'Next 24h', SIMULATED: 'No active scenario',
  TARGET: 'Target state', ACTUAL: 'Observed',
}

// Forest index out of a twin state node. States carry {forest} (API default);
// SIMULATED carries {A}. Anything else → null (rendered as —, never guessed).
export function pickForest(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    if (typeof o.forest === 'number' && Number.isFinite(o.forest)) return o.forest
    if (typeof o.A === 'number' && Number.isFinite(o.A)) return o.A
  }
  return null
}

export function fmtClock(ts: number): string {
  return new Date(ts).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function riskTone(score: number): string {
  if (score >= 85) return '#EF4444'
  if (score >= 70) return '#F97316'
  if (score >= 40) return '#F59E0B'
  return '#22C55E'
}

export default function Twin(){
  const [states, setStates] = useState<any>(null)
  const [rows, setRows] = useState<ScRow[]>([])
  const [scores, setScores] = useState<Record<string, any>>({})
  const [name, setName] = useState('Mưa lớn +20%')
  const [type, setType] = useState('COMPOUND')
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [syncedAt, setSyncedAt] = useState(0)
  const [selId, setSelId] = useState<string | null>(null)
  const [cascade, setCascade] = useState<any>(null)
  const [cascadeFor, setCascadeFor] = useState('')

  const refresh = async ()=>{
    const [st, list] = await Promise.all([api.twinStates('gia-lai'), api.scenariosList()])
    setStates(st)
    setRows(Array.isArray(list) ? list : [])
    setSyncedAt(Date.now())
  }
  useEffect(()=>{ refresh().then(()=> setFetching(false)).catch((e)=> { setError(String(e.message || e)); setFetching(false) }) },[])
  useEffect(()=>{
    if(!toast) return
    const id = setTimeout(()=> setToast(''), 2600)
    return ()=> clearTimeout(id)
  },[toast])

  const create = async ()=>{
    setLoading(true); setError('')
    try{
      const sc: any = await api.scenarioCreate(name || 'Scenario', type, { from: 'twin' })
      const sc1: any = await api.scenarioScorecard(sc.id)
      setScores(s => ({ ...s, [sc.id]: sc1 }))
      setSelId(sc.id)
      await refresh()
      setToast(`Đã chấm điểm kịch bản ${name || 'Scenario'}`)
    }catch(e:any){ setError(String(e.message || e)) }
    finally{ setLoading(false) }
  }

  const resetLab = ()=>{
    setName('Mưa lớn +20%'); setType('COMPOUND'); setSelId(null); setError('')
  }

  const showCascade = async (r: ScRow)=>{
    if(cascadeFor === r.id){ setCascadeFor(''); setCascade(null); return }
    setCascadeFor(r.id)
    try{ setCascade(await api.simCascade(r.type)) }catch(e:any){ setCascade({ error: String(e.message || e) }) }
  }

  const cur = pickForest(states?.CURRENT)
  const fc = pickForest(states?.FORECAST)
  const tgt = pickForest(states?.TARGET)
  const act = pickForest(states?.ACTUAL)
  const sel = rows.find(r => r.id === selId) || null
  const selScore = selId ? scores[selId] : null
  const simVal = selScore && typeof selScore.risk === 'number' ? null : pickForest(states?.SIMULATED)
  const bar = (label: string, v: number | null, color = '#3B82F6') => (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
        <span style={{ color: '#8CA0B3' }}>{label}</span>
        <b className="dtw-num">{v == null ? '—' : v}</b>
      </div>
      <div className="dtw-bar"><i style={{ width: `${v == null ? 0 : Math.min(100, v)}%`, background: color }} /></div>
    </div>
  )

  return (
    <div className="dtw rise-in">
      <style>{`
        .dtw{ --d-bg:#0A111C; --d-panel:#0E1726; --d-panel2:#131E30; --d-line:rgba(148,163,184,0.16); --d-text:#EAF0F6; --d-mut:#8CA0B3; --d-faint:#5B6E82; --d-info:#3B82F6; background:var(--d-bg); color:var(--d-text); border-radius:16px; padding:20px; }
        .dtw-head{ display:flex; gap:12px; align-items:center; flex-wrap:wrap; }
        .dtw-title{ font-size:24px; font-weight:800; letter-spacing:-0.3px; margin:0; }
        .dtw-sub{ font-size:13px; color:var(--d-mut); margin-top:2px; }
        .dtw-kicker{ font-size:11px; font-weight:800; letter-spacing:1.1px; color:var(--d-mut); }
        .dtw-mut{ font-size:12px; color:var(--d-mut); }
        .dtw-num{ font-variant-numeric:tabular-nums; }
        .dtw-dot{ width:8px; height:8px; border-radius:999px; background:#22C55E; flex:none; animation:dtwpulse 2.4s ease-out infinite; }
        .dtw-dot.bad{ background:#EF4444; animation:none; }
        @keyframes dtwpulse{ 0%,100%{ opacity:1 } 50%{ opacity:0.35 } }
        .dtw-chip{ font-size:10px; font-weight:800; letter-spacing:0.5px; border-radius:6px; padding:2px 8px; border:1px solid var(--d-line); color:var(--d-mut); white-space:nowrap; }
        .dtw-chip.seed{ background:rgba(245,158,11,0.1); border-color:rgba(245,158,11,0.45); color:#FCD34D; }
        .dtw-strip{ display:grid; gap:0; grid-template-columns:repeat(5,1fr); margin-top:16px; background:var(--d-panel); border:1px solid var(--d-line); border-radius:14px; overflow:hidden; }
        .dtw-cell{ padding:12px 14px; min-width:0; }
        .dtw-cell + .dtw-cell{ border-left:1px solid var(--d-line); }
        .dtw-cell .v{ font-size:26px; font-weight:800; line-height:1.05; font-variant-numeric:tabular-nums; }
        .dtw-cell .t{ font-size:11px; font-weight:800; letter-spacing:0.8px; color:var(--d-mut); }
        .dtw-cell .s{ font-size:11px; color:var(--d-faint); margin-top:2px; }
        @media (max-width:900px){ .dtw-strip{ grid-template-columns:repeat(2,1fr); } .dtw-cell + .dtw-cell{ border-left:0; } .dtw-cell{ border-top:1px solid var(--d-line); } }
        .dtw-work{ display:grid; gap:12px; grid-template-columns:300px minmax(0,1fr) 320px; margin-top:12px; align-items:start; }
        @media (max-width:1200px){ .dtw-work{ grid-template-columns:1fr 1fr; } }
        @media (max-width:820px){ .dtw-work{ grid-template-columns:1fr; } }
        .dtw-panel{ background:var(--d-panel); border:1px solid var(--d-line); border-radius:14px; padding:16px; min-width:0; animation:dtwin 220ms ease-out; transition:transform 200ms cubic-bezier(0.32,0.72,0,1), box-shadow 200ms cubic-bezier(0.32,0.72,0,1); }
        .dtw-panel:hover{ transform:translateY(-2px); box-shadow:0 8px 24px rgba(0,0,0,0.3); }
        @keyframes dtwin{ from{ opacity:0; transform:translateY(4px) } to{ opacity:1; transform:none } }
        .dtw-bignum{ font-size:64px; font-weight:800; line-height:1; font-variant-numeric:tabular-nums; letter-spacing:-1px; }
        .dtw-bar{ height:8px; border-radius:999px; background:rgba(148,163,184,0.18); overflow:hidden; margin-top:4px; }
        .dtw-bar i{ display:block; height:100%; border-radius:999px; transition:width 250ms ease-out; }
        .dtw-cmp{ display:flex; flex-direction:column; gap:10px; margin-top:12px; }
        .dtw-field label{ font-size:11px; font-weight:800; letter-spacing:0.7px; color:var(--d-mut); display:block; margin-bottom:4px; }
        .dtw-field input, .dtw-field select{ width:100%; background:var(--d-panel2); border:1px solid var(--d-line); border-radius:10px; padding:8px 12px; color:var(--d-text); font-size:13px; font-family:inherit; }
        .dtw-btn{ display:inline-flex; gap:8px; align-items:center; justify-content:center; font-size:13px; font-weight:800; border-radius:10px; padding:9px 16px; border:1px solid var(--d-line); background:rgba(148,163,184,0.08); color:var(--d-text); cursor:pointer; transition:background 180ms ease-out; text-decoration:none; width:100%; }
        .dtw-btn:hover{ background:rgba(148,163,184,0.16); }
        .dtw-btn.primary{ background:#0E9F6E; border-color:#0E9F6E; color:#fff; }
        .dtw-btn.primary:hover{ background:#0B7A55; }
        .dtw-btn:disabled{ opacity:0.6; cursor:default; }
        .dtw-row{ display:flex; gap:10px; align-items:center; width:100%; text-align:left; background:var(--d-panel); border:1px solid var(--d-line); border-radius:12px; padding:10px 14px; color:inherit; cursor:pointer; transition:border-color 150ms ease-out; font-family:inherit; }
        .dtw-row:hover{ border-color:rgba(148,163,184,0.4); }
        .dtw-row.sel{ border-color:var(--d-info); }
        .dtw-dsec{ margin-top:12px; border-top:1px solid var(--d-line); padding-top:10px; }
        .dtw-dsec h4{ margin:0 0 8px; font-size:11px; letter-spacing:1px; color:var(--d-mut); }
        .dtw-kv{ display:flex; justify-content:space-between; gap:8px; font-size:13px; padding:3px 0; }
        .dtw-kv span:first-child{ color:var(--d-mut); }
        .dtw-empty{ text-align:center; padding:28px 16px; }
        .dtw-empty b{ display:block; font-size:14px; margin-top:8px; }
        .dtw-empty p{ font-size:12px; color:var(--d-mut); margin:4px 0 0; line-height:1.6; }
        .dtw-toast{ position:fixed; bottom:20px; left:50%; transform:translateX(-50%); background:#0E9F6E; color:#fff; font-size:13px; font-weight:700; border-radius:10px; padding:10px 18px; z-index:80; animation:dtwin 180ms ease-out; }
        .dtw-skel{ background:linear-gradient(90deg, rgba(148,163,184,0.1) 25%, rgba(148,163,184,0.2) 37%, rgba(148,163,184,0.1) 63%); background-size:400% 100%; animation:dtwshim 1.4s ease infinite; border-radius:10px; }
        @keyframes dtwshim{ 0%{ background-position:100% 0 } 100%{ background-position:-100% 0 } }
        @media (max-width:640px){ .dtw{ padding:14px; } .dtw-title{ font-size:20px; } .dtw-bignum{ font-size:52px; } }
        @media (prefers-reduced-motion: reduce){ .dtw *{ animation:none !important; transition:none !important; } }
        button:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible{ outline:2px solid #3B82F6; outline-offset:2px; }
      `}</style>

      {/* HEADER */}
      <div className="dtw-head">
        <div style={{ flex: 1, minWidth: 220 }}>
          <h1 className="dtw-title">DIGITAL TWIN</h1>
          <div className="dtw-sub">Gia Lai Environmental Intelligence</div>
        </div>
        <span className="dtw-chip seed">SEED DATA</span>
        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 12, fontWeight: 800 }}>
          <span className={`dtw-dot${fetching || (!states && error) ? ' bad' : ''}`} />{fetching ? 'SYNCING' : states ? 'TWIN ONLINE' : 'OFFLINE'}
        </span>
        <span className="dtw-mut dtw-num">Cập nhật {syncedAt ? fmtClock(syncedAt) : '…'}</span>
      </div>

      {fetching && <div className="dtw-strip" aria-busy="true">{[0, 1, 2, 3, 4].map(i => <div key={i} className="dtw-cell"><div className="dtw-skel" style={{ height: 56 }} /></div>)}</div>}
      {error && !states && (
        <div className="dtw-panel" style={{ marginTop: 12, borderColor: 'rgba(239,68,68,0.5)' }} role="alert">
          <b style={{ fontSize: 14 }}>DATA UNAVAILABLE</b>
          <div className="dtw-mut" style={{ marginTop: 4 }}>Không tải được trạng thái twin: {error}</div>
          <div style={{ marginTop: 10 }}><button className="dtw-btn" style={{ width: 'auto' }} onClick={()=> { setFetching(true); setError(''); refresh().then(()=> setFetching(false)).catch((e)=> { setError(String(e.message || e)); setFetching(false) }) }}>THỬ LẠI</button></div>
        </div>
      )}

      {/* STATE STRIP — 5 states from API */}
      {states && (
        <div className="dtw-strip" role="region" aria-label="So sánh trạng thái">
          {STRIP_KEYS.map(k => {
            const v = k === 'SIMULATED' && selScore && typeof selScore.risk === 'number' ? null : pickForest((states as any)[k]);
            const label = k === 'SIMULATED' && sel ? sel.name : null;
            return (
              <div className="dtw-cell" key={k}>
                <div className="t">{k}</div>
                <div className="v dtw-num">{v == null ? '—' : v}</div>
                <div className="s">{label || STRIP_SUB[k]}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* WORKSPACE */}
      <div className="dtw-work">
        {/* SCENARIO LAB */}
        <section className="dtw-panel" aria-label="Phòng lab kịch bản">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Layers size={15} style={{ color: '#7AA7FF' }} /><span className="dtw-kicker">SCENARIO LAB</span></div>
          <div className="dtw-mut" style={{ marginTop: 4 }}>Mô phỏng điều kiện môi trường và đánh giá tác động</div>
          <div className="dtw-field" style={{ marginTop: 12 }}><label htmlFor="dtw-name">TÊN KỊCH BẢN</label>
            <input id="dtw-name" value={name} onChange={e=> setName(e.target.value)} placeholder="VD: Mưa lớn +20%" /></div>
          <div className="dtw-field" style={{ marginTop: 10 }}><label htmlFor="dtw-type">MODEL</label>
            <select id="dtw-type" value={type} onChange={e=> setType(e.target.value)}>
              {TYPES.map(t=> <option key={t}>{t}</option>)}
            </select></div>
          <div className="dtw-mut" style={{ marginTop: 8 }}>API chỉ nhận tên + loại kịch bản — các tham số hiển thị là metadata phiên, không gửi backend.</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="dtw-btn primary" onClick={create} disabled={loading}>{loading ? 'ĐANG CHẤM…' : 'TẠO & CHẤM ĐIỂM'}</button>
            <button className="dtw-btn" style={{ width: 'auto' }} onClick={resetLab} title="Đặt lại form"><RotateCcw size={14} /></button>
          </div>
          {error && states && <div style={{ marginTop: 8, fontSize: 12, color: '#FCA5A5' }}>{error}</div>}
          <div className="dtw-dsec"><h4>RECENT SCENARIOS</h4>
            {rows.length === 0 && <div className="dtw-mut">CHƯA CÓ KỊCH BẢN — tạo mới ở trên.</div>}
            {rows.slice(0, 5).map(r=> (
              <button key={r.id} className={`dtw-row${selId === r.id ? ' sel' : ''}`} style={{ marginTop: 6 }} onClick={()=> setSelId(selId === r.id ? null : r.id)} aria-pressed={selId === r.id}>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, fontWeight: 700 }}>{r.name}</span>
                <span className="dtw-mut dtw-num" style={{ fontSize: 12 }}>{scores[r.id] && typeof scores[r.id].risk === 'number' ? scores[r.id].risk : '—'}</span>
                <ChevronRight size={14} style={{ color: '#5B6E82', flex: 'none' }} />
              </button>
            ))}
          </div>
        </section>

        {/* TWIN STATE */}
        <section className="dtw-panel" aria-label="Trạng thái twin">
          <div className="dtw-kicker">TWIN STATE · GIA LAI</div>
          {cur == null ? (
            <div className="dtw-empty"><Satellite size={22} style={{ color: '#5B6E82' }} /><b>NO TWIN DATA</b><p>API chưa trả trạng thái hiện tại.</p></div>
          ) : (
            <>
              <div className="dtw-bignum dtw-num">{cur}</div>
              <div style={{ fontSize: 13, fontWeight: 800, marginTop: 4 }}>Environmental Index</div>
              <div className="dtw-mut" style={{ marginTop: 2 }}>Chỉ số môi trường tổng hợp (seed) · thang 0–100</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
                {bar('Current', cur)}
                {bar('Forecast · 24h', fc, '#F59E0B')}
                {bar(sel ? `Scenario · ${sel.name}` : 'Scenario', selScore && typeof selScore.risk === 'number' ? selScore.risk : simVal, '#3B82F6')}
                {bar('Target', tgt, '#22C55E')}
                {bar('Actual', act)}
              </div>
              <div className="dtw-mut" style={{ marginTop: 8 }}>FORECAST là một giá trị duy nhất từ API — không có chuỗi thời gian nên không vẽ trend giả.</div>
            </>
          )}
        </section>

        {/* INSIGHTS */}
        <aside className="dtw-panel" aria-label="Thông tin chuyên sâu">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Activity size={15} style={{ color: '#7AA7FF' }} /><span className="dtw-kicker">INSIGHTS</span></div>
          {!selScore || typeof selScore.risk !== 'number' ? (
            <div className="dtw-empty">
              <div className="dtw-kicker">WILDFIRE RISK</div>
              <b>CHƯA CÓ ĐÁNH GIÁ</b>
              <p>Chấm điểm một kịch bản để xem rủi ro cháy rừng.</p>
            </div>
          ) : (
            <>
              <div className="dtw-kicker" style={{ marginTop: 12 }}>WILDFIRE RISK · {sel?.name}</div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', marginTop: 4 }}>
                <b className="dtw-num" style={{ fontSize: 32, color: riskTone(selScore.risk) }}>{selScore.risk}</b>
                <span className="dtw-mut">/ 100</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                {[['Cost', selScore.cost], ['CO₂', selScore.co2], ['Forest', selScore.forest], ['Logistics', selScore.logistics], ['Resilience', selScore.resilience]].map(([k, v]: any)=> (
                  <div key={k}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                      <span style={{ color: '#8CA0B3' }}>{k}</span>
                      <b className="dtw-num">{typeof v === 'number' ? v : '—'}</b>
                    </div>
                    <div className="dtw-bar"><i style={{ width: `${typeof v === 'number' ? Math.min(100, v) : 0}%`, background: '#3B82F6' }} /></div>
                  </div>
                ))}
              </div>
              <div className="dtw-mut" style={{ marginTop: 8 }}>Điểm từ scorecard API theo kịch bản — thang từng chỉ số do backend định nghĩa.</div>
            </>
          )}
          <div className="dtw-dsec"><h4>DATA FRESHNESS</h4>
            <div className="dtw-kv"><span>Đồng bộ</span><b className="dtw-num">{syncedAt ? fmtClock(syncedAt) : '—'}</b></div>
            <div className="dtw-kv"><span>Nguồn</span><b>API twin states + scenarios</b></div>
          </div>
        </aside>
      </div>

      {/* SCENARIO RESPONSE */}
      {selScore && typeof selScore.risk === 'number' && cur != null && fc != null && (
        <section className="dtw-panel" style={{ marginTop: 12 }} aria-label="So sánh phản ứng kịch bản">
          <div className="dtw-kicker">SCENARIO RESPONSE</div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'baseline', flexWrap: 'wrap', marginTop: 8 }}>
            {[['Current', cur], ['Forecast', fc], ['Scenario', selScore.risk]].map(([k, v]: any)=> (
              <span key={k} style={{ fontSize: 13 }}><span style={{ color: '#8CA0B3' }}>{k} </span><b className="dtw-num" style={{ fontSize: 22 }}>{v}</b></span>
            ))}
            <span style={{ fontSize: 13 }}><span style={{ color: '#8CA0B3' }}>DELTA (Scenario − Current) </span><b className="dtw-num" style={{ fontSize: 22, color: selScore.risk - cur >= 0 ? '#F59E0B' : '#22C55E' }}>{selScore.risk - cur >= 0 ? '+' : ''}{selScore.risk - cur}</b></span>
          </div>
          <div className="dtw-mut" style={{ marginTop: 4 }}>Delta là phép trừ trực tiếp hai chỉ số API — không phải mô hình nhân quả.</div>
        </section>
      )}

      {/* HISTORY */}
      <section className="dtw-panel" style={{ marginTop: 12 }} aria-label="Lịch sử kịch bản">
        <div className="dtw-kicker">SCENARIO HISTORY · DB</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          {rows.map(r=> (
            <div key={r.id}>
              <button className={`dtw-row${cascadeFor === r.id ? ' sel' : ''}`} onClick={()=> showCascade(r)} aria-expanded={cascadeFor === r.id}>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, fontWeight: 700 }}>{r.name}</span>
                <span className="dtw-chip">{r.type} · v{r.version} · {r.status || '—'}</span>
                <span className="dtw-mut dtw-num" style={{ fontSize: 12 }}>{scores[r.id] && typeof scores[r.id].risk === 'number' ? scores[r.id].risk : '—'}</span>
                <ChevronRight size={14} style={{ color: '#5B6E82', flex: 'none' }} />
              </button>
              {cascadeFor === r.id && cascade && !cascade.error && (
                <div style={{ marginTop: 6, fontSize: 12, background: 'rgba(148,163,184,0.07)', borderRadius: 10, padding: '8px 12px' }}>
                  <div>⛓ {(cascade.cascade || []).join(' → ')}</div>
                  <div style={{ marginTop: 4 }}>{Object.entries(cascade.temporal || {}).map(([t, v])=> <div key={t}><b>{t}</b>: {String(v)}</div>)}</div>
                </div>
              )}
              {cascadeFor === r.id && cascade?.error && <div style={{ color: '#FCA5A5', fontSize: 12, marginTop: 4 }}>{cascade.error}</div>}
            </div>
          ))}
          {rows.length === 0 && !fetching && (
            <div className="dtw-empty">
              <Plus size={22} style={{ color: '#5B6E82' }} />
              <b>CHƯA CÓ KỊCH BẢN ĐANG CHẠY</b>
              <p>Tạo một kịch bản để đánh giá tác động lên hệ thống môi trường.<br />Điểm số được tính từ các tham số hiện có. Không phải dự báo chắc chắn.</p>
            </div>
          )}
          {fetching && <div className="dtw-skel" style={{ height: 64 }} />}
        </div>
      </section>

      <div className="dtw-mut" style={{ marginTop: 12 }}>Điểm số seeded theo params — chạy lại giống nhau. Không phải dự báo chắc chắn.</div>
      {toast && <div className="dtw-toast" role="status">{toast}</div>}
    </div>
  )
}
