/* generate-certified-pages.cjs — build /certified and its seven localized twins
 * from ONE content model, so no language can drift out of sync with another.
 *
 *   scripts/i18n/certified-content.json  → per-locale strings (key parity enforced here)
 *   config/pricing.json                  → the price table, same source as everywhere else
 *   i18n.routes.json                     → the localized slug for this page and its neighbours
 *
 * Writes dist/certified.html and dist/<loc>/certified.html. Every string a
 * visitor sees comes from the model, including the price-column units and the
 * footer link labels, because a page that is 95% translated is the defect this
 * generator exists to prevent.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const C = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/i18n/certified-content.json'), 'utf8'));
const PRICING = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/pricing.json'), 'utf8'));
const ROUTES = JSON.parse(fs.readFileSync(path.join(ROOT, 'i18n.routes.json'), 'utf8'));

const LOCALES = ['en', 'cs', 'de', 'fr', 'es', 'it', 'pl', 'pt'];
const BASE = 'https://www.colleagueai.ai';

// Key parity: a missing string would silently fall back to English on one page
// and nowhere else — exactly the mixed-language defect we are fixing.
for (const loc of LOCALES) {
  if (!C[loc]) throw new Error(`certified-content.json has no "${loc}"`);
  const missing = Object.keys(C.en).filter((k) => C[loc][k] === undefined);
  if (missing.length) throw new Error(`certified-content.json ${loc} missing: ${missing.join(', ')}`);
}

const usd = (cents) => '$' + (cents / 100).toLocaleString('en-US');
const href = (loc, page) => {
  const slug = ROUTES.slugs[page]?.[loc] || ROUTES.slugs[page]?.en || page;
  return loc === 'en' ? `/${slug}` : `/${loc}/${slug}`;
};

const STYLE = `
body{margin:0;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;background:#F5F0E8;color:#1D1B1A;line-height:1.65}
main{max-width:780px;margin:0 auto;padding:48px 24px 80px}
.crumb{font-size:13px;margin-bottom:28px}.crumb a{color:#C65D3A;text-decoration:none}
.eyebrow{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12.5px;color:#8a857d;letter-spacing:.05em;margin-bottom:10px}
h1{font-size:clamp(28px,5vw,42px);line-height:1.15;margin:0 0 14px}
h2{font-size:15px;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.04em;color:#8a857d;margin:38px 0 10px;text-transform:uppercase}
ul{margin:6px 0 0;padding-left:20px}li{margin-bottom:6px}
table{width:100%;border-collapse:collapse;margin-top:10px;font-size:14.5px}
th,td{text-align:left;padding:9px 10px;border-bottom:1px solid #d8d2c6}
th{color:#8a857d;font-weight:600;font-size:12.5px;text-transform:uppercase;letter-spacing:.04em}
.callout{background:#fff;border:1px solid #d8d2c6;border-radius:14px;padding:20px 22px;margin-top:14px}
.callout.warn{background:#FBF2EE;border-color:#E4C7BA}
.verify{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}
.verify input{flex:1 1 240px;padding:11px 14px;border:1px solid #d8d2c6;border-radius:10px;font-size:15px;font-family:ui-monospace,Consolas,monospace}
.btn{display:inline-block;padding:11px 24px;border-radius:999px;text-decoration:none;font-size:14.5px;border:0;cursor:pointer}
.btn-p{background:#1D1B1A;color:#F5F0E8}
.vis-hidden{position:absolute;left:-9999px}
.note{font-size:13.5px;color:#5c574f}
footer{font-size:12px;color:#8a857d;margin-top:56px;border-top:1px solid #d8d2c6;padding-top:18px}
footer a{color:#8a857d}
`.trim();

function page(loc) {
  const t = C[loc];
  const url = `${BASE}${href(loc, 'certified')}`;
  const rows = Object.entries(PRICING.tiers).map(([tier, v]) =>
    `<tr><td><b>${tier}</b></td><td>${usd(v.oneTimeCents)}</td>` +
    `<td>$${v.monthlyCents / 100} ${t.per_month}</td><td>${usd(v.annualCents)} ${t.per_year}</td></tr>`).join('');

  const alternates = LOCALES.map((l) =>
    `<link rel="alternate" hreflang="${l}" href="${BASE}${href(l, 'certified')}">`).join('\n');

  return `<!doctype html>
<html lang="${t.lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${t.title}</title>
<meta name="description" content="${t.desc}">
<meta name="robots" content="index, follow, max-snippet:-1">
<link rel="canonical" href="${url}">
${alternates}
<link rel="alternate" hreflang="x-default" href="${BASE}/certified">
<meta property="og:type" content="website">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${t.title}">
<meta property="og:description" content="${t.ogdesc}">
<meta property="og:image" content="${BASE}/og-image.png">
<meta property="og:locale" content="${t.lang}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<style>${STYLE}</style>
</head>
<body>
<main>
<nav class="crumb"><a href="${href(loc, 'agents')}">&larr; ${t.crumb_agents}</a> &nbsp;&middot;&nbsp; <a href="${loc === 'en' ? '/score' : '/' + loc + '/score'}">${t.crumb_score}</a> &nbsp;&middot;&nbsp; <a href="${href(loc, 'pricing')}">${t.crumb_pricing}</a></nav>
<div class="eyebrow">${t.eyebrow}</div>
<h1>${t.h1}</h1>
<p>${t.lede}</p>

<div class="callout warn">
  <p style="margin:0"><b>${t.not_label}</b> ${t.not_text}</p>
</div>

<h2>${t.inc_h}</h2>
<ul>${t.inc.map((i) => `<li>${i}</li>`).join('')}</ul>

<h2>${t.exc_h}</h2>
<ul>${t.exc.map((i) => `<li>${i}</li>`).join('')}</ul>
<p>${t.cond}</p>

<h2>${t.scope_h}</h2>
<p>${t.scope_intro}</p>
<p><b>${t.l1_lab}</b> ${t.l1}</p>
<ul>${t.inst.map((i) => `<li>${i}</li>`).join('')}</ul>
<p><b>${t.l2_lab}</b> ${t.l2}</p>
<p><b>${t.l3_lab}</b> ${t.l3}</p>
<p><b>${t.l4_lab}</b> ${t.l4}</p>
<p><b>${t.owe_lab}</b> ${t.owe}</p>
<p><b>${t.stop_lab}</b> ${t.stop}</p>
<p><b>${t.out_lab}</b> ${t.out}</p>

<h2>${t.unmod_h}</h2>
<p>${t.unmod}</p>

<h2>${t.end_h}</h2>
<p>${t.end}</p>

<h2>${t.price_h}</h2>
<table>
  <thead><tr>${t.th.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
  <tbody>${rows}</tbody>
</table>
<p class="note">${t.price_note}</p>

<h2>${t.verify_h}</h2>
<p>${t.verify_p}</p>
<form class="verify" action="/api/certificate" method="get">
  <label for="cert-id" class="vis-hidden">${t.verify_label}</label>
  <input id="cert-id" name="id" placeholder="CAI-L4-1A2B3C4D" pattern="[Cc][Aa][Ii]-[Ll][1-5]-[0-9A-Fa-f]{8}" required>
  <button class="btn btn-p" type="submit">${t.verify_btn}</button>
</form>

<footer>
  Colleague AI s.r.o., &Scaron;kolsk&aacute; 1736/12, 110 00 Praha &middot; I&Ccaron;O 29540852 &middot; DI&Ccaron; CZ29540852 &middot;
  <a href="${href(loc, 'terms')}">${t.f_terms}</a> &middot;
  <a href="${href(loc, 'license')}">${t.f_licence}</a> &middot;
  <a href="${href(loc, 'trust')}">${t.f_trust}</a>
</footer>
</main>
</body>
</html>
`;
}

let written = 0;
for (const loc of LOCALES) {
  const dir = loc === 'en' ? DIST : path.join(DIST, loc);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'certified.html'), page(loc), 'utf8');
  written += 1;
}
console.log(`[certified] ${written} pages written (${LOCALES.join(', ')})`);
