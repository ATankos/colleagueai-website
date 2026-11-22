# Schedules A–D to Instrument A / Přílohy A–D k Instrumentu A

> **UNSIGNED DRAFT / NEPODEPSANÝ NÁVRH, 22 Nov 2026.**
> - **Fixing the cut-off:** the cut-off commit below is a working cut-off. On the signing day, regenerate part 2 with
>   `node scripts/legal/schedule-a-inventory.mjs <signing-day commit>` and attach the output to both language versions.
> - **Author confirmation:** the Author confirms each line by initialling it on the signed copy. A line he does not
>   confirm moves to section D or is struck out.

## Part 1. Field / Obor

The development, licensing, delivery, support and marketing of governed AI agent packages for Microsoft 365 and Power
Platform, the CAI Score classification, and the ColleagueAI website, purchase, delivery and order-document systems.

*Vývoj, licencování, dodávání, podpora a marketing řízených balíčků AI agentů pro Microsoft 365 a Power Platform,
klasifikace CAI Score a webové stránky, nákupní, dodací a dokladové systémy ColleagueAI.*

## Part 2. Works by group, identified at the cut-off / Díla podle skupin k rozhodnému stavu

Cut-off commit: `dcaecd886824d3091574ff37d43b9a6910641356` (2026-11-22), repository `colleagueai-website`.

| # | Group | Paths (git tree hash at cut-off) | Files | Commits: author / of which with AI co-author trailer / AI assistant / tools |
|---|---|---|---|---|
| A1 | Website: pages in eight languages, styles, client scripts, structured data | `public` a83aa5902254<br>`src` 8396c07d6263<br>`index.html` 47ed137f204f | 442 | 429 / 14 / 50 / 7 |
| A2 | Commercial engine: checkout, acceptance, tax policy, invoicing, fulfilment, delivery, recovery, order documents | `api` ae33f2abc7f4<br>`lib` e8ec17990ebc<br>`config` bb1f13f567d6 | 54 | 57 / 6 / 69 / 4 |
| A3 | Tests, release gates, build, audit, validation and release tooling | `tests` 66134c54e52c<br>`scripts` b7351bee6340<br>`.github` 7a01d85ab703 | 214 | 274 / 29 / 109 / 14 |
| A4 | Contract Intelligence & Register product documentation, bundle texts and test fixtures | `docs/cai-l4-ci-001` 929a095b31e6 | 40 | 11 / 11 / 16 / 1 |
| A5 | Other documentation: runbooks, methods, legal drafts, inventories | `docs` 07c43b136ecf<br>(excluding `docs/cai-l4-ci-001`) | 38 | 13 / 4 / 34 / 7 |
| A8 | Brand artwork files | `public/logo.svg` 8512a2f4a515<br>`public/favicon.svg` 5c315cba59f1<br>`public/icons.svg` e9522193d9f7<br>`public/og-image.png` 541ecab83c14<br>`public/apple-touch-icon.png` e29e42804c27<br>`public/icon-192.png` 42a6e76c6f4f<br>`public/icon-512.png` ee8d19dee2b1 | 7 | 6 / 0 / 0 / 0 |

**A6/A7: Contract Intelligence & Register (CAI-L4-CI-001) managed solution and its agent instructions and prompts**

| Item | File | SHA-256 | Bytes |
|---|---|---|---|
| Managed solution 1.0.3.6 (agent, topics, instructions, prompts, 7 flows, 4 tables, 1 role) | `CAIContractIntelligence_1_0_3_6_managed.zip` | `cca6f657831a09d35e680a6cdc5be4eba329072ae918d76c1c2c8fa9dedad0f8` | 122951 |
| Release bundle 1.0.3.6 revision 3 (current) | `CAI-L4-CI-001_1.0.3.6-r3.zip` | `37a047c183bb3ff5ae33a5fefc59a6488ad84656720f5aaf19c14572473e051d` | 371721 |
| Release bundle 1.0.3.6 revision 1 | `CAI-L4-CI-001_1.0.3.6.zip` | `69b3067694fdb27952f66addae17b45836dddfd3965bae6f5e6fe2bdd25dbd50` | 368718 |
| Release bundle 1.0.3.6 revision 2 | `CAI-L4-CI-001_1.0.3.6-r2.zip` | `66639e7ffe1c41d9f403081f07655ff6587007726c8e965a9640601ae0fd9ac8` | 370005 |
| Earlier release 1.0.3.2 | `CAI-L4-CI-001_1.0.3.2.zip` | `48981310f518f3b2c866cefedad63f10c576eda8d6128c2527ce941888c0b23c` |  |
| Earlier release 1.0.3.4 | `CAI-L4-CI-001_1.0.3.4.zip` | `9de421b3b270315b061ac3be4d1a8dd2665059d358d7c451e1558bf97b792efa` | 341776 |

How to read the commit columns:
- They count commits by the Author's identities, by the AI assistant (sessions the Author ran), and by automated tools
  (dependabot, release bot, test harness).
- They are evidence of who changed what. They are not a legal finding of authorship.
- Dependency updates by dependabot change only third-party version pins (section C).
- Changes made by Copilot Autofix, if any, are third-party tooling output.

