export const DEFAULT_LOCALE = 'en';

export const LOCALES = [
  { code: 'en', name: 'English', flag: '' },
  { code: 'cs', name: 'Cestina', flag: '' },
  { code: 'de', name: 'Deutsch', flag: '' },
  { code: 'fr', name: 'Francais', flag: '' },
  { code: 'es', name: 'Espanol', flag: '' },
  { code: 'it', name: 'Italiano', flag: '' },
  { code: 'pl', name: 'Polski', flag: '' },
  { code: 'pt', name: 'Portugues', flag: '' },
];

export const SUPPORTED_LOCALE_CODES = LOCALES.map((locale) => locale.code);

export const LOCALIZED_PAGE_SLUGS = new Set([
  'agents',
  'trust',
  'partners',
  'privacy',
  'terms',
]);

export function isSupportedLocale(locale) {
  return SUPPORTED_LOCALE_CODES.includes(locale);
}

export function getLocaleFromPath(pathname = '/') {
  const first = pathname.split('/').filter(Boolean)[0];
  return isSupportedLocale(first) ? first : DEFAULT_LOCALE;
}

export function removeLocaleFromPath(pathname = '/') {
  const parts = pathname.split('/').filter(Boolean);

  if (parts.length && isSupportedLocale(parts[0])) {
    parts.shift();
  }

  return '/' + parts.join('/');
}

export function localizedPath(locale, pathname = '/') {
  const safeLocale = isSupportedLocale(locale) ? locale : DEFAULT_LOCALE;
  const withoutLocale = removeLocaleFromPath(pathname);
  const normalizedPath = withoutLocale === '/' ? '' : withoutLocale;

  if (safeLocale === DEFAULT_LOCALE) {
    return normalizedPath || '/';
  }

  return `/${safeLocale}${normalizedPath}`;
}
