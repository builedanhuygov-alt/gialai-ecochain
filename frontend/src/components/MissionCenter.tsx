import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  ChevronRight, Droplets, Flame, MapPin, Radio,
  ShieldAlert, Thermometer, Truck, Users, Wind, X,
} from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────────

export type Sev = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
export type IStatus = 'LIVE' | 'MONITORING' | 'RESOLVED' | 'OFFLINE'

export type Incident = {
  id: string; title: string; area: string; forest: string;
  sev: Sev; status: IStatus; live: boolean;
  areaHa: number; spreadMMin: number; temp: number; humidity: number;
  windKmh: number; windDir: string; personnel: number; vehicles: number; drones: number;
  riskScore: number; factors: [string, number][];
  detectedAt: number; updatedAt: number; source: string;
  timeline: [string, string][]; ai: { text: string; confidence: number; reason: string };
}

export const SEV_COLOR: Record<Sev, string> = {
  CRITICAL: '#EF4444', HIGH: '#F97316', MEDIUM: '#F59E0B', LOW: '#22C55E',
}

// ── Operational demo dataset (Missions page only) ────────────────────────────
// Realistic Gia Lai wildfire incidents for the command-center workspace.
// Served ONLY when /api/missions returns empty; live API rows always win.
const H = 3600000, M = 60000
const NOW = Date.now()

