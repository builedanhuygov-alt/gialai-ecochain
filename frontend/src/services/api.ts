// Single source of truth for the backend URL. VITE_API_BASE is baked in at
// build time (Vercel project env). The fallback MUST be a reachable production
// backend — never http://localhost:8000, which breaks the deployed site with
// mixed-content errors (the viewer's own machine has no backend running).
export const API_BASE = (import.meta.env.VITE_API_BASE || 'https://gialai-backend-fresh.vercel.app').replace(/\/$/, '')
const BASE = API_BASE

// Backend returns photo paths relative to its own origin (/api/forest/...);
// <img> tags need the absolute backend URL.
export const photoUrl = (rel?: string | null)=> rel ? `${API_BASE}${rel}` : ''

async function req(path: string, init?: RequestInit) {
  const r = await fetch(`${BASE}${path}`, { headers: { 'Content-Type': 'application/json', ...(init?.headers||{}) }, ...init })
  if(!r.ok) throw new Error(`${r.status} ${await r.text()}`)
  return r.json()
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
  responsePlan: (body:Record<string, unknown>)=> req('/api/v1/fires/response-plan', { method:'POST', body: JSON.stringify(body) }),
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
  createAsset: (body:Record<string, unknown>)=> {
    const tok = (()=>{ try{ return sessionStorage.getItem('ecogl_admin_token') }catch{ return null } })()
    return req('/api/assets', { method:'POST', headers: tok ? { Authorization:`Bearer ${tok}` } : {}, body: JSON.stringify(body) })
  },
  deleteAsset: (id:string)=> {
    const tok = (()=>{ try{ return sessionStorage.getItem('ecogl_admin_token') }catch{ return null } })()
    return req(`/api/assets/${id}`, { method:'DELETE', headers: tok ? { Authorization:`Bearer ${tok}` } : {} })
  },
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
