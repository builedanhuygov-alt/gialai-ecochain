import * as THREE from 'three'
import { BAND_COLORS_3D, isCanopyPixel, STEP_COLORS_3D, toLocal } from './twinMath'

// Dynamic TwinScene layers (M3–M10). Rebuilt on sim change; canopy rebuilds
// only when the ignition moves (imagery sampling is the expensive part).

type Ctx = any

function textSprite(text: string, bg = 'rgba(11,20,18,0.9)'){
  const cv = document.createElement('canvas')
  const ctx = cv.getContext('2d')!
  ctx.font = 'bold 42px sans-serif'
  const w = Math.ceil(ctx.measureText(text).width) + 40
  cv.width = w; cv.height = 64
  const c2 = cv.getContext('2d')!
  c2.fillStyle = bg
  c2.beginPath(); c2.roundRect(0, 0, w, 64, 14); c2.fill()
  c2.font = 'bold 42px sans-serif'; c2.fillStyle = '#fff'
  c2.fillText(text, 20, 46)
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }))
  sp.scale.set(w * 1.6, 64 * 1.6, 1)
  return sp
}

export function updateDynamic(c: Ctx, sim: any, waters: any[], opsAssets: any[],
  communeFc: any, show: any){
  const old = c.scene.getObjectByName('twin-dyn')
  if(old){
    c.scene.remove(old)
    old.traverse((o: any)=>{
      try{
        o.geometry?.dispose?.()
        const m = o.material
        if(Array.isArray(m)) m.forEach((x: any)=> { x.map?.dispose?.(); x.dispose?.() })
        else { m?.map?.dispose?.(); m?.dispose?.() }
      }catch{}
    })
  }
  c.updaters.length = 0
  const g = new THREE.Group()
  g.name = 'twin-dyn'
  const L = (lon: number, lat: number)=>{
    const p = toLocal(lon, lat, c.origin)
    return { x: p.x, z: p.z }
  };
  void L
  const H = c.sampler
  const P = (lon: number, lat: number, lift = 0)=>{
    const p = toLocal(lon, lat, c.origin)
    return new THREE.Vector3(p.x, H(p.x, p.z) + lift, p.z)
  }

  // M4 — fire ellipses draped on terrain (current + 1/3/6h)
  if(show.ellipses){
    const steps = [{ hour: 0, polygon: null }, ...(sim.spread?.steps || [])]
    steps.forEach((s: any, idx: number)=>{
      let shape: THREE.Shape
      if(!s.polygon){
        shape = new THREE.Shape()
        shape.absarc(0, 0, 60, 0, Math.PI * 2)
        var pts: number[][] | null = null
      } else {
        const ring = s.polygon.coordinates[0]
        shape = new THREE.Shape()
        ring.forEach((p: number[], i: number)=>{
          const q = toLocal(p[0], p[1], c.origin)
          if(i === 0) shape.moveTo(q.x, -q.z)
          else shape.lineTo(q.x, -q.z)
        })
        var pts2: number[][] | null = ring
        pts = pts2
      }
      void pts
      const geo = new THREE.ShapeGeometry(shape)
      // drape: shape XY → world XZ, y from sampler
      const pp = geo.attributes.position
      for(let k = 0; k < pp.count; k++){
        const x = pp.getX(k), z = -pp.getY(k)
        pp.setXYZ(k, x, H(x, z) + 10 + idx * 4, z)
      }
      geo.computeVertexNormals()
      const color = STEP_COLORS_3D[s.hour] || '#F97316'
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: s.hour === 0 ? 0.75 : 0.42,
        side: THREE.DoubleSide, depthWrite: false }))
      g.add(mesh)
    })
  }

  // threat lookup by id (M7)
  const bandOf = new Map<string, string>()
  for(const t of [...(sim.operational_threats || []), ...(sim.water_threats || [])])
    if(t?.id) bandOf.set(t.id, t.band)

  // M7 — assets: water spheres / station boxes / tower cylinders, band colors
  if(show.assets){
    const byId = new Map(opsAssets.map((a: any)=> [a.id, a]))
    const items: Array<{ kind: string; x: number; y: number; z: number; color: string; name: string }> = []
    for(const w of waters){
      if(typeof w.longitude !== 'number') continue
      const p = toLocal(w.longitude, w.latitude, c.origin)
      if(Math.abs(p.x) > c.sizeM / 2 || Math.abs(p.z) > c.sizeM / 2) continue
      const b = bandOf.get(w.id) || 'SAFE'
      items.push({ kind: 'water', x: p.x, y: H(p.x, p.z), z: p.z, color: BAND_COLORS_3D[b], name: w.name })
    }
    for(const a of opsAssets){
      if(!['station', 'team', 'watchtower'].includes(a.asset_type)) continue
      if(typeof a.longitude !== 'number') continue
      const p = toLocal(a.longitude, a.latitude, c.origin)
      if(Math.abs(p.x) > c.sizeM / 2 || Math.abs(p.z) > c.sizeM / 2) continue
      const b = bandOf.get(a.id) || 'SAFE'
      items.push({ kind: a.asset_type, x: p.x, y: H(p.x, p.z), z: p.z, color: BAND_COLORS_3D[b], name: a.name })
    }
    void byId
    const mk = (geo: THREE.BufferGeometry, list: typeof items)=>{
      if(!list.length) return
      const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.6 }), list.length)
      const m4 = new THREE.Matrix4(), col = new THREE.Color()
      list.forEach((it, i)=>{
        m4.makeTranslation(it.x, it.y + 25, it.z)
        im.setMatrixAt(i, m4)
        im.setColorAt(i, col.set(it.color))
      })
      im.instanceMatrix.needsUpdate = true
      if(im.instanceColor) im.instanceColor.needsUpdate = true
      g.add(im)
    }
    mk(new THREE.SphereGeometry(22, 12, 10), items.filter(i=> i.kind === 'water'))
    mk(new THREE.BoxGeometry(34, 50, 34), items.filter(i=> i.kind === 'station' || i.kind === 'team'))
    mk(new THREE.CylinderGeometry(10, 14, 90, 8), items.filter(i=> i.kind === 'watchtower'))
  }

  // M7 routes + M8 impact colors (Line, band color, draped)
  if(show.routes){
    for(const r of (sim.routes || [])){
      const src = opsAssets.find((a: any)=> a.id === r.id)
      const geom = src?.geometry
      if(!geom) continue
      const lines = geom.type === 'LineString' ? [geom.coordinates] : (geom.coordinates || [])
      for(const line of lines){
        const v3 = line.map((p: number[])=>{
          const q = toLocal(p[0], p[1], c.origin)
          return new THREE.Vector3(q.x, H(q.x, q.z) + 8, q.z)
        })
        const lg = new THREE.BufferGeometry().setFromPoints(v3)
        g.add(new THREE.Line(lg, new THREE.LineBasicMaterial({ color: r.color || '#3B82F6' })))
      }
    }
  }

  // M7 communities — real boundaries, band fills, draped per-vertex
  if(show.communities && communeFc?.features){
    const bandByMa: Record<string, string> = {}
    for(const cm of (sim.communities || []))
      bandByMa[String(cm.code || '').replace(/^GL-/, '')] = cm.color
    for(const f of (communeFc.features as any[])){
      const color = bandByMa[String(f.properties?.ma_xa)]
      if(!color) continue
      const polys = f.geometry?.type === 'Polygon' ? [f.geometry.coordinates]
        : (f.geometry?.type === 'MultiPolygon' ? f.geometry.coordinates.flat() : [])
      for(const poly of polys){
        const ring = poly[0]
        if(!ring?.length) continue
        const shape = new THREE.Shape()
        ring.forEach((p: number[], i: number)=>{
          const q = toLocal(p[0], p[1], c.origin)
          if(i === 0) shape.moveTo(q.x, -q.z)
          else shape.lineTo(q.x, -q.z)
        })
        const geo = new THREE.ShapeGeometry(shape)
        const pp = geo.attributes.position
        for(let k = 0; k < pp.count; k++){
          const x = pp.getX(k), z = -pp.getY(k)
          pp.setXYZ(k, x, H(x, z) + 6, z)
        }
        g.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
          color, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false })))
      }
    }
  }

  // M9 — water access lines + ETA sprites (top-2 AVAILABLE by distance)
  if(show.water){
    const sorted = [...(sim.waters || [])].sort((a: any, b: any)=> a.distance_km - b.distance_km)
    const avail = sorted.filter((w: any)=> w.current?.availability === 'AVAILABLE')
    const picks = (avail.length ? avail : sorted).slice(0, 2)
    const o = P(sim.ignition.lon, sim.ignition.lat, 30)
    picks.forEach((w: any, i: number)=>{
      const wFull = waters.find((x: any)=> x.id === w.id)
      if(!wFull || typeof wFull.longitude !== 'number') return
      const d = P(wFull.longitude, wFull.latitude, 30)
      const lg = new THREE.BufferGeometry().setFromPoints([o, d])
      g.add(new THREE.Line(lg, new THREE.LineDashedMaterial({
        color: i === 0 ? '#2563EB' : '#64748B', dashSize: 40, gapSize: 25 })))
      ;(g.children[g.children.length - 1] as THREE.Line).computeLineDistances()
      const sp = textSprite(`${w.name} · ${w.current.travel_minutes}′`)
      sp.position.copy(o).lerp(d, 0.5)
      sp.position.y += 120
      g.add(sp)
    })
  }

  // M6 — 3D wind arrows (grid, length ∝ speed, animated bob)
  if(show.wind && sim.wind_layer){
    const dir = (sim.wind_layer.direction_deg * Math.PI) / 180
    const sp = sim.wind_layer.speed_kmh || 0
    const R = c.sizeM / 2 * 0.7
    const arrows: THREE.ArrowHelper[] = []
    for(let gx = -2; gx <= 2; gx++) for(let gz = -2; gz <= 2; gz++){
      const x = gx * R / 2.5, z = gz * R / 2.5
      const len = 60 + sp * 5
      const ah = new THREE.ArrowHelper(
        new THREE.Vector3(Math.sin(dir), 0, -Math.cos(dir)),
        new THREE.Vector3(x, H(x, z) + 260, z),
        len, 0x0EA5E9, len * 0.25, len * 0.12)
      arrows.push(ah)
      g.add(ah)
    }
    const bases = arrows.map(a=> a.position.y)
    c.updaters.push((t: number)=>{
      arrows.forEach((a, i)=> { a.position.y = bases[i] + Math.sin(t * 2 + i) * 12 })
    })
  }

  // M5 — THREE.Points fire front (ring1 → ringN loop, wind drift inherent)
  if(show.front && sim.spread?.steps?.length){
    const ring1 = sim.spread.steps[0].polygon.coordinates[0]
    const ringN = sim.spread.steps[sim.spread.steps.length - 1].polygon.coordinates[0]
    const NPT = c.quality === 'high' ? 1500 : 400
    const positions = new Float32Array(NPT * 3)
    const colors = new Float32Array(NPT * 3)
    const seeds = new Float32Array(NPT * 3) // angle frac, progress, speed
    for(let i = 0; i < NPT; i++){
      seeds[i * 3] = Math.random()
      seeds[i * 3 + 1] = Math.random()
      seeds[i * 3 + 2] = 0.1 + Math.random() * 0.25
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    const mat = new THREE.PointsMaterial({ size: 14, vertexColors: true, transparent: true,
      opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true })
    const pts = new THREE.Points(geo, mat)
    pts.frustumCulled = false
    g.add(pts)
    const at = (ring: number[][], f: number)=>{
      const idx = Math.min(ring.length - 2, Math.floor(f * (ring.length - 1)))
      const fr = f * (ring.length - 1) - idx
      const A = ring[idx], B = ring[idx + 1]
      return [A[0] + (B[0] - A[0]) * fr, A[1] + (B[1] - A[1]) * fr]
    }
    const cO = new THREE.Color('#F97316'), cR = new THREE.Color('#DC2626')
    c.updaters.push((_t: number, dt: number)=>{
      for(let i = 0; i < NPT; i++){
        let p = seeds[i * 3 + 1] + seeds[i * 3 + 2] * dt
        if(p > 1) p -= 1
        seeds[i * 3 + 1] = p
        const f = seeds[i * 3]
        const [x1, y1] = at(ring1, f), [x2, y2] = at(ringN, f)
        const lo = x1 + (x2 - x1) * p, la = y1 + (y2 - y1) * p
        const q = toLocal(lo, la, c.origin)
        positions[i * 3] = q.x
        positions[i * 3 + 1] = H(q.x, q.z) + 12
        positions[i * 3 + 2] = q.z
        const cc = p < 0.5 ? cO : cR
        colors[i * 3] = cc.r; colors[i * 3 + 1] = cc.g; colors[i * 3 + 2] = cc.b
      }
      geo.attributes.position.needsUpdate = true
      geo.attributes.color.needsUpdate = true
    })
  }

  c.scene.add(g)
}

