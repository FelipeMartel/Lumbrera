import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// El motor de STEPBible corre en local; el proxy evita CORS en desarrollo.
const STEP_URL = process.env.STEP_URL ?? 'http://localhost:8989'

export default defineConfig({
  // el JSX pasa por src/i18n, que pone cada texto en el idioma de la interfaz
  plugins: [react({ jsxImportSource: '@i18n' })],
  resolve: {
    alias: { '@i18n': fileURLToPath(new URL('./src/i18n', import.meta.url)) },
  },
  server: {
    port: 5180,
    proxy: {
      '/rest': { target: STEP_URL, changeOrigin: true },
    },
  },
})
