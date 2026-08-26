/* localize-internal-links.cjs — a localized page links localized destinations.
 *
 * The menu on /pl/zaufanie said "Cennik" and pointed at /pricing: a Polish
 * label landing a Polish reader on the English page. The same held for Score,
 * Catalogue, Trust, Partners, Demo and Certification, in every language, in the
 * menu and in the body CTAs — 1,169 links in all. Nothing redirected them: the
 * URL-locale controller treats the path as the single source of truth and never
 * redirects, so the reader simply arrived in English.
 *
 * Every destination already exists and is already routed. So this step rewrites
 * the links and nothing else: on a page under dist/<loc>/, an anchor pointing at
 * an English route becomes that locale's own route.
 *
 * Deliberately NO regular expressions over markup — the same reason as
 * inject-certified-nav.cjs. Index scanning is linear and has no end-tag or
 * attribute blind spots.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const ROUTES = JSON.parse(fs.readFileSync(path.join(ROOT, 'i18n.routes.json'), 'utf8'));
const LOCALES = ['cs', 'de', 'fr', 'es', 'it', 'pl', 'pt'];

/* The English routes that have a localized twin. Pages carrying a slug map get
   the translated slug; the rest keep the English word under the locale prefix,
   which is how they are already built and routed (/pl/score, /pl/demo). */
const PAGES = ['agents', 'pricing', 'trust', 'partners', 'certified', 'score', 'demo', 'contact'];

const target = (loc, page) => {
  const slug = ROUTES.slugs[page]?.[loc] || page;
  return `/${loc}/${slug}`;
};

/** The opening tag of the <a> whose attributes contain `pos`, or null.
 *  Returns null for an href in a <link rel="canonical">, a <script> string, or
 *  anywhere else that is not an anchor — none of which this step may touch. */
function anchorTagAt(html, pos) {
  let open = html.lastIndexOf('<a', pos);
  while (open !== -1) {
    const after = html[open + 2];
    if (after === ' ' || after === '\t' || after === '\n' || after === '>') break;
    open = html.lastIndexOf('<a', open - 1);
  }
  if (open === -1) return null;
  const gt = html.indexOf('>', open);
  if (gt === -1 || pos > gt) return null;
  return html.slice(open, gt);
}

const ORIGINS = ['https://www.colleagueai.ai', 'https://colleagueai.ai',
  'http://www.colleagueai.ai', 'http://colleagueai.ai'];

/** every written form of a link to `page`, paired with its localized replacement */
function variants(page, dest) {
  const out = [];
  for (const tail of ['', '/']) {
    out.push({ needle: `href="/${page}${tail}"`, replacement: `href="${dest}"` });
    for (const origin of ORIGINS) {
      out.push({ needle: `href="${origin}/${page}${tail}"`, replacement: `href="${origin}${dest}"` });
    }
  }
  return out;
}

function rewrite(html, loc) {
  let out = html;
  let changed = 0;
  for (const page of PAGES) {
    const dest = target(loc, page);
    /* A link from a page to itself is left alone in shape but not in language.
       On /cs/score the nav item and the tab both carry aria-current="page" and
       pointed at /score — so the marker for "you are here" sent a Czech reader
       to the English page. Rewriting makes it point at /cs/score: still a
       self-reference, which is what aria-current items are, but now the right
       one. (Nothing new is introduced: an anchor that was not already a
       self-reference cannot become one, because only the locale prefix and the
       slug change.) */
    /* Both shapes, because both are in the markup. The first pass only matched
       root-relative hrefs and missed 172 absolute ones — 144 of them the "Book
       a demo" button, the most-clicked link on the site, which sent every
       localized visitor to the English form. An absolute link is rewritten
       absolute so a CTA meant to survive being copied still does. */
    for (const { needle, replacement } of variants(page, dest)) {
      let from = 0;
      for (;;) {
        const at = out.indexOf(needle, from);
        if (at === -1) break;
        const tag = anchorTagAt(out, at + 'href="'.length);
        // an anchor that names its own hreflang points at another language on purpose
        if (tag === null || tag.includes('hreflang')) {
          from = at + needle.length;
          continue;
        }
        out = out.slice(0, at) + replacement + out.slice(at + needle.length);
        changed += 1;
        from = at + replacement.length;
      }
    }
  }
  return { out, changed };
}

let files = 0;
let links = 0;
const walk = (dir, loc) => {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) { walk(p, loc); continue; }
    if (!entry.name.endsWith('.html')) continue;
    const html = fs.readFileSync(p, 'utf8');
    const { out, changed } = rewrite(html, loc);
    if (changed) { fs.writeFileSync(p, out, 'utf8'); files += 1; links += changed; }
  }
};
for (const loc of LOCALES) walk(path.join(DIST, loc), loc);
console.log(`[localize-links] ${links} link(s) repointed across ${files} localized page(s)`);
