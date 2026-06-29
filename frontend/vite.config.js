import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  // '/' for Vercel. For GitHub Pages, set VITE_BASE=/MayaVyuh/ as an env var before building.
  base: process.env.VITE_BASE || '/',

  resolve: {
    alias: {
      // Lets you import '@/useSync' instead of '../../useSync' from anywhere
      '@': resolve(__dirname, './src'),
    },
  },

  build: {
    // Increase warning limit — our single-file approach is intentional
    chunkSizeWarningLimit: 1200,
  },

  // Dev server tweaks
  server: {
    port: 5174,
    open: true,
  },
})