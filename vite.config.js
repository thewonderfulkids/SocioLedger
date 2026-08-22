import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Keep framework and Firebase code in stable vendor chunks so browsers can
// cache them independently from SocioLedger application changes.
export default defineConfig({
  plugins: [react()],
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
