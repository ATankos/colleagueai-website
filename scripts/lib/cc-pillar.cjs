/* cc-pillar.cjs: the ONE renderer for the Continuous Certification commercial block.
 *
 * Used by generate-certified-pages.cjs (the dedicated page) and inject-cc-pillar.cjs (home, pricing, catalogue,
 * factsheets, Trust Center, CAI Score, partners), so the message, the benefits and their status labels cannot drift
 * between pages or languages. Every string comes from scripts/i18n/certified-content.json.
 *
 * Honesty rules built in:
 *   - every benefit carries exactly one status: built (in the platform and tested), sub (subscription benefit once
 *     subscriptions open) or plan (in preparation, not a commitment). STATUS below is the single place they are set;
 *     tests/cc-positioning.test.mjs pins it.
 *   - the "not yet open" line is always shown: all subscriptions are Coming soon.
 *   - the video slot renders only for an approved asset in config/media.json; otherwise nothing is emitted.
 *   - every visible leaf carries data-i18n-cai="cert_<key>", which marks it as the programme's own approved copy for
 *     the vocabulary guard (tests/journey.test.mjs). That attribute is inert at runtime.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const C = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/i18n/certified-content.json'), 'utf8'));
const MEDIA = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'config/media.json'), 'utf8')); } catch { return {}; } })();

const BENEFITS = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8', 'b9', 'b10'];
const STATUS = Object.freeze({ b1: 'sub', b2: 'built', b3: 'plan', b4: 'built', b5: 'sub', b6: 'plan', b7: 'built', b8: 'sub', b9: 'built', b10: 'built' });
const ROWS = ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7'];
const STATUS_KEY = { built: 'st_built', sub: 'st_sub', plan: 'st_plan' };

const leaf = (tag, key, text, cls = '') => `<${tag}${cls ? ` class="${cls}"` : ''} data-i18n-cai="cert_${key}">${text}</${tag}>`;

/** An approved video asset, or null. Approval and a same-origin file are required; no third-party embed. */
function approvedVideo() {
  const v = MEDIA.ccVideo;
  if (!v || typeof v !== 'object') return null;
  const local = (p) => typeof p === 'string' && /^\/media\/[a-z0-9._-]+$/i.test(p);
  if (!local(v.src) || !v.approvedBy || !v.approvedOn) return null;
  return v;
}

function videoSlot(t, loc) {
  const v = approvedVideo();
  if (!v) return '';
  const track = v.captions && typeof v.captions[loc] === 'string' && /^\/media\/[a-z0-9._-]+\.vtt$/i.test(v.captions[loc])
    ? `<track kind="captions" src="${v.captions[loc]}" srclang="${loc}" default>` : '';
  const poster = typeof v.poster === 'string' && /^\/media\/[a-z0-9._-]+$/i.test(v.poster) ? ` poster="${v.poster}"` : '';
  return `<figure class="cc-video">${leaf('figcaption', 'video_h', t.video_h)}<video controls preload="none"${poster} src="${v.src}">${track}</video></figure>`;
}

