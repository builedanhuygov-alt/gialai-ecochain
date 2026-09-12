import { useEffect } from 'react'

// Part C — MapLibre-native 3D tactical layers (no three.js dependency).
// Decision: ellipses drape on MapLibre terrain (GPU, zero new deps, mobile-safe).
// Three.js migration trigger is documented in docs/FIRESIM.md — only when true
// volumetric particles are operationally required.
// Component names match the spec: FireSimulationLayer orchestrates
// FireEllipseMesh / WindVectorMesh / ThreatenedAssetMesh / RouteImpactMesh /
// ThreatenedCommunityMesh. Fire front particles live in FireFrontCanvas.

export type SimData = any

const IDS = ['fsim-ellipses', 'fsim-ignition', 'fsim-communities',
  'fsim-assets', 'fsim-routes', 'fsim-wind']
const SRC = (id: string) => `src-${id}`

function clear(map: any){
  for(const id of IDS){
    try{ if(map.getLayer(id)) map.removeLayer(id) }catch{}
    try{ if(map.getSource(SRC(id))) map.removeSource(SRC(id)) }catch{}
  }
}

export default function FireSimulationLayer({ map, data, show, communeFc, isMobile }: {
  map: any; data: SimData | null;
  show: { ellipses: boolean; assets: boolean; routes: boolean; communities: boolean; wind: boolean };
  communeFc?: any; isMobile?: boolean;
}){
  useEffect(()=>{
    if(!map || !data) return
    clear(map)
    try{
      // — FireEllipseMesh: current 🔴 / +1h 🟠 / +3h 🟡 / +6h ⚫ (server colors)
      if(show.ellipses){
        const feats = (data.spread?.steps || []).map((s: any)=> ({
          type:'Feature', properties:{ hour:s.hour, color:s.color, area_ha:s.area_ha },
          geometry: s.polygon,
        }))
        // ignition point first (bottom), then ellipses
        map.addSource(SRC('fsim-ignition'), { type:'geojson', data:{ type:'FeatureCollection', features:[{
          type:'Feature', properties:{}, geometry:{ type:'Point', coordinates:[data.ignition.lon, data.ignition.lat] } }] } } as any)
        map.addLayer({ id:'fsim-ignition', type:'circle', source:SRC('fsim-ignition'),
          paint:{ 'circle-radius':9, 'circle-color':'#DC2626', 'circle-stroke-color':'#fff', 'circle-stroke-width':3 } } as any)
        map.addSource(SRC('fsim-ellipses'), { type:'geojson', data:{ type:'FeatureCollection', features: feats } } as any)
        map.addLayer({ id:'fsim-ellipses', type:'fill', source:SRC('fsim-ellipses'),
          paint:{ 'fill-color':['get','color'], 'fill-opacity':0.32, 'fill-outline-color':['get','color'] } } as any)
      }
      // — ThreatenedCommunityMesh: REAL commune boundaries (public geojson,
      // light ~836KB) filtered to affected codes, colored by band. Mobile:
      // fills skipped (panel list only) — degradation path.
      if(show.communities && !isMobile && communeFc?.features){
        const bandByMa: Record<string, string> = {}
        for(const c of (data.communities || [])){
          const ma = String(c.code || '').replace(/^GL-/, '')
          bandByMa[ma] = c.color
        }
        const feats = (communeFc.features as any[]).filter((f: any)=> bandByMa[String(f.properties?.ma_xa)])
          .map((f: any)=> ({ type:'Feature',
            properties:{ name: f.properties?.ten_xa, color: bandByMa[String(f.properties?.ma_xa)] },
            geometry: f.geometry }))
        if(feats.length){
          map.addSource(SRC('fsim-communities'), { type:'geojson', data:{ type:'FeatureCollection', features: feats } } as any)
          map.addLayer({ id:'fsim-communities', type:'fill', source:SRC('fsim-communities'),
            paint:{ 'fill-color':['get','color'], 'fill-opacity':0.45, 'fill-outline-color':'#111' } } as any)
        }
      }
      // — ThreatenedAssetMesh: stations/waters as band-colored circles
      if(show.assets){
        const feats = [...(data.operational_threats || []), ...(data.water_threats || [])]
          .filter((t: any)=> typeof t.longitude === 'number' || typeof t.latitude === 'number')
          .map((t: any)=> {
            const lon = t.longitude ?? (t as any).lon
            const lat = t.latitude ?? (t as any).lat
            return { type:'Feature', properties:{ name:t.name, color:t.color, band:t.band },
              geometry:{ type:'Point', coordinates:[lon, lat] } }
          })
          .filter((f: any)=> typeof f.geometry.coordinates[0] === 'number')
        if(feats.length){
          map.addSource(SRC('fsim-assets'), { type:'geojson', data:{ type:'FeatureCollection', features: feats } } as any)
          map.addLayer({ id:'fsim-assets', type:'circle', source:SRC('fsim-assets'),
            paint:{ 'circle-radius':7, 'circle-color':['get','color'], 'circle-stroke-color':'#fff', 'circle-stroke-width':2 } } as any)
        }
      }
      // — RouteImpactMesh: band-colored lines (route geometry must be fetched
      // from /api/assets; sim payload carries survey fields but not geometry)
      if(show.routes){
        // placeholder source — filled by FireSim page via setData when routes load
        map.addSource(SRC('fsim-routes'), { type:'geojson', data:{ type:'FeatureCollection', features: [] } } as any)
        map.addLayer({ id:'fsim-routes', type:'line', source:SRC('fsim-routes'),
          paint:{ 'line-color':['get','color'], 'line-width':4 } } as any)
      }
      // — WindVectorMesh: schematic arrows along wind axis (symbol, rotated)
      if(show.wind && data.wind_layer){
        const { direction_deg, speed_kmh } = data.wind_layer
        const klon = 111.32 * Math.max(0.2, Math.cos(data.ignition.lat * Math.PI / 180))
        const feats = [1, 2, 3, 4, 5].map(k=> ({
          type:'Feature', properties:{ rot: direction_deg - 90 },
          geometry:{ type:'Point', coordinates:[
            data.ignition.lon + Math.sin(direction_deg * Math.PI / 180) * k * 1.5 / klon,
            data.ignition.lat + Math.cos(direction_deg * Math.PI / 180) * k * 1.5 / 111.32,
          ] },
        }))
        map.addSource(SRC('fsim-wind'), { type:'geojson', data:{ type:'FeatureCollection', features: feats } } as any)
        map.addLayer({ id:'fsim-wind', type:'symbol', source:SRC('fsim-wind'),
          layout:{ 'text-field':'➤', 'text-size': 18 + Math.min(14, speed_kmh), 'text-rotate':['get','rot'],
            'text-allow-overlap':true, 'text-font':['Open Sans Bold','Arial Unicode MS Bold'] },
          paint:{ 'text-color':'#0EA5E9', 'text-halo-color':'#fff', 'text-halo-width':1 } } as any)
      }
    }catch(e){ console.warn('firesim layers failed', e) }
    return ()=>{ try{ if(map) clear(map) }catch{} }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, data, communeFc, isMobile, show.ellipses, show.assets, show.routes, show.communities, show.wind])
  return null
}

// Push route LineStrings (from /api/assets) colored by sim band.
export function setRouteMesh(map: any, routes: any[], assetsById: Record<string, any>){
  try{
    if(!map || !map.getSource(SRC('fsim-routes'))) return
    const feats = (routes || [])
      .map((r: any)=> {
        const g = assetsById[r.id]?.geometry
        if(!g) return null
        return { type:'Feature', properties:{ name:r.route_name, color:r.color }, geometry: g }
      })
      .filter(Boolean)
    ;(map.getSource(SRC('fsim-routes')) as any).setData({ type:'FeatureCollection', features: feats })
  }catch(e){ console.warn('route mesh failed', e) }
}
