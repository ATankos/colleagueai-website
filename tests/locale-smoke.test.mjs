/* locale-smoke.test.mjs — regression guard for localized pages.
   Loads every locale's key pages from dist/ with scripts executing and
   asserts zero JS errors plus working core features (catalogue, quiz,
   walkthrough, homepage nav). Exists because a FR/IT apostrophe once
   broke the walkthrough script in production without any check noticing. */
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const LOCS = ['cs', 'de', 'fr', 'es', 'it', 'pl', 'pt'];
const exists = (p) => fs.existsSync(p);

function loadPage(file, url) {
  return new Promise((resolve) => {
    const errors = [];
    const dom = new JSDOM(fs.readFileSync(file, 'utf8'), { runScripts: 'dangerously', url, pretendToBeVisual: true });
    dom.window.addEventListener('error', (e) => errors.push(e.message));
    dom.window.HTMLElement.prototype.scrollIntoView = function () {};
    setTimeout(() => resolve({ dom, errors }), 600);
  });
}

test('catalogue pages: scripts run and core features work in every language', { timeout: 60000 }, async () => {
  for (const loc of ['en', ...LOCS]) {
    const file = loc === 'en' ? 'dist/agents.html' : `dist/${loc}/agents.html`;
    if (!exists(file)) continue;
    const { dom, errors } = await loadPage(file, `https://www.colleagueai.ai/${loc === 'en' ? '' : loc + '/'}agents`);
    const d = dom.window.document;
    assert.deepStrictEqual(errors, [], `${loc}: JS errors on agents page`);
    assert.ok(d.querySelectorAll('#grid .card').length >= 12, `${loc}: agent grid empty`);
    // quiz answers and produces a result
    const qs = d.querySelectorAll('#ga-quiz .ga-q');
    assert.strictEqual(qs.length, 6, `${loc}: quiz questions missing`);
    qs.forEach((q) => { const i = q.querySelector('input'); i.checked = true; i.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
    d.getElementById('ga-run').click();
    assert.ok(d.getElementById('ga-diag').textContent.trim().length > 10, `${loc}: quiz result empty`);
    // walkthrough advances (this is what the FR/IT apostrophe bug killed)
    d.querySelector('[data-proof-action="next"]').click();
    assert.ok(/^2/.test(d.querySelector('[data-proof-title]').textContent), `${loc}: walkthrough step 2 broken`);
    dom.window.close();
  }
});

test('homepages: language switcher and mobile nav work in every language', { timeout: 60000 }, async () => {
  for (const loc of ['en', ...LOCS]) {
    const file = loc === 'en' ? 'dist/index.html' : `dist/${loc}/index.html`;
    if (!exists(file)) continue;
    const { dom, errors } = await loadPage(file, `https://www.colleagueai.ai/${loc === 'en' ? '' : loc}`);
    const d = dom.window.document;
    assert.deepStrictEqual(errors, [], `${loc}: JS errors on homepage`);
    assert.strictEqual(d.getElementById('homelang').options.length, 8, `${loc}: language switcher incomplete`);
    d.getElementById('burger').click();
    assert.ok(d.getElementById('mnav').classList.contains('open'), `${loc}: mobile menu broken`);
    dom.window.close();
  }
});
