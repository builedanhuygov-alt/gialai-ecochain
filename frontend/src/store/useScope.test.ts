import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useScope } from './useScope'

describe('useScope', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ([]) })))
    useScope.setState({
      scope: { province: 'Gia Lai', role: 'province' },
      communes: ['Xã Phù Mỹ Đông', 'Xã Hội Sơn'],
      villages: [],
      loaded: true,
    })
  })

  it('starts at province scope', () => {
    const { scope } = useScope.getState()
    expect(scope.role).toBe('province')
  })

  it('setCommune narrows role', () => {
    useScope.getState().setCommune('Xã Hội Sơn')
    const { scope } = useScope.getState()
    expect(scope.role).toBe('commune')
    expect(scope.commune).toBe('Xã Hội Sơn')
  })

  it('setCommune(undefined) resets to province', () => {
    useScope.getState().setCommune('Xã Hội Sơn')
    useScope.getState().setCommune(undefined)
    const { scope, villages } = useScope.getState()
    expect(scope.role).toBe('province')
    expect(villages).toEqual([])
  })

  it('setArea routes real communes to commune scope with coords', () => {
    useScope.getState().setArea('Xã Phù Mỹ Đông', 14.2, 109.2)
    const { scope } = useScope.getState()
    expect(scope.role).toBe('commune')
    expect(scope.lat).toBe(14.2)
  })

  it('setArea keeps unknown names as focus labels, never crashes', () => {
    useScope.getState().setArea('Nơi nào đó')
    expect(useScope.getState().scope.village).toBe('Nơi nào đó')
  })

  it('loadHierarchy is idempotent once loaded', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
    await useScope.getState().loadHierarchy()
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})
