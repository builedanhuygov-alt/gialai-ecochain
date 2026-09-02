import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Map, Trees, Flame, Sprout, Leaf, FileCheck, Truck, Layers, Users, Trophy, FileText, Bell, ShieldCheck, Settings, HelpCircle, X } from 'lucide-react'

const groups = [
  { label:'TỔNG QUAN', items:[
    { to:'/', label:'Tổng quan', icon: LayoutDashboard },
    { to:'/map', label:'Bản đồ trực tiếp', icon: Map },
  ]},
  { label:'TRÍ TUỆ', items:[
    { to:'/forest', label:'AI Rừng', icon: Trees },
    { to:'/disaster', label:'AI Thiên tai', icon: Flame },
    { to:'/agriculture', label:'AI Nông nghiệp', icon: Sprout },
    { to:'/carbon', label:'Carbon', icon: Leaf },
    { to:'/eudr', label:'EUDR', icon: FileCheck },
    { to:'/logistics', label:'Logistics Xanh', icon: Truck },
  ]},
  { label:'QUẢN TRỊ', items:[
    { to:'/twin', label:'Bản sao số', icon: Layers },
    { to:'/actions', label:'Trung tâm hành động', icon: ShieldCheck },
    { to:'/community', label:'Cộng đồng', icon: Users },
    { to:'/leaderboard', label:'Bảng xếp hạng', icon: Trophy },
    { to:'/reports', label:'Báo cáo', icon: FileText },
  ]},
  { label:'HỆ THỐNG', items:[
    { to:'/notifications', label:'Thông báo', icon: Bell },
    { to:'/admin', label:'Quản trị', icon: Settings },
    { to:'/audit', label:'Nhật ký', icon: FileText },
  ]},
]

export default function Sidebar({ mobileOpen, onClose }: { mobileOpen:boolean; onClose:()=>void }) {
  return (
    <>
      <aside className={`sidebar ${mobileOpen?'open':''}`}>
        <div className="brand">
          <div className="logo">E</div>
          <div>
            <div className="brand-title">ECOGL</div>
            <div className="brand-sub">TRÍ TUỆ MÔI TRƯỜNG AI</div>
          </div>
          <button className="close" onClick={onClose} aria-label="Close"><X size={18}/></button>
        </div>

        <nav className="nav">
          {groups.map(g=>(
            <div key={g.label} className="group">
              <div className="group-label">{g.label}</div>
              {g.items.map(it=>{
                const Icon = it.icon
                return (
                  <NavLink key={it.to} to={it.to} className={({isActive})=> isActive?'nav-link active':'nav-link'} onClick={onClose}>
                    <Icon size={18} strokeWidth={1.7} /> {it.label}
                  </NavLink>
                )
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-foot">
          <a><Settings size={16}/> Cài đặt</a>
          <a><HelpCircle size={16}/> Trợ giúp</a>
          <div className="profile"><div className="avatar">QT</div><div><div className="pname">Quản trị Tỉnh</div><div className="prole">Gia Lai</div></div></div>
        </div>
      </aside>
      {mobileOpen && <div className="backdrop" onClick={onClose} />}
      <style>{`
        .sidebar{ width:268px; background:#0B1412; color:#D1D5DB; display:flex; flex-direction:column; position:sticky; top:0; height:100vh; flex-shrink:0; border-right:1px solid #1E3A36; overflow:auto; }
        .brand{ display:flex; gap:12px; align-items:center; padding:18px 16px; border-bottom:1px solid #1E3A36; }
        .logo{ width:36px; height:36px; border-radius:10px; background:#0F766E; color:#fff; display:grid; place-items:center; font-weight:800; letter-spacing:0.5px; }
        .brand-title{ font-weight:800; color:#fff; font-size:15px; letter-spacing:0.8px; }
        .brand-sub{ font-size:10px; letter-spacing:0.6px; color:#94A3B8; }
        .close{ display:none; margin-left:auto; background:transparent; color:#fff; border:0; }
        .nav{ padding:12px 10px; flex:1; }
        .group{ margin:14px 0; }
        .group-label{ font-size:11px; letter-spacing:0.8px; color:#6B7280; padding:6px 10px; }
        .nav-link{ display:flex; gap:10px; align-items:center; padding:9px 10px; border-radius:10px; color:#CBD5D1; text-decoration:none; font-size:14px; font-weight:500; }
        .nav-link:hover{ background:#13201D; color:#fff; }
        .nav-link.active{ background:#132E2A; color:#fff; border:1px solid #1E4A44; }
        .sidebar-foot{ padding:14px 12px; border-top:1px solid #1E3A36; display:flex; flex-direction:column; gap:10px; font-size:13px;}
        .sidebar-foot a{ display:flex; gap:8px; align-items:center; color:#94A3B8; }
        .profile{ display:flex; gap:10px; align-items:center; margin-top:4px; }
        .avatar{ width:32px; height:32px; border-radius:999px; background:#1E3A36; display:grid; place-items:center; color:#fff; font-weight:700;}
        .pname{ font-weight:600; color:#fff; font-size:13px; } .prole{ font-size:12px; color:#94A3B8; }
        .backdrop{ position:fixed; inset:0; background:rgba(0,0,0,0.4); z-index:30; }
        @media (max-width: 900px){
          .sidebar{ position:fixed; z-index:40; transform: translateX(-100%); transition: transform 0.2s; }
          .sidebar.open{ transform: translateX(0); }
          .close{ display:block; }
        }
      `}</style>
    </>
  )
}