const CSS = `
.cc-pillar{margin:48px auto;max-width:1080px;padding:28px 24px;border:1px solid #d8d2c6;border-radius:18px;background:#fff;color:#1d1b1a}
.cc-pillar .cc-msg{font-size:clamp(22px,3.4vw,32px);line-height:1.2;margin:0 0 10px;font-weight:700}
.cc-pillar .cc-msg span{display:block}.cc-pillar .cc-msg span+span{color:#C65D3A}
.cc-pillar .cc-sub{max-width:68ch;margin:0 0 12px;line-height:1.6}
.cc-pillar .cc-soon{display:inline-block;font-size:13px;background:#FBF2EE;border:1px solid #E4C7BA;border-radius:100px;padding:4px 12px;margin:0 0 18px}
.cc-pillar h3{font-size:14px;letter-spacing:.04em;text-transform:uppercase;color:#8a857d;margin:24px 0 10px}
.cc-pillar .cc-grid{list-style:none;padding:0;margin:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:12px}
.cc-pillar .cc-grid li{border:1px solid #e7e0d5;border-radius:12px;padding:14px 16px;min-width:0}
.cc-pillar .cc-grid b{display:block;margin-bottom:4px}
.cc-pillar .cc-grid p{margin:6px 0 0;font-size:14px;line-height:1.5}
.cc-pillar .cc-chips{list-style:none;padding:0;margin:0;display:flex;flex-wrap:wrap;gap:8px}
.cc-pillar .cc-chips li{border:1px solid #e7e0d5;border-radius:100px;padding:5px 12px;font-size:13.5px}
.cc-pillar .cc-st{display:inline-block;font-size:11.5px;font-weight:700;border-radius:100px;padding:2px 9px}
.cc-pillar .cc-st-built{background:#E8F3EC;color:#1E6B3E}.cc-pillar .cc-st-sub{background:#EAF0FA;color:#23466F}.cc-pillar .cc-st-plan{background:#F3F1EC;color:#5c574f}
.cc-pillar .cc-legend{font-size:12.5px;color:#5c574f;margin-top:10px}
.cc-pillar .cc-cmp{overflow-x:auto}.cc-pillar table{width:100%;border-collapse:collapse;font-size:14.5px}
.cc-pillar th,.cc-pillar td{text-align:left;padding:9px 10px;border-bottom:1px solid #e7e0d5;vertical-align:top}
.cc-pillar .cc-cta{display:inline-block;margin-top:18px;color:#C65D3A;font-weight:600}
.cc-pillar .cc-video{margin:0 0 18px}.cc-pillar .cc-video video{width:100%;max-width:100%;border-radius:12px;aspect-ratio:16/9;background:#1d1b1a}
.cc-pillar .cc-video figcaption{font-weight:600;margin-bottom:8px}
`.trim();

/**
 * variant: 'full' (message, benefits with status, comparison, link) or 'compact' (message, benefit titles, link).
 * withVideo: put the video slot at the top (home and the dedicated page).
 * link: the localized URL of the dedicated page; omitted on the dedicated page itself.
 */
function render(loc, { variant = 'compact', withVideo = false, link = null } = {}) {
  const t = C[loc] || C.en;
  const parts = [`<section class="cc-pillar" data-cc-pillar="${variant}" aria-labelledby="cc-msg-${variant}">`];
  if (withVideo) parts.push(videoSlot(t, loc));
  parts.push(`<h2 class="cc-msg" id="cc-msg-${variant}">${leaf('span', 'msg', t.msg)} ${leaf('span', 'msg2', t.msg2)}</h2>`);
  parts.push(leaf('p', 'msg_sub', t.msg_sub, 'cc-sub'));
  parts.push(leaf('p', 'soon', t.soon, 'cc-soon'));
  if (variant === 'full') {
    parts.push(leaf('h3', 'b_h', t.b_h));
    parts.push('<ul class="cc-grid">' + BENEFITS.map((b) => {
      const st = STATUS[b];
      return `<li data-cc-status="${st}">${leaf('b', `${b}_t`, t[`${b}_t`])}${leaf('span', STATUS_KEY[st], t[STATUS_KEY[st]], `cc-st cc-st-${st}`)}${leaf('p', b, t[b])}</li>`;
    }).join('') + '</ul>');
    parts.push(leaf('p', 'st_legend', t.st_legend, 'cc-legend'));
    parts.push(leaf('h3', 'cmp_h', t.cmp_h));
    parts.push('<div class="cc-cmp"><table><thead><tr><th></th>' + leaf('th', 'cmp_c1', t.cmp_c1) + leaf('th', 'cmp_c2', t.cmp_c2) + '</tr></thead><tbody>' +
      ROWS.map((r) => `<tr>${leaf('td', r, t[r])}${leaf('td', `${r}a`, t[`${r}a`])}${leaf('td', `${r}b`, t[`${r}b`])}</tr>`).join('') + '</tbody></table></div>');
  } else {
    parts.push('<ul class="cc-chips">' + BENEFITS.map((b) => `<li data-cc-status="${STATUS[b]}">${leaf('span', `${b}_t`, t[`${b}_t`])}</li>`).join('') + '</ul>');
  }
  if (link) parts.push(`<a class="cc-cta" href="${link}">${leaf('span', 'cta', t.cta)} &rarr;</a>`);
  parts.push('</section>');
  return parts.join('\n');
}

module.exports = { render, CSS, STATUS, BENEFITS, ROWS, approvedVideo };
