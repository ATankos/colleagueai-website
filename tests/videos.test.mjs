/* Site video: integrity, approval gate, captions in eight languages, honest copy, no download before interaction,
 * structured data only for approved videos, privacy (no storage, no third parties), caching.
 * Sources: config/media.json, scripts/lib/videos.cjs, scripts/i18n/videos/*.json, public/cai-video.js. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = new URL('..', import.meta.url);
const V = require('../scripts/lib/videos.cjs');
const MEDIA = JSON.parse(readFileSync(new URL('config/media.json', ROOT), 'utf8'));
const META = JSON.parse(readFileSync(new URL('scripts/i18n/videos/meta.json', ROOT), 'utf8'));
const LOCALES = ['en', 'cs', 'de', 'fr', 'es', 'it', 'pl', 'pt'];
const PUBLISHABLE = ['corporate', 'install', 'certification'];
const PREVIEW = { CAI_VIDEO_PREVIEW: '1', VERCEL_ENV: 'preview' };
/* Remove every <template>…</template> block by position (no regex over HTML: CodeQL js/bad-tag-filter). */
function withoutTemplates(html) {
  const lower = html.toLowerCase();
  let out = '';
  let from = 0;
  for (;;) {
    const open = lower.indexOf('<template', from);
    if (open === -1) return out + html.slice(from);
    const close = lower.indexOf('</template', open);
    if (close === -1) return out + html.slice(from, open);
    out += html.slice(from, open);
    const end = lower.indexOf('>', close);
    from = end === -1 ? html.length : end + 1;
  }
}
const seg = (id) => JSON.parse(readFileSync(new URL(`scripts/i18n/videos/${id}.json`, ROOT), 'utf8')).segments;

test('every served video file is byte-identical to its delivered master and named by its checksum', () => {
  for (const id of PUBLISHABLE) {
    const v = MEDIA.videos[id];
    const file = new URL(`public${v.src}`, ROOT);
    const buf = readFileSync(file);
    const sha = createHash('sha256').update(buf).digest('hex');
    assert.equal(sha, v.master.sha256, `${id}: sha256 of ${v.src}`);
    assert.equal(buf.length, v.master.bytes, `${id}: size`);
    assert.ok(v.src.includes(`.${sha.slice(0, 8)}.mp4`), `${id}: file name carries the checksum`);
    assert.equal(buf.subarray(4, 8).toString(), 'ftyp', `${id}: MP4`);
    assert.ok(buf.indexOf('moov') < buf.indexOf('mdat'), `${id}: fast start (moov before mdat) for progressive playback`);
    for (const p of [v.poster, v.posterSmall]) assert.ok(existsSync(new URL(`public${p}`, ROOT)), `${id}: ${p}`);
  }
});

test('the held product video has no served file and can never render', () => {
  const p = MEDIA.videos.product;
  assert.equal(p.status, 'held');
  assert.equal(p.src, null);
  assert.ok(p.heldBecause.length >= 2);
  assert.equal(V.renderable('product', PREVIEW), false);
  assert.equal(V.renderFeature('product', 'en', {}, PREVIEW), '');
  assert.ok(!readdirSync(new URL('public/media/', ROOT)).some((f) => f.includes('6edad127')), 'no product file is shipped');
  const conflicts = seg('product').filter((s) => s.conflict);
  assert.equal(conflicts.length, 2, 'both conflicting narration lines are recorded');
});

test('approval gate: nothing is approved yet, nothing renders in a normal or Production build', () => {
  for (const id of Object.keys(MEDIA.videos)) {
    assert.equal(MEDIA.videos[id].approvedBy, null, `${id}: approval is the founder's to record`);
    assert.equal(V.approved(id), false, id);
    assert.equal(V.renderable(id, {}), false, `${id}: normal build`);
    assert.equal(V.renderable(id, { CAI_VIDEO_PREVIEW: '1', VERCEL_ENV: 'production' }), false, `${id}: Production never previews`);
    assert.equal(V.renderFeature(id, 'en', {}, {}), '', id);
    assert.equal(V.jsonLd(id, 'en', 'https://www.colleagueai.ai/'), '', `${id}: no structured data before approval`);
  }
  for (const id of PUBLISHABLE) {
    assert.equal(V.renderable(id, PREVIEW), true, `${id}: review Preview`);
    assert.match(V.renderFeature(id, 'en', {}, PREVIEW), /pending approval and is not published/, `${id}: pending banner`);
  }
});

