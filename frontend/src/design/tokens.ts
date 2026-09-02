export const tokens = {
  colors: {
    bg: '#F8FAF9',
    surface: '#FFFFFF',
    surfaceMuted: '#F1F5F3',
    border: '#E2E8E5',
    borderStrong: '#CBD5D1',
    text: '#0F1E1A',
    textMuted: '#64748B',
    textFaint: '#94A3B8',
    primary: '#0F766E', // teal governance
    primaryHover: '#115E59',
    accent: '#15803D', // environmental green
    amber: '#D97706',
    red: '#DC2626',
    blue: '#2563EB',
    sidebar: '#0B1412',
    sidebarMuted: '#1A2E2A',
    sidebarBorder: '#1E3A36',
  },
  spacing: { xs: 8, sm: 12, md: 16, lg: 20, xl: 24, '2xl': 32 },
  radius: { sm: 8, md: 12, lg: 16, xl: 20, full: 999 },
  shadow: {
    sm: '0 1px 2px rgba(15,30,26,0.06)',
    md: '0 4px 12px rgba(15,30,26,0.08)',
    lg: '0 8px 24px rgba(15,30,26,0.10)',
  },
  typography: {
    font: "'Inter', 'IBM Plex Sans', system-ui, -apple-system, sans-serif",
    mono: "'JetBrains Mono', ui-monospace, monospace",
  },
  sidebarWidth: 268,
  headerHeight: 64,
} as const
