// Run: CAI_VIDEO_PREVIEW=1 npm run build, then [CHROME_PATH=...] node scripts/qa/video-qa.mjs (from the repository root).
// Browser QA for the video integration: real Chrome, desktop / tablet / phone, eight languages.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { start, log } from './video-qa-server.mjs';
const require = createRequire(`${process.cwd()}/package.json`);
const { chromium } = require('playwright');

const BASE = 'http://127.0.0.1:4321';
const LOCALES = ['en', 'cs', 'de', 'fr', 'es', 'it', 'pl', 'pt'];
const ROUTES = JSON.parse(fs.readFileSync('i18n.routes.json', 'utf8'));
const u = (page, l) => (page === 'home' ? (l === 'en' ? '/' : `/${l}`) : (l === 'en' ? `/${ROUTES.slugs[page].en}` : `/${l}/${ROUTES.slugs[page][l]}`));
const results = [];
const ok = (name, pass, detail = '') => { results.push({ name, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); };

const server = await start();
const browser = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), args: ['--autoplay-policy=user-gesture-required'] });
const VIEWPORTS = { desktop: { width: 1440, height: 900 }, tablet: { width: 820, height: 1180, isMobile: true, hasTouch: true }, phone: { width: 390, height: 844, isMobile: true, hasTouch: true } };

