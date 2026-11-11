/**
 * lib/countries.js - the country a buyer company declares on the order-confirmation page.
 *
 * ISO 3166-1 alpha-2 codes only; names are rendered with Intl.DisplayNames so they follow the page language.
 * EU membership is listed here because the buyer's VAT ID check (lib/acceptance.js) and the buyer category
 * (lib/taxPolicy.js) both depend on it. Northern Ireland trades goods under EU VAT rules (XI prefix), but it is not
 * a country code a buyer selects: a Northern Ireland company selects GB and Stripe handles an XI number itself.
 * Nothing here decides a tax treatment; it only describes where the buyer says it is established.
 */

export const COUNTRY_CODES = (
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ ' +
  'CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR ' +
  'GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO ' +
  'JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR ' +
  'MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO ' +
  'RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV ' +
  'TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'
).split(' ');

const COUNTRY_SET = new Set(COUNTRY_CODES);

/** The 27 EU member states. */
export const EU_COUNTRIES = new Set(
  'AT BE BG CY CZ DE DK EE ES FI FR GR HR HU IE IT LT LU LV MT NL PL PT RO SE SI SK'.split(' '),
);

/** VAT number prefix of an EU member state (Greece uses EL, every other state its ISO code). */
export function euVatPrefix(country) {
  return country === 'GR' ? 'EL' : country;
}

export function isCountryCode(code) {
  return COUNTRY_SET.has(String(code || '').toUpperCase());
}

export function isEuCountry(code) {
  return EU_COUNTRIES.has(String(code || '').toUpperCase());
}

/** Country name in the page language, falling back to the code itself. */
export function countryName(code, lang = 'en') {
  try {
    return new Intl.DisplayNames([lang, 'en'], { type: 'region' }).of(code) || code;
  } catch {
    return code;
  }
}

/** [code, name] pairs sorted by name in the page language. */
export function countryOptions(lang = 'en') {
  return COUNTRY_CODES.map((c) => [c, countryName(c, lang)]).sort((a, b) => a[1].localeCompare(b[1], lang));
}
