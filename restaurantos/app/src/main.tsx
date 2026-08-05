import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'

// Without this, a stale service worker can keep serving an old cached
// build indefinitely after a deploy — even through a manual refresh —
// because the browser asks the OLD worker for files, and it answers from
// its own cache instead of the network. `immediate: true` checks for an
// update the moment the app loads (not just on some later interval), and
// reloading once a new one takes over guarantees you're never stuck on
// stale code after publishing an update.
registerSW({
  immediate: true,
  onNeedRefresh() {
    window.location.reload()
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
