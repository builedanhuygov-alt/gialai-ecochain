import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type Lang = 'vi'
export const LANGS: { id: Lang; label: string }[] = [
  { id: 'vi', label: 'Tiếng Việt' },
]

// Vietnamese-only UI. Jarai/Êđê dictionaries were removed (too sparse to be
// honest — a 4-word dictionary is decoration, not localization).
const dict: Record<Lang, Record<string, string>> = {
  vi: {
    'nav.main': 'CHÍNH',
    'nav.eco': 'Eco Map',
    'nav.command': 'Chỉ huy',
    'nav.events': 'Event Intelligence',
    'nav.whatif': 'What-if Lab',
    'nav.missions': 'Missions',
    'nav.community': 'Cộng đồng',
    'nav.twin': 'Bản sao số',
    'nav.settings': 'Cài đặt',
    'nav.help': 'Trợ giúp',
    'nav.adminName': 'Quản trị Tỉnh',
    'hdr.search': 'Tìm xã, thôn, sự cố...',
    'hdr.live': 'Hệ thống trực tiếp',
    'hdr.assistant': 'Trợ lý AI',
    'hdr.notif': 'Thông báo',
    'hdr.langNote': 'Bản dịch Jrai/Êđê đang hoàn thiện — từ nào thiếu sẽ hiện tiếng Việt',
    'com.title': 'Cộng đồng',
    'com.need': 'Cần xác minh',
    'com.done': 'Đã xác minh',
    'com.all': 'Tất cả',
    'com.reload': 'Tải lại',
    'com.composerPh': 'thấy gì ở hiện trường?',
    'com.areaPh': 'Khu vực (vd: Xã Ia Mơr)',
    'com.post': 'Đăng',
    'com.confirm': 'Xác nhận',
    'com.object': 'Phản đối',
    'com.details': 'Chi tiết',
    'com.photo': 'Ảnh',
    'com.commentPh': 'Viết bình luận kèm lượt xác minh...',
    'com.fire': 'cháy',
    'com.village': 'thôn',
  },
}

export function tFor(lang: Lang, key: string): string {
  return dict[lang]?.[key] ?? dict.vi[key] ?? key
}

const LangCtx = createContext<{ lang: Lang; setLang: (l: Lang) => void; t: (k: string) => string }>({
  lang: 'vi',
  setLang: () => {},
  t: (k: string) => tFor('vi', k),
})

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(()=> 'vi' as Lang)
  useEffect(()=>{ try{ localStorage.setItem('ecogl_lang', lang) }catch{} },[lang])
  return (
    <LangCtx.Provider value={{ lang, setLang: setLangState, t: (k: string) => tFor(lang, k) }}>
      {children}
    </LangCtx.Provider>
  )
}

export const useLang = ()=> useContext(LangCtx)
