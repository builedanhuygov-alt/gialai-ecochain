import * as THREE from 'three'
import { BAND_COLORS_3D, exaggerationFor, lonLatToTile, lonToTileX, latToTileY, STEP_COLORS_3D,
  terrariumToHeight, tileToLonLat, toLocal } from './twinMath'
import { isCanopyPixel, valueNoise } from './twinMath'

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

// <TerrainMesh /> — real DEM mesh (M1/M2), never a flat plane. Throws honestly
// when tiles are unreachable so the UI can fall back to 2D.
// M1 grid: mesh segments scale with AOI (256/192/160 high, 128/96/80 low).
// Sampling stays native to the 256px DEM tile — denser grids would invent
// detail that is not in the source, so segment counts above are the honest cap.
// M3 texture fallback: Esri z14 → Esri z13 → OSM z14 (all real tiles).
export async function TerrainMesh(origin: { lon: number; lat: number }, quality: 'high' | 'low', aoiKm?: number | null){
  const aoi = aoiKm || 3
  const Z = aoi <= 1.5 ? 16 : aoi <= 3.5 ? 15 : 14
  const t0 = lonLatToTile(origin.lon, origin.lat, Z)
  void t0 // block origin comes from the DEM loop below (zoom may differ)
  const OSM = (z: number, x: number, y: number)=> `https://tile.openstreetmap.org/${z}/${x}/${y}.png`
  // DEM: try target zoom, then coarser (same 2x2 footprint logic per zoom).
  let demImgs: HTMLImageElement[][] | null = null
  let demZ = Z, demBX = 0, demBY = 0
  for(const z of [Z, Z - 1, Z - 2, 13]){
    if(z < 13 || demImgs) break
    try{
      const t = lonLatToTile(origin.lon, origin.lat, z)
      const ex = t.x % 2 === 0 ? t.x : t.x - 1, ey = t.y % 2 === 0 ? t.y : t.y - 1
      demImgs = [[await loadImage(TERRA(z, ex, ey)), await loadImage(TERRA(z, ex + 1, ey))],
                 [await loadImage(TERRA(z, ex, ey + 1)), await loadImage(TERRA(z, ex + 1, ey + 1))]]
      demZ = z; demBX = ex; demBY = ey
    }catch{ /* try coarser */ }
  }
  if(!demImgs) throw new Error('DEM unreachable — không dựng địa hình giả')
  const tl = tileToLonLat(demBX!, demBY!, demZ)
  const br = tileToLonLat(demBX! + 2, demBY! + 2, demZ)
  const block = { w: tl.lon, n: tl.lat, e: br.lon, s: br.lat }
  // Texture: cover the SAME block at the best zoom that loads.
  const S = 512
  const texCanvas = document.createElement('canvas')
  texCanvas.width = texCanvas.height = S
  const tctx = texCanvas.getContext('2d', { willReadFrequently: true })!
  let texStatus = ''
  let texDone = false
  for(const z of [Z, Z - 1, Math.max(13, Z - 2)]){
    if(texDone) break
    for(const tag of [`esri-z${z}`, `osm-z${z}`]){
      try{
        const fn = tag.startsWith('esri') ? ESRI : OSM
        const x0 = Math.floor(lonToTileX(block.w, z)), x1 = Math.floor(lonToTileX(block.e, z))
        const y0 = Math.floor(latToTileY(block.n, z)), y1 = Math.floor(latToTileY(block.s, z))
        if(x1 - x0 > 5 || y1 - y0 > 5) continue // cap tile count (perf)
        for(let ty = y0; ty <= y1; ty++) for(let tx = x0; tx <= x1; tx++){
          const img = await loadImage(fn(z, tx, ty))
          const fx0 = Math.max(0, ((tx - lonToTileX(block.w, z)) / (lonToTileX(block.e, z) - lonToTileX(block.w, z))) * S)
          const fx1 = Math.min(S, ((tx + 1 - lonToTileX(block.w, z)) / (lonToTileX(block.e, z) - lonToTileX(block.w, z))) * S)
          const fy0 = Math.max(0, ((ty - latToTileY(block.n, z)) / (latToTileY(block.s, z) - latToTileY(block.n, z))) * S)
          const fy1 = Math.min(S, ((ty + 1 - latToTileY(block.n, z)) / (latToTileY(block.s, z) - latToTileY(block.n, z))) * S)
          const sx = ((fx0 / S) * img.width), sy = ((fy0 / S) * img.height)
          // draw full tile cropped to the visible fraction
          const dx0 = Math.max(0, fx0), dy0 = Math.max(0, fy0)
          tctx.drawImage(img, (dx0 - fx0) / (fx1 - fx0 || 1) * img.width, (dy0 - fy0) / (fy1 - fy0 || 1) * img.height,
            img.width * (Math.min(S, fx1) - dx0) / (fx1 - fx0 || 1), img.height * (Math.min(S, fy1) - dy0) / (fy1 - fy0 || 1),
            dx0, dy0, Math.min(S, fx1) - dx0, Math.min(S, fy1) - dy0)
          void sx; void sy
        }
        texStatus = tag
        texDone = true
        break
      }catch{ /* next source/zoom */ }
    }
  }
  if(!texDone) throw new Error('Imagery unreachable — không dựng texture giả')
  const dem = drawTiles(demImgs, S)
  const demPx = dem.ctx.getImageData(0, 0, S, S).data
  // DEM canvas covers the DEM 2x2 block == `block`; texture canvas covers the
  // same block (cover-crop math above) — sampling stays aligned.
  const sizeM = Math.max(
    (block.e - block.w) * 111320 * Math.cos(origin.lat * Math.PI / 180),
    (block.n - block.s) * 110540)
  // M1/M2/M12: mesh segments by AOI size × device class (dynamic resolution).
  const N = quality === 'high'
    ? (aoi <= 1.5 ? 257 : aoi <= 3.5 ? 193 : 161)
    : (aoi <= 1.5 ? 129 : aoi <= 3.5 ? 97 : 81)
  const EXAG = exaggerationFor(aoi) // M2 auto-scale readability (labeled in UI)
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
  const tmpC = new THREE.Color()
  let maxSlope = 0.001
  const slopes = new Float32Array(pos.count)
  const heights = new Float32Array(pos.count)
  let maxH = -Infinity
  const gridXY = new Int32Array(pos.count * 2)
  for(let k = 0; k < pos.count; k++){
    const x = pos.getX(k), z = pos.getZ(k)
    pos.setY(k, sampler(x, z))
    const gx = Math.min(N - 1, Math.max(0, Math.round((x / sizeM + 0.5) * (N - 1))))
    const gz = Math.min(N - 1, Math.max(0, Math.round((z / sizeM + 0.5) * (N - 1))))
    gridXY[k * 2] = gx; gridXY[k * 2 + 1] = gz
    const sl = slopeAtGrid(Hgrid, N, gx, gz, cell)
    slopes[k] = sl
    if(sl > maxSlope) maxSlope = sl
    const h = Hgrid[gz * N + gx]
    heights[k] = h
    if(h > maxH) maxH = h
  }
  // M7 micro-landcover (derived from REAL pixel + slope + elevation, labeled)
  // + M11 baked AO (concavity darkening). Multiplies the satellite texture.
  const texData = tctx.getImageData(0, 0, S, S).data
  const aoAt = (gx: number, gz: number)=>{
    const h0 = Hgrid[gz * N + gx]
    let s = 0, n = 0
    for(const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]){
      const ii = Math.min(N - 1, Math.max(0, gx + di)), jj = Math.min(N - 1, Math.max(0, gz + dj))
      s += Hgrid[jj * N + ii]; n++
    }
    const conc = h0 - s / n // >0 ridge, <0 crevice
    return Math.min(1.04, Math.max(0.7, 1 + conc * 0.02))
  }
  for(let k = 0; k < pos.count; k++){
    const gx = gridXY[k * 2], gz = gridXY[k * 2 + 1]
    const t = Math.min(1, slopes[k] / maxSlope)
    const slopeShade = 1 - t * 0.35
    const ao = aoAt(gx, gz)
    const px = Math.min(S - 1, Math.max(0, Math.round((gx / (N - 1)) * (S - 1))))
    const py = Math.min(S - 1, Math.max(0, Math.round((gz / (N - 1)) * (S - 1))))
    const o = (py * S + px) * 4
    const pr = texData[o], pg = texData[o + 1]
    void texData[o + 2]
    const normH = (heights[k] - minH) / Math.max(1, maxH - minH)
    // M5 smooth class blending (no uniform colors): soft weights over
    // rock/dense/sparse/bare/grass driven by slope + pixel + elevation.
    const sstep = (e0: number, e1: number, x: number)=>{
      const t = Math.min(1, Math.max(0, (x - e0) / Math.max(1e-6, e1 - e0)))
      return t * t * (3 - 2 * t)
    }
    const greenAmt = Math.min(1, Math.max(0, (pg - pr - 6) / 24)) * (pg > 60 ? 1 : 0)
    const wRock = sstep(0.45, 0.75, slopes[k])
    const wDense = (1 - wRock) * greenAmt * (1 - sstep(0.7, 0.9, normH))
    const wSparse = (1 - wRock) * greenAmt * sstep(0.7, 0.9, normH)
    const wBare = (1 - wRock) * (1 - greenAmt) * sstep(0.02, 0.2, (pr - pg) / 255)
    const wGrass = Math.max(0, 1 - wRock - wDense - wSparse - wBare)
    const tr = wRock * 0.88 + wDense * 0.72 + wSparse * 0.9 + wBare * 1.0 + wGrass * 0.95
    const tgC = wRock * 0.88 + wDense * 0.92 + wSparse * 0.97 + wBare * 0.94 + wGrass * 1.0
    const tb = wRock * 0.92 + wDense * 0.72 + wSparse * 0.86 + wBare * 0.84 + wGrass * 0.82
    const m = slopeShade * ao
    tmpC.setRGB(tr * m, tgC * m, tb * m)
    colors[k * 3] = tmpC.r; colors[k * 3 + 1] = tmpC.g; colors[k * 3 + 2] = tmpC.b
  }
  tg.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  tg.computeVertexNormals()
  const tex3 = new THREE.CanvasTexture(texCanvas)
  tex3.colorSpace = THREE.SRGBColorSpace
  tex3.anisotropy = 4 // crisper ground at grazing angles (no extra downloads)
  const mesh = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ map: tex3, vertexColors: true, roughness: 1 }))
  mesh.receiveShadow = quality === 'high'
  return { mesh, sampler, origin, sizeM, texCanvas, block, texStatus, meshSegs: N - 1, exag: EXAG,
           grid: { H: Hgrid, n: N, cell, sizeM } }
}