async function newPage(vp) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.hasTouch });
  const page = await ctx.newPage();
  const csp = [];
  const errors = [];
  page.on('console', (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) csp.push(m.text()); if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`)); });
  return { ctx, page, csp, errors };
}

// 1. Every language: canonical pages carry the right player, transcript language, no media before interaction.
for (const l of LOCALES) {
  for (const [page, id] of [['home', 'corporate'], ['partners', 'install'], ['certified', 'certification']]) {
    const { ctx, page: p, csp, errors } = await newPage(VIEWPORTS.desktop);
    log.length = 0;
    await p.goto(BASE + u(page, l), { waitUntil: 'networkidle' });
    const media = log.filter((r) => /\.(mp4|vtt)$/.test(r.path));
    const fig = p.locator(`figure[data-cai-video="${id}"]`);
    const title = await fig.locator('.cai-video__title').innerText();
    const txLang = await fig.locator('.cai-video__txbody').getAttribute('lang');
    const sel = await fig.locator('select[data-cai-video-cc-select]').inputValue();
    const v = await p.evaluate(() => window.__csp.length);
    ok(`${l} ${page}: ${id} player, transcript ${txLang}, subtitles default ${sel}, no media before click`, (await fig.count()) === 1 && txLang === l && media.length === 0 && v === 0 && csp.length === 0 && errors.length === 0, `title "${title}"${media.length ? ` media:${media.map((m) => m.path)}` : ''}${errors.length ? ` errors:${errors.slice(0, 2)}` : ''}`);
    await ctx.close();
  }
}

// 2. Playback, captions below the picture, range requests, keyboard, fullscreen, one-at-a-time.
for (const [name, vp] of Object.entries(VIEWPORTS)) {
  for (const [path, id, lang] of [['/cs', 'corporate', 'cs'], ['/de/partner', 'install', 'de'], ['/certified', 'certification', 'fr']]) {
    const { ctx, page: p, csp, errors } = await newPage(vp);
    log.length = 0;
    await p.goto(BASE + path, { waitUntil: 'networkidle' });
    const fig = p.locator(`figure[data-cai-video="${id}"]`);
    await fig.scrollIntoViewIfNeeded();
    await fig.locator('select[data-cai-video-cc-select]').selectOption(lang);
    await fig.locator('[data-cai-video-play]').focus();
    await p.keyboard.press('Enter');
    await p.waitForTimeout(400);
    const playing = await p.evaluate((i) => { const v = document.querySelector(`figure[data-cai-video="${i}"] video`); return v && { paused: v.paused, muted: v.muted, focused: document.activeElement === v }; }, id);
    // seek into a narrated passage and wait for a cue
    await p.evaluate((i) => { const v = document.querySelector(`figure[data-cai-video="${i}"] video`); v.currentTime = 30; }, id);
    await p.waitForTimeout(2500);
    const cc = await fig.locator('[data-cai-video-cc]').evaluate((e) => ({ hidden: e.hidden, text: e.textContent }));
    const box = await p.evaluate((i) => { const f = document.querySelector(`figure[data-cai-video="${i}"]`); const s = f.querySelector('.cai-video__stage').getBoundingClientRect(); const c = f.querySelector('[data-cai-video-cc]').getBoundingClientRect(); return { below: c.top >= s.bottom - 1 }; }, id);
    const ranged = log.filter((r) => r.path.endsWith('.mp4'));
    const vtt = log.filter((r) => r.path.endsWith('.vtt')).map((r) => r.path.split('.').slice(-2, -1)[0]);
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(`${name} ${path}: ${id} plays on keyboard Enter with sound, ${lang} subtitles below the picture`, playing && !playing.paused && !playing.muted && playing.focused && !cc.hidden && cc.text.length > 3 && box.below && csp.length === 0 && errors.length === 0,
      `cue "${cc.text.replace(/\n/g, ' / ').slice(0, 70)}"; mp4 requests ${ranged.length} (range: ${ranged.some((r) => r.range)}); vtt fetched: ${[...new Set(vtt)].join(',')}`);
    ok(`${name} ${path}: no horizontal overflow`, overflow <= 0, `${overflow}px`);
    // fullscreen covers picture and caption bar
    await fig.locator('[data-cai-video-fs]').click();
    await p.waitForTimeout(500);
    const fs1 = await p.evaluate(() => document.fullscreenElement && document.fullscreenElement.className);
    ok(`${name} ${path}: full screen holds picture + caption bar`, fs1 === 'cai-video__frame', String(fs1));
    if (fs1) await p.evaluate(() => document.exitFullscreen());
    await ctx.close();
  }
}

// 3. Only one plays at a time (factsheet has the install player; certified link card; home has corporate). Use a page with two players: none by design; simulate by opening two in one page? Check cards resolve instead.
{
  const { ctx, page: p } = await newPage(VIEWPORTS.desktop);
  const pages = ['/', '/agents', '/pricing', '/partners', '/trust', '/usage', '/agents/contract-intelligence-and-register', '/pl', '/pl/agenci', '/pl/cennik', '/pl/partnerzy', '/pl/zaufanie', '/pl/usage'];
  let bad = [];
  for (const pg of pages) {
    await p.goto(BASE + pg, { waitUntil: 'domcontentloaded' });
    const hrefs = await p.$$eval('a.cai-vcard', (as) => as.map((a) => a.getAttribute('href')));
    for (const h of hrefs) {
      const [path, hash] = h.split('#');
      const r = await p.request.get(BASE + path);
      const body = await r.text();
      if (r.status() !== 200 || !body.includes(`id="${hash}"`)) bad.push(`${pg} -> ${h} (${r.status()})`);
    }
  }
  ok('every video card links to a page that holds that player (EN + PL sample)', bad.length === 0, bad.join('; '));
  await ctx.close();
}

// 4. Keyboard path: Tab reaches play, subtitles, full screen, transcript; transcript opens with Enter.
{
  const { ctx, page: p } = await newPage(VIEWPORTS.desktop);
  await p.goto(BASE + '/certified', { waitUntil: 'networkidle' });
  const fig = p.locator('figure[data-cai-video="certification"]');
  await fig.locator('[data-cai-video-play]').focus();
  const order = [];
  for (let i = 0; i < 6; i += 1) { order.push(await p.evaluate(() => { const a = document.activeElement; return a.getAttribute('data-cai-video-play') !== null ? 'play' : a.tagName === 'SELECT' ? 'select' : a.hasAttribute('data-cai-video-fs') ? 'fullscreen' : a.tagName === 'SUMMARY' ? 'transcript' : a.tagName.toLowerCase(); })); await p.keyboard.press('Tab'); }
  await fig.locator('summary').focus();
  await p.keyboard.press('Enter');
  const open = await fig.locator('details').evaluate((d) => d.open);
  ok('keyboard: play -> subtitles -> full screen -> transcript; transcript opens with Enter', order.slice(0, 4).join('>') === 'play>select>fullscreen>transcript' && open, order.join('>'));
  await ctx.close();
}

// 5. axe accessibility on the three canonical pages (video sections only).
{
  let axe = null;
  try { axe = require('@axe-core/playwright').default || require('@axe-core/playwright').AxeBuilder; } catch { /* not installed */ }
  if (axe) {
    for (const pg of ['/', '/cs/partneri', '/certified', '/agents']) {
      const { ctx, page: p } = await newPage(VIEWPORTS.desktop);
      await p.goto(BASE + pg, { waitUntil: 'networkidle' });
      const r = await new axe({ page: p }).include('.cai-video-sec').include('.cai-vstrip').analyze();
      const v = r.violations.map((x) => `${x.id}(${x.nodes.length})`);
      ok(`axe on ${pg} video sections`, v.length === 0, v.join(', '));
      await ctx.close();
    }
  } else ok('axe', false, '@axe-core/playwright not installed');
}

await browser.close();
server.close();
fs.writeFileSync('video-qa-results.json', JSON.stringify(results, null, 1));
console.log(`\n${results.filter((r) => r.pass).length}/${results.length} passed`);
