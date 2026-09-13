import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { aoiRadiusKm } from './twinMath'
import { canopyKey as canopyOf, TerrainMesh, updateDynamic } from './TwinLayers'

// Part C+D — real Three.js Digital Twin scene (M1–M12).
// AOI centered on ignition (1–3km). Terrain = Terrarium DEM mesh (never flat).
// Imagery drape = Esri tiles (real). Canopy = ESTIMATED proxy (labeled).
// Fire/particles/wind/assets/routes/communities/water all driven by the
// SAME /api/simulate/fire payload as the 2D view — one sim updates everything.

export type TwinShow = {
  ellipses: boolean; canopy: boolean; front: boolean; wind: boolean;
  assets: boolean; routes: boolean; communities: boolean; water: boolean;
  plan: boolean; terrain: boolean; why: boolean;
}

export type CameraMode = 'tactical' | 'overview'

// M1/M3 — Google Earth Tactical Overview. 2 mode, mặc định OVERVIEW:
// - overview: fit TOÀN BỘ quả núi / AOI (sizeM), không fit ellipse.
//   AOI 1km → toàn khu vực; 3km → toàn ngọn núi; 5km → toàn chiến trường.
// - tactical: zoom gần hiện trường (số close-up cũ 200–400m AGL).
function fitDist(sizeM: number, fovDeg: number, aspect: number, margin: number) {
  const fovV = (fovDeg * Math.PI) / 180
  const fovH = 2 * Math.atan(Math.tan(fovV / 2) * aspect)
  const fitFov = Math.min(fovV, fovH)
  const radius = ((sizeM * Math.SQRT2) / 2) * margin
  return radius / Math.max(0.2, Math.sin(fitFov / 2))
}

export function fitOverview(d: any, instant = false) {
  const sizeM = d.sizeM || (d.aoiKm || 3) * 1000
  const dist = fitDist(sizeM, d.camera?.fov ?? 55, d.camera?.aspect || 16 / 9, 1.15)
  // P5: pitch 62° (khung 60–75°) — cao mà vẫn đọc được relief địa hình.
  const pitch = (62 * Math.PI) / 180
  const agl = dist * Math.sin(pitch)
  const horiz = dist * Math.cos(pitch)
  const cy = d.sampler ? d.sampler(0, 0) : 0
  if (instant) {
    d.controls.target.set(0, cy, 0)
    d.camera.position.set(horiz * 0.7, cy + agl, horiz * 0.7)
    d.controls.update()
  } else tweenCam(d, horiz * 0.7, cy + agl, horiz * 0.7, 0, cy, 0)
}

// M3 tactical framing: 200–400m AGL, pitch ~60–67° (not satellite view).
// Close-up hiện trường — ellipse fill đậm, mũi tên gió.
function frameTactical(d: any, tx: number, ty: number, tz: number, aoiKm?: number | null, instant = false) {
  const agl = Math.min(400, Math.max(200, (aoiKm || d.aoiKm || 2) * 130))
  const horiz = agl / Math.tan((64 * Math.PI) / 180)
  if (instant) {
    d.controls.target.set(tx, ty, tz)
    d.camera.position.set(tx + horiz * 0.7, ty + agl, tz + horiz * 0.7)
    d.controls.update()
  } else tweenCam(d, tx + horiz * 0.7, ty + agl, tz + horiz * 0.7, tx, ty, tz)
}

// P4 camera fly (300–600ms), không teleport — easeOutCubic cùng họ ease-out.
// Terrain giữ orientation (chỉ lerp position + target). Reduced-motion → nhảy.
function tweenCam(d: any, px: number, py: number, pz: number, tx: number, ty: number, tz: number, ms = 450) {
  const place = () => { d.camera.position.set(px, py, pz); d.controls.target.set(tx, ty, tz); d.controls.update() }
  try {
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { place(); return }
    const c = d.controls as any
    if (c._tween) cancelAnimationFrame(c._tween)
    const p0 = d.camera.position.clone(), t0 = d.controls.target.clone()
    const p1 = new THREE.Vector3(px, py, pz), t1 = new THREE.Vector3(tx, ty, tz)
    const t0ms = performance.now()
    const step = (now: number) => {
      const k = Math.min(1, (now - t0ms) / ms)
      const e = 1 - Math.pow(1 - k, 3)
      d.camera.position.lerpVectors(p0, p1, e)
      d.controls.target.lerpVectors(t0, t1, e)
      d.controls.update()
      if (k < 1 && !(d as any).dead) c._tween = requestAnimationFrame(step)
    }
    c._tween = requestAnimationFrame(step)
  } catch { place() }
}

