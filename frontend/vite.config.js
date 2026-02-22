import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['tailwindcss/defaultTheme'],
  },
  server: {
    port: 5173,
    proxy: {
      '/namespaces': 'http://localhost:8080',
      '/query': 'http://localhost:8080',
      '/ws': {
        target: 'ws://localhost:8080',
        ws: true,
      },
    },
  },
  build: {
    outDir: '../sql-notebook-core/src/main/resources/static',
    emptyOutDir: true,
  },
})
