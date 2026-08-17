/* generate-secondary-pages.mjs — Phase 2 page split.
 *
 * Builds the localized variants of the real /score and /usage pages from their
 * English masters (public/score.html, public/usage.html), reusing the
 * translation sources that already live in the repo:
 *   - the I18N dictionary inside public/agents.html   (data-i18n prerender)
 *   - the SRC/TR reader translations inside public/agents.html
 *     (tenant-architecture + cai-score-guide sections, applied at build time)
 *   - scripts/i18n/ga-locales.json                    (readiness quiz content)
 *
 * Per-page payload slicing happens here, not at runtime: each output carries
 * only the I18N slice ({en} for English, {en,<loc>} for a locale) plus its own
 * GA quiz content, injected into the <script id="cai-page-i18n"> /
 * <script id="cai-page-ga"> markers. Replacement is by marker id, so the step
 * is idempotent — public/ masters stay valid sources on every rebuild.
 *
 * public/ is the source of truth; dist/ is build output (see
 * generate-locale-pages.mjs for why both are written).
 */
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

const SITE = 'https://www.colleagueai.ai'
const DIST = path.resolve('dist')
const PUBLIC = path.resolve('public')
const LOCALES = ['cs', 'de', 'fr', 'es', 'it', 'pl', 'pt']
const OG = { cs: 'cs_CZ', de: 'de_DE', fr: 'fr_FR', es: 'es_ES', it: 'it_IT', pl: 'pl_PL', pt: 'pt_PT' }

function findMatchingBrace(source, startIndex) {
  let depth = 0, quote = '', escaped = false
  for (let i = startIndex; i < source.length; i += 1) {
    const ch = source[i]
    if (quote) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === quote) quote = ''
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue }
    if (ch === '{') depth += 1
    if (ch === '}') { depth -= 1; if (depth === 0) return i }
  }
  return -1
}

function extractObject(html, marker) {
  const start = html.indexOf(marker)
  if (start < 0) return null
  const braceStart = html.indexOf('{', start)
  const braceEnd = findMatchingBrace(html, braceStart)
  if (braceEnd < 0) return null
  try {
    return vm.runInNewContext('(' + html.slice(braceStart, braceEnd + 1) + ')')
  } catch (error) {
    console.warn('[secondary-pages] could not parse ' + marker + ':', error.message)
    return null
  }
}

function escapeHtml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function prerenderDataI18n(html, dict) {
  if (!dict) return html
  html = html.replace(/(<([a-z0-9-]+)(?=[^>]*\sdata-i18n=["']([^"']+)["'])[^>]*>)([\s\S]*?)(<\/\2>)/gi, (match, open, tag, key, body, close) => {
    if (!Object.prototype.hasOwnProperty.call(dict, key)) return match
    const value = dict[key]
    if (typeof value !== 'string') return match
    if (/[<>]/.test(body.trim())) return match
    return open + escapeHtml(value) + close
  })
  html = html.replace(/(<([a-z0-9-]+)(?=[^>]*\sdata-i18n-html=["']([^"']+)["'])[^>]*>)([\s\S]*?)(<\/\2>)/gi, (match, open, tag, key, body, close) => {
    if (!Object.prototype.hasOwnProperty.call(dict, key)) return match
    const value = dict[key]
    if (typeof value !== 'string') return match
    if (/<\/?(section|div|script|style)\b/i.test(body)) return match
    return open + value + close
  })
  return html
}

/* Build-time equivalent of the runtime CAI-I18N-X reader translations:
 * replace SRC strings with TR[locale] strings, scoped to the given section ids. */
function applyReaderTranslations(html, ids, SRC, TRloc) {
  if (!SRC || !TRloc) return html
  const keys = Object.keys(SRC).sort((a, b) => SRC[b].length - SRC[a].length)
  for (const id of ids) {
    const open = new RegExp('<section[^>]*id="' + id + '"[^>]*>')
    const m = html.match(open)
    if (!m) continue
    const start = html.indexOf(m[0])
    const end = html.indexOf('</section>', start)
    if (end < 0) continue
    let seg = html.slice(start, end)
    for (const k of keys) {
      const t = TRloc[k]
      if (t == null || t === '') continue
      const en = escapeHtml(SRC[k])
      if (seg.indexOf(en) >= 0) seg = seg.split(en).join(escapeHtml(t))
    }
    html = html.slice(0, start) + seg + html.slice(end)
  }
  return html
}

function replaceMarkerScript(html, id, body) {
  const re = new RegExp('<script id="' + id + '">[\\s\\S]*?</script>')
  if (!re.test(html)) return html
  return html.replace(re, '<script id="' + id + '">' + body + '</script>')
}

