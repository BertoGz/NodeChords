import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => ({
  plugins: [react()],
  // GitHub Pages serves this repo at /NodeChords/ — keep "/" for local dev.
  base: command === 'build' ? '/NodeChords/' : '/',
}))
