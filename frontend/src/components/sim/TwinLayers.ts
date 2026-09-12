import * as THREE from 'three'
import { BAND_COLORS_3D, lonLatToTile, STEP_COLORS_3D, terrariumToHeight,
  tileToLonLat, toLocal } from './twinMath'
import { isCanopyPixel } from './twinMath'

// Part C — named Three.js layer builders. React owns lifecycle (TwinScene
// mounts/disposes); these functions own pixels. updateDynamic orchestrates.
// Every layer reads the SAME /api/simulate/fire payload as the 2D view.

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

function loadImage(url: string): Promise<HTMLImageElement>{
  return new Promise((res, rej)=>{
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = ()=> res(img)
    img.onerror = ()=> rej(new Error('tile failed: ' + url))
    img.src = url
  })
}

const ESRI = (z: number, x: number, y: number)=>
  `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`
const TERRA = (z: number, x: number, y: number)=>
  `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`

function drawTiles(imgs: HTMLImageElement[][], S: number){
  const cv = document.createElement('canvas')
  cv.width = cv.height = S
  const ctx = cv.getContext('2d', { willReadFrequently: true })!
  const n = imgs.length, cell = S / n
  for(let ty = 0; ty < n; ty++) for(let tx = 0; tx < n; tx++)
    ctx.drawImage(imgs[ty][tx], tx * cell, ty * cell, cell, cell)
  return { canvas: cv, ctx }
}

function slopeAtGrid(H: Float32Array, n: number, i: number, j: number, cell: number){
  const xm = H[j * n + Math.max(0, i - 1)], xp = H[j * n + Math.min(n - 1, i + 1)]
  const ym = H[Math.max(0, j - 1) * n + i], yp = H[Math.min(n - 1, j + 1) * n + i]
  const dx = (xp - xm) / (2 * cell), dy = (yp - ym) / (2 * cell)
  return Math.sqrt(dx * dx + dy * dy)
}

