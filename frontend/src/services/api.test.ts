import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from './api'

afterEach(() => {
  vi.unstubAllGlobals()
})

function mockFetch(ok: boolean, body: unknown, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok, status, text: async () => JSON.stringify(body), json: async () => body })),
  )
}

describe('api client', () => {
  it('returns json on success', async () => {
    mockFetch(true, { connected: true })
    await expect(api.geeStatus()).resolves.toEqual({ connected: true })
  })

  it('falls back instead of throwing when backend is down', async () => {
    mockFetch(false, { detail: 'boom' }, 500)
    await expect(api.geeStatus()).resolves.toEqual({ connected: false, reason: 'NOT_CONNECTED' })
    await expect(api.alerts()).resolves.toEqual([])
    await expect(api.incidents()).resolves.toEqual([])
  })

  it('riskProfile falls back to a default profile', async () => {
    mockFetch(false, {}, 503)
    const p = await api.riskProfile('x')
    expect(p.overall_level).toBe('HIGH')
  })

  it('alertList returns [] when backend is down', async () => {
    mockFetch(false, {}, 500)
    await expect(api.alertList()).resolves.toEqual([])
  })

  it('alertList passes through alerts on success', async () => {
    const rows = [{ id: 'a1', level: 'CRITICAL', status: 'ACTIVE', title: 'Cháy' }]
    mockFetch(true, rows)
    await expect(api.alertList()).resolves.toEqual(rows)
  })

  it('alertDetail throws on 404 so the page can show "not found"', async () => {
    mockFetch(false, { detail: 'Alert not found' }, 404)
    await expect(api.alertDetail('missing')).rejects.toThrow('404')
  })

  it('ackAlert posts acknowledge and returns new status', async () => {
    mockFetch(true, { id: 'a1', status: 'ACKNOWLEDGED' })
    await expect(api.ackAlert('a1')).resolves.toEqual({ id: 'a1', status: 'ACKNOWLEDGED' })
  })

  it('simWhatIf returns simulation result', async () => {
    const sim = { simulation_id: 's1', result: { affected: { villages: 12, roads: 3 } } }
    mockFetch(true, sim)
    await expect(api.simWhatIf('Flood', { rainfall: 20 })).resolves.toEqual(sim)
  })

  it('simResponse returns risk for an intervention', async () => {
    mockFetch(true, { intervention: 'Pre-position team', risk: 'MODERATE' })
    await expect(api.simResponse('Pre-position team')).resolves.toEqual({ intervention: 'Pre-position team', risk: 'MODERATE' })
  })

  it('scenarioCreate + scorecard wire WhatIfEngine', async () => {
    mockFetch(true, { id: 'sc1', name: 'Mưa lớn', type: 'DISASTER', version: 1 })
    await expect(api.scenarioCreate('Mưa lớn', 'DISASTER', { rainfall_pct: 30 })).resolves.toEqual({ id: 'sc1', name: 'Mưa lớn', type: 'DISASTER', version: 1 })
    mockFetch(true, { risk: 62, cost: 40, co2: 55, forest: 70, logistics: 60, resilience: 65 })
    const s = await api.scenarioScorecard('sc1')
    expect(s.risk).toBe(62)
  })

  it('scenariosCompare returns server-side comparison', async () => {
    mockFetch(true, { scenarios: [{ id: 'sc1', risk: 62 }], baseline: 'sc1' })
    await expect(api.scenariosCompare(['sc1'])).resolves.toEqual({ scenarios: [{ id: 'sc1', risk: 62 }], baseline: 'sc1' })
  })

  it('simCascade returns temporal + spatial chain', async () => {
    mockFetch(true, { cascade: ['EXTREME RAIN', 'FLOOD'], temporal: { 'T+0': 'Event' } })
    const c = await api.simCascade('Flood')
    expect(c.cascade).toContain('FLOOD')
  })

  it('nlWhatIf parses a Vietnamese question into params', async () => {
    mockFetch(true, { scenario_id: 'sc9', params: { rainfall: '+30%' }, requires_confirmation: true })
    const r = await api.nlWhatIf('Mưa lớn 30% thì sao?')
    expect(r.params.rainfall).toBe('+30%')
  })

  it('scenariosList falls back to [] and twinStates to null', async () => {
    mockFetch(false, {}, 500)
    await expect(api.scenariosList()).resolves.toEqual([])
    await expect(api.twinStates('gia-lai')).resolves.toBeNull()
  })

  it('proposals feed passes through, confirm posts vote', async () => {
    const rows = [{ id: 'p1', status: 'PENDING', title: 'Khói' }]
    mockFetch(true, rows)
    await expect(api.proposals()).resolves.toEqual(rows)
    mockFetch(true, { confirmation_id: 1, proposal_status: 'PENDING' })
    await expect(api.confirmProposal('p1', { user_id: 'u1', confirmed: true })).resolves.toEqual({ confirmation_id: 1, proposal_status: 'PENDING' })
  })

  it('proposalDetail throws on 404', async () => {
    mockFetch(false, { detail: 'Not found' }, 404)
    await expect(api.proposalDetail('missing')).rejects.toThrow('404')
  })

  it('sendFeedback posts a bug report and returns its id', async () => {
    mockFetch(true, { id: 7, status: 'OPEN' })
    await expect(api.sendFeedback({ category: 'bug', message: 'Nút X không bấm được' })).resolves.toEqual({ id: 7, status: 'OPEN' })
  })

  it('learning passes through lesson records, [] when down', async () => {
    mockFetch(true, [{ prediction: 'High Fire Risk', prediction_correct: false }])
    await expect(api.learning()).resolves.toEqual([{ prediction: 'High Fire Risk', prediction_correct: false }])
    mockFetch(false, {}, 500)
    await expect(api.learning()).resolves.toEqual([])
  })

  it('ops APIs: audit, agents, demo, register', async () => {
    mockFetch(true, [{ action: 'X', resource_type: 'y' }])
    await expect(api.auditLog()).resolves.toEqual([{ action: 'X', resource_type: 'y' }])
    mockFetch(true, [{ agent: 'ForestGuard', enabled: true }])
    await expect(api.agentsStatus()).resolves.toEqual([{ agent: 'ForestGuard', enabled: true }])
    mockFetch(true, { agent: 'ForestGuard', status: 'PAUSED' })
    await expect(api.toggleAgent('ForestGuard', false)).resolves.toEqual({ agent: 'ForestGuard', status: 'PAUSED' })
    mockFetch(true, { demo: '3-5 min', steps: [] })
    await expect(api.runDemo()).resolves.toEqual({ demo: '3-5 min', steps: [] })
    mockFetch(true, { status: 'Demo reset — production untouched' })
    await expect(api.resetDemo()).resolves.toEqual({ status: 'Demo reset — production untouched' })
    mockFetch(true, { id: 1, username: 'newbie', role: 'viewer', is_active: true })
    await expect(api.registerUser('newbie', 'secret123')).resolves.toEqual({ id: 1, username: 'newbie', role: 'viewer', is_active: true })
  })
  it('uploadProposalPhoto sends multipart and returns hash info', async () => {
    const { uploadProposalPhoto } = await import('./api')
    mockFetch(true, { photo_id: 1, is_duplicate: false, hash: 'abc' })
    const f = new File([new Uint8Array([1,2,3])], 'a.jpg', { type: 'image/jpeg' })
    await expect(uploadProposalPhoto('p1', f, 'u1')).resolves.toEqual({ photo_id: 1, is_duplicate: false, hash: 'abc' })
  })
  it('missions + plans command board APIs', async () => {
    mockFetch(true, [{ id: 'm1', goal: 'Bảo vệ rừng', scope: 'Province', status: 'ACTIVE' }])
    await expect(api.missions()).resolves.toEqual([{ id: 'm1', goal: 'Bảo vệ rừng', scope: 'Province', status: 'ACTIVE' }])
    mockFetch(false, {}, 500)
    await expect(api.missions()).resolves.toEqual([])
    mockFetch(true, { mission_id: 'm2', goal: 'Mới' })
    await expect(api.createMission({ goal: 'Mới' })).resolves.toEqual({ mission_id: 'm2', goal: 'Mới' })
    mockFetch(true, { id: 'p1', goal: 'G', tasks: [] })
    await expect(api.planDetail('p1')).resolves.toEqual({ id: 'p1', goal: 'G', tasks: [] })
  })

  it('dashboard KPIs come from real endpoints, null when down', async () => {
    const stats = { areas_monitored: 5, pending_signals: 2, origin: 'REAL / VERIFIED' }
    mockFetch(true, stats)
    await expect(api.forestStats()).resolves.toEqual(stats)
    mockFetch(true, { total_scores: 3, critical_alerts: 1, origin: 'REAL / VERIFIED' })
    await expect(api.riskOverview()).resolves.toEqual({ total_scores: 3, critical_alerts: 1, origin: 'REAL / VERIFIED' })
    mockFetch(false, {}, 500)
    await expect(api.forestStats()).resolves.toBeNull()
    await expect(api.riskOverview()).resolves.toBeNull()
    await expect(api.riskHistory('Gia Lai')).resolves.toBeNull()
  })

  it('API_BASE never falls back to localhost', async () => {
    const { API_BASE } = await import('./api')
    expect(API_BASE).not.toContain('localhost')
    expect(API_BASE.startsWith('https://')).toBe(true)
  })

  it('approvals center: list, approve, reject, governance counts', async () => {    mockFetch(true, [{ id: 'a1', plan_id: 'p1', action: 'CREATE_OFFICIAL_ALERT', status: 'PENDING' }])
    await expect(api.approvals()).resolves.toEqual([{ id: 'a1', plan_id: 'p1', action: 'CREATE_OFFICIAL_ALERT', status: 'PENDING' }])
    mockFetch(true, { id: 'a1', status: 'APPROVED' })
    await expect(api.approveApproval('a1')).resolves.toEqual({ id: 'a1', status: 'APPROVED' })
    mockFetch(true, { id: 'a1', status: 'REJECTED' })
    await expect(api.rejectApproval('a1')).resolves.toEqual({ id: 'a1', status: 'REJECTED' })
    mockFetch(true, { ai_decisions: 3, human_decisions: 1, pending_approvals: 2 })
    await expect(api.governance()).resolves.toEqual({ ai_decisions: 3, human_decisions: 1, pending_approvals: 2 })
    mockFetch(false, {}, 500)
    await expect(api.approvals()).resolves.toEqual([])
    await expect(api.governance()).resolves.toBeNull()
  })

  it('AI endpoints connect: health, fire-risk, what-if, pccc', async () => {
    mockFetch(true, { llm: { status: 'LIVE' }, rag: { status: 'LIVE' }, streaming: 'SSE' })
    await expect(api.aiHealth()).resolves.toEqual({ llm: { status: 'LIVE' }, rag: { status: 'LIVE' }, streaming: 'SSE' })
    mockFetch(false, {}, 500)
    await expect(api.aiHealth()).resolves.toBeNull()
    mockFetch(true, { risk: { score: 70 } })
    await expect(api.aiFireRisk()).resolves.toEqual({ risk: { score: 70 } })
    mockFetch(true, { simulation: { affected: {} } })
    await expect(api.aiWhatIf({ temperature: 3 })).resolves.toEqual({ simulation: { affected: {} } })
    mockFetch(true, { status: 'LIVE' })
    await expect(api.aiPccc({})).resolves.toEqual({ status: 'LIVE' })
  })

  it('assets: list, create, delete', async () => {
    mockFetch(true, [{ id: 'w1', asset_type: 'water', name: 'Be A', status: 'active' }])
    await expect(api.assetsList()).resolves.toEqual([{ id: 'w1', asset_type: 'water', name: 'Be A', status: 'active' }])
    mockFetch(true, { id: 'w2', asset_type: 'watchtower', name: 'Choi', status: 'active' })
    await expect(api.createAsset({ asset_type: 'watchtower', name: 'Choi', latitude: 1, longitude: 2 })).resolves.toEqual({ id: 'w2', asset_type: 'watchtower', name: 'Choi', status: 'active' })
    mockFetch(true, { id: 'w2', status: 'DELETED' })
    await expect(api.deleteAsset('w2')).resolves.toEqual({ id: 'w2', status: 'DELETED' })
    mockFetch(false, {}, 500)
    await expect(api.assetsList()).resolves.toEqual([])
  })
})
