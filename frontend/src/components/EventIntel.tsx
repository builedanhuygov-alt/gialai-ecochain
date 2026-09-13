import { useState } from 'react'
import type { ReactNode } from 'react'
import {
  AlertTriangle, ArrowRight, CalendarClock, ChevronRight, Clock, Droplets,
  ExternalLink, Eye, Flame, Layers, MapPin, Satellite, Thermometer,
  Wind, X,
} from 'lucide-react'

// ── Pure helpers (unit-tested; deterministic mapping, no invented data) ──────

export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'

export const SEV_COLOR: Record<Severity, string> = {
  CRITICAL: '#EF4444', HIGH: '#F97316', MEDIUM: '#F59E0B', LOW: '#22C55E',
}

// Deterministic level/score → severity. Levels are backend/editorial CẤP bands;
// numeric cutoffs only apply when no level band exists.
export function severityOf(level: unknown, score: unknown): Severity {
  const l = String(level || '').toUpperCase()
  if (/\bV\b/.test(l) && !/IV/.test(l)) return 'CRITICAL'
  if (/CRITICAL/.test(l)) return 'CRITICAL'
  if (/IV/.test(l)) return 'HIGH'
  if (/HIGH/.test(l)) return 'HIGH'
  if (/III/.test(l)) return 'MEDIUM'
  if (/MEDIUM|TRUNG/.test(l)) return 'MEDIUM'
  const s = typeof score === 'number' && Number.isFinite(score) ? score : NaN
  if (!Number.isNaN(s)) {
    if (s >= 85) return 'CRITICAL'
    if (s >= 75) return 'HIGH'
    if (s >= 60) return 'MEDIUM'
    return 'LOW'
  }
  return 'LOW'
}

