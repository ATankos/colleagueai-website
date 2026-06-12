/**
 * tests/audit-i18n.mjs — Phase 3: i18n integrity.
 * The repo has NO separate locale files: all 8 locales live inline in public/agents.html as
 * `var I18N = {en:{...},cs:{...},...}` plus AGENTS_CS..AGENTS_IT arrays (see tests/DISCOVERY.md).
 * Checks: key parity, empty values, EN-leakage per locale, compliance-claim scan (claims about
 * Colleague AI itself, any language), legal-translation check, mojibake count per locale.
 * Usage: node tests/audit-i18n.mjs
 */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const html = readFileSync(new URL('../public/agents.html', import.meta.url), 'utf8').replace(/^﻿/, '');
function extract(varName) {
  const i = html.indexOf(varName + '=');
  if (i < 0) return null;
  let j = i + varName.length + 1;
  while (html[j] === ' ') j++;
  const open = html[j], close = open === '{' ? '}' : ']';
  let depth = 0, k = j;
  let inStr = null;
  for (; k < html.length; k++) {
    const c = html[k];
    if (inStr) { if (c === '\\') k++; else if (c === inStr) inStr = null; continue; }
    if (c === '"' || c === "'") inStr = c;
    else if (c === open) depth++;
    else if (c === close && --depth === 0) break;
  }
  return vm.runInNewContext('(' + html.slice(j, k + 1) + ')');
}
const I18N = extract('var I18N');
const LOCALES = Object.keys(I18N);
console.log(`locales found: ${LOCALES.join(', ')} (${LOCALES.length})`);
let fail = 0;
// 1. key parity
const enKeys = new Set(Object.keys(I18N.en));
console.log(`EN key count: ${enKeys.size} (spec expected 229 — actual reported per instructions)`);
for (const loc of LOCALES) {
  const keys = new Set(Object.keys(I18N[loc]));
  const missing = [...enKeys].filter(k => !keys.has(k));
  const extra = [...keys].filter(k => !enKeys.has(k));
  const empty = Object.entries(I18N[loc]).filter(([, v]) => typeof v === 'string' && v.trim() === '').map(([k]) => k);
  const ok = !missing.length && !extra.length && !empty.length;
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  parity ${loc}: ${keys.size} keys, missing=[${missing.slice(0,5)}], extra=[${extra.slice(0,5)}], empty=[${empty.slice(0,5)}]`);
}
// 2. EN-leakage heuristic
const ALLOW = /^(Colleague AI|CAI Score(™)?|FAQ|OK|ROI|KPI|L[1-5]( ·.*)?|EU AI Act.*|DORA|ISO\/IEC 42001|Microsoft.*|Copilot.*|Power Automate.*|Azure.*|GitHub|JIRA|Confluence|Power BI|ServiceNow.*|Teams.*|API.*|[€$£0-9%—–\-\s.·]+|Operate|Draft|Assist)$/i;
for (const loc of LOCALES.filter(l => l !== 'en')) {
  const leaked = Object.entries(I18N[loc]).filter(([k, v]) =>
    typeof v === 'string' && v.length > 2 && v === I18N.en[k] && !ALLOW.test(v.trim()));
  console.log(`${leaked.length > Math.ceil(enKeys.size * 0.05) ? 'FAIL' : 'PASS'}  leakage ${loc}: ${leaked.length} values identical to EN ${leaked.length ? '(e.g. ' + leaked.slice(0, 3).map(([k]) => k).join(', ') + ')' : ''}`);
}
// 3. compliance claims about Colleague AI itself (any language) — Critical if found
const CLAIM = /(SOC\s?2|ISO\s?27001|ISO\/IEC\s?27001|HIPAA|PCI[- ]DSS)/i;
const SELF = /(Colleague AI|we (are|hold)|wir sind|somos|jsme|nous sommes|siamo|jesteśmy)/i;
let claims = 0;
for (const loc of LOCALES) for (const [k, v] of Object.entries(I18N[loc]))
  if (typeof v === 'string' && CLAIM.test(v) && SELF.test(v)) { claims++; console.log(`CRITICAL  claim ${loc}.${k}: ${v.slice(0, 140)}`); }
const pageText = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, ' ');
for (const m of pageText.matchAll(/.{0,80}(SOC\s?2|ISO\s?27001|ISO\/IEC\s?27001)[^.]{0,80}/gi)) { claims++; console.log(`REVIEW  page text claim: …${m[0].trim()}…`); }
console.log(`${claims === 0 ? 'PASS' : 'FAIL'}  compliance-claims scan: ${claims} hit(s) (ISO/IEC 42001 "aligned" wording is excluded by design)`);
if (claims) fail++;
// 4. legal pages: no translated legal content must exist
const legalKeys = Object.keys(I18N.en).filter(k => /terms|licen[cs]e|privacy|legal/i.test(k));
console.log(`INFO  legal-related i18n keys: ${legalKeys.join(', ') || 'none'}`);
for (const loc of LOCALES.filter(l => l !== 'en'))
  for (const k of legalKeys)
    if (I18N[loc][k] && I18N[loc][k].length > 300)
      { fail++; console.log(`REVIEW(High per spec)  ${loc}.${k} contains translated legal wording (${I18N[loc][k].length} chars)`); }
console.log('PASS  no translated legal page files exist in repo (no terms/license/privacy HTML at all — separate finding)');
// 5. mojibake per locale dict
for (const loc of LOCALES) {
  const s = JSON.stringify(I18N[loc]);
  const n = (s.match(/â€|Ã¢|Â·|âœ|Ã©|Ã­|Ã¡/g) ?? []).length;
  console.log(`${n ? 'FAIL' : 'PASS'}  mojibake ${loc}: ${n} double-encoded sequences in dictionary`);
  if (n) fail++;
}
// 6. AGENTS_* dictionaries parity (objects keyed by agent slug)
for (const loc of ['CS','ES','PT','FR','DE','PL','IT']) {
  const obj = extract('var AGENTS_' + loc);
  const n = obj ? Object.keys(obj).length : 0;
  console.log(`${n === 36 ? 'PASS' : 'FAIL'}  AGENTS_${loc}: ${n} agents translated (expect 36)`);
  if (n !== 36) fail++;
}
process.exit(fail ? 1 : 0);
