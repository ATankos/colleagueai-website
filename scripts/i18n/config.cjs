const routes = require("../../i18n.routes.json");

const DEFAULT_LOCALE = routes.defaultLocale;
const SUPPORTED_LOCALE_CODES = routes.locales.slice();
const PAGE_SLUGS = routes.slugs;
const GLOBAL_PAGES = routes.pages.slice();

const MARKETING_PAGES = ["agents", "trust", "partners"];
const LEGAL_PAGES = ["privacy", "terms"];

const OG = { en: "en_US", cs: "cs_CZ", de: "de_DE", fr: "fr_FR", es: "es_ES", it: "it_IT", pl: "pl_PL", pt: "pt_PT" };
const NAMES = { en: "English", cs: "Cestina", de: "Deutsch", fr: "Francais", es: "Espanol", it: "Italiano", pl: "Polski", pt: "Portugues" };
const LABELS = { en: "English", cs: "Čeština", de: "Deutsch", fr: "Français", es: "Español", it: "Italiano", pl: "Polski", pt: "Português" };

const LOCALES = SUPPORTED_LOCALE_CODES.map((code) => ({ code, name: NAMES[code] || code, label: LABELS[code] || code, og: OG[code] || "en_US" }));

function isSupportedLocale(locale) {
  return SUPPORTED_LOCALE_CODES.includes(locale);
}

// Translated slug for a page in a locale (falls back to English slug).
function slugFor(locale, page) {
  const map = PAGE_SLUGS[page];
  if (!map) return page;
  const loc = isSupportedLocale(locale) ? locale : DEFAULT_LOCALE;
  return map[loc] || map[DEFAULT_LOCALE] || page;
}

// Resolve a page key from a (possibly translated) slug.
function pageFromSlug(slug) {
  for (const page of GLOBAL_PAGES) {
    const map = PAGE_SLUGS[page];
    if (map && Object.values(map).includes(slug)) return page;
  }
  return null;
}

// THE single canonical public path for (locale, page): en = bare, others = /<locale>/<slug>.
function canonicalPath(locale, page) {
  const loc = isSupportedLocale(locale) ? locale : DEFAULT_LOCALE;
  const slug = slugFor(loc, page);
  return loc === DEFAULT_LOCALE ? "/" + slug : "/" + loc + "/" + slug;
}

// Back-compat helper (page name in, canonical path out).
function localizedPath(locale, page) {
  const safePage = String(page || "").replace(/^\/+|\/+$/g, "");
  return canonicalPath(locale, safePage);
}

module.exports = {
  DEFAULT_LOCALE,
  LOCALES,
  SUPPORTED_LOCALE_CODES,
  PAGE_SLUGS,
  MARKETING_PAGES,
  LEGAL_PAGES,
  GLOBAL_PAGES,
  isSupportedLocale,
  slugFor,
  pageFromSlug,
  canonicalPath,
  localizedPath,
};
