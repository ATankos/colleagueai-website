import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/react'
import './index.css'
import App from './App.jsx'

// Initialize Sentry BEFORE rendering so it can catch errors during render.
// DSN is loaded from .env.local (local dev) or Vercel env vars (production).
// If no DSN is set we silently skip init — useful for local dev when you
// don't want test errors polluting your dashboard.
const dsn = import.meta.env.VITE_SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    // Tag events by environment so you can filter prod vs preview vs dev
    environment: import.meta.env.MODE,

    // Performance monitoring — sample 10% of transactions in production.
    // Replays cost more than errors; 0.1 keeps us comfortably under free tier
    // until traffic is real.
    tracesSampleRate: 0.1,

    // Session Replay — record video-like sessions for diagnosis.
    // 10% of normal sessions, 100% of sessions that hit an error.
    // Free tier covers ~50 replays/month, so we sample conservatively.
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,

    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        // Mask all text + inputs by default to avoid capturing PII
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],

    // Send default PII (IP address, user agent) so we can debug environment-
    // specific issues. Switch to false if your privacy review later objects.
    sendDefaultPii: true,
  })
}

// Wrap App in Sentry's error boundary so React render errors are reported
// instead of crashing silently to a blank page.
const AppWithSentry = Sentry.withErrorBoundary(App, {
  fallback: ({ error, resetError }) => (
    <div style={{
      padding: '40px',
      fontFamily: 'system-ui, sans-serif',
      maxWidth: '600px',
      margin: '60px auto',
      textAlign: 'center',
    }}>
      <h1>Something went wrong.</h1>
      <p>The error has been reported. You can try again, or email <a href="mailto:hello@colleagueai.ai">hello@colleagueai.ai</a>.</p>
      <p style={{ color: '#666', fontSize: '13px', marginTop: '20px' }}>
        {error?.message}
      </p>
      <button onClick={resetError} style={{
        marginTop: '20px', padding: '10px 20px',
        background: '#1D1B1A', color: '#F5F0E8', border: 0, borderRadius: '999px',
        cursor: 'pointer',
      }}>Try again</button>
    </div>
  ),
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppWithSentry />
  </StrictMode>,
)