test('captions: all eight languages for every publishable video, every segment translated, files current', () => {
  for (const id of PUBLISHABLE) {
    assert.deepEqual(Object.keys(MEDIA.videos[id].captions).sort(), [...LOCALES].sort(), id);
    seg(id).forEach((s, i) => {
      for (const l of LOCALES) assert.ok(typeof s[l] === 'string' && s[l].trim(), `${id} segment ${i} ${l}`);
      assert.ok(s.t[1] > s.t[0], `${id} segment ${i} timing`);
      if (i) assert.ok(s.t[0] >= seg(id)[i - 1].t[1], `${id} segment ${i} does not overlap the previous one`);
      assert.ok(s.t[1] <= MEDIA.videos[id].durationSec + 0.01, `${id} segment ${i} within the video`);
    });
  }
  execFileSync(process.execPath, ['scripts/build-video-captions.cjs', '--check'], { cwd: new URL('.', ROOT).pathname, stdio: 'pipe' });
});

test('captions: valid WebVTT, ordered cues, at most two lines, readable line length', () => {
  for (const id of PUBLISHABLE) {
    for (const l of LOCALES) {
      const text = readFileSync(new URL(`public${MEDIA.videos[id].captions[l]}`, ROOT), 'utf8');
      assert.ok(text.startsWith('WEBVTT\n'), `${id}.${l}`);
      let last = -1;
      for (const c of V.cues(id, l)) {
        assert.ok(c.start >= last - 1e-6 && c.end > c.start, `${id}.${l} cue order at ${c.start}`);
        last = c.end;
        const lines = c.text.split('\n');
        assert.ok(lines.length <= 2 && lines.every((x) => x.length <= 56), `${id}.${l}: ${c.text}`);
      }
    }
    if (MEDIA.videos[id].burnedCaptions) {
      assert.match(V.vtt(id, 'de'), /line:6%/, `${id}: translated tracks stay clear of the burned-in English`);
      assert.doesNotMatch(V.vtt(id, 'en'), /line:/, `${id}: English is not repositioned`);
    }
  }
});

test('the copy keeps its safety lines and limits in every language', () => {
  const install = seg('install');
  assert.ok(install.some((s) => s.en === 'Do not publish the agent during installation.'), 'install: the burned caption, not the misheard speech');
  assert.ok(install.some((s) => /Daily recompute off during testing/.test(s.en)));
  const cert = seg('certification');
  assert.ok(cert.some((s) => s.en === 'Improve audit readiness.'), 'certification: the audio says Improve, not Prove');
  for (const l of LOCALES) {
    const d = (id) => META.videos[id].disclosure[l];
    const soon = { en: 'Coming soon', cs: 'Připravujeme', de: 'Demnächst', fr: 'Bientôt disponible', es: 'Próximamente', it: 'Prossimamente', pl: 'Wkrótce', pt: 'Em breve' }[l];
    assert.ok(d('certification').includes(soon), `certification disclosure ${l}: the site's own Coming soon label`);
    assert.match(d('install'), /60\D{1,6}90/, `install disclosure ${l}: 60-90 minutes`);
    assert.match(d('install'), /Daily recompute/, `install disclosure ${l}: turn Daily recompute on at go-live`);
    assert.match(d('install'), /INSTALL\.pdf/, l);
  }
  assert.match(META.videos.certification.disclosure.en, /not independent regulatory accreditation/);
  assert.match(META.videos.corporate.disclosure.en, /illustrative/i);
  assert.match(META.videos.corporate.disclosure.en, /coming soon/i);
});

test('no blocked certification vocabulary in captions, titles, descriptions or disclosures', () => {
  const blocked = /\b(accredited|independently certified|third-party certified|certified compliant|guarantee[sd]? compliance|ensures? compliance|ISO\/IEC 42001-certified|EU AI Act-certified|certification framework)\b/i;
  const strings = [];
  for (const id of Object.keys(MEDIA.videos)) for (const s of seg(id)) for (const l of LOCALES) if (s[l]) strings.push([`${id}/${l}`, s[l]]);
  for (const [id, m] of Object.entries(META.videos)) for (const f of Object.values(m)) for (const [l, s] of Object.entries(f)) strings.push([`${id}/${l}`, s]);
  for (const [where, s] of strings) assert.doesNotMatch(s, blocked, where);
});

test('the player downloads nothing before interaction and never autoplays', () => {
  for (const id of PUBLISHABLE) {
    for (const l of LOCALES) {
      const html = V.renderFeature(id, l, { cta: 'demo', ctaHref: '/demo' }, PREVIEW);
      const outside = withoutTemplates(html);
      assert.doesNotMatch(outside, /<(video|audio|iframe|track|source)\b/i, `${id}.${l}: media only inside the inert template`);
      assert.doesNotMatch(html, /\bautoplay\b/i, `${id}.${l}`);
      assert.match(html, /<img [^>]*loading="lazy"/, `${id}.${l}: lazy poster`);
      assert.match(html, /<button type="button" class="cai-video__facade" data-cai-video-play>[\s\S]*?<span class="cai-video__sr">[^<]+<\/span>/, `${id}.${l}: play control named by its own text`);
      assert.match(html, new RegExp(`<div class="cai-video__txbody" lang="${l}">`), `${id}.${l}: transcript in the page language`);
      const burned = MEDIA.videos[id].burnedCaptions;
      const expected = burned && l === 'en' ? 'off' : l;
      assert.match(html, new RegExp(`<option value="${expected}"[^>]*selected>`), `${id}.${l}: default subtitles ${expected}`);
      for (const p of html.matchAll(/\b(?:src|poster)="([^"]+)"/g)) assert.ok(p[1].startsWith('/media/'), `${id}.${l}: same-origin ${p[1]}`);
    }
  }
});

