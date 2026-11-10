/**
 * tests/tax-policy.test.mjs - the tax policy cannot be acted on before the accountant approves it (PR B).
 *
 * Holds these lines:
 *   - config/tax-policy.json as committed is unapproved, so live checkout is refused and nothing tax-related is applied;
 *   - an "approved" policy with any blocking decision, treatment or approval field empty is still refused;
 *   - the sandbox fixture never applies with a live key;
 *   - buyer categories come from facts; a business without a VAT ID is a business, and no category implies reverse
 *     charge - every wording and action comes from the policy;
 *   - checkout asks Stripe for Stripe Tax, a required tax ID or an invoice only when an active policy says so.
 * Usage: node --test tests/tax-policy.test.mjs
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { casServe } from './kv-cas-fake.mjs';
import * as tax from '../lib/taxPolicy.js';

const ROOT = new URL('..', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const POLICY = JSON.parse(read('config/tax-policy.json'));
const SANDBOX = JSON.parse(read('config/tax-policy.sandbox.json'));
const LEGAL = JSON.parse(read('config/legal.json'));
const LIVE = 'sk_live_NOT_A_REAL_KEY';
const TEST = 'sk_test_NOT_A_REAL_KEY';

/** A complete policy shaped like an accountant's answer. The wording is invented for the test, not advice. */
function approvedPolicy(overrides = {}) {
  const t = (action, invoiceNote = 'Wording from the accountant') => ({ action, invoiceNote });
  return {
    ...POLICY,
    status: 'approved',
    approval: { approvedBy: 'Test Accountant', role: 'Accountant', approvedAt: '2026-12-01', reference: 'letter of 1 Dec 2026' },
    seller: { ...POLICY.seller, vatStatus: 'vat_payer', vatId: 'CZ29540852', vatEffectiveFrom: '2026-12-01' },
    decisions: Object.fromEntries(Object.keys(POLICY.decisions).map((k) => [k, `answer to ${k}`])),
    treatments: {
      cz_business: t('sell'), eu_business_vat_verified: t('sell'), eu_business_vat_pending: t('hold'),
      eu_business_vat_unverified: t('hold'), eu_business_no_vat_id: t('block'), non_eu_business: t('sell'),
    },
    checkout: { requireTaxIdIfSupported: true, stripeTax: true, invoiceRoute: 'stripe', onCountryMismatch: 'hold' },
    ...overrides,
  };
}

test('the committed policy is unapproved: inactive with any key, and it closes live checkout', () => {
  assert.equal(POLICY.status, 'unapproved');
  assert.equal(tax.policyActive(POLICY, TEST), false);
  assert.equal(tax.policyActive(POLICY, LIVE), false);
  assert.equal(tax.liveTaxBlocked(LIVE, POLICY), true);
  assert.equal(tax.liveTaxBlocked(TEST, POLICY), false, 'sandbox purchases keep working');
  const errors = tax.policyErrors(POLICY);
  for (const d of tax.BLOCKING_DECISIONS) assert.ok(errors.some((e) => e.includes(d)), `reports missing ${d}`);
  assert.ok(errors.some((e) => e.includes('approval.approvedBy')));
});

test('an "approved" policy is still refused while any blocking decision, treatment or approval field is empty', () => {
  assert.deepEqual(tax.policyErrors(approvedPolicy()), [], 'the complete example passes');
  assert.equal(tax.policyActive(approvedPolicy(), LIVE), true);
  const noRoute = approvedPolicy({ decisions: { ...approvedPolicy().decisions, T13_invoiceRoute: null } });
  assert.ok(tax.policyErrors(noRoute).some((e) => e.includes('T13')));
  const noApprover = approvedPolicy({ approval: { ...approvedPolicy().approval, approvedBy: '' } });
  assert.equal(tax.policyActive(noApprover, LIVE), false);
  const noTreatment = approvedPolicy({ treatments: { ...approvedPolicy().treatments, eu_business_no_vat_id: null } });
  assert.ok(tax.policyErrors(noTreatment).some((e) => e.includes('eu_business_no_vat_id')));
  const vatWithoutNumber = approvedPolicy({ seller: { ...approvedPolicy().seller, vatId: null } });
  assert.ok(tax.policyErrors(vatWithoutNumber).some((e) => e.includes('seller.vatId')));
});

