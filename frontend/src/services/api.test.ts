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
  })

  it('alerts passes through on success, [] when down', async () => {
    const rows = [{ id: 'a1', level: 'CRITICAL', status: 'ACTIVE', title: 'Cháy' }]
    mockFetch(true, rows)
    await expect(api.alerts()).resolves.toEqual(rows)
    mockFetch(false, {}, 500)
    await expect(api.alerts()).resolves.toEqual([])
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

  it('uploadProposalPhoto sends multipart and returns hash info', async () => {
    const { uploadProposalPhoto } = await import('./api')
    mockFetch(true, { photo_id: 1, is_duplicate: false, hash: 'abc' })
    const f = new File([new Uint8Array([1,2,3])], 'a.jpg', { type: 'image/jpeg' })
    await expect(uploadProposalPhoto('p1', f, 'u1')).resolves.toEqual({ photo_id: 1, is_duplicate: false, hash: 'abc' })
  })

  it('missions list/create fall back honestly', async () => {
    mockFetch(true, [{ id: 'm1', area: 'Xa A', status: 'NEW' }])
    await expect(api.missions()).resolves.toEqual([{ id: 'm1', area: 'Xa A', status: 'NEW' }])
    mockFetch(false, {}, 500)
    await expect(api.missions()).resolves.toEqual([])
    mockFetch(true, { id: 'm2', status: 'NEW' })
    await expect(api.createMission({ area: 'Xa A' })).resolves.toEqual({ id: 'm2', status: 'NEW' })
  })

  it('mission result + status patch through', async () => {
    mockFetch(true, { id: 'm1', outcome: 'FALSE_ALARM' })
    await expect(api.missionResult('m1', { outcome: 'FALSE_ALARM' })).resolves.toEqual({ id: 'm1', outcome: 'FALSE_ALARM' })
    mockFetch(true, { id: 'm1', status: 'IN_PROGRESS' })
    await expect(api.missionStatus('m1', 'IN_PROGRESS')).resolves.toEqual({ id: 'm1', status: 'IN_PROGRESS' })
  })

  it('fire-risk calculate posts inputs and returns a score', async () => {
    mockFetch(true, { score: 62, level: 'IV', origin: 'LIVE' })
    const r = await api.fireRiskCalculate({ temperature: 36, humidity: 25 })
    expect(r.score).toBe(62)
  })

  it('fire-risk backtest/grid return null when backend is down', async () => {
    mockFetch(false, {}, 500)
    await expect(api.fireRiskBacktest()).resolves.toBeNull()
    await expect(api.fireRiskGrid()).resolves.toBeNull()
    mockFetch(true, { precision: 0.5, origin: 'DEMO / SIMULATED' })
    await expect(api.fireRiskBacktest({ threshold: 60 })).resolves.toEqual({ precision: 0.5, origin: 'DEMO / SIMULATED' })
  })

  it('forest stats come from real endpoints, null when down', async () => {
    const stats = { areas_monitored: 5, pending_signals: 2, origin: 'REAL / VERIFIED' }
    mockFetch(true, stats)
    await expect(api.forestStats()).resolves.toEqual(stats)
    mockFetch(false, {}, 500)
    await expect(api.forestStats()).resolves.toBeNull()
  })

  it('API_BASE never falls back to localhost', async () => {
    const { API_BASE } = await import('./api')
    expect(API_BASE).not.toContain('localhost')
    expect(API_BASE.startsWith('https://')).toBe(true)
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

  it('responsePlan posts fire point and returns a plan', async () => {
    mockFetch(true, { risk_summary: { level: 'IV' }, tactical_recommendations: ['x'] })
    await expect(api.responsePlan({ lat: 13.9, lon: 108.3 })).resolves.toEqual({ risk_summary: { level: 'IV' }, tactical_recommendations: ['x'] })
  })

  it('firesim posts scenario sliders and returns ellipses + impact', async () => {
    const sim = { ros: { ros_kmh: 1.2 }, spread: { steps: [{ hour: 1.0 }] }, impact: { area_affected_ha: 10 } }
    mockFetch(true, sim)
    await expect(api.firesim({ lon: 109.02, lat: 14.06, wind_speed_kmh: 20 })).resolves.toEqual(sim)
  })
})
