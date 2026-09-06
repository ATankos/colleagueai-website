/**
 * tests/legal-consistency.test.mjs — the public pages and the terms must not
 * give a customer two different answers.
 *
 * /refund section 7 said "Charges for a started billing period are not refunded
 * pro rata" while docs/continuous-certification.md promised exactly that refund
 * in two places. Neither document was wrong on its own; together they were a
 * dispute waiting to happen, and the public page — the weaker position, and the
 * one a customer would quote back — was the one that would have been read.
 *
 * Nothing catches this class. Every other guard in this repo checks one document
 * against itself or against a dictionary. This checks two documents against each
 * other, which is the only way a contradiction is visible at all.
 *
 * Usage: node --test tests/legal-consistency.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const flat = (s) => s.replace(/\s+/g, ' ');
const LOCALES = ['cs', 'de', 'fr', 'es', 'it', 'pl', 'pt'];

/** The two unconditional refund promises in the Continuous Certification terms.
 *  Section 5.5 mentions a third, but as an open question for counsel about the
 *  60-day delivery window — a question, not a commitment — so it is not here. */
const PROMISES = [
  'may terminate and take a pro-rata refund of the unused term',   // 5.4, scope narrowed
  'the unused term is refunded pro rata',                          // 5.6, discontinuation
];

function section7(html) {
  const m = html.match(/<h2>7\.[^<]*<\/h2>\s*<p>([\s\S]*?)<\/p>/);
  assert.ok(m, 'section 7 is no longer where it was on this refund page');
  return flat(m[1]);
}

test('the certification terms still make the refund promises the public page relies on', () => {
  const doc = flat(read('docs/continuous-certification.md'));
  for (const promise of PROMISES) {
    assert.ok(doc.includes(promise),
      `docs/continuous-certification.md no longer promises "${promise}" — if the terms changed, /refund section 7 has to change with them`);
  }
});

test('every refund page carves those promises out of its general no-pro-rata rule', () => {
  const missing = [];
  for (const page of ['refund.html', ...LOCALES.map((l) => `${l}/refund.html`)]) {
    const body = section7(read('public/' + page));
    // "Continuous Certification" is protected vocabulary and stays untranslated
    // in all eight, so it is the one marker that works in every language.
    if (!body.includes('Continuous Certification')) missing.push(page);
  }
  assert.deepEqual(missing, [],
    'these refund pages still say charges are never refunded pro rata, while the certification terms promise they are:\n  ' + missing.join('\n  '));
});

test('the English carve-out names both exits, not just one', () => {
  const body = section7(read('public/refund.html'));
  assert.match(body, /narrow the covered scope/, 'the scope-narrowing exit (5.4) is missing from /refund');
  assert.match(body, /discontinue a package/, 'the discontinuation exit (5.6) is missing from /refund');
  assert.match(body, /perpetual licence to the version already purchased is unaffected/,
    'the carve-out must say the perpetual licence survives, or it reads as if cancelling costs the customer their agent');
});