test('the sandbox fixture applies only with a test key and TAX_POLICY_SANDBOX=1, never with a live key', () => {
  assert.equal(SANDBOX.sandboxOnly, true);
  assert.equal(tax.policyFor(TEST, { env: {} }).version, POLICY.version);
  assert.equal(tax.policyFor(TEST, { env: { TAX_POLICY_SANDBOX: '1' } }).version, SANDBOX.version);
  assert.equal(tax.policyFor(LIVE, { env: { TAX_POLICY_SANDBOX: '1' } }).version, POLICY.version, 'a live key never gets the fixture');
  assert.equal(tax.policyActive(SANDBOX, TEST), true);
  assert.equal(tax.policyActive(SANDBOX, LIVE), false);
  assert.equal(tax.policyFor(TEST, { env: { TAX_POLICY_SANDBOX: '1', TAX_SANDBOX_INVOICE_ROUTE: 'stripe' } }).checkout.invoiceRoute, 'stripe');
  assert.equal(tax.policyFor(TEST, { env: { TAX_POLICY_SANDBOX: '1', TAX_SANDBOX_INVOICE_ROUTE: 'anything' } }).checkout.invoiceRoute, 'sandbox_ledger');
  for (const t of Object.values(SANDBOX.treatments)) assert.match(t.invoiceNote, /^TEST/, 'sandbox wording is marked TEST');
});

test('buyer categories come from facts; a business without a VAT ID is a business, never a consumer', () => {
  assert.equal(tax.classifyBuyer({ country: 'CZ' }), 'cz_business');
  assert.equal(tax.classifyBuyer({ country: 'CZ', taxId: { value: 'CZ12345678' } }), 'cz_business');
  assert.equal(tax.classifyBuyer({ country: 'DE' }), 'eu_business_no_vat_id');
  assert.equal(tax.classifyBuyer({ country: 'DE', taxId: { value: 'DE123456789' } }), 'eu_business_vat_pending');
  assert.equal(tax.classifyBuyer({ country: 'DE', taxId: { value: 'DE123456789' }, verification: 'pending' }), 'eu_business_vat_pending');
  assert.equal(tax.classifyBuyer({ country: 'DE', taxId: { value: 'DE123456789' }, verification: 'verified' }), 'eu_business_vat_verified');
  assert.equal(tax.classifyBuyer({ country: 'DE', taxId: { value: 'DE123456789' }, verification: 'unverified' }), 'eu_business_vat_unverified');
  assert.equal(tax.classifyBuyer({ country: 'FR', taxId: { value: 'FRAB123456789' }, verification: 'unavailable' }), 'eu_business_vat_unverified');
  assert.equal(tax.classifyBuyer({ country: 'US' }), 'non_eu_business');
  assert.equal(tax.classifyBuyer({ country: 'GB', taxId: { value: 'GB123456789' } }), 'non_eu_business');
  assert.ok(!tax.CATEGORIES.some((c) => /consumer/.test(c)), 'there is no consumer category: B2B only');
});

test('no treatment is assumed: with the unapproved policy nothing is applied and no wording is produced', () => {
  const t = tax.treatmentFor(POLICY, TEST, { country: 'DE', taxId: { value: 'DE123456789', type: 'eu_vat' } });
  assert.equal(t.applied, false);
  assert.equal(t.invoiceNote, null);
  // Tax wording lives only in the policy files: the code carries none.
  for (const f of ['lib/taxPolicy.js', 'lib/invoicing.js', 'api/checkout.js', 'api/webhook.js']) {
    const code = read(f).split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');
    assert.ok(!/reverse[ -]?charge|daň odvede|přenesen/i.test(code), `${f} contains tax wording outside comments`);
  }
});

