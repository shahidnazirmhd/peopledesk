import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from '@/App'
import { applyTransportOverrideFromUrl } from '@/lib/socket'
import './index.css'

// Allows "?transports=polling" in the address bar to force a Socket.IO transport (testing aid).
applyTransportOverrideFromUrl()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