export const DEMO_INCIDENTS: Incident[] = [
  {
    id: 'IA-0926-014', title: 'CHÁY RỪNG PHÒNG HỘ IA MƠR', area: 'Ia Mơr, Chư Prông', forest: 'Rừng phòng hộ Ia Mơr',
    sev: 'CRITICAL', status: 'LIVE', live: true,
    areaHa: 28.4, spreadMMin: 14, temp: 32.4, humidity: 34, windKmh: 18, windDir: 'NE',
    personnel: 32, vehicles: 4, drones: 2, riskScore: 87,
    factors: [['Gió', 91], ['Độ khô', 84], ['Thảm thực vật', 82], ['Độ ẩm', 89], ['Địa hình', 71]],
    detectedAt: NOW - 3 * H, updatedAt: NOW - 42 * 1000, source: 'Chòi canh Ia Mơr + FIRMS',
    timeline: [['Phát hiện', 'Chòi canh báo khói, xác minh FIRMS'], ['Xác minh', 'Tổ kiểm lâm tiếp cận, xác nhận đám cháy'], ['Điều động', '32 người, 4 phương tiện, 2 flycam'], ['Hiện tại', 'Đang khống chế hướng Đông Bắc']],
    ai: { text: 'Ưu tiên chặn đầu lửa hướng Đông Bắc trước 14:00 khi gió còn dưới 20 km/h.', confidence: 88, reason: 'Gió NE 18 km/h + thảm khô + dốc hướng gió' },
  },
  {
    id: 'IA-0926-011', title: 'CHÁY THỰC BÌ KBANG', area: 'Kbang', forest: 'Rừng sản xuất Kbang',
    sev: 'HIGH', status: 'LIVE', live: true,
    areaHa: 11.2, spreadMMin: 9, temp: 31.0, humidity: 38, windKmh: 14, windDir: 'E',
    personnel: 18, vehicles: 2, drones: 1, riskScore: 76,
    factors: [['Gió', 78], ['Độ khô', 81], ['Thảm thực vật', 74], ['Độ ẩm', 72], ['Địa hình', 58]],
    detectedAt: NOW - 6 * H, updatedAt: NOW - 5 * M, source: 'Tuần tra rừng + người dân báo',
    timeline: [['Phát hiện', 'Người dân báo khói, tuần tra xác minh'], ['Điều động', '18 người, 2 phương tiện'], ['Hiện tại', 'Khoanh vùng phía Tây, theo dõi tàn bay']],
    ai: { text: 'Giữ nguyên lực lượng khoanh vùng, bổ sung 1 tổ trực tàn bay phía Tây.', confidence: 81, reason: 'Tốc độ lan 9 m/min, ẩm 38% còn kiểm soát được' },
  },
  {
    id: 'IA-0926-009', title: 'ĐIỂM NHIỆT AN KHÊ', area: 'An Khê', forest: 'Rừng phòng hộ An Khê',
    sev: 'MEDIUM', status: 'MONITORING', live: false,
    areaHa: 2.1, spreadMMin: 3, temp: 29.5, humidity: 45, windKmh: 9, windDir: 'SE',
    personnel: 6, vehicles: 1, drones: 1, riskScore: 54,
    factors: [['Gió', 52], ['Độ khô', 63], ['Thảm thực vật', 58], ['Độ ẩm', 51], ['Địa hình', 44]],
    detectedAt: NOW - 26 * H, updatedAt: NOW - 38 * M, source: 'FIRMS VIIRS',
    timeline: [['Phát hiện', 'Điểm nhiệt VIIRS, chưa xác minh mặt đất'], ['Hiện tại', 'Flycam quét 2 lượt, chưa thấy lửa hở']],
    ai: { text: 'Tiếp tục giám sát vệ tinh + 1 lượt flycam/ngày, chưa cần điều động thêm.', confidence: 74, reason: 'Điểm nhiệt đơn lẻ, chưa xác minh mặt đất' },
  },
  {
    id: 'IA-0926-007', title: 'CHÁY RỪNG TRỒNG MANG YANG', area: 'Mang Yang', forest: 'Rừng trồng Mang Yang',
    sev: 'MEDIUM', status: 'MONITORING', live: false,
    areaHa: 4.6, spreadMMin: 5, temp: 30.2, humidity: 41, windKmh: 11, windDir: 'NE',
    personnel: 10, vehicles: 1, drones: 0, riskScore: 61,
    factors: [['Gió', 60], ['Độ khô', 69], ['Thảm thực vật', 66], ['Độ ẩm', 57], ['Địa hình', 49]],
    detectedAt: NOW - 30 * H, updatedAt: NOW - 52 * M, source: 'Hạt Kiểm lâm Mang Yang',
    timeline: [['Phát hiện', 'Đốt thực bì lan vào rừng trồng'], ['Khống chế', 'Dập tắt diện chính, còn âm ỉ gốc cây'], ['Hiện tại', 'Tổ trực xử lý tàn']],
    ai: { text: 'Duy trì tổ trực tàn thêm 24h, nguy cơ bùng lại thấp.', confidence: 79, reason: 'Diện chính đã tắt, ẩm 41%' },
  },
  {
    id: 'IA-0926-006', title: 'CHÁY BÌA RỪNG ĐAK ĐOA', area: 'Đak Đoa', forest: 'Rừng phòng hộ Đak Đoa',
    sev: 'LOW', status: 'RESOLVED', live: false,
    areaHa: 1.3, spreadMMin: 0, temp: 27.8, humidity: 52, windKmh: 6, windDir: 'N',
    personnel: 0, vehicles: 0, drones: 0, riskScore: 18,
    factors: [['Gió', 22], ['Độ khô', 31], ['Thảm thực vật', 28], ['Độ ẩm', 20], ['Địa hình', 15]],
    detectedAt: NOW - 4 * 24 * H, updatedAt: NOW - 2 * 24 * H, source: 'Kiểm lâm Đak Đoa',
    timeline: [['Phát hiện', 'Cháy bìa rừng do đốt nương'], ['Dập tắt', 'Hoàn thành trong ngày'], ['Nghiệm thu', 'Không thiệt hại rừng tự nhiên']],
    ai: { text: 'Đã đóng sự cố. Rút kinh nghiệm tuyên truyền đốt nương đúng quy định.', confidence: 92, reason: 'Diện tích nhỏ, đã nghiệm thu' },
  },
]

// ── Pure helpers (unit-tested) ───────────────────────────────────────────────

export const SEV_RANK: Record<Sev, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }

