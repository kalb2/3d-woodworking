import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { syncDevPlugin } from './server/syncPlugin.ts'

/** "1.0 (1)" from the iOS target (the version the App Store sees), else package.json. */
function appVersion(): string {
  try {
    const pbx = readFileSync(new URL('./ios/App/App.xcodeproj/project.pbxproj', import.meta.url), 'utf8')
    const v = /MARKETING_VERSION = ([^;]+);/.exec(pbx)?.[1]
    const b = /CURRENT_PROJECT_VERSION = ([^;]+);/.exec(pbx)?.[1]
    if (v) return b ? `${v} (${b})` : v
  } catch { /* no ios/ checkout */ }
  return (JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }).version
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), syncDevPlugin()],
  define: { 'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion()) },
})
