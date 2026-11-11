/**
 * tests/e2e/purchase-flow.spec.mjs - the business order in a real browser, on desktop and on a phone.
 *
 * Runs in both projects of playwright.config.ts (chromium-desktop and mobile-chrome). The real handlers
 * (api/checkout.js, api/success.js) serve the order confirmation and the thank-you page from a local server; Stripe
 * and Upstash are local fakes on loopback (lib/stripe.js STRIPE_API_HOST), and the "Stripe" payment page is a
 * stand-in that marks the session paid and returns to success_url as Stripe does. No key, card or money is involved.
 *
 * What a buyer sees and does: the confirmation page names the product, release, price and the four agreements with
 * their versions; it fits the screen (no sideways scrolling) and every control can be reached; an order without the
 * three confirmations is refused by the server and nothing is sent to Stripe; a complete order creates the Stripe
 * customer with the VAT ID and a session carrying the order id; after payment the thank-you page shows the order
 * id, the release, its SHA-256 and the download.
 */
import { test, expect } from '@playwright/test';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { casReply } from '../kv-cas-fake.mjs';

const ROOT = new URL('../../', import.meta.url);
const PRODUCTS = JSON.parse(readFileSync(new URL('config/products.json', ROOT), 'utf8'));
const LEGAL = JSON.parse(readFileSync(new URL('config/legal.json', ROOT), 'utf8'));
const SLUG = 'contract-intelligence-and-register';
const RELEASE = PRODUCTS[SLUG].release;

const kv = new Map();
const stripeCalls = [];
const sessions = new Map();
const customers = new Map();
let seq = 0;
let appBase;
const servers = [];

function kvReply(cmd, args) {
  switch (cmd) {
    case 'GET': return kv.get(args[0]) ?? null;
    case 'SET': if (args.includes('NX') && kv.has(args[0])) return null; kv.set(args[0], args[1]); return 'OK';
    case 'DEL': return kv.delete(args[0]) ? 1 : 0;
    case 'INCR': { const n = Number(kv.get(args[0]) ?? 0) + 1; kv.set(args[0], String(n)); return n; }
    default: return cmd === 'EXPIRE' ? 1 : null;
  }
}
const metadataOf = (params) => Object.fromEntries([...params].map(([k, v]) => [k.match(/^metadata\[([^\]]+)\]$/)?.[1], v]).filter(([k]) => k));

function stripeReply(req, raw) {
  const url = new URL(req.url, 'http://x');
  const params = new URLSearchParams(raw);
  stripeCalls.push({ method: req.method, path: url.pathname, params });
  const p = url.pathname;
  if (req.method === 'POST' && p === '/v1/customers') {
    const id = `cus_e2e${++seq}`;
    customers.set(id, { id, object: 'customer', name: params.get('name'), email: params.get('email'), metadata: metadataOf(params) });
    return [200, customers.get(id)];
  }
  if (req.method === 'GET' && p.startsWith('/v1/customers/')) return [200, customers.get(p.split('/').pop()) ?? {}];
  if (req.method === 'POST' && p === '/v1/checkout/sessions') {
    const id = `cs_test_e2e${++seq}`;
    const cust = customers.get(params.get('customer')) ?? {};
    const amount = Number(params.get('line_items[0][price_data][unit_amount]'));
    sessions.set(id, {
      id, object: 'checkout.session', livemode: false, mode: params.get('mode'), status: 'open', payment_status: 'unpaid',
      currency: params.get('line_items[0][price_data][currency]'), amount_subtotal: amount, amount_total: amount, total_details: { amount_tax: 0 },
      customer: cust.id ?? null, client_reference_id: params.get('client_reference_id'), payment_intent: `pi_${id}`, invoice: null,
      customer_details: { email: cust.email, business_name: cust.name, address: { country: 'CZ' }, tax_ids: [] },
      metadata: metadataOf(params), success_url: params.get('success_url'),
    });
    return [200, { id, object: 'checkout.session', url: `${appBase}/fake-stripe/pay/${id}` }];
  }
  if (req.method === 'GET' && p.startsWith('/v1/checkout/sessions/')) {
    const s = sessions.get(p.split('/').pop());
    return s ? [200, s] : [404, { error: { type: 'invalid_request_error', message: 'No such session' } }];
  }
  if (req.method === 'GET' && p === '/v1/invoice_payments') return [200, { object: 'list', data: [], has_more: false }];
  return [404, { error: { message: `unhandled ${req.method} ${p}` } }];
}