test('checkout asks Stripe for Stripe Tax, a required tax ID and an invoice only under an active policy', () => {
  const ctx = { mode: 'payment', orderId: 'ord_20261201_aaaaaaaaaaaa', acceptanceId: 'acc_x', description: 'Licence', buyer: { registrationNumber: '12345678' } };
  assert.deepEqual(tax.checkoutTaxParams(POLICY, TEST, ctx), { tax_id_collection: { enabled: true } });
  assert.deepEqual(tax.checkoutTaxParams(approvedPolicy(), TEST, ctx).tax_id_collection, { enabled: true, required: 'if_supported' });
  const p = tax.checkoutTaxParams(approvedPolicy(), LIVE, { ...ctx, treatment: { applied: true, invoiceNote: 'Wording from the accountant' } });
  assert.deepEqual(p.automatic_tax, { enabled: true });
  assert.equal(p.invoice_creation.enabled, true);
  assert.equal(p.invoice_creation.invoice_data.metadata.order_id, ctx.orderId);
  assert.deepEqual(p.invoice_creation.invoice_data.custom_fields, [{ name: 'Order', value: ctx.orderId }, { name: 'Buyer reg. no.', value: '12345678' }]);
  assert.match(p.invoice_creation.invoice_data.footer, /DIČ CZ29540852/);
  assert.match(p.invoice_creation.invoice_data.footer, /Wording from the accountant$/);
  assert.equal(tax.checkoutTaxParams(approvedPolicy(), LIVE, { ...ctx, mode: 'subscription' }).invoice_creation, undefined, 'subscriptions invoice themselves');
  const notRegistered = approvedPolicy({ seller: { ...POLICY.seller, vatStatus: 'not_registered', vatId: null } });
  assert.ok(!/DIČ/.test(tax.invoiceFooter(notRegistered, null)), 'no DIČ is printed for a seller that is not registered');
});

// ── the checkout handler under the sandbox fixture ──────────────────────────────────────────────────────────────
const store = new Map();
const stripeCalls = [];
let kvServer, stripeServer, checkout;
before(async () => {
  kvServer = http.createServer((req, res) => {
    if (req.method === 'POST') return casServe(store, req, res);
    const [, cmd, ...args] = req.url.split('/').map(decodeURIComponent);
    let result = null;
    if (cmd === 'GET') result = store.get(args[0]) ?? null;
    else if (cmd === 'SET') { if (args.includes('NX') && store.has(args[0])) result = null; else { store.set(args[0], args[1]); result = 'OK'; } }
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ result }));
  });
  stripeServer = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      stripeCalls.push({ path: req.url, params: new URLSearchParams(raw) });
      res.setHeader('content-type', 'application/json');
      if (req.url === '/v1/customers') return res.end(JSON.stringify({ id: 'cus_tax_1', object: 'customer' }));
      if (req.url === '/v1/checkout/sessions') return res.end(JSON.stringify({ id: 'cs_tax_1', object: 'checkout.session', url: 'https://checkout.example.test/c/pay/cs_tax_1' }));
      res.writeHead(404); res.end('{}');
    });
  });
  await new Promise((r) => kvServer.listen(0, '127.0.0.1', r));
  await new Promise((r) => stripeServer.listen(0, '127.0.0.1', r));
  process.env.KV_REST_API_URL = `http://127.0.0.1:${kvServer.address().port}`;
  process.env.KV_REST_API_TOKEN = 'local-dummy-token';
  process.env.STRIPE_API_HOST = `http://127.0.0.1:${stripeServer.address().port}`;
  process.env.STRIPE_SECRET_KEY = 'sk_test_fake_never_sent_to_stripe';
  delete process.env.VERCEL_ENV;
  ({ default: checkout } = await import('../api/checkout.js'));
});
after(async () => {
  for (const s of [kvServer, stripeServer]) { s.closeAllConnections?.(); await new Promise((r) => s.close(r)); }
  delete process.env.TAX_POLICY_SANDBOX; delete process.env.TAX_SANDBOX_INVOICE_ROUTE;
});
beforeEach(() => { store.clear(); stripeCalls.length = 0; });

