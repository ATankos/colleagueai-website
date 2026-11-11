# Third-party licences

Generated 2026-11-10 from `package-lock.json` by `node scripts/legal/licence-inventory.mjs`. Regenerate after dependency changes.

This lists the open-source packages that ship with the website and its server functions (checkout, webhook, delivery). Build and test tools are not distributed and are not listed. **55 packages:** Apache-2.0 9, MIT 42, Unlicense 1, ISC 3. All are permissive licences; none is copyleft. `tests/licence-inventory.test.mjs` fails if a production package arrives under any other licence, or under none.

Permissive licences still carry conditions, chiefly keeping the copyright and licence notice with copies of the code. The website ships these packages bundled or as server dependencies and does not redistribute them to customers as source. Whether a notices file must be published with the site is a question for counsel (see the counsel pack).

## Not covered by this list

- **The agent packages sold to customers** (Power Platform managed solutions such as `CAI-L4-CI-001`). They are built from Microsoft Power Platform components by Colleague AI and are delivered as a managed solution; this inventory does not inspect them. Their own dependency review is part of the counsel and audit packs.
- **Microsoft services the packages run on** (Power Platform, Dataverse, Copilot Studio, and any AI capabilities a package uses). The customer licenses these from Microsoft under Microsoft's terms and pays Microsoft for their use; they are not supplied or resold by Colleague AI.
- **Online services the website uses**: Stripe (payments, tax ID verification, invoices when enabled), Vercel (hosting and file storage), Upstash (key-value records), Sentry (error reports) and the analytics named in the Privacy Policy. These are services under their providers' terms, not licensed code.

## Packages

| Package | Version | Licence | Dependency |
| --- | --- | --- | --- |
| @anthropic-ai/sdk | 1.6.0 | Apache-2.0 | direct |
| @sentry/react | 11.11.0 | MIT | direct |
| @vercel/analytics | 2.0.1 | MIT | direct |
| @vercel/blob | 2.8.2 | Apache-2.0 | direct |
| @vercel/speed-insights | 2.1.0 | Apache-2.0 | direct |
| aws4fetch | 1.0.20 | MIT | direct |
| react | 19.3.1 | MIT | direct |
| react-dom | 19.3.1 | MIT | direct |
| stripe | 23.1.0 | MIT | direct |
| @babel/runtime | 7.29.2 | MIT | transitive |
| @opentelemetry/api | 1.9.1 | Apache-2.0 | transitive |
| @sentry/browser | 11.11.0 | MIT | transitive |
| @sentry/browser-utils | 11.11.0 | MIT | transitive |
| @sentry/conventions | 0.30.0 | MIT | transitive |
| @sentry/core | 11.11.0 | MIT | transitive |
| @sentry/feedback | 11.11.0 | MIT | transitive |
| @sentry/replay | 11.11.0 | MIT | transitive |
| @sentry/replay-canvas | 11.11.0 | MIT | transitive |
| @stablelib/base64 | 1.0.1 | MIT | transitive |
| @vercel/cli-config | 0.3.1 | Apache-2.0 | transitive |
| @vercel/cli-exec | 1.0.1 | Apache-2.0 | transitive |
| @vercel/oidc | 3.8.10 | Apache-2.0 | transitive |
| async-retry | 1.3.3 | MIT | transitive |
| cross-spawn | 7.0.6 | MIT | transitive |
| execa | 5.1.1 | MIT | transitive |
| fast-sha256 | 1.3.0 | Unlicense | transitive |
| get-stream | 6.0.1 | MIT | transitive |
| human-signals | 2.1.0 | Apache-2.0 | transitive |
| is-buffer | 2.0.5 | MIT | transitive |
| is-node-process | 1.2.0 | MIT | transitive |
| is-stream | 2.0.1 | MIT | transitive |
| isexe | 2.0.0 | ISC | transitive |
| jose | 5.10.0 | MIT | transitive |
| json-schema-to-ts | 3.1.1 | MIT | transitive |
| merge-stream | 2.0.0 | MIT | transitive |
| mimic-fn | 2.1.0 | MIT | transitive |
| npm-run-path | 4.0.1 | MIT | transitive |
| onetime | 5.1.2 | MIT | transitive |
| os-paths | 4.4.0 | MIT | transitive |
| path-key | 3.1.1 | MIT | transitive |
| retry | 0.13.1 | MIT | transitive |
| scheduler | 0.28.0 | MIT | transitive |
| shebang-command | 2.0.0 | MIT | transitive |
| shebang-regex | 3.0.0 | MIT | transitive |
| signal-exit | 3.0.7 | ISC | transitive |
| standardwebhooks | 1.0.0 | MIT | transitive |
| strip-final-newline | 2.0.0 | MIT | transitive |
| throttleit | 2.1.0 | MIT | transitive |
| ts-algebra | 2.0.0 | MIT | transitive |
| undici | 6.29.1 | MIT | transitive |
| web-vitals | 6.2.3 | Apache-2.0 | transitive |
| which | 2.0.2 | ISC | transitive |
| xdg-app-paths | 5.5.1 | MIT | transitive |
| xdg-portable | 7.3.0 | MIT | transitive |
| zod | 4.6.7 | MIT | transitive |
