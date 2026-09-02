import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { motion } from 'framer-motion'

export function MetricCard({ label, value, unit, trend, dir, icon }: any) {
  return (
    <motion.div className="metric" whileHover={{ y:-2, boxShadow:'0 8px 24px rgba(15,30,26,0.10)' }} transition={{ duration:0.18, ease:[0.16,1,0.3,1] as any }} style={{ willChange:'transform' }}>
      <div className="metric-top">
        <div className="metric-label">{label}</div>
        <div className="metric-icon">{icon}</div>
      </div>
      <div className="metric-value">{value}<span className="unit">{unit}</span></div>
      <div className={`trend ${dir}`}>{dir==='up'?<TrendingUp size={14}/>:dir==='down'?<TrendingDown size={14}/>:<Minus size={14}/>} {trend}<span className="muted"> vs previous month</span></div>
      <div className="source"><span className="dot live"/> VERIFIED · 2h ago</div>
      <style>{`
        .metric{ background:#fff; border:1px solid #E2E8E5; border-radius:16px; padding:16px; box-shadow:0 1px 2px rgba(15,30,26,0.06); transition: box-shadow var(--motion-normal) var(--ease-standard), border-color var(--motion-fast) var(--ease-standard); }
        .metric:hover{ border-color:#CBD5D1; }
        .metric-top{ display:flex; justify-content:space-between; align-items:center; }
        .metric-label{ font-size:11px; letter-spacing:0.6px; color:#64748B; font-weight:600; }
        .metric-icon{ width:28px; height:28px; border-radius:8px; background:#F1F5F3; display:grid; place-items:center; font-size:14px; }
        .metric-value{ font-size:26px; font-weight:800; color:#0F1E1A; margin-top:8px; }
        .unit{ font-size:13px; font-weight:600; color:#64748B; margin-left:4px; }
        .trend{ font-size:12px; font-weight:600; margin-top:6px; display:flex; gap:6px; align-items:center; }
        .trend.up{ color:#15803D; } .trend.down{ color:#15803D; } .trend.flat{ color:#64748B; }
        .muted{ font-weight:500; color:#94A3B8; }
        .source{ font-size:11px; color:#94A3B8; margin-top:8px; display:flex; gap:6px; align-items:center; }
        .dot.live{ width:6px; height:6px; border-radius:999px; background:#10B981; display:inline-block; }
      `}</style>
    </motion.div>
  )
}

export function AIInsightCard() {
  return (
    <div className="ai-card">
      <div className="ai-head">GỢI Ý AI <span className="conf">Tin cậy 89%</span></div>
      <div className="ai-title">Nguy cơ cháy rừng tăng trong khu vực đã chọn.</div>
      <div className="ai-why">
        <div>Nguyên nhân chính:</div>
        <ul>
          <li>khô hạn thực bì</li><li>xu hướng nhiệt độ</li><li>bất thường vệ tinh</li><li>tiền sử sự cố</li>
        </ul>
      </div>
      <div className="ai-meta">Nguồn: Sentinel-2 · Thời tiết · Báo cáo đã xác minh · 2 giờ trước</div>
      <div className="ai-actions">
        <button className="btn primary">Xem bằng chứng</button>
        <button className="btn ghost">Mô phỏng kịch bản</button>
      </div>
      <style>{`
        .ai-card{ background:#fff; border:1px solid #E2E8E5; border-radius:16px; padding:16px; }
        .ai-head{ font-size:11px; letter-spacing:0.6px; color:#64748B; font-weight:700; display:flex; justify-content:space-between; }
        .conf{ background:#EFF6FF; color:#1D4ED8; padding:4px 8px; border-radius:999px; font-size:11px; }
        .ai-title{ font-weight:700; margin-top:10px; color:#0F1E1A; }
        .ai-why{ font-size:13px; color:#334155; margin-top:10px; }
        .ai-why ul{ margin:6px 0 0 18px; }
        .ai-meta{ font-size:12px; color:#94A3B8; margin-top:10px; }
        .ai-actions{ display:flex; gap:8px; margin-top:12px; }
        .btn{ padding:8px 12px; border-radius:999px; font-size:13px; font-weight:600; border:1px solid #E2E8E5; }
        .btn.primary{ background:#0F766E; color:#fff; border-color:#0F766E; }
        .btn.ghost{ background:#fff; }
      `}</style>
    </div>
  )
}

export function AlertCard({ icon, title, loc, time, status }: any) {
  return (
    <div className="alert">
      <div className="alert-icon">{icon}</div>
      <div className="alert-body">
        <div className="alert-title">{title}</div>
        <div className="alert-loc">{loc} · {time}</div>
        <div className="alert-status"><span className="pill">{status}</span></div>
      </div>
      <style>{`
        .alert{ display:flex; gap:12px; padding:12px; border:1px solid #E2E8E5; border-radius:12px; background:#fff; }
        .alert-icon{ width:36px; height:36px; border-radius:999px; background:#FFF7ED; display:grid; place-items:center; }
        .alert-title{ font-weight:600; font-size:13px; }
        .alert-loc{ font-size:12px; color:#64748B; }
        .pill{ font-size:11px; background:#F1F5F3; padding:4px 8px; border-radius:999px; }
      `}</style>
    </div>
  )
}

export function VerificationBadge({ status }: { status:string }) {
  const map:any={ PENDING:{label:'PENDING', bg:'#FEF3C7', fg:'#92400E'}, COMMUNITY:{label:'COMMUNITY VERIFIED', bg:'#DBEAFE', fg:'#1E40AF'}, VERIFIED:{label:'OFFICIAL VERIFIED', bg:'#DCFCE7', fg:'#166534'} }
  const v=map[status]||map.PENDING
  return <span style={{ background:v.bg, color:v.fg, padding:'4px 8px', borderRadius:999, fontSize:11, fontWeight:700 }}>{v.label}</span>
}
