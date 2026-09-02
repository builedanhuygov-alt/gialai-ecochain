import { useState } from 'react'
import { motion } from 'framer-motion'

export function Tabs({ tabs, defaultTab }: { tabs:string[]; defaultTab?:string }){
  const [active, setActive] = useState(defaultTab || tabs[0])
  return (
    <div>
      <div className="tabs" role="tablist">
        {tabs.map(t=>(
          <button key={t} role="tab" aria-selected={active===t} onClick={()=>setActive(t)} className={active===t?'tab active':'tab'}>
            {active===t && <motion.div layoutId="tab-indicator" className="tab-indicator" transition={{ type:'spring', stiffness:380, damping:32 }} />}
            <span style={{position:'relative'}}>{t}</span>
          </button>
        ))}
      </div>
      <style>{`
        .tabs{ display:flex; gap:6px; background:#F1F5F3; padding:4px; border-radius:999px; width:fit-content; }
        .tab{ position:relative; padding:8px 14px; border-radius:999px; border:0; background:transparent; font-size:13px; font-weight:600; color:#64748B; }
        .tab.active{ color:#0F1E1A; }
        .tab-indicator{ position:absolute; inset:0; background:#fff; border-radius:999px; box-shadow:0 1px 3px rgba(0,0,0,0.08); border:1px solid #E2E8E5; }
      `}</style>
    </div>
  )
}
