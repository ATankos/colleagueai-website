const { SUPPORTED_LOCALE_CODES } = require("../config.cjs");

function assertLocaleMap(name, map) {
  const missing = SUPPORTED_LOCALE_CODES.filter((locale) => !Object.prototype.hasOwnProperty.call(map, locale));

  if (missing.length) {
    throw new Error(`${name} is missing locales: ${missing.join(", ")}`);
  }

  return map;
}

function pickLocalized(map, locale, fallbackLocale = "en") {
  if (map && Object.prototype.hasOwnProperty.call(map, locale)) return map[locale];
  return map[fallbackLocale];
}

module.exports = {
  assertLocaleMap,
  pickLocalized,
};
