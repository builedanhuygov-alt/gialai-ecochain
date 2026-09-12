import { useEffect, useRef, useState } from 'react'
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

type Ctx = {
  renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera;
  controls: OrbitControls; sampler: (x: number, z: number)=>number;
  origin: { lon: number; lat: number }; sizeM: number; aoiKm: number;
  raf: number; dead: boolean;
  updaters: Array<(t: number, dt: number)=>void>; quality: 'high' | 'low';
  weak: boolean; lowFpsSince: number | null; degraded: boolean;
  setFps: (fps: number)=>void;
}

export default function TwinScene({ sim, waters, opsAssets, communeFc, show, plan, aoiKm, focusKey, focusReq, orbitMode, onError, onFps, onTerrain, onCam }: {
  sim: any; waters: any[]; opsAssets: any[];
  communeFc: any | null;
  show: TwinShow; plan?: any; aoiKm?: number | null; focusKey?: number;
  focusReq?: { key: number; lon: number; lat: number; label: string } | null;
  orbitMode?: 'tactical' | 'cinematic';
  onError: (msg: string)=>void; onFps: (fps: number)=>void; onTerrain?: (stats: any)=>void;
  onCam?: (aglM: number)=>void;
}){
  const divRef = useRef<HTMLDivElement>(null)
  const [note, setNote] = useState('')
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
  useEffect(()=>{
    if(!divRef.current || !sim?.ignition) return
    const div = divRef.current
    let ctx: Ctx | null = null
    let cancelled = false
    ;(async ()=>{
      try{
        ctx = await buildScene(div, sim, waters, opsAssets, communeFc, showRef.current, planRef.current, aoiKm ?? null, onFps, setNote, (s)=>{ try{ onTerrainRef.current?.(s) }catch{} })
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
    if(d && sim){
      updateDynamic(d, sim, waters, opsAssets, communeFc, showRef.current, planRef.current)
      try{ onTerrainRef.current?.({ ...((d as any)._terrainStats || null), ...(d as any)._texInfo || null,
        lod: (d as any).quality || null, canopyPatches: (d as any)._canopyCount ?? null }) }catch{}
    }
  }, [sim, waters, opsAssets, communeFc, show, plan])
  // Focus Fire/Water/Community/Route + orbit modes (M10) without rebuild.
  // M3 tactical framing: 200–400m AGL, pitch ~60–67° (not satellite view).
  useEffect(()=>{
    const d = (divRef.current as any)?._twin as any
    if(!d || !focusKey) return
    const frame = (tx: number, ty: number, tz: number)=>{
      const agl = Math.min(400, Math.max(200, (aoiKmRef.current || d.aoiKm || 2) * 130))
      const horiz = agl / Math.tan((64 * Math.PI) / 180)
      d.controls.target.set(tx, ty, tz)
      d.camera.position.set(tx + horiz * 0.7, ty + agl, tz + horiz * 0.7)
      d.controls.update()
    }
    const fr = focusReqRef.current
    if(fr && typeof fr.lon === 'number'){
      import('./twinMath').then(m=>{
        const p = m.toLocal(fr.lon, fr.lat, d.origin)
        frame(p.x, d.sampler(p.x, p.z), p.z)
      })
    } else frame(0, 0, 0)
  }, [focusKey])
  useEffect(()=>{
    const d = (divRef.current as any)?._twin as any
    if(!d) return
    d.controls.autoRotate = orbitMode === 'cinematic'
    d.controls.autoRotateSpeed = 0.7
  }, [orbitMode])
  const onCamRef = useRef(onCam)
  onCamRef.current = onCam
  useEffect(()=>{
    const d = (divRef.current as any)?._twin as any
    if(!d) return
    let last = 0
    const h = ()=>{
      const now = performance.now()
      if(now - last < 600) return
      last = now
      try{
        const agl = Math.max(0, Math.round(d.camera.position.y - d.controls.target.y))
        onCamRef.current?.(agl)
      }catch{}
    }
    d.controls.addEventListener('change', h)
    h()
    return ()=>{ try{ d.controls.removeEventListener('change', h) }catch{} }
  }, [sim?.ignition?.lon, sim?.ignition?.lat])
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
  communeFc: any, show: TwinShow, plan: any, aoiKmProp: number | null | undefined,
  onFps: (fps: number)=>void, setNote: (s: string)=>void,
  onTerrainCb?: (s: any)=>void): Promise<Ctx>{
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
  controls.maxPolarAngle = Math.PI * 0.49
  controls.minDistance = 300
  controls.maxDistance = 12000

  // M11 — sun + sky + fog (readability, not cinematic)
  scene.add(new THREE.HemisphereLight(0xcfe5ff, 0x3d4a35, 0.6))
  const sun = new THREE.DirectionalLight(0xfff2dd, 1.2)
  sun.position.set(-3000, 4000, 1500)
  if(quality === 'high'){
    sun.castShadow = true
    sun.shadow.mapSize.set(1024, 1024)
    Object.assign(sun.shadow.camera, { left:-3000, right:3000, top:3000, bottom:-3000, far:12000 })
  }
  scene.add(sun)

  const origin = { lon: sim.ignition.lon, lat: sim.ignition.lat }
  const radiusKm = aoiRadiusKm(sim.spread?.steps)
  // <TerrainMesh /> — real DEM mesh (M2/C), never a flat plane
  const terr = await TerrainMesh(origin, quality, aoiKmProp ?? undefined)
  try{ onTerrainCb?.({ texStatus: (terr as any).texStatus, meshSegs: (terr as any).meshSegs }) }catch{}
  const { sampler, sizeM } = terr
  const world = new THREE.Group()
  const terrain = terr.mesh
  terrain.receiveShadow = quality === 'high'
  world.add(terrain)
  scene.add(world)
  const oy = sampler(0, 0)
  world.position.y = -oy // ignition ground ≈ y0
  const Hrel = (x: number, z: number)=> sampler(x, z) - oy

  // M3 default tactical framing: 200–400m AGL, pitch ~64° (never satellite)
  const agl0 = Math.min(400, Math.max(200, (aoiKmProp || radiusKm) * 130))
  const hz0 = agl0 / Math.tan((64 * Math.PI) / 180)
  camera.position.set(hz0 * 0.7, agl0, hz0 * 0.7)
  controls.target.set(0, 0, 0)
  controls.update()

  const c: Ctx = { renderer, scene, camera, controls, sampler: Hrel, origin,
    sizeM, raf: 0, dead: false, updaters: [], quality, weak,
    lowFpsSince: null, degraded: false, setFps: onFps, aoiKm: aoiKmProp ?? radiusKm }
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

  updateDynamic(c, sim, waters, opsAssets, communeFc, show, plan)
  ;(c as any)._texCanvas = terr.texCanvas
  ;(c as any)._block = terr.block
  ;(c as any)._texInfo = { texStatus: (terr as any).texStatus, meshSegs: (terr as any).meshSegs, exag: (terr as any).exag }
  ;(c as any)._canopyKey = null
  return c
}
