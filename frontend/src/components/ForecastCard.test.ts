import { describe, expect, it } from 'vitest'
import { actionIcon, driverCategory, execSummary, mainMessage, pickDriver, trendOf, LEVEL_COLOR } from './ForecastCard'

const R = (over: Record<string, unknown> = {}) => ({
  level: 'II', label: 'Trung bình', major_risk_driver: 'MISSING',
  supporting_factors: [], operational_status: 'Quan sát',
  recommended_action: ['Tăng cường quan sát'],
  data_coverage_status: 'Một phần',
  sources: { Weather: true, FIRMS: true, GEE: false, Sentinel: false },
  firms_hotspots: 0, components: {},
  ...over,
})

describe('ForecastCard helpers (presentation only, no engine logic)', () => {
  it('maps all five level colors from the brief palette', () => {
    expect(LEVEL_COLOR).toEqual({
      I: '#2E8B57', II: '#3CB371', III: '#FFC107', IV: '#FF7043', V: '#D32F2F',
    })
  })
  it('escalates the action icon with level', () => {
    expect(actionIcon('II')).toBe('✅')
    expect(actionIcon('IV')).toBe('🚒')
    expect(actionIcon('V')).toBe('🚨')
  })
  it('categorizes the strongest driver without inventing reasons', () => {
    expect(driverCategory('2 điểm nóng FIRMS')).toBe('IGNITION')
    expect(driverCategory('Nhiệt độ cao 38°C')).toBe('WEATHER')
    expect(driverCategory('Thiếu mưa kéo dài (8 ngày không mưa)')).toBe('WEATHER')
    expect(driverCategory('Địa hình dốc (30°)')).toBe('TERRAIN')
    expect(driverCategory('Thảm thực vật khô (NDVI thấp)')).toBe('FUEL')
    expect(driverCategory('Hồ A · 20 km (xa)')).toBe('WATER')
    expect(driverCategory('MISSING')).toBeNull()
  })
  it('picks the driver by priority IGNITION > WEATHER > FUEL > TERRAIN > WATER', () => {
    const hot = R({ level: 'V', firms_hotspots: 3,
      components: { ignition: 'ACTIVE', weather_stress: 'HIGH: Nhiệt độ cao 38°C', fuel: 'HIGH' } })
    expect(pickDriver(hot)).toEqual({ category: 'IGNITION', text: '3 điểm nóng FIRMS' })
    const wx = R({ components: { weather_stress: 'HIGH: Nhiệt độ cao 38°C', fuel: 'HIGH', ignition: 'CLEAR' } })
    expect(pickDriver(wx)?.category).toBe('WEATHER')
    const fuel = R({ components: { fuel: 'HIGH', ignition: 'CLEAR' }, supporting_factors: ['NDVI 0.3'] })
    expect(pickDriver(fuel)).toEqual({ category: 'FUEL', text: 'NDVI 0.3' })
    const terr = R({ components: { terrain: 'HIGH', ignition: 'CLEAR' }, supporting_factors: ['Độ dốc 30°'] })
    expect(pickDriver(terr)).toEqual({ category: 'TERRAIN', text: 'Độ dốc 30°' })
    const water = R({ components: { water: 'DISTANT', ignition: 'CLEAR' }, supporting_factors: ['Nguồn nước: Hồ A · 20 km (xa)'] })
    expect(pickDriver(water)?.category).toBe('WATER')
    expect(pickDriver(R())).toBeNull()
    const calm = R({ major_risk_driver: 'Độ ẩm tốt', components: { ignition: 'CLEAR' } })
    expect(pickDriver(calm)).toEqual({ category: 'ỔN ĐỊNH', text: 'Độ ẩm tốt' })
  })
  it('states FIRMS presence honestly in one sentence', () => {
    expect(mainMessage(0)).toBe('Không phát hiện điểm nóng FIRMS trong vùng theo dõi.')
    expect(mainMessage(3)).toBe('Có điểm nóng FIRMS trong vùng theo dõi.')
    expect(mainMessage('MISSING')).toBe('Dữ liệu FIRMS hiện chưa khả dụng.')
  })
  it('builds a 1–2 sentence executive summary from real strings only', () => {
    expect(execSummary(R(), 0)).toEqual(['Không phát hiện điểm nóng FIRMS trong vùng theo dõi.'])
    expect(execSummary(R({ major_risk_driver: 'Thiếu mưa kéo dài (8 ngày không mưa)' }), 0)).toEqual([
      'Không phát hiện điểm nóng FIRMS trong vùng theo dõi.',
      'Nguy cơ hiện tại chủ yếu do thiếu mưa kéo dài (8 ngày không mưa).',
    ])
  })
  it('shows trend only when history exists', () => {
    expect(trendOf(undefined, 'II')).toBeNull()
    expect(trendOf('II', 'II')).toBe('→ Ổn định')
    expect(trendOf('I', 'II')).toBe('↑ Tăng từ CẤP I')
    expect(trendOf('IV', 'II')).toBe('↓ Giảm từ CẤP IV')
  })
})
