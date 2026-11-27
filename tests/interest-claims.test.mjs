/**
 * tests/interest-claims.test.mjs - the site must not tell buyers they can "register interest" while interest collection is closed
 * (commercial freeze; the form is gated server-side by INTEREST_COLLECTION_ENABLED). Covers the committed pages in all eight languages,
 * the agent factsheet generator and the AI-readable files. Partner pages are exempt: the partner application is a different form.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const walk = (dir) => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
const pages = walk('public').filter((f) => f.endsWith('.html') && !/partner/i.test(f));

// Buyer-facing "register interest in the agents" promises, in each language the site is published in.
const CLAIMS = [
  /register your interest in/i, /register interest in the planned/i, /interest in any agent from its page/i,
  /Zaregistrujte zájem o ty/, /U každého agenta můžete zaregistrovat zájem/, /Projevte zájem o plánovaný/,
  /Registrieren Sie Ihr Interesse an den Agenten/, /Interesse am geplanten Token-Monitor anmelden/, /Ihr Interesse registr/,
  /Enregistrez votre intérêt pour ceux/, /Signaler votre intérêt pour le Token Monitor/, /enregistrer votre intérêt pour chaque agent/i,
  /Registre su interés en los que/, /Registrar interés en el Token Monitor/, /Puede registrar su interés en cada agente/,
  /Registra il tuo interesse per quelli/, /Segnala interesse per il Token Monitor/, /registrare il vostro interesse per ogni agente/,
  /Registe o seu interesse nos que/, /Registar interesse no Token Monitor/, /Pode registar interesse em cada agente/,
  /Zgłoś zainteresowanie tymi/, /Zgłoś zainteresowanie planowanym/, /możesz zgłosić zainteresowanie\./,
  /(Registrar interés|Registrar interesse|Registra interesse|Registrovat zájem|Zarejestruj zainteresowanie|Interesse registrieren|Enregistrer l’intérêt) in the planned Token Monitor/,
];

test('no buyer-facing page promises interest registration (8 languages)', () => {
  assert.ok(pages.length > 100, `expected the full page set, found ${pages.length}`);
  const found = [];
  for (const f of pages) { const t = readFileSync(f, 'utf8'); for (const re of CLAIMS) if (re.test(t)) found.push(`${f}: ${re}`); }
  assert.deepEqual(found, []);
});

test('the agent factsheet generator does not label its button "Register your interest"', () => {
  assert.doesNotMatch(readFileSync('scripts/generate-agent-pages.mjs', 'utf8'), /Register your interest/);
});

test('the Token Monitor button is localised in every language (no English left inside a localised dictionary)', () => {
  for (const f of pages) {
    const t = readFileSync(f, 'utf8');
    assert.doesNotMatch(t, /"usage_cta":"[^"]*in the planned Token Monitor/, f);
  }
});

test('AI-readable files do not promise interest registration unconditionally', () => {
  for (const f of ['public/llms.txt', 'public/llms-full.txt']) {
    const t = readFileSync(f, 'utf8');
    for (const m of t.matchAll(/[^.\n]*interest registration[^.\n]*\./gi)) {
      assert.match(m[0], /only while|when (that|it is) (form )?(is )?closed|no registration is taken|available only/i, `${f}: ${m[0]}`);
    }
  }
});
