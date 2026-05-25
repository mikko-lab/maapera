import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Read VITE_* env vars from the monorepo root .env.local, not web/
  envDir: '..',
})
