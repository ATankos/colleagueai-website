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
.cai-cert .crumb{font-size:13px;margin-bottom:28px}.cai-cert .crumb a{color:#C65D3A;text-decoration:none}
.cai-cert .eyebrow{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12.5px;color:#8a857d;letter-spacing:.05em;margin-bottom:10px}
.cai-cert h1{font-size:clamp(28px,5vw,42px);line-height:1.15;margin:0 0 14px}
.cai-cert h2{font-size:15px;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.04em;color:#8a857d;margin:38px 0 10px;text-transform:uppercase}
.cai-cert ul{margin:6px 0 0;padding-left:20px}.cai-cert li{margin-bottom:6px}
.cai-cert table{width:100%;border-collapse:collapse;margin-top:10px;font-size:14.5px}
.cai-cert th,.cai-cert td{text-align:left;padding:9px 10px;border-bottom:1px solid #d8d2c6}
.cai-cert th{color:#8a857d;font-weight:600;font-size:12.5px;text-transform:uppercase;letter-spacing:.04em}
.cai-cert .callout{background:#fff;border:1px solid #d8d2c6;border-radius:14px;padding:20px 22px;margin-top:14px}
.cai-cert .callout.warn{background:#FBF2EE;border-color:#E4C7BA}
.cai-cert .verify{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}
.cai-cert .verify input{flex:1 1 240px;padding:11px 14px;border:1px solid #d8d2c6;border-radius:10px;font-size:15px;font-family:ui-monospace,Consolas,monospace}
.cai-cert .vis-hidden{position:absolute;left:-9999px}
.cai-cert .note{font-size:13.5px;color:#5c574f}
.cai-cert .cert-legal{font-size:12px;color:#8a857d;margin-top:56px;border-top:1px solid #d8d2c6;padding-top:18px}
.cai-cert .cert-legal a{color:#8a857d}
`.trim();

/* The page takes the site's shell and owns only what goes inside <main>.
 *
 * It used to be a document of its own: its own <head>, its own stylesheet, and
 * no <header> at all — which is why it had no fixed menu bar and read as a
 * different product from every page linking to it. A page cannot be asked to
 * match the site and then be handed its own design.
 *
 * trust.html is the donor. It exists in every locale, it is a plain content
 * page, and the same pipeline builds it — so this page cannot drift from the
 * site's chrome unless trust.html drifts too, which nobody would miss.
 */
const shellFor = (loc) => fs.readFileSync(
  loc === 'en' ? path.join(DIST, 'trust.html') : path.join(DIST, loc, 'trust.html'), 'utf8');

/** replace the inner content of the first <tag>…</tag> */
function replaceInner(html, tag, inner) {
  const open = html.indexOf(`<${tag}`);
  const gt = open === -1 ? -1 : html.indexOf('>', open);
  const close = gt === -1 ? -1 : html.indexOf(`</${tag}`, gt);
  if (close === -1) throw new Error(`the shell has no usable <${tag}> element`);
  return html.slice(0, gt + 1) + inner + html.slice(close);
}

/** point an existing meta at a new value; one the shell does not carry is skipped */
function setMeta(html, attr, key, value) {
  const needle = `<meta ${attr}="${key}"`;
  const at = html.indexOf(needle);
  if (at === -1) return html;
  const end = html.indexOf('>', at);
  return `${html.slice(0, at)}<meta ${attr}="${key}" content="${value}">${html.slice(end + 1)}`;
}

/** the donor's structured data describes the trust page, not this one */
function dropLdJson(html) {
  const at = html.indexOf('<script type="application/ld+json">');
  if (at === -1) return html;
  const end = html.indexOf('</script>', at);
  return html.slice(0, at) + html.slice(end + '</script>'.length);
}

/** swap the donor's contiguous hreflang + canonical block for this page's */
function setLocaleLinks(html, block) {
  const start = html.indexOf('<link rel="alternate" hreflang=');
  const canon = start === -1 ? -1 : html.indexOf('<link rel="canonical"', start);
  const end = canon === -1 ? -1 : html.indexOf('>', canon);
  if (end === -1) throw new Error('the shell has no hreflang/canonical block to replace');
  return html.slice(0, start) + block + html.slice(end + 1);
}

/* The built pages leave <main> unclosed and carry no <footer>: the content is a
   run of <section>s that the browser closes at </body>. So the graft is
   positional — from the <main> tag to the scripts that sit just before
   </body> — and it emits the closing tag the donor never had. */
function trailingScripts(html, bodyEnd) {
  let start = bodyEnd;
  for (;;) {
    let i = start;
    while (i > 0 && ' \t\r\n'.includes(html[i - 1])) i -= 1;
    if (!html.slice(0, i).endsWith('</script>')) break;
    const open = html.lastIndexOf('<script', i);
    if (open === -1) break;
    start = open;
  }
  return html.slice(start, bodyEnd);
}

function graftBody(html, content) {
  /* Everything after </header> is replaced, not just <main>.
     The donor puts a page guide — "Průvodce stránkou Trust", with anchors into
     trust's own sections — BETWEEN </header> and <main>. Grafting from <main>
     left that on the certification page, in every language. The header is the
     part being borrowed; the body is not. */
  const headerEnd = html.indexOf('</header>');
  const bodyEnd = html.indexOf('</body>');
  if (headerEnd === -1 || bodyEnd === -1) throw new Error('the shell has no </header> or no </body>');
  const start = headerEnd + '</header>'.length;
  const tail = trailingScripts(html, bodyEnd);
  return `${html.slice(0, start)}\n<main>\n${content}\n</main>\n${tail}${html.slice(bodyEnd)}`;
}

const attrSafe = (value, key) => {
  if (value.includes('"')) throw new Error(`certified-content ${key} contains a quote and cannot go in a meta tag`);
  return value;
};

function page(loc) {
  const t = C[loc];
  const url = `${BASE}${href(loc, 'certified')}`;
  const rows = Object.entries(PRICING.tiers).map(([tier, v]) =>
    `<tr><td><b>${tier}</b></td><td>${usd(v.oneTimeCents)}</td>` +
    `<td>$${v.monthlyCents / 100} ${t.per_month}</td><td>${usd(v.annualCents)} ${t.per_year}</td></tr>`).join('');

  const content = `<div class="cai-cert">
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

<div class="cert-legal">
  Colleague AI s.r.o., &Scaron;kolsk&aacute; 1736/12, 110 00 Praha &middot; I&Ccaron;O 29540852 &middot; DI&Ccaron; CZ29540852 &middot;
  <a href="${href(loc, 'terms')}">${t.f_terms}</a> &middot;
  <a href="${href(loc, 'license')}">${t.f_licence}</a> &middot;
  <a href="${href(loc, 'trust')}">${t.f_trust}</a>
</div>
</div>`;

  const localeLinks = [
    ...LOCALES.filter((l) => l !== 'en').map((l) =>
      `<link rel="alternate" hreflang="${l}" href="${BASE}${href(l, 'certified')}" />`),
    `<link rel="alternate" hreflang="en" href="${BASE}/certified" />`,
    `<link rel="alternate" hreflang="x-default" href="${BASE}/certified" />`,
    `<link rel="canonical" href="${url}" />`,
  ].join('\n');

  let out = shellFor(loc);
  out = out.split('data-cai-page="trust"').join('data-cai-page="certified"');
  out = replaceInner(out, 'title', t.title);
  out = setMeta(out, 'name', 'description', attrSafe(t.desc, `${loc}.desc`));
  out = setMeta(out, 'property', 'og:url', url);
  out = setMeta(out, 'property', 'og:title', attrSafe(t.title, `${loc}.title`));
  out = setMeta(out, 'property', 'og:description', attrSafe(t.ogdesc, `${loc}.ogdesc`));
  out = setMeta(out, 'name', 'twitter:title', attrSafe(t.title, `${loc}.title`));
  out = setMeta(out, 'name', 'twitter:description', attrSafe(t.ogdesc, `${loc}.ogdesc`));
  out = setMeta(out, 'property', 'og:image:alt', attrSafe(t.title, `${loc}.title`));
  out = dropLdJson(out);
  out = setLocaleLinks(out, localeLinks);
  out = graftBody(out, content);
  const headEnd = out.indexOf('</head>');
  return `${out.slice(0, headEnd)}<style id="cai-certified-css">${STYLE}</style>\n${out.slice(headEnd)}`;
}

let written = 0;
for (const loc of LOCALES) {
  const dir = loc === 'en' ? DIST : path.join(DIST, loc);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'certified.html'), page(loc), 'utf8');
  written += 1;
}
console.log(`[certified] ${written} pages written from the site shell (${LOCALES.join(', ')})`);
