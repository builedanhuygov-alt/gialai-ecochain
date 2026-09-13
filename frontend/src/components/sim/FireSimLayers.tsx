import { useEffect, useRef } from 'react'

// Part C — MapLibre-native 2D tactical layers with improved visual clarity.
// Isochrone fire spread, directional wind flow, distinct asset icons, AOI boundary, viewport legend.

export type SimData = any

const IDS = [
  'fsim-ellipses-fill', 'fsim-ellipses-outline', 'fsim-ignition',
  'fsim-spread-direction', 'fsim-wind-flow', 'fsim-wind-corridor',
  'fsim-communities', 'fsim-assets', 'fsim-routes',
  'fsim-aoi-boundary', 'fsim-legend'
]
const SRC = (id: string) => `src-${id}`

// Color stops for isochrone gradient: current (opaque red) → +1h (orange) → +3h (amber) → +6h (gray)
const STEP_COLORS: Record<number, string> = {
  0: '#DC2626',   // hiện tại - solid red
  1: '#F97316',   // +1h - orange
  3: '#EAB308',   // +3h - amber/yellow
  6: '#525252',   // +6h - neutral gray
  12: '#1E293B',  // +12h - dark slate
}

// Opacity per time step for isochrone layering
const STEP_OPACITY: Record<number, number> = {
  0: 0.85,   // current: prominent
  1: 0.55,   // +1h: clear
  3: 0.35,   // +3h: visible
  6: 0.22,   // +6h: subtle
  12: 0.15,  // +12h: faint
}

// Dark outline color for fire polygons (contrast against terrain)
const FIRE_OUTLINE = '#1a1a1a'

function clear(map: any) {
  for (const id of IDS) {
    try { if (map.getLayer(id)) map.removeLayer(id) } catch {}
    try { if (map.getSource(SRC(id))) map.removeSource(SRC(id)) } catch {}
  }
}

// Generate SVG icon for asset types (fixed screen-space, distinct shapes)
function assetIconSvg(kind: string, color: string): string {
  const icons: Record<string, string> = {
    station: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="28" height="28"><path d="M12 2L2 7v10l10 5 10-5V7L12 2zm0 2.18l7.45 3.72v8.19l-7.45 3.72-7.45-3.72V7.9L12 4.18z" fill="${color}" stroke="#fff" stroke-width="1.5"/><rect x="7" y="11" width="10" height="8" fill="#fff" opacity="0.2"/></svg>`,
    team: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="28" height="28"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="${color}" stroke="#fff" stroke-width="1.5"/></svg>`,
    watchtower: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="28" height="28"><path d="M12 2L3 7v10l9 5 9-5V7L12 2zm0 2.18l6.9 3.45v8.37l-6.9 3.45L5.1 12.63V4.26L12 4.18z" fill="${color}" stroke="#fff" stroke-width="1.5"/><polygon points="12,6 10,10 14,10" fill="#fff" opacity="0.3"/></svg>`,
    water: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="28" height="28"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z" fill="${color}" stroke="#fff" stroke-width="1.5"/></svg>`,
    default: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><circle cx="12" cy="12" r="9" fill="${color}" stroke="#fff" stroke-width="2"/></svg>`,
  }
  return icons[kind] || icons.default
}

// Generate wind compass SVG (top-right widget)
function windCompassSvg(directionDeg: number, speedKmh: number): string {
  const rot = directionDeg - 90 // MapLibre rotates 0° = North, SVG 0° = East
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
    <defs>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#000" flood-opacity="0.3"/>
      </filter>
    </defs>
    <circle cx="32" cy="32" r="30" fill="rgba(255,255,255,0.95)" stroke="#E2E8E5" stroke-width="1.5" filter="url(#shadow)"/>
    <!-- Cardinal directions -->
    <g font-size="9" fill="#64748B" font-family="system-ui, sans-serif" text-anchor="middle" dominant-baseline="middle">
      <text x="32" y="10">N</text>
      <text x="32" y="54">S</text>
      <text x="10" y="34">W</text>
      <text x="54" y="34">E</text>
    </g>
    <!-- Wind arrow pointing DOWNWIND (direction wind blows TO) -->
    <g transform="rotate(${rot} 32 32)" filter="url(#shadow)">
      <path d="M32 8 L26 20 L30 20 L30 36 L34 36 L34 20 L38 20 Z" fill="#0EA5E9" stroke="#0369A1" stroke-width="1.5"/>
      <circle cx="32" cy="32" r="6" fill="#0EA5E9"/>
    </g>
    <!-- Speed badge -->
    <text x="32" y="58" font-size="10" fill="#0B1412" font-weight="bold" text-anchor="middle" font-family="system-ui, sans-serif">${Math.round(speedKmh)} km/h</text>
  </svg>`
}

// Generate AOI boundary as a glowing polygon
function createAoiBoundary(ignition: { lon: number; lat: number }, aoiKm: number, windDir?: number): any {
  // Create an ellipse elongated slightly in wind direction
  const center = [ignition.lon, ignition.lat]
  const radiusKm = aoiKm
  const klon = 111.32 * Math.max(0.2, Math.cos(ignition.lat * Math.PI / 180))
  const klat = 111.32
  
  let elongation = 1.0
  let rotation = 0
  if (windDir !== undefined) {
    elongation = 1.3 // 30% longer downwind
    rotation = windDir
  }
  
  const points = []
  for (let i = 0; i <= 64; i++) {
    const angle = (i / 64) * Math.PI * 2
    const rx = (radiusKm / klon) * (i % 2 === 0 ? elongation : 1.0)
    const ry = radiusKm / klat
    const x = center[0] + rx * Math.sin(angle + rotation * Math.PI / 180)
    const y = center[1] + ry * Math.cos(angle + rotation * Math.PI / 180)
    points.push([x, y])
  }
  points.push(points[0]) // close ring
  
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'Polygon', coordinates: [points] }
  }
}