// <FireEllipseMesh /> — M4/M5 server ellipses draped on terrain.
// 128–256 vertices via closed Catmull-Rom resampling of the server ring
// (same polygon, smooth edges — no new geometry invented). Soft gradient =
// core fill + outer glow ring. Current fire pulses (opacity) to stand out.
function smoothRing(pts: Array<{ x: number; y: number }>, n: number){
  const v3 = pts.map(p=> new THREE.Vector2(p.x, p.y))
  const curve = new THREE.SplineCurve(v3)
  return curve.getPoints(n)
}

export function FireEllipseMesh(g: THREE.Group, c: Ctx, sim: any){
  const H = c.sampler
  // M6 visual distortion inputs (rendering only — spread math untouched):
  // wind stretch along the downwind axis + noise perturbation scaled by
  // local slope. Deterministic (seeded by vertex index), labeled visual.
  const wdir = ((sim.wind_layer?.direction_deg ?? sim.scenario?.wind_direction_deg ?? 90) * Math.PI) / 180
  const wspd = sim.wind_layer?.speed_kmh ?? sim.scenario?.wind_speed_kmh ?? 0
  // shape space: +x east, +y north → downwind unit (sin, cos)
  const wx = Math.sin(wdir), wy = Math.cos(wdir)
  const steps = [{ hour: 0, polygon: null }, ...(sim.spread?.steps || [])]
  const NPTS = c.quality === 'high' ? 200 : 128
  steps.forEach((s: any, idx: number)=>{
    let pts2d: Array<{ x: number; y: number }>
    if(!s.polygon){
      pts2d = []
      for(let i = 0; i < 24; i++){
        const a = (i / 24) * Math.PI * 2
        pts2d.push({ x: Math.cos(a) * 60, y: Math.sin(a) * 60 })
      }
    } else {
      const ring = s.polygon.coordinates[0]
      pts2d = ring.map((p: number[])=>{
        const q = toLocal(p[0], p[1], c.origin)
        return { x: q.x, y: -q.z }
      })
    }
    const smooth = smoothRing(pts2d, NPTS)
    // distort radially: noise × (wind alignment + slope), forecast only
    const distorted = smooth.map((p, i)=>{
      if(s.hour === 0) return p
      const r = Math.hypot(p.x, p.y) || 1
      const ux = p.x / r, uy = p.y / r
      const align = Math.max(0, ux * wx + uy * wy) // 0 upwind .. 1 downwind
      const n = valueNoise(i * 0.35 + idx * 13.7, idx * 7.1) - 0.5
      const n2 = valueNoise(i * 0.11 + idx * 3.3, idx * 1.7 + 5) - 0.5
      const sl = Math.min(1, Math.abs(H(p.x, -p.y + 1) - H(p.x, -p.y - 1)) / 40)
      const amp = r * (0.03 + 0.05 * align * Math.min(1, wspd / 30) + 0.04 * sl)
      return { x: p.x + ux * (n + n2) * amp * 2, y: p.y + uy * (n + n2) * amp * 2 }
    })
    const shape = new THREE.Shape()
    distorted.forEach((p, i)=> { if(i === 0) shape.moveTo(p.x, p.y); else shape.lineTo(p.x, p.y) })
    shape.closePath()
    const lift = 10 + idx * 4
    const drape = (geo: THREE.BufferGeometry, extra: number)=>{
      const pp = geo.attributes.position
      for(let k = 0; k < pp.count; k++){
        const x = pp.getX(k), z = -pp.getY(k)
        pp.setXYZ(k, x, H(x, z) + lift + extra, z)
      }
      geo.computeVertexNormals()
      return geo
    }
    const color = STEP_COLORS_3D[s.hour] || '#F97316'
    // M6 forecast = outline-dominant (fill giảm mạnh), current = fill nổi bật
    const core = new THREE.Mesh(drape(new THREE.ShapeGeometry(shape), 0),
      new THREE.MeshBasicMaterial({ color, transparent: true,
        opacity: s.hour === 0 ? 0.8 : 0.2,
        side: THREE.DoubleSide, depthWrite: false }))
    g.add(core)
    // soft outer glow: same shape, slightly higher + lower opacity
    const glow = new THREE.Mesh(drape(new THREE.ShapeGeometry(shape), 6),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.1,
        side: THREE.DoubleSide, depthWrite: false }))
    g.add(glow)
    // crisp edge (distorted ring, not the perfect ellipse)
    const edge = distorted.map(p=> new THREE.Vector3(p.x, 0, -p.y))
    const edgeGeo = new THREE.BufferGeometry().setFromPoints(
      edge.map(v=> new THREE.Vector3(v.x, H(v.x, v.z) + lift + 2, v.z)))
    g.add(new THREE.LineLoop(edgeGeo, new THREE.LineBasicMaterial({ color })))
    if(s.hour === 0){
      const m = core.material as THREE.MeshBasicMaterial
      c.updaters.push((t: number)=>{ m.opacity = 0.62 + 0.22 * Math.sin(t * 3) })
    }
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

// <RouteImpactLayer /> — M7 routes raised on terrain with outline.
// TubeGeometry casing (white) + band-colored core: real outline visible at
// any zoom (LineBasicMaterial is 1px everywhere). Primary route gets a
// brighter core via plan highlight passed in show? No — band color rules.
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
        return new THREE.Vector3(q.x, H(q.x, q.z) + 12, q.z)
      })
      if(v3.length < 2) continue
      const curve = new THREE.CatmullRomCurve3(v3)
      const tube = new THREE.TubeGeometry(curve, 48, 9, 5, false)
      g.add(new THREE.Mesh(tube, new THREE.MeshBasicMaterial({ color: '#FFFFFF' })))
      const core = new THREE.TubeGeometry(curve, 48, 4.5, 5, false)
      g.add(new THREE.Mesh(core, new THREE.MeshBasicMaterial({ color: r.color || '#3B82F6' })))
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
        color, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false })))
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
  const mk = (arr: number[], color: number, size: number)=>{
    if(!arr.length) return
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(arr), 3))
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({
      color, size, sizeAttenuation: true, transparent: true, opacity: 0.85, depthWrite: false }))
    g.add(pts)
  }
  mk(ridge, 0x7C2D12, 26)
  mk(valley, 0x1D4ED8, 26)
  // M1 contours: marching squares at 6 evenly spaced levels from the REAL
  // DEM grid (derived lines, labeled) — the single biggest readability win.
  let mn = Infinity
  for(let j = 0; j < n; j += 2) for(let i = 0; i < n; i += 2) mn = Math.min(mn, at(i, j))
  let mxH = -Infinity
  for(let j = 0; j < n; j += 2) for(let i = 0; i < n; i += 2) mxH = Math.max(mxH, at(i, j))
  const segs: number[] = []
  const X = (i: number)=> (i / (n - 1) - 0.5) * sizeM
  const Z = (j: number)=> (j / (n - 1) - 0.5) * sizeM
  if(mxH > mn){
    for(let L = 1; L <= 6; L++){
      const lv = mn + ((mxH - mn) * L) / 7
      for(let j = 0; j < n - 1; j += 2) for(let i = 0; i < n - 1; i += 2){
        const h00 = at(i, j) - lv, h10 = at(i + 1, j) - lv
        const h01 = at(i, j + 1) - lv, h11 = at(i + 1, j + 1) - lv
        const P: Array<[number, number]> = []
        if(h00 * h10 < 0){ const t = h00 / (h00 - h10); P.push([X(i + t), Z(j)]) }
        if(h01 * h11 < 0){ const t = h01 / (h01 - h11); P.push([X(i + t), Z(j + 1)]) }
        if(h00 * h01 < 0){ const t = h00 / (h00 - h01); P.push([X(i), Z(j + t)]) }
        if(h10 * h11 < 0){ const t = h10 / (h10 - h11); P.push([X(i + 1), Z(j + t)]) }
        if(P.length >= 2){
          const [ax, az] = P[0], [bx2, bz2] = P[1]
          segs.push(ax, Hh(ax, az) + 5, az, bx2, Hh(bx2, bz2) + 5, bz2)
        }
      }
    }
  }
  if(segs.length){
    const cg = new THREE.BufferGeometry()
    cg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(segs), 3))
    g.add(new THREE.LineSegments(cg, new THREE.LineBasicMaterial({
      color: '#5b4a2f', transparent: true, opacity: 0.45, depthWrite: false })))
  }
  return {
    mean_slope_deg: Math.round(mean * 10) / 10,
    max_slope_deg: Math.round(mx * 10) / 10,
    ruggedness: Math.round(rugged * 10) / 10,
    steep_share: cnt ? Math.round((steep / cnt) * 100) : 0,
    ridge_points: ridge.length / 3, valley_points: valley.length / 3,
    contour_segments: segs.length / 6,
    relief_m: Math.round((mxH === -Infinity ? 0 : mxH - mn)),
    method: 'DEM ước tính (đồng mức marching-squares + cực trị, prominence 0.5m) — không phải khảo sát',
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
  // M6 density by AOI: 1km dense (7x7), 3km medium (5x5), 5km sparse (3x3)
  // + terrain modulation (VISUAL ONLY): arrows shorten over steep upslope
  // faces (sheltered) and lengthen downslope — schematic, not CFD.
  const aoiKm = (c as any).aoiKm || 3
  const half = aoiKm <= 1.5 ? 3 : aoiKm <= 3.5 ? 2 : 1
  const R = c.sizeM / 2 * 0.7
  const arrows: THREE.ArrowHelper[] = []
  for(let gx = -half; gx <= half; gx++) for(let gz = -half; gz <= half; gz++){
    const x = gx * R / 2.5, z = gz * R / 2.5
    const ahead = 120
    const h0 = H(x, z)
    const hx = x + Math.sin(dir) * ahead, hz = z - Math.cos(dir) * ahead
    const dh = (H(hx, hz) - h0) / Math.max(1, ahead) // rise/run along wind
    const shelter = Math.max(0.55, Math.min(1.25, 1 - dh * 1.4))
    const len = (60 + sp * 5) * shelter
    const ah = new THREE.ArrowHelper(
      new THREE.Vector3(Math.sin(dir), 0, -Math.cos(dir)),
      new THREE.Vector3(x, H(x, z) + 260, z),
      len, shelter < 0.85 ? 0x64748B : 0x0EA5E9, len * 0.25, len * 0.12)
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
    // M8 shoreline: static priority-color ring + expanding ripple (no water
    // body polygon exists in data — rings mark the asset, honestly labeled).
    const prio = plan.primary_water?.priority
    const wcol = prio === 'A' ? '#2563EB' : prio === 'B' ? '#0EA5E9' : '#94A3B8'
    const ring = new THREE.Mesh(new THREE.RingGeometry(45, 75, 24),
      new THREE.MeshBasicMaterial({ color: wcol, transparent: true,
        opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }))
    ring.rotation.x = -Math.PI / 2
    ring.position.copy(wp)
    g.add(ring)
    const rip = new THREE.Mesh(new THREE.RingGeometry(75, 82, 32),
      new THREE.MeshBasicMaterial({ color: wcol, transparent: true,
        opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }))
    rip.rotation.x = -Math.PI / 2
    rip.position.copy(wp)
    g.add(rip)
    c.updaters.push((t: number)=>{
      const k = (t % 2.4) / 2.4
      rip.scale.setScalar(1 + k * 1.6)
      ;(rip.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - k)
    })
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
  // M4 canopy PATCHES (not individual trees): aggregate green pixels into
  // coarse density cells → one instanced disc per vegetated cell, radius and
  // shade by local density. Labeled ESTIMATED canopy proxy everywhere.
  const S = texCanvas.width
  const tctx = texCanvas.getContext('2d', { willReadFrequently: true })!
  const px = tctx.getImageData(0, 0, S, S).data
  const CELLN = 40
  const dens = new Float32Array(CELLN * CELLN)
  const samp = new Int32Array(CELLN * CELLN)
  const step = Math.max(1, Math.floor(S / 200))
  for(let py = 0; py < S; py += step){
    for(let pxI = 0; pxI < S; pxI += step){
      const o = (py * S + pxI) * 4
      const ci = Math.min(CELLN - 1, Math.floor((pxI / S) * CELLN))
      const cj = Math.min(CELLN - 1, Math.floor((py / S) * CELLN))
      samp[cj * CELLN + ci]++
      if(isCanopyPixel(px[o], px[o + 1], px[o + 2])) dens[cj * CELLN + ci]++
    }
  }
  type Patch = { x: number; z: number; r: number; d: number; rot: number; sq: number }
  const patches: Patch[] = []
  const cellM = c.sizeM / CELLN
  for(let cj = 0; cj < CELLN; cj++) for(let ci = 0; ci < CELLN; ci++){
    const n = samp[cj * CELLN + ci]
    if(!n) continue
    // M4 noise-driven clusters: large-scale noise gates clearings, density
    // sets canopy strength → dense areas / sparse areas / clearings / edges.
    const nz = valueNoise(ci * 0.22 + 3.1, cj * 0.22 + 7.7)
    if(nz < 0.32) continue // natural clearing (noise, not data gap)
    const d = Math.min(1, (dens[cj * CELLN + ci] / n) * (0.55 + 0.9 * nz))
    if(d < 0.22) continue // only real vegetated cells become patches
    const lon = block.w + (((ci + 0.5) / CELLN) * (block.e - block.w))
    const lat = block.n - (((cj + 0.5) / CELLN) * (block.n - block.s))
    const q = toLocal(lon, lat, c.origin)
    if(Math.abs(q.x) > c.sizeM / 2 || Math.abs(q.z) > c.sizeM / 2) continue
    patches.push({ x: q.x, z: q.z, r: cellM * (0.35 + d * 0.3), d,
      rot: valueNoise(ci * 0.9, cj * 0.9 + 40) * Math.PI * 2,
      sq: 0.65 + valueNoise(ci * 0.7 + 11, cj * 0.7) * 0.7 })
    if(patches.length >= 1200) break
  }
  if(!patches.length) return
  const old = c.scene.getObjectByName('twin-canopy')
  if(old){
    c.scene.remove(old)
    try{ (old as any).geometry?.dispose?.(); (old as any).material?.dispose?.() }catch{}
  }
  // soft radial edge (shared alphaMap) so patches read as vegetation masses
  const acv = document.createElement('canvas')
  acv.width = acv.height = 64
  const actx = acv.getContext('2d')!
  const grad = actx.createRadialGradient(32, 32, 6, 32, 32, 32)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.7, 'rgba(255,255,255,0.85)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  actx.fillStyle = grad
  actx.fillRect(0, 0, 64, 64)
  const alphaTex = new THREE.CanvasTexture(acv)
  const geo = new THREE.CircleGeometry(1, 12)
  geo.rotateX(-Math.PI / 2)
  const mat = new THREE.MeshStandardMaterial({ roughness: 1, transparent: true, opacity: 0.6,
    alphaMap: alphaTex, depthWrite: false })
  const im = new THREE.InstancedMesh(geo, mat, patches.length)
  const m4 = new THREE.Matrix4()
  const col = new THREE.Color()
  const sc = new THREE.Vector3()
  const quat = new THREE.Quaternion()
  const up = new THREE.Vector3(0, 1, 0)
  patches.forEach((p, i)=>{
    quat.setFromAxisAngle(up, p.rot)
    m4.compose(new THREE.Vector3(p.x, c.sampler(p.x, p.z) + 6, p.z),
      quat, sc.set(p.r, 1, p.r * p.sq))
    im.setMatrixAt(i, m4)
    im.setColorAt(i, col.setHSL(0.26 + p.d * 0.08, 0.5, 0.24 + p.d * 0.12))
  })
  im.instanceMatrix.needsUpdate = true
  if(im.instanceColor) im.instanceColor.needsUpdate = true
  im.name = 'twin-canopy'
  c.scene.add(im)
  ;(c as any)._canopyCount = patches.length
}
