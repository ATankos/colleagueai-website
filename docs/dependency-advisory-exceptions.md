# Accepted dependency advisories (temporary exceptions)

**Status:** accepted temporarily by the owner on 2026-11-07 (option C in the review: accept the four moderate development-only advisories, document them, and schedule a separate tested update).

**Review date:** 2026-12-07 (proposed; the owner confirms or changes it).

## The four advisories

All four come from one advisory, GHSA-g3hv-75wg-m249: a denial of service through specially crafted glob patterns in `minimatch`, fixed in 11.0.1. The vulnerable `minimatch` 10.2.6 is pinned by the eslint 10 toolchain.

| Package | Installed | Why it is flagged | Path to `minimatch` |
|---|---|---|---|
| `minimatch` | 10.2.6 | the vulnerable package (range 7.0.0 to 11.0.0) | required by `eslint` (`^10.2.6`) and by `@eslint/config-array` (`^10.2.4`) |
| `@eslint/config-array` | 0.23.5 | depends on the vulnerable `minimatch` | required by `eslint` (`^0.23.5`) |
| `eslint` | 10.14.0 | depends on the vulnerable `minimatch` and `@eslint/config-array` | devDependency (`^10.14.0`) |
| `@eslint/js` | 10.0.1 | lists `eslint` as an optional peer dependency, so npm audit flags it | devDependency (`^10.0.1`) |

## Why these are development-only

Checked on 2026-11-07 on branch `fix/dependency-advisories`:

- `npm ls minimatch eslint @eslint/js @eslint/config-array --omit=dev` is empty: none of the four is in the production dependency tree.
- `npm audit --omit=dev` reports 0 vulnerabilities.
- No file under `api/`, `lib/` or `src/` imports `eslint`, `minimatch` or `@eslint/*`.
- The built output in `dist/` contains neither the string `eslint` nor the string `minimatch`.
- `eslint` and `@eslint/js` are listed under `devDependencies` only.

The lint glob patterns come from this repository (`eslint .`), not from user input, so the practical exposure is low. At the time of writing, `npm run lint` is not part of CI; a separate draft change adds it.

## Planned fix (separate change, tested before merge)

- **A.** Move `eslint` and `@eslint/js` to 9.39.5. This is the fix that `npm audit fix --force` proposes. It is a major downgrade of the lint toolchain.
- **B.** Keep eslint 10 and add an override that forces `minimatch` to `>=11.0.1`. This changes eslint's own dependency and has not been tested.

Either way, run `npm run lint`, the build and the CI gates before merging. Then remove this file and the exceptions in it.

## Removal criteria

Remove this file when `npm audit` reports no moderate or higher advisory for these packages.
