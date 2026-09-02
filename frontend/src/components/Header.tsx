import { Bell, Bot, Menu } from 'lucide-react'
import { useScope } from '../store/useScope'
import { useDemo } from '../store/useDemo'

export default function Header({ onMenu }: { onMenu: ()=>void }) {
  const { scope, communes, villages, setCommune, setVillage } = useScope()
  const { demo, toggle } = useDemo()
  return (
    <header className="header">
      <button className="menu" onClick={onMenu} aria-label="Menu"><Menu size={20}/></button>

      <div className="scope">
        <select value={scope.commune||''} onChange={e=> setCommune(e.target.value||undefined)}>
          <option value="">Tỉnh Gia Lai</option>
          {communes.map(c=> <option key={c} value={c}>{c}</option>)}
        </select>
        {scope.commune && (
          <select value={scope.village||''} onChange={e=> setVillage(e.target.value||undefined)}>
            <option value="">Tất cả thôn</option>
            {villages.map(v=> <option key={v} value={v}>{v}</option>)}
          </select>
        )}
        <span className="scope-badge">{scope.role==='province'?'TỈNH':scope.role==='commune'?'XÃ':'THÔN'}</span>
      </div>

      <div className="header-right">
        <span className="status"><span className="dot"/> Hệ thống hoạt động</span>
        <span className="meta">Cập nhật: 2 phút trước</span>
        <button className={`demo ${demo?'on':''}`} onClick={toggle} title="Chế độ Demo">{demo?'DEMO':'THỰC'}</button>
        <button className="icon-btn" aria-label="Thông báo"><Bell size={18}/> <span className="badge">3</span></button>
        <button className="assistant"><Bot size={16}/> Trợ lý AI</button>
        <div className="user">QT</div>
      </div>

      <style>{`
        .header{ height:64px; background:#FFFFFF; border-bottom:1px solid #E2E8E5; display:flex; align-items:center; gap:16px; padding:0 20px; position:sticky; top:0; z-index:10; }
        .menu{ display:none; background:#fff; border:1px solid #E2E8E5; border-radius:10px; padding:8px; }
        .scope{ display:flex; gap:8px; align-items:center; }
        .scope select{ background:#F8FAF9; border:1px solid #E2E8E5; border-radius:10px; padding:8px 10px; font-size:13px; font-weight:600; }
        .scope-badge{ font-size:11px; letter-spacing:0.6px; background:#0F766E; color:#fff; padding:4px 8px; border-radius:999px; }
        .header-right{ margin-left:auto; display:flex; gap:12px; align-items:center; }
        .status{ font-size:12px; color:#0F766E; font-weight:600; display:flex; gap:6px; align-items:center; }
        .dot{ width:8px; height:8px; border-radius:999px; background:#10B981; display:inline-block; }
        .meta{ font-size:12px; color:#64748B; }
        .demo{ font-size:11px; border:1px solid #E2E8E5; padding:6px 10px; border-radius:999px; background:#fff; }
        .demo.on{ background:#FEF3C7; border-color:#F59E0B; color:#92400E; }
        .icon-btn{ position:relative; background:#fff; border:1px solid #E2E8E5; border-radius:999px; width:36px; height:36px; display:grid; place-items:center; }
        .badge{ position:absolute; top:-6px; right:-6px; background:#DC2626; color:#fff; font-size:10px; padding:2px 5px; border-radius:999px; }
        .assistant{ background:#0B1412; color:#fff; border-radius:999px; padding:8px 12px; font-size:13px; display:flex; gap:6px; align-items:center; }
        .user{ width:32px; height:32px; border-radius:999px; background:#0F766E; color:#fff; display:grid; place-items:center; font-weight:700; font-size:12px; }
        @media (max-width: 900px){
          .menu{ display:grid; }
          .meta, .status{ display:none; }
          .assistant span{ display:none; }
        }
      `}</style>
    </header>
  )
}
