// Single source of truth for the backend URL. VITE_API_BASE is baked in at
// build time (Vercel project env). The fallback MUST be a reachable production
// backend — never http://localhost:8000, which breaks the deployed site with
// mixed-content errors (the viewer's own machine has no backend running).
export const API_BASE = (import.meta.env.VITE_API_BASE || 'https://gialai-backend-fresh.vercel.app').replace(/\/$/, '')
const BASE = API_BASE

// Backend returns photo paths relative to its own origin (/api/forest/...);
// <img> tags need the absolute backend URL.
export const photoUrl = (rel?: string | null)=> rel ? `${API_BASE}${rel}` : ''

// Backend chạy serverless (Vercel) nên cold-start khi idle.
// warmBackend(): bắn fire-and-forget /api/ping ngay khi app load để đánh thức backend.
export function warmBackend() {
  try {
    fetch(`${API_BASE}/api/ping`, { method: 'GET', keepalive: true }).catch(() => {})
  } catch { /* ignore */ }
}
// Tự warm ngay khi module được import (mọi trang dùng api đều được hưởng).
if (typeof window !== 'undefined') {
  try { warmBackend() } catch { /* ignore */ }
}

async function req(path: string, init?: RequestInit, retries = 2) {
  let lastErr: unknown = null
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController()
    // Cold-start Vercel có thể mất 10-20s lần đầu -> timeout 25s/lượt.
    const timer = setTimeout(() => ctrl.abort(), 25000)
    try {
      const r = await fetch(`${BASE}${path}`, { headers: { 'Content-Type': 'application/json', ...(init?.headers||{}) }, signal: ctrl.signal, ...init })
      clearTimeout(timer)
      // Chỉ retry khi lỗi retryable: 502/503/504 (cold-start / instance đang tỉnh).
      // 4xx/500 throw ngay để UI báo lỗi nhanh + test không bị chậm.
      if ((r.status === 502 || r.status === 503 || r.status === 504) && attempt < retries) {
        await new Promise(res => setTimeout(res, 800 * (attempt + 1)))
        continue
      }
      if(!r.ok) throw new Error(`${r.status} ${await r.text()}`)
      return r.json()
    } catch (e) {
      clearTimeout(timer)
      lastErr = e
      // Retry network error / abort (cold-start timeout), không retry lỗi HTTP thường.
      const msg = String((e as Error)?.message || '')
      const retryable = msg.startsWith('502') || msg.startsWith('503') || msg.startsWith('504')
        || (e as Error)?.name === 'AbortError' || msg.includes('Failed to fetch') || msg.includes('Network')
      if (retryable && attempt < retries) {
        await new Promise(res => setTimeout(res, 800 * (attempt + 1)))
        continue
      }
      throw e
    }
  }
  throw lastErr
}

