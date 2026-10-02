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
  dashboard: ()=> req('/api/dashboard/green-economy').catch(()=> null),
  forestStats: ()=> req('/api/forest/statistics').catch(()=> null),
  riskOverview: ()=> req('/api/risk/overview').catch(()=> null),
  riskHistory: (unit:string)=> req(`/api/risk/history/${encodeURIComponent(unit)}`).catch(()=> null),
  riskProfile: (id:string)=> req(`/api/risk/${id}`).catch(()=> ({ overall_score: 62, overall_level:'HIGH', breakdown:{}})),
  alerts: ()=> req('/api/alerts-unified').catch(()=> []),
  alertList: (status?:string)=> req(`/api/alerts${status && status !== 'ALL' ? `?status=${status}` : ''}`).catch(()=> []),
  alertDetail: (id:string)=> req(`/api/alerts/${id}`),
  ackAlert: (id:string, actor = 'web-user')=> req(`/api/alerts/${id}/acknowledge`, { method:'POST', body: JSON.stringify({ actor_id: actor }) }),
  simWhatIf: (scenario:string, params:Record<string, unknown>)=> req('/api/simulate/what-if', { method:'POST', body: JSON.stringify({ scenario, params }) }),
  simResponse: (intervention:string)=> req('/api/simulate/response', { method:'POST', body: JSON.stringify({ intervention }) }),
  simCompare: (scenarios:unknown[])=> req('/api/simulate/scenario-comparison', { method:'POST', body: JSON.stringify({ scenarios }) }),
  scenarioCreate: (name:string, type:string, params:Record<string, unknown>)=> req('/api/scenarios', { method:'POST', body: JSON.stringify({ name, type, params }) }),
  scenarioGet: (id:string)=> req(`/api/scenarios/${id}`),
  scenarioScorecard: (id:string)=> req(`/api/scenarios/${id}/scorecard`),
  scenariosCompare: (ids:string[])=> req('/api/scenarios/compare', { method:'POST', body: JSON.stringify({ ids }) }),
  simCascade: (scenario:string)=> req('/api/simulate/cascade', { method:'POST', body: JSON.stringify({ scenario }) }),
  nlWhatIf: (question:string)=> req('/api/what-if', { method:'POST', body: JSON.stringify({ question }) }),
  aiHealth: ()=> req('/api/ai/health').catch(()=> null),
  aiFireRisk: (lat = 13.9, lon = 108.3)=> req('/api/ai/fire-risk', { method:'POST', body: JSON.stringify({ lat, lon }) }),
  aiWhatIf: (body:Record<string, unknown>)=> req('/api/ai/what-if', { method:'POST', body: JSON.stringify(body) }),
  aiPccc: (body:Record<string, unknown>)=> req('/api/ai/pccc/synthesis', { method:'POST', body: JSON.stringify(body) }),
  scenariosList: ()=> req('/api/scenarios').catch(()=> []),
  twinStates: (entity:string)=> req(`/api/digital-twin/states/${entity}`).catch(()=> null),
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
  mobileReport: (body:Record<string, unknown>)=> req('/api/community/mobile-report', { method:'POST', body: JSON.stringify(body) }),
  missions: ()=> req('/api/missions').catch(()=> []),
  createMission: (body:Record<string, unknown>)=> req('/api/missions', { method:'POST', body: JSON.stringify(body) }),
  recentPhotos: (limit = 6)=> req(`/api/forest/photos/recent?limit=${limit}`).catch(()=> ({ photos: [] })),
  approvals: ()=> req('/api/approvals').catch(()=> []),
  approveApproval: (id:string, reason?:string)=> {
    const tok = (()=>{ try{ return sessionStorage.getItem('ecogl_admin_token') }catch{ return null } })()
    return req(`/api/approvals/${id}/approve`, { method:'POST', headers: tok ? { Authorization:`Bearer ${tok}` } : {}, body: JSON.stringify({ reason: reason || 'approved' }) })
  },
  rejectApproval: (id:string, reason?:string)=> {
    const tok = (()=>{ try{ return sessionStorage.getItem('ecogl_admin_token') }catch{ return null } })()
    return req(`/api/approvals/${id}/reject`, { method:'POST', headers: tok ? { Authorization:`Bearer ${tok}` } : {}, body: JSON.stringify({ reason: reason || 'rejected' }) })
  },
  governance: ()=> req('/api/governance').catch(()=> null),
  assetsList: ()=> req('/api/assets').catch(()=> []),
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
  plans: ()=> req('/api/plans').catch(()=> []),
  planDetail: (id:string)=> req(`/api/plans/${id}`),
  createPlan: (goal:string)=> req('/api/plans', { method:'POST', body: JSON.stringify({ goal }) }),
  delegatePlan: (id:string)=> req(`/api/plans/${id}/delegate`, { method:'POST', body: JSON.stringify({}) }),
  simulatePlan: (id:string)=> req(`/api/plans/${id}/simulate`, { method:'POST', body: JSON.stringify({}) }),
  recommendPlan: (id:string)=> req(`/api/plans/${id}/recommend`, { method:'POST', body: JSON.stringify({}) }),
  sendFeedback: (body:Record<string, unknown>)=> req('/api/feedback', { method:'POST', body: JSON.stringify(body) }),
  learning: ()=> req('/api/learning').catch(()=> []),
  auditLog: ()=> req('/api/forest/audit').catch(()=> []),
  agentsStatus: ()=> req('/api/agents/status').catch(()=> []),
  toggleAgent: (name:string, enabled:boolean)=> req(`/api/agents/${name}/toggle`, { method:'POST', body: JSON.stringify({ enabled }) }),
  runDemo: ()=> req('/api/demo/run', { method:'POST', body: JSON.stringify({}) }),
  resetDemo: ()=> req('/api/demo/reset', { method:'POST', body: JSON.stringify({}) }),
  registerUser: (username:string, password:string)=> req('/api/auth/register', { method:'POST', body: JSON.stringify({ username, password }) }),
  geeStatus: ()=> req('/api/earth-engine/status').catch(()=> ({ connected:false, reason:'NOT_CONNECTED' })),
  incidents: ()=> req('/api/incidents').catch(()=>[]),
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
