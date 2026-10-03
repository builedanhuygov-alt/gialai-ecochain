import type { ReactNode } from 'react'

// Hệ thiết kế tối cho màn hình điều hành (bản đồ là trung tâm, panel kính mờ).
export const C = {
  bg: '#0B1412',
  panel: 'rgba(17,28,25,0.88)',
  panelSolid: '#111C19',
  line: '#1E3A36',
  text: '#E8EFEC',
  muted: '#94A3B8',
  accent: '#10B981',
  warn: '#F59E0B',
  danger: '#DC2626',
  info: '#0EA5E9',
}

export const LEVEL_COLOR: Record<string, string> = {
  I: '#0EA5E9', II: '#10B981', III: '#F59E0B', IV: '#F97316', V: '#DC2626',
}

export const LEVEL_VI: Record<string, string> = {
  I: 'Rất thấp', II: 'Thấp', III: 'Trung bình', IV: 'Cao', V: 'Cực cao',
}

export function nhanCheDo(origin?: string | null): { text: string; color: string } {
  if (origin === 'LIVE') return { text: 'DỮ LIỆU THẬT', color: '#10B981' }
  if (origin === 'USER_INPUT') return { text: 'NGƯỜI DÙNG NHẬP', color: '#0EA5E9' }
  if (origin === 'DEMO / SIMULATED' || origin === 'DEMO') return { text: 'GIẢ LẬP', color: '#F59E0B' }
  return { text: 'CHƯA RÕ', color: '#94A3B8' }
}

export function DarkPage({ children }: { children: ReactNode }) {
  return (
    <div style={{ margin: -24, padding: 16, minHeight: 'calc(100vh - 64px)', background: C.bg, color: C.text }}>
      {children}
    </div>
  )
}

export function Panel({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <h2 style={{ margin: 0, fontSize: 13, fontWeight: 800, letterSpacing: 0.6 }}>{title}</h2>
        {right}
      </div>
      {children}
    </section>
  )
}

export function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ background: C.panelSolid, border: `1px solid ${C.line}`, borderRadius: 12, padding: '10px 12px', minWidth: 0 }}>
      <div style={{ fontSize: 22, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.8, color: C.muted, marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

export function ModeBadge({ origin }: { origin?: string | null }) {
  const m = nhanCheDo(origin)
  return (
    <span style={{ fontSize: 11, fontWeight: 800, color: m.color, border: `1px solid ${m.color}`, borderRadius: 999, padding: '2px 10px' }}>
      {m.color === '#10B981' ? '●' : '◉'} {m.text}
    </span>
  )
}

export function RiskBar({ score, level }: { score: number | null; level?: string | null }) {
  if (score === null || score === undefined)
    return <div style={{ fontSize: 13, color: C.muted }}>Chưa có dữ liệu</div>
  const color = (level && LEVEL_COLOR[level]) || C.muted
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 28, fontWeight: 800 }}>{score}<span style={{ fontSize: 13, color: C.muted }}>/100</span></span>
        <span style={{ fontSize: 13, fontWeight: 800, color }}>Cấp {level}{level && LEVEL_VI[level] ? ` · ${LEVEL_VI[level]}` : ''}</span>
      </div>
      <div style={{ height: 8, borderRadius: 999, background: '#1E3A36', marginTop: 6 }} role="img"
        aria-label={`Điểm nguy cơ ${score} trên 100, cấp ${level}`}>
        <div style={{ width: `${Math.min(100, Math.max(0, score))}%`, height: '100%', borderRadius: 999, background: color }} />
      </div>
    </div>
  )
}

export function DataQuality({ missing, completeness }: { missing?: string[]; completeness?: number | null }) {  const pct = completeness === null || completeness === undefined ? null : Math.round(completeness * 100)
  const names: Record<string, string> = {
    fuel_dryness: 'thảm khô', weather_danger: 'thời tiết', firms_proximity: 'điểm nóng',
    wind: 'gió', rainfall_deficit: 'mưa', terrain: 'địa hình', historical_community: 'lịch sử/cộng đồng',
  }
  return (
    <div style={{ fontSize: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ color: C.muted }}>CHẤT LƯỢNG DỮ LIỆU</span>
        <b>{pct === null ? 'Chưa rõ' : `${pct}%`}</b>
      </div>
      <div style={{ height: 6, borderRadius: 999, background: '#1E3A36', marginTop: 4 }}>
        <div style={{ width: `${pct ?? 0}%`, height: '100%', borderRadius: 999, background: C.accent }} />
      </div>
      {missing && missing.length > 0 && (
        <div style={{ color: C.warn, marginTop: 6 }}>Thiếu: {missing.map(m => names[m] || m).join(', ')}. Không dùng số giả thay thế.</div>
      )}
    </div>
  )
}

export function CanhBaoChinhThuc() {
  return (
    <div role="alert" style={{ background: '#450A0A', border: '2px solid #DC2626', borderRadius: 12,
      padding: '10px 14px', fontSize: 13, fontWeight: 800, color: '#FECACA' }}>
      Cảnh báo chính thức: CHƯA CÓ — chỉ cơ quan có thẩm quyền mới ban hành.
      Mọi mức nguy cơ trên đây là chỉ số tham khảo.
    </div>
  )
}

export function ChatLuongNguon({ rows }: { rows: { nhom: string; co: boolean; chiTiet: string }[] }) {
  return (
    <div style={{ fontSize: 12 }}>
      <div style={{ color: C.muted, marginBottom: 4 }}>CHẤT LƯỢNG DỮ LIỆU</div>
      {rows.map(r=> (
        <div key={r.nhom} style={{ display: 'flex', gap: 8, alignItems: 'baseline', padding: '3px 0', borderTop: `1px solid ${C.line}` }}>
          <span aria-hidden>{r.co ? '✓' : '✗'}</span>
          <b style={{ minWidth: 90 }}>{r.nhom}</b>
          <span style={{ color: C.muted }}>{r.co ? 'có' : 'không'} · {r.chiTiet}</span>
        </div>
      ))}
    </div>
  )
}