export function fmtAgo(ts: number, now = Date.now()): string {
  const m = Math.max(0, Math.round((now - ts) / 60000))
  if (m < 1) return 'vừa xong'
  if (m < 60) return `${m} phút trước`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} giờ trước`
  return `${Math.round(h / 24)} ngày trước`
}

export function fmtClock(ts: number): string {
  return new Date(ts).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function fmtNum(v: number, digits = 1): string {
  return v.toFixed(digits)
}

export type Filters = { q: string; sev: 'ALL' | Sev; status: 'ALL' | IStatus; area: 'ALL' | string }

export function filterIncidents(list: Incident[], f: Filters): Incident[] {
  const q = f.q.trim().toLowerCase()
  return list.filter(e => {
    if (f.sev !== 'ALL' && e.sev !== f.sev) return false
    if (f.status !== 'ALL' && e.status !== f.status) return false
    if (f.area !== 'ALL' && e.area !== f.area) return false
    if (q && !(e.id.toLowerCase().includes(q) || e.title.toLowerCase().includes(q) || e.area.toLowerCase().includes(q) || e.forest.toLowerCase().includes(q))) return false
    return true
  })
}

export function sortIncidents(list: Incident[], mode: 'sev' | 'new' | 'risk'): Incident[] {
  const arr = [...list]
  if (mode === 'new') arr.sort((a, b) => b.detectedAt - a.detectedAt)
  else if (mode === 'risk') arr.sort((a, b) => b.riskScore - a.riskScore)
  else arr.sort((a, b) => SEV_RANK[a.sev] - SEV_RANK[b.sev] || b.riskScore - a.riskScore)
  return arr
}

export function riskTone(score: number): Sev {
  if (score >= 85) return 'CRITICAL'
  if (score >= 70) return 'HIGH'
  if (score >= 40) return 'MEDIUM'
  return 'LOW'
}

// ── Dark operational theme (scoped .msn — global app untouched) ─────────────

export function MsnStyles() {
  return (
    <style>{`
    .msn{ --m-bg:#0A111C; --m-panel:#0E1726; --m-panel2:#131E30; --m-line:rgba(148,163,184,0.16); --m-text:#EAF0F6; --m-mut:#8CA0B3; --m-faint:#5B6E82; background:var(--m-bg); color:var(--m-text); border-radius:16px; padding:20px; }
    .msn-head{ display:flex; gap:12px; align-items:center; flex-wrap:wrap; }
    .msn-title{ font-size:22px; font-weight:800; letter-spacing:-0.2px; margin:0; }
    .msn-sub{ font-size:13px; color:var(--m-mut); margin-top:2px; }
    .msn-kicker{ font-size:11px; font-weight:800; letter-spacing:1.1px; color:var(--m-mut); }
    .msn-mut{ font-size:12px; color:var(--m-mut); }
    .msn-num{ font-variant-numeric:tabular-nums; }
    .msn-btn{ display:inline-flex; gap:8px; align-items:center; font-size:13px; font-weight:800; border-radius:10px; padding:9px 18px; border:1px solid var(--m-line); background:rgba(148,163,184,0.08); color:var(--m-text); cursor:pointer; transition:background 180ms ease-out, border-color 180ms ease-out; text-decoration:none; }
    .msn-btn:hover{ background:rgba(148,163,184,0.16); }
    .msn-btn.primary{ background:#DC2626; border-color:#DC2626; color:#fff; }
    .msn-btn.primary:hover{ background:#B91C1C; }
    .msn-btn.dark{ background:#E8EEF4; border-color:#E8EEF4; color:#0A111C; }
    .msn-btn.sm{ font-size:12px; padding:6px 12px; border-radius:8px; }
    .msn-stats{ display:flex; flex-wrap:wrap; background:var(--m-panel); border:1px solid var(--m-line); border-radius:12px; margin-top:16px; padding:4px 0; }
    .msn-stat{ flex:1 1 140px; min-width:0; padding:8px 16px; display:flex; gap:10px; align-items:center; }
    .msn-stat + .msn-stat{ border-left:1px solid var(--m-line); }
    .msn-stat .n{ font-size:26px; font-weight:800; line-height:1; font-variant-numeric:tabular-nums; }
    .msn-stat .l{ font-size:11px; font-weight:800; letter-spacing:0.8px; color:var(--m-mut); }
    .msn-stat .s{ font-size:11px; color:var(--m-faint); }
    .msn-toolbar{ display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-top:16px; background:var(--m-panel); border:1px solid var(--m-line); border-radius:12px; padding:10px 12px; }
    .msn-search{ display:flex; gap:8px; align-items:center; flex:1; min-width:200px; background:var(--m-panel2); border:1px solid var(--m-line); border-radius:10px; padding:8px 12px; }
    .msn-search input{ flex:1; min-width:0; background:transparent; border:0; outline:none; color:var(--m-text); font-size:13px; }
    .msn-select{ background:var(--m-panel2); color:var(--m-text); border:1px solid var(--m-line); border-radius:10px; padding:8px 12px; font-size:12px; font-weight:700; }
    .msn-seg{ display:flex; border:1px solid var(--m-line); border-radius:10px; padding:2px; }
    .msn-seg button{ font-size:11px; font-weight:800; letter-spacing:0.5px; border:0; border-radius:8px; background:transparent; color:var(--m-mut); padding:6px 14px; cursor:pointer; transition:background 150ms ease-out, color 150ms ease-out; }
    .msn-seg button.on{ background:#E8EEF4; color:#0A111C; }
    .msn-list{ display:flex; flex-direction:column; gap:12px; margin-top:12px; }
    .msn-card{ background:var(--m-panel); border:1px solid var(--m-line); border-left:4px solid var(--m-faint); border-radius:12px; padding:12px 16px; min-width:0; transition:border-color 150ms ease-out, transform 150ms ease-out; animation:msnin 220ms ease-out; }
    .msn-card.crit{ box-shadow:inset 0 0 0 1px rgba(239,68,68,0.22); }
    .msn-card.quiet .msn-ttl{ color:#C4D2E0; }
    .msn-card{ transition:transform 200ms cubic-bezier(0.32,0.72,0,1), border-color 200ms cubic-bezier(0.32,0.72,0,1), box-shadow 200ms cubic-bezier(0.32,0.72,0,1); }
    .msn-card:hover{ transform:translateY(-2px); border-color:rgba(148,163,184,0.4); box-shadow:0 8px 24px rgba(0,0,0,0.25); }
    .msn-card.sel{ border-color:#3B82F6; }
    @keyframes msnin{ from{ opacity:0; transform:translateY(4px) } to{ opacity:1; transform:none } }
    .msn-grid6{ display:grid; gap:8px; grid-template-columns:repeat(6,1fr); margin-top:10px; }
    @media (max-width:1024px){ .msn-grid6{ grid-template-columns:repeat(3,1fr); } }
    @media (max-width:640px){ .msn-grid6{ grid-template-columns:repeat(2,1fr); } }
    .msn-metric{ background:rgba(148,163,184,0.06); border-radius:10px; padding:8px 10px; min-width:0; }
    .msn-metric .k{ font-size:10px; font-weight:800; letter-spacing:0.7px; color:var(--m-mut); }
    .msn-metric .v{ font-size:15px; font-weight:800; font-variant-numeric:tabular-nums; margin-top:2px; white-space:nowrap; }
    .msn-risk{ display:flex; gap:10px; align-items:center; margin-top:10px; }
    .msn-bar{ flex:1; height:8px; border-radius:999px; background:rgba(148,163,184,0.18); overflow:hidden; min-width:60px; }
    .msn-bar i{ display:block; height:100%; border-radius:999px; transition:width 250ms ease-out; }
    .msn-dot{ width:8px; height:8px; border-radius:999px; flex:none; }
    .msn-dot.live{ background:#22C55E; animation:msnpulse 2.4s ease-out infinite; }
    .msn-dot.mon{ background:#F59E0B; } .msn-dot.off{ background:#5B6E82; }
    .msn-dot.hollow{ background:transparent; border:1.5px solid #8CA0B3; }
    @keyframes msnpulse{ 0%,100%{ opacity:1 } 50%{ opacity:0.35 } }
    .msn-tag{ font-size:10px; font-weight:800; letter-spacing:0.5px; border-radius:6px; padding:2px 8px; border:1px solid var(--m-line); color:var(--m-mut); white-space:nowrap; }
    .msn-sev{ display:inline-flex; gap:6px; align-items:center; font-size:11px; font-weight:800; letter-spacing:0.6px; border-radius:8px; padding:3px 10px; color:#fff; }
    .msn-drawer{ position:fixed; top:0; right:0; bottom:0; width:min(480px, calc(100vw - 24px)); background:var(--m-panel); border-left:1px solid var(--m-line); z-index:60; overflow:auto; padding:20px; animation:msnslide 220ms ease-out; box-shadow:-16px 0 48px rgba(0,0,0,0.5); }
    @keyframes msnslide{ from{ transform:translateX(24px); opacity:0 } to{ transform:none; opacity:1 } }
    .msn-dsec{ margin-top:14px; border-top:1px solid var(--m-line); padding-top:10px; }
    .msn-dsec h4{ margin:0 0 8px; font-size:11px; letter-spacing:1px; color:var(--m-mut); }
    .msn-kv{ display:flex; justify-content:space-between; gap:8px; font-size:13px; padding:3px 0; }
    .msn-kv span:first-child{ color:var(--m-mut); }
    .msn-kv b{ font-variant-numeric:tabular-nums; text-align:right; }
    .msn-modal{ position:fixed; inset:0; z-index:70; display:grid; place-items:center; padding:16px; background:rgba(3,7,12,0.7); animation:msnin 180ms ease-out; }
    .msn-sheet{ width:min(560px,100%); max-height:88vh; overflow:auto; background:var(--m-panel); border:1px solid var(--m-line); border-radius:14px; padding:20px; }
    .msn-field{ display:flex; flex-direction:column; gap:4px; margin-top:10px; }
    .msn-field label{ font-size:11px; font-weight:800; letter-spacing:0.7px; color:var(--m-mut); }
    .msn-field input, .msn-field select, .msn-field textarea{ background:var(--m-panel2); border:1px solid var(--m-line); border-radius:10px; padding:8px 12px; color:var(--m-text); font-size:13px; font-family:inherit; }
    .msn-empty{ text-align:center; padding:36px 16px; color:var(--m-mut); }
    .msn-empty b{ display:block; font-size:15px; color:var(--m-text); margin-top:10px; }
    .msn-empty p{ font-size:13px; margin:6px 0 0; }
    .msn-toast{ position:fixed; bottom:20px; left:50%; transform:translateX(-50%); background:#0E9F6E; color:#fff; font-size:13px; font-weight:700; border-radius:10px; padding:10px 18px; z-index:80; animation:msnin 180ms ease-out; }
    .msn-tl{ position:relative; margin:4px 0 0 5px; padding-left:16px; }
    .msn-tl::before{ content:''; position:absolute; left:0; top:8px; bottom:8px; width:2px; border-radius:2px; background:rgba(148,163,184,0.25); }
    .msn-tl .ev{ position:relative; display:flex; gap:8px; font-size:13px; padding:4px 0; color:#8CA0B3; }
    .msn-tl .ev::before{ content:''; position:absolute; left:-19px; top:9px; width:8px; height:8px; border-radius:999px; background:#5B6E82; }
    .msn-tl .ev.cur{ color:#EAF0F6; font-weight:700; }
    .msn-tl .ev.cur::before{ background:#22C55E; box-shadow:0 0 0 3px rgba(34,197,94,0.2); }
    .msn-aibrief{ background:rgba(59,130,246,0.06); border:1px solid rgba(59,130,246,0.25); border-left:3px solid #3B82F6; border-radius:10px; padding:10px 12px; }
    .msn-empty{ text-align:center; padding:28px 16px; color:var(--m-mut); }
    .msn-tabs{ display:flex; gap:6px; flex-wrap:wrap; }
    .msn-tab{ font-size:12px; font-weight:800; border-radius:10px; border:1px solid var(--m-line); background:transparent; color:var(--m-mut); padding:7px 14px; cursor:pointer; transition:background 150ms ease-out, color 150ms ease-out; }
    .msn-tab.on{ background:#E8EEF4; color:#0A111C; border-color:#E8EEF4; }
    @media (max-width:640px){ .msn{ padding:14px; } .msn-title{ font-size:19px; } }
    @media (prefers-reduced-motion: reduce){ .msn *{ animation:none !important; transition:none !important; } }
    button:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible{ outline:2px solid #3B82F6; outline-offset:2px; }
    `}</style>
  )
}

export function SevBadge({ sev, pulse }: { sev: Sev; pulse?: boolean }) {
  return (
    <span className="msn-sev" style={{ background: SEV_COLOR[sev] }}>
      <Flame size={12} style={pulse ? { animation: 'msnpulse 2s infinite' } : undefined} />{sev}
    </span>
  )
}

export function StatusDot({ status }: { status: IStatus }) {
  const cls = status === 'LIVE' ? 'live' : status === 'MONITORING' ? 'mon' : 'off'
  return <span className={`msn-dot ${cls}`} aria-hidden />
}

export function MsnEmpty({ icon, title, hint, action }: { icon: ReactNode; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="msn-empty">
      <div style={{ display: 'grid', placeItems: 'center', color: '#5B6E82' }}>{icon}</div>
      <b>{title}</b>
      {hint && <p>{hint}</p>}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  )
}

export function RiskMini({ score }: { score: number }) {
  const t = riskTone(score)
  return (
    <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', minWidth: 150, flex: 1 }}>
      <span className="msn-bar"><i style={{ width: `${Math.min(100, score)}%`, background: SEV_COLOR[t] }} /></span>
      <b className="msn-num" style={{ fontSize: 15, color: SEV_COLOR[t] }}>{score}</b>
    </span>
  )
}

export function IncidentDrawer({ e, now, onClose, onCommand, onMission }: {
  e: Incident; now: number; onClose: () => void; onCommand: () => void; onMission: () => void;
}) {
  useEffect(() => {
    const h = (ev: KeyboardEvent) => { if (ev.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  return (
    <div className="msn-drawer" role="dialog" aria-label={`Chi tiết ${e.id}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div>
          <div className="msn-kicker">INCIDENT</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
            <SevBadge sev={e.sev} />
            <span className="msn-num" style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.8, color: '#8CA0B3' }}>{e.id}</span>
          </div>
          <h3 style={{ margin: '8px 0 0', fontSize: 18, lineHeight: 1.35 }}>{e.title}</h3>
          <div className="msn-mut" style={{ marginTop: 4, display: 'flex', gap: 6, alignItems: 'center' }}>
            <MapPin size={12} /> {e.area} · {e.forest}
          </div>
          <div style={{ marginTop: 6 }}><LiveState e={e} now={now} /></div>
        </div>
        <button className="msn-btn sm" onClick={onClose} aria-label="Đóng chi tiết"><X size={14} /></button>
      </div>
      <div className="msn-dsec"><h4>INCIDENT OVERVIEW</h4>
        <div className="msn-kv"><span>Mã sự cố</span><b>{e.id}</b></div>
        <div className="msn-kv"><span>Phát hiện</span><b>{new Date(e.detectedAt).toLocaleString('vi-VN')}</b></div>
        <div className="msn-kv"><span>Cập nhật</span><b>{e.status === 'LIVE' ? fmtClock(e.updatedAt) : fmtAgo(e.updatedAt, now)}</b></div>
        <div className="msn-kv"><span>Nguồn phát hiện</span><b>{e.source}</b></div>
      </div>
      <div className="msn-dsec"><h4>FIRE STATUS</h4>
        <div className="msn-kv"><span>Diện tích</span><b>{fmtNum(e.areaHa)} ha</b></div>
        <div className="msn-kv"><span>Tốc độ lan</span><b>{e.spreadMMin} m/min → {e.windDir}</b></div>
        <div className="msn-kv"><span>Rủi ro ước tính</span><b style={{ color: SEV_COLOR[riskTone(e.riskScore)] }}>{e.riskScore} / 100 · {riskTone(e.riskScore)}</b></div>
        {e.factors.map(([k, v]) => (
          <div className="msn-kv" key={k}><span>{k}</span><b>{v}</b></div>
        ))}
      </div>
      <div className="msn-dsec"><h4>ENVIRONMENT</h4>
        <div className="msn-kv"><span><Thermometer size={12} /> Nhiệt độ</span><b>{fmtNum(e.temp)}°C</b></div>
        <div className="msn-kv"><span><Droplets size={12} /> Độ ẩm</span><b>{Math.round(e.humidity)}%</b></div>
        <div className="msn-kv"><span><Wind size={12} /> Gió</span><b>{e.windKmh} km/h {e.windDir}</b></div>
      </div>
      <div className="msn-dsec"><h4>RESPONSE</h4>
        <div className="msn-kv"><span><Users size={12} /> Lực lượng</span><b>{e.personnel} người</b></div>
        <div className="msn-kv"><span><Truck size={12} /> Phương tiện</span><b>{e.vehicles} xe · {e.drones} flycam</b></div>
      </div>
      <div className="msn-dsec"><h4>TIMELINE</h4>
        <div className="msn-tl">
          {e.timeline.map(([t, d], i) => (
            <div key={i} className={`ev${i === e.timeline.length - 1 ? ' cur' : ''}`}>
              <span><b>{t}:</b> <span style={{ color: 'inherit', fontWeight: i === e.timeline.length - 1 ? 700 : 400 }}>{d}</span></span>
            </div>
          ))}
        </div>
      </div>
      <div className="msn-dsec"><h4>AI INTELLIGENCE</h4>
        <div className="msn-aibrief">
          <div style={{ fontSize: 13, display: 'flex', gap: 6 }}>
            <ShieldAlert size={14} style={{ flex: 'none', marginTop: 2, color: '#7AA7FF' }} />
            <span>{e.ai.text}</span>
          </div>
          <div className="msn-kicker" style={{ marginTop: 8 }}>CONFIDENCE</div>
          <div className="msn-num" style={{ fontSize: 16, fontWeight: 800 }}>{e.ai.confidence}%</div>
          <div className="msn-kicker" style={{ marginTop: 8 }}>RECOMMENDATION</div>
          <div style={{ fontSize: 13, marginTop: 2 }}>{e.ai.reason}</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
        <button className="msn-btn primary" onClick={onCommand}>Mở trung tâm chỉ huy</button>
        <button className="msn-btn" onClick={onMission}>Tạo nhiệm vụ</button>
      </div>
      <div className="msn-mut" style={{ marginTop: 10, display: 'flex', gap: 6, alignItems: 'center' }}>
        <Radio size={12} /> Nguồn: {e.source}
      </div>
    </div>
  )
}

export type IncidentDraft = {
  title: string; area: string; sev: Sev; source: string;
  detected: string; desc: string; lat: string; lon: string; personnel: string;
}

export const EMPTY_DRAFT: IncidentDraft = {
  title: '', area: '', sev: 'HIGH', source: '', detected: '', desc: '', lat: '', lon: '', personnel: '',
}

export function CreateModal({ areas, draft, setDraft, onClose, onSubmit }: {
  areas: string[]; draft: IncidentDraft; setDraft: (d: IncidentDraft) => void;
  onClose: () => void; onSubmit: () => void;
}) {
  useEffect(() => {
    const h = (ev: KeyboardEvent) => { if (ev.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  const set = (k: keyof IncidentDraft, v: string) => setDraft({ ...draft, [k]: v })
  return (
    <div className="msn-modal" role="dialog" aria-label="Tạo sự cố mới" onClick={onClose}>
      <div className="msn-sheet pop-in" style={{ transformOrigin: 'center' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div><div className="msn-kicker">NEW INCIDENT</div><h3 style={{ margin: '4px 0 0', fontSize: 17 }}>Tạo sự cố mới</h3></div>
          <button className="msn-btn sm" onClick={onClose} aria-label="Đóng"><X size={14} /></button>
        </div>
        <div className="msn-field"><label htmlFor="nc-title">TÊN SỰ CỐ</label>
          <input id="nc-title" value={draft.title} onChange={e => set('title', e.target.value)} placeholder="VD: Cháy rừng phòng hộ Ia Mơr" /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="msn-field"><label htmlFor="nc-area">KHU VỰC</label>
            <select id="nc-area" value={draft.area} onChange={e => set('area', e.target.value)}>
              <option value="">— Chọn khu vực —</option>
              {areas.map(a => <option key={a} value={a}>{a}</option>)}
            </select></div>
          <div className="msn-field"><label htmlFor="nc-sev">MỨC ĐỘ BAN ĐẦU</label>
            <select id="nc-sev" value={draft.sev} onChange={e => set('sev', e.target.value as Sev)}>
              {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as Sev[]).map(s => <option key={s} value={s}>{s}</option>)}
            </select></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="msn-field"><label htmlFor="nc-src">NGUỒN PHÁT HIỆN</label>
            <input id="nc-src" value={draft.source} onChange={e => set('source', e.target.value)} placeholder="VD: Chòi canh, FIRMS, người dân" /></div>
          <div className="msn-field"><label htmlFor="nc-det">THỜI GIAN PHÁT HIỆN</label>
            <input id="nc-det" value={draft.detected} onChange={e => set('detected', e.target.value)} placeholder="VD: 13:20 hôm nay" /></div>
        </div>
        <div className="msn-field"><label htmlFor="nc-desc">MÔ TẢ</label>
          <textarea id="nc-desc" rows={2} value={draft.desc} onChange={e => set('desc', e.target.value)} placeholder="Diễn biến ban đầu, hướng lan, nguy cơ..." /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <div className="msn-field"><label htmlFor="nc-lat">VĨ ĐỘ</label>
            <input id="nc-lat" value={draft.lat} onChange={e => set('lat', e.target.value)} placeholder="13.55" inputMode="decimal" /></div>
          <div className="msn-field"><label htmlFor="nc-lon">KINH ĐỘ</label>
            <input id="nc-lon" value={draft.lon} onChange={e => set('lon', e.target.value)} placeholder="107.65" inputMode="decimal" /></div>
          <div className="msn-field"><label htmlFor="nc-p">LỰC LƯỢNG BAN ĐẦU</label>
            <input id="nc-p" value={draft.personnel} onChange={e => set('personnel', e.target.value)} placeholder="VD: 10 người" /></div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
          <button className="msn-btn" onClick={onClose}>Hủy</button>
          <button className="msn-btn primary" onClick={onSubmit} disabled={!draft.title.trim()}>Tạo sự cố</button>
        </div>
      </div>
    </div>
  )
}

export function Toast({ msg }: { msg: string }) {
  if (!msg) return null
  return <div className="msn-toast" role="status">{msg}</div>
}

export function LiveState({ e, now }: { e: Incident; now: number }) {
  if (e.status === 'RESOLVED') return <span className="msn-tag">RESOLVED</span>
  if (e.live) {
    return (
      <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 11, fontWeight: 800, color: '#22C55E' }}>
        <span className="msn-dot live" /> LIVE <span className="msn-num" style={{ color: '#8CA0B3', fontWeight: 700 }}>{fmtClock(e.updatedAt)}</span>
      </span>
    )
  }
  if (e.status === 'OFFLINE') return <span className="msn-tag">○ OFFLINE</span>
  return <span className="msn-mut" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><span className="msn-dot hollow" />Cập nhật {fmtAgo(e.updatedAt, now)}</span>
}

export function IncidentCard({ e, now, selected, onOpen }: {
  e: Incident; now: number; selected: boolean; onOpen: (e: Incident) => void;
}) {
  const crit = e.sev === 'CRITICAL' && e.status !== 'RESOLVED'
  const quiet = e.status === 'RESOLVED'
  const tone = riskTone(e.riskScore)
  return (
    <article className={`msn-card${selected ? ' sel' : ''}${crit ? ' crit' : ''}${quiet ? ' quiet' : ''}`}
      style={crit ? { borderLeftColor: SEV_COLOR[e.sev], background: '#101A2C' } : { borderLeftColor: SEV_COLOR[e.sev] }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <SevBadge sev={e.sev} pulse={crit && e.live} />
        <span className="msn-num" style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.8, color: crit ? '#EAF0F6' : '#8CA0B3' }}>{e.id}</span>
        <span style={{ flex: 1 }} />
        <LiveState e={e} now={now} />
      </div>
      <h3 className="msn-ttl" style={{ margin: '8px 0 0', fontSize: crit ? 17 : 16, lineHeight: 1.35, fontWeight: 800 }}>{e.title}</h3>
      <div className="msn-mut" style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}>
        <MapPin size={12} />{e.area} · {e.forest}
      </div>
      <div className="msn-grid6" role="list" aria-label="Chỉ số tác chiến">
        <div className="msn-metric" role="listitem"><div className="k">DIỆN TÍCH</div><div className="v">{fmtNum(e.areaHa)} ha</div></div>
        <div className="msn-metric" role="listitem"><div className="k">TỐC ĐỘ LAN</div><div className="v">{e.spreadMMin} m/min</div></div>
        <div className="msn-metric" role="listitem"><div className="k">NHIỆT ĐỘ</div><div className="v">{fmtNum(e.temp)}°C</div></div>
        <div className="msn-metric" role="listitem"><div className="k">ĐỘ ẨM</div><div className="v">{Math.round(e.humidity)}%</div></div>
        <div className="msn-metric" role="listitem"><div className="k">GIÓ</div><div className="v">{e.windKmh} km/h → {e.windDir}</div></div>
        <div className="msn-metric" role="listitem"><div className="k">LỰC LƯỢNG</div><div className="v">{e.personnel} người · {e.vehicles} xe</div></div>
      </div>
      <div className="msn-risk">
        <span className="msn-kicker">FIRE RISK</span>
        <b className="msn-num" style={{ fontSize: crit ? 20 : 18, color: SEV_COLOR[tone] }}>{e.riskScore} / 100</b>
        <span className="msn-bar"><i style={{ width: `${e.riskScore}%`, background: SEV_COLOR[tone] }} /></span>
        <span className="msn-tag" style={{ color: SEV_COLOR[tone], borderColor: SEV_COLOR[tone] }}>{tone}</span>
        <span style={{ flex: 1 }} />
        <span className="msn-mut msn-num" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{e.live ? fmtClock(e.updatedAt) : fmtAgo(e.updatedAt, now)}</span>
        <Link className="msn-btn sm primary" to="/command">Mở trung tâm chỉ huy</Link>
        <button className="msn-btn sm" onClick={() => onOpen(e)} aria-label={`Chi tiết ${e.id}`}><ChevronRight size={14} /></button>
      </div>
    </article>
  )
}
