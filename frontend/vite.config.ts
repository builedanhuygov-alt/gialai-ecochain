import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    // Playwright e2e specs live in e2e/ and must run via `npm run e2e`,
    // never under vitest (their global test() collides).
    exclude: ['e2e/**', 'node_modules/**'],
  },
  build: {
    // Keep the initial bundle small: heavy vendors load as separate chunks
    // alongside the per-route lazy() splits in App.tsx.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('maplibre-gl')) return 'vendor-map'
          if (id.includes('recharts')) return 'vendor-charts'
          if (id.includes('framer-motion')) return 'vendor-motion'
          if (/node_modules\/(react|react-dom|react-router-dom|react-is)(\/|$)/.test(id)) return 'vendor-react'
          return 'vendor'
        },
      },
    },
  },
})
