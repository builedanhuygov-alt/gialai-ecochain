import { create } from 'zustand'

export type Scope = { province: string; commune?: string; village?: string; role: 'province'|'commune'|'village' }

const mockHierarchy: Record<string, string[]> = {
  'Gia Lai': ['Huyện Chư Prông','TP Pleiku','Vườn Quốc gia Kon Ka Kinh','TX An Khê','Huyện Krông Chro','TP Quy Nhơn','TX An Nhơn','Huyện Phù Mỹ','Huyện Hoài Nhơn','Xã Hội Sơn','Xã Ia Grai'],
  'Huyện Chư Prông': ['Xã Ia Mơr','Xã Ia Băng','Thôn 1'],
  'TP Quy Nhơn': ['Phường Quy Nhơn','Phường Thị Nại'],
  'TX An Nhơn': ['Phường Bình Định','Xã Nhơn Mỹ'],
  'Vườn Quốc gia Kon Ka Kinh': ['Khu A','Khu B'],
  'Huyện Krông Chro': ['Xã Đak Sơmei','Thôn 2'],
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
