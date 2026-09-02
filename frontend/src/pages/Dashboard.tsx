import { MetricCard, AIInsightCard, AlertCard } from '../components/Cards'
import MapView from '../components/MapView'
import { StaggerContainer, StaggerItem } from '../motion/primitives'
import { mockKPIs, mockAlerts } from '../services/mockProvider'
import { useState } from 'react'
import { LineChart, Line, ResponsiveContainer } from 'recharts'

export default function Dashboard() {
  const [selected, setSelected] = useState<string|null>(null)
  return (
    <div className="dash">
      <div className="welcome">
        <div style={{display:'flex', gap:12, alignItems:'center'}}>
          <img src="/logo.svg" alt="GIALAI EcoChain" style={{width:48, height:48, borderRadius:12}} />
          <div>
            <h1>GIALAI EcoChain — Trí tuệ Môi trường Gia Lai</h1>
            <p>Hiện trạng · Rủi ro ở đâu? · Vì sao? · Cần làm gì?</p>
          </div>
        </div>
        <span className="demo-badge">DỮ LIỆU DEMO</span>
      </div>

      <StaggerContainer>
        <div className="kpi-grid">
          {mockKPIs.slice(0,4).map(k=> <StaggerItem key={k.label}><MetricCard {...k} icon={<span>●</span>} /></StaggerItem>)}
        </div>
        <div className="kpi-grid">
          {mockKPIs.slice(4,8).map(k=> <StaggerItem key={k.label}><MetricCard {...k} icon={<span>■</span>} /></StaggerItem>)}
        </div>
      </StaggerContainer>

      <MapView onSelect={()=> setSelected('Xã A')} />

      {selected && (
        <div className="panel">
          <h3>Xã A — Điểm EcoGL 72/100</h3>
          <div className="panel-grid">
            <div>Rủi ro CAO</div><div>Rừng 81%</div><div>Sự cố 4</div><div>AI tin cậy 89%</div>
          </div>
          <div className="panel-actions">
            <button className="btn primary">Xem chi tiết</button>
            <button className="btn">Chạy phân tích AI</button>
            <button className="btn">Xem kịch bản</button>
            <button className="btn">Tạo nhiệm vụ</button>
          </div>
        </div>
      )}

      <div className="two-col">
        <AIInsightCard />
        <div className="alerts">
          <div className="card-title">CẢNH BÁO</div>
          {mockAlerts.map(a=> <AlertCard key={a.id} {...a} />)}
        </div>
      </div>

      <div className="two-col">
        <div className="chart-card">
          <div className="card-title">Xu hướng rủi ro</div>
          <div style={{height:160}}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={[{v:42},{v:51},{v:63},{v:58},{v:71},{v:68}]}>
                <Line type="monotone" dataKey="v" stroke="#0F766E" strokeWidth={2} dot={false}/>
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="chart-card">
          <div className="card-title">Việc chờ xử lý</div>
          <ul className="action-list">
            <li>Xác minh sự cố #2026-0012 — Thôn 1</li>
            <li>Nhiệm vụ thực địa — Xã A (CAO)</li>
            <li>Rà soát EUDR — Lô GL-2026-00001</li>
          </ul>
        </div>
      </div>

      <style>{`
        .dash{ display:flex; flex-direction:column; gap:18px; }
        .welcome{ background:#fff; border:1px solid #E2E8E5; border-radius:16px; padding:18px; display:flex; justify-content:space-between; align-items:center; }
        .welcome h1{ font-size:18px; font-weight:800; margin:0; }
        .welcome p{ font-size:13px; color:#64748B; margin:4px 0 0; }
        .demo-badge{ background:#FEF3C7; color:#92400E; padding:6px 10px; border-radius:999px; font-size:11px; font-weight:700; }
        .kpi-grid{ display:grid; grid-template-columns: repeat(4, 1fr); gap:14px; }
        .panel{ background:#fff; border:1px solid #E2E8E5; border-radius:16px; padding:16px; }
        .panel-grid{ display:grid; grid-template-columns: repeat(4,1fr); gap:12px; margin:12px 0; font-size:13px; }
        .panel-actions{ display:flex; gap:8px; flex-wrap:wrap; }
        .btn{ padding:8px 12px; border-radius:999px; border:1px solid #E2E8E5; background:#fff; font-size:13px; }
        .btn.primary{ background:#0F766E; color:#fff; border-color:#0F766E; }
        .two-col{ display:grid; grid-template-columns: 1fr 1fr; gap:14px; }
        .chart-card, .alerts{ background:#fff; border:1px solid #E2E8E5; border-radius:16px; padding:16px; }
        .card-title{ font-size:12px; letter-spacing:0.6px; font-weight:700; color:#0F1E1A; margin-bottom:10px; }
        .action-list{ margin:0; padding-left:18px; font-size:13px; display:flex; flex-direction:column; gap:8px; }
        @media (max-width: 1100px){ .kpi-grid{ grid-template-columns: repeat(2,1fr); } .two-col{ grid-template-columns:1fr; } }
        @media (max-width: 600px){ .kpi-grid{ grid-template-columns:1fr; } }
      `}</style>
    </div>
  )
}
