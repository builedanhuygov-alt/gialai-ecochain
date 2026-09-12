// Pure helpers for the 3D twin scene — no DOM, no three.js, fully unit-tested.
// All geographic math is Web-Mercator; elevation decode is Mapzen Terrarium.

export const BAND_COLORS_3D: Record<string, string> = {
  CRITICAL: '#DC2626', THREATENED: '#F97316', WATCH: '#EAB308', SAFE: '#22C55E',
}

export const STEP_COLORS_3D: Record<number, string> = {
  0: '#DC2626', 1: '#F97316', 3: '#EAB308', 6: '#525252',
}

// AOI radius from sim extent: half of max ellipse length + 0.5km margin,
// clamped to 1–3km per spec (1km x 1km .. 3km x 3km scenes).
export function aoiRadiusKm(steps: any[]): number {
  let longest = 0
  for(const s of steps || []){
    if(typeof s?.length_km === 'number' && s.length_km > longest) longest = s.length_km
  }
  const r = longest / 2 + 0.5
  return Math.min(3, Math.max(1, r))
}

export function lonLatToTile(lon: number, lat: number, z: number){
  const n = Math.pow(2, z)
  const x = Math.floor(((lon + 180) / 360) * n)
  const latR = (lat * Math.PI) / 180
  const y = Math.floor(((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2) * n)
  return { x, y, z }
}

export function tileToLonLat(x: number, y: number, z: number){
  const n = Math.pow(2, z)
  const lon = (x / n) * 360 - 180
  const latR = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)))
  return { lon, lat: (latR * 180) / Math.PI }
}

// Mapzen Terrarium: height = R*256 + G + B/256 − 32768
export function terrariumToHeight(r: number, g: number, b: number){
  return r * 256 + g + b / 256 - 32768
}

// Meters per pixel at lat/z (Web-Mercator).
export function metersPerPixel(lat: number, z: number){
  return (156543.03 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, z)
}

// Local ENU meters of (lon,lat) relative to origin — scene units.
export function toLocal(lon: number, lat: number, origin: { lon: number; lat: number }){
  const kx = 111320 * Math.cos((origin.lat * Math.PI) / 180)
  const ky = 110540
  return { x: (lon - origin.lon) * kx, z: -((lat - origin.lat) * ky) }
}

// Canopy proxy from satellite RGB: green dominance (ESTIMATED, not a tree census).
export function isCanopyPixel(r: number, g: number, b: number){
  return g > r + 12 && g > b + 8 && g > 70
}

// Slope (rise/run) from a height grid for shading.
export function slopeAt(H: Float32Array, n: number, i: number, j: number, cell: number){
  const xm = H[j * n + Math.max(0, i - 1)], xp = H[j * n + Math.min(n - 1, i + 1)]
  const ym = H[Math.max(0, j - 1) * n + i], yp = H[Math.min(n - 1, j + 1) * n + i]
  const dx = (xp - xm) / (2 * cell), dy = (yp - ym) / (2 * cell)
  return Math.sqrt(dx * dx + dy * dy)
}
