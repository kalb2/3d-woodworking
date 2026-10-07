import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { syncDevPlugin } from './server/syncPlugin.ts'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), syncDevPlugin()],
})