// <TerrainMesh /> — real DEM mesh (M2), never a flat plane. Throws honestly
// when tiles are unreachable so the UI can fall back to 2D.
export async function TerrainMesh(origin: { lon: number; lat: number }, quality: 'high' | 'low'){
  const Z = 14
  const t0 = lonLatToTile(origin.lon, origin.lat, Z)
  const bx = t0.x % 2 === 0 ? t0.x : t0.x - 1
  const by = t0.y % 2 === 0 ? t0.y : t0.y - 1
  let demImgs: HTMLImageElement[][]
  let texImgs: HTMLImageElement[][]
  try{
    demImgs = [[await loadImage(TERRA(Z, bx, by)), await loadImage(TERRA(Z, bx + 1, by))],
               [await loadImage(TERRA(Z, bx, by + 1)), await loadImage(TERRA(Z, bx + 1, by + 1))]]
    texImgs = [[await loadImage(ESRI(Z, bx, by)), await loadImage(ESRI(Z, bx + 1, by))],
               [await loadImage(ESRI(Z, bx, by + 1)), await loadImage(ESRI(Z, bx + 1, by + 1))]]
  }catch{
    const s13 = lonLatToTile(origin.lon, origin.lat, 13)
    demImgs = [[await loadImage(TERRA(13, s13.x, s13.y))]]
    texImgs = [[await loadImage(ESRI(13, s13.x, s13.y))]]
  }
  const S = 512
  const dem = drawTiles(demImgs, S)
  const tex = drawTiles(texImgs, S)
  const demPx = dem.ctx.getImageData(0, 0, S, S).data
  const n2 = demImgs.length
  let block: { w: number; n: number; e: number; s: number }
  if(n2 === 2){
    const tl = tileToLonLat(bx, by, Z), br = tileToLonLat(bx + 2, by + 2, Z)
    block = { w: tl.lon, n: tl.lat, e: br.lon, s: br.lat }
  } else {
    const s13 = lonLatToTile(origin.lon, origin.lat, 13)
    const tl = tileToLonLat(s13.x, s13.y, 13), br = tileToLonLat(s13.x + 1, s13.y + 1, 13)
    block = { w: tl.lon, n: tl.lat, e: br.lon, s: br.lat }
  }
  const sizeM = Math.max(
    (block.e - block.w) * 111320 * Math.cos(origin.lat * Math.PI / 180),
    (block.n - block.s) * 110540)
  const N = quality === 'high' ? 129 : 65
  const EXAG = 1.5 // labeled in UI
  const Hgrid = new Float32Array(N * N)
  let minH = Infinity
  const pxOf = (lon: number, lat: number)=> ({
    px: Math.min(S - 1, Math.max(0, Math.round(((lon - block.w) / (block.e - block.w)) * (S - 1)))),
    py: Math.min(S - 1, Math.max(0, Math.round(((block.n - lat) / (block.n - block.s)) * (S - 1)))),
  })
  for(let j = 0; j < N; j++) for(let i = 0; i < N; i++){
    const lon = block.w + ((i / (N - 1)) * (block.e - block.w))
    const lat = block.n - ((j / (N - 1)) * (block.n - block.s))
    const { px, py } = pxOf(lon, lat)
    const o = (py * S + px) * 4
    const h = terrariumToHeight(demPx[o], demPx[o + 1], demPx[o + 2])
    Hgrid[j * N + i] = h
    if(h < minH) minH = h
  }
  if(!isFinite(minH)) throw new Error('DEM rỗng — không dựng địa hình giả')
  const cell = sizeM / (N - 1)
  const sampler = (x: number, z: number)=>{
    const gx = Math.min(N - 1.001, Math.max(0, (x / sizeM + 0.5) * (N - 1)))
    const gz = Math.min(N - 1.001, Math.max(0, (z / sizeM + 0.5) * (N - 1)))
    const i = Math.floor(gx), j = Math.floor(gz), fx = gx - i, fz = gz - j
    const a = Hgrid[j * N + i], b = Hgrid[j * N + i + 1]
    const cc = Hgrid[(j + 1) * N + i], d = Hgrid[(j + 1) * N + i + 1]
    return ((a * (1 - fx) + b * fx) * (1 - fz) + (cc * (1 - fx) + d * fx) * fz - minH) * EXAG
  }
  const tg = new THREE.PlaneGeometry(sizeM, sizeM, N - 1, N - 1)
  tg.rotateX(-Math.PI / 2)
  const pos = tg.attributes.position
  const colors = new Float32Array(pos.count * 3)
  const cA = new THREE.Color(0x8a9a5b), cB = new THREE.Color(0x5b6e46), cC = new THREE.Color(0x9c8a6d)
  const tmpC = new THREE.Color()
  let maxSlope = 0.001
  const slopes = new Float32Array(pos.count)
  for(let k = 0; k < pos.count; k++){
    const x = pos.getX(k), z = pos.getZ(k)
    pos.setY(k, sampler(x, z))
    const gx = Math.min(N - 1, Math.max(0, Math.round((x / sizeM + 0.5) * (N - 1))))
    const gz = Math.min(N - 1, Math.max(0, Math.round((z / sizeM + 0.5) * (N - 1))))
    const sl = slopeAtGrid(Hgrid, N, gx, gz, cell)
    slopes[k] = sl
    if(sl > maxSlope) maxSlope = sl
  }
  for(let k = 0; k < pos.count; k++){
    const t = Math.min(1, slopes[k] / maxSlope)
    tmpC.copy(cA).lerp(t > 0.5 ? cC : cB, t > 0.5 ? (t - 0.5) * 2 : t * 2)
    colors[k * 3] = tmpC.r; colors[k * 3 + 1] = tmpC.g; colors[k * 3 + 2] = tmpC.b
  }
  tg.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  tg.computeVertexNormals()
  const tex3 = new THREE.CanvasTexture(tex.canvas)
  tex3.colorSpace = THREE.SRGBColorSpace
  const mesh = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ map: tex3, vertexColors: true, roughness: 1 }))
  mesh.receiveShadow = quality === 'high'
  return { mesh, sampler, origin, sizeM, texCanvas: tex.canvas, block,
           grid: { H: Hgrid, n: N, cell, sizeM } }
}

// <FireEllipseMesh /> — M4 server ellipses draped on terrain.
export function FireEllipseMesh(g: THREE.Group, c: Ctx, sim: any){
  const H = c.sampler
  const steps = [{ hour: 0, polygon: null }, ...(sim.spread?.steps || [])]
  steps.forEach((s: any, idx: number)=>{
    const shape = new THREE.Shape()
    if(!s.polygon){
      shape.absarc(0, 0, 60, 0, Math.PI * 2)
    } else {
      const ring = s.polygon.coordinates[0]
      ring.forEach((p: number[], i: number)=>{
        const q = toLocal(p[0], p[1], c.origin)
        if(i === 0) shape.moveTo(q.x, -q.z)
        else shape.lineTo(q.x, -q.z)
      })
    }
    const geo = new THREE.ShapeGeometry(shape)
    const pp = geo.attributes.position
    for(let k = 0; k < pp.count; k++){
      const x = pp.getX(k), z = -pp.getY(k)
      pp.setXYZ(k, x, H(x, z) + 10 + idx * 4, z)
    }
    geo.computeVertexNormals()
    const color = STEP_COLORS_3D[s.hour] || '#F97316'
    g.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: s.hour === 0 ? 0.75 : 0.42,
      side: THREE.DoubleSide, depthWrite: false })))
  })
}

