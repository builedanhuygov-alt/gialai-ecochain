import { create } from 'zustand'
import { API_BASE } from '../services/api'

export type Scope = {
  province: string
  commune?: string
  village?: string
  role: 'province' | 'commune' | 'village'
  lat?: number
  lon?: number
}

const API = API_BASE

async function fetchCommunes(): Promise<string[]> {
  try {
    const r = await fetch(`${API}/api/forest/areas?level=COMMUNE`)
    if (!r.ok) return []
    const j = await r.json()
    return (Array.isArray(j) ? j : []).map((u: any) => u.name).filter(Boolean)
  } catch { return [] }
}

async function fetchVillages(commune: string): Promise<string[]> {
  try {
    const r = await fetch(`${API}/api/villages?commune=${encodeURIComponent(commune)}`)
    if (!r.ok) return []
    const j = await r.json()
    return (Array.isArray(j) ? j : []).map((v: any) => v.village || v.name).filter(Boolean)
  } catch { return [] }
}

export const useScope = create<{
  scope: Scope
  communes: string[]
  villages: string[]
  loaded: boolean
  loadHierarchy: () => Promise<void>
  setCommune: (c?: string) => void
  setVillage: (v?: string) => void
  setArea: (name: string, lat?: number, lon?: number) => void
}>((set, get) => ({
  scope: { province: 'Gia Lai', role: 'province' },
  communes: [],
  villages: [],
  loaded: false,
  loadHierarchy: async () => {
    if (get().loaded) return
    const communes = await fetchCommunes()
    set({ communes, loaded: true })
  },
  setCommune: (c) => {
    if (!c) {
      set({ scope: { province: 'Gia Lai', role: 'province' }, villages: [] })
      return
    }
    set({ scope: { province: 'Gia Lai', commune: c, role: 'commune' }, villages: [] })
    fetchVillages(c).then((villages) => {
      if (get().scope.commune === c) set({ villages })
    }).catch(() => {})
  },
  setVillage: (v) => set((s) => ({
    scope: { ...s.scope, village: v, role: v ? 'village' : s.scope.commune ? 'commune' : 'province' },
  })),
  // Map selection entry point: commune when the name matches a real commune,
  // otherwise keep it as a focus label with coordinates for the gauge.
  setArea: (name, lat, lon) => {
    const { communes } = get()
    if (name && communes.includes(name)) {
      set({ scope: { province: 'Gia Lai', commune: name, role: 'commune', lat, lon }, villages: [] })
      fetchVillages(name).then((villages) => {
        if (get().scope.commune === name) set({ villages })
      }).catch(() => {})
    } else {
      set((s) => ({ scope: { ...s.scope, village: name, role: name ? 'village' : 'province', lat, lon } }))
    }
  },
}))
