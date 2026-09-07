/**
 * tests/partner-programme.test.mjs — the partner page's one commercial promise.
 *
 * 10% of the catalogue mean is $979. That is a fee for an introduction, not a
 * budget for a salesperson, and no rate the company could offer would change
 * that. What makes the programme worth joining is the other money: the
 * implementation a partner does for its own client, which the partner contracts
 * and invoices and ColleagueAI does not touch.
 *
 * That promise now appears in three places on one page — the referral lead, the
 * programme terms and the reseller FAQ — which is exactly the shape of the
 * defect PR #380 fixed on /refund: two parts of the same commitment drifting
 * apart, with the weaker one quoted back in a dispute. These assertions keep
 * them saying the same thing, and keep all seven locales saying it too.
 *
 * The locale half reads dist/, because public/<loc>/partners.html is not source:
 * scripts/generate-global-language-pages.cjs rewrites all eight locale partner
 * pages from the English master during the build.
 *
 * Usage: node --test tests/partner-programme.test.mjs
 *        (the last test additionally needs `npm run build`)
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import PRICING from '../config/pricing.json' with { type: 'json' };

const LOCALES = ['cs', 'de', 'fr', 'es', 'it', 'pl', 'pt'];
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const distPath = (p) => new URL('../dist/' + p, import.meta.url);

/* The four strings this change introduced. Each is keyed by its own English
   text in scripts/i18n/reviewed-copy.json, so editing any of them here without
   re-keying there is precisely what fails these tests. */
const LEAD = 'If you also implement the agent for your client, you contract and invoice that work '
  + 'yourself. ColleagueAI takes no share of it.';
const TERM_CARVE_OUT = 'Implementation, integration and support work a partner performs for its own '
  + 'client is contracted and invoiced by the partner; ColleagueAI takes no share of it.';
const TERM_REVERSAL = 'If a sale is refunded or charged back, the commission for that sale is reversed.';
const FAQ = 'Yes. You can refer the client and take the 10%, or licence the agents yourself and '
  + 'deploy them under your own service agreement. Either way, any implementation, integration or '
  + 'support work you do for your client is yours to contract and invoice. ColleagueAI takes no '
  + 'share of it.';
const NEW_COPY = [LEAD, TERM_CARVE_OUT, TERM_REVERSAL, FAQ];

test('the implementation carve-out is stated where a partner will read it', () => {
  const html = read('public/partners.html');
  assert.ok(html.includes(LEAD), 'the referral lead no longer says the partner keeps its own implementation revenue');
  assert.ok(html.includes(TERM_CARVE_OUT), 'the programme terms no longer carry the carve-out, so it is a promise and not a term');
  // Stored twice: the visible <details> and the page's FAQ payload, which is
  // what a search engine reads. A fix to one and not the other is the defect.
  assert.equal(html.split(FAQ).length - 1, 2,
    'the reseller FAQ answer must be identical in the visible FAQ and in the FAQ payload');
  assert.ok(!html.includes('Which routes apply to you is confirmed at approval'),
    'the old FAQ answer is still on the page and contradicts the carve-out beside it');
});

test('the page and the webhook agree about refunds', () => {
  const html = read('public/partners.html');
  assert.ok(html.includes(TERM_REVERSAL), 'the terms no longer state that a refund reverses the commission');
  // api/webhook.js reverses commission on charge.refunded and disputes. The page
  // saying anything softer than the code does is the wrong way round.
  const hook = read('api/webhook.js');
  assert.match(hook, /charge\.refunded/, 'the webhook no longer handles charge.refunded — recheck what the page promises');
});

test('the page advertises exactly the commission rate in the config', () => {
  const html = read('public/partners.html');
  const rates = [...html.matchAll(/class="pl-rate">([^<]*)/g)].map((m) => m[1].trim());
  const expected = PRICING.partnerCommissionRate * 100 + '%';
  assert.deepEqual(rates, [expected],
    `the partner page offers ${rates.join(', ')} where config/pricing.json says ${expected}`);
});

test('every string added here is translated in all seven locales', () => {
  const copy = JSON.parse(read('scripts/i18n/reviewed-copy.json'));
  for (const en of NEW_COPY) {
    for (const loc of LOCALES) {
      const t = copy[loc] && copy[loc][en];
      assert.ok(t, `${loc}: no reviewed translation for "${en.slice(0, 55)}..." — that locale will serve it in English`);
      assert.notEqual(t, en, `${loc}: the translation is the English string`);
    }
  }
});

test('no built locale page serves one of them back in English', {
  skip: existsSync(distPath('cs/partners.html')) ? false : 'needs npm run build',
}, () => {
  for (const loc of LOCALES) {
    const html = readFileSync(distPath(loc + '/partners.html'), 'utf8');
    for (const en of NEW_COPY) {
      assert.ok(!html.includes(en),
        `/${loc}/partners serves this in English: "${en.slice(0, 60)}..."`);
    }
  }
});

/* The whole partner-levels section -- the referral card, the programme terms,
   the carve-out above -- used to sit between <!-- cai-partner-levels:start/end -->
   markers, and scripts/generate-partner-levels.cjs stripped whatever was between
   them and injected a retired three-level programme (Referral 10%, Sales 15%,
   Strategic from 20%) in its place. It had been inert for a while because its
   anchor, <section id="generate">, is no longer on the page: 34 "no anchor"
   warnings a build and "injected into 0 files". Inert, not harmless -- restoring
   that anchor would have replaced hand-maintained commercial copy with two
   commission rates the company had already withdrawn. The script and its
   dictionary are gone; this keeps the markers from coming back and quietly
   putting the section back under a generator. */
test('the partner-levels section is source, not generated output', () => {
  const html = read('public/partners.html');
  assert.ok(!html.includes('cai-partner-levels:start') && !html.includes('cai-partner-levels:end'),
    'the partner section is wrapped in generator markers again — whatever generates it will strip this copy, the carve-out included');
});

/* Removing a build step is easy to get half-right: delete the file, leave the
   `node scripts/...` in package.json, and the build dies on the next deploy
   rather than here. */
test('every build step points at a script that exists', () => {
  const pkg = JSON.parse(read('package.json'));
  const missing = [];
  for (const phase of ['build', 'postbuild']) {
    for (const m of (pkg.scripts[phase] || '').matchAll(/node (scripts\/[\w.-]+)/g)) {
      if (!existsSync(new URL('../' + m[1], import.meta.url))) missing.push(`${phase}: ${m[1]}`);
    }
  }
  assert.deepEqual(missing, [], 'package.json runs scripts that are not in the repo: ' + missing.join(', '));
});