export function dollyView(d: any, factor: number) { try {
    const off = d.camera.position.clone().sub(d.controls.target)
    const len = off.length()
    const min = d.controls.minDistance || 300
    const max = d.controls.maxDistance || 12000
    const next = Math.min(max, Math.max(min, len * factor))
    off.setLength(next)
    d.camera.position.copy(d.controls.target).add(off)
    d.controls.update()
  } catch {} }

type Ctx = {
  renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera;
  controls: OrbitControls; sampler: (x: number, z: number) => number;
  origin: { lon: number; lat: number }; sizeM: number; aoiKm: number;
  raf: number; dead: boolean;
  updaters: Array<(t: number, dt: number) => void>; quality: 'high' | 'low';
  weak: boolean; lowFpsSince: number | null; degraded: boolean;
  setFps: (fps: number) => void;
}

export default function TwinScene({ sim, waters, opsAssets, communeFc, show, plan, aoiKm, focusKey, focusReq, orbitMode, onError, onFps, onTerrain, onCam }: {
  sim: any; waters: any[]; opsAssets: any[];
  communeFc: any | null;
  show: TwinShow; plan?: any; aoiKm?: number | null; focusKey?: number;
  focusReq?: { key: number; lon: number; lat: number; label: string } | null;
  orbitMode?: CameraMode;
  onError: (msg: string) => void; onFps: (fps: number) => void; onTerrain?: (stats: any) => void;
  onCam?: (aglM: number) => void;
}) {
  const divRef = useRef<HTMLDivElement>(null)
  const [note, setNote] = useState('')
  // P9 skeleton — che khoảng trống khi terrain đang dựng, không blank.
  const [ready, setReady] = useState(false)
  const showRef = useRef(show)
  showRef.current = show
  const planRef = useRef(plan)
  planRef.current = plan
  const focusReqRef = useRef(focusReq)
  focusReqRef.current = focusReq
  const aoiKmRef = useRef(aoiKm)
  aoiKmRef.current = aoiKm
  const onTerrainRef = useRef(onTerrain)
  onTerrainRef.current = onTerrain
  useEffect(() => {
    if (!divRef.current || !sim?.ignition) return
    const div = divRef.current
    let ctx: Ctx | null = null
    let cancelled = false
    setReady(false)
    ;(async () => {
      try {
        ctx = await buildScene(div, sim, waters, opsAssets, communeFc, showRef.current, planRef.current, aoiKm ?? null, onFps, setNote, (s) => { try { onTerrainRef.current?.(s) } catch {} })
        if (cancelled) { destroyScene(ctx); ctx = null }
        else setReady(true)
      } catch (e: any) {
        if (!cancelled) onError(String(e?.message || e))
      }
    })()
    return () => { cancelled = true; if (ctx) destroyScene(ctx) }
    // rebuild on new ignition only — slider wind/temp changes update in place
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sim?.ignition?.lon, sim?.ignition?.lat])
  // live-update dynamic layers when sim payload or toggles change
  useEffect(() => {
    const d = (divRef.current as any)?._twin as Ctx | undefined
    if (d && sim) {
      updateDynamic(d, sim, waters, opsAssets, communeFc, showRef.current, planRef.current)
      try { onTerrainRef.current?.({ ...((d as any)._terrainStats || null), ...(d as any)._texInfo || null,
        lod: (d as any).quality || null, canopyPatches: (d as any)._canopyCount ?? null }) } catch {}
    }
  }, [sim, waters, opsAssets, communeFc, show, plan])
  // M2 Focus Fire/Water/Community/Route + orbit modes without rebuild.
  // M2: Focus Fire = fit AOI bounds (overview) — fire nằm trong cảnh,
  // không chiếm toàn cảnh, không focus ellipse. Named targets (nước/xã/
  // tuyến) zoom tactical vào điểm đó.
  useEffect(() => {
    const d = (divRef.current as any)?._twin as any
    if (!d || !focusKey) return
    const fr = focusReqRef.current
    if (!fr || typeof fr.lon !== 'number' || (fr as any).label === 'fire') {
      fitOverview(d)
      return
    }
    import('./twinMath').then(m => {
      const p = m.toLocal(fr.lon, fr.lat, d.origin)
      const frame = (tx: number, ty: number, tz: number) => {
        frameTactical(d, tx, ty, tz, aoiKmRef.current)
      }
      frame(p.x, d.sampler(p.x, p.z), p.z)
    })
  }, [focusKey])
  // M3: 2 mode — overview (toàn địa hình) / tactical (hiện trường).
  useEffect(() => {
    const d = (divRef.current as any)?._twin as any
    if (!d) return
    if (orbitMode === 'overview') {
      try { fitOverview(d) } catch {}
    } else if (orbitMode === 'tactical') {
      try {
        const t = d.controls.target
        frameTactical(d, t.x, t.y, t.z, aoiKmRef.current)
      } catch {}
    }
  }, [orbitMode])
  const onCamRef = useRef(onCam)
  onCamRef.current = onCam
  useEffect(() => {
    const d = (divRef.current as any)?._twin as any
    if (!d) return
    let last = 0
    const h = () => {
      const now = performance.now()
      if (now - last < 600) return
      last = now
      try {
        const agl = Math.max(0, Math.round(d.camera.position.y - d.controls.target.y))
        onCamRef.current?.(agl)
      } catch {}
    }
    d.controls.addEventListener('change', h)
    h()
    return () => { try { d.controls.removeEventListener('change', h) } catch {} }
  }, [sim?.ignition?.lon, sim?.ignition?.lat])
  useEffect(() => {
    const d = (divRef.current as any)?._twin as any
    if (!d || !sim) return
    if (!showRef.current.canopy) {
      const old = d.scene.getObjectByName('twin-canopy')
      if (old) {
        d.scene.remove(old)
        try { old.geometry?.dispose?.(); (old.material as any)?.dispose?.() } catch {}
      }
      d._canopyKey = null
      return
    }
    if (d._canopyKey === canopyOf(sim)) return
    d._canopyKey = canopyOf(sim)
    void import('./TwinLayers').then(m => m.buildCanopy(d, sim, d._texCanvas, d._block, true))
  }, [sim, show.canopy])
  return (
    <div ref={divRef} style={{ position: 'absolute', inset: 0, background: '#0B1412' }}>
      {!ready && <div className="skel-shimmer" style={{ position: 'absolute', inset: 0, zIndex: 5 }} aria-hidden />}
      {note && <div style={{ position: 'absolute', bottom: 8, left: 8, background: 'rgba(11,20,18,0.85)', color: '#FDE68A', fontSize: 11, padding: '4px 10px', borderRadius: 8, zIndex: 6 }}>{note}</div>}
      {/* M4 zoom controls — góc dưới-phải, sát đáy; timeline chừa gutter
          phải nên không bao giờ chồng nhau (không dùng offset cứng). */}
      <div style={{ position: 'absolute', right: 12, bottom: 12, zIndex: 7, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <button aria-label="Zoom in" title="Phóng to"
          onClick={() => { const d = (divRef.current as any)?._twin as any; if (d) dollyView(d, 0.75) }}
          style={{ width: 36, height: 36, borderRadius: 999, border: '1px solid #E2E8E5', background: 'rgba(255,255,255,0.95)', fontSize: 18, fontWeight: 800, cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>＋</button>
        <button aria-label="Zoom out" title="Thu nhỏ"
          onClick={() => { const d = (divRef.current as any)?._twin as any; if (d) dollyView(d, 1.33) }}
          style={{ width: 36, height: 36, borderRadius: 999, border: '1px solid #E2E8E5', background: 'rgba(255,255,255,0.95)', fontSize: 18, fontWeight: 800, cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>－</button>
        <button aria-label="Focus fire" title="Về lại hiện trường cháy"
          onClick={() => { const d = (divRef.current as any)?._twin as any; if (d) { try { frameTactical(d, d.controls.target.x, d.controls.target.y, d.controls.target.z) } catch {} } }}
          style={{ width: 36, height: 36, borderRadius: 999, border: '1px solid #E2E8E5', background: 'rgba(255,255,255,0.95)', fontSize: 16, cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>🎯</button>
      </div>
    </div>
  )
}

function destroyScene(c: Ctx) {
  c.dead = true
  cancelAnimationFrame(c.raf)
  c.controls.dispose()
  c.scene.traverse((o: any) => {
    try {
      o.geometry?.dispose?.()
      const m = o.material
      if (Array.isArray(m)) m.forEach((x: any) => { x.map?.dispose?.(); x.dispose?.() })
      else { m?.map?.dispose?.(); m?.dispose?.() }
    } catch {}
  })
  try { c.renderer.dispose() } catch {}
  try { c.renderer.domElement.remove() } catch {}
}

async function buildScene(div: HTMLDivElement, sim: any, waters: any[], opsAssets: any[],
  communeFc: any, show: TwinShow, plan: any, aoiKmProp: number | null | undefined,
  onFps: (fps: number) => void, setNote: (s: string) => void,
  onTerrainCb?: (s: any) => void): Promise<Ctx> {
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
  // M9 aerial perspective scaled to AOI (subtle depth cue, not cinematic)
  const aoiKmB = aoiKmProp || 3
  scene.fog = new THREE.Fog(0xdfe9f0, aoiKmB * 1000 * 1.4, aoiKmB * 1000 * 3.5)
  const camera = new THREE.PerspectiveCamera(55, W / H, 10, 60000)
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  // User chạm vào là hủy tween camera đang bay (không giật quyền điều khiển).
  controls.addEventListener('start', () => { try { cancelAnimationFrame((controls as any)._tween) } catch {} })
  controls.maxPolarAngle = Math.PI * 0.49
  controls.minDistance = 300
  controls.maxDistance = 12000

  // M11 — sun + sky + fog (readability, not cinematic)
  scene.add(new THREE.HemisphereLight(0xcfe5ff, 0x3d4a35, 0.6))
  const sun = new THREE.DirectionalLight(0xfff2dd, 1.2)
  sun.position.set(-3000, 4000, 1500)
  if (quality === 'high') {
    sun.castShadow = true
    sun.shadow.mapSize.set(1024, 1024)
    Object.assign(sun.shadow.camera, { left: -3000, right: 3000, top: 3000, bottom: -3000, far: 12000 })
  }
  scene.add(sun)

  const origin = { lon: sim.ignition.lon, lat: sim.ignition.lat }
  const radiusKm = aoiRadiusKm(sim.spread?.steps)
  // <TerrainMesh /> — real DEM mesh (M1/M2), never a flat plane
  const terr = await TerrainMesh(origin, quality, aoiKmProp ?? undefined)
  try { onTerrainCb?.({ texStatus: (terr as any).texStatus, meshSegs: (terr as any).meshSegs }) } catch {}
  const { sampler, sizeM } = terr
  const world = new THREE.Group()
  const terrain = terr.mesh
  terrain.receiveShadow = quality === 'high'
  world.add(terrain)
  scene.add(world)
  const oy = sampler(0, 0)
  world.position.y = -oy // ignition ground ≈ y0
  const Hrel = (x: number, z: number) => sampler(x, z) - oy

  // M1 default = OVERVIEW: toàn bộ quả núi/AOI trong khung ngay khi mở.
  const c: Ctx = { renderer, scene, camera, controls, sampler: Hrel, origin,
    sizeM, raf: 0, dead: false, updaters: [], quality, weak,
    lowFpsSince: null, degraded: false, setFps: onFps, aoiKm: aoiKmProp ?? radiusKm }
  ;(div as any)._twin = c
  try { fitOverview(c, true) } catch {
    const agl0 = Math.min(400, Math.max(200, (aoiKmProp || radiusKm) * 130))
    const hz0 = agl0 / Math.tan((64 * Math.PI) / 180)
    camera.position.set(hz0 * 0.7, agl0, hz0 * 0.7)
    controls.target.set(0, 0, 0)
    controls.update()
  }

  // resize
  const ro = new ResizeObserver(() => {
    const w = div.clientWidth || 800, h = div.clientHeight || 500
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
  })
  ro.observe(div)
  const stopRO = () => ro.disconnect()
  ;(c as any)._stopRO = stopRO

  // main loop with fps guard (M12 auto-degrade)
  let last = performance.now(), frames = 0, acc = 0
  const loop = (t: number) => {
    if (c.dead) return
    c.raf = requestAnimationFrame(loop)
    if (document.hidden) { last = t; return }
    const dt = Math.min(0.05, (t - last) / 1000)
    last = t
    controls.update()
    for (const u of c.updaters) { try { u(t / 1000, dt) } catch {} }
    renderer.render(scene, camera)
    frames++; acc += dt
    if (acc >= 1) {
      const fps = Math.round(frames / acc)
      frames = 0; acc = 0
      onFps(fps)
      if (!c.degraded && fps < 25) {
        if (c.lowFpsSince === null) c.lowFpsSince = t
        else if (t - c.lowFpsSince > 3000) {
          c.degraded = true
          renderer.shadowMap.enabled = false
          renderer.setPixelRatio(1)
          setNote('Thiết bị yếu — đã tắt bóng đổ, giữ mô phỏng (đọc địa hình ưu tiên)')
        }
      } else c.lowFpsSince = null
    }
  }
  c.raf = requestAnimationFrame(loop)

  updateDynamic(c, sim, waters, opsAssets, communeFc, show, plan)
  ;(c as any)._texCanvas = terr.texCanvas
  ;(c as any)._block = terr.block
  ;(c as any)._texInfo = { texStatus: (terr as any).texStatus, meshSegs: (terr as any).meshSegs, exag: (terr as any).exag }
  ;(c as any)._canopyKey = null
  return c
}