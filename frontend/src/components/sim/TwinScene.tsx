import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { aoiRadiusKm, BAND_COLORS_3D, isCanopyPixel, lonLatToTile, metersPerPixel,
  STEP_COLORS_3D, terrariumToHeight, tileToLonLat } from './twinMath'
import { canopyKey as canopyOf, updateDynamic } from './TwinLayers'
void BAND_COLORS_3D; void isCanopyPixel; void STEP_COLORS_3D

// Part C+D — real Three.js Digital Twin scene (M1–M12).
// AOI centered on ignition (1–3km). Terrain = Terrarium DEM mesh (never flat).
// Imagery drape = Esri tiles (real). Canopy = ESTIMATED proxy (labeled).
// Fire/particles/wind/assets/routes/communities/water all driven by the
// SAME /api/simulate/fire payload as the 2D view — one sim updates everything.

export type TwinShow = {
  ellipses: boolean; canopy: boolean; front: boolean; wind: boolean;
  assets: boolean; routes: boolean; communities: boolean; water: boolean;
}

type Ctx = {
  renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera;
  controls: OrbitControls; sampler: (x: number, z: number)=>number;
  origin: { lon: number; lat: number }; sizeM: number; raf: number; dead: boolean;
  updaters: Array<(t: number, dt: number)=>void>; quality: 'high' | 'low';
  weak: boolean; lowFpsSince: number | null; degraded: boolean;
  setFps: (fps: number)=>void;
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

function drawTiles(imgs: HTMLImageElement[][], S: number){
  const cv = document.createElement('canvas')
  cv.width = cv.height = S
  const ctx = cv.getContext('2d', { willReadFrequently: true })!
  const n = imgs.length, cell = S / n
  for(let ty = 0; ty < n; ty++) for(let tx = 0; tx < n; tx++)
    ctx.drawImage(imgs[ty][tx], tx * cell, ty * cell, cell, cell)
  return { canvas: cv, ctx }
}

const ESRI = (z: number, x: number, y: number)=>
  `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`
const TERRA = (z: number, x: number, y: number)=>
  `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`

export default function TwinScene({ sim, waters, opsAssets, communeFc, show, onError, onFps }: {
  sim: any; waters: any[]; opsAssets: any[];
  communeFc: any | null;
  show: TwinShow; onError: (msg: string)=>void; onFps: (fps: number)=>void;
}){
  const divRef = useRef<HTMLDivElement>(null)
  const [note, setNote] = useState('')
  const showRef = useRef(show)
  showRef.current = show
  useEffect(()=>{
    if(!divRef.current || !sim?.ignition) return
    const div = divRef.current
    let ctx: Ctx | null = null
    let cancelled = false
    ;(async ()=>{
      try{
        ctx = await buildScene(div, sim, waters, opsAssets, communeFc, showRef.current, onFps, setNote)
        if(cancelled){ destroyScene(ctx); ctx = null }
      }catch(e: any){
        if(!cancelled) onError(String(e?.message || e))
      }
    })()
    return ()=>{ cancelled = true; if(ctx) destroyScene(ctx) }
    // rebuild on new ignition only — slider wind/temp changes update in place
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sim?.ignition?.lon, sim?.ignition?.lat])
  // live-update dynamic layers when sim payload or toggles change
  useEffect(()=>{
    const d = (divRef.current as any)?._twin as Ctx | undefined
    if(d && sim) updateDynamic(d, sim, waters, opsAssets, communeFc, showRef.current)
  }, [sim, waters, opsAssets, communeFc, show])
  // canopy rebuilds only on ignition move (imagery sampling is expensive)
  useEffect(()=>{
    const d = (divRef.current as any)?._twin as any
    if(!d || !sim) return
    if(!showRef.current.canopy){
      const old = d.scene.getObjectByName('twin-canopy')
      if(old){
        d.scene.remove(old)
        try{ old.geometry?.dispose?.(); (old.material as any)?.dispose?.() }catch{}
      }
      d._canopyKey = null
      return
    }
    if(d._canopyKey === canopyOf(sim)) return
    d._canopyKey = canopyOf(sim)
    void import('./TwinLayers').then(m=> m.buildCanopy(d, sim, d._texCanvas, d._block, true))
  }, [sim, show.canopy])
  return (
    <div ref={divRef} style={{position:'absolute', inset:0}}>
      {note && <div style={{position:'absolute', bottom:8, left:8, background:'rgba(11,20,18,0.85)', color:'#FDE68A', fontSize:11, padding:'4px 10px', borderRadius:8, zIndex:6}}>{note}</div>}
    </div>
  )
}

function destroyScene(c: Ctx){
  c.dead = true
  cancelAnimationFrame(c.raf)
  c.controls.dispose()
  c.scene.traverse((o: any)=>{
    try{
      o.geometry?.dispose?.()
      const m = o.material
      if(Array.isArray(m)) m.forEach((x: any)=> { x.map?.dispose?.(); x.dispose?.() })
      else { m?.map?.dispose?.(); m?.dispose?.() }
    }catch{}
  })
  try{ c.renderer.dispose() }catch{}
  try{ c.renderer.domElement.remove() }catch{}
}

async function buildScene(div: HTMLDivElement, sim: any, waters: any[], opsAssets: any[],
  communeFc: any, show: TwinShow, onFps: (fps: number)=>void,
  setNote: (s: string)=>void): Promise<Ctx>{
  const W = div.clientWidth || 800, H = div.clientHeight || 500
  const weak = (navigator as any).hardwareConcurrency <= 4 || W < 640 ||
    (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)
  const quality = weak ? 'low' : 'high'
  const renderer = new THREE.WebGLRenderer({ antialias: quality === 'high' })
  renderer.setPixelRatio(weak ? 1 : Math.min(window.devicePixelRatio || 1, 2))
  renderer.setSize(W, H)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.shadowMap.enabled = quality === 'high'
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  div.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0xdfe9f0)
  scene.fog = new THREE.Fog(0xdfe9f0, 5000, 14000)
  const camera = new THREE.PerspectiveCamera(55, W / H, 10, 60000)
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.maxPolarAngle = Math.PI * 0.49
  controls.minDistance = 300
  controls.maxDistance = 12000

  // M11 — sun + sky + fog (readability, not cinematic)
  scene.add(new THREE.HemisphereLight(0xcfe5ff, 0x3d4a35, 0.9))
  const sun = new THREE.DirectionalLight(0xfff2dd, 1.6)
  sun.position.set(-3000, 4000, 1500)
  if(quality === 'high'){
    sun.castShadow = true
    sun.shadow.mapSize.set(1024, 1024)
    Object.assign(sun.shadow.camera, { left:-3000, right:3000, top:3000, bottom:-3000, far:12000 })
  }
  scene.add(sun)

  const origin = { lon: sim.ignition.lon, lat: sim.ignition.lat }
  const radiusKm = aoiRadiusKm(sim.spread?.steps)
  // M2 — DEM block: 2x2 z14 Terrarium around ignition (fallback: single z13)
  const Z = 14
  const t0 = lonLatToTile(origin.lon, origin.lat, Z)
  const bx = t0.x % 2 === 0 ? t0.x : t0.x - 1
  const by = t0.y % 2 === 0 ? t0.y : t0.y - 1
  let demImgs: HTMLImageElement[][] | null = null
  let texImgs: HTMLImageElement[][] | null = null
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
  const texPx = tex.ctx.getImageData(0, 0, S, S).data
  // block bounds in lon/lat
  const n2 = demImgs.length
  const bLonLat = (()=>{
    if(n2 === 2){
      const tl = tileToLonLat(bx, by, Z), br = tileToLonLat(bx + 2, by + 2, Z)
      return { w: tl.lon, n: tl.lat, e: br.lon, s: br.lat }
    }
    const s13 = lonLatToTile(origin.lon, origin.lat, 13)
    const tl = tileToLonLat(s13.x, s13.y, 13), br = tileToLonLat(s13.x + 1, s13.y + 1, 13)
    return { w: tl.lon, n: tl.lat, e: br.lon, s: br.lat }
  })()
  const sizeM = Math.max(
    (bLonLat.e - bLonLat.w) * 111320 * Math.cos(origin.lat * Math.PI / 180),
    (bLonLat.n - bLonLat.s) * 110540)
  const N = quality === 'high' ? 129 : 65
  const EXAG = 1.5 // labeled in UI
  const Hgrid = new Float32Array(N * N)
  let minH = Infinity
  const lonOf = (i: number)=> bLonLat.w + ((i / (N - 1)) * (bLonLat.e - bLonLat.w))
  const latOf = (j: number)=> bLonLat.n - ((j / (N - 1)) * (bLonLat.n - bLonLat.s))
  const pxOf = (lon: number, lat: number)=>{
    const px = Math.min(S - 1, Math.max(0, Math.round(((lon - bLonLat.w) / (bLonLat.e - bLonLat.w)) * (S - 1))))
    const py = Math.min(S - 1, Math.max(0, Math.round(((bLonLat.n - lat) / (bLonLat.n - bLonLat.s)) * (S - 1))))
    return { px, py }
  }
  for(let j = 0; j < N; j++) for(let i = 0; i < N; i++){
    const { px, py } = pxOf(lonOf(i), latOf(j))
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
    const a = Hgrid[j * N + i], b = Hgrid[j * N + i + 1], c = Hgrid[(j + 1) * N + i], d = Hgrid[(j + 1) * N + i + 1]
    return ((a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz - minH) * EXAG
  }
  // terrain mesh with slope shading (M2 ridges/valleys readable, M11 shading)
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
    const h = sampler(x, z)
    pos.setY(k, h)
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
  const terrain = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ map: tex3, vertexColors: true, roughness: 1 }))
  terrain.receiveShadow = quality === 'high'
  const world = new THREE.Group()
  world.add(terrain)
  scene.add(world)
  const oy = sampler(0, 0)
  world.position.y = -oy // ignition ground ≈ y0
  const Hrel = (x: number, z: number)=> sampler(x, z) - oy
  void metersPerPixel

  camera.position.set(radiusKm * 1000 * 1.1, radiusKm * 1000 * 0.9, radiusKm * 1000 * 1.1)
  controls.target.set(0, 0, 0)
  controls.update()

  const c: Ctx = { renderer, scene, camera, controls, sampler: Hrel, origin,
    sizeM, raf: 0, dead: false, updaters: [], quality, weak,
    lowFpsSince: null, degraded: false, setFps: onFps }
  ;(div as any)._twin = c

  // resize
  const ro = new ResizeObserver(()=>{
    const w = div.clientWidth || 800, h = div.clientHeight || 500
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
  })
  ro.observe(div)
  const stopRO = ()=> ro.disconnect()
  ;(c as any)._stopRO = stopRO

  // main loop with fps guard (M12 auto-degrade)
  let last = performance.now(), frames = 0, acc = 0
  const loop = (t: number)=>{
    if(c.dead) return
    c.raf = requestAnimationFrame(loop)
    if(document.hidden){ last = t; return }
    const dt = Math.min(0.05, (t - last) / 1000)
    last = t
    controls.update()
    for(const u of c.updaters){ try{ u(t / 1000, dt) }catch{} }
    renderer.render(scene, camera)
    frames++; acc += dt
    if(acc >= 1){
      const fps = Math.round(frames / acc)
      frames = 0; acc = 0
      onFps(fps)
      if(!c.degraded && fps < 25){
        if(c.lowFpsSince === null) c.lowFpsSince = t
        else if(t - c.lowFpsSince > 3000){
          c.degraded = true
          renderer.shadowMap.enabled = false
          renderer.setPixelRatio(1)
          setNote('Thiết bị yếu — đã tắt bóng đổ, giữ mô phỏng (đọc địa hình ưu tiên)')
        }
      } else c.lowFpsSince = null
    }
  }
  c.raf = requestAnimationFrame(loop)

  updateDynamic(c, sim, waters, opsAssets, communeFc, show)
  void texPx
  ;(c as any)._texCanvas = tex.canvas
  ;(c as any)._block = bLonLat
  ;(c as any)._canopyKey = null
  return c
}

function slopeAtGrid(H: Float32Array, n: number, i: number, j: number, cell: number){
  const xm = H[j * n + Math.max(0, i - 1)], xp = H[j * n + Math.min(n - 1, i + 1)]
  const ym = H[Math.max(0, j - 1) * n + i], yp = H[Math.min(n - 1, j + 1) * n + i]
  const dx = (xp - xm) / (2 * cell), dy = (yp - ym) / (2 * cell)
  return Math.sqrt(dx * dx + dy * dy)
}
