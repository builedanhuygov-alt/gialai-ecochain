import { describe, expect, it } from 'vitest'
import { buildBrief, buildMissions, worstAlert } from './CommandExec'

const PLAN = {
  _title: 'Hòa Hội',
  risk_summary: { level: 'IV' },
  earth_intelligence: { major_risk_driver: 'gió mạnh' },
  threatened_communities: [
    { commune: 'Hòa Hội', band: 'CRITICAL', eta_hours: 2.5 },
    { commune: 'Hội Sơn', band: 'WATCH', eta_hours: 5 },
  ],
  top_actions: [
    { action: 'TRỰC CHIẾN', title: 'Triển khai tổ Hội Sơn', unit: 'Tổ 3' },
    { action: 'GIÁM SÁT', title: 'Bay flycam', unit: 'Flycam 1' },
  ],
  primary_route: { route_name: 'ĐT 639' },
}

describe('CommandExec pure derivations (no new data)', () => {
  it('picks the worst alert first', () => {
    expect(worstAlert([{ level: 'III' }, { level: 'CRITICAL' }])?.level).toBe('CRITICAL')
    expect(worstAlert([])).toBeNull()
  })
  it('builds a sub-70-word brief from existing state only', () => {
    const b = buildBrief(PLAN, [], 2)
    expect(b).toContain('CẤP IV')
    expect(b).toContain('2 điểm nóng FIRMS')
    expect(b).toContain('gió mạnh')
    expect(b).toContain('Hòa Hội')
    expect(b.split(/\s+/).length).toBeLessThanOrEqual(70)
  })
  it('falls back honestly without a plan', () => {
    const b = buildBrief(null, [{ title: 'Cháy A', level: 'III' }], 0)
    expect(b).toContain('Không phát hiện điểm nóng FIRMS')
    expect(b).toContain('lập kế hoạch tác chiến')
  })
  it('caps missions at 5 with fixed verbs', () => {
    const m = buildMissions(PLAN, [])
    expect(m.length).toBeLessThanOrEqual(5)
    expect(m[0]).toMatch(/^TRỰC CHIẾN:/)
    expect(m).toContain('Theo dõi Hòa Hội')
    expect(m).toContain('Giữ ĐT 639 thông suốt')
  })
  it('derives missions from alerts when plan is missing', () => {
    const m = buildMissions(null, [{ title: 'Cháy A' }, { title: 'Cháy B' }])
    expect(m).toContain('Theo dõi Cháy A')
    expect(m[m.length - 1]).toBe('Lập kế hoạch tác chiến cho điểm nóng nhất')
    expect(m.length).toBeLessThanOrEqual(5)
  })
})
