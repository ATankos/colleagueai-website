const DEFAULT_LOCALE = "en";

const LOCALES = [
  { code: "en", name: "English", og: "en_US" },
  { code: "cs", name: "Cestina", og: "cs_CZ" },
  { code: "de", name: "Deutsch", og: "de_DE" },
  { code: "fr", name: "Francais", og: "fr_FR" },
  { code: "es", name: "Espanol", og: "es_ES" },
  { code: "it", name: "Italiano", og: "it_IT" },
  { code: "pl", name: "Polski", og: "pl_PL" },
  { code: "pt", name: "Portugues", og: "pt_PT" },
];

const SUPPORTED_LOCALE_CODES = LOCALES.map((locale) => locale.code);

const MARKETING_PAGES = ["agents", "trust", "partners"];
const LEGAL_PAGES = ["privacy", "terms"];
const GLOBAL_PAGES = [...MARKETING_PAGES, ...LEGAL_PAGES];

function isSupportedLocale(locale) {
  return SUPPORTED_LOCALE_CODES.includes(locale);
}

function localizedPath(locale, page) {
  const safeLocale = isSupportedLocale(locale) ? locale : DEFAULT_LOCALE;
  const safePage = String(page || "").replace(/^\/+|\/+$/g, "");

  if (safeLocale === DEFAULT_LOCALE) {
    return "/" + safePage;
  }

  return "/" + safeLocale + "/" + safePage;
}

module.exports = {
  DEFAULT_LOCALE,
  LOCALES,
  SUPPORTED_LOCALE_CODES,
  MARKETING_PAGES,
  LEGAL_PAGES,
  GLOBAL_PAGES,
  isSupportedLocale,
  localizedPath,
};
