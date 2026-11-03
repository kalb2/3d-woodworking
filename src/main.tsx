import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AppErrorBoundary } from './components/AppErrorBoundary.tsx'
import { installJsErrorHandlers } from './native/jsErrors.ts'
import { installKeyboardInset } from './utils/keyboardInset.ts'

installJsErrorHandlers()
installKeyboardInset()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
)