export default function FireSimulationLayer({ map, data, show, communeFc, isMobile, aoiKm = 3 }: {
  map: any; data: SimData | null;
  show: { ellipses: boolean; assets: boolean; routes: boolean; communities: boolean; wind: boolean };
  communeFc?: any; isMobile?: boolean; aoiKm?: number;
}) {
  const legendRef = useRef<HTMLDivElement>(null)
  
  useEffect(() => {
    if (!map || !data) return
    clear(map)
    try {
      const ignition = data.ignition
      const windDir = data.wind_layer?.direction_deg ?? data.scenario?.wind_direction_deg ?? 90
      const windSpeed = data.wind_layer?.speed_kmh ?? data.scenario?.wind_speed_kmh ?? 0
      const steps = data.spread?.steps || []
      
      // 1. ISOCHRONE FIRE SPREAD — filled polygons with gradient opacity
      if (show.ellipses) {
        const feats = steps.map((s: any) => ({
          type: 'Feature',
          properties: { hour: s.hour, color: STEP_COLORS[s.hour] || '#F97316', area_ha: s.area_ha },
          geometry: s.polygon,
        }))
        
        // Ignition point (bottom layer)
        map.addSource(SRC('fsim-ignition'), { 
          type: 'geojson', 
          data: { type: 'FeatureCollection', features: [{
            type: 'Feature', properties: {}, 
            geometry: { type: 'Point', coordinates: [ignition.lon, ignition.lat] }
          }] } 
        } as any)
        map.addLayer({ 
          id: 'fsim-ignition', type: 'circle', source: SRC('fsim-ignition'),
          paint: { 
            'circle-radius': 10, 
            'circle-color': '#DC2626', 
            'circle-stroke-color': '#fff', 
            'circle-stroke-width': 3,
            'circle-opacity': 1,
            'circle-blur': 0.3 
          } 
        } as any)
        
        // Isochrone fill layer — gradient by time step
        map.addSource(SRC('fsim-ellipses-fill'), { 
          type: 'geojson', 
          data: { type: 'FeatureCollection', features: feats } 
        } as any)
        map.addLayer({ 
          id: 'fsim-ellipses-fill', type: 'fill', source: SRC('fsim-ellipses-fill'),
          paint: { 
            'fill-color': ['get', 'color'],
            'fill-opacity': [
              'match', ['get', 'hour'],
              0, 0.85, 1, 0.55, 3, 0.35, 6, 0.22, 12, 0.15, 0.15
            ],
            'fill-outline-color': FIRE_OUTLINE,
            'fill-antialias': true
          } 
        } as any)
        
        // Crisp outline for each time step
        map.addLayer({ 
          id: 'fsim-ellipses-outline', type: 'line', source: SRC('fsim-ellipses-fill'),
          paint: { 
            'line-color': ['get', 'color'], 
            'line-width': ['match', ['get', 'hour'], 0, 3, 1, 2.5, 3, 2, 6, 1.5, 12, 1, 1.5],
            'line-opacity': ['match', ['get', 'hour'], 0, 1, 1, 0.9, 3, 0.8, 6, 0.7, 12, 0.6, 0.7],
            'line-dasharray': ['match', ['get', 'hour'], 0, [0, 0], [4, 3]] // solid current, dashed forecast
          } 
        } as any)
        
        // 2. DIRECTIONAL SPREAD INDICATOR — elongated flame shape pointing downwind
        if (steps.length > 1 && steps[0].polygon) {
          const ring1 = steps[0].polygon.coordinates[0]
          const ringN = steps[steps.length - 1].polygon.coordinates[0]
          // Compute centroid of current fire
          let cx = 0, cy = 0
          for (const p of ring1) { cx += p[0]; cy += p[1] }
          cx /= ring1.length; cy /= ring1.length
          // Compute centroid of final forecast
          let fx = 0, fy = 0
          for (const p of ringN) { fx += p[0]; fy += p[1] }
          fx /= ringN.length; fy /= ringN.length
          // Vector from current to forecast = spread direction
          const dx = fx - cx, dy = fy - cy
          const dist = Math.hypot(dx, dy)
          if (dist > 0.0001) {
            // Create an elongated triangle (flame shape) pointing in spread direction
            const angle = Math.atan2(dx, dy) // bearing from current to forecast
            const length = Math.min(dist * 1.5, 0.03) // cap length
            const width = length * 0.4
            const tipX = cx + Math.sin(angle) * length
            const tipY = cy + Math.cos(angle) * length
            const baseLeftX = cx + Math.sin(angle - Math.PI/2) * width
            const baseLeftY = cy + Math.cos(angle - Math.PI/2) * width
            const baseRightX = cx + Math.sin(angle + Math.PI/2) * width
            const baseRightY = cy + Math.cos(angle + Math.PI/2) * width
            
            map.addSource(SRC('fsim-spread-direction'), { 
              type: 'geojson', 
              data: { type: 'FeatureCollection', features: [{
                type: 'Feature', properties: {},
                geometry: { type: 'Polygon', coordinates: [[
                  [tipX, tipY], [baseLeftX, baseLeftY], [baseRightX, baseRightY], [tipX, tipY]
                ]] }
              }] } 
            } as any)
            map.addLayer({ 
              id: 'fsim-spread-direction', type: 'fill', source: SRC('fsim-spread-direction'),
              paint: { 
                'fill-color': '#DC2626', 
                'fill-opacity': 0.9,
                'fill-outline-color': '#fff',
                'fill-antialias': true
              } 
            } as any)
            // Pulsing glow behind the flame indicator
            map.addLayer({ 
              id: 'fsim-spread-direction-glow', type: 'fill', source: SRC('fsim-spread-direction'),
              paint: { 
                'fill-color': '#DC2626', 
                'fill-opacity': 0.3,
                'fill-translate': ['interpolate', ['linear'], ['zoom'], 10, [0, 0], 14, [0, 0]],
                'fill-translate-anchor': 'map'
              } 
            } as any)
            // Animate glow pulse
            let glowPhase = 0
            const glowInterval = setInterval(() => {
              if (!map || !map.getLayer('fsim-spread-direction-glow')) { clearInterval(glowInterval); return }
              glowPhase = (glowPhase + 0.1) % (Math.PI * 2)
              const opacity = 0.15 + 0.15 * Math.sin(glowPhase)
              map.setPaintProperty('fsim-spread-direction-glow', 'fill-opacity', opacity)
            }, 100)
            return () => { clearInterval(glowInterval) }
          }
        }
      }
      
      // 3. WIND FLOW VISUALIZATION — animated flow lines + compass widget
      if (show.wind && data.wind_layer) {
        const { direction_deg, speed_kmh } = data.wind_layer
        const klon = 111.32 * Math.max(0.2, Math.cos(ignition.lat * Math.PI / 180))
        
        // Wind flow lines (streamlines) - multiple parallel lines showing flow
        const flowFeats = []
        const numLines = 5
        const lineLength = 3.0 // km
        for (let i = 0; i < numLines; i++) {
          const offset = (i - (numLines - 1) / 2) * 0.8 / klon
          const perpAngle = (direction_deg - 90) * Math.PI / 180
          const coords = []
          for (let k = 0; k <= 10; k++) {
            const t = k / 10
            const baseLon = ignition.lon + Math.sin(direction_deg * Math.PI / 180) * t * lineLength / klon
            const baseLat = ignition.lat + Math.cos(direction_deg * Math.PI / 180) * t * lineLength / 111.32
            const lon = baseLon + Math.sin(perpAngle) * offset
            const lat = baseLat + Math.cos(perpAngle) * offset
            coords.push([lon, lat])
          }
          flowFeats.push({
            type: 'Feature',
            properties: { speed: speed_kmh },
            geometry: { type: 'LineString', coordinates: coords }
          })
        }
        
        map.addSource(SRC('fsim-wind-flow'), { 
          type: 'geojson', 
          data: { type: 'FeatureCollection', features: flowFeats } 
        } as any)
        map.addLayer({ 
          id: 'fsim-wind-flow', type: 'line', source: SRC('fsim-wind-flow'),
          paint: { 
            'line-color': '#0EA5E9',
            'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1.5, 12, 2.5, 16, 4],
            'line-opacity': 0.7,
            'line-dasharray': [8, 4],
            'line-blur': 0.5
          } 
        } as any)
        
        // Wind corridor outline (from server)
        const corr = data.wind_corridor?.polygon
        if (corr?.coordinates?.[0]?.length) {
          map.addSource(SRC('fsim-wind-corridor'), { 
            type: 'geojson', 
            data: { type: 'FeatureCollection', features: [{
              type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: corr.coordinates }
            }] } 
          } as any)
          map.addLayer({ 
            id: 'fsim-wind-corridor', type: 'line', source: SRC('fsim-wind-corridor'),
            paint: { 
              'line-color': '#06B6D4', 
              'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1.5, 12, 2.5],
              'line-dasharray': [6, 4],
              'line-opacity': 0.6
            } 
          } as any)
        }
        
        // Wind compass widget (top-right) - rendered as image layer
        const compassSvg = windCompassSvg(direction_deg, speed_kmh)
        const compassImg = 'data:image/svg+xml;base64,' + btoa(compassSvg)
        map.addSource(SRC('fsim-legend'), { 
          type: 'image', 
          url: compassImg,
          coordinates: [
            [ignition.lon + 0.08, ignition.lat + 0.04], // top-right
            [ignition.lon + 0.14, ignition.lat + 0.04],
            [ignition.lon + 0.14, ignition.lat - 0.04],
            [ignition.lon + 0.08, ignition.lat - 0.04]
          ] 
        } as any)
        map.addLayer({ 
          id: 'fsim-legend', type: 'raster', source: SRC('fsim-legend'),
          paint: { 'raster-opacity': 0.95 }
        } as any)
      }
      
      // 4. COMMUNITIES — thin outline + label, fade at high zoom
      if (show.communities && !isMobile && communeFc?.features) {
        const bandByMa: Record<string, string> = {}
        for (const c of (data.communities || [])) {
          const ma = String(c.code || '').replace(/^GL-/, '')
          bandByMa[ma] = c.color
        }
        const feats = (communeFc.features as any[])
          .filter((f: any) => bandByMa[String(f.properties?.ma_xa)])
          .map((f: any) => ({
            type: 'Feature',
            properties: { name: f.properties?.ten_xa, color: bandByMa[String(f.properties?.ma_xa)] },
            geometry: f.geometry
          }))
        if (feats.length) {
          map.addSource(SRC('fsim-communities'), { 
            type: 'geojson', 
            data: { type: 'FeatureCollection', features: feats } 
          } as any)
          // Fill (subtle)
          map.addLayer({ 
            id: 'fsim-communities-fill', type: 'fill', source: SRC('fsim-communities'),
            paint: { 
              'fill-color': ['get', 'color'], 
              'fill-opacity': 0.08,
              'fill-outline-color': '#111' 
            } 
          } as any)
          // Outline
          map.addLayer({ 
            id: 'fsim-communities-outline', type: 'line', source: SRC('fsim-communities'),
            paint: { 
              'line-color': '#111', 
              'line-width': 1.5,
              'line-opacity': 0.6
            } 
          } as any)
          // Labels - fade out at high zoom
          map.addLayer({ 
            id: 'fsim-communities-labels', type: 'symbol', source: SRC('fsim-communities'),
            layout: { 
              'text-field': ['get', 'name'],
              'text-size': 11,
              'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
              'text-allow-overlap': true,
              'text-variable-anchor': ['top', 'bottom', 'left', 'right'],
              'text-offset': [0, 1.2]
            },
            paint: { 
              'text-color': '#1E293B',
              'text-halo-color': '#fff',
              'text-halo-width': 2,
              'text-opacity': ['interpolate', ['linear'], ['zoom'], 10, 0.9, 13, 0.3, 15, 0]
            },
            minzoom: 9
          } as any)
        }
      }
      
      // 5. ASSETS — distinct SVG icons per type, fixed screen size
      if (show.assets) {
        const assetFeats = [...(data.operational_threats || []), ...(data.water_threats || [])]
          .filter((t: any) => typeof t.longitude === 'number' || typeof t.latitude === 'number')
          .map((t: any) => {
            const lon = t.longitude ?? (t as any).lon
            const lat = t.latitude ?? (t as any).lat
            const kind = t.asset_type || (t.id?.startsWith('water') ? 'water' : 'default')
            return { 
              type: 'Feature', 
              properties: { name: t.name, color: t.color, band: t.band, kind },
              geometry: { type: 'Point', coordinates: [lon, lat] } 
            }
          })
          .filter((f: any) => typeof f.geometry.coordinates[0] === 'number')
        
        if (assetFeats.length) {
          map.addSource(SRC('fsim-assets'), { 
            type: 'geojson', 
            data: { type: 'FeatureCollection', features: assetFeats } 
          } as any)
          // Use symbol layer with SVG icons for fixed screen-space sizing
          for (const kind of ['station', 'team', 'watchtower', 'water', 'default']) {
            const kindFeats = assetFeats.filter(f => f.properties.kind === kind)
            if (!kindFeats.length) continue
            map.addSource(SRC(`fsim-assets-${kind}`), { 
              type: 'geojson', 
              data: { type: 'FeatureCollection', features: kindFeats } 
            } as any)
            // Generate icon image dynamically
            const iconSvg = assetIconSvg(kind, '#DC2626') // color overridden by icon-color
            const iconImg = 'data:image/svg+xml;base64,' + btoa(iconSvg)
            const iconId = `fsim-icon-${kind}`
            if (!map.hasImage(iconId)) {
              map.addImage(iconId, new Image(), { pixelRatio: 2 })
              const img = new Image()
              img.onload = () => { map.updateImage(iconId, img) }
              img.src = iconImg
            }
            map.addLayer({ 
              id: `fsim-assets-${kind}`, type: 'symbol', source: SRC(`fsim-assets-${kind}`),
              layout: { 
                'icon-image': iconId,
                'icon-size': 1.0,
                'icon-allow-overlap': true,
                'icon-ignore-placement': true,
                'icon-anchor': 'bottom'
              },
              paint: { 
                'icon-color': ['get', 'color'],
                'icon-halo-color': '#fff',
                'icon-halo-width': 1.5,
                'icon-opacity': 0.95
              }
            } as any)
          }
        }
      }
      
      // 6. ROUTES — band-colored with white casing for contrast
      if (show.routes) {
        map.addSource(SRC('fsim-routes'), { 
          type: 'geojson', 
          data: { type: 'FeatureCollection', features: [] } 
        } as any)
        // Casing (white outline)
        map.addLayer({ 
          id: 'fsim-routes-casing', type: 'line', source: SRC('fsim-routes'),
          paint: { 
            'line-color': '#fff', 
            'line-width': ['interpolate', ['linear'], ['zoom'], 8, 5, 12, 7, 16, 10]
          } 
        } as any)
        // Core (band color)
        map.addLayer({ 
          id: 'fsim-routes', type: 'line', source: SRC('fsim-routes'),
          paint: { 
            'line-color': ['get', 'color'], 
            'line-width': ['interpolate', ['linear'], ['zoom'], 8, 3, 12, 5, 16, 8]
          } 
        } as any)
      }
      
      // 7. AOI BOUNDARY — thick glow line + subtle interior fill
      if (ignition) {
        const aoiFeat = createAoiBoundary(ignition, aoiKm, windDir)
        map.addSource(SRC('fsim-aoi-boundary'), { 
          type: 'geojson', 
          data: { type: 'FeatureCollection', features: [aoiFeat] } 
        } as any)
        // Interior fill (very subtle)
        map.addLayer({ 
          id: 'fsim-aoi-fill', type: 'fill', source: SRC('fsim-aoi-boundary'),
          paint: { 
            'fill-color': '#0EA5E9', 
            'fill-opacity': 0.04 
          } 
        } as any)
        // Boundary line with glow effect (two layers)
        map.addLayer({ 
          id: 'fsim-aoi-glow', type: 'line', source: SRC('fsim-aoi-boundary'),
          paint: { 
            'line-color': '#0EA5E9', 
            'line-width': ['interpolate', ['linear'], ['zoom'], 8, 6, 12, 10, 16, 16],
            'line-opacity': 0.3,
            'line-blur': 4
          } 
        } as any)
        map.addLayer({ 
          id: 'fsim-aoi-boundary', type: 'line', source: SRC('fsim-aoi-boundary'),
          paint: { 
            'line-color': '#0EA5E9', 
            'line-width': ['interpolate', ['linear'], ['zoom'], 8, 3, 12, 4, 16, 6],
            'line-opacity': 0.9,
            'line-dasharray': [8, 4]
          } 
        } as any)
      }
      
    } catch (e) { console.warn('firesim layers failed', e) }
    return () => { try { if (map) clear(map) } catch {} }
  }, [map, data, communeFc, isMobile, show.ellipses, show.assets, show.routes, show.communities, show.wind, aoiKm])
  
  return null
}

// Push route LineStrings (from /api/assets) colored by sim band.
export function setRouteMesh(map: any, routes: any[], assetsById: Record<string, any>) {
  try {
    if (!map || !map.getSource(SRC('fsim-routes'))) return
    const feats = (routes || [])
      .map((r: any) => {
        const g = assetsById[r.id]?.geometry
        if (!g) return null
        return { type: 'Feature', properties: { name: r.route_name, color: r.color }, geometry: g }
      })
      .filter(Boolean)
    ;(map.getSource(SRC('fsim-routes')) as any).setData({ type: 'FeatureCollection', features: feats })
  } catch (e) { console.warn('route mesh failed', e) }
}