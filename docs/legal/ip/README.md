# IP rights to Colleague AI products: instruments and status (22 Nov 2026)

**The core logic:**
1. The company sells licences to software that Alexandr Tankos authored.
2. Czech copyright cannot be transferred, so the company needs a **written exclusive licence** from him with the right
   to sublicense: Instrument A.
3. Until it is signed, the company cannot show the rights its customer Licence states (§4(a)). Sale stays blocked by
   gate L-IP and by the validator's IP check.
4. Equity is a separate matter. Nothing here touches shares.

Statutory points used (verified 22 Nov 2026 against the statutory text on BusinessCenter.cz):
- **Civil Code:**
  - written form for an exclusive licence (§ 2358(2)(a));
  - exclusivity (§ 2360);
  - sublicence only if agreed (§ 2363);
  - assignment of the licence only with the author's written consent (§ 2364);
  - remuneration, statements and inspection (§ 2366);
  - known methods of use only (§ 2372);
  - lump sum only where justified, and mandatory additional remuneration (§ 2374);
  - yearly information duty (§ 2374a);
  - consent to alterations (§ 2375);
  - scope presumptions of Czech territory and one year, unless agreed otherwise (§ 2376);
  - withdrawal for non-use after two years (§§ 2378–2381);
  - withdrawal for change of conviction (§ 2382);
  - succession (§ 2383).
- **Copyright Act:** works of members of statutory bodies (§ 58(10)); commissioned works (§ 61).
- **Business Corporations Act:** §§ 12, 13, 54–57.

Counsel confirms against the official text and case law before signature.

## Documents

| File | What it is |
|---|---|
| `instrument-a.cs.md` | Instrument A, Czech execution version (controlling text proposed) |
| `instrument-a.en.md` | English reference translation; same numbering, definitions and schedules |
| `schedule-a.md` | Schedules A–D: Field; works with cut-off commit and tree hashes; packages with SHA-256; classification; Accession Schedule form; third-party components; excluded works (IFSA student products) |
| `instrument-b-assessment.md` | why no Instrument B is prepared; Marek Těšitel's declaration template; § 58(10) AZ and § 13 ZOK |
| `corporate-authority-checklist.md` | signing-day checks; statutory items separated from recommended governance |
| `remuneration-options.md` | fixed fee / royalty / gratuitous, and their consequences for founder and accountant decision |
| `../evidence/README.md` | private storage, fingerprints, the two follow-up PRs |
| `../restricted-works.md` | IFSA student products and what clears them |
| `../customer-documents-reconciliation-2026-11-22.md` | customer texts against these instruments |
| `../../../scripts/legal/schedule-a-inventory.mjs` | regenerates Schedule A part 2 for the signing-day commit |

## Readiness A1–A7

| # | Item | Status | What is still needed |
|---|---|---|---|
| A1 | Licensor: Alexandr Tankos personally; no holding substituted | **Prepared, awaiting evidence** | his written confirmation on the signed copy that no prior agreement (employment, commission, holding) covers the works (clause 10.1, Schedule A part 4) |
| A2 | Instrument B | **Prepared, awaiting evidence** (not needed on the repository evidence) | Marek's signed declaration; Instrument B only for works he lists outside § 58(10) |
| A3 | Corporate authority and conflicts | **Prepared, awaiting evidence / legal decision** | signing-day extract; founders' statement on their relationship (§ 55(1) ZOK); counsel on documenting a § 55 notice where the director is the sole shareholder |
| A4 | Remuneration | **Awaiting decision** | founders choose A/B/C; accountant's note |
| A5 | Language | **Awaiting legal decision** | counsel approves the controlling-language clause 20.2 |
| A6 | Execution formalities | **Prepared** | counsel approves the signature form (21.2); then signing and the evidence record |
| A7 | Schedule and cut-off | **Prepared** | regenerate part 2 at the signing-day commit; the Author initials each line |

Nothing here is signed or approved. `config/agents/contract-intelligence-and-register.json` stays `ip.status:
"unsigned"`. It changes only in a separate PR after the evidence record is verified (`../evidence/README.md`, step 6).