const listen = (srv) => new Promise((r) => srv.listen(0, '127.0.0.1', () => { servers.push(srv); r(`http://127.0.0.1:${srv.address().port}`); }));
const body = (req) => new Promise((r) => { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => r(b)); });

/** Vercel-style req/res around a Node request, enough for the two handlers. */
function vercel(handler) {
  return async (req, res) => {
    const url = new URL(req.url, 'http://x');
    req.query = Object.fromEntries(url.searchParams);
    if (req.method === 'POST') req.body = Object.fromEntries(new URLSearchParams(await body(req)));
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (o) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); return res; };
    res.send = (b) => { if (!res.getHeader('content-type')) res.setHeader('content-type', 'text/html; charset=utf-8'); res.end(b); return res; };
    res.redirect = (code, loc) => { res.writeHead(code, { location: loc }); res.end(); return res; };
    await handler(req, res);
  };
}

test.beforeAll(async () => {
  const kvBase = await listen(http.createServer(async (req, res) => {
    const b = await body(req);
    res.setHeader('content-type', 'application/json');
    if (req.method === 'POST') return res.end(JSON.stringify({ result: casReply(kv, JSON.parse(b)) }));
    const [, cmd, ...args] = req.url.split('/').map(decodeURIComponent);
    res.end(JSON.stringify({ result: kvReply(cmd, args) }));
  }));
  const stripeBase = await listen(http.createServer(async (req, res) => {
    const [code, out] = stripeReply(req, await body(req));
    res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(out));
  }));
  Object.assign(process.env, {
    KV_REST_API_URL: kvBase, KV_REST_API_TOKEN: 'e2e-dummy', STRIPE_API_HOST: stripeBase, STRIPE_SECRET_KEY: 'sk_test_e2e_never_sent',
    DOWNLOAD_TOKEN_SECRET: 'e2e-download-secret', RELEASE_TEST_DELIVERY: '1',
  });
  for (const k of ['VERCEL_ENV', 'CHECKOUT_ENABLED', 'CERTIFICATION_SALES_ENABLED', 'TAX_POLICY_SANDBOX']) delete process.env[k];
  const checkout = vercel((await import('../../api/checkout.js')).default);
  const success = vercel((await import('../../api/success.js')).default);
  appBase = await listen(http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/api/checkout') return checkout(req, res);
    if (url.pathname === '/api/success') return success(req, res);
    const pay = url.pathname.match(/^\/fake-stripe\/pay\/([\w]+)$/);
    if (pay && sessions.has(pay[1])) {
      const s = sessions.get(pay[1]);
      if (req.method === 'POST') {
        Object.assign(s, { status: 'complete', payment_status: 'paid' });
        // Checkout builds an https:// success_url for the site's own host, as it must in production. The stand-in keeps
        // its path and query and returns to the local (plain http) server.
        const back = new URL(s.success_url.replace('{CHECKOUT_SESSION_ID}', s.id));
        res.writeHead(303, { location: `${appBase}${back.pathname}${back.search}` });
        return res.end();
      }
      res.setHeader('content-type', 'text/html; charset=utf-8');
      return res.end(`<!doctype html><title>Stand-in for Stripe Checkout</title><meta name="viewport" content="width=device-width">
        <h1>Stand-in for Stripe Checkout</h1><p>${s.currency} ${s.amount_total}</p><form method="post"><button>Pay</button></form>`);
    }
    // The pages' own stylesheet, script and icon, as the site serves them, so layout is checked as buyers see it.
    const asset = { '/order.css': 'text/css', '/order.js': 'text/javascript', '/favicon.svg': 'image/svg+xml' }[url.pathname];
    if (asset) { res.writeHead(200, { 'content-type': asset }); return res.end(readFileSync(new URL(`public${url.pathname}`, ROOT))); }
    res.writeHead(404); res.end('not found');
  }));
});
test.afterAll(async () => { for (const s of servers) { s.closeAllConnections?.(); await new Promise((r) => s.close(r)); } });

async function noSidewaysScroll(page) {
  const { sw, iw } = await page.evaluate(() => ({ sw: document.scrollingElement.scrollWidth, iw: window.innerWidth }));
  expect(sw, `page is ${sw}px wide in a ${iw}px viewport`).toBeLessThanOrEqual(iw + 1);
}

