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
      '/health':      { target: 'http://localhost:8080', changeOrigin: true },
      '/namespaces':  { target: 'http://localhost:8080', changeOrigin: true },
      '/query':       { target: 'http://localhost:8080', changeOrigin: true },
      '/schema':      { target: 'http://localhost:8080', changeOrigin: true },
      '/draft':       { target: 'http://localhost:8080', changeOrigin: true },
      '/connections': { target: 'http://localhost:8080', changeOrigin: true },
      '/system':      { target: 'http://localhost:8080', changeOrigin: true },
      '/files':       { target: 'http://localhost:8080', changeOrigin: true },
      '/sources':     { target: 'http://localhost:8080', changeOrigin: true },
      '/pin':         { target: 'http://localhost:8080', changeOrigin: true },
      '/profile':     { target: 'http://localhost:8080', changeOrigin: true },
      '/workspace':   { target: 'http://localhost:8080', changeOrigin: true },
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
      output: {
        // Split vendor libraries into separate cacheable chunks so no single
        // chunk exceeds the 500 kB warning threshold.
        manualChunks(id) {
          if (!id.includes('node_modules')) return

          // CodeMirror - the largest dependency, gets its own chunk
          if (id.includes('codemirror') || id.includes('@codemirror'))
            return 'vendor-codemirror'

          // ReactFlow - used only by the Schema ERD panel
          if (id.includes('reactflow') || id.includes('@reactflow'))
            return 'vendor-reactflow'

          // Markdown pipeline - react-markdown + unified ecosystem
          if (
            id.includes('react-markdown') ||
            id.includes('remark')          ||
            id.includes('rehype')          ||
            id.includes('mdast')           ||
            id.includes('micromark')       ||
            id.includes('unified')         ||
            id.includes('hast')            ||
            id.includes('vfile')
          ) return 'vendor-markdown'

          // React core + everything else (zustand, react-icons, etc.)
          // Kept together to avoid circular imports between packages that
          // depend on react and react itself.
          return 'vendor-misc'
        },
      },
    },
  },
})
