/**
 * tests/public-exposure.test.mjs - this repository is public: nothing new that should stay private may land in it.
 *
 * Every tracked text file is scanned for:
 *   - credentials: live Stripe keys, webhook secrets, Vercel Blob tokens, GitHub tokens, AWS keys, Resend keys,
 *     private keys and JSON web tokens (placeholders such as sk_live_... and test dummies do not match);
 *   - personal email addresses at consumer mail providers;
 *   - addresses of our Microsoft tenant: Dataverse environments, SharePoint sites, *.onmicrosoft.com;
 *   - local Windows user paths, outside the files listed in tests/public-exposure-baseline.json.
 * Product source (flow definitions, agent instructions and topics, AI prompts under scripts/cai-release/) is allowed
 * only where tests/public-exposure-baseline.json lists it: that list records what was already public on
 * 19 Nov 2026. Adding to it publishes more product source and needs the founder's written approval in the PR.
 *
 * The detectors are proven against planted samples in the first test, so a pattern that silently stops matching
 * fails here too.
 *
 * Usage: node --test tests/public-exposure.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BASELINE = JSON.parse(readFileSync(join(ROOT, 'tests/public-exposure-baseline.json'), 'utf8'));

export const DETECTORS = {
  stripe_live_key: /\b[sr]k_live_[0-9A-Za-z]{16,}/,
  stripe_webhook_secret: /\bwhsec_[0-9A-Za-z]{24,}/,
  vercel_blob_token: /\bvercel_blob_rw_[0-9A-Za-z_]{16,}/,
  github_token: /\b(gh[pousr]_[0-9A-Za-z]{30,}|github_pat_[0-9A-Za-z_]{30,})/,
  aws_access_key: /\bAKIA[0-9A-Z]{16}\b/,
  resend_key: /\bre_[0-9A-Za-z]{8,}_[0-9A-Za-z]{16,}/,
  private_key: /-----BEGIN (RSA |EC |OPENSSH |DSA |)PRIVATE KEY-----/,
  json_web_token: /\beyJ[0-9A-Za-z_-]{10,}\.eyJ[0-9A-Za-z_-]{10,}\.[0-9A-Za-z_-]{10,}/,
  personal_email: /\b[A-Za-z0-9._%+-]+@(gmail|googlemail|seznam|email|centrum|post|outlook|hotmail|live|yahoo|icloud|me|proton|protonmail)\.(com|cz|me)\b/i,
  dataverse_environment: /(?:^|[^A-Za-z0-9.-])[a-z0-9-]+\.crm\d*\.dynamics\.com(?=$|[^A-Za-z0-9.-])/i,
  sharepoint_site: /\b[a-z0-9-]+\.sharepoint\.com\b/i,
  tenant_domain: /\b[a-z0-9-]+\.onmicrosoft\.com\b/i,
  windows_user_path: /[A-Za-z]:\\{1,2}Users\\{1,2}[A-Za-z0-9._-]+/,
};

// Documentation examples Microsoft and others use in place of a real tenant.
const EXAMPLE_HOST = /^(https?:\/\/)?(contoso|fabrikam|example|yourtenant|yourcompany|your-tenant|tenant)[.-]/i;

const PRODUCT_SOURCE = /^scripts\/cai-release\/.*(\.(definition|clientdata)\.json|\.ya?ml|\/prompt[^/]*\.json)$/;

function trackedFiles() {
  return execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' }).split('\0').filter(Boolean);
}

function textOf(path) {
  const full = join(ROOT, path);
  let size;
  try { size = statSync(full).size; } catch { return null; } // deleted in the working tree
  if (size > 5 * 1024 * 1024) return null;
  const buf = readFileSync(full);
  if (buf.subarray(0, 8000).includes(0)) return null; // binary
  return buf.toString('utf8');
}

/** Every detector that matches the text, with the matching snippet shortened so a real secret is never printed whole. */
export function findings(text) {
  const out = [];
  for (const [name, re] of Object.entries(DETECTORS)) {
    const re_g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
    for (const m of text.matchAll(re_g)) {
      if (['dataverse_environment', 'sharepoint_site', 'tenant_domain'].includes(name) && EXAMPLE_HOST.test(m[0])) continue;
      out.push(`${name}: ${m[0].slice(0, 12)}…`);
      break;
    }
  }
  return out;
}

test('every detector matches its planted sample and ignores placeholders', () => {
  const planted = {
    stripe_live_key: 'STRIPE_SECRET_KEY=sk_live_' + 'a1B2c3D4e5F6g7H8i9J0',
    stripe_webhook_secret: 'whsec_' + 'A1b2C3d4E5f6G7h8I9j0K1l2M3',
    vercel_blob_token: 'vercel_blob_rw_' + 'AbCdEf0123456789_xyz',
    github_token: 'ghp_' + 'A'.repeat(36),
    aws_access_key: 'AKIA' + 'ABCDEFGHIJKLMNOP',
    resend_key: 're_' + 'AbCd1234_' + 'EfGh5678IjKl9012Mn',
    private_key: '-----BEGIN ' + 'PRIVATE KEY-----',
    json_web_token: 'eyJ' + 'hbGciOiJIUzI1NiJ9' + '.eyJ' + 'zdWIiOiIxMjM0NTYifQ' + '.' + 'SflKxwRJSMeKKF2QT4fw',
    personal_email: 'first.last' + '@gmail.com',
    dataverse_environment: 'https://org0000abcd' + '.crm17.dynamics.com/api',
    sharepoint_site: 'https://acmeprod' + '.sharepoint.com/sites/x',
    tenant_domain: 'admin@acmeprod' + '.onmicrosoft.com',
    windows_user_path: 'C:' + '\\\\Users\\\\someone\\\\Downloads',
  };
  for (const [name, sample] of Object.entries(planted)) {
    assert.ok(DETECTORS[name].test(sample), `${name} must match its planted sample`);
  }
  for (const harmless of ['STRIPE_SECRET_KEY=sk_live_...', "sk_live_x", 'whsec_LOCAL_TEST_HARNESS_DUMMY', 'hello@colleagueai.ai', 'buyer@example.com', 'https://contoso.sharepoint.com/sites/Contracts']) {
    assert.deepEqual(findings(harmless), [], `placeholder or company address must not match: ${harmless}`);
  }
});

test('no tracked file carries credentials, personal email addresses or tenant addresses', () => {
  const localPathFiles = new Set(BASELINE.localPathFiles);
  const problems = [];
  for (const path of trackedFiles()) {
    if (path === 'tests/public-exposure.test.mjs') continue; // the planted samples above
    const text = textOf(path);
    if (text === null) continue;
    for (const f of findings(text)) {
      if (f.startsWith('windows_user_path') && localPathFiles.has(path)) continue;
      problems.push(`${path}: ${f}`);
    }
  }
  assert.deepEqual(problems, [], 'remove these before merging; a credential that was pushed must also be rotated');
});

test('no product source beyond what was already public on 19 Nov 2026', () => {
  const allowed = new Set(BASELINE.productSources);
  const added = trackedFiles().filter((p) => PRODUCT_SOURCE.test(p) && !allowed.has(p));
  assert.deepEqual(added, [], 'new flow definitions, agent instructions or prompts belong in the private product repository; listing them in tests/public-exposure-baseline.json needs the founder\'s written approval');
  assert.ok(BASELINE.productSources.length > 0 && BASELINE.productSources.every((p) => PRODUCT_SOURCE.test(p)), 'the baseline lists only product-source paths');
});
