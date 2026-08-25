import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function deferHeavyPromoImages() {
  return {
    name: 'defer-heavy-promo-images',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/App.jsx')) return null

      const transformed = code
        .replace(
          '<img src={socioLedgerIcon} alt="SocioLedger" />',
          '<img src={socioLedgerIcon} alt="SocioLedger" loading="lazy" decoding="async" fetchPriority="low" />'
        )
        .replace(
          '<img src={vioraIcon} alt="VIORA" />',
          '<img src={vioraIcon} alt="VIORA" loading="lazy" decoding="async" fetchPriority="low" />'
        )

      return transformed === code ? null : transformed
    },
  }
}

// Keep framework and Firebase code in stable vendor chunks so browsers can
// cache them independently from SocioLedger application changes.
export default defineConfig({
  plugins: [deferHeavyPromoImages(), react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('/firebase/') || id.includes('/@firebase/')) return 'firebase-vendor'
          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/')) return 'react-vendor'
          return 'vendor'
        },
      },
    },
  },
})