const FORM = {
  agent: 'contract-intelligence-and-register', method: 'card', lang: 'en',
  company: 'Beispiel Werke GmbH', country: 'DE', tax_id: 'DE123456789', email: 'einkauf@beispiel.example',
  name: 'Max Muster', role: 'Geschäftsführer', authority: 'on', terms: 'on', delivery: 'on', legal_set: LEGAL.set,
};
async function post(body) {
  const r = { statusCode: 200, headers: {} };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; };
  r.writeHead = (c, h = {}) => { r.statusCode = c; Object.assign(r.headers, h); return r; };
  r.end = (b) => { if (b !== undefined) r.body = b; return r; };
  await checkout({ method: 'POST', body, query: {}, headers: { host: 'shop.example.test' } }, r);
  return r;
}
const sessionParams = () => stripeCalls.find((c) => c.path === '/v1/checkout/sessions')?.params;

test('unapproved policy, test key: the order records that no tax treatment was applied; no Stripe Tax, no invoice', async () => {
  delete process.env.TAX_POLICY_SANDBOX;
  const res = await post(FORM);
  assert.equal(res.statusCode, 303);
  const p = sessionParams();
  assert.equal(p.get('automatic_tax[enabled]'), null);
  assert.equal(p.get('invoice_creation[enabled]'), null);
  assert.equal(p.get('tax_id_collection[enabled]'), 'true');
  const order = [...store.entries()].filter(([k]) => k.startsWith('order:')).map(([, v]) => JSON.parse(v))[0];
  assert.deepEqual(
    { applied: order.tax.applied, status: order.tax.policyStatus, category: order.tax.category, route: order.tax.invoiceRoute },
    { applied: false, status: 'unapproved', category: 'eu_business_vat_pending', route: null },
  );
});

test('sandbox fixture with the Stripe invoice route: Checkout is asked for a post-payment invoice naming the order', async () => {
  process.env.TAX_POLICY_SANDBOX = '1';
  process.env.TAX_SANDBOX_INVOICE_ROUTE = 'stripe';
  try {
    const res = await post(FORM);
    assert.equal(res.statusCode, 303);
    const p = sessionParams();
    const orderId = p.get('metadata[order_id]');
    assert.equal(p.get('invoice_creation[enabled]'), 'true');
    assert.equal(p.get('invoice_creation[invoice_data][metadata][order_id]'), orderId);
    assert.equal(p.get('invoice_creation[invoice_data][custom_fields][0][value]'), orderId);
    assert.match(p.get('invoice_creation[invoice_data][footer]'), /^Colleague AI s\.r\.o\..*IČO 29540852/s);
    assert.match(p.get('invoice_creation[invoice_data][footer]'), /TEST - EU treatment not decided/);
    assert.equal(p.get('automatic_tax[enabled]'), null, 'the fixture does not switch Stripe Tax on');
  } finally { delete process.env.TAX_POLICY_SANDBOX; delete process.env.TAX_SANDBOX_INVOICE_ROUTE; }
});

test('sandbox fixture: an EU business without a VAT ID is held for manual handling before any Stripe call', async () => {
  process.env.TAX_POLICY_SANDBOX = '1';
  try {
    const res = await post({ ...FORM, tax_id: '' });
    assert.equal(res.statusCode, 409);
    assert.match(res.body, /needs a manual check before payment/);
    assert.equal(stripeCalls.length, 0);
    assert.equal([...store.keys()].filter((k) => k.startsWith('order:')).length, 0);
  } finally { delete process.env.TAX_POLICY_SANDBOX; }
});
