/* build-video-captions.cjs: write the WebVTT caption files named in config/media.json from scripts/i18n/videos/<id>.json.
 *
 * Output is deterministic and committed under public/media/, so the files are reviewable and served as plain static
 * assets; tests/videos.test.mjs fails when a committed file differs from what this script would write.
 * Usage: node scripts/build-video-captions.cjs [--check]
 */
const fs = require('fs');
const path = require('path');
const V = require('./lib/videos.cjs');

const ROOT = path.resolve(__dirname, '..');
const check = process.argv.includes('--check');
let written = 0;
const stale = [];
for (const [id, v] of Object.entries(V.REG)) {
  if (!v || !v.captions) continue;
  for (const [lang, url] of Object.entries(v.captions)) {
    const file = path.join(ROOT, 'public', url);
    const body = V.vtt(id, lang);
    let current = null;
    try { current = fs.readFileSync(file, 'utf8'); } catch { /* missing */ }
    if (current === body) continue;
    if (check) { stale.push(url); continue; }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, body);
    written += 1;
  }
}
if (check && stale.length) {
  console.error(`[video-captions] out of date: ${stale.join(', ')} (run node scripts/build-video-captions.cjs)`);
  process.exit(1);
}
console.log(`[video-captions] ${check ? 'up to date' : `${written} file(s) written`}`);
