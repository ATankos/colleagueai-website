/**
 * tests/security-txt.test.mjs - the security contact is machine-readable, current and consistent (RFC 9116, CRA
 * Art. 13(17) single point of contact, docs/security/vulnerability-handling-procedure.md):
 * /.well-known/security.txt names security@colleagueai.ai, expires in the future and within a year of the check date,
 * points its Policy at /security; /security exists, is routed, names the same address and makes no certification claim.
 *
 * Usage: node --test tests/security-txt.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const TXT = read('public/.well-known/security.txt');
const field = (k) => [...TXT.matchAll(new RegExp(`^${k}:\\s*(.+)$`, 'gmi'))].map((m) => m[1].trim());

test('security.txt: Contact, Expires, Canonical and Policy are present and well-formed', () => {
  assert.deepEqual(field('Contact'), ['mailto:security@colleagueai.ai'], 'one contact: the security mailbox');
  const exp = field('Expires');
  assert.equal(exp.length, 1, 'exactly one Expires');
  const at = Date.parse(exp[0]);
  assert.ok(Number.isFinite(at), 'Expires is an ISO 8601 date-time');
  const days = (at - Date.now()) / 86400000;
  assert.ok(days > 30, `Expires must be in the future with margin (now ${days.toFixed(0)} days): renew the file`);
  assert.ok(days <= 366, 'RFC 9116 recommends Expires less than a year ahead');
  assert.deepEqual(field('Canonical'), ['https://www.colleagueai.ai/.well-known/security.txt']);
  assert.deepEqual(field('Policy'), ['https://www.colleagueai.ai/security']);
});

test('/security is a routed page naming the same address, with no certification claim', () => {
  assert.ok(existsSync(new URL('../public/security.html', import.meta.url)));
  const page = read('public/security.html');
  assert.ok(page.includes('mailto:security@colleagueai.ai'));
  assert.ok(page.includes('<link rel="canonical" href="https://www.colleagueai.ai/security" />'));
  assert.ok(page.includes('does not claim conformity with any scheme'));
  // Wording checks apply to the page's own content, not to the shared site shell (locale route tables, header).
  const main = (page.match(/<main>([\s\S]*?)<\/main>/) || [])[1] || '';
  assert.ok(main.includes('security@colleagueai.ai'), 'the main content names the address');
  for (const bad of [/safe harbou?r/i, /\bguarantee/i, /within one business day/i, /\bcertified\b/i]) assert.ok(!bad.test(main.replace(/does not claim conformity[^<]*/, '')), `no unapproved promise: ${bad}`);
  const v = JSON.parse(read('vercel.json'));
  assert.ok(v.rewrites.some((r) => r.source === '/security' && r.destination === '/security.html'), '/security is routed');
});
