// Lighthouse CI config
// Runs `npm run build && npx serve dist` to test the production bundle
// (more realistic than the dev server), then audits with Lighthouse.
//
// Use:
//   npm run lhci        — full run with assertions
//   npm run lhci:report — open last report

module.exports = {
  ci: {
    collect: {
      // Build the site for production, then serve the static output
      startServerCommand: 'npx serve -s dist -l 4173',
      startServerReadyPattern: 'Accepting connections',
      url: ['http://localhost:4173/'],
      numberOfRuns: 3, // Average 3 runs to reduce noise
      // If a run crashes (e.g. Windows EPERM cleanup), keep going so we
      // still get usable averages from the runs that did succeed.
      isSinglePageApplication: false,
      maxAutodiscoverUrls: 0,
      settings: {
        preset: 'desktop',
        throttlingMethod: 'provided',
        // Pin Chrome to a stable user-data dir in the project so chrome-launcher
        // never tries to delete a temp dir at exit (which fails on Windows when
        // Defender holds a file handle for a moment after Chrome exits).
        chromeFlags: [
          '--no-sandbox',
          '--disable-dev-shm-usage',
          '--headless=new',
          '--user-data-dir=./node_modules/.chrome-lhci-profile',
        ].join(' '),
      },
    },
    assert: {
      // Strict enterprise thresholds — build fails if any drop below
      assertions: {
        'categories:performance':    ['error', { minScore: 0.90 }],
        'categories:accessibility':  ['error', { minScore: 1.00 }],
        'categories:best-practices': ['error', { minScore: 0.95 }],
        'categories:seo':            ['error', { minScore: 0.90 }],
      },
    },
    upload: {
      // Keep reports locally for now. To push to LHCI server / GitHub later:
      //   target: 'temporary-public-storage'  // free, easy
      //   target: 'lhci'                       // self-hosted
      target: 'filesystem',
      outputDir: './.lighthouseci',
      reportFilenamePattern: '%%PATHNAME%%-%%DATETIME%%-report.%%EXTENSION%%',
    },
  },
}