function i18nShimBody(slice) {
  return '/*CAI-I18N-INJECT*/var I18N=' + JSON.stringify(slice) +
    ';window.T=function(k){var d=(I18N[document.documentElement.lang]||I18N.en);return d&&d[k]!=null?d[k]:(I18N.en&&I18N.en[k]!=null?I18N.en[k]:null);};window.LANGNOW=(document.documentElement.lang||"en");'
}

function gaShimBody(slice) {
  return '/*CAI-GA-INJECT*/var GA_LOCALES=' + JSON.stringify(slice) + ';window.__gaLocales=GA_LOCALES;'
}

function stripLocaleSeo(html) {
  return html
    .replace(/<link\s+rel=["']canonical["'][^>]*>\s*/gi, '')
    .replace(/<link\s+rel=["']alternate["'][^>]*>\s*/gi, '')
    .replace(/<meta\s+name=["']cai-static-locale["'][^>]*>\s*/gi, '')
    .replace(/<meta\s+name=["']cai-static-i18n-prerender["'][^>]*>\s*/gi, '')
    .replace(/<meta\s+name=["']cai-hreflang-locales["'][^>]*>\s*/gi, '')
    .replace(/<meta\s+property=["']og:locale["'][^>]*>\s*/gi, '')
    .replace(/<script\s+id=["']cai-static-locale-seed["'][\s\S]*?<\/script>\s*/gi, '')
}

function setHtmlLang(html, code) {
  return html.replace(/<html([^>]*)>/i, (match, attrs) => {
    const cleanAttrs = attrs.replace(/\s+lang=["'][^"']*["']/i, '')
    return '<html' + cleanAttrs + ' lang="' + code + '">'
  })
}

const pageUrl = (slug, code) => (code === 'en' ? SITE + '/' + slug : SITE + '/' + code + '/' + slug)

function alternates(slug) {
  return [
    '<link rel="alternate" hreflang="x-default" href="' + pageUrl(slug, 'en') + '">',
    '<link rel="alternate" hreflang="en" href="' + pageUrl(slug, 'en') + '">',
    ...LOCALES.map((code) => '<link rel="alternate" hreflang="' + code + '" href="' + pageUrl(slug, code) + '">')
  ].join('\n')
}

function seoBlock(slug, code) {
  const lines = [
    '<link rel="canonical" href="' + pageUrl(slug, code) + '">',
    alternates(slug),
    '<meta name="cai-hreflang-locales" content="en,' + LOCALES.join(',') + '">'
  ]
  if (code !== 'en') {
    lines.push('<meta name="cai-static-locale" content="' + code + '">')
    lines.push('<meta name="cai-static-i18n-prerender" content="data-i18n">')
    lines.push('<meta property="og:locale" content="' + OG[code] + '">')
    lines.push('<script id="cai-static-locale-seed">(function(){window.__CAI_STATIC_LOCALE="' + code + '";try{localStorage.setItem("cai_lang","' + code + '");localStorage.setItem("cai_locale","' + code + '");}catch(e){}})();</script>')
  }
  return lines.join('\n')
}

function retitle(html, title, desc) {
  html = html.replace(/<title>[\s\S]*?<\/title>/i, '<title>' + escapeHtml(title) + '</title>')
  if (desc) {
    html = html.replace(/(<meta name="description" content=")[^"]*(">)/i, '$1' + escapeHtml(desc) + '$2')
    html = html.replace(/(<meta property="og:description" content=")[^"]*(">)/i, '$1' + escapeHtml(desc) + '$2')
    html = html.replace(/(<meta name="twitter:description" content=")[^"]*(">)/i, '$1' + escapeHtml(desc) + '$2')
  }
  html = html.replace(/(<meta property="og:title" content=")[^"]*(">)/i, '$1' + escapeHtml(title) + '$2')
  html = html.replace(/(<meta name="twitter:title" content=")[^"]*(">)/i, '$1' + escapeHtml(title) + '$2')
  return html
}

function writeFileEnsured(filePath, html) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, html, 'utf8')
}

// ---------------- load sources ----------------
const agentsHtml = fs.readFileSync(path.join(PUBLIC, 'agents.html'), 'utf8')
const I18N = extractObject(agentsHtml, 'var I18N=') || {}
const SRC = extractObject(agentsHtml, 'var SRC=') || null
const TR = extractObject(agentsHtml, 'var TR=') || {}
const GA = JSON.parse(fs.readFileSync(path.resolve('scripts/i18n/ga-locales.json'), 'utf8'))

const PAGES = [
  {
    slug: 'score',
    master: 'score.html',
    readerIds: ['tenant-architecture', 'cai-score-guide'],
    ga: true,
    title: (code) => (code === 'en' ? 'CAI Score & Governance | ColleagueAI' : (I18N[code]?.tabs_score || 'CAI Score') + ' | ColleagueAI'),
    desc: (code) => (code === 'en'
      ? 'The CAI Score explained: five autonomy tiers, mapped controls and audit evidence, EU AI Act and DORA alignment - plus a free AI governance readiness check.'
      : I18N[code]?.score_hero_p || '')
  },
  {
    slug: 'usage',
    master: 'usage.html',
    readerIds: [],
    ga: false,
    title: (code) => (code === 'en' ? 'Usage Intelligence - CAI Token Economy Monitor | ColleagueAI' : (I18N[code]?.tabs_usage || 'Usage monitor') + ' | ColleagueAI'),
    desc: (code) => (code === 'en'
      ? 'Client-owned token usage intelligence for AI agents: see consumption, estimated cost, waste and optimisation opportunities - without your data leaving your tenant.'
      : I18N[code]?.usage_lead || '')
  }
]

for (const page of PAGES) {
  const masterPath = path.join(PUBLIC, page.master)
  if (!fs.existsSync(masterPath)) throw new Error(page.master + ' not found in public/.')
  const base = fs.readFileSync(masterPath, 'utf8')

  // English output: en-only payload, canonical SEO kept from the master
  let en = replaceMarkerScript(base, 'cai-page-i18n', i18nShimBody({ en: I18N.en || {} }))
  if (page.ga) en = replaceMarkerScript(en, 'cai-page-ga', gaShimBody({}))
  en = stripLocaleSeo(en)
  en = en.replace('</head>', seoBlock(page.slug, 'en') + '\n</head>')
  for (const dir of [PUBLIC, DIST]) {
    writeFileEnsured(path.join(dir, page.master), en)
    writeFileEnsured(path.join(dir, 'en', page.master), en)
    writeFileEnsured(path.join(dir, 'en', page.slug, 'index.html'), en)
  }

  for (const code of LOCALES) {
    let html = stripLocaleSeo(base)
    html = setHtmlLang(html, code)
    html = retitle(html, page.title(code), page.desc(code))
    html = prerenderDataI18n(html, I18N[code])
    html = applyReaderTranslations(html, page.readerIds, SRC, TR[code])
    html = replaceMarkerScript(html, 'cai-page-i18n', i18nShimBody({ en: I18N.en || {}, [code]: I18N[code] || {} }))
    if (page.ga) html = replaceMarkerScript(html, 'cai-page-ga', gaShimBody(GA[code] ? { [code]: GA[code] } : {}))
    html = html.replace('</head>', seoBlock(page.slug, code) + '\n</head>')
    for (const dir of [PUBLIC, DIST]) {
      writeFileEnsured(path.join(dir, code, page.master), html)
      writeFileEnsured(path.join(dir, code, page.slug, 'index.html'), html)
    }
  }
}

// ---------------- sitemap ----------------
function sitemapEntry(slug, code) {
  const today = new Date().toISOString().slice(0, 10)
  const alts = [
    '    <xhtml:link rel="alternate" hreflang="x-default" href="' + pageUrl(slug, 'en') + '" />',
    '    <xhtml:link rel="alternate" hreflang="en" href="' + pageUrl(slug, 'en') + '" />',
    ...LOCALES.map((c) => '    <xhtml:link rel="alternate" hreflang="' + c + '" href="' + pageUrl(slug, c) + '" />')
  ].join('\n')
  return ['  <url>', '    <loc>' + pageUrl(slug, code) + '</loc>', alts, '    <lastmod>' + today + '</lastmod>', '  </url>'].join('\n')
}

for (const dir of [PUBLIC, DIST]) {
  const sitemapPath = path.join(dir, 'sitemap.xml')
  if (!fs.existsSync(sitemapPath)) continue
  let xml = fs.readFileSync(sitemapPath, 'utf8')
  if (!xml.includes('xmlns:xhtml=')) xml = xml.replace('<urlset ', '<urlset xmlns:xhtml="http://www.w3.org/1999/xhtml" ')
  for (const page of PAGES) {
    for (const code of ['en', ...LOCALES]) {
      const loc = pageUrl(page.slug, code)
      if (!xml.includes('<loc>' + loc + '</loc>')) {
        xml = xml.replace('</urlset>', sitemapEntry(page.slug, code) + '\n</urlset>')
      }
    }
  }
  writeFileEnsured(sitemapPath, xml)
}

console.log('[secondary-pages] wrote /score and /usage in en + ' + LOCALES.join(', ') + ' to public and dist, plus sitemap entries')
