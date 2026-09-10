const BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

async function req(path: string, init?: RequestInit) {
  const r = await fetch(`${BASE}${path}`, { headers: { 'Content-Type': 'application/json', ...(init?.headers||{}) }, ...init })
  if(!r.ok) throw new Error(`${r.status} ${await r.text()}`)
  return r.json()
}

export const api = {
  dashboard: ()=> req('/api/dashboard/green-economy').catch(()=> null),
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
  scenariosList: ()=> req('/api/scenarios').catch(()=> []),
  twinStates: (entity:string)=> req(`/api/digital-twin/states/${entity}`).catch(()=> null),
  communeLevels: (units:{id?:string;name:string;lat:number;lon:number}[])=> req('/api/fire/commune-levels', { method:'POST', body: JSON.stringify({ units }) }),
  proposals: (status?:string)=> req(`/api/forest/proposals${status ? `?status=${status}` : ''}`).catch(()=> []),
  proposalDetail: (id:string)=> req(`/api/forest/proposals/${id}`),
  confirmProposal: (id:string, body:Record<string, unknown>)=> req(`/api/forest/proposals/${id}/community-confirm`, { method:'POST', body: JSON.stringify(body) }),
  mobileReport: (body:Record<string, unknown>)=> req('/api/community/mobile-report', { method:'POST', body: JSON.stringify(body) }),
  missions: ()=> req('/api/missions').catch(()=> []),
  createMission: (body:Record<string, unknown>)=> req('/api/missions', { method:'POST', body: JSON.stringify(body) }),
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
  forestHealth: ()=> Promise.resolve({ healthy:78.4, trend:2.8 }),
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
