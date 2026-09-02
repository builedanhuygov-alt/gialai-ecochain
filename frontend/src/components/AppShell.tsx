import { useState } from 'react'
import Sidebar from './Sidebar'
import Header from './Header'

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  return (
    <div className="app-shell">
      <Sidebar mobileOpen={mobileOpen} onClose={()=>setMobileOpen(false)} />
      <div className="main-col">
        <Header onMenu={()=>setMobileOpen(true)} />
        <main className="main-content">{children}</main>
      </div>
      <style>{`
        .app-shell{ display:flex; min-height:100vh; background:#F8FAF9; }
        .main-col{ flex:1; display:flex; flex-direction:column; min-width:0; }
        .main-content{ padding:24px; max-width:1400px; width:100%; margin:0 auto; }
        @media (max-width: 900px){ .main-content{ padding:16px; } }
      `}</style>
    </div>
  )
}