### Classification of the subject matter / Rozlišení předmětu

| Class | What falls in it | Treatment in Instrument A |
|---|---|---|
| Author's works (human creative contribution) | the Author's code, solution design, agent instructions and prompts, documentation, page texts and design, brand artwork, in groups A1–A8 | licensed (clause 2) |
| AI-assisted material | parts generated with Claude on the Author's instructions; protected to the extent of his selection, arrangement and editing | licensed to the extent rights exist (clause 8); no protection claimed for purely machine-generated parts |
| Company-controlled rights | the trade name "Colleague AI s.r.o.", the domain colleagueai.ai and the service accounts held by the company (no trade-mark registration is on record) | not licensed by the Author; held by the company. **To verify on the signing day:** which accounts (domain registrar, GitHub, Vercel, Stripe, Microsoft tenant) are in the company's name and which in a founder's |
| Third-party components | section C | not licensed by the Author |
| Unprotected subject matter | ideas, methods and concepts as such, including the CAI Score L1–L5 tier concept as an idea, the pricing model, business processes | not copyright works; Generic Know-how (clause 16) |
| Uncertain or not yet evidenced | catalogue copy and partner texts that Marek Těšitel may have contributed (see `instrument-b-assessment.md`); the brand concept (who devised the name and mark) | confirm on the signed copy, or move to section D |

## Part 3. Packages / Balíčky

The released packages and the managed solution are listed in part 2 (A6/A7) with their SHA-256. The agent instructions,
topics and extraction prompts are contained in the managed solution `CAIContractIntelligence_1_0_3_6_managed.zip`
(`botcomponents/cai_CAIContractIntelligenceAssistant.*`, `Workflows/CAICI-*`), identified by its SHA-256.

## Part 4. Prior rights / Dřívější práva

None known. The Author confirms on the signed copy that no agreement exists under which a third party holds rights in
the Works, in particular no author-to-holding-company licence, no employment and no commission.
- If one exists, it is listed here and its rights holder signs Instrument A as an additional party.
- Do not substitute a holding company as licensor without that document (A1).

---

## Accession Schedule form / Vzor přístupové přílohy (Schedule B / Příloha B)

> Přístupová příloha č. [n] k výhradní licenční smlouvě ze dne [datum] / Accession Schedule No. [n] to the Exclusive
> Licence Agreement of [date]
>
> 1. Připojená díla / Added works: repository `[name]`, commit `[full hash]` ([date]); paths and tree hashes: [list];
>    packages: [file name, version, SHA-256].
> 2. Odměna / Remuneration: [per clause 9: amount / royalty unchanged / no further remuneration, reason].
> 3. Prohlášení autora podle čl. 10.1 platí i pro připojená díla / The Author's representations in clause 10.1 apply to
>    the added works.
>
> Podpisy / Signatures: autor / Author ____ ; společnost / Company (Marek Těšitel, jednatel) ____ ; datum / date ____

## Section C. Third-party components (not licensed by the Author) / Složky třetích osob

| Component | Where | Licence / basis | Notes |
|---|---|---|---|
| Open-source npm packages of the website and server functions | `package-lock.json`; inventory `docs/legal/third-party-licences.md` (61 production packages, all permissive) | their own licences | not delivered to customers in the agent bundle |
| Microsoft Power Platform, Dataverse, Copilot Studio, Teams and SharePoint connectors | referenced by the managed solution (`shared_commondataserviceforapps`, `shared_sharepointonline`, `shared_teams`) | Microsoft, licensed to the customer under its own agreement | not contained in the bundle as code |
| DejaVu Sans, DejaVu Sans Bold, DejaVu Sans Mono fonts (embedded subsets in order PDFs and bundle PDFs) | `lib/fonts/`, `DOSSIER.pdf`, `INSTALL.pdf`, `START-HERE.pdf` | Bitstream Vera / DejaVu licence (embedding permitted) | |
| Inter font (embedded subsets in `INSTALL.pdf`, `START-HERE.pdf`) | bundle PDFs | SIL Open Font License 1.1 (embedding in documents permitted) | added to the inventory by this change |
| Services: Stripe, Vercel, Upstash, Resend, Sentry, Plausible | operation of the website | provider terms | services, not licensed code |

## Section D. Excluded works / Vyloučená díla

| Work | Why excluded | Until |
|---|---|---|
| **Operations Procedures Assistant** (IFSA Agent Factory, Agent 1) | created by IFSA students; no rights chain documented (`docs/legal/restricted-works.md`) | each contributing student signs a licence and IFSA's position is on file |
| **Service Review Pack Builder** (IFSA Agent Factory, Agent 2) | created by IFSA students; no rights chain documented (`docs/legal/restricted-works.md`) | each contributing student signs a licence and IFSA's position is on file |
| Risk Event Capture and any other IFSA Agent Factory output | created by IFSA students; no rights chain documented | as above |
| Works of Marek Těšitel | not licensed by the Author; see `instrument-b-assessment.md` | Instrument B, if needed |
| Works of any contractor or other third party not listed | not licensed by the Author | a separate licence |
