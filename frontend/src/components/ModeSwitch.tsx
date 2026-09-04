import { useEffect, useState } from 'react'

export type EcoMode = 'live' | 'demo'
export const MODE_KEY = 'ecogl_mode'

export function getMode(): EcoMode {
  try { return (localStorage.getItem(MODE_KEY) as EcoMode) || 'live' } catch { return 'live' }
}

// Switch DEMO (tutorial kịch bản) / LIVE (dữ liệu thật) — phát sự kiện toàn app
export default function ModeSwitch() {
  const [mode, setMode] = useState<EcoMode>(() => getMode())
  useEffect(() => {
    const h = (e: any) => setMode(e.detail?.mode || getMode())
    window.addEventListener('ecochain-mode', h)
    return () => window.removeEventListener('ecochain-mode', h)
  }, [])
  const pick = (m: EcoMode) => {
    try { localStorage.setItem(MODE_KEY, m) } catch {}
    setMode(m)
    window.dispatchEvent(new CustomEvent('ecochain-mode', { detail: { mode: m } }))
    // Gọi backend demo run/reset cho vui (kệ lỗi — frontend vẫn chạy độc lập)
    const API = (import.meta as any).env?.VITE_API_BASE || 'http://localhost:8000'
    fetch(`${API}/api/demo/${m === 'demo' ? 'run' : 'reset'}`, { method: 'POST' }).catch(() => {})
  }
  return (
    <div title={mode === 'demo' ? 'Bản DEMO: kịch bản tutorial đầy đủ hiện tượng' : 'Bản LIVE: dữ liệu thật GEE/FIRMS/Gemini'} style={{ display: 'flex', background: '#F1F5F9', borderRadius: 999, padding: 3, gap: 3 }}>
      {([['live', '● LIVE'], ['demo', '◆ DEMO']] as [EcoMode, string][]).map(([v, label]) => (
        <button key={v} onClick={() => pick(v)} style={{ border: 0, borderRadius: 999, padding: '6px 12px', fontSize: 11, fontWeight: 800, cursor: 'pointer', background: mode === v ? (v === 'live' ? '#0F766E' : '#F59E0B') : 'transparent', color: mode === v ? '#fff' : '#64748B' }}>{label}</button>
      ))}
    </div>
  )
}