// M3 canopy rebuild — imagery sampling is expensive, only on ignition move.
export function canopyKey(sim: any){
  return `${sim?.ignition?.lon},${sim?.ignition?.lat}`
}

export async function buildCanopy(c: Ctx, sim: any, texCanvas: HTMLCanvasElement | null,
  block: { w: number; n: number; e: number; s: number } | null, show: boolean){
  void sim
  if(!show || !texCanvas || !block) return
  const S = texCanvas.width
  const tctx = texCanvas.getContext('2d', { willReadFrequently: true })!
  const px = tctx.getImageData(0, 0, S, S).data
  const cap = c.quality === 'high' ? 2500 : 800
  const step = Math.max(1, Math.floor(S / 160))
  const mats: number[] = []
  const dummy = { x: 0, z: 0 }
  for(let py = 0; py < S && mats.length / 3 < cap; py += step){
    for(let pxI = 0; pxI < S && mats.length / 3 < cap; pxI += step){
      const o = (py * S + pxI) * 4
      if(!isCanopyPixel(px[o], px[o + 1], px[o + 2])) continue
      const lon = block.w + ((pxI / (S - 1)) * (block.e - block.w))
      const lat = block.n - ((py / (S - 1)) * (block.n - block.s))
      const q = toLocal(lon, lat, c.origin)
      if(Math.abs(q.x) > c.sizeM / 2 || Math.abs(q.z) > c.sizeM / 2) continue
      dummy.x = q.x; dummy.z = q.z
      mats.push(q.x, c.sampler(q.x, q.z), q.z)
    }
  }
  if(!mats.length) return
  const old = c.scene.getObjectByName('twin-canopy')
  if(old){
    c.scene.remove(old)
    try{ (old as any).geometry?.dispose?.(); (old as any).material?.dispose?.() }catch{}
  }
  const geo = new THREE.ConeGeometry(9, 26, 5)
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.9 })
  const im = new THREE.InstancedMesh(geo, mat, mats.length / 3)
  const m4 = new THREE.Matrix4()
  const col = new THREE.Color()
  for(let i = 0; i < mats.length / 3; i++){
    m4.makeTranslation(mats[i * 3], mats[i * 3 + 1] + 13, mats[i * 3 + 2])
    im.setMatrixAt(i, m4)
    im.setColorAt(i, col.setHSL(0.29 + Math.random() * 0.06, 0.45, 0.28 + Math.random() * 0.12))
  }
  im.instanceMatrix.needsUpdate = true
  if(im.instanceColor) im.instanceColor.needsUpdate = true
  im.castShadow = c.quality === 'high'
  im.name = 'twin-canopy'
  c.scene.add(im)
}