// <ThreatenedAssetLayer /> — M7 water spheres / station boxes / tower cylinders.
export function ThreatenedAssetLayer(g: THREE.Group, c: Ctx, sim: any,
  waters: any[], opsAssets: any[]){
  const H = c.sampler
  const bandOf = new Map<string, string>()
  for(const t of [...(sim.operational_threats || []), ...(sim.water_threats || [])])
    if(t?.id) bandOf.set(t.id, t.band)
  const items: Array<{ kind: string; x: number; y: number; z: number; color: string }> = []
  for(const w of waters){
    if(typeof w.longitude !== 'number') continue
    const p = toLocal(w.longitude, w.latitude, c.origin)
    if(Math.abs(p.x) > c.sizeM / 2 || Math.abs(p.z) > c.sizeM / 2) continue
    const b = bandOf.get(w.id) || 'SAFE'
    items.push({ kind: 'water', x: p.x, y: H(p.x, p.z), z: p.z, color: BAND_COLORS_3D[b] })
  }
  for(const a of opsAssets){
    if(!['station', 'team', 'watchtower'].includes(a.asset_type)) continue
    if(typeof a.longitude !== 'number') continue
    const p = toLocal(a.longitude, a.latitude, c.origin)
    if(Math.abs(p.x) > c.sizeM / 2 || Math.abs(p.z) > c.sizeM / 2) continue
    const b = bandOf.get(a.id) || 'SAFE'
    items.push({ kind: a.asset_type, x: p.x, y: H(p.x, p.z), z: p.z, color: BAND_COLORS_3D[b] })
  }
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

// <RouteImpactLayer /> — M8 band-colored draped lines.
export function RouteImpactLayer(g: THREE.Group, c: Ctx, sim: any, opsAssets: any[]){
  const H = c.sampler
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

// <CommunityImpactLayer /> — M7 real-boundary band fills, draped per-vertex.
export function CommunityImpactLayer(g: THREE.Group, c: Ctx, sim: any, communeFc: any){
  if(!communeFc?.features) return
  const H = c.sampler
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

// <TerrainAnalysisLayer /> — M5 slope zones + ridge/valley (ESTIMATED).
// Reads the real DEM grid stored on ctx by TwinScene. Ridges = local maxima,
// valleys = local minima (8-neighbourhood + prominence gate) — labeled
// estimated, never surveyed ridgelines. Returns stats for the panel.
export function TerrainAnalysisLayer(g: THREE.Group, c: Ctx){
  const grid = (c as any)._grid as { H: Float32Array; n: number; cell: number; sizeM: number } | undefined
  if(!grid) return null
  const { H, n, cell, sizeM } = grid
  const Hh = c.sampler
  let sum = 0, sum2 = 0, mx = 0, steep = 0, cnt = 0
  const ridge: number[] = [], valley: number[] = []
  const at = (i: number, j: number)=> H[j * n + i]
  for(let j = 1; j < n - 1; j += 2) for(let i = 1; i < n - 1; i += 2){
    const h = at(i, j)
    let isMax = true, isMin = true
    for(let dj = -1; dj <= 1; dj++) for(let di = -1; di <= 1; di++){
      if(!di && !dj) continue
      const o = at(i + di, j + dj)
      if(o >= h - 0.5) isMax = false
      if(o <= h + 0.5) isMin = false
    }
    const x = (i / (n - 1) - 0.5) * sizeM, z = (j / (n - 1) - 0.5) * sizeM
    const dx = (at(Math.min(n - 1, i + 1), j) - at(Math.max(0, i - 1), j)) / (2 * cell)
    const dy = (at(i, Math.min(n - 1, j + 1)) - at(i, Math.max(0, j - 1))) / (2 * cell)
    const sl = Math.sqrt(dx * dx + dy * dy)
    const deg = Math.atan(sl) * 180 / Math.PI
    sum += deg; sum2 += deg * deg; mx = Math.max(mx, deg); cnt++
    if(deg >= Math.atan(0.35) * 180 / Math.PI) steep++
    if(isMax) ridge.push(x, Hh(x, z) + 15, z)
    if(isMin) valley.push(x, Hh(x, z) + 15, z)
  }
  const mean = sum / Math.max(1, cnt)
  const rugged = Math.sqrt(Math.max(0, sum2 / Math.max(1, cnt) - mean * mean))
  const mk = (arr: number[], color: number)=>{
    if(!arr.length) return
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(arr), 3))
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({
      color, size: 22, sizeAttenuation: true, transparent: true, opacity: 0.85, depthWrite: false }))
    g.add(pts)
  }
  mk(ridge, 0xB45309)
  mk(valley, 0x2563EB)
  return {
    mean_slope_deg: Math.round(mean * 10) / 10,
    max_slope_deg: Math.round(mx * 10) / 10,
    ruggedness: Math.round(rugged * 10) / 10,
    steep_share: cnt ? Math.round((steep / cnt) * 100) : 0,
    ridge_points: ridge.length / 3, valley_points: valley.length / 3,
    method: 'DEM ước tính (cực trị cục bộ + prominence 0.5m) — không phải đường đồng mức khảo sát',
  }
}

