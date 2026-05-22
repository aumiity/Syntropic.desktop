import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import path from 'path'

const resolveConfig = {
  // The repo may contain emitted electron/*.js files next to the TS sources.
  // Prefer TS so Electron builds do not silently bundle stale generated JS.
  extensions: ['.ts', '.tsx', '.mjs', '.js', '.jsx', '.json'],
}

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: 'electron/main.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['better-sqlite3', 'electron'],
            },
          },
          resolve: resolveConfig,
        },
      },
      {
        entry: 'electron/preload.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron'],
            },
          },
          resolve: resolveConfig,
        },
        onstart(options) {
          options.reload()
        },
      },
    ]),
    renderer(),
  ],
  resolve: {
    ...resolveConfig,
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    include: ['react-day-picker', 'lucide-react', 'framer-motion'],
  },
})