test('order confirmation: product, release, price and the four agreements; fits the screen', async ({ page }) => {
  await page.goto(`${appBase}/api/checkout?agent=${SLUG}&method=card&lang=en`);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByText('Contract Intelligence & Register').first()).toBeVisible();
  await expect(page.getByText(RELEASE.version).first()).toBeVisible();
  await expect(page.getByText('$14,900').first()).toBeVisible();
  for (const d of Object.values(LEGAL.documents)) {
    await expect(page.locator(`a[href="${d.path}"]`).first()).toBeVisible();
    await expect(page.getByText(d.sha256.slice(0, 12)).first()).toBeVisible();
  }
  for (const n of ['authority', 'terms', 'delivery']) await expect(page.locator(`input[name="${n}"]`)).not.toBeChecked();
  await noSidewaysScroll(page);
  const submit = page.locator('form.o-form button[type="submit"]');
  await submit.scrollIntoViewIfNeeded();
  await expect(submit).toBeVisible();
  await expect(submit).toBeEnabled();
});

async function fillBuyer(page, email) {
  await page.fill('input[name="company"]', 'Vzorová Průmyslová a.s.');
  await page.fill('input[name="reg_number"]', '12345678');
  await page.selectOption('select[name="country"]', 'CZ');
  await page.fill('input[name="tax_id"]', 'CZ12345678');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="name"]', 'Jana Nováková');
  await page.fill('input[name="role"]', 'Jednatelka (CEO)');
}

test('an order without the three confirmations is refused and nothing reaches Stripe', async ({ page }) => {
  stripeCalls.length = 0;
  await page.goto(`${appBase}/api/checkout?agent=${SLUG}&method=card&lang=en`);
  await fillBuyer(page, 'refused@vzorova.example');
  const [resp] = await Promise.all([page.waitForResponse((r) => r.url().endsWith('/api/checkout') && r.request().method() === 'POST'),
    page.locator('form.o-form button[type="submit"]').click()]);
  expect(resp.status()).toBe(400);
  await expect(page.locator('input[name="company"]')).toHaveValue('Vzorová Průmyslová a.s.');
  for (const n of ['authority', 'terms', 'delivery']) await expect(page.locator(`input[name="${n}"]`)).not.toBeChecked();
  expect(stripeCalls.filter((c) => c.method === 'POST')).toEqual([]);
  await noSidewaysScroll(page);
});

test('a complete order pays on Stripe and the thank-you page delivers the release with its SHA-256', async ({ page }, info) => {
  stripeCalls.length = 0;
  const email = `buyer-${info.project.name}@vzorova.example`;
  await page.goto(`${appBase}/api/checkout?agent=${SLUG}&method=card&lang=en`);
  await fillBuyer(page, email);
  for (const n of ['authority', 'terms', 'delivery']) await page.locator(`input[name="${n}"]`).check();
  await page.locator('form.o-form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/fake-stripe\/pay\/cs_test_e2e\d+$/);

  const cust = stripeCalls.find((c) => c.path === '/v1/customers');
  expect(cust.params.get('tax_id_data[0][value]')).toBe('CZ12345678');
  const sess = stripeCalls.find((c) => c.path === '/v1/checkout/sessions');
  const orderId = sess.params.get('metadata[order_id]');
  expect(orderId).toMatch(/^ord_\d{8}_[0-9a-f]+$/);
  expect(sess.params.get('client_reference_id')).toBe(orderId);
  expect(sess.params.get('metadata[release]')).toBe(RELEASE.version);
  expect(sess.params.get('metadata[legal_set]')).toBe(LEGAL.set);

  await page.getByRole('button', { name: 'Pay' }).click();
  await expect(page).toHaveURL(/\/api\/success\?session_id=cs_test_e2e\d+/);
  await expect(page.getByText(orderId).first()).toBeVisible();
  await expect(page.getByText(RELEASE.package).first()).toBeVisible();
  await expect(page.getByText(RELEASE.sha256).first()).toBeAttached();
  const dl = page.getByRole('link', { name: /Download package/ });
  await expect(dl).toBeVisible();
  expect(await dl.getAttribute('href')).toMatch(/^\/api\/download\?/);
  await noSidewaysScroll(page);
  await page.screenshot({ path: info.outputPath(`thank-you-${info.project.name}.png`), fullPage: true });
});
