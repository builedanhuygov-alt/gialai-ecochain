import { describe, expect, it } from 'vitest'
import { LANGS, tFor } from './i18n'

describe('i18n', () => {
  it('is Vietnamese-only', () => {
    expect(LANGS.map(l => l.id)).toEqual(['vi'])
  })

  it('returns Vietnamese strings and echoes unknown keys', () => {
    expect(tFor('vi', 'com.post')).toBe('Đăng')
    expect(tFor('vi', 'hdr.search')).toBe('Tìm xã, thôn, sự cố...')
    expect(tFor('vi', 'no.such.key')).toBe('no.such.key')
  })
})
