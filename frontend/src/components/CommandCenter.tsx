import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity, AlertTriangle, ArrowRight, Bell, Bot, BrainCircuit, ChevronRight, Clock,
  Eye, FileCheck, Flame, MapPin, Mountain, Navigation, Package, Radio,
  Satellite, ShieldAlert, ShieldCheck, Truck, Users, Wind, X,
} from 'lucide-react'
import MapView from './MapView'
import { LEVEL_COLOR } from './ForecastCard'

// ── Pure helpers (unit-tested, no data invented) ────────────────────────────

export const LEVEL_ORDER = ['I', 'II', 'III', 'IV', 'V'] as const

export function bandText(level?: string | null): string {
  if (level === 'V' || level === 'IV') return 'RỦI RO CAO'
  if (level === 'III') return 'RỦI RO TRUNG BÌNH'
  if (level === 'I' || level === 'II') return 'RỦI RO THẤP'
  return 'CHƯA XÁC ĐỊNH'
}

export function levelColor(level?: string | null): string {
  return (level && (LEVEL_COLOR as Record<string, string>)[level]) || '#64748B'
}

export function fmtInt(v: unknown): string {
  return typeof v === 'number' && Number.isFinite(v) ? String(Math.round(v)) : 'MISSING'
}

const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
export function windDir(deg: unknown): string {
  if (typeof deg !== 'number' || !Number.isFinite(deg)) return 'MISSING'
  return DIRS[Math.round(((deg % 360) + 360) % 360 / 45) % 8]
}

export type EventKind = 'AI' | 'FIRMS' | 'WEATHER' | 'SYSTEM'
export function classifyEvent(action: unknown, resource: unknown): EventKind {
  const s = `${String(action || '')} ${String(resource || '')}`.toLowerCase()
  if (/firms|hotspot|thermal|modis|viirs/.test(s)) return 'FIRMS'
  if (/weather|wind|rain|temperature|meteo|power/.test(s)) return 'WEATHER'
  if (/ai|llm|agent|model|infer|risk|forecast/.test(s)) return 'AI'
  return 'SYSTEM'
}

export function timeOf(iso: unknown): string {
  if (!iso) return ''
  const d = new Date(String(iso))
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 16)
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
}

export type SourceStatus = 'LIVE' | 'CACHED' | 'STALE' | 'MISSING' | 'UNAVAILABLE' | 'DEMO'
export function normalizeStatus(v: unknown): SourceStatus {
  const s = String(v || '').toUpperCase()
  if (s === 'LIVE') return 'LIVE'
  if (s === 'CACHED') return 'CACHED'
  if (s === 'DEMO' || s === 'DEMO DATA' || s === 'SIMULATED') return 'DEMO'
  if (s === 'STALE') return 'STALE'
  if (s === 'MISSING') return 'MISSING'
  return 'UNAVAILABLE'
}

// Confidence basis from engine state only: 5 fixed engine inputs
// (satellite, weather, firms, terrain, community). No new algorithm.
export type ConfidenceBasis = { evaluated: number; available: number; stale: number; missing: string[] }
export function confidenceBasis(missing: unknown, staleCount: number): ConfidenceBasis {
  const miss = Array.isArray(missing) ? missing.map(String) : []
  const stale = Number.isFinite(staleCount) && staleCount > 0 ? Math.floor(staleCount) : 0
  return { evaluated: 5, available: Math.max(0, 5 - miss.length), stale, missing: miss }
}

