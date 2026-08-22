import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { createRequire } from 'node:module'

const SITE = 'https://www.colleagueai.ai'
const DIST = path.resolve('dist')
const PUBLIC = path.resolve('public')
const LOCALES = [
  { code: 'en', og: 'en_US', title: 'Governed AI Agents | ColleagueAI', desc: 'Explore governed AI agents for finance, operations, risk, compliance, legal, procurement, HR, and enterprise workflows.' },
  { code: 'cs', og: 'cs_CZ', title: 'Katalog AI agentů | ColleagueAI', desc: 'Prozkoumejte řízené AI agenty pro finance, provoz, rizika, compliance, právo, nákup, HR a podnikové procesy.' },
  { code: 'de', og: 'de_DE', title: 'Governed AI Agents | ColleagueAI', desc: 'Entdecken Sie governed AI-Agenten für Finanzen, Betrieb, Risiko, Compliance, Recht, Einkauf, HR und Unternehmensprozesse.' },
  { code: 'fr', og: 'fr_FR', title: 'Agents IA gouvernés | ColleagueAI', desc: "Découvrez des agents IA gouvernés pour la finance, les opérations, le risque, la conformité, le juridique, les achats, les RH et les processus d'entreprise." },
  { code: 'es', og: 'es_ES', title: 'Agentes de IA gobernados | ColleagueAI', desc: 'Explore agentes de IA gobernados para finanzas, operaciones, riesgo, cumplimiento, legal, compras, RR. HH. y procesos empresariales.' },
  { code: 'it', og: 'it_IT', title: 'Agenti IA governati | ColleagueAI', desc: 'Esplori agenti IA governati per finanza, operations, rischio, compliance, legale, procurement, HR e processi aziendali.' },
  { code: 'pl', og: 'pl_PL', title: 'Nadzorowani agenci AI | ColleagueAI', desc: 'Poznaj nadzorowanych agentów AI dla finansów, operacji, ryzyka, compliance, prawa, zakupów, HR i procesów biznesowych.' },
  { code: 'pt', og: 'pt_PT', title: 'Agentes de IA governados | ColleagueAI', desc: 'Explore agentes de IA governados para finanças, operações, risco, compliance, jurídico, compras, RH e processos empresariais.' }
]

// Localized pretty slug per locale, sourced from the single slug map. Default locale is bare.
const ROUTES = createRequire(import.meta.url)('../i18n.routes.json')
const AGENTS_SLUG = Object.fromEntries(ROUTES.locales.map((l) => [l, ROUTES.slugs.agents[l]]))
const agentsPath = (code) => (code === ROUTES.defaultLocale ? '/' + AGENTS_SLUG[code] : '/' + code + '/' + AGENTS_SLUG[code])
const localeAgentsUrl = (code) => SITE + agentsPath(code)

// public/ is the source of truth. dist/ is build output and Vercel restores it
// from the previous deployment's build cache, so reading it as an input meant a
// stale cached agents.html silently overwrote the fresh one from git on every
// deploy - the page kept reverting no matter what was committed.
const sourcePath = path.join(PUBLIC, 'agents.html')

