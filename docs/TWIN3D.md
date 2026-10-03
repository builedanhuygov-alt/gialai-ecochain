# Twin3D — Interactive 3D Wildfire Digital Twin Simulator

Decision-support visualization, NOT physics (ELLIPTICAL_HEURISTIC_V1 +
published scenario factors). No fake data, no probabilities, no mock GPS,
no fake road network, no surveyed-trees invention.

## M1 Local terrain scene

- Arch: `TwinScene.tsx` — AOI = ignition ± radius (1–3km from sim extent,
  `aoiRadiusKm`), OrbitControls (rotate/tilt/zoom, damped, polar-clamped).
- React: mounted in FireSim 3D mode; full dispose on unmount/ignition change.
- Data: ignition from sim payload (user lon/lat inputs, no mock).
- Terrain gen: §M2. Perf: scene rebuild only on ignition move. Rollout: 2D
  default on mobile, 3D desktop.

## M2 3D terrain (real DEM, never flat)

- Arch: Terrarium DEM tiles (2×2 z14 ≈ 4.75km, fallback single z13) decoded
  client-side → Float32Array grid → displaced PlaneGeometry (129² high /
  65² low), exaggeration ×1.5 (labeled in UI).
- React: async build with honest error state (DEM fail → error panel + 2D
  fallback; flat plane explicitly refused).
- Data flow: tile bounds → grid → bilinear sampler reused for draping.
- Terrain gen: R*256+G+B/256−32768, min-normalized; slope shading via
  vertex colors (valley green → ridge tan) + Esri imagery texture drape.
- Perf: 16k/4k verts, one 512px texture. Migration: none (client-only).
- Risk: third-party tiles (Esri/S3) may block → error path, never fake mesh.

## M3 Forest layer (honest canopy proxy)

- Arch: `TwinLayers.buildCanopy` — samples imagery canvas, green-dominance
  test (`isCanopyPixel`), InstancedMesh cones (≤2500 high / 800 low),
  instanceColor variation. Rebuilds on ignition move only.
- Labeled ESTIMATED everywhere (UI caption + panel). No tree census exists;
  individual-tree rendering without survey would be fabrication.
- Perf: instancing (1 draw call), frustum culling default. Rollout: toggleable.

## M4 Fire ellipses on terrain

- Server polygons → THREE.ShapeGeometry draped per-vertex on the DEM
  (+10m/step lift, no z-fight). Colors: current red, +1h orange, +3h yellow,
  +6h dark gray. Wind/slope already baked server-side (verified math).

## M5 Animated front (THREE.Points)

- 1500/400 additive sprites travel ring1→ringN loop (wind drift inherent in
  ring geometry). Toggle + auto-off (reduced-motion, ≤4 cores, <640px).
  Schematic motion, labeled.

## M6 Wind arrows

- 5×5 ArrowHelpers, length ∝ speed, opacity bob animation. Schematic
  (positions on a grid, not a flow field) — labeled in code.

## M7 Threatened assets (Green/Yellow/Orange/Red)

- Water spheres / station-team boxes / watchtower cylinders via 3
  InstancedMeshes with per-instance band colors; routes as draped Lines;
  communes as draped real-boundary fills. Bands from the same sim payload
  as 2D (one sim updates both views). Out-of-AOI assets skipped (no fake
  placement).

## M8 Route impact

- Earliest containing step per route vertex (server) → line color + panel
  "Route expected impacted in X hours" (FireSim route list, shared with 2D).

## M9 Water access

- Dashed lines ignition→top-2 AVAILABLE waters + canvas-sprite ETA labels
  (real minutes from sim payload). Backup line gray.

## M10 Impact panel

- Shared FireSim state (area, communes, water/stations/routes hit,
  progression) + regenerated Response Plan + AI bulletin — Part D: one sim
  change updates 2D layers, 3D scene, impact, plan, bulletin together.

## M11 Visual quality

- Hemisphere + directional sun (shadows high-only), ACES tone mapping,
  distance fog, slope+imagery terrain shading. No bloom/postprocessing
  (readability > cinematic).

## M12 Performance

- Targets: 60 FPS desktop / 30 weak laptop. pixelRatio clamp (2/1), LOD
  terrain 129/65, instancing everywhere, frustum culling on, hidden-tab
  pause, RAF loop. Auto-degrade: fps<25 for 3s → shadows off + pixelRatio 1
  + notice (terrain readability preserved). FPS shown in legend.
- Component tree: FireSim → TwinScene → buildScene/updateDynamic +
  FireSimLayers (2D) / FireFrontCanvas (2D). Data flow: sliders → (debounced)
  POST /api/simulate/fire → sim state → 2D layers + 3D scene + impact + plan.
