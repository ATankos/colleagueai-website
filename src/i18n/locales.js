import routes from '../../i18n.routes.json';

export const DEFAULT_LOCALE = routes.defaultLocale;
export const SUPPORTED_LOCALE_CODES = routes.locales.slice();
export const PAGES = routes.pages.slice();

const PAGE_SLUGS = routes.slugs;
const NAMES = { en: 'English', cs: 'Cestina', de: 'Deutsch', fr: 'Francais', es: 'Espanol', it: 'Italiano', pl: 'Polski', pt: 'Portugues' };

export const LOCALES = SUPPORTED_LOCALE_CODES.map((code) => ({ code, name: NAMES[code] || code, flag: '' }));

export const LOCALIZED_PAGE_SLUGS = new Set(PAGES);

export function isSupportedLocale(locale) {
  return SUPPORTED_LOCALE_CODES.includes(locale);
}

export function getLocaleFromPath(pathname = '/') {
  const first = pathname.split('/').filter(Boolean)[0];
  return isSupportedLocale(first) ? first : DEFAULT_LOCALE;
}

export function removeLocaleFromPath(pathname = '/') {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length && isSupportedLocale(parts[0])) parts.shift();
  return '/' + parts.join('/');
}

function slugFor(locale, page) {
  const map = PAGE_SLUGS[page];
  if (!map) return page;
  const loc = isSupportedLocale(locale) ? locale : DEFAULT_LOCALE;
  return map[loc] || map[DEFAULT_LOCALE] || page;
}

function pageFromSlug(slug) {
  for (const page of PAGES) {
    const map = PAGE_SLUGS[page];
    if (map && Object.values(map).includes(slug)) return page;
  }
  return null;
}

// Canonical translated path: en = bare, others = /<locale>/<translated-slug>. Unknown
// first segments (e.g. /demo, agent detail slugs) pass through with a locale prefix only.
export function localizedPath(locale, pathname = '/') {
  const safeLocale = isSupportedLocale(locale) ? locale : DEFAULT_LOCALE;
  const without = removeLocaleFromPath(pathname);
  const parts = without.split('/').filter(Boolean);
  if (parts.length) {
    const pageKey = pageFromSlug(parts[0]);
    if (pageKey) parts[0] = slugFor(safeLocale, pageKey);
  }
  const rest = '/' + parts.join('/');
  const normalized = rest === '/' ? '' : rest;
  if (safeLocale === DEFAULT_LOCALE) return normalized || '/';
  return `/${safeLocale}${normalized}`;
}
