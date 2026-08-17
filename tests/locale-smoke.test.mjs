/* locale-smoke.test.mjs — regression guard for localized pages.
   Loads every locale's key pages from dist/ with scripts executing and
   asserts zero JS errors plus working core features (catalogue, quiz,
   walkthrough, homepage nav). Exists because a FR/IT apostrophe once
   broke the walkthrough script in production without any check noticing. */
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';

const LOCS = ['cs', 'de', 'fr', 'es', 'it', 'pl', 'pt'];
const exists = (p) => fs.existsSync(p);

/* The final build step (externalize-inline-scripts.cjs) moves inline scripts
   into /assets/inline-<hash>.js so the CSP can drop 'unsafe-inline'. jsdom runs
   inline scripts but does not fetch external ones, so those would silently not
   execute here and the page would look broken to the test while being perfectly
   fine in a browser. Re-inlining them from dist/ restores exactly the code a
   browser would run, and avoids depending on jsdom's ResourceLoader API, which
   was removed in jsdom 30. */
function restoreExtractedScripts(html) {
  return html.replace(
    /<script([^>]*?)\ssrc="(\/assets\/inline-[^"]+)"([^>]*?)><\/script>/g,
    (whole, pre, src, post) => {
      // read-and-catch rather than exists-then-read: the latter is a file-system race
      try {
        return `<script${pre}${post}>${fs.readFileSync(path.join('dist', src.split('?')[0]), 'utf8')}</script>`;
      } catch {
        return whole;
      }
    },
  );
}

function loadPage(file, url) {
  return new Promise((resolve) => {
    const errors = [];
    const html = restoreExtractedScripts(fs.readFileSync(file, 'utf8'));
    const dom = new JSDOM(html, { runScripts: 'dangerously', url, pretendToBeVisual: true });
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
    // walkthrough advances (this is what the FR/IT apostrophe bug killed)
    d.querySelector('[data-proof-action="next"]').click();
    assert.ok(/^2/.test(d.querySelector('[data-proof-title]').textContent), `${loc}: walkthrough step 2 broken`);
    dom.window.close();
  }
});


/* The readiness quiz moved to the real /score page in the Phase 2 split. */
test('score pages: scripts run and the readiness quiz works in every language', { timeout: 60000 }, async () => {
  for (const loc of ['en', ...LOCS]) {
    const file = loc === 'en' ? 'dist/score.html' : `dist/${loc}/score.html`;
    if (!exists(file)) continue;
    const { dom, errors } = await loadPage(file, `https://www.colleagueai.ai/${loc === 'en' ? '' : loc + '/'}score`);
    const d = dom.window.document;
    assert.deepStrictEqual(errors, [], `${loc}: JS errors on score page`);
    const qs = d.querySelectorAll('#ga-quiz .ga-q');
    assert.strictEqual(qs.length, 6, `${loc}: quiz questions missing`);
    qs.forEach((q) => { const i = q.querySelector('input'); i.checked = true; i.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
    d.getElementById('ga-run').click();
    assert.ok(d.getElementById('ga-diag').textContent.trim().length > 10, `${loc}: quiz result empty`);
    assert.ok(d.getElementById('cai-score-guide'), `${loc}: score guide section missing`);
    dom.window.close();
  }
});

test('usage pages: scripts run and the Token Monitor section renders in every language', { timeout: 60000 }, async () => {
  for (const loc of ['en', ...LOCS]) {
    const file = loc === 'en' ? 'dist/usage.html' : `dist/${loc}/usage.html`;
    if (!exists(file)) continue;
    const { dom, errors } = await loadPage(file, `https://www.colleagueai.ai/${loc === 'en' ? '' : loc + '/'}usage`);
    const d = dom.window.document;
    assert.deepStrictEqual(errors, [], `${loc}: JS errors on usage page`);
    assert.ok(d.getElementById('usage-intelligence'), `${loc}: usage section missing`);
    assert.ok(d.querySelectorAll('.usage-intel__card').length >= 4, `${loc}: usage cards missing`);
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