// <RiskDriverLayer /> — M4 WHY on terrain: outline of the current ellipse
// tinted by the dominant driver + legend. Colors: terrain ochre, wind sky,
// fuel green, access violet.
const DRIVER_COLORS: Record<string, string> = {
  terrain: '#A16207', fuel: '#65A30D', wind: '#0EA5E9', access: '#7C3AED',
}
export function RiskDriverLayer(g: THREE.Group, c: Ctx, sim: any, plan: any){
  const driver = plan?.earth_intelligence?.major_risk_driver
  if(!driver || !sim.spread?.steps?.length) return null
  const ring = sim.spread.steps[0].polygon.coordinates[0]
  const pts = ring.map((p: number[])=>{
    const q = toLocal(p[0], p[1], c.origin)
    return new THREE.Vector3(q.x, c.sampler(q.x, q.z) + 26, q.z)
  })
  const lg = new THREE.BufferGeometry().setFromPoints(pts)
  g.add(new THREE.LineLoop(lg, new THREE.LineBasicMaterial({
    color: DRIVER_COLORS[driver] || '#A16207' })))
  return { driver, color: DRIVER_COLORS[driver] || '#A16207' }
}
export function WaterAccessLayer(g: THREE.Group, c: Ctx, sim: any, waters: any[]){
  const H = c.sampler
  const P = (lon: number, lat: number, lift = 0)=>{
    const p = toLocal(lon, lat, c.origin)
    return new THREE.Vector3(p.x, H(p.x, p.z) + lift, p.z)
  }
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

// <WindFieldLayer /> — M6 schematic arrows (grid, length ∝ speed, bob)
// + Module 5 corridor outline (server polygon, dashed cyan).
export function WindFieldLayer(g: THREE.Group, c: Ctx, sim: any){
  if(!sim.wind_layer) return
  const H = c.sampler
  const corr = sim.wind_corridor?.polygon?.coordinates?.[0]
  if(corr?.length){
    const shape = new THREE.Shape()
    corr.forEach((p: number[], i: number)=>{
      const q = toLocal(p[0], p[1], c.origin)
      if(i === 0) shape.moveTo(q.x, -q.z)
      else shape.lineTo(q.x, -q.z)
    })
    const pts = shape.getPoints(48).map(p2=> new THREE.Vector3(p2.x, H(p2.x, -p2.y) + 20, -p2.y))
    const lg = new THREE.BufferGeometry().setFromPoints(pts)
    g.add(new THREE.LineLoop(lg, new THREE.LineDashedMaterial({
      color: '#06B6D4', dashSize: 60, gapSize: 40 })))
    ;(g.children[g.children.length - 1] as THREE.Line).computeLineDistances()
  }
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

// Fire front points (M5) — THREE.Points ring1→ringN loop.
export function FireFrontPoints(g: THREE.Group, c: Ctx, sim: any){
  if(!sim.spread?.steps?.length) return
  const H = c.sampler
  const ring1 = sim.spread.steps[0].polygon.coordinates[0]
  const ringN = sim.spread.steps[sim.spread.steps.length - 1].polygon.coordinates[0]
  const NPT = c.quality === 'high' ? 1500 : 400
  const positions = new Float32Array(NPT * 3)
  const colors = new Float32Array(NPT * 3)
  const seeds = new Float32Array(NPT * 3)
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

export function updateDynamic(c: Ctx, sim: any, waters: any[], opsAssets: any[],
  communeFc: any, show: any, plan?: any){
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
  if(show.ellipses) FireEllipseMesh(g, c, sim)
  if(show.assets) ThreatenedAssetLayer(g, c, sim, waters, opsAssets)
  if(show.routes) RouteImpactLayer(g, c, sim, opsAssets)
  if(show.communities) CommunityImpactLayer(g, c, sim, communeFc)
  if(show.water) WaterAccessLayer(g, c, sim, waters)
  if(show.wind) WindFieldLayer(g, c, sim)
  if(show.front) FireFrontPoints(g, c, sim)
  if(show.plan && plan) ResponsePlanLayer(g, c, sim, plan, waters, opsAssets)
  if(show.terrain) (c as any)._terrainStats = TerrainAnalysisLayer(g, c) || null
  else (c as any)._terrainStats = null
  if(show.why) RiskDriverLayer(g, c, sim, plan)
  c.scene.add(g)
}

// <ResponsePlanLayer /> — M13 dispatch viz: station→fire (green), primary
// route white underlay, water ring. Names matched best-effort against loaded
// assets; unmatched legs are skipped (never placed by guess).
export function ResponsePlanLayer(g: THREE.Group, c: Ctx, sim: any, plan: any,
  waters: any[], opsAssets: any[]){
  const H = c.sampler
  const P = (lon: number, lat: number, lift = 0)=>{
    const p = toLocal(lon, lat, c.origin)
    return new THREE.Vector3(p.x, H(p.x, p.z) + lift, p.z)
  }
  const o = P(sim.ignition.lon, sim.ignition.lat, 30)
  const wName = plan.primary_water?.name
  const wFull = waters.find((x: any)=> x.name === wName)
  if(wFull && typeof wFull.longitude === 'number'){
    const wp = P(wFull.longitude, wFull.latitude, 12)
    const ring = new THREE.Mesh(new THREE.RingGeometry(45, 75, 24),
      new THREE.MeshBasicMaterial({ color: '#2563EB', transparent: true,
        opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }))
    ring.rotation.x = -Math.PI / 2
    ring.position.copy(wp)
    g.add(ring)
  }
  const sName = plan.primary_station?.station_name
  const st = opsAssets.find((a: any)=> a.name === sName &&
    ['station', 'team'].includes(a.asset_type))
  if(st && typeof st.longitude === 'number'){
    const s = P(st.longitude, st.latitude, 30)
    const lg = new THREE.BufferGeometry().setFromPoints([s, o])
    g.add(new THREE.Line(lg, new THREE.LineDashedMaterial({
      color: '#16A34A', dashSize: 50, gapSize: 30 })))
    ;(g.children[g.children.length - 1] as THREE.Line).computeLineDistances()
    const ring = new THREE.Mesh(new THREE.RingGeometry(40, 70, 24),
      new THREE.MeshBasicMaterial({ color: '#16A34A', transparent: true,
        opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }))
    ring.rotation.x = -Math.PI / 2
    ring.position.copy(s)
    g.add(ring)
  }
  const rName = plan.primary_route?.route_name
  const rt = opsAssets.find((a: any)=> a.id === plan.primary_route?.id || a.name === rName)
  const geom = rt?.geometry
  if(geom && rName){
    const lines = geom.type === 'LineString' ? [geom.coordinates] : (geom.coordinates || [])
    for(const line of lines){
      const v3 = line.map((p: number[])=>{
        const q = toLocal(p[0], p[1], c.origin)
        return new THREE.Vector3(q.x, H(q.x, q.z) + 14, q.z)
      })
      const lg = new THREE.BufferGeometry().setFromPoints(v3)
      g.add(new THREE.Line(lg, new THREE.LineBasicMaterial({ color: '#FFFFFF' })))
    }
  }
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
  for(let py = 0; py < S && mats.length / 3 < cap; py += step){
    for(let pxI = 0; pxI < S && mats.length / 3 < cap; pxI += step){
      const o = (py * S + pxI) * 4
      if(!isCanopyPixel(px[o], px[o + 1], px[o + 2])) continue
      const lon = block.w + ((pxI / (S - 1)) * (block.e - block.w))
      const lat = block.n - ((py / (S - 1)) * (block.n - block.s))
      const q = toLocal(lon, lat, c.origin)
      if(Math.abs(q.x) > c.sizeM / 2 || Math.abs(q.z) > c.sizeM / 2) continue
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
