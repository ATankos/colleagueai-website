/** CAI-AUD-009 / round 2: the corrective-release benefit belongs to the licence of the version corrected, in all eight languages. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const d = JSON.parse(readFileSync('scripts/i18n/certified-content.json', 'utf8'));
const OLD = {
  cs: /Bezpečnostní opravy dostává každý držitel/, de: /Sicherheitskorrekturen erhält jeder/, fr: /correctifs de sécurité parviennent à chaque/,
  es: /correcciones de seguridad llegan a todos/, it: /correzioni di sicurezza raggiungono ogni/, pl: /Poprawki bezpieczeństwa trafiają do każdego/, pt: /correções de segurança chegam a todos/,
};
for (const [lang, v] of Object.entries(d)) {
  test(`${lang}: b4 and b4_v tie corrective releases to the version bought, not to "every licensee"`, () => {
    if (OLD[lang]) assert.doesNotMatch(v.b4, OLD[lang]);
    assert.ok(v.b4.length > 120, 'b4 states both the licence tie and the limit on later feature releases');
    assert.doesNotMatch(v.b4_v, /every licen|each licen|todos los titulares$/i);
  });
}
test('the seven translations differ from the English source (no English leak)', () => {
  for (const l of Object.keys(d).filter((x) => x !== 'en')) { assert.notEqual(d[l].b4, d.en.b4); assert.notEqual(d[l].b4_v, d.en.b4_v); }
});
