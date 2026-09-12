import { useEffect, useRef } from 'react'

// B2 — lightweight animated fire front (canvas 2D, NOT a three.js particle
// system by design: ~300 sprites, GPU-cheap, mobile-safe).
// Particles spawn on the 1h ring and travel radially to the 6h ring over a
// loop, drifting downwind — schematic motion, labeled as such.
// Auto-off: prefers-reduced-motion, <=4 CPU cores, or narrow screens.
// Manual toggle always available. Pauses when tab hidden.

export function frontSupported(){
  try{
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
    if((navigator as any).hardwareConcurrency && (navigator as any).hardwareConcurrency <= 4) return false
    if(window.innerWidth < 640) return false
    return true
  }catch{ return true }
}

export default function FireFrontCanvas({ map, steps, on }: {
  map: any; steps: any[]; on: boolean;
}){
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(()=>{
    const cv = ref.current
    if(!cv || !map || !on || !steps?.length) return
    const parent = cv.parentElement
    if(!parent) return
    const ctx = cv.getContext('2d')
    if(!ctx) return
    const ring1 = steps.find((s: any)=> s.hour === 1.0)?.polygon?.coordinates?.[0]
      || steps[0]?.polygon?.coordinates?.[0]
    const ringN = steps[steps.length - 1]?.polygon?.coordinates?.[0]
    if(!ring1 || !ringN) return
    let w = 0, h = 0
    const resize = ()=>{
      const r = parent.getBoundingClientRect()
      w = cv.width = Math.max(1, Math.floor(r.width))
      h = cv.height = Math.max(1, Math.floor(r.height))
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(parent)
    type P = { a: number; p: number; sp: number; sz: number; seed: number }
    const N = 260
    const ps: P[] = Array.from({ length: N }, (_, i)=> ({
      a: (i / N) * Math.PI * 2 + Math.random() * 0.1,
      p: Math.random(), sp: 0.12 + Math.random() * 0.22,
      sz: 1.5 + Math.random() * 3, seed: Math.random() * 10,
    }))
    const at = (ring: any[], frac: number)=>{
      const i = Math.floor(frac * (ring.length - 1)) % (ring.length - 1)
      const f = frac * (ring.length - 1) - Math.floor(frac * (ring.length - 1))
      const A = ring[i], B = ring[(i + 1) % ring.length]
      return [A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f]
    }
    let raf = 0, last = performance.now(), dead = false
    const frame = (t: number)=>{
      if(dead) return
      raf = requestAnimationFrame(frame)
      if(document.hidden) { last = t; return }
      const dt = Math.min(0.05, (t - last) / 1000)
      last = t
      ctx.clearRect(0, 0, w, h)
      for(const q of ps){
        q.p += q.sp * dt
        if(q.p > 1) q.p -= 1
        const frac = ((q.a / (Math.PI * 2)) + 1) % 1
        const [x1, y1] = at(ring1, frac)
        const [x2, y2] = at(ringN, frac)
        const lo = x1 + (x2 - x1) * q.p, la = y1 + (y2 - y1) * q.p
        let s: any = null
        try{ s = map.project([lo, la]) }catch{ continue }
        if(s.x < -20 || s.y < -20 || s.x > w + 20 || s.y > h + 20) continue
        const flick = 0.6 + 0.4 * Math.sin(t / 130 + q.seed * 6)
        const alpha = (1 - q.p) * 0.85 * flick + 0.1
        ctx.beginPath()
        ctx.fillStyle = q.p < 0.5 ? `rgba(249,115,22,${alpha.toFixed(2)})` : `rgba(220,38,38,${alpha.toFixed(2)})`
        ctx.arc(s.x, s.y, q.sz * (1 + q.p), 0, Math.PI * 2)
        ctx.fill()
      }
    }
    raf = requestAnimationFrame(frame)
    return ()=>{ dead = true; cancelAnimationFrame(raf); ro.disconnect(); ctx.clearRect(0, 0, w, h) }
  }, [map, steps, on])
  if(!on) return null
  return <canvas ref={ref} style={{position:'absolute', inset:0, width:'100%', height:'100%', pointerEvents:'none', zIndex:5}} aria-hidden />
}
