// fix-usage.cjs — fix remaining CTA issues in public/usage.html
const fs = require('fs');
const path = require('path');
const p = path.join(process.cwd(), 'public/usage.html');
let t = fs.readFileSync(p, 'utf8');
let n = 0;

const fixes = [
  [
    '<a class="d-try" href="/demo" data-i18n="nav_try">See it live</a>',
    '<a class="d-try" href="/contact" data-i18n="nav_try">Request a demo</a>'
  ],
  [
    '<a href="https://www.colleagueai.ai/demo" id="hero-call-link" target="_blank" rel="noopener" class="btn-p" data-i18n="usage_cta">See the Token Monitor in a live demo &rarr;</a>',
    '<a href="https://www.colleagueai.ai/demo" id="hero-call-link" target="_blank" rel="noopener" class="btn-p" data-i18n="usage_cta">Request access to the Token Monitor &rarr;</a>'
  ],
];

for (const [oldS, newS] of fixes) {
  if (t.includes(oldS)) {
    t = t.split(oldS).join(newS);
    console.log('OK: replaced', oldS.slice(0, 60), '...');
    n++;
  } else {
    console.log('SKIP: not found', oldS.slice(0, 60), '...');
  }
}

if (n > 0) {
  fs.writeFileSync(p, t, 'utf8');
  console.log(`\nApplied ${n} fix(es) to public/usage.html`);
} else {
  console.log('\nNo changes needed.');
}

// Verify
const after = fs.readFileSync(p, 'utf8');
console.log('\nVerification:');
console.log('- "See it live" remaining:', (after.match(/See it live/g) || []).length);
console.log('- "See the Token Monitor in a live" remaining:', (after.match(/See the Token Monitor in a live/g) || []).length);
