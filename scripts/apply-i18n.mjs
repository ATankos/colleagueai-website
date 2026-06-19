/**
 * scripts/apply-i18n.mjs — translate + wire the 6 untranslated /agents sections.
 *
 * Fixes the language "mishmash": the sections with no data-i18n hooks
 * (tenant-architecture, cai-next-steps, launch-readiness-gate, cai-who-for,
 * cai-buyer-path, cai-score-guide) now translate on language switch.
 * (proof-demo is interactive JS and is handled separately — left untouched here.)
 *
 * Translations are produced by YOUR Anthropic setup (same key + model as the demo),
 * or loaded from a JSON file. They are DRAFT — pending professional review.
 *
 * Usage (PowerShell, from the repo root):
 *   node scripts/apply-i18n.mjs            # translate via Anthropic, then wire in
 *   node scripts/apply-i18n.mjs i18n.json  # use an existing JSON instead of calling the API
 *
 * Needs ANTHROPIC_API_KEY in the environment or in .env.local (only for the API path).
 * After it runs:  npm run build  →  npx playwright test languages-nav.spec.js
 * Reversible:     git checkout -- public/agents.html
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const AGENTS = 'public/agents.html';
const LANGS = ['cs', 'de', 'fr', 'es', 'it', 'pl', 'pt'];
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';
const SECTIONS = [
  { id: 'tenant-architecture', prefix: 'arch' },
  { id: 'cai-next-steps', prefix: 'next' },
  { id: 'launch-readiness-gate', prefix: 'gate' },
  { id: 'cai-who-for', prefix: 'whofor' },
  { id: 'cai-buyer-path', prefix: 'buyer' },
  { id: 'cai-score-guide', prefix: 'guide' },
];
const MARK_A = '<!-- CAI-I18N-X START (draft machine translations - pending professional review) -->';
const MARK_B = '<!-- CAI-I18N-X END -->';

const PROMPT_HEAD = `You are a professional localization specialist for enterprise B2B software. Translate the English UI strings below into these 7 languages by code: cs (Czech), de (German), fr (French), es (Spanish), it (Italian), pl (Polish), pt (European Portuguese, pt-PT).
CONTEXT: ColleagueAI - a governance "trust layer" certifying enterprise AI agents against the "CAI Score". Audience: enterprise buyers. Source is British English. Formal, professional register. Do not soften, add, or omit meaning.
DO NOT TRANSLATE (verbatim): ColleagueAI, CAI Score, CAI Token Economy Monitor, Entra ID, Active Directory, M365, SharePoint, Teams, Outlook, Azure, Azure OpenAI, Microsoft Copilot Studio, Power Automate, Stripe, RAG, RBAC, EU AI Act, DORA, ISO/IEC 42001; tier labels L1-L5 and names (Assist, Draft, Operate, Decide, Autonomous); numbers, currency, IDs, symbols.
OUTPUT: Return ONLY valid JSON, keys preserved, shape: { "KEY": {"cs":"...","de":"...","fr":"...","es":"...","it":"...","pl":"...","pt":"..."} }. No commentary, no code fences.
STRINGS (key: English):
`;

function sectionHtml(html, id) {
  const at = html.indexOf(`id="${id}"`);
  if (at < 0) return '';
  const open = html.lastIndexOf('<section', at);
  const re = /<\/?section\b/gi; re.lastIndex = open;
  let m, depth = 0, end = html.length;
  while ((m = re.exec(html))) {
    if (m[0][1] === '/') { depth--; if (depth === 0) { end = html.indexOf('>', re.lastIndex - 1) + 1; break; } }
    else depth++;
  }
  return html.slice(open, end);
}
function extract(sec) {
  const lines = sec.replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<(h[1-4]|p|li|div|ul|ol|tr|br|span|strong|a|button|th|td)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .split('\n').map(s => s.replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim())
    .filter(s => s.length > 2 && !/^[0-9.,%€$·\-—– ]+$/.test(s));
  const seen = new Set(), out = []; lines.forEach(s => { if (!seen.has(s)) { seen.add(s); out.push(s); } });
  return out;
}
function getKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  if (existsSync('.env.local')) {
    const m = readFileSync('.env.local', 'utf8').match(/^\s*ANTHROPIC_API_KEY\s*=\s*["']?([^"'\r\n]+)/m);
    if (m) return m[1].trim();
  }
  return null;
}
function transpose(byKey) {
  // { key: {cs,de,...} }  ->  { lang: {key: txt} }
  const TR = {}; LANGS.forEach(l => TR[l] = {});
  for (const [k, v] of Object.entries(byKey)) for (const l of LANGS) if (v && v[l] != null) TR[l][k] = v[l];
  return TR;
}
function buildBlock(SRC, TR) {
  return `${MARK_A}
<script>
(function(){
  var SRC=${JSON.stringify(SRC)};
  var TR=${JSON.stringify(TR)};
  var IDS=${JSON.stringify(SECTIONS.map(s => s.id))};
  var KEYS=Object.keys(SRC).sort(function(a,b){return SRC[b].length-SRC[a].length;});
  var ORIG={};
  function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
  function apply(lang){
    IDS.forEach(function(id){
      var sec=document.getElementById(id); if(!sec) return;
      if(ORIG[id]==null) ORIG[id]=sec.innerHTML;
      if(lang==='en'||!TR[lang]){ sec.innerHTML=ORIG[id]; return; }
      var h=ORIG[id];
      KEYS.forEach(function(k){ var t=TR[lang][k]; if(t==null||t==='') return; var en=esc(SRC[k]); if(h.indexOf(en)>=0) h=h.split(en).join(esc(t)); });
      sec.innerHTML=h;
    });
  }
  function cur(){var s=document.getElementById('langsel');return (s&&s.value)||window.LANGNOW||document.documentElement.lang||'en';}
  function boot(){ try{apply(cur());}catch(e){} var s=document.getElementById('langsel'); if(s) s.addEventListener('change',function(){try{apply(s.value);}catch(e){}}); }
  if(document.readyState!=='loading') boot(); else document.addEventListener('DOMContentLoaded', boot);
})();
</script>
${MARK_B}`;
}

async function main() {
  let html = readFileSync(AGENTS, 'utf8');

  // 1. extract the English source strings (keys match TRANSLATION-SOURCE.md)
  const SRC = {}, bySection = {};
  for (const { id, prefix } of SECTIONS) {
    const map = {};
    extract(sectionHtml(html, id)).forEach((s, i) => { const k = `${prefix}_${String(i + 1).padStart(2, '0')}`; SRC[k] = s; map[k] = s; });
    bySection[id] = map;
  }
  console.log(`Found ${Object.keys(SRC).length} strings across ${SECTIONS.length} sections.`);

  // 2. obtain translations — from a JSON file arg, or via Anthropic
  let byKey;
  const fileArg = process.argv[2];
  if (fileArg) {
    if (!existsSync(fileArg)) { console.error(`File not found: ${fileArg}`); process.exit(1); }
    byKey = JSON.parse(readFileSync(fileArg, 'utf8'));
    console.log(`Loaded translations from ${fileArg}.`);
  } else {
    const apiKey = getKey();
    if (!apiKey) {
      console.error('No ANTHROPIC_API_KEY found (env or .env.local), and no JSON file given.\n' +
        'Either:  $env:ANTHROPIC_API_KEY="sk-ant-..."; node scripts/apply-i18n.mjs\n' +
        'or:      node scripts/apply-i18n.mjs i18n.json   (a {"key":{"cs":..,"de":..}} file)');
      process.exit(1);
    }
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });
    byKey = {};
    for (const { id } of SECTIONS) {
      process.stdout.write(`Translating ${id} ... `);
      const lines = Object.entries(bySection[id]).map(([k, v]) => `${k}: ${v}`).join('\n');
      const msg = await client.messages.create({ model: MODEL, max_tokens: 8000, messages: [{ role: 'user', content: PROMPT_HEAD + lines }] });
      const text = msg.content.map(b => b.text || '').join('');
      const jm = text.match(/\{[\s\S]*\}/);
      Object.assign(byKey, JSON.parse(jm ? jm[0] : text));
      console.log('done');
    }
    writeFileSync('i18n.json', JSON.stringify(byKey, null, 2));
    console.log('Saved draft translations to i18n.json (review/replace anytime).');
  }

  // 3. wire the runtime translator into the page (idempotent)
  const TR = transpose(byKey);
  const a = html.indexOf(MARK_A);
  if (a >= 0) { const b = html.indexOf(MARK_B, a); if (b >= 0) html = html.slice(0, a) + html.slice(b + MARK_B.length); }
  html = html.replace('</body>', buildBlock(SRC, TR) + '\n</body>');
  writeFileSync(AGENTS, html);
  console.log(`Wired translations into ${AGENTS}.\nNext:  npm run build  →  npx playwright test languages-nav.spec.js --project=chromium`);
}

main().catch(e => { console.error(e); process.exit(1); });