// Parse "13°44′20″N 109°11′45″E" → {lat, lon}. Null when absent/unparseable.
export function parseCoords(text: unknown): { lat: number; lon: number } | null {
  if (typeof text !== 'string') return null
  const m = text.match(/(\d+)[°](\d+)[′']([\d.]+)[″"]?([NS])\s+(\d+)[°](\d+)[′']([\d.]+)[″"]?([EW])/)
  if (!m) return null
  const lat = (+m[1] + +m[2] / 60 + +m[3] / 3600) * (m[4] === 'S' ? -1 : 1)
  const lon = (+m[5] + +m[6] / 60 + +m[7] / 3600) * (m[8] === 'W' ? -1 : 1)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  return { lat, lon }
}

// Slippy-map tile math (pure) → real Esri World Imagery tile (same source MapView uses).
export function tileXY(lat: number, lon: number, z: number): { x: number; y: number } {
  const n = 2 ** z
  const x = Math.floor(((lon + 180) / 360) * n)
  const r = (lat * Math.PI) / 180
  const y = Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n)
  return { x, y }
}

export function esriTileUrl(lat: number, lon: number, z = 12): string {
  const { x, y } = tileXY(lat, lon, z)
  return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`
}

export function fmtCoords(lat: number, lon: number): string {
  return `${lat.toFixed(4)}°${lat >= 0 ? 'N' : 'S'} ${lon.toFixed(4)}°${lon >= 0 ? 'E' : 'W'}`
}

// ── Dark command theme (page-scoped .ei; global shell untouched) ─────────────

export function EiStyles() {
  return (
    <style>{`
    .ei{ --ei-bg:#07111F; --ei-panel:#0B1628; --ei-panel2:#101C2E; --ei-line:rgba(148,163,184,0.16); --ei-text:#E8EEF4; --ei-mut:#8CA0B3; --ei-faint:#5B6E82; --ei-info:#3B82F6; background:var(--ei-bg); color:var(--ei-text); border-radius:16px; padding:20px; }
    .ei-hero{ display:flex; gap:14px; align-items:flex-start; flex-wrap:wrap; }
    .ei-title{ font-size:30px; font-weight:800; letter-spacing:-0.4px; margin:0; }
    .ei-sub{ font-size:13px; color:var(--ei-mut); margin-top:4px; }
    .ei-iconbox{ width:52px; height:52px; border-radius:14px; display:grid; place-items:center; flex:none; background:rgba(59,130,246,0.14); border:1px solid rgba(59,130,246,0.35); color:#7AA7FF; }
    .ei-chips{ display:flex; gap:8px; flex-wrap:wrap; margin-top:12px; }
    .ei-chip{ display:inline-flex; gap:6px; align-items:center; font-size:11px; font-weight:700; letter-spacing:0.4px; border:1px solid var(--ei-line); border-radius:999px; padding:4px 12px; color:var(--ei-mut); background:rgba(16,28,46,0.6); }
    .ei-dot{ width:7px; height:7px; border-radius:999px; flex:none; }
    .ei-dot.live{ background:#22C55E; animation:eipulse 2s infinite; }
    .ei-dot.warn{ background:#F59E0B; } .ei-dot.bad{ background:#EF4444; } .ei-dot.mut{ background:#5B6E82; }
    @keyframes eipulse{ 0%,100%{ opacity:1 } 50%{ opacity:0.3 } }
    .ei-kpis{ display:grid; gap:12px; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); margin-top:16px; }
    .ei-kpi{ background:var(--ei-panel); border:1px solid var(--ei-line); border-radius:14px; padding:12px 14px; min-width:0; }
    .ei-kpi .n{ font-size:26px; font-weight:800; font-variant-numeric:tabular-nums; line-height:1.1; }
    .ei-kpi .l{ font-size:11px; font-weight:700; letter-spacing:0.8px; color:var(--ei-mut); margin-top:2px; }
    .ei-kpi .s{ font-size:11px; color:var(--ei-faint); margin-top:2px; }
    .ei-panel{ background:var(--ei-panel); border:1px solid var(--ei-line); border-radius:14px; padding:16px; min-width:0; animation:eiin 220ms ease-out; }
    @keyframes eiin{ from{ opacity:0; transform:translateY(4px) } to{ opacity:1; transform:none } }
    .ei-kicker{ font-size:11px; font-weight:800; letter-spacing:1.2px; color:var(--ei-mut); }
    .ei-h2{ font-size:17px; font-weight:800; margin:2px 0 0; }
    .ei-alert{ border-radius:14px; padding:14px 16px; display:flex; gap:12px; margin-top:12px; border:1px solid; }
    .ei-alert.crit{ background:rgba(239,68,68,0.08); border-color:rgba(239,68,68,0.45); border-left:4px solid #EF4444; }
    .ei-alert.info{ background:rgba(59,130,246,0.08); border-color:rgba(59,130,246,0.4); border-left:4px solid #3B82F6; }
    .ei-alert h3{ margin:0; font-size:15px; }
    .ei-alert p{ margin:6px 0 0; font-size:13px; color:#C4D2E0; line-height:1.55; }
    .ei-actions{ display:flex; gap:8px; flex-wrap:wrap; margin-top:10px; }
    .ei-btn{ display:inline-flex; gap:6px; align-items:center; font-size:12px; font-weight:800; border-radius:10px; padding:8px 16px; border:1px solid var(--ei-line); background:rgba(148,163,184,0.08); color:var(--ei-text); text-decoration:none; transition:background 180ms ease-out, border-color 180ms ease-out; }
    .ei-btn:hover{ background:rgba(148,163,184,0.16); }
    .ei-btn.primary{ background:#DC2626; border-color:#DC2626; color:#fff; }
    .ei-btn.primary:hover{ background:#B91C1C; }
    .ei-btn.blue{ background:rgba(59,130,246,0.16); border-color:rgba(59,130,246,0.5); color:#BFDBFE; }
    .ei-filters{ display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-top:16px; background:var(--ei-panel); border:1px solid var(--ei-line); border-radius:14px; padding:10px 12px; }
    .ei-fbtn{ display:inline-flex; gap:6px; align-items:center; font-size:12px; font-weight:700; border-radius:999px; border:1px solid var(--ei-line); background:transparent; color:var(--ei-mut); padding:6px 14px; transition:background 150ms ease-out, color 150ms ease-out, border-color 150ms ease-out; }
    .ei-fbtn.on{ background:#E8EEF4; color:#07111F; border-color:#E8EEF4; }
    .ei-fbtn .c{ font-variant-numeric:tabular-nums; opacity:0.75; }
    .ei-select{ background:var(--ei-panel2); color:var(--ei-text); border:1px solid var(--ei-line); border-radius:10px; padding:6px 10px; font-size:12px; font-weight:700; }
    .ei-cards{ display:grid; gap:12px; grid-template-columns:repeat(auto-fill,minmax(330px,1fr)); margin-top:12px; }
    .ei-split{ display:grid; gap:12px; grid-template-columns:7fr 13fr; margin-top:12px; align-items:start; }
    @media (max-width:1100px){ .ei-split{ grid-template-columns:1fr; } }
    .ei-sevpulse{ animation:eisev 2.4s infinite; }
    @keyframes eisev{ 0%,100%{ opacity:1 } 50%{ opacity:0.55 } }
    .ei-dtabs{ display:flex; gap:4px; margin-top:14px; border-bottom:1px solid var(--ei-line); }
    .ei-dtab{ font-size:11px; font-weight:800; letter-spacing:0.6px; background:none; border:0; border-bottom:2px solid transparent; color:var(--ei-mut); padding:8px 10px; cursor:pointer; }
    .ei-dtab.on{ color:var(--ei-text); border-bottom-color:var(--ei-info); }
    .ei-qlead{ background:rgba(239,68,68,0.07); border:1px solid rgba(239,68,68,0.4); border-radius:12px; }
    .ei-sysbox{ display:flex; gap:16px; align-items:center; background:var(--ei-panel); border:1px solid var(--ei-line); border-radius:12px; padding:8px 16px; }
    .ei-sysbox .cell{ display:flex; gap:8px; align-items:center; font-size:12px; color:var(--ei-mut); }
    .ei-sysbox .cell b{ color:var(--ei-text); font-variant-numeric:tabular-nums; }
    .ei-card{ background:var(--ei-panel); border:1px solid var(--ei-line); border-left:4px solid var(--ei-faint); border-radius:12px; padding:14px 16px; min-width:0; transition:border-color 150ms ease-out, transform 150ms ease-out; animation:eiin 220ms ease-out; }
    .ei-card{ transition:transform 200ms cubic-bezier(0.32,0.72,0,1), border-color 200ms cubic-bezier(0.32,0.72,0,1), box-shadow 200ms cubic-bezier(0.32,0.72,0,1); }
    .ei-card:hover{ border-color:rgba(148,163,184,0.4); transform:translateY(-2px); box-shadow:0 8px 24px rgba(0,0,0,0.25); }
    .ei-card.sel{ border-color:var(--ei-info); }
    .ei-card h3{ margin:6px 0 0; font-size:15px; line-height:1.4; }
    .ei-meta{ display:flex; gap:6px; align-items:center; font-size:12px; color:var(--ei-mut); margin-top:6px; flex-wrap:wrap; }
    .ei-sev{ display:inline-flex; gap:6px; align-items:center; font-size:11px; font-weight:800; letter-spacing:0.6px; border-radius:8px; padding:3px 10px; color:#fff; }
    .ei-tag{ font-size:10px; font-weight:800; letter-spacing:0.5px; border-radius:6px; padding:2px 8px; border:1px solid var(--ei-line); color:var(--ei-mut); white-space:nowrap; }
    .ei-desc{ font-size:13px; color:#C4D2E0; line-height:1.55; margin-top:8px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
    .ei-intel{ margin-top:8px; border-top:1px solid var(--ei-line); padding-top:8px; display:flex; flex-direction:column; gap:4px; font-size:12px; color:#C4D2E0; }
    .ei-intel .r{ display:flex; gap:8px; align-items:center; }
    .ei-risk{ display:flex; gap:10px; align-items:center; margin-top:10px; }
    .ei-bar{ flex:1; height:8px; border-radius:999px; background:rgba(148,163,184,0.18); overflow:hidden; }
    .ei-bar i{ display:block; height:100%; border-radius:999px; transition:width 250ms ease-out; }
    .ei-score{ font-size:20px; font-weight:800; font-variant-numeric:tabular-nums; }
    .ei-thumb{ position:relative; width:150px; flex:none; border-radius:10px; overflow:hidden; border:1px solid var(--ei-line); background:var(--ei-panel2); }
    .ei-thumb img{ width:100%; height:112px; object-fit:cover; display:block; }
    .ei-thumb .ov{ position:absolute; left:6px; bottom:6px; font-size:10px; font-weight:800; background:rgba(7,17,31,0.85); color:#fff; border-radius:6px; padding:2px 8px; display:flex; gap:4px; align-items:center; }
    .ei-thumb .live{ position:absolute; left:6px; top:6px; font-size:10px; font-weight:800; background:#DC2626; color:#fff; border-radius:6px; padding:2px 8px; }
    .ei-empty{ text-align:center; padding:32px 16px; color:var(--ei-mut); }
    .ei-empty b{ display:block; font-size:14px; letter-spacing:0.6px; color:var(--ei-text); margin-top:8px; }
    .ei-empty p{ font-size:12px; margin:4px 0 0; }
    .ei-skel{ background:linear-gradient(90deg, rgba(148,163,184,0.12) 25%, rgba(148,163,184,0.22) 37%, rgba(148,163,184,0.12) 63%); background-size:400% 100%; animation:eishim 1.4s ease infinite; border-radius:10px; }
    @keyframes eishim{ 0%{ background-position:100% 0 } 100%{ background-position:-100% 0 } }
    .ei-drawer{ position:fixed; top:0; right:0; bottom:0; width:min(430px, calc(100vw - 24px)); background:var(--ei-panel); border-left:1px solid var(--ei-line); z-index:60; overflow:auto; padding:20px; animation:eislide 200ms ease-out; box-shadow:-16px 0 48px rgba(0,0,0,0.45); }
    @keyframes eislide{ from{ transform:translateX(24px); opacity:0 } to{ transform:none; opacity:1 } }
    .ei-dsec{ margin-top:14px; border-top:1px solid var(--ei-line); padding-top:10px; }
    .ei-dsec h4{ margin:0 0 6px; font-size:11px; letter-spacing:1px; color:var(--ei-mut); }
    .ei-dsec p, .ei-dsec div.r{ font-size:13px; color:#C4D2E0; line-height:1.55; }
    .ei-q{ display:flex; gap:10px; align-items:center; padding:8px 0; border-top:1px solid var(--ei-line); font-size:13px; }
    .ei-q .rank{ font-size:18px; font-weight:800; color:var(--ei-faint); min-width:30px; font-variant-numeric:tabular-nums; }
    .ei-mapwrap{ height:560px; border-radius:14px; overflow:hidden; border:1px solid var(--ei-line); position:relative; }
    @media (max-width:640px){ .ei{ padding:14px; } .ei-title{ font-size:24px; } .ei-thumb{ width:120px; } .ei-mapwrap{ height:400px; } }
    @media (prefers-reduced-motion: reduce){ .ei *{ animation:none !important; transition:none !important; } }
    button:focus-visible, a:focus-visible{ outline:2px solid #3B82F6; outline-offset:2px; }
    `}</style>
  )
}

export function SourceList({ sources }: { sources: import('./EventSources').EventSource[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {sources.map(s => (
        <div key={s.id} style={{ border: '1px solid var(--ei-line)', borderRadius: 10, padding: '10px 12px', background: 'rgba(16,28,46,0.5)' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <b style={{ fontSize: 13 }}>{s.publisher}</b>
            <span className="ei-tag">{s.type}</span>
            <span className="ei-tag" style={{ background: s.relevance === 'HIGH' ? 'rgba(34,197,94,0.12)' : 'transparent', borderColor: s.relevance === 'HIGH' ? 'rgba(34,197,94,0.4)' : undefined, color: s.relevance === 'HIGH' ? '#7EE2A8' : undefined }}>
              {s.relevance} RELEVANCE
            </span>
            <span style={{ flex: 1 }} />
            <span className="ei-meta">{s.publishedAt ? `Published: ${s.publishedAt}` : 'Ngày đăng: chưa xác minh'}</span>
          </div>
          <div style={{ fontSize: 13, marginTop: 4 }}>{s.title}</div>
          <div className="ei-meta" style={{ marginTop: 4 }}>Relevant to this incident · {s.matchReason}</div>
          <div className="ei-actions">
            <a className="ei-btn" href={s.url} target="_blank" rel="noopener noreferrer">MỞ NGUỒN ↗</a>
          </div>
        </div>
      ))}
    </div>
  )
}

export function SevBadge({ sev, label }: { sev: Severity; label?: string }) {
  return (
    <span className="ei-sev" style={{ background: SEV_COLOR[sev] }}>
      <AlertTriangle size={12} />{label || sev}
    </span>
  )
}

export function StatusDot({ live }: { live: boolean }) {
  return <span className={`ei-dot ${live ? 'live' : 'mut'}`} aria-hidden />
}

export function EiEmpty({ icon, title, hint, action }: { icon: ReactNode; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="ei-empty">
      <div style={{ display: 'grid', placeItems: 'center', color: '#5B6E82' }}>{icon}</div>
      <b>{title}</b>
      {hint && <p>{hint}</p>}
      {action && <div style={{ marginTop: 12 }}>{action}</div>}
    </div>
  )
}

export function EiSkeletonRows({ n = 3 }: { n?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }} aria-busy="true">
      {[0, 1, 2].slice(0, n).map(i => <div key={i} className="ei-skel" style={{ height: 120 }} />)}
    </div>
  )
}

export function KpiCard({ icon, value, label, sub, color, hot }: {
  icon: ReactNode; value: string; label: string; sub?: string; color?: string; hot?: boolean;
}) {
  return (
    <div className="ei-kpi" style={hot ? { borderLeft: `4px solid ${color || '#EF4444'}`, background: 'var(--ei-panel2)' } : undefined}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', color: color || '#8CA0B3' }}>{icon}<span className="l" style={{ marginTop: 0 }}>{label}</span></div>
      <div className="n" style={hot ? { color: color || '#EF4444' } : undefined}>{value}</div>
      {sub && <div className="s">{sub}</div>}
    </div>
  )
}

// Real satellite thumbnail: Esri tile at the event's own coordinates.
// Labeled SATELLITE (static tile, not a live feed) — never decoration-only.
export function SatThumb({ lat, lon, label, onOpen }: { lat: number; lon: number; label: string; onOpen?: () => void }) {
  const [err, setErr] = useState(false)
  if (err) return null
  const body = (
    <>
      <img src={esriTileUrl(lat, lon)} alt={`Ảnh vệ tinh ${label}`} loading="lazy" onError={() => setErr(true)} />
      <span className="live" style={{ background: 'rgba(7,17,31,0.85)' }}>SATELLITE</span>
      <span className="ov"><Satellite size={11} />{fmtCoords(lat, lon)}</span>
    </>
  )
  if (!onOpen) return <div className="ei-thumb">{body}</div>
  return (
    <button className="ei-thumb" onClick={onOpen} title="View geospatial context →"
      style={{ cursor: 'pointer', padding: 0, textAlign: 'left', font: 'inherit', color: 'inherit' }}>
      {body}
    </button>
  )
}

export function RiskBar({ score, sev }: { score: number; sev: Severity }) {
  const pct = Math.max(0, Math.min(100, Math.round(score)))
  return (
    <div className="ei-risk">
      <span className="ei-score" style={{ color: SEV_COLOR[sev] }}>{pct}</span>
      <div className="ei-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`Risk score ${pct}`}>
        <i style={{ width: `${pct}%`, background: SEV_COLOR[sev] }} />
      </div>
      <span className="ei-tag">{sev}</span>
    </div>
  )
}

export { AlertTriangle, ArrowRight, CalendarClock, ChevronRight, Clock, Droplets, ExternalLink, Eye, Flame, Layers, MapPin, Satellite, Thermometer, Wind, X };

export function IntelIcon({ k }: { k: 'fire' | 'temp' | 'wind' | 'veg' | 'src' }) {
  const M = {
    fire: <Flame size={13} />, temp: <Thermometer size={13} />, wind: <Wind size={13} />,
    veg: <Layers size={13} />, src: <Eye size={13} />,
  } as const
  return <span style={{ color: '#7AA7FF', display: 'inline-flex', verticalAlign: -2 }}>{M[k]}</span>
}