export const api = {
  forestStats: ()=> req('/api/forest/statistics').catch(()=> null),
  alerts: ()=> req('/api/alerts-unified').catch(()=> []),
  fireRiskCalculate: (body:Record<string, unknown>)=> req('/api/fire-risk/calculate', { method:'POST', body: JSON.stringify(body) }),
  fireRiskBacktest: (params?:{start?:string;end?:string;threshold?:number})=> {
    const q = new URLSearchParams()
    if(params?.start) q.set('start', params.start)
    if(params?.end) q.set('end', params.end)
    if(params?.threshold !== undefined) q.set('threshold', String(params.threshold))
    const qs = q.toString()
    return req(`/api/fire-risk/backtest${qs ? `?${qs}` : ''}`).catch(()=> null)
  },
  fireRiskGrid: (params?:{cell_km?:number;bbox?:string})=> {
    const q = new URLSearchParams()
    if(params?.cell_km !== undefined) q.set('cell_km', String(params.cell_km))
    if(params?.bbox) q.set('bbox', params.bbox)
    const qs = q.toString()
    return req(`/api/fire-risk/grid${qs ? `?${qs}` : ''}`).catch(()=> null)
  },
  aiHealth: ()=> req('/api/ai/health').catch(()=> null),
  aiFireRisk: (lat = 13.9, lon = 108.3)=> req('/api/ai/fire-risk', { method:'POST', body: JSON.stringify({ lat, lon }) }),
  aiWhatIf: (body:Record<string, unknown>)=> req('/api/ai/what-if', { method:'POST', body: JSON.stringify(body) }),
  aiPccc: (body:Record<string, unknown>)=> req('/api/ai/pccc/synthesis', { method:'POST', body: JSON.stringify(body) }),
  communeLevels: (units:{id?:string;name:string;lat:number;lon:number}[])=> req('/api/fire/commune-levels', { method:'POST', body: JSON.stringify({ units }) }),
  weatherNow: (lat = 13.9, lon = 108.3)=> req(`/api/weather/current?lat=${lat}&lon=${lon}`).catch(()=> null),
  firmsLive: (lat = 13.9, lon = 108.3)=> req(`/api/fire/hotspots?lat=${lat}&lon=${lon}`).catch(()=> null),
  fireBrief: (name:string, lat:number, lon:number)=> req(`/api/fire/brief?administrative_unit_id=${encodeURIComponent(name)}&lat=${lat}&lon=${lon}`).catch(()=> null),
  forecastRating: (name:string, lat:number, lon:number, scope:'commune'|'district'|'province'='commune')=> req(`/api/fire/forecast-rating?administrative_unit_id=${encodeURIComponent(name)}&lat=${lat}&lon=${lon}&scope=${scope}`).catch(()=> null),
  responsePlan: (body:Record<string, unknown>)=> req('/api/v1/fires/response-plan', { method:'POST', body: JSON.stringify(body) }),
  firesim: (body:Record<string, unknown>)=> req('/api/simulate/fire', { method:'POST', body: JSON.stringify(body) }),
  stationsNearest: (lat:number, lon:number)=> req(`/api/stations/nearest?lat=${lat}&lon=${lon}`).catch(()=> null),
  routesNearest: (lat:number, lon:number)=> req(`/api/routes/nearest?lat=${lat}&lon=${lon}`).catch(()=> null),
  threatsUnified: (lat:number, lon:number)=> req(`/api/assets/threatened?lat=${lat}&lon=${lon}`).catch(()=> null),
  fwi: (lat:number, lon:number)=> req(`/api/fwi?lat=${lat}&lon=${lon}`).catch(()=> null),
  proposals: (status?:string)=> req(`/api/forest/proposals${status ? `?status=${status}` : ''}`).catch(()=> []),
  proposalDetail: (id:string)=> req(`/api/forest/proposals/${id}`),
  confirmProposal: (id:string, body:Record<string, unknown>)=> req(`/api/forest/proposals/${id}/community-confirm`, { method:'POST', body: JSON.stringify(body) }),
  missions: ()=> req('/api/missions').catch(()=> []),
  createMission: (body:Record<string, unknown>)=> req('/api/missions', { method:'POST', body: JSON.stringify(body) }),
  missionResult: (id:string, body:Record<string, unknown>)=> req(`/api/missions/${id}/result`, { method:'POST', body: JSON.stringify(body) }),
  missionStatus: (id:string, status:string)=> req(`/api/missions/${id}/status`, { method:'PATCH', body: JSON.stringify({ status }) }),
  recentPhotos: (limit = 6)=> req(`/api/forest/photos/recent?limit=${limit}`).catch(()=> ({ photos: [] })),
  sendFeedback: (body:Record<string, unknown>)=> req('/api/feedback', { method:'POST', body: JSON.stringify(body) }),
  auditLog: ()=> req('/api/forest/audit').catch(()=> []),
  registerUser: (username:string, password:string)=> req('/api/auth/register', { method:'POST', body: JSON.stringify({ username, password }) }),
  assetDetail: (id:string)=> req(`/api/assets/${id}/detail`),
  createAsset: (body:Record<string, unknown>)=> {
    const tok = (()=>{ try{ return sessionStorage.getItem('ecogl_admin_token') }catch{ return null } })()
    return req('/api/assets', { method:'POST', headers: tok ? { Authorization:`Bearer ${tok}` } : {}, body: JSON.stringify(body) })
  },
  deleteAsset: (id:string)=> {
    const tok = (()=>{ try{ return sessionStorage.getItem('ecogl_admin_token') }catch{ return null } })()
    return req(`/api/assets/${id}`, { method:'DELETE', headers: tok ? { Authorization:`Bearer ${tok}` } : {} })
  },
  patchAsset: (id:string, body:Record<string, unknown>)=> {
    const tok = (()=>{ try{ return sessionStorage.getItem('ecogl_admin_token') }catch{ return null } })()
    return req(`/api/assets/${id}`, { method:'PATCH', headers: tok ? { Authorization:`Bearer ${tok}` } : {}, body: JSON.stringify(body) })
  },
  stationsRegistry: ()=> req('/api/stations/registry').catch(()=> null),
  assetsContacts: ()=> req('/api/assets/contacts').catch(()=> null),
  opsGaps: ()=> req('/api/ops/gaps').catch(()=> null),
  communitiesThreatened: (lat:number, lon:number)=> req(`/api/communities/threatened?lat=${lat}&lon=${lon}`).catch(()=> null),
  assetsList: ()=> req('/api/assets').catch(()=> []),
  geeStatus: ()=> req('/api/earth-engine/status').catch(()=> ({ connected:false, reason:'NOT_CONNECTED' })),
  mapSearch: (q:string)=> req(`/api/search/global?q=${q}`).catch(()=>null),
}

export async function uploadProposalPhoto(id: string, file: File, uploaderId: string, lat?: number, lng?: number) {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('uploader_id', uploaderId)
  if(lat !== undefined) fd.append('lat', String(lat))
  if(lng !== undefined) fd.append('lng', String(lng))
  const r = await fetch(`${BASE}/api/forest/proposals/${id}/photos`, { method: 'POST', body: fd })
  if(!r.ok) throw new Error(`${r.status} ${await r.text()}`)
  return r.json()
}
