# Company IP rights: what is documented, what is missing (20 November 2026)

**Status: review for counsel. Nothing here is a legal conclusion, nothing is signed, and nothing here approves any right.** Correction of 21 Nov 2026: the Commercial Register shows Marek Těšitel as sole managing director and sole shareholder (100 %); no registered 50/50 ownership is assumed. Equity is a separate question from the authors' rights reviewed here; see `ip-licence-agreement-DRAFT.md` Part 0 and Part C.

## 1. The question

Does Colleague AI s.r.o. (IČO 29540852) hold documented commercial rights to sell the ColleagueAI Contract Intelligence & Register package (CAI-L4-CI-001) and to operate colleagueai.ai — i.e. can it grant the licence that `public/license.html` §4 ("All IP in the software, agents, blueprints and CAI Score remains with Colleague AI") and the licence agreement confirmation PDF assert?

## 2. What the record shows (facts, from the repository and the founder's statements)

| Work | Where it is | Who created it (as the record shows) | Instrument transferring or licensing it to the company |
|---|---|---|---|
| Website, purchase and delivery code (`colleagueai-website`, 813 tracked files, May–Nov 2026) | GitHub repository `ATankos/colleagueai-website` (a personal GitHub account, not an organisation) | Commits by the technical co-founder under personal identities (1,131), by Claude running on his instruction (94), by dependabot (59), by the release bot (9) | **None found in the repository.** No contributor agreement, no assignment, no licence file naming the company as owner. |
| Product source: Power Platform solution (4 tables, 7 flows, 1 role, Copilot Studio agent, topics), release scripts, dossier | `scripts/cai-release/…`, the managed solution exported from the CAI-LAB environment of the company's Microsoft tenant | Built by the technical co-founder with Claude end to end (founder's statement, 20 Nov); authored inside the company tenant | **None found.** Authoring inside the company tenant does not by itself transfer copyright under Czech law (see §3). |
| Agent instructions and prompts (Copilot Studio instructions, topic text, the extraction prompt) | Inside the solution; listed in `tests/public-exposure-baseline.json` as product source already public | Same | None found. |
| Documentation sold with the product (START-HERE, INSTALL, dossier, bundle texts) | `docs/cai-l4-ci-001/…` | Same | None found. |
| Customer-facing legal texts (Terms, Licence, Refund, Privacy) and their archive | `public/*.html`, `legal/archive/` | Drafted by the founders with Claude; counsel review pending (PR #532) | n/a (the company publishes them in its own name) |
| Brand: name "ColleagueAI", logo, "CAI Score", tier names | Site assets | Founders | No trade-mark filing is recorded in the repository; whether one exists is a founder question. |
| Third-party code shipped with the site | `docs/legal/third-party-licences.md` (61 packages, all permissive; DejaVu fonts under the Bitstream Vera licence) | Third parties | Open-source licences; notices kept. Not a company ownership question. |
| IFSA student project ("Agent Factory") | Separate repositories and tenant environments | Students | **Outside this review**: those agents are not sold; the student agreement is its own question. CAI-L4-CI-001 was built separately from the student project (founder's statement). |

## 3. Why an instrument is needed (for counsel to confirm)

- Under the Czech Copyright Act (zák. č. 121/2000 Sb.), copyright in a work created by a natural person stays with the author; it is **not assignable** (§ 26). A company obtains the right to use a work either as an **employee work** (§ 58, the employer exercises the economic rights to works created in the performance of employment duties) or by a **licence** (§ 2358 et seq. of the Civil Code), which can be exclusive and for the full term.
- A managing director (*jednatel*) acting as the company's statutory body is not, by that function alone, an employee creating employee works. Unless there is an employment or a specific agreement, the founders personally hold the copyright in what they wrote, and the company holds no documented right to license it onward.
- The AI-assisted parts: text and code generated with Claude on the founder's instructions are, as we understand it, attributable to the person who directed and selected them for copyright purposes where they qualify as works at all; counsel is asked whether anything further is needed (Anthropic's commercial terms assign output rights to the customer, as far as we read them; **[counsel to verify the applicable terms and version]**).
- The holding company: if the founders' arrangement routes their work through a holding s.r.o. (the founder's description), the chain may need two links: author → holding (if the holding is the contracting party) → Colleague AI s.r.o. **[founder to state which entity each founder works through]**.

**Conclusion of the review:** the company has the works in its possession and operates them, but **no written instrument documents its right to license CAI-L4-CI-001 and the website code to customers.** That instrument is the missing item for the first sale (gate G2 in the Implementation Report).

## 4. The missing instrument — prepared for signature

`docs/legal/ip-licence-agreement-DRAFT.md`: an **exclusive licence agreement** (not an assignment, which Czech law does not permit for copyright) from each author to Colleague AI s.r.o., with the inventory above as its schedule, for the full term of protection, all territories, all uses including sublicensing to customers and partners, with the right to modify, the author's undertaking not to exercise the licensed rights himself, a moral-rights accommodation, and consideration. It is **unsigned** and must be reviewed by counsel before anyone signs it; the questions for counsel are at its end.

## 5. What is deliberately kept separate

- This instrument is internal (author → company). The customer licence (`/license`) and the per-order agreement confirmation are separate documents and are not changed by it.
- Equity, profit sharing and the holding structure are not touched.
- Trade-mark filing, if the founders want one, is a separate decision.

## 6. Founder actions

1. State for each founder which entity (personally or a holding s.r.o.) they create works through.
2. Send `ip-licence-agreement-DRAFT.md` with this review to counsel (part of the counsel pack).
3. After counsel's changes: both authors sign; the signed PDF is filed in the Release evidence library and its reference recorded in the Implementation Report (G2). Nothing in the code or on the site changes.
