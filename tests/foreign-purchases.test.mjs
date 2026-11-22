// Foreign-supplier purchases: the classifier never invents a treatment, and flags what the accountant must see.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assessPurchase, assessRegister } from '../lib/purchaseVat.js';

// TEST DATA ONLY - not a real invoice of the company.
const base = () => ({
  id: 'ms-TEST-1',
  supplier: { name: 'Example Cloud Ltd', country: 'IE', taxId: 'IE0000000X' },
  service: { description: 'cloud subscription', class: 'cloud_hosting', periodStart: '2026-10-01', periodEnd: '2026-10-31' },
  invoice: { number: 'TEST-1', date: '2026-10-30', currency: 'EUR', netAmount: 100, vatAmount: 21, vatRate: 21, vatCountry: 'CZ', reverseChargeLegend: false, customerTaxIdShown: false },
  payment: { date: '2026-11-02' },
  evidence: { sha256: 'a'.repeat(64), storageRef: 'private:accounting/2026/10/TEST-1.pdf' },
  accountantDecision: null,
});

test('a complete record without an accountant decision is never decided automatically', () => {
  const r = assessPurchase(base());
  assert.equal(r.status, 'needs_accountant');
  assert.equal(r.decision, null);
  assert.deepEqual(r.candidateMonths, ['2026-10', '2026-11'], 'candidate months are listed, not chosen');
  assert.ok(r.flags.some((f) => f.startsWith('supplier_charged_vat')));
  assert.ok(r.flags.some((f) => f.startsWith('our_tax_id_missing_on_invoice')));
});

test('missing facts make the record incomplete, whatever decision is attached', () => {
  const rec = base(); delete rec.supplier.taxId; rec.invoice.date = '30.10.2026';
  rec.accountantDecision = { treatment: 'self_assess', decidedBy: 'X', decidedAt: '2026-11-20', reference: 'r', period: '2026-10', taxPoint: '2026-10-31', czkRate: 24.5 };
  const r = assessPurchase(rec);
  assert.equal(r.status, 'incomplete');
  assert.ok(r.missing.includes('supplier.taxId'));
  assert.ok(r.missing.includes('invoice.date (YYYY-MM-DD)'));
});

test('a self-assessment decision counts only with period, tax point, CZK rate, who, when and where filed', () => {
  const rec = base();
  rec.accountantDecision = { treatment: 'self_assess', decidedBy: 'Accountant (test)', decidedAt: '2026-11-20', reference: 'e-mail (test)' };
  assert.equal(assessPurchase(rec).status, 'needs_accountant');
  Object.assign(rec.accountantDecision, { period: '2026-10', taxPoint: '2026-10-31', czkRate: 24.5 });
  const r = assessPurchase(rec);
  assert.equal(r.status, 'decided');
  assert.equal(r.decision.period, '2026-10');
});

test('payment-processing fees, Czech suppliers and contradictory invoices are flagged', () => {
  const pay = base(); pay.service.class = 'payment_processing';
  assert.ok(assessPurchase(pay).flags.some((f) => f.startsWith('possible_exemption')));
  const cz = base(); cz.supplier.country = 'CZ';
  assert.ok(assessPurchase(cz).flags.some((f) => f.startsWith('czech_supplier')));
  const bad = base(); bad.invoice.reverseChargeLegend = true;
  assert.ok(assessPurchase(bad).flags.some((f) => f.startsWith('inconsistent_invoice')));
});

test('the register never totals tax and the CLI refuses a register inside the repository', () => {
  const reg = assessRegister([base(), { id: 'empty' }]);
  assert.equal(reg.open, 2);
  assert.ok(!JSON.stringify(reg).match(/"(taxDue|vatDue|amountDue)"/));
  const inside = spawnSync(process.execPath, ['scripts/commerce/foreign-purchases.mjs', 'docs/commerce/templates/foreign-purchase.template.json'], { encoding: 'utf8' });
  assert.equal(inside.status, 2);
  assert.match(inside.stderr, /must not be inside the repository/);
  const dir = mkdtempSync(join(tmpdir(), 'fp-')); const f = join(dir, 'reg.json');
  writeFileSync(f, JSON.stringify([base()]));
  const out = spawnSync(process.execPath, ['scripts/commerce/foreign-purchases.mjs', f], { encoding: 'utf8' });
  assert.equal(out.status, 1, 'open items exit 1');
  assert.match(out.stdout, /NEEDS_ACCOUNTANT/);
});
