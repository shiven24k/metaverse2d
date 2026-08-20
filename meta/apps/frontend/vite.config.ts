import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  server: {
    watch: {
      // The repo lives on the Windows filesystem (/mnt/c/...) when running inside
      // WSL, where inotify events are unreliable. Poll instead so file edits are
      // picked up reliably (this was silently serving stale modules).
      usePolling: true,
      interval: 200,
    },
  },
})
