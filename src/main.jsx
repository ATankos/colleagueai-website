import "./backToTopFix.js";
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/react'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'
import './index.css'
import App from './App.jsx'

// Initialize Sentry BEFORE rendering so it can catch errors during render.
// DSN is loaded from .env.local (local dev) or Vercel env vars (production).
// If no DSN is set we silently skip init — useful for local dev when you
// don't want test errors polluting your dashboard.
function caiSentryScrubUrl(value) {
  if (!value || typeof value !== 'string') return value
  try {
    const url = new URL(value)
    return url.origin + url.pathname
  } catch {
    return value.split('?')[0].split('#')[0]
  }
}

function caiSentryScrubObject(value, depth = 0) {
  if (!value || depth > 4) return value
  if (typeof value === 'string') {
    return value
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[Filtered]')
      .replace(/([?&](email|name|company|partner|query|search|token|secret|password)=)[^&#]*/gi, '$1[Filtered]')
  }
  if (Array.isArray(value)) return value.map((item) => caiSentryScrubObject(item, depth + 1))
  if (typeof value === 'object') {
    const out = {}
    for (const [key, item] of Object.entries(value)) {
      if (/email|name|company|phone|token|secret|password|authorization|cookie|partner|query|search|form|input|message|description/i.test(key)) {
        out[key] = '[Filtered]'
      } else {
        out[key] = caiSentryScrubObject(item, depth + 1)
      }
    }
    return out
  }
  return value
}

function caiSentryBeforeSend(event) {
  if (event.request) {
    event.request.url = caiSentryScrubUrl(event.request.url)
    delete event.request.query_string
    delete event.request.cookies
    delete event.request.headers
    delete event.request.data
  }
  if (event.user) event.user = { id: 'anonymous' }
  if (event.extra) event.extra = caiSentryScrubObject(event.extra)
  if (event.contexts) event.contexts = caiSentryScrubObject(event.contexts)
  if (event.breadcrumbs) event.breadcrumbs = event.breadcrumbs.map((b) => caiSentryScrubObject(b))
  return event
}

const dsn = import.meta.env.VITE_SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    beforeSend: caiSentryBeforeSend,
    // Tag events by environment so you can filter prod vs preview vs dev
    environment: import.meta.env.MODE,

    // Performance monitoring — sample 10% of transactions in production.
    // Replays cost more than errors; 0.1 keeps us comfortably under free tier
    // until traffic is real.
    tracesSampleRate: 0.1,

    // Session Replay — record video-like sessions for diagnosis.
    // 10% of normal sessions, 100% of sessions that hit an error.
    // Free tier covers ~50 replays/month, so we sample conservatively.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,

    integrations: [
      Sentry.browserTracingIntegration(),
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
    {/* Vercel Web Analytics — page-view & event tracking, privacy-first, no cookies */}
    <Analytics />
    {/* Vercel Speed Insights — real-user Web Vitals (LCP, FID, CLS, INP) per visit */}
    <SpeedInsights />
  </StrictMode>,
)

// Unregister any previously installed service workers
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(r => r.unregister()));
}
