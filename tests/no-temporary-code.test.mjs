/**
 * tests/no-temporary-code.test.mjs - test-only code cannot reach main.
 *
 * On 11 Nov 2026 a read-only records page written for the sandbox acceptance test (api/sandbox-inspect.js, marked
 * "never merge") was merged to main with its branch. It answered 404 everywhere except a Preview of the `sandbox`
 * branch, so nothing was exposed, but main must not carry it. This test fails CI if it, or anything like it, returns:
 *
 * - no shipped server code (api/, lib/) carries a do-not-merge marker;
 * - no serverless function or library decides what to do by git branch name (VERCEL_GIT_COMMIT_REF): behaviour is set
 *   by the environment (VERCEL_ENV) and by named environment variables, never by which branch was deployed.
 * Usage: node --test tests/no-temporary-code.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SHIPPED = ['api', 'lib'];
const CODE = /\.(c|m)?[jt]s$/;

function codeFiles(dir) {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return [];
  const out = [];
  for (const name of readdirSync(abs)) {
    const p = join(abs, name);
    if (statSync(p).isDirectory()) out.push(...codeFiles(relative(ROOT, p)));
    else if (CODE.test(name)) out.push(relative(ROOT, p));
  }
  return out;
}

const FILES = SHIPPED.flatMap(codeFiles);

test('there is shipped server code to check', () => {
  assert.ok(FILES.some((f) => f.startsWith('api/')), 'api/ has functions');
  assert.ok(FILES.some((f) => f.startsWith('lib/')), 'lib/ has modules');
});

test('no shipped server file is marked as never to be merged', () => {
  const marked = FILES.filter((f) => /NEVER MERGE|DO NOT MERGE|DO-NOT-MERGE/.test(readFileSync(join(ROOT, f), 'utf8')));
  assert.deepEqual(marked, [], 'test-only files belong on their test branch; remove them from main');
});

test('no shipped server code switches on the git branch that was deployed', () => {
  const byBranch = FILES.filter((f) => readFileSync(join(ROOT, f), 'utf8').includes('VERCEL_GIT_COMMIT_REF'));
  assert.deepEqual(byBranch, [], 'use VERCEL_ENV and named, scoped environment variables instead of branch names');
});

test('the sandbox acceptance records page is gone', () => {
  assert.equal(existsSync(join(ROOT, 'api/sandbox-inspect.js')), false);
});
