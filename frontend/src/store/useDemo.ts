import { create } from 'zustand'
export const useDemo = create<{ demo: boolean; toggle: ()=>void }>((set)=> ({
  demo: true,
  toggle: ()=> set(s=> ({ demo: !s.demo }))
}))
