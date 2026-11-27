/* Site video: integrity, approval gate, captions in eight languages, honest copy, no download before interaction,
 * structured data only for approved videos, privacy (no storage, no third parties), caching.
 * Sources: config/media.json, scripts/lib/videos.cjs, scripts/i18n/videos/*.json, public/cai-video.js. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, mkdtempSync, copyFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
    const file = new URL(`media/${v.src.slice(7)}`, ROOT);
    const buf = readFileSync(file);
    const sha = createHash('sha256').update(buf).digest('hex');
    assert.equal(sha, v.master.sha256, `${id}: sha256 of ${v.src}`);
    assert.equal(buf.length, v.master.bytes, `${id}: size`);
    assert.ok(v.src.includes(`.${sha.slice(0, 8)}.mp4`), `${id}: file name carries the checksum`);
    assert.equal(buf.subarray(4, 8).toString(), 'ftyp', `${id}: MP4`);
    assert.ok(buf.indexOf('moov') < buf.indexOf('mdat'), `${id}: fast start (moov before mdat) for progressive playback`);
    for (const p of [v.poster, v.posterSmall]) assert.ok(existsSync(new URL(`media/${p.slice(7)}`, ROOT)), `${id}: ${p}`);
    assert.ok(!existsSync(new URL(`public${v.src}`, ROOT)), `${id}: never under public/ (would be served without approval)`);
  }
});

test('the held product video has no served file and can never render', () => {
  const p = MEDIA.videos.product;
  assert.equal(p.status, 'held');
  assert.equal(p.src, null);
  assert.ok(p.heldBecause.length >= 2);
  assert.equal(V.renderable('product', PREVIEW), false);
  assert.equal(V.renderFeature('product', 'en', {}, PREVIEW), '');
  assert.ok(!readdirSync(new URL('media/', ROOT)).some((f) => f.includes('6edad127')), 'no product file is shipped');
  assert.ok(!existsSync(new URL('public/media/', ROOT)), 'no media directory under public/');
  const conflicts = seg('product').filter((s) => s.conflict);
  assert.equal(conflicts.length, 2, 'both conflicting narration lines are recorded');
});

test('approval gate: nothing is approved yet; a normal or Production build renders and publishes nothing', () => {
  for (const id of Object.keys(MEDIA.videos)) {
    const v = MEDIA.videos[id];
    assert.equal(v.approvedBy, null, `${id}: approval is the founder's to record`);
    assert.equal(v.approvedSha256, null, id);
    assert.equal(v.publishedOn, null, id);
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

test('asset gate: a Production build publishes no video, poster or caption file; a review Preview only the pending ones', () => {
  assert.deepEqual(V.filesToPublish({}), [], 'normal build');
  assert.deepEqual(V.filesToPublish({ CAI_VIDEO_PREVIEW: '1', VERCEL_ENV: 'production' }), [], 'Production');
  const preview = V.filesToPublish(PREVIEW);
  for (const id of PUBLISHABLE) {
    const v = MEDIA.videos[id];
    for (const u of [v.src, v.poster, v.posterSmall, ...Object.values(v.captions)]) assert.ok(preview.includes(u), `${id}: ${u}`);
  }
  assert.equal(preview.length, 3 * (3 + 8), 'three videos: video, two posters, eight caption files each');
  const script = readFileSync(new URL('scripts/publish-media.cjs', ROOT), 'utf8');
  assert.match(script, /fs\.rmSync\(DIST_MEDIA/, 'dist/media is cleared before copying');
  const pkg = JSON.parse(readFileSync(new URL('package.json', ROOT), 'utf8'));
  assert.ok(pkg.scripts.postbuild.includes('publish-media.cjs && node scripts/inject-videos.cjs'), 'runs before the placements');
});

test('approval is bound to the exact file: a replaced master loses its approval and fails the build', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cai-media-'));
  const v = V.REG.corporate;
  const saved = { approvedBy: v.approvedBy, approvedOn: v.approvedOn, approvedSha256: v.approvedSha256, publishedOn: v.publishedOn };
  try {
    for (const f of readdirSync(new URL('media/', ROOT))) copyFileSync(new URL(`media/${f}`, ROOT), join(dir, f));
    Object.assign(v, { approvedBy: 'test', approvedOn: '2026-12-01', approvedSha256: v.master.sha256, publishedOn: '2026-12-02' });
    const env = { CAI_BUILD_DATE: '2026-12-03' };
    V.clearShaCache();
    assert.equal(V.approved('corporate', env, dir), true, 'intact file, recorded approval');
    assert.equal(V.approved('corporate', { CAI_BUILD_DATE: '2026-12-01' }, dir), false, 'not before its publication date');
    assert.equal(V.approved('corporate', env), true);
    const buf = readFileSync(join(dir, v.src.slice(7)));
    buf[buf.length - 1] ^= 0xff;
    writeFileSync(join(dir, v.src.slice(7)), buf);
    V.clearShaCache();
    assert.equal(V.approved('corporate', env, dir), false, 'one byte changed: approval lapses');
    assert.equal(V.renderable('corporate', { ...env, ...PREVIEW }, dir), false, 'and it is not even previewable');
    assert.deepEqual(V.approvalMismatches(dir), ['corporate'], 'publish-media.cjs fails the build on this');
    assert.deepEqual(V.filesToPublish(env, dir), [], 'nothing of it is published');
    Object.assign(v, { approvedSha256: '0'.repeat(64) });
    V.clearShaCache();
    assert.equal(V.approved('corporate', env), false, 'an approval naming another checksum does not apply');
  } finally {
    Object.assign(v, saved);
    V.clearShaCache();
    rmSync(dir, { recursive: true, force: true });
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
      const text = readFileSync(new URL(`media/${MEDIA.videos[id].captions[l].slice(7)}`, ROOT), 'utf8');
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

test('reading speed: translated cues at most 20 characters per second; English stays with the narration (at most 23)', () => {
  for (const id of PUBLISHABLE) {
    for (const l of LOCALES) {
      for (const c of V.cues(id, l)) {
        const cps = c.text.replace(/\n/g, ' ').length / (c.end - c.start);
        assert.ok(cps <= (l === 'en' ? 23 : V.MAX_CPS) + 1e-9, `${id}.${l} ${cps.toFixed(1)} cps at ${c.start.toFixed(1)} s: ${c.text}`);
      }
    }
  }
});

test('installation safety instructions survive condensing, in every language', () => {
  const s = seg('install');
  const at = (re) => s.findIndex((x) => re.test(x.en));
  const checks = [
    [at(/^Do not publish the agent/), { en: /Do not publish/, cs: /nepublikujte/, de: /nicht\.$/, fr: /Ne publiez pas/, es: /No publique/, it: /Non pubblicate/, pl: /Nie publikuj/, pt: /Não publique/ }],
    [at(/status is Available, block it/), { en: /block it/, cs: /Available.*zablokujte/, de: /Available.*blockieren/, fr: /Available.*bloquez/, es: /Available.*bloquéelo/, it: /Available.*bloccatelo/, pl: /Available.*zablokuj/, pt: /Available.*bloqueie/ }],
    [at(/^Leave it Draft or Blocked/), { all: /Draft .* Blocked/ }],
    [at(/^Keep Daily recompute off/), { en: /off/, cs: /Daily recompute vypnutý/, de: /Daily recompute aus/, fr: /Daily recompute désactivé/, es: /Daily recompute apagado/, it: /Daily recompute spento/, pl: /wyłącz Daily recompute/, pt: /Daily recompute desligado/ }],
    [at(/^Budget alerts do not stop spending/), { en: /do not stop/, cs: /nezastaví/, de: /stoppen keine/, fr: /n'arrêtent pas/, es: /no detienen/, it: /non bloccano/, pl: /nie zatrzymują/, pt: /não param/ }],
    [at(/section 9a of INSTALL\.pdf/), { all: /9a.*INSTALL\.pdf|INSTALL\.pdf.*9a/ }],
    [at(/verify its checksum/), { en: /checksum/, cs: /kontrolní součet/, de: /Prüfsumme/, fr: /somme de contrôle/, es: /suma de verificación/, it: /checksum/, pl: /sumę kontrolną/, pt: /soma de verificação/ }],
    [at(/same System Administrator account for all four references/), { all: /System Administrator/ }],
  ];
  for (const [i, want] of checks) {
    assert.ok(i >= 0, 'safety line present in the English narration');
    for (const l of LOCALES) assert.match(s[i][l], want[l] || want.all, `install segment ${i} ${l}: ${s[i][l]}`);
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

test('structured data: only Google-documented VideoObject properties, uploadDate = the publication moment', () => {
  const v = V.REG.certification;
  const saved = { approvedBy: v.approvedBy, approvedOn: v.approvedOn, approvedSha256: v.approvedSha256, publishedOn: v.publishedOn };
  try {
    Object.assign(v, { approvedBy: 'test', approvedOn: '2026-12-01', approvedSha256: v.master.sha256, publishedOn: '2026-12-02T10:00:00+01:00' });
    V.clearShaCache();
    const ld = V.jsonLd('certification', 'de', 'https://www.colleagueai.ai/de/zertifizierung', { CAI_BUILD_DATE: '2026-12-02' });
    const data = JSON.parse(ld.slice(ld.indexOf('>') + 1, ld.lastIndexOf('</')));
    assert.equal(data['@type'], 'VideoObject');
    for (const k of Object.keys(data)) if (!k.startsWith('@')) assert.ok(V.GOOGLE_VIDEO_PROPERTIES.includes(k), `${k} is a documented property`);
    for (const k of ['name', 'thumbnailUrl', 'uploadDate']) assert.ok(data[k], `required ${k}`);
    assert.equal(data.uploadDate, '2026-12-02T10:00:00+01:00', 'the actual publication moment, with its time zone');
    assert.equal(data.duration, 'PT1M0S');
    assert.equal(data.name, META.videos.certification.title.de);
    assert.ok(data.contentUrl.startsWith('https://www.colleagueai.ai/media/'));
    assert.ok(data.thumbnailUrl.every((u) => u.startsWith('https://www.colleagueai.ai/media/') && u.endsWith('.jpg')));
    assert.equal(V.jsonLd('certification', 'de', 'x', { CAI_BUILD_DATE: '2026-12-01' }), '', 'nothing before the publication date');
  } finally {
    Object.assign(v, saved);
    V.clearShaCache();
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
