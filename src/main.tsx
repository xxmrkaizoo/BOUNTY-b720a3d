import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { isFirebaseConfigured } from './lib/config.ts'
import SetupNotice from './components/SetupNotice.tsx'
import { SettingsProvider } from './lib/settings.tsx'
import { registerServiceWorker } from './lib/pwa.ts'
import { LoadingScreen } from './components/Loading.tsx'

// App (and Firebase) is only loaded once the .env config exists,
// so a missing config shows setup help instead of a crash.
const App = lazy(() => import('./App.tsx'))

// Installable app + offline shell (production only).
registerServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SettingsProvider>
    {isFirebaseConfigured ? (
      <Suspense fallback={<LoadingScreen />}>
        <App />
      </Suspense>
    ) : (
      <SetupNotice />
    )}
    </SettingsProvider>
  </StrictMode>,
)