if (!fs.existsSync(sourcePath)) {
  throw new Error('agents.html not found in public/.')
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function findMatchingBrace(source, startIndex) {
  let depth = 0
  let quote = ''
  let escaped = false

  for (let i = startIndex; i < source.length; i += 1) {
    const ch = source[i]
    const code = ch.charCodeAt(0)

    if (quote) {
      if (escaped) {
        escaped = false
      } else if (ch === '\\') {
        escaped = true
      } else if (ch === quote) {
        quote = ''
      }
      continue
    }

    if (ch === '"' || ch === "'" || code === 96) {
      quote = ch
      continue
    }

    if (ch === '{') depth += 1
    if (ch === '}') {
      depth -= 1
      if (depth === 0) return i
    }
  }

  return -1
}

function extractI18n(html) {
  const marker = 'var I18N='
  const start = html.indexOf(marker)
  if (start < 0) return {}

  const braceStart = html.indexOf('{', start)
  if (braceStart < 0) return {}

  const braceEnd = findMatchingBrace(html, braceStart)
  if (braceEnd < 0) return {}

  try {
    const literal = html.slice(braceStart, braceEnd + 1)
    return vm.runInNewContext('(' + literal + ')', {})
  } catch (error) {
    console.warn('[locale-pages] Could not parse I18N object:', error.message)
    return {}
  }
}

function alternateLinks() {
  return [
    '<link rel="alternate" hreflang="x-default" href="' + SITE + '/agents">',
    ...LOCALES.map((locale) => '<link rel="alternate" hreflang="' + locale.code + '" href="' + localeAgentsUrl(locale.code) + '">')
  ].join('\n')
}

function stripLocaleSeo(html) {
  return html
    .replace(/<!-- cai-global-hreflang:start -->[\s\S]*?<!-- cai-global-hreflang:end -->\s*/g, '')
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

function prerenderDataI18n(html, code, i18n) {
  const dict = i18n && i18n[code]
  if (!dict) return html

  html = html.replace(/(<([a-z0-9-]+)(?=[^>]*\sdata-i18n=["']([^"']+)["'])[^>]*>)([\s\S]*?)(<\/\2>)/gi, (match, open, tag, key, body, close) => {
    if (!Object.prototype.hasOwnProperty.call(dict, key)) return match
    const value = dict[key]
    if (typeof value !== 'string') return match
    if (/[<>]/.test(body.trim())) return match
    return open + escapeHtml(value) + close
  })

  // data-i18n-ph: translate placeholder attributes (the runtime does this on load; crawlers need it baked in)
  html = html.replace(/(<[a-z0-9-]+[^>]*\sdata-i18n-ph=["']([^"']+)["'][^>]*>)/gi, (open, _tag, key) => {
    if (!Object.prototype.hasOwnProperty.call(dict, key)) return open
    const value = dict[key]
    if (typeof value !== 'string') return open
    return open.replace(/\splaceholder="[^"]*"/i, ' placeholder="' + escapeHtml(value).replace(/"/g, '&quot;') + '"')
  })

  // data-i18n-html elements carry markup (e.g. the hero H1) — prerender them with the raw localized HTML
  html = html.replace(/(<([a-z0-9-]+)(?=[^>]*\sdata-i18n-html=["']([^"']+)["'])[^>]*>)([\s\S]*?)(<\/\2>)/gi, (match, open, tag, key, body, close) => {
    if (!Object.prototype.hasOwnProperty.call(dict, key)) return match
    const value = dict[key]
    if (typeof value !== 'string') return match
    if (/<\/?(section|div|script|style)\b/i.test(body)) return match
    return open + value + close
  })

  return html
}

function rootSeoBlock() {
  return [
    '<link rel="canonical" href="' + SITE + '/agents">',
    alternateLinks(),
    '<meta name="cai-hreflang-locales" content="' + LOCALES.map((locale) => locale.code).join(',') + '">'
  ].join('\n')
}

function localeSeoBlock(locale) {
  return [
    '<link rel="canonical" href="' + localeAgentsUrl(locale.code) + '">',
    alternateLinks(),
    '<meta name="cai-static-locale" content="' + locale.code + '">',
    '<meta name="cai-static-i18n-prerender" content="data-i18n">',
    '<meta property="og:locale" content="' + locale.og + '">',
    '<script id="cai-static-locale-seed">(function(){window.__CAI_STATIC_LOCALE="' + locale.code + '";try{localStorage.setItem("cai_lang","' + locale.code + '");localStorage.setItem("cai_locale","' + locale.code + '");}catch(e){}})();</script>'
  ].join('\n')
}

function localizedPage(baseHtml, locale, i18n) {
  let html = stripLocaleSeo(baseHtml)
  html = setHtmlLang(html, locale.code)
  html = html.replace(/<title>[\s\S]*?<\/title>/i, '<title>' + escapeHtml(locale.title) + '</title>')
  if (locale.desc) {
    html = html.replace(/(<meta name="description" content=")[^"]*(">)/i, '$1' + escapeHtml(locale.desc) + '$2')
    html = html.replace(/(<meta property="og:description" content=")[^"]*(">)/i, '$1' + escapeHtml(locale.desc) + '$2')
    html = html.replace(/(<meta name="twitter:description" content=")[^"]*(">)/i, '$1' + escapeHtml(locale.desc) + '$2')
  }
  html = html.replace(/(<meta property="og:title" content=")[^"]*(">)/i, '$1' + escapeHtml(locale.title) + '$2')
  html = html.replace(/(<meta name="twitter:title" content=")[^"]*(">)/i, '$1' + escapeHtml(locale.title) + '$2')
  html = prerenderDataI18n(html, locale.code, i18n)
  return html.replace('</head>', localeSeoBlock(locale) + '\n</head>')
}

function rootAgentsPage(baseHtml) {
  let html = stripLocaleSeo(baseHtml)
  return html.replace('</head>', rootSeoBlock() + '\n</head>')
}

function writeFileEnsured(filePath, html) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, html, 'utf8')
}

function writeLocalizedFiles(targetDir, baseHtml, i18n) {
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true })

  writeFileEnsured(path.join(targetDir, 'agents.html'), rootAgentsPage(baseHtml))

  for (const locale of LOCALES) {
    const html = localizedPage(baseHtml, locale, i18n)
    writeFileEnsured(path.join(targetDir, locale.code, 'agents.html'), html)
    writeFileEnsured(path.join(targetDir, locale.code, 'agents', 'index.html'), html)
  }
}

function sitemapEntry(loc) {
  const today = new Date().toISOString().slice(0, 10)
  const alternates = [
    '    <xhtml:link rel="alternate" hreflang="x-default" href="' + SITE + '/agents" />',
    ...LOCALES.map((locale) => '    <xhtml:link rel="alternate" hreflang="' + locale.code + '" href="' + localeAgentsUrl(locale.code) + '" />')
  ].join('\n')

  return [
    '  <url>',
    '    <loc>' + loc + '</loc>',
    alternates,
    '    <lastmod>' + today + '</lastmod>',
    '  </url>'
  ].join('\n')
}

function updateSitemap(targetDir) {
  const sitemapPath = path.join(targetDir, 'sitemap.xml')
  let xml = fs.existsSync(sitemapPath)
    ? fs.readFileSync(sitemapPath, 'utf8')
    : '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n</urlset>\n'

  if (!xml.includes('xmlns:xhtml=')) {
    xml = xml.replace('<urlset ', '<urlset xmlns:xhtml="http://www.w3.org/1999/xhtml" ')
  }

  const entries = LOCALES.map((locale) => sitemapEntry(localeAgentsUrl(locale.code))).join('\n')
  const missing = LOCALES.some((locale) => !xml.includes('/' + locale.code + '/' + AGENTS_SLUG[locale.code]))

  if (missing) {
    xml = xml.replace('</urlset>', entries + '\n</urlset>')
  }

  writeFileEnsured(sitemapPath, xml)
}

const baseHtml = fs.readFileSync(sourcePath, 'utf8')
const i18n = extractI18n(baseHtml)

writeLocalizedFiles(DIST, baseHtml, i18n)
writeLocalizedFiles(PUBLIC, baseHtml, i18n)
updateSitemap(DIST)
updateSitemap(PUBLIC)

console.log('[locale-pages] wrote localized /agents pages to dist and public, including clean-url index files')