test('cards link to the player in the visitor language and skip videos that may not show', () => {
  const html = V.renderCards([{ id: 'corporate', href: '/cs' }, { id: 'product', href: '/agents/x' }], 'cs', PREVIEW);
  assert.match(html, /href="\/cs#video-corporate"/);
  assert.doesNotMatch(html, /video-product/);
  assert.equal(V.renderCards([{ id: 'product', href: '/x' }], 'en', PREVIEW), '');
});

test('structured data is complete once approved, and names only same-origin files', () => {
  const v = V.REG.certification;
  const saved = { approvedBy: v.approvedBy, approvedOn: v.approvedOn };
  try {
    v.approvedBy = 'test';
    v.approvedOn = '2026-12-01';
    const ld = V.jsonLd('certification', 'de', 'https://www.colleagueai.ai/de/zertifizierung');
    const data = JSON.parse(ld.slice(ld.indexOf('>') + 1, ld.lastIndexOf('</')));
    assert.equal(data['@type'], 'VideoObject');
    assert.equal(data.uploadDate, '2026-12-01');
    assert.equal(data.duration, 'PT1M0S');
    assert.equal(data.name, META.videos.certification.title.de);
    assert.ok(data.contentUrl.startsWith('https://www.colleagueai.ai/media/'));
    assert.ok(data.thumbnailUrl.every((u) => u.startsWith('https://www.colleagueai.ai/media/')));
    assert.equal(data.caption.length, 8);
    assert.ok(data.transcript.length > 200);
    assert.equal(V.renderable('certification', {}), true, 'an approved video renders in a normal build');
  } finally {
    Object.assign(v, saved);
  }
});

test('the client script keeps no state and reaches no third party', () => {
  const js = readFileSync(new URL('public/cai-video.js', ROOT), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(js, /localStorage|sessionStorage|document\.cookie|indexedDB|innerHTML|insertAdjacentHTML|fetch\(|XMLHttpRequest|sendBeacon|https?:\/\//);
  assert.match(js, /textContent/);
});

test('media is cached by content address; captions have their own type; the CSP needs no change', () => {
  const vercel = JSON.parse(readFileSync(new URL('vercel.json', ROOT), 'utf8'));
  const hdr = (src) => vercel.headers.find((h) => h.source === src);
  assert.match(hdr('/media/(.*)\\.mp4').headers.find((h) => h.key === 'Cache-Control').value, /immutable/);
  assert.equal(hdr('/media/(.*)\\.vtt').headers.find((h) => h.key === 'Content-Type').value, 'text/vtt; charset=utf-8');
  const csp = vercel.headers.flatMap((h) => h.headers).find((h) => h.key === 'Content-Security-Policy').value;
  assert.match(csp, /default-src 'self'/);
  assert.doesNotMatch(csp, /media-src/, 'same-origin media is already allowed by default-src');
});

const DIST = new URL('dist/', ROOT);
test('built pages: placements in every language, no inline style left, script only where a player is', { skip: !existsSync(new URL('index.html', DIST)) }, () => {
  const html = (p) => readFileSync(new URL(p, DIST), 'utf8');
  const preview = html('index.html').includes('data-cai-video="corporate"');
  for (const l of LOCALES) {
    const pre = l === 'en' ? '' : `${l}/`;
    for (const p of [`${pre}index.html`, `${pre}partners.html`, `${pre}certified.html`, `${pre}agents.html`, `${pre}pricing.html`, `${pre}trust.html`]) {
      const h = html(p);
      assert.doesNotMatch(h, /<style id="cai-video-css">/, `${p}: CSS externalized for the CSP`);
      assert.equal(h.includes('data-cai-video-play'), h.includes('id="cai-video-js"'), `${p}: script exactly where a player is`);
      assert.doesNotMatch(withoutTemplates(h), /<video\b/, `${p}: no video element before interaction`);
    }
    if (preview) {
      assert.match(html(`${pre}index.html`), /data-cai-video="corporate"/, `${l} home`);
      assert.match(html(`${pre}partners.html`), /data-cai-video="install"/, `${l} partners`);
      assert.match(html(`${pre}certified.html`), /data-cai-video="certification"/, `${l} certified`);
      assert.match(html(`${pre}agents.html`), /#video-corporate"/, `${l} catalogue card`);
    }
  }
});
