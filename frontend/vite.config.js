import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'reactflow',
      '@reactflow/core',
      '@reactflow/background',
      '@reactflow/controls',
      '@reactflow/minimap',
    ],
    exclude: ['tailwindcss/defaultTheme'],
  },
  server: {
    port: 5173,
    proxy: {
      '/namespaces':  { target: 'http://localhost:8080', changeOrigin: true },
      '/query':       { target: 'http://localhost:8080', changeOrigin: true },
      '/schema':      { target: 'http://localhost:8080', changeOrigin: true },
      '/draft':       { target: 'http://localhost:8080', changeOrigin: true },
      '/connections': { target: 'http://localhost:8080', changeOrigin: true },
      '/system':      { target: 'http://localhost:8080', changeOrigin: true },
      '/files':       { target: 'http://localhost:8080', changeOrigin: true },
      '/sources':     { target: 'http://localhost:8080', changeOrigin: true },
      '/ws': {
        target:      'ws://localhost:8080',
        ws:          true,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: '../sql-notebook-core/src/main/resources/static',
    emptyOutDir: true,
    rollupOptions: {
      external: [],
    },
  },
})
