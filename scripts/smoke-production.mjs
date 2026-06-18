const SITE = (process.env.CAI_SITE_URL || 'https://www.colleagueai.ai').replace(/\/$/, '');

const agentPaths = [
  '/agents',
  '/en/agents',
  '/cs/agents',
  '/de/agents',
  '/fr/agents',
  '/es/agents',
  '/it/agents',
  '/pl/agents',
  '/pt/agents'
];

const publicPaths = [
  ...agentPaths,
  '/trust',
  '/partners',
  '/privacy',
  '/terms'
];

const localizedAgentPaths = [
  '/en/agents',
  '/cs/agents',
  '/de/agents',
  '/fr/agents',
  '/es/agents',
  '/it/agents',
  '/pl/agents',
  '/pt/agents'
];

function cacheBustedUrl(pagePath) {
  const url = new URL(pagePath, SITE);
  url.searchParams.set('cachecheck', String(Date.now()));
  return url.toString();
}

function hasBrokenSectionHref(html) {
  return html.includes('href= <section') || html.includes('href=<section');
}

function hasGoogleFonts(html) {
  return html.includes('fonts.googleapis.com') || html.includes('fonts.gstatic.com');
}

function hasNoindex(html) {
  return html.toLowerCase().includes('noindex');
}

function checkAgentPage(pagePath, html) {
  return {
    hasLaunchGate: html.includes('id="launch-readiness-gate"'),
    hasCheckoutGateScript: html.includes('id="cai-launch-gate-script"'),
    hasPaidCheckoutDisabled: html.includes('Paid checkout is not enabled'),
    hasCommercialLaunchDisabled: html.includes('CAI_COMMERCIAL_LAUNCH_ENABLED=false'),
    hasStripeE2E: html.includes('Stripe end-to-end'),
    hasLegalSafeCaveat: html.includes('customer-use-case dependent'),
    hasLocaleMarker: pagePath === '/agents' ? true : html.includes('cai-static-locale'),
    hasXDefault: pagePath === '/agents' ? true : html.includes('hreflang="x-default"')
  };
}

function checkGenericPage(html) {
  return {
    hasLaunchGate: html.includes('id="launch-readiness-gate"')
  };
}

async function fetchText(pagePath) {
  const response = await fetch(cacheBustedUrl(pagePath), {
    headers: {
      'user-agent': 'ColleagueAI-production-smoke/1.0'
    }
  });

  const text = await response.text();

  return {
    status: response.status,
    html: text
  };
}

function printTable(title, rows) {
  console.log('');
  console.log(title);
  console.table(rows);
}

function requireCheck(condition, failures, message) {
  if (!condition) failures.push(message);
}

async function checkPages() {
  const rows = [];
  const failures = [];

  for (const pagePath of publicPaths) {
    try {
      const result = await fetchText(pagePath);
      const isAgentPage = agentPaths.includes(pagePath);
      const pageChecks = isAgentPage ? checkAgentPage(pagePath, result.html) : checkGenericPage(result.html);

      const row = {
        path: pagePath,
        status: result.status,
        noindex: hasNoindex(result.html),
        googleFonts: hasGoogleFonts(result.html),
        brokenSectionHref: hasBrokenSectionHref(result.html),
        ...pageChecks
      };

      rows.push(row);

      requireCheck(result.status === 200, failures, pagePath + ' did not return HTTP 200');
      requireCheck(row.noindex === false, failures, pagePath + ' contains noindex');
      requireCheck(row.googleFonts === false, failures, pagePath + ' contains Google Fonts');
      requireCheck(row.brokenSectionHref === false, failures, pagePath + ' contains broken section href');

      if (isAgentPage) {
        requireCheck(row.hasLaunchGate === true, failures, pagePath + ' missing launch gate');
        requireCheck(row.hasCheckoutGateScript === true, failures, pagePath + ' missing checkout gate script');
        requireCheck(row.hasPaidCheckoutDisabled === true, failures, pagePath + ' missing paid-checkout disabled copy');
        requireCheck(row.hasCommercialLaunchDisabled === true, failures, pagePath + ' missing commercial launch disabled marker');
        requireCheck(row.hasStripeE2E === true, failures, pagePath + ' missing Stripe E2E wording');
        requireCheck(row.hasLegalSafeCaveat === true, failures, pagePath + ' missing legal-safe caveat');
        requireCheck(row.hasLocaleMarker === true, failures, pagePath + ' missing locale marker');
        requireCheck(row.hasXDefault === true, failures, pagePath + ' missing x-default hreflang');
      }
    } catch (error) {
      rows.push({
        path: pagePath,
        status: 'ERROR',
        error: error.message
      });
      failures.push(pagePath + ' smoke request failed: ' + error.message);
    }
  }

  printTable('Production page smoke', rows);
  return failures;
}

async function checkSitemap() {
  const failures = [];
  const result = await fetchText('/sitemap.xml');
  const html = result.html;

  const row = {
    path: '/sitemap.xml',
    status: result.status,
    hasAgents: html.includes('/agents'),
    hasLocalizedAgents: localizedAgentPaths.every((pagePath) => html.includes(pagePath)),
    hasHreflang: html.includes('hreflang'),
    hasXhtmlNamespace: html.includes('xmlns:xhtml')
  };

  printTable('Production sitemap smoke', [row]);

  requireCheck(row.status === 200, failures, 'sitemap.xml did not return HTTP 200');
  requireCheck(row.hasAgents === true, failures, 'sitemap missing /agents');
  requireCheck(row.hasLocalizedAgents === true, failures, 'sitemap missing one or more localized /agents URLs');
  requireCheck(row.hasHreflang === true, failures, 'sitemap missing hreflang');
  requireCheck(row.hasXhtmlNamespace === true, failures, 'sitemap missing xhtml namespace');

  return failures;
}

async function main() {
  console.log('Production smoke target:', SITE);

  const failures = [
    ...(await checkPages()),
    ...(await checkSitemap())
  ];

  if (failures.length > 0) {
    console.error('');
    console.error('Production smoke failed:');
    for (const failure of failures) console.error('- ' + failure);
    process.exit(1);
  }

  console.log('');
  console.log('Production smoke passed.');
}

main().catch((error) => {
  console.error('Production smoke crashed:', error);
  process.exit(1);
});

