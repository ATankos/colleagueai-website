/**
 * tests/cc-positioning.test.mjs - Continuous Certification as a commercial pillar, without overclaiming.
 *
 * Reads dist/ (run npm run build first) plus the shared renderer. Checks that:
 *   - the block is on every main page in all eight languages and on all 36 factsheets, once, in the page's language,
 *     linking to the localized programme page;
 *   - every benefit keeps its honest status (built and tested / subscription benefit / planned), and the
 *     "not yet open" line is always shown;
 *   - no L5 price is shown anywhere; L2-L4 stay;
 *   - no ISO, compliance-guarantee, security-guarantee or savings claim appears in the programme copy;
 *   - the video slot renders only for an approved, same-origin asset.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = new URL('..', import.meta.url);
const DIST = new URL('../dist/', import.meta.url);
const built = existsSync(DIST);
const read = (p) => readFileSync(new URL(p, DIST), 'utf8');
const C = JSON.parse(readFileSync(new URL('scripts/i18n/certified-content.json', ROOT), 'utf8'));
const ROUTES = JSON.parse(readFileSync(new URL('i18n.routes.json', ROOT), 'utf8'));
const PRICING = JSON.parse(readFileSync(new URL('config/pricing.json', ROOT), 'utf8'));
const pillar = require('../scripts/lib/cc-pillar.cjs');
const LOCALES = ['en', 'cs', 'de', 'fr', 'es', 'it', 'pl', 'pt'];
const certUrl = (l) => (l === 'en' ? '/certified' : `/${l}/${ROUTES.slugs.certified[l]}`);
const KEYS = ['msg', 'msg2', 'msg_sub', 'soon', 'lic_note', 'b2_v', 'b4_v', 'b7_v', 'b9_v', 'b10_v', 'st_built', 'st_sub', 'st_plan', 'st_legend', 'b_h', 'cmp_h', 'cmp_c1', 'cmp_c2', 'cta', 'video_h',
  ...pillar.BENEFITS.flatMap((b) => [b, `${b}_t`]), ...pillar.ROWS.flatMap((r) => [r, `${r}a`, `${r}b`])];

test('status of every benefit is pinned: built and tested, subscription benefit, or planned', () => {
  assert.deepEqual({ ...pillar.STATUS }, {
    b1: 'sub', b2: 'built', b3: 'plan', b4: 'built', b5: 'sub', b6: 'plan', b7: 'built', b8: 'sub', b9: 'built', b10: 'built',
  });
});

test('every "built and tested" label names a specific capability backed by a named test, never a whole area', () => {
  const built = Object.entries(pillar.STATUS).filter(([, s]) => s === 'built').map(([b]) => b);
  assert.deepEqual(Object.keys(pillar.BUILT_CAPABILITY).sort(), built.sort());
  const html = pillar.render('en', { variant: 'full' });
  for (const b of built) {
    assert.ok(C.en[`${b}_v`] && C.en[`${b}_v`] !== C.en[`${b}_t`], `${b}: the label must name the capability, not repeat the area`);
    assert.ok(html.includes(`${C.en.st_built}</span>: <span data-i18n-cai="cert_${b}_v">${C.en[`${b}_v`]}</span>`), `${b}: badge`);
    for (const f of pillar.BUILT_CAPABILITY[b].match(/tests\/[a-z-]+\.test\.mjs/g) || []) assert.ok(existsSync(new URL(f, ROOT)), f);
  }
  assert.match(C.en.st_legend, /only to the specific capability/);
});

test('every block says security fixes, corrective releases and legal remediation need no subscription', () => {
  for (const l of LOCALES) for (const v of ['full', 'compact']) assert.ok(pillar.render(l, { variant: v }).includes(C[l].lic_note), `${l}/${v}`);
  assert.match(C.en.lic_note, /No subscription is needed for security fixes, corrective releases or remediation that the law requires/);
});

test('the programme copy exists in all eight languages and is translated', () => {
  for (const l of LOCALES) for (const k of KEYS) assert.ok(String(C[l][k] || '').trim(), `${l}.${k} missing`);
  for (const l of LOCALES.slice(1)) {
    for (const k of KEYS) {
      if (['r1a', 'r1b'].includes(k)) continue;
      assert.notEqual(C[l][k], C.en[k], `${l}.${k} is still English`);
    }
  }
});

test('no unsupported ISO, compliance, security-guarantee or savings claim in the programme copy, in any language', () => {
  const banned = [/\bISO\b/, /\bcomplian(t|ce)\s+(guaranteed|assured)/i, /guarantee/i, /garant/i, /gwarant/i, /zaruč/i,
    /\bsav(e|es|ing|ings)\b/i, /einspar/i, /économ(ie|iser)/i, /ahorr/i, /risparm/i, /oszczędn/i, /poupan/i, /úspor/i,
    /accredit|akkredit|akredyt|akredit|accrédit|acredit/i, /\b\d+\s?%/, /certified compliant/i, /secure by design/i];
  for (const l of LOCALES) {
    for (const k of KEYS) {
      for (const re of banned) assert.doesNotMatch(String(C[l][k]), re, `${l}.${k}: ${re}`);
    }
  }
});

test('the block is on every main page in every language, once, in that language, linking to the localized programme page', { skip: !built && 'build first' }, () => {
  const pages = (l) => {
    const d = l === 'en' ? '' : `${l}/`;
    return [`${d}index.html`, `${d}pricing.html`, `${d}agents.html`, `${d}trust.html`, `${d}score.html`, `${d}partners.html`];
  };
  for (const l of LOCALES) {
    for (const p of pages(l)) {
      if (!existsSync(new URL(p, DIST))) continue;
      const html = read(p);
      assert.equal(html.split('data-cc-pillar=').length - 1, 1, `${p}: expected one block`);
      assert.ok(html.includes(C[l].msg), `${p}: message not in ${l}`);
      assert.ok(html.includes(C[l].soon), `${p}: the not-yet-open line is missing`);
      assert.ok(html.includes(`href="${certUrl(l)}"`), `${p}: no link to ${certUrl(l)}`);
    }
    assert.ok(read(l === 'en' ? 'index.html' : `${l}/index.html`).includes('data-cc-pillar="full"'), `${l} home has no full block`);
    assert.ok(read(l === 'en' ? 'pricing.html' : `${l}/pricing.html`).includes('data-cc-pillar="full"'), `${l} pricing has no full block`);
  }
});

test('all 36 factsheets carry the block', { skip: !built && 'build first' }, () => {
  const files = readdirSync(new URL('agents/', DIST)).filter((f) => f.endsWith('.html') && f !== 'index.html');
  assert.equal(files.length, 36);
  for (const f of files) assert.ok(read(`agents/${f}`).includes('data-cc-pillar="compact"'), `agents/${f}`);
});

test('the dedicated page carries the full block, the comparison and only L2-L4 prices, in all eight languages', { skip: !built && 'build first' }, () => {
  for (const l of LOCALES) {
    const html = read(l === 'en' ? 'certified.html' : `${l}/certified.html`);
    assert.ok(html.includes('data-cc-pillar="full"'), `${l}/certified`);
    assert.ok(html.includes(C[l].cmp_h) && html.includes(C[l].r5a) && html.includes(C[l].r5b), `${l}/certified comparison`);
    for (const t of ['L2', 'L3', 'L4']) assert.ok(html.includes(`<td><b>${t}</b></td>`), `${l}/certified lost ${t}`);
    assert.ok(!html.includes('<td><b>L5</b></td>'), `${l}/certified still lists L5`);
  }
});

test('no L5 price is shown anywhere on the built site', { skip: !built && 'build first' }, () => {
  const l5 = PRICING.tiers.L5;
  const money = (c) => '$' + (c / 100).toLocaleString('en-US');
  const needles = [money(l5.oneTimeCents), `$${l5.monthlyCents / 100} /`, money(l5.annualCents)];
  const walk = (u) => readdirSync(u, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(new URL(`${e.name}/`, u)) : e.name.endsWith('.html') ? [new URL(e.name, u)] : []));
  for (const f of walk(DIST)) {
    const html = readFileSync(f, 'utf8');
    for (const n of needles) assert.ok(!html.includes(n), `${f.pathname.split('/dist/')[1]} shows the L5 price ${n}`);
  }
  assert.deepEqual(PRICING.subscriptionTiersOffered, ['L2', 'L3', 'L4']);
});

test('the video slot stays hidden until an approved same-origin video with captions in all eight languages exists', () => {
  assert.equal(pillar.approvedVideo(), null, 'config/media.json must carry no approved certification video until the founder approves it');
  for (const l of LOCALES) assert.ok(!pillar.render(l, { variant: 'full', withVideo: true }).includes('<video'), l);
  const src = readFileSync(new URL('scripts/lib/videos.cjs', ROOT), 'utf8');
  assert.ok(src.includes("LOCALES.every((l) => typeof caps[l] === 'string' && LOCAL_VTT.test(caps[l]))"), 'captions for every language are required');
});

test('/certified never says the certificate reflects the version a customer runs (ColleagueAI never verifies deployments)', () => {
  for (const l of LOCALES) assert.doesNotMatch(C[l].owe, /actually running|tatsächlich betriebene|réellement utilisée|realmente utiliza|effettivamente in uso|faktycznie używaną|efetivamente em uso|skutečně provozujete/, l);
  assert.match(C.en.owe, /does not inspect your environment/);
});

test('/certified is in the Lighthouse accessibility regression set', () => {
  assert.ok(readFileSync(new URL('scripts/run-lhci.mjs', ROOT), 'utf8').includes('/certified`'));
});

test('llms-full.txt describes the programme with its status and without L5', { skip: !built && 'build first' }, () => {
  const t = read('llms-full.txt');
  assert.ok(t.includes('## Continuous Certification (Coming soon)'));
  assert.ok(t.includes(C.en.msg) && t.includes('L5 is not offered'));
  for (const b of pillar.BENEFITS) assert.ok(t.includes(C.en[`${b}_t`]), b);
  assert.ok(read('llms.txt').includes('Continuous Certification (Coming soon)'));
});
