import { useEffect, useRef } from 'react'

// B2 — lightweight animated fire front (canvas 2D, NOT a three.js particle
// system by design: ~300 sprites, GPU-cheap, mobile-safe).
// Particles spawn on the 1h ring and travel radially to the 6h ring over a
// loop, drifting downwind — schematic motion, labeled as such.
// Auto-off: prefers-reduced-motion, <=4 CPU cores, or narrow screens.
// Manual toggle always available. Pauses when tab hidden.
// IMPROVED: gradient colors by progress, tapered tails, screen-space sizing.

export function frontSupported() {
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
    if ((navigator as any).hardwareConcurrency && (navigator as any).hardwareConcurrency <= 4) return false
    if (window.innerWidth < 640) return false
    return true
  } catch { return true }
}

// Color gradient: red (current/start) → orange → yellow (leading edge)
function fireColor(progress: number): string {
  // progress: 0 at ring1 (1h), 1 at ringN (6h+)
  if (progress < 0.3) {
    // Red to orange
    const t = progress / 0.3
    const r = 220
    const g = Math.round(38 + 77 * t)
    const b = 38
    return `rgb(${r}, ${g}, ${b})`
  } else if (progress < 0.7) {
    // Orange to amber/yellow
    const t = (progress - 0.3) / 0.4
    const r = 249
    const g = Math.round(115 + 119 * t)
    const b = Math.round(22 - 22 * t)
    return `rgb(${r}, ${g}, ${b})`
  } else {
    // Yellow to pale (fading)
    const t = (progress - 0.7) / 0.3
    const r = 255
    const g = Math.round(234 - 50 * t)
    const b = Math.round(0 + 20 * t)
    const alpha = Math.max(0.15, 1 - t * 0.7)
    return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(2)})`
  }
}

export default function FireFrontCanvas({ map, steps, on }: {
  map: any; steps: any[]; on: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = ref.current
    if (!cv || !map || !on || !steps?.length) return
    const parent = cv.parentElement
    if (!parent) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    
    const ring1 = steps.find((s: any) => s.hour === 1.0)?.polygon?.coordinates?.[0]
      || steps[0]?.polygon?.coordinates?.[0]
    const ringN = steps[steps.length - 1]?.polygon?.coordinates?.[0]
    if (!ring1 || !ringN) return
    
    let w = 0, h = 0
    const resize = () => {
      const r = parent.getBoundingClientRect()
      w = cv.width = Math.max(1, Math.floor(r.width * window.devicePixelRatio))
      h = cv.height = Math.max(1, Math.floor(r.height * window.devicePixelRatio))
      cv.style.width = r.width + 'px'
      cv.style.height = r.height + 'px'
      ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(parent)
    
    type Particle = { 
      angle: number;      // angular position around fire perimeter
      progress: number;   // 0=ring1, 1=ringN
      speed: number;      // progress per second
      size: number;       // base size in screen pixels
      seed: number;       // random seed for flicker
      tailLength: number; // visual tail length
    }
    const N = 200
    const ps: Particle[] = Array.from({ length: N }, (_, i) => ({
      angle: (i / N) * Math.PI * 2 + Math.random() * 0.1,
      progress: Math.random(),
      speed: 0.15 + Math.random() * 0.25,
      size: 2.5 + Math.random() * 3.5,
      seed: Math.random() * 10,
      tailLength: 0.05 + Math.random() * 0.15
    }))
    
    // Interpolate point on ring by fractional index
    const at = (ring: any[], frac: number) => {
      const idx = frac * (ring.length - 1)
      const i = Math.floor(idx) % (ring.length - 1)
      const f = idx - Math.floor(idx)
      const A = ring[i], B = ring[(i + 1) % (ring.length - 1)]
      return [A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f]
    }
    
    let raf = 0, last = performance.now(), dead = false
    const frame = (t: number) => {
      if (dead) return
      raf = requestAnimationFrame(frame)
      if (document.hidden) { last = t; return }
      const dt = Math.min(0.05, (t - last) / 1000)
      last = t
      
      const cssW = parent.getBoundingClientRect().width
      const cssH = parent.getBoundingClientRect().height
      ctx.clearRect(0, 0, cssW, cssH)
      
      for (const q of ps) {
        q.progress += q.speed * dt
        if (q.progress > 1) q.progress -= 1
        
        // Angular position with slight drift (wind effect)
        const frac = ((q.angle / (Math.PI * 2)) + q.progress * 0.02) % 1
        const [x1, y1] = at(ring1, frac)
        const [x2, y2] = at(ringN, frac)
        const lo = x1 + (x2 - x1) * q.progress
        const la = y1 + (y2 - y1) * q.progress
        
        let s: any = null
        try { s = map.project([lo, la]) } catch { continue }
        if (s.x < -20 || s.y < -20 || s.x > cssW + 20 || s.y > cssH + 20) continue
        
        // Flicker based on progress (more intense at leading edge)
        const flicker = 0.7 + 0.3 * Math.sin(t / 100 + q.seed * 5 + q.progress * 8)
        
        // Draw tapered tail (trail behind particle)
        const tailSteps = 6
        for (let ti = tailSteps; ti >= 1; ti--) {
          const tailProgress = q.progress - q.tailLength * ti / tailSteps
          if (tailProgress < 0) continue
          const [tx1, ty1] = at(ring1, frac)
          const [tx2, ty2] = at(ringN, frac)
          const tlo = tx1 + (tx2 - tx1) * tailProgress
          const tla = ty1 + (ty2 - ty1) * tailProgress
          let ts: any = null
          try { ts = map.project([tlo, tla]) } catch { continue }
          const tailAlpha = (1 - ti / tailSteps) * 0.4 * flicker
          const tailSize = q.size * (0.5 + 0.5 * tailProgress)
          ctx.beginPath()
          ctx.fillStyle = fireColor(tailProgress).replace(/rgba?\(([^)]+)\)/, (_, rgb) => `rgba(${rgb}, ${tailAlpha.toFixed(2)})`)
          ctx.arc(ts.x, ts.y, tailSize * (1 - ti / (tailSteps * 1.5)), 0, Math.PI * 2)
          ctx.fill()
        }
        
        // Main particle
        const alpha = (0.6 + 0.4 * q.progress) * flicker
        const color = fireColor(q.progress)
        ctx.beginPath()
        ctx.fillStyle = color.replace(/rgba?\(([^)]+)\)/, (_, rgb) => `rgba(${rgb}, ${alpha.toFixed(2)})`)
        // Elongated shape in direction of travel
        const travelAngle = Math.atan2(y2 - y1, x2 - x1)
        const size = q.size * (0.8 + 0.6 * q.progress)
        ctx.ellipse(s.x, s.y, size * 1.3, size * 0.7, travelAngle, 0, Math.PI * 2)
        ctx.fill()
        
        // Bright core for leading edge particles
        if (q.progress > 0.6) {
          ctx.beginPath()
          ctx.fillStyle = `rgba(255, 255, 200, ${(0.4 + 0.3 * flicker) * (q.progress - 0.6) * 2.5})`
          ctx.arc(s.x, s.y, size * 0.5, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    }
    raf = requestAnimationFrame(frame)
    return () => { dead = true; cancelAnimationFrame(raf); ro.disconnect(); ctx.clearRect(0, 0, w, h) }
  }, [map, steps, on])
  if (!on) return null
  return <canvas ref={ref} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 5 }} aria-hidden />
}