// Unix timestamp (seconds, as returned by /api/fire/risk) → HH:MM:SS.
// Never invented: returns null when input is not a real timestamp.
export function timeSec(ts: unknown): string | null {
  if (typeof ts !== 'number' || !Number.isFinite(ts) || ts <= 0) return null
  const d = new Date(ts * 1000)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

// ── Intelligence-proof builders (pure, observed data only) ───────────────────
// A signal is OBSERVED only when its fetch returned a real value.
// DEMO fetch results render as SIMULATED — never as live counts.
export type SignalItem = { n: string; source: string; value: string | null; status: SourceStatus }

export function buildRiskSignals(input: {
  firmsCount: number | null; firmsStatus: SourceStatus;
  wind: number | null; temp: number | null; humidity: number | null; wxStatus: SourceStatus;
  ndvi: number | null; ndviStatus: SourceStatus;
  proposals: number | null;
}): SignalItem[] {
  const demoFirms = input.firmsStatus === 'DEMO'
  return [
    {
      n: '01', source: 'FIRMS',
      value: demoFirms ? 'SIMULATED' : (typeof input.firmsCount === 'number'
        ? (input.firmsCount > 0 ? `${input.firmsCount} active hotspots` : 'No active hotspot')
        : null),
      status: input.firmsStatus,
    },
    {
      n: '02', source: 'WEATHER',
      value: input.wind != null
        ? `${input.wind} km/h${input.temp != null ? ` · ${input.temp}°C` : ''}${input.humidity != null ? ` · humidity ${input.humidity}%` : ''}`
        : null,
      status: input.wxStatus,
    },
    {
      n: '03', source: 'NDVI',
      value: input.ndviStatus === 'DEMO' ? 'SIMULATED' : (typeof input.ndvi === 'number' ? input.ndvi.toFixed(2) : null),
      status: input.ndviStatus,
    },
    {
      n: '04', source: 'COMMUNITY',
      value: typeof input.proposals === 'number' ? `${input.proposals} proposals on record` : null,
      status: typeof input.proposals === 'number' ? 'LIVE' : 'UNAVAILABLE',
    },
  ]
}

export type Interpretation = { driver: string | null; factors: [string, string][] } | null

export function buildInterpretation(fireRisk: any): Interpretation {
  if (!fireRisk) return null
  const driver = fireRisk?.forecast_rating?.major_risk_driver || null
  const raw = fireRisk?.factors
  const factors: [string, string][] = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? Object.entries(raw).slice(0, 4).map(([k, v]) => [String(k), String(v)])
    : []
  if (!driver && factors.length === 0) return null
  return { driver: driver && driver !== 'MISSING' ? String(driver) : null, factors }
}

// ── Shared styles (light, calm, 12–16px radius, 150–250ms motion) ───────────

export function CxStyles() {
  return (
    <style>{`
    .cx{ --cx-bg:#F7F9F8; --cx-surface:#fff; --cx-line:#E4E9E6; --cx-text:#0C1B17; --cx-mut:#5F716B; --cx-deep:#0C5C54; --cx-dark:#0B1412; }
    .cx-grid{ display:grid; gap:12px; }
    .cx-hero{ grid-template-columns:minmax(330px,5fr) 7fr; align-items:stretch; }
    .cx-duo{ grid-template-columns:5fr 7fr; align-items:start; }
    .cx-half{ grid-template-columns:1fr 1fr; align-items:start; }
    @media (max-width:1024px){ .cx-hero,.cx-duo{ grid-template-columns:1fr; } }
    @media (max-width:900px){ .cx-half{ grid-template-columns:1fr; } }
    .cx-card{ background:var(--cx-surface); border:1px solid var(--cx-line); border-radius:14px; padding:16px; min-width:0; animation:cxin 220ms ease-out; transition:transform 200ms cubic-bezier(0.32,0.72,0,1), box-shadow 200ms cubic-bezier(0.32,0.72,0,1); }
    .cx-card:hover{ transform:translateY(-2px); box-shadow:0 8px 24px rgba(11,20,18,0.08); }
    @keyframes cxin{ from{ opacity:0; transform:translateY(4px) } to{ opacity:1; transform:none } }
    .cx-kicker{ font-size:11px; font-weight:800; letter-spacing:1.2px; color:var(--cx-mut); }
    .cx-title{ font-size:15px; font-weight:800; color:var(--cx-text); margin-top:2px; }
    .cx-big{ font-size:56px; font-weight:800; line-height:1; font-variant-numeric:tabular-nums; letter-spacing:-1px; color:var(--cx-text); }
    .cx-band{ display:inline-block; font-size:12px; font-weight:800; letter-spacing:0.8px; border-radius:8px; padding:4px 12px; color:#fff; }
    .cx-mut{ font-size:12px; color:var(--cx-mut); }
    .cx-row{ display:flex; gap:8px; align-items:center; }
    .cx-dot{ width:8px; height:8px; border-radius:999px; flex:none; }
    .cx-dot.live{ background:#0E9F6E; animation:cxpulse 2s infinite; }
    .cx-dot.cached{ background:#D97706; }
    .cx-dot.stale{ background:#94A3B8; }
    .cx-dot.missing{ background:#CBD5D1; }
    .cx-dot.bad{ background:#DC2626; }
    @keyframes cxpulse{ 0%,100%{ opacity:1 } 50%{ opacity:0.35 } }
    .cx-src{ display:flex; justify-content:space-between; align-items:center; gap:8px; padding:8px 0; border-top:1px solid #F1F5F3; font-size:13px; }
    .cx-srcval{ font-variant-numeric:tabular-nums; }
    .cx-warn{ margin-top:12px; background:#FFFBEB; border:1px solid #F3D9AC; border-left:3px solid #D97706; border-radius:10px; padding:8px 12px; }
    .cx-warn b{ font-size:12px; letter-spacing:0.6px; color:#92400E; }
    .cx-warn div{ font-size:12px; color:#92400E; margin-top:2px; }
    .cx-chip{ font-size:10px; font-weight:800; letter-spacing:0.6px; border-radius:6px; padding:2px 8px; border:1px solid var(--cx-line); white-space:nowrap; transition:background-color 200ms cubic-bezier(0.4,0,0.2,1), color 200ms cubic-bezier(0.4,0,0.2,1), border-color 200ms cubic-bezier(0.4,0,0.2,1); }
    .cx-chip.live{ background:#E7F6F0; color:#0B6B4F; border-color:#BFE3D4; }
    .cx-chip.cached{ background:#FDF3E3; color:#92400E; border-color:#F3D9AC; }
    .cx-chip.stale{ background:#F1F5F9; color:#475569; }
    .cx-chip.missing{ background:#F8FAF9; color:#94A3B8; }
    .cx-chip.bad{ background:#FDECEC; color:#991B1B; border-color:#F5C2C2; }
    .cx-chip.demo{ background:#fff; color:#92400E; border-color:#92400E; border-style:dashed; }
    .cx-tag{ font-size:10px; font-weight:800; letter-spacing:0.6px; border-radius:6px; padding:2px 8px; white-space:nowrap; }
    .cx-tag.obs{ background:#E7F6F0; color:#0B6B4F; border:1px solid #BFE3D4; }
    .cx-tag.ai{ background:#0B1412; color:#fff; }
    .cx-tag.rec{ background:#fff; color:#0C5C54; border:1px solid #0C5C54; }
    .cx-sig{ display:flex; gap:10px; padding:8px 0; border-top:1px solid #F1F5F3; font-size:13px; }
    .cx-sign{ font-size:12px; font-weight:800; color:#94A3B8; min-width:24px; font-variant-numeric:tabular-nums; padding-top:1px; }
    .cx-kv{ display:flex; gap:6px; font-size:12px; color:var(--cx-mut); margin-top:2px; flex-wrap:wrap; }
    .cx-kv b{ color:var(--cx-text); font-weight:700; }
    .cx-basis{ margin-top:8px; border:1px solid var(--cx-line); border-radius:10px; padding:8px 12px; background:#FAFCFB; font-size:12px; }
    .cx-scale{ display:flex; gap:4px; margin-top:12px; }
    .cx-seg{ flex:1; text-align:center; font-size:11px; font-weight:800; border-radius:8px; padding:8px 0; background:#F1F5F3; color:#94A3B8; border:1px solid transparent; }
    .cx-seg.on{ color:#fff; }
    .cx-kpis{ display:grid; gap:12px; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); }
    .cx-kpi-num{ font-size:24px; font-weight:700; font-variant-numeric:tabular-nums; line-height:1.15; color:var(--cx-text); }
    .cx-evt{ display:flex; gap:8px; padding:8px 0; border-top:1px solid #F1F5F3; font-size:13px; min-width:0; }
    .cx-evt time{ font-size:11px; color:var(--cx-mut); min-width:40px; font-variant-numeric:tabular-nums; }
    .cx-kind{ font-size:10px; font-weight:800; letter-spacing:0.6px; color:var(--cx-mut); min-width:56px; padding-top:2px; }
    .cx-tabs{ display:flex; gap:8px; flex-wrap:wrap; }
    .cx-tab{ font-size:11px; font-weight:800; border-radius:999px; border:1px solid var(--cx-line); background:#fff; padding:4px 12px; color:var(--cx-mut); }
    .cx-tab.on{ background:var(--cx-dark); color:#fff; border-color:var(--cx-dark); }
    .cx-btn{ display:inline-flex; gap:8px; align-items:center; font-size:12px; font-weight:800; border-radius:10px; padding:8px 16px; border:1px solid var(--cx-line); background:#fff; color:var(--cx-text); text-decoration:none; transition:background 180ms ease-out, border-color 180ms ease-out; }
    .cx-btn:hover{ background:#F7F9F8; }
    .cx-btn.dark{ background:var(--cx-dark); color:#fff; border-color:var(--cx-dark); }
    .cx-btn.teal{ background:var(--cx-deep); color:#fff; border-color:var(--cx-deep); }
    .cx-num{ display:inline-block; animation:cxfade 200ms ease; }
    @keyframes cxfade{ from{ opacity:0; transform:translateY(3px) } to{ opacity:1; transform:none } }
    .cx-tier{ display:flex; align-items:center; gap:12px; margin:24px 0 8px; }
    .cx-tier::after{ content:''; flex:1; height:1px; background:var(--cx-line); }
    .cx-tier b{ font-size:14px; }
    .cx-act{ display:flex; gap:12px; padding:12px 0; border-top:1px solid #F1F5F3; }
    .cx-act-n{ font-size:20px; font-weight:800; color:#CBD5D1; min-width:32px; font-variant-numeric:tabular-nums; }
    .cx-mapwrap{ height:600px; }
    @media (max-width:640px){ .cx-mapwrap{ height:400px; } }
    @media (prefers-reduced-motion: reduce){ .cx *{ animation:none !important; transition:none !important; } }
    `}</style>
  )
}

export function SectionHead({ kicker, title, right }: { kicker: string; title: string; right?: ReactNode }) {
  return (
    <div className="cx-tier">
      <span className="cx-kicker">{kicker}</span>
      <b style={{ fontSize: 14 }}>{title}</b>
      <span style={{ flex: 1 }} />
      {right}
    </div>
  )
}

export function CxEmpty({ icon, title, hint }: { icon: ReactNode; title: string; hint?: string }) {
  return (
    <div style={{ padding: '20px 16px', textAlign: 'center', color: '#5F716B' }}>
      <div style={{ display: 'grid', placeItems: 'center', marginBottom: 8, color: '#94A3B8' }}>{icon}</div>
      <b style={{ fontSize: 14, letterSpacing: 0.4, color: '#0C1B17' }}>{title}</b>
      {hint && <div style={{ fontSize: 12, marginTop: 4 }}>{hint}</div>}
    </div>
  )
}

export function CxSkeleton({ h = 64 }: { h?: number }) {
  return <div className="skeleton" style={{ height: h, borderRadius: 12 }} />
}

// ── Page head ────────────────────────────────────────────────────────────────

export function CommandHead({ live, updated, onAI, extra }: { live: boolean; updated: string; onAI: () => void; extra?: ReactNode }) {
  return (
    <div className="cx-card" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
      <span className={`cx-dot ${live ? 'live' : 'bad'}`} />
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <b style={{ fontSize: 18, letterSpacing: -0.2 }}>Trung tâm Chỉ huy</b>
          <span className={`cx-chip ${live ? 'live' : 'bad'}`}>{live ? 'SYSTEM ONLINE' : 'OFFLINE'}</span>
        </div>
        <div className="cx-mut">Gia Lai Environmental Command Center · Cập nhật {updated}</div>
      </div>
      <span style={{ flex: 1 }} />
      {extra}
      <button className="cx-btn dark cta-lift" onClick={onAI}><Bot size={15} /> ECO AI</button>
    </div>
  )
}

// ── Risk index ───────────────────────────────────────────────────────────────

export type SourceRow = { key: string; label: string; status: SourceStatus; detail?: string }

const SRC_ICON: Record<string, ReactNode> = {
  NDVI: <Satellite size={15} />, FIRMS: <Flame size={15} />, WEATHER: <Wind size={15} />,
  TERRAIN: <Mountain size={15} />, COMMUNITY: <Users size={15} />,
}

export function RiskIndexPanel({ loading, score, level, label, confidence, sources, updated, signals, basis, analyzedAt, modelVersion }: {
  loading: boolean; score?: number | null; level?: string | null; label?: string | null;
  confidence?: number | null; sources: SourceRow[]; updated?: string | null;
  signals?: SignalItem[] | null; basis?: ConfidenceBasis | null;
  analyzedAt?: string | null; modelVersion?: string | null;
}) {
  const [basisOpen, setBasisOpen] = useState(false)
  const incomplete = sources.some(s => s.status !== 'LIVE' && s.status !== 'DEMO')
  const signalOf = (key: string): string | null => {
    const hit = (signals || []).find(s => s.source === key)
    return hit ? hit.value : null
  }
  return (
    <div className="cx-card">
      <div className="cx-kicker">FOREST RISK INDEX · GIA LAI</div>
      {loading ? (
        <div aria-busy="true">
          <div className="skeleton" style={{ width: 150, height: 56, borderRadius: 12, marginTop: 8 }} />
          <div className="skeleton" style={{ width: '55%', height: 14, borderRadius: 8, marginTop: 8 }} />
          <div className="skeleton" style={{ width: '40%', height: 12, borderRadius: 8, marginTop: 8 }} />
          <div style={{ display: 'flex', gap: 4, marginTop: 12 }}>{[0, 1, 2, 3, 4].map(i => <div key={i} className="skeleton" style={{ flex: 1, height: 32, borderRadius: 8 }} />)}</div>
        </div>
      ) : score == null ? (
        <CxEmpty icon={<Activity size={22} />} title="NO DATA" hint="Risk endpoint unavailable — WAITING FOR SYNC" />
      ) : (
        <>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
            <span className="cx-big"><span key={score} className="cx-num">{Math.round(score)}</span><span style={{ fontSize: 16, fontWeight: 700, color: '#5F716B' }}> / 100</span></span>
            <span className="cx-band" style={{ background: levelColor(level) }}>{level ? `CẤP ${level}` : bandText(level)}</span>
          </div>
          <div style={{ fontSize: 14, fontWeight: 800, marginTop: 8 }}>{label || bandText(level)}</div>
          <div className="cx-mut" style={{ marginTop: 4 }}>
            ASSESSMENT CONFIDENCE: {typeof confidence === 'number' ? `${Math.round(confidence)}%` : 'MISSING'}
            {updated ? ` · ${updated}` : ''}
          </div>
          {basis && (
            <div className="cx-mut" style={{ marginTop: 2 }}>
              CONFIDENCE BASIS: {basis.available}/{basis.evaluated} nguồn có dữ liệu
              {basis.stale > 0 ? ` · ${basis.stale} stale` : ''}
              {basis.missing.length > 0 ? ` · thiếu: ${basis.missing.join(', ')}` : ''}
            </div>
          )}
          <div className="cx-scale" aria-label="Risk scale I to V">
            {LEVEL_ORDER.map(lv => (
              <span key={lv} className={`cx-seg${lv === level ? ' on' : ''}`}
                style={lv === level ? { background: levelColor(lv) } : undefined}>{lv}</span>
            ))}
          </div>
        </>
      )}
      <div style={{ marginTop: 12 }}>
        <div className="cx-kicker" style={{ marginBottom: 4 }}>RISK BASIS — SOURCES CONTRIBUTING TO THIS ASSESSMENT</div>
        {loading ? (
          <div aria-busy="true">{sources.map(s => (
            <div className="cx-src" key={s.key}>
              <div className="skeleton" style={{ width: '45%', height: 13, borderRadius: 6 }} />
              <div className="skeleton" style={{ width: 72, height: 20, borderRadius: 6 }} />
            </div>
          ))}</div>
        ) : sources.map(s => {
          const sig = signalOf(s.key)
          return (
            <div className="cx-src" key={s.key}>
              <span className="cx-row" style={{ color: '#0C1B17' }}>{SRC_ICON[s.key] || <Activity size={15} />}<b style={{ fontWeight: 700 }}>{s.label}</b></span>
              <span className="cx-row">
                {sig ? <span className="cx-mut cx-srcval">{sig}</span> : (s.detail ? <span className="cx-mut cx-srcval">{s.detail}</span> : null)}
                <span className={`cx-chip ${s.status.toLowerCase()}`}>{s.status}</span>
              </span>
            </div>
          )
        })}
      </div>
      {incomplete && !loading && (
        <div className="cx-warn" role="note" aria-label="Confidence warning">
          <b>DATA INCOMPLETE</b>
          <div>Một số nguồn chưa LIVE, đánh giá có thể thiếu.</div>
          <div>CONFIDENCE CONSTRAINED BY DATA QUALITY: {typeof confidence === 'number' ? `${Math.round(confidence)}% assessment confidence` : 'MISSING'}</div>
        </div>
      )}
      {!loading && score != null && (
        <div style={{ marginTop: 8 }}>
          <button className="cx-btn" onClick={() => setBasisOpen(o => !o)} aria-expanded={basisOpen} style={{ width: '100%', justifyContent: 'center' }}>
            VIEW DATA BASIS {basisOpen ? '▴' : '▾'}
          </button>
          {basisOpen && (
            <div className="cx-basis">
              <div className="cx-kicker">DATA BASIS</div>
              <div className="cx-kv"><span>Risk:</span><b>{Math.round(score)} / 100 · {level ? `CẤP ${level}` : bandText(level)}</b></div>
              <div className="cx-kv"><span>Sources:</span><b>{sources.map(s => s.label).join(' · ')}</b></div>
              <div className="cx-kv"><span>Last analyzed:</span><b>{analyzedAt || 'UNAVAILABLE'}</b></div>
              <div className="cx-kv"><span>Data quality:</span><b>{basis ? `${basis.available}/${basis.evaluated} available${basis.missing.length ? ` · missing ${basis.missing.join(', ')}` : ''}` : 'UNAVAILABLE'}</b></div>
              {modelVersion && <div className="cx-kv"><span>Engine:</span><b>FireRisk {modelVersion}</b></div>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── AI situation brief ───────────────────────────────────────────────────────

export type BriefData = {
  level?: string | null; label?: string | null;
  coverage?: string | null; missing?: string[];
  recommendation?: string | null;
  signals?: SignalItem[] | null;
  interpretation?: Interpretation;
} | null

export function AISituationBrief({ loading, brief, onOpenAI }: {
  loading: boolean; brief: BriefData; onOpenAI: () => void;
}) {
  return (
    <div className="cx-card" style={{ borderLeft: `4px solid ${levelColor(brief?.level)}` }}>
      <div className="cx-row" style={{ justifyContent: 'space-between' }}>
        <span className="cx-kicker"><BrainCircuit size={13} style={{ verticalAlign: -2 }} /> AI SITUATION BRIEF</span>
        <span className={`cx-chip ${brief ? 'live' : 'missing'}`}>{brief ? 'LIVE' : 'STANDBY'}</span>
      </div>
      {loading ? (
        <div aria-busy="true">
          <div className="skeleton" style={{ width: '80%', height: 22, borderRadius: 8, marginTop: 8 }} />
          <div className="skeleton" style={{ width: '45%', height: 12, borderRadius: 6, marginTop: 16 }} />
          {[0, 1, 2, 3].map(i => <div key={i} className="skeleton" style={{ width: `${92 - i * 6}%`, height: 13, borderRadius: 6, marginTop: 8 }} />)}
          <div className="skeleton" style={{ width: '45%', height: 12, borderRadius: 6, marginTop: 16 }} />
          <div className="skeleton" style={{ width: '70%', height: 15, borderRadius: 6, marginTop: 8 }} />
        </div>
      ) : !brief ? (
        <CxEmpty icon={<BrainCircuit size={22} />} title="AI ANALYSIS UNAVAILABLE"
          hint="Risk service chưa phản hồi — không suy đoán thay AI" />
      ) : (
        <>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.2, marginTop: 8, lineHeight: 1.35 }}>
            Gia Lai đang ở trạng thái <span style={{ color: levelColor(brief.level) }}>{brief.label || bandText(brief.level)}</span>
            {brief.interpretation?.driver ? <> — do <span style={{ color: levelColor(brief.level) }}>{brief.interpretation.driver.toLowerCase()}</span></> : null}
          </div>
          <div className="cx-kicker" style={{ marginTop: 16 }}>WHY THIS MATTERS</div>
          {(brief.signals || []).length === 0 ? (
            <div className="cx-mut" style={{ marginTop: 8, fontSize: 13 }}>EVIDENCE UNAVAILABLE — không có tín hiệu quan trắc để trình bày.</div>
          ) : (brief.signals || []).map(s => (
            <div className="cx-sig" key={s.n}>
              <span className="cx-sign">{s.n}</span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <span className="cx-tag obs">OBSERVED</span>
                <div style={{ fontSize: 13, fontWeight: 700, marginTop: 4 }}>{s.value || 'Signal unavailable'}</div>
                <div className="cx-kv"><span>Source:</span><b>{s.source}</b><span>Value:</span><b>{s.value || 'NOT PROVIDED'}</b><span>Status:</span><b>{s.status}</b></div>
              </div>
            </div>
          ))}
          {brief.interpretation ? (
            <>
              <div style={{ marginTop: 12 }}><span className="cx-tag ai">AI INTERPRETATION</span></div>
              {brief.interpretation.driver && <div style={{ fontSize: 13, marginTop: 8 }}>Nguyên nhân chính: <b>{brief.interpretation.driver}</b></div>}
              {brief.interpretation.factors.length > 0 && (
                <div className="cx-mut" style={{ fontSize: 12, marginTop: 4 }}>
                  Engine signals: {brief.interpretation.factors.map(([k, v]) => `${k} ${v}`).join(' · ')}
                </div>
              )}
            </>
          ) : (
            <div className="cx-mut" style={{ marginTop: 12, fontSize: 13 }}>EVIDENCE UNAVAILABLE — engine chưa trả diễn giải cho kỳ này.</div>
          )}
          <div className="cx-kicker" style={{ marginTop: 16 }}>AI RECOMMENDATION</div>
          <div style={{ marginTop: 4 }}><span className="cx-tag rec">RECOMMENDATION</span></div>
          <div style={{ fontSize: 14, fontWeight: 700, marginTop: 8, lineHeight: 1.55 }}>{brief.recommendation || 'Chưa có khuyến nghị — xem hành động đề xuất bên dưới.'}</div>
          <div style={{ marginTop: 16 }}>
            <button className="cx-btn teal" onClick={onOpenAI}>MỞ PHÂN TÍCH AI <ArrowRight size={14} /></button>
          </div>
        </>
      )}
    </div>
  )
}

// ── KPI strip ────────────────────────────────────────────────────────────────

export type Kpi = { key: string; label: string; icon: ReactNode; value: ReactNode; sub?: string }

export function KPIBar({ loading, items }: { loading: boolean; items: Kpi[] }) {
  return (
    <div className="cx-kpis">
      {items.map(k => (
        <div className="cx-card" key={k.key}>
          <div className="cx-row" style={{ color: '#5F716B' }}>{k.icon}<span className="cx-kicker">{k.label}</span></div>
          <div className="cx-kpi-num" style={{ marginTop: 8 }}>
            {loading ? <span className="skeleton" style={{ display: 'inline-block', width: 64, height: 28, borderRadius: 8 }} /> : k.value}
          </div>
          {k.sub != null && !loading && <div className="cx-mut">{k.sub}</div>}
        </div>
      ))}
    </div>
  )
}

// ── Live event stream ────────────────────────────────────────────────────────

const KIND_ICON: Record<EventKind, ReactNode> = {
  AI: <BrainCircuit size={14} />, FIRMS: <Flame size={14} />,
  WEATHER: <Wind size={14} />, SYSTEM: <Activity size={14} />,
}
const TABS: ('ALL' | EventKind)[] = ['ALL', 'AI', 'FIRMS', 'WEATHER', 'SYSTEM']

export type CxEvent = { time: string; kind: EventKind; title: string; sub?: string }

export function LiveEventStream({ loading, events }: { loading: boolean; events: CxEvent[] }) {
  const [tab, setTab] = useState<'ALL' | EventKind>('ALL')
  const shown = (tab === 'ALL' ? events : events.filter(e => e.kind === tab)).slice(0, 8)
  return (
    <div className="cx-card">
      <div className="cx-row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div><div className="cx-kicker">LIVE EVENT STREAM</div><div className="cx-title">Dòng sự kiện</div></div>
        <div className="cx-tabs" role="tablist" aria-label="Lọc sự kiện">
          {TABS.map(t => (
            <button key={t} role="tab" aria-selected={tab === t} className={`cx-tab${tab === t ? ' on' : ''}`} onClick={() => setTab(t)}>{t}</button>
          ))}
        </div>
      </div>
      <div style={{ marginTop: 8 }}>
        {loading ? <CxSkeleton h={120} /> : shown.length === 0 ? (
          <CxEmpty icon={<Clock size={22} />} title="NO RECENT EVENTS" hint={events.length === 0 ? 'Nhật ký hệ thống trống' : `Không có sự kiện ${tab}`} />
        ) : shown.map((e, i) => (
          <div className="cx-evt" key={i}>
            <time>{e.time}</time>
            <span className="cx-kind">{e.kind}</span>
            <span style={{ color: '#0C5C54', flex: 'none', marginTop: 1 }}>{KIND_ICON[e.kind]}</span>
            <span style={{ minWidth: 0 }}><b style={{ fontWeight: 700 }}>{e.title}</b>{e.sub && <div className="cx-mut" style={{ marginTop: 2 }}>{e.sub}</div>}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Operational map preview (reuses the real EcoMap component) ──────────────

export function OperationalMapPreview({ live }: { live: boolean }) {
  return (
    <div className="cx-card" style={{ padding: 0, overflow: 'hidden' }}>
      <div className="cx-row" style={{ justifyContent: 'space-between', padding: '12px 16px', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 }}>
          <div><div className="cx-kicker">OPERATIONAL MAP · GIA LAI</div><div className="cx-title">Bản đồ tác chiến — hotspot, vùng rủi ro, sự cố</div></div>
          <span className={`cx-chip ${live ? 'live' : 'bad'}`}>LIVE DATA</span>
        </div>
        <Link className="cx-btn" to="/">MỞ BẢN ĐỒ <ArrowRight size={14} /></Link>
      </div>
      <div className="cx-mapwrap" style={{ position: 'relative', borderTop: '1px solid #E4E9E6' }}>
        <MapView fill />
      </div>
    </div>
  )
}

// ── Incidents + assets ───────────────────────────────────────────────────────

export function IncidentPanel({ loading, incidents, alertsCount }: {
  loading: boolean; incidents: any[] | null; alertsCount: number;
}) {
  return (
    <div className="cx-card">
      <div className="cx-row" style={{ justifyContent: 'space-between' }}>
        <div><div className="cx-kicker">ACTIVE INCIDENTS</div><div className="cx-title">Sự cố đang hoạt động</div></div>
        <Link className="cx-btn" to="/notifications">Xử lý <ArrowRight size={14} /></Link>
      </div>
      <div style={{ marginTop: 8 }}>
        {loading ? <CxSkeleton h={90} /> : incidents === null ? (
          <CxEmpty icon={<AlertTriangle size={22} />} title="DATA UNAVAILABLE" hint="Không tải được danh sách sự cố" />
        ) : incidents.length === 0 ? (
          <CxEmpty icon={<ShieldCheck size={22} />} title="NO ACTIVE INCIDENTS" hint={alertsCount > 0 ? `${alertsCount} cảnh báo ACTIVE đang được theo dõi` : 'Hệ thống vẫn giám sát'} />
        ) : incidents.slice(0, 6).map((s: any, i: number) => (
          <div className="cx-evt" key={s.id || i}>
            <AlertTriangle size={14} style={{ color: '#B91C1C', flex: 'none', marginTop: 3 }} />
            <span style={{ minWidth: 0 }}><b>{s.title || s.id}</b><span className="cx-mut"> · {s.status || ''}</span></span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function AssetStatusPanel({ assets }: { assets: any[] }) {
  const count = (t: string) => assets.filter(a => a.asset_type === t && a.status === 'active').length
  const rows = [
    { icon: <Users size={15} />, label: 'Đội phản ứng', v: count('team') + count('station') },
    { icon: <Truck size={15} />, label: 'Phương tiện', v: count('firetruck') },
    { icon: <Package size={15} />, label: 'Nguồn nước / Bể', v: count('water') },
    { icon: <ShieldCheck size={15} />, label: 'Trạm / Chòi / Camera', v: count('station') + count('watchtower') + count('camera') },
  ]
  const total = assets.filter(a => a.status === 'active').length
  return (
    <div className="cx-card">
      <div className="cx-row" style={{ justifyContent: 'space-between' }}>
        <div><div className="cx-kicker">ASSET STATUS</div><div className="cx-title">Trạng thái tài sản</div></div>
        <Link className="cx-btn" to="/admin">Quản lý <ArrowRight size={14} /></Link>
      </div>
      {total === 0 ? (
        <CxEmpty icon={<Package size={22} />} title="NO ASSETS CONNECTED" hint="Nhập GPS tài sản ở trang Quản trị" />
      ) : rows.map(r => (
        <div className="cx-src" key={r.label}>
          <span className="cx-row" style={{ color: '#0C1B17' }}>{r.icon}<b>{r.label}</b></span>
          <b style={{ fontVariantNumeric: 'tabular-nums' }}>{r.v}</b>
        </div>
      ))}
    </div>
  )
}

// ── Recommended actions (backend data only — never invented) ─────────────────

export function RecommendedActions({ plan, planLoading }: { plan: any; planLoading: boolean }) {
  const actions: any[] = plan?.top_actions || []
  return (
    <div className="cx-card">
      <div className="cx-kicker">RECOMMENDED ACTIONS</div>
      <div className="cx-title">Hành động đề xuất</div>
      {planLoading ? <div style={{ marginTop: 8 }}><CxSkeleton h={80} /></div>
        : actions.length === 0 ? (
          <CxEmpty icon={<FileCheck size={22} />} title="NO RECOMMENDED ACTIONS"
            hint="Chạy Response Plan ở mục Operations để sinh phương án" />
        ) : actions.map((a: any, i: number) => (
          <div className="cx-act" key={i}>
            <span className="cx-act-n">{String(i + 1).padStart(2, '0')}</span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <b style={{ fontSize: 13 }}>{a.action}: {a.title}</b>
              {a.reason ? <div style={{ fontSize: 12, marginTop: 2 }}>WHY: {a.reason}</div> : null}
              <div className="cx-mut">Đơn vị: {a.unit || 'MISSING'} · Nguồn: Response Plan{a.eta_minutes != null ? ` · ETA ~${a.eta_minutes}′` : ''}</div>
            </div>
            <Link className="cx-btn" to={`/firesim?lat=${plan?.fire?.lat ?? 13.9}&lon=${plan?.fire?.lon ?? 108.3}`}>Mô phỏng</Link>
          </div>
        ))}
    </div>
  )
}

// ── Bell shortcut row (kept light; full lists stay in Notifications) ──────────

export function AlertShortcut({ count }: { count: number }) {
  return (
    <Link className="cx-btn" to="/notifications"><Bell size={14} /> Cảnh báo ({count})</Link>
  )
}

// ══ COMMAND WORKSPACE (Chỉ huy) — presentation over existing state ═══════════

export function CxCommandStyles() {
  return (
    <style>{`
    .cx-strip{ display:flex; flex-wrap:wrap; background:var(--cx-surface); border:1px solid var(--cx-line); border-radius:14px; overflow:hidden; }
    .cx-cell{ flex:1 1 120px; min-width:110px; padding:10px 14px; }
    .cx-cell + .cx-cell{ border-left:1px solid var(--cx-line); }
    .cx-cell .k{ font-size:10px; font-weight:800; letter-spacing:0.8px; color:var(--cx-mut); }
    .cx-cell .v{ font-size:22px; font-weight:800; font-variant-numeric:tabular-nums; line-height:1.15; }
    .cx-work{ display:grid; gap:12px; grid-template-columns:minmax(0,7fr) minmax(300px,5fr); align-items:start; }
    .cx-duo2{ display:grid; gap:12px; grid-template-columns:1fr 1fr; align-items:start; }
    .cx-trio{ display:grid; gap:12px; grid-template-columns:repeat(3,1fr); align-items:start; }
    @media (max-width:1100px){ .cx-work{ grid-template-columns:1fr; } .cx-trio{ grid-template-columns:1fr; } }
    @media (max-width:900px){ .cx-duo2{ grid-template-columns:1fr; } }
    .cx-sect{ font-size:11px; font-weight:800; letter-spacing:1.2px; color:var(--cx-mut); }
    .cx-ptitle{ font-size:15px; font-weight:800; margin-top:2px; }
    .cx-prio{ display:flex; gap:10px; padding:10px 0; border-top:1px solid #F1F5F9; align-items:flex-start; }
    .cx-prio .rank{ font-size:11px; font-weight:800; color:#94A3B8; min-width:22px; font-variant-numeric:tabular-nums; padding-top:2px; }
    .cx-feed{ display:flex; gap:8px; padding:7px 0; border-top:1px solid #F1F5F9; font-size:12px; align-items:flex-start; }
    .cx-dec{ display:flex; gap:10px; padding:10px 0; border-top:1px solid #F1F5F9; }
    .cx-hier{ display:flex; gap:8px; margin-top:8px; }
    .cx-hcol{ flex:1; border:1px solid var(--cx-line); border-radius:10px; padding:8px 10px; font-size:12px; min-width:0; }
    .cx-hcol b{ display:block; font-size:11px; letter-spacing:0.8px; margin-bottom:2px; }
    .cx-drawer-ov{ position:fixed; inset:0; background:rgba(11,20,18,0.45); z-index:70; animation:cxfade 180ms ease; }
    .cx-drawer{ position:fixed; top:0; right:0; bottom:0; width:min(440px, calc(100vw - 24px)); background:var(--cx-surface); border-left:1px solid var(--cx-line); z-index:71; overflow:auto; padding:18px; box-shadow:-12px 0 32px rgba(11,20,18,0.15); animation:cxslide 220ms ease-out; }
    @keyframes cxslide{ from{ transform:translateX(24px); opacity:0 } to{ transform:none; opacity:1 } }
    .cx-dsec{ margin-top:14px; border-top:1px solid #F1F5F9; padding-top:10px; }
    .cx-dsec h4{ margin:0 0 6px; font-size:11px; letter-spacing:1px; color:var(--cx-mut); }
    `}</style>
  )
}

// ── Pure command helpers (unit-tested) ───────────────────────────────────────

export type AlertSev = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'

export function alertSev(a: any): AlertSev {
  const l = String(a?.level || '').toUpperCase()
  if (l === 'CRITICAL' || l === 'V') return 'CRITICAL'
  if (l === 'IV') return 'HIGH'
  if (l === 'III' || l === 'WARNING' || l === 'HIGH') return 'MEDIUM'
  return 'LOW'
}

const SEV_RANK: Record<AlertSev, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }

export function sortAlerts(list: any[] | null): any[] {
  return [...(list || [])].sort((a, b) => SEV_RANK[alertSev(a)] - SEV_RANK[alertSev(b)])
}

const NONPENDING = ['COMMUNITY_VERIFIED', 'OFFICIAL_VERIFIED', 'VERIFIED', 'REJECTED']

export function isPendingProposal(p: any): boolean {
  return !!p && !NONPENDING.includes(String(p?.status || ''))
}

export type DecisionAction = { kind: 'drawer'; alert: any } | { kind: 'link'; to: string; label: string }
export type Decision = { sev: AlertSev; title: string; detail: string; action: DecisionAction }

export function buildDecisions(alerts: any[], proposals: any[] | null, planAlert: string): Decision[] {
  const out: Decision[] = []
  for (const a of (alerts || []).filter((x: any) => ['CRITICAL', 'V'].includes(String(x?.level || ''))).slice(0, 3)) {
    out.push({
      sev: 'CRITICAL',
      title: String(a?.title || a?.risk_type || 'Cảnh báo'),
      detail: planAlert === a?.id ? 'Đang có kế hoạch — theo dõi triển khai' : 'Chưa có kế hoạch — cần phân bổ lực lượng',
      action: { kind: 'drawer', alert: a },
    })
  }
  const pend = (proposals || []).filter(isPendingProposal).length
  if (pend > 0) {
    out.push({
      sev: 'HIGH',
      title: `${pend} báo cáo hiện trường chờ xác minh`,
      detail: 'Xem báo cáo và xác minh tại Cộng đồng',
      action: { kind: 'link', to: '/community', label: 'XÁC MINH' },
    })
  }
  return out.slice(0, 4)
}

export type Hier = { now: string | null; next: string[]; monitor: string[] }

export function buildHierarchy(alerts: any[], proposals: any[] | null, missionsActive: number): Hier {
  const crit = (alerts || []).filter((a: any) => ['CRITICAL', 'V'].includes(String(a?.level || '')))
  const watch = (alerts || []).filter((a: any) => !['CRITICAL', 'V'].includes(String(a?.level || ''))).length
  const pend = (proposals || []).filter(isPendingProposal).length
  return {
    now: crit.length > 0 ? `${String(crit.length).padStart(2, '0')} critical incident${crit.length > 1 ? 's' : ''}` : null,
    next: [
      ...(pend > 0 ? [`${String(pend).padStart(2, '0')} báo cáo chờ xác minh`] : []),
      ...(missionsActive > 0 ? [`${String(missionsActive).padStart(2, '0')} nhiệm vụ đang xử lý`] : []),
    ],
    monitor: [
      ...(watch > 0 ? [`${String(watch).padStart(2, '0')} cảnh báo theo dõi`] : []),
    ],
  }
}

export function fmtClockFull(iso: unknown): string {
  if (!iso) return ''
  const d = new Date(String(iso))
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 8)
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

// ── Command workspace components ─────────────────────────────────────────────

const SEVC: Record<AlertSev, string> = { CRITICAL: '#DC2626', HIGH: '#EA580C', MEDIUM: '#D97706', LOW: '#64748B' }

export function CommandStatusStrip({ cells }: { cells: { label: string; value: string; tone?: string }[] }) {
  return (
    <div className="cx-strip" role="region" aria-label="Trạng thái điều hành">
      {cells.map(c => (
        <div className="cx-cell" key={c.label}>
          <div className="k">{c.label}</div>
          <div className="v" style={c.tone ? { color: c.tone } : undefined}>{c.value}</div>
        </div>
      ))}
    </div>
  )
}

export function PriorityIncidents({ alerts, planAlert, onOpen, onPlan }: {
  alerts: any[]; planAlert: string; onOpen: (a: any) => void; onPlan: (a: any) => void;
}) {
  const list = sortAlerts(alerts).slice(0, 6)
  return (
    <div className="cx-card">
      <div className="cx-sect">SỰ CỐ ƯU TIÊN</div>
      <div className="cx-ptitle">Ưu tiên điều hành</div>
      {list.length === 0 && <CxEmpty icon={<ShieldCheck size={22} />} title="CHƯA CÓ SỰ CỐ ƯU TIÊN" hint="Hệ thống chưa ghi nhận sự cố cần điều hành." />}
      {list.map((a: any, i: number) => {
        const s = alertSev(a)
        return (
          <div className="cx-prio" key={a?.id || i}>
            <span className="rank">{String(i + 1).padStart(2, '0')}</span>
            <span style={{ color: SEVC[s], flex: 'none', marginTop: 1 }}><Flame size={15} /></span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <b style={{ fontSize: 13 }}>{a?.title || a?.risk_type || 'Cảnh báo'}</b>
                <span className="cx-chip" style={{ color: SEVC[s], borderColor: SEVC[s] }}>{s}</span>
                {planAlert === a?.id && <span className="cx-chip live">ĐÃ CÓ KẾ HOẠCH</span>}
              </div>
              <div className="cx-mut" style={{ marginTop: 2 }}>
                {[a?.administrative_unit_id, a?.level ? `CẤP ${a.level}` : '', a?.status].filter(Boolean).join(' · ') || 'MISSING'}
              </div>
            </div>
            <button className="cx-btn" style={{ padding: '6px 12px', flex: 'none' }} onClick={() => onOpen(a)}>MỞ</button>
            {planAlert !== a?.id && (
              <button className="cx-btn" style={{ padding: '6px 12px', flex: 'none' }} onClick={() => onPlan(a)}>Lập KH</button>
            )}
          </div>
        )
      })}
    </div>
  )
}

export function AlertFeed({ events }: { events: CxEvent[] }) {
  const shown = [...events].reverse().slice(0, 6)
  return (
    <div className="cx-card">
      <div className="cx-sect">CẢNH BÁO ĐIỀU HÀNH</div>
      <div className="cx-ptitle">Dòng cảnh báo</div>
      {shown.length === 0 && <CxEmpty icon={<Bell size={22} />} title="KHÔNG CÓ CẢNH BÁO" hint="Nhật ký hệ thống trống." />}
      {shown.map((e, i) => (
        <div className="cx-feed" key={i}>
          <time>{e.time}</time>
          <span style={{ color: '#0C5C54', flex: 'none', marginTop: 1 }}>
            {e.kind === 'FIRMS' ? <Flame size={13} /> : e.kind === 'WEATHER' ? <Wind size={13} /> : e.kind === 'AI' ? <BrainCircuit size={13} /> : <Activity size={13} />}
          </span>
          <span style={{ minWidth: 0 }}><b>{e.title}</b>{e.sub && <span className="cx-mut"> · {e.sub}</span>}</span>
        </div>
      ))}
    </div>
  )
}

export function FieldIntel({ proposals }: { proposals: any[] | null }) {
  const rows = [...(proposals || [])]
    .sort((a, b) => +new Date(b?.created_at || 0) - +new Date(a?.created_at || 0)).slice(0, 4)
  return (
    <div className="cx-card">
      <div className="cx-row" style={{ justifyContent: 'space-between' }}>
        <div><div className="cx-sect">TIN HIỆN TRƯỜNG</div><div className="cx-ptitle">Báo cáo mới nhất</div></div>
        <Link className="cx-btn" style={{ padding: '6px 12px' }} to="/community">XEM BÁO CÁO <ArrowRight size={13} /></Link>
      </div>
      {proposals === null && <CxEmpty icon={<Eye size={22} />} title="DATA UNAVAILABLE" hint="Không tải được báo cáo hiện trường." />}
      {proposals !== null && rows.length === 0 && <CxEmpty icon={<Eye size={22} />} title="CHƯA CÓ BÁO CÁO" hint="Mạng lưới hiện trường chưa gửi báo cáo nào." />}
      {rows.map((p: any, i: number) => (
        <div className="cx-feed" key={p?.id || i}>
          <MapPin size={13} style={{ color: '#0C5C54', flex: 'none', marginTop: 2 }} />
          <span style={{ minWidth: 0 }}>
            <b>{String(p?.title || p?.data_type || 'Báo cáo')}</b>
            <span className="cx-mut"> · {p?.administrative_unit_id || ''}{p?.created_at ? ` · ${timeOf(p.created_at)}` : ''} · {p?.status || ''}</span>
          </span>
        </div>
      ))}
    </div>
  )
}

export function ResponsePanel({ assets, missionsActive }: { assets: any[]; missionsActive: number }) {
  const act = assets.filter(a => a?.status === 'active')
  const n = (t: string) => act.filter(a => a?.asset_type === t).length
  return (
    <div className="cx-card">
      <div className="cx-sect">TRẠNG THÁI ỨNG PHÓ</div>
      <div className="cx-ptitle">Lực lượng &amp; nhiệm vụ</div>
      <div className="cx-src"><span className="cx-row"><Users size={14} /><b>Đội đang hoạt động</b></span><b>{n('team') + n('station')}</b></div>
      <div className="cx-src"><span className="cx-row"><Truck size={14} /><b>Xe / trạm kỹ thuật</b></span><b>{n('firetruck') + n('pump') + n('camera') + n('watchtower')}</b></div>
      <div className="cx-src"><span className="cx-row"><Navigation size={14} /><b>Nhiệm vụ đang xử lý</b></span><b>{missionsActive}</b></div>
      <div className="cx-src"><span className="cx-row"><Radio size={14} /><b>Tài nguyên đang điều động</b></span><b>—</b></div>
    </div>
  )
}

export function MissionMini({ missions }: { missions: any[] }) {
  const active = (missions || []).filter(m => m?.status !== 'COMPLETED')
  return (
    <div className="cx-card">
      <div className="cx-row" style={{ justifyContent: 'space-between' }}>
        <div><div className="cx-sect">NHIỆM VỤ</div><div className="cx-ptitle">Tóm tắt điều hành</div></div>
        <Link className="cx-btn" style={{ padding: '6px 12px' }} to="/missions">Xem nhiệm vụ <ArrowRight size={13} /></Link>
      </div>
      <div className="cx-src"><span className="cx-row"><Activity size={14} /><b>Đang xử lý</b></span><b>{active.length}</b></div>
      {active.slice(0, 4).map((m: any) => (
        <div className="cx-feed" key={m?.id}>
          <ChevronRight size={13} style={{ color: '#94A3B8', flex: 'none', marginTop: 2 }} />
          <span style={{ minWidth: 0 }}><b>{String(m?.goal || '').slice(0, 60)}</b><span className="cx-mut"> · {m?.status || ''}</span></span>
        </div>
      ))}
      {active.length === 0 && <div className="cx-mut" style={{ marginTop: 6 }}>Không có nhiệm vụ đang xử lý.</div>}
    </div>
  )
}

function twinForest(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    if (typeof o.forest === 'number' && Number.isFinite(o.forest)) return o.forest
  }
  return null
}

export function EnvContext({ twin }: { twin: any }) {
  const rows: [string, number | null][] = [
    ['FOREST INDEX', twin ? twinForest(twin.CURRENT) : null],
    ['FORECAST', twin ? twinForest(twin.FORECAST) : null],
    ['TARGET', twin ? twinForest(twin.TARGET) : null],
    ['ACTUAL', twin ? twinForest(twin.ACTUAL) : null],
  ]
  return (
    <div className="cx-card">
      <div className="cx-row" style={{ justifyContent: 'space-between' }}>
        <div><div className="cx-sect">ENVIRONMENTAL CONTEXT</div><div className="cx-ptitle">Bối cảnh môi trường</div></div>
        <Link className="cx-btn" style={{ padding: '6px 12px' }} to="/twin">XEM DIGITAL TWIN <ArrowRight size={13} /></Link>
      </div>
      {twin === null && <CxEmpty icon={<Mountain size={22} />} title="DATA UNAVAILABLE" hint="Không tải được trạng thái twin." />}
      {twin !== null && rows.map(([k, v]) => (
        <div className="cx-src" key={k}><span><b>{k}</b></span><b>{v == null ? 'MISSING' : v}</b></div>
      ))}
    </div>
  )
}

export function DecisionPanel({ decisions, onDrawer, onLink }: {
  decisions: Decision[]; onDrawer: (a: any) => void; onLink: (to: string) => void;
}) {
  return (
    <div className="cx-card">
      <div className="cx-sect">CẦN QUYẾT ĐỊNH</div>
      <div className="cx-ptitle">Hành động yêu cầu</div>
      {decisions.length === 0 && <CxEmpty icon={<ShieldAlert size={22} />} title="KHÔNG CÓ QUYẾT ĐỊNH TỒN ĐỌNG" hint="Không có cảnh báo nghiêm trọng hay báo cáo chờ xử lý." />}
      {decisions.map((d, i) => (
        <div className="cx-dec" key={i}>
          <span style={{ color: d.sev === 'CRITICAL' ? '#DC2626' : '#EA580C', flex: 'none', marginTop: 1 }}>
            {d.sev === 'CRITICAL' ? <AlertTriangle size={15} /> : <Eye size={15} />}
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <b style={{ fontSize: 13 }}>{d.title}</b>
            <div className="cx-mut">{d.detail}</div>
          </div>
          {d.action.kind === 'drawer'
            ? <button className="cx-btn" style={{ padding: '6px 12px', flex: 'none' }} onClick={() => onDrawer(d.action.kind === 'drawer' ? (d.action as { alert: any }).alert : null)}>XEM SỰ CỐ</button>
            : <button className="cx-btn" style={{ padding: '6px 12px', flex: 'none' }} onClick={() => onLink(d.action.kind === 'link' ? (d.action as { to: string }).to : '/')}>{d.action.kind === 'link' ? (d.action as { label: string }).label : ''}</button>}
        </div>
      ))}
    </div>
  )
}

export function PriorityHierarchy({ h }: { h: Hier }) {
  return (
    <div className="cx-card">
      <div className="cx-sect">COMMAND PRIORITY</div>
      <div className="cx-ptitle">Thứ tự điều hành</div>
      <div className="cx-hier">
        <div className="cx-hcol" style={{ borderColor: h.now ? '#DC2626' : undefined }}>
          <b style={{ color: '#DC2626' }}>NOW</b><span>{h.now || 'Không có sự cố critical'}</span>
        </div>
        <div className="cx-hcol">
          <b style={{ color: '#D97706' }}>NEXT</b>
          {h.next.length === 0 ? <span>Trống</span> : h.next.map((s, i) => <span key={i} style={{ display: 'block' }}>{s}</span>)}
        </div>
        <div className="cx-hcol">
          <b style={{ color: '#64748B' }}>MONITOR</b>
          {h.monitor.length === 0 ? <span>Trống</span> : h.monitor.map((s, i) => <span key={i} style={{ display: 'block' }}>{s}</span>)}
        </div>
      </div>
    </div>
  )
}

export function IncidentDrawer({ alert, plan, showPlan, proposals, planLoading, onClose, onRunPlan }: {
  alert: any; plan: any; showPlan: boolean; proposals: any[] | null;
  planLoading: boolean; onClose: () => void; onRunPlan: (a: any) => void;
}) {
  if (!alert) return null
  const s = alertSev(alert)
  const related = (proposals || []).filter(p =>
    p && alert?.administrative_unit_id && p.administrative_unit_id === alert.administrative_unit_id).slice(0, 3)
  return (
    <>
      <div className="cx-drawer-ov" onClick={onClose} />
      <div className="cx-drawer" role="dialog" aria-label={`Chi tiết ${alert?.title || 'sự cố'}`}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div>
            <div className="cx-sect">INCIDENT · {s}</div>
            <b style={{ fontSize: 17, display: 'block', marginTop: 4 }}>{alert?.title || alert?.risk_type || 'Cảnh báo'}</b>
            <div className="cx-mut" style={{ marginTop: 4 }}>{[alert?.administrative_unit_id, alert?.level ? `CẤP ${alert.level}` : '', alert?.status].filter(Boolean).join(' · ')}</div>
          </div>
          <button className="cx-btn" style={{ padding: '6px 10px', flex: 'none' }} onClick={onClose} aria-label="Đóng chi tiết"><X size={14} /></button>
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="cx-chip" style={{ color: SEVC[s], borderColor: SEVC[s] }}>{s}</span>
          <span className="cx-chip">{alert?.status || 'MISSING'}</span>
        </div>
        <div className="cx-dsec"><h4>RESPONSE PLAN</h4>
          {planLoading && <div className="cx-mut">Đang tổng hợp kế hoạch…</div>}
          {!planLoading && !showPlan && (
            <div>
              <div className="cx-mut">Chưa có kế hoạch cho sự cố này.</div>
              <div style={{ marginTop: 8 }}><button className="cx-btn dark" onClick={() => onRunPlan(alert)}>Lập kế hoạch tác chiến</button></div>
            </div>
          )}
          {!planLoading && showPlan && plan && !plan.error && (
            <div style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div>CẤP <b>{plan.risk_summary?.level}</b> · {plan.command_status}</div>
              <div>💧 {plan.primary_water ? <><b>{plan.primary_water.name}</b> ({plan.primary_water.distance_km} km)</> : 'Chưa có nguồn nước.'}</div>
              <div>🏕️ {plan.primary_station ? <><b>{plan.primary_station.station_name}</b> ({plan.primary_station.distance_km} km)</> : 'Chưa có trạm/tổ.'}</div>
              <div>🛣️ {plan.primary_route ? <><b>{plan.primary_route.route_name}</b> ({plan.primary_route.distance_km} km)</> : 'Chưa có tuyến.'}</div>
              {(plan.tactical_recommendations || []).length > 0 && (
                <div><b>Khuyến nghị:</b><ul style={{ margin: '4px 0 4px 16px', padding: 0 }}>{plan.tactical_recommendations.slice(0, 4).map((r: string, i: number) => <li key={i}>{r}</li>)}</ul></div>
              )}
              {plan.fire && <Link className="cx-btn" to={`/firesim?lat=${plan.fire.lat}&lon=${plan.fire.lon}`}>Mô phỏng 3D →</Link>}
            </div>
          )}
          {!planLoading && showPlan && plan?.error && <div style={{ fontSize: 12, color: '#B91C1C' }}>⚠ {plan.error}</div>}
        </div>
        <div className="cx-dsec"><h4>FIELD INTELLIGENCE</h4>
          {proposals === null && <div className="cx-mut">DATA UNAVAILABLE — không tải được báo cáo.</div>}
          {proposals !== null && related.length === 0 && <div className="cx-mut">Không có báo cáo cùng đơn vị hành chính.</div>}
          {related.map((p: any) => (
            <div className="cx-feed" key={p?.id}>
              <MapPin size={13} style={{ color: '#0C5C54', flex: 'none', marginTop: 2 }} />
              <span style={{ minWidth: 0 }}><b>{String(p?.title || p?.data_type || 'Báo cáo')}</b><span className="cx-mut"> · {p?.status || ''}</span></span>
            </div>
          ))}
          <div style={{ marginTop: 8 }}><Link className="cx-btn" to="/community">Xem báo cáo →</Link></div>
        </div>
        {plan?.weather && (
          <div className="cx-dsec"><h4>ENVIRONMENT</h4>
            <div style={{ fontSize: 12 }}>🌬️ Gió {plan.weather.wind_speed_kmh ?? 'MISSING'} km/h · {plan.weather.temperature ?? 'MISSING'}°C · ẩm {plan.weather.humidity ?? 'MISSING'}%</div>
          </div>
        )}
      </div>
    </>
  )
}
