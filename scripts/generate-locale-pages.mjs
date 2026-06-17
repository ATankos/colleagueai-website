import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

const SITE = 'https://www.colleagueai.ai'
const DIST = path.resolve('dist')
const LOCALES = [
  { code: 'en', og: 'en_US', title: 'Governed AI Agents | ColleagueAI' },
  { code: 'cs', og: 'cs_CZ', title: 'Řízení AI agenti | ColleagueAI' },
  { code: 'de', og: 'de_DE', title: 'Governed AI Agents | ColleagueAI' },
  { code: 'fr', og: 'fr_FR', title: 'Agents IA gouvernés | ColleagueAI' },
  { code: 'es', og: 'es_ES', title: 'Agentes de IA gobernados | ColleagueAI' },
  { code: 'it', og: 'it_IT', title: 'Agenti IA governati | ColleagueAI' },
  { code: 'pl', og: 'pl_PL', title: 'Nadzorowani agenci AI | ColleagueAI' },
  { code: 'pt', og: 'pt_PT', title: 'Agentes de IA governados | ColleagueAI' }
]

const sourcePath = path.join(DIST, 'agents.html')
const sitemapPath = path.join(DIST, 'sitemap.xml')

if (!fs.existsSync(sourcePath)) {
  throw new Error('dist/agents.html not found. Run after vite build and generate-agent-pages.')
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
    ...LOCALES.map((locale) => '<link rel="alternate" hreflang="' + locale.code + '" href="' + SITE + '/' + locale.code + '/agents">')
  ].join('\n')
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

function prerenderDataI18n(html, code, i18n) {
  const dict = i18n && i18n[code]
  if (!dict) return html

  return html.replace(/(<([a-z0-9-]+)(?=[^>]*\sdata-i18n=["']([^"']+)["'])[^>]*>)([\s\S]*?)(<\/\2>)/gi, (match, open, tag, key, body, close) => {
    if (!Object.prototype.hasOwnProperty.call(dict, key)) return match
    const value = dict[key]
    if (typeof value !== 'string') return match
    if (/[<>]/.test(body.trim())) return match
    return open + escapeHtml(value) + close
  })
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
    '<link rel="canonical" href="' + SITE + '/' + locale.code + '/agents">',
    alternateLinks(),
    '<meta name="cai-static-locale" content="' + locale.code + '">',
    '<meta name="cai-static-i18n-prerender" content="data-i18n">',
    '<meta property="og:locale" content="' + locale.og + '">',
    '<script id="cai-static-locale-seed">(function(){window.__CAI_STATIC_LOCALE="' + locale.code + '";try{localStorage.setItem("cai_lang","' + locale.code + '");localStorage.setItem("cai_locale","' + locale.code + '");}catch(e){}})();</script>'
  ].join('\n')
}

function writeRootAgents(baseHtml) {
  let html = stripLocaleSeo(baseHtml)
  html = html.replace('</head>', rootSeoBlock() + '\n</head>')
  fs.writeFileSync(sourcePath, html, 'utf8')
}

function writeLocalePage(baseHtml, locale, i18n) {
  let html = stripLocaleSeo(baseHtml)
  html = setHtmlLang(html, locale.code)
  html = html.replace(/<title>[\s\S]*?<\/title>/i, '<title>' + escapeHtml(locale.title) + '</title>')
  html = prerenderDataI18n(html, locale.code, i18n)
  html = html.replace('</head>', localeSeoBlock(locale) + '\n</head>')

  const dir = path.join(DIST, locale.code)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'agents.html'), html, 'utf8')
}

function sitemapEntry(loc) {
  const today = new Date().toISOString().slice(0, 10)
  const alternates = [
    '    <xhtml:link rel="alternate" hreflang="x-default" href="' + SITE + '/agents" />',
    ...LOCALES.map((locale) => '    <xhtml:link rel="alternate" hreflang="' + locale.code + '" href="' + SITE + '/' + locale.code + '/agents" />')
  ].join('\n')

  return [
    '  <url>',
    '    <loc>' + loc + '</loc>',
    alternates,
    '    <lastmod>' + today + '</lastmod>',
    '  </url>'
  ].join('\n')
}

function updateSitemap() {
  let xml = fs.existsSync(sitemapPath)
    ? fs.readFileSync(sitemapPath, 'utf8')
    : '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n</urlset>\n'

  if (!xml.includes('xmlns:xhtml=')) {
    xml = xml.replace('<urlset ', '<urlset xmlns:xhtml="http://www.w3.org/1999/xhtml" ')
  }

  const entries = LOCALES.map((locale) => sitemapEntry(SITE + '/' + locale.code + '/agents')).join('\n')
  const missing = LOCALES.some((locale) => !xml.includes('/' + locale.code + '/agents'))

  if (missing) {
    xml = xml.replace('</urlset>', entries + '\n</urlset>')
  }

  fs.writeFileSync(sitemapPath, xml, 'utf8')
}

const baseHtml = fs.readFileSync(sourcePath, 'utf8')
const i18n = extractI18n(baseHtml)

writeRootAgents(baseHtml)
for (const locale of LOCALES) writeLocalePage(baseHtml, locale, i18n)
updateSitemap()

console.log('[locale-pages] wrote ' + LOCALES.length + ' localized /agents pages and updated sitemap hreflang entries')
