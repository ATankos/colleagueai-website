/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    css: false,
    // Only run unit tests under src/. The e2e/ folder uses @playwright/test
    // which is a different runner — Playwright handles those via `npm run e2e`.
    include: ['src/**/*.{test,spec}.{js,jsx,ts,tsx}'],
  },
})
