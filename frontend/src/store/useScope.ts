import { create } from 'zustand'

export type Scope = { province: string; commune?: string; village?: string; role: 'province'|'commune'|'village' }

const mockHierarchy: Record<string, string[]> = {
  'Gia Lai': ['Huyện Chư Prông','Huyện Krông Chro','Vườn Quốc gia Kon Ka Kinh','Xã Ia Mơr'],
  'Huyện Chư Prông': ['Xã Ia Mơr','Thôn 1'],
  'Vườn Quốc gia Kon Ka Kinh': ['Khu A','Khu B'],
}

export const useScope = create<{
  scope: Scope
  setCommune: (c?: string)=>void
  setVillage: (v?: string)=>void
  communes: string[]
  villages: string[]
}>((set)=> ({
  scope: { province: 'Gia Lai', role: 'province' },
  communes: mockHierarchy['Gia Lai'],
  villages: [],
  setCommune: (c)=> {
    const villages = c ? (mockHierarchy[c] ?? []) : []
    set({ scope: { province: 'Gia Lai', commune: c, role: c ? 'commune' : 'province' }, villages })
  },
  setVillage: (v)=> set(s=> ({ scope: { ...s.scope, village: v, role: v ? 'village' : s.scope.commune ? 'commune' : 'province'} })),
}))
