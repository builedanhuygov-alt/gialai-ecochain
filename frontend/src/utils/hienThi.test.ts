import { describe, expect, it } from 'vitest'
import { hienThi } from './hienThi'

describe('hienThi', () => {
  it('maps backend MISSING codes to Vietnamese, keeps real values', () => {
    expect(hienThi('MISSING')).toBe('thiếu')
    expect(hienThi(null)).toBe('thiếu')
    expect(hienThi(undefined)).toBe('thiếu')
    expect(hienThi('')).toBe('thiếu')
    expect(hienThi('Gia Lai')).toBe('Gia Lai')
    expect(hienThi(0)).toBe('0')
  })
})
