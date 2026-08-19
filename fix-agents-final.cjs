// fix-agents-final.js — apply all remaining QA fixes
const fs = require('fs');
const path = require('path');
const ROOT = process.cwd();

function fix(relPath, old, neu) {
  const p = path.join(ROOT, relPath);
  let t = fs.readFileSync(p, 'utf8');
  if (!t.includes(old)) {
    console.log('SKIP:', relPath, JSON.stringify(old.slice(0, 50)));
    return false;
  }
  fs.writeFileSync(p, t.split(old).join(neu), 'utf8');
  console.log('OK:', relPath);
  return true;
}

// 1. Remove proof placeholder section from agents.html
console.log('\n=== Removing proof placeholder section ===');
{
  const p = path.join(ROOT, 'public/agents.html');
  let t = fs.readFileSync(p, 'utf8');
  const start = t.indexOf('<section id="proof" class="proof-sec"');
  const end = t.indexOf('<section id="proof-demo"');
  if (start >= 0 && end > start) {
    t = t.slice(0, start) + t.slice(end);
    fs.writeFileSync(p, t, 'utf8');
    console.log('OK: proof placeholder section removed');
  } else if (start < 0) {
    console.log('SKIP: proof section already removed');
  } else {
    console.log('ERROR: found proof but not proof-demo');
  }
}

// 2. Fix i18n keys in agents.html — all 8 locales
console.log('\n=== Fixing agents.html i18n keys ===');
const agentsI18n = [
  ['"nav_try":"See it live"', '"nav_try":"Request a demo"'],
  ['"nav_try":"Vyzkoušet živě"', '"nav_try":"Vyžádat demo"'],
  ['"nav_try":"Live ausprobieren"', '"nav_try":"Demo anfragen"'],
  ['"nav_try":"Essayer en direct"', '"nav_try":"Demander une démo"'],
  ['"nav_try":"Probar en vivo"', '"nav_try":"Solicitar una demo"'],
  ['"nav_try":"Prova dal vivo"', '"nav_try":"Richiedi una demo"'],
  ['"nav_try":"Experimentar ao vivo"', '"nav_try":"Solicitar uma demo"'],
  ['"nav_try":"Wypróbuj na żywo"', '"nav_try":"Poproś o demo"'],
  ['"dr_demo":"See it in a live demo →"', '"dr_demo":"Request a demo →"'],
  ['"dr_demo":"Zobrazit v živé ukázce →"', '"dr_demo":"Vyžádat demo →"'],
  ['"dr_demo":"In einer Live-Demo ansehen →"', '"dr_demo":"Demo anfragen →"'],
  ['"dr_demo":"Le voir en démo en direct →"', '"dr_demo":"Demander une démo →"'],
  ['"dr_demo":"Verlo en una demo en vivo →"', '"dr_demo":"Solicitar una demo →"'],
  ['"dr_demo":"Vedilo in una demo dal vivo →"', '"dr_demo":"Richiedi una demo →"'],
  ['"dr_demo":"Ver numa demonstração ao vivo →"', '"dr_demo":"Solicitar uma demo →"'],
  ['"dr_demo":"Zobacz na żywym demie →"', '"dr_demo":"Poproś o demo →"'],
  ['"usage_cta":"See the Token Monitor in a live demo →"', '"usage_cta":"Request access to the Token Monitor →"'],
  ['"usage_cta":"Podívejte se na Token Monitor v živém demu →"', '"usage_cta":"Požádejte o přístup k Token Monitoru →"'],
  ['"usage_cta":"Erleben Sie den Token-Monitor in einer Live-Demo →"', '"usage_cta":"Zugang zum Token-Monitor anfragen →"'],
  ['"usage_cta":"Découvrez le Token Monitor en démo live →"', '"usage_cta":"Demander l’accès au Token Monitor →"'],
  ['"usage_cta":"Vea el Token Monitor en una demo en vivo →"', '"usage_cta":"Solicitar acceso al Token Monitor →"'],
  ['"usage_cta":"Scopri il Token Monitor in una demo live →"', '"usage_cta":"Richiedi accesso al Token Monitor →"'],
  ['"usage_cta":"Veja o Token Monitor numa demo ao vivo →"', '"usage_cta":"Solicitar acesso ao Token Monitor →"'],
  ['"usage_cta":"Zobacz Token Monitor na żywo w demo →"', '"usage_cta":"Poproś o dostęp do Token Monitor →"'],
];
for (const [old, neu] of agentsI18n) fix('public/agents.html', old, neu);

// 3. Fix mobile nav and drawer hrefs in agents.html
console.log('\n=== Fixing agents.html hrefs ===');
fix('public/agents.html',
  'href="/demo" data-i18n="nav_try">See it live</a>',
  'href="/contact" data-i18n="nav_try">Request a demo</a>');
fix('public/agents.html',
  'href="https://www.colleagueai.ai/demo" target="_blank" rel="noopener" data-i18n="dr_demo">See it in a live demo →</a>',
  'href="/contact" data-i18n="dr_demo">Request a demo →</a>');

// 4. Fix score.html
console.log('\n=== Fixing score.html ===');
fix('public/score.html', '"nav_try":"See it live"', '"nav_try":"Request a demo"');
fix('public/score.html', '"dr_demo":"See it in a live demo →"', '"dr_demo":"Request a demo →"');
fix('public/score.html',
  'href="/demo" data-i18n="nav_try">See it live</a>',
  'href="/contact" data-i18n="nav_try">Request a demo</a>');

// 5. Verification
console.log('\n=== Verification ===');
const agents = fs.readFileSync('public/agents.html', 'utf8');
const pCount = (agents.match(/PLACEHOLDER/g) || []).length;
const seeCount = (agents.match(/"See it live"/g) || []).length;
const liveCount = (agents.match(/live demo/gi) || []).length;
console.log('PLACEHOLDERs remaining:', pCount);
console.log('"See it live" remaining:', seeCount);
console.log('"live demo" remaining:', liveCount);
if (pCount === 0 && seeCount === 0 && liveCount === 0) {
  console.log('\nAll fixes applied successfully!');
} else {
  console.log('\nWARNING: Some fixes may not have applied.');
}
