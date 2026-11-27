# Video integration: review record and publication readiness (27 Nov 2026)

Branch `feat/video-integration`. Four videos were delivered on 27 Nov 2026. All four were reviewed in full:

- **Narration:** transcribed with Whisper small.en and voice-activity segmentation.
- **Burned captions and on-screen text:** read frame by frame at 2 frames per second.
- **Disputed lines:** re-transcribed in isolation.

Every material claim was checked against release 1.0.3.6 (`INSTALL.md` in bundle r3), the website, and the Continuous Certification positioning rules (`docs/continuous-certification/website-positioning-v1.0.md`).

## 1. Decision

| Video | File, duration | Decision | Why |
|---|---|---|---|
| Corporate introduction | `06_Firemni_video_v11.mp4`, 1:09 | **Ready for founder approval** | No false or unsupported claim. Two framing points need the founder's acceptance (§3). |
| Contract Intelligence & Register product | `01_Produktove_video.mp4`, 1:13 | **HELD, needs a corrected master** | Two narration lines contradict release 1.0.3.6's own safety wording; a glyph is missing on two slides (§2.2). |
| Installation guide | `05_Instalacni_pruvodce_v3_bezne_tempo.mp4`, 3:07 | **Ready for founder approval** | Every step matches INSTALL.pdf. Two reconciliations are handled in the on-page disclosure (§3). |
| Continuous Certification | `08_Continuous_Certification_EMAIL.mp4`, 1:00 | **Ready for founder (and counsel) approval** | Disclosures are complete on screen. One wording point is for counsel (§3). |

Nothing is published by this branch. Status on 27 Nov 2026: **product HELD; corporate, installation and certification PENDING formal approval.**

**Recommendations to the founder (27 Nov, 23:00):**

| Video | Recommendation | Conditions that stay attached |
|---|---|---|
| Corporate introduction | **Recommend publication** | The on-page disclosure: every agent is Coming soon, Contract Intelligence & Register is the first; the duplicate-invoice scene is an illustrative example, not a released agent. |
| Installation guide | **Ready for approval.** The spoken safety instruction is confirmed as "Do not publish the agent during installation" (§2.3). | The on-page disclosure: plan 60–90 minutes in total (the video's 20–30 minutes assume every prerequisite is in place); turn Daily recompute on at go-live (INSTALL.pdf, section 5). |
| Continuous Certification | **Pending counsel approval** of "ISO standards" as proposed coverage and the programme objectives | Coming soon; proprietary programme, not independent regulatory accreditation |
| Product | **HELD** until the corrected master arrives (§2.2) | A new master requires a new checksum and a fresh review |

Every approval remains bound to the file's SHA-256 and to a real `publishedOn` date (§1.2). Unapproved files stay out of the build (§1.1). All seven translations still need native-language review (§6); publishing before that review is a founder decision.

### 1.1 Publication gate (page and asset level)
A video is rendered, and its files are served, only when **every** condition holds (`approved()` in `scripts/lib/videos.cjs`):

1. its status is not `held`;
2. `approvedBy` is set and `approvedOn` is an ISO date;
3. all eight caption tracks exist;
4. `approvedSha256` equals `master.sha256` **and** the SHA-256 of the file actually in `media/` at build time;
5. `publishedOn` is set, not earlier than `approvedOn` and not later than the build date.

- **Pages:** an unapproved video produces no player, no card and no `VideoObject`.
- **Assets:** source files live in `media/`, which is never served. `scripts/publish-media.cjs` copies only the files of renderable videos into `dist/media`, and re-hashes each copied video. Unapproved MP4s, posters, VTT subtitles and transcripts are therefore **absent from a Production build**, not merely unlinked.
- **Checksum binding:** an approval names one exact file. Replacing a master without a new review changes its SHA-256, so `approved()` returns false and `publish-media` **fails the build** ("approval mismatch") rather than serving the replacement or silently dropping the video.
- **Review Preview:** `CAI_VIDEO_PREVIEW=1` is honoured only when `VERCEL_ENV` is not `production`. It is scoped to Preview for `feat/video-integration` and shows pending videos behind a "pending approval" banner, without `VideoObject`. A held video never renders, even in Preview.

Verified on the combined release candidate (§9): the Production-mode build reports `0 media file(s) published` and `video blocks on 0 page(s)`; all 33 media URLs return 404; no video trace appears in any of the 371 built files.

### 1.2 To publish one video (founder, in a reviewed PR)
1. Confirm the file reviewed is the one in `media/` (`sha256sum`), and that it matches `master.sha256` in `config/media.json`.
2. Set `approvedBy`, `approvedOn` (ISO date) and `approvedSha256` (that checksum).
3. Set `publishedOn` to the **actual** date the PR is merged and deployed. It becomes `uploadDate` in the structured data. A future date keeps the video hidden until that day's build.
4. A different master requires a new file name, a new `master.sha256`, and a fresh approval.

## 2. Content validation

### 2.1 Corporate introduction (no burned captions; AI-generated imagery)
| Claim | Source / check | Result |
|---|---|---|
| "AI agents: software that carries out defined business tasks … with rules and human oversight" | Product and governance model | Supported |
| "Agents support finance, operations, risk, compliance and legal work" | Catalogue: 36 planned agents, all Coming soon | **Framing**: present tense across domains, but no agent is available. The on-page disclosure states "Every agent is coming soon; Contract Intelligence & Register is the first". |
| Finance review / possible duplicate invoice (0:16–0:25, 0:39–0:48) | Labelled in the video "Illustrative example · possible duplicate invoice" | Illustrative, not a released agent. The disclosure repeats this. |
| "Works inside your Microsoft environment … only the information it is allowed to access. Your business data stays within your organisation" | Founder decision of 10 Nov (customer data stays in the customer environment); INSTALL §2 (agent reads with each user's own sign-in) | Supported |
| "Each action and approval is recorded" | Review log, Job runs, approval record | Supported for the flagship; generic for the catalogue |

### 2.2 Product video (burned captions; AI-generated presenter, labelled)
| Claim | Source / check | Result |
|---|---|---|
| 16.7 s "extracts the key terms **with a quote to the source**" | INSTALL §9a: "Everything on the card is the AI's reading of the document, including the text in quotation marks. The excerpts are not copied from the file and are not checked against it." Release 1.0.3.6 changed the wording precisely to stop presenting excerpts as verbatim quotations. | **Conflict** |
| 28.1 s "the notice period **exactly as written**, **every** notice clause found in the document"; on screen "Every notice clause found" | INSTALL §9a: "the extraction can miss or misread a clause"; test of 10/11/19 Nov: "six (6) months" read as "90 (90) months" in value and excerpt | **Conflict** |
| 3 months (main text) vs 6 months (small print) → held → reviewer confirms 6 → 30 June 2027 | P-WORKFLOW evidence 19 Nov (CAI-TEST); INSTALL §9a check 3 | Supported, and matches the release evidence exactly |
| "People outside the team see nothing" | P-ISOLATION (9–10 Nov) | Supported within the configured owner-team model |
| "A person approves every result" | Approval gate; agent gives no values from unapproved documents | Supported |
| Slides at 16.5–21.5 s and 58.5–61.5 s | "SharePoint ☐ Contract terms", "Wording ☐ Calculation ☐ Review": an arrow glyph is missing from the font | **Visual defect** |
| Burned caption at 10.5–13.5 s | "… from Colleague" / "AI runs inside …" splits the brand name | Minor caption defect |

**Corrections requested from the producer** (narration and burned captions):
- 16.7 s: "extracts the key terms with the excerpt it relied on, and sends every extraction to a named reviewer in Teams."
- 28.1 s: "The reviewer checks each term against the contract: the notice period as the AI read it, the notice clauses it found, and the signing date."
- On screen: "Every notice clause found" → "Notice clauses found".
- Re-render the two slides with a font that has the arrow glyph (or use "→" as an image).
- Keep the brand name "ColleagueAI" within one caption.

### 2.3 Installation guide (burned captions; AI-generated presenter, labelled)
The video matches INSTALL.pdf step for step:

- **Prerequisites:** Dataverse with 1 GB free; System Administrator; Copilot Studio capacity; dedicated library; reviewer and alert admin; Microsoft 365 admin; a text-based English test contract.
- **Costs:** budget alerts at 50/80/100 %, and "alerts do not stop spending".
- **Package:** checksum against the order page; outer bundle extracted, inner ZIP left unopened; five values.
- **Connections:** four connection references (both Dataverse references on one connection, plus SharePoint and Teams, one System Administrator account).
- **Agent:** block it if it shows Available; do not publish it during installation.
- **Flows:** seven flows, with Review gate turned on by hand.
- **Access:** CAI Contract Reader, with Read on Contract and Field evidence only; the four Copilot Studio checks.
- **Checks:** a readiness check that "changes nothing"; the 400-day test question; section 9a; the support contact.

**Spoken safety instruction at 147 s, confirmed:** the narrator says "**Do not publish the agent during installation.**" This matches the burned caption and the on-screen card.

The first pass of speech recognition returned "publish the agent during installation". That was a segmentation artefact: the voice-activity detector started its segment at 147.30 s, after the words "Do not". Re-checked on 27 Nov at 22:55:
- **Energy (40 ms frames):** a speech burst at 146.98–147.28 s, at −11 to −15 dBFS (the same level as the surrounding narration), between a silence at 146.60–146.92 s (−60 to −69 dBFS) and "publish" from 147.32 s.
- **Transcription of that burst alone** (146.50–147.35 s, padded, no detector): "Do not".
- **Wider windows** (144.0–149.2, 145.8–149.2, 146.3–148.95 s): each reads "Do not publish the agent during installation."

The caption files and transcripts in all eight languages carry the negative instruction, and `tests/videos.test.mjs` enforces it.

**Verification against the authoritative documents** (`scripts/qa/install-narration-check.mjs`, rerunnable):
- Inputs: release 1.0.3.6 bundle r3, `INSTALL.pdf` (SHA-256 `ced8e7a0…`) and `START-HERE.pdf` (`2165ecdf…`).
- The 45 English narration segments were reduced to **59 anchors**: numbers, Microsoft UI labels and instructions. Five segments carry no checkable fact.
- **58 verified**: 55 in INSTALL.pdf and 3 only in START-HERE.pdf (the INSTALL.pdf reference, and the checksum against the order page).
- **1 expected discrepancy:** "20 to 30 minutes" is in neither document (INSTALL.pdf says "about 60 minutes"). The on-page disclosure covers it (§3).
- **Omission:** INSTALL §5's "When you go live, Daily recompute must be On" is not narrated. The disclosure adds it.
- **Safety instructions** are carried in all eight caption languages, and a test enforces them:
  - do not publish the agent;
  - block it if Available;
  - keep Daily recompute off during testing;
  - budget alerts do not stop spending;
  - leave the inner ZIP unopened;
  - section 9a before real contracts.

### 2.4 Continuous Certification (burned captions; illustrative imagery, labelled)
| Claim | Source / check | Result |
|---|---|---|
| "Introducing ColleagueAI Continuous Certification", "Buy once. Govern continuously.", "One licence. Continuous assurance." | Founder decision of 26 Nov; `certified-content.json` msg/msg2 | Approved vocabulary; translations reuse the site's msg2 |
| "Upcoming programme", "Coming soon", "Proposed coverage — subject to approved coverage and subscription terms" | Founder decision of 26 Nov (all subscriptions Coming soon) | Correct positioning |
| "From the EU AI Act, GDPR and data protection to **ISO standards**, cybersecurity, risk management, Microsoft compatibility and AI consumption costs" | Bounded scope cites ISO/IEC 42001 controls only; on-screen "ISO Control Alignment" | Narration is broader than the bounded scope. **Counsel item**; acceptable as "proposed coverage" with the disclosure. |
| "implement covered improvements … deliver **qualifying** certified updates" | Spec: updated certified release only when a covered change requires one | Supported ("qualifying", "covered") |
| "Reduce risk. **Improve** audit readiness. Manage AI costs. Protect your data." | Re-transcribed in isolation: the audio says "Improve", not "Prove" | Objectives, labelled "Programme objectives" on screen |
| "Your agent licence remains yours" | Perpetual licence; a lapse never touches the licence (tests/certification.test.mjs) | Supported |
| End card: "proprietary product assurance programme, not independent regulatory accreditation" | Vocabulary contract | Correct; repeated in the on-page disclosure in eight languages |
| Corrective releases | Not mentioned in the video, so it does not imply that security fixes need a subscription | Consistent with "never limited to subscribers" |

## 3. Requested reconciliations
| Item | Finding | Resolution |
|---|---|---|
| 20–30 min (video) vs 60–90 min (website) | The video says "Plan around 20–30 minutes · Prepared environment only · Planning estimate · allow extra time for prerequisites". INSTALL.pdf says "about 60 minutes, plus a few minutes for the first test contract". The website says 60–90 minutes in all eight languages. The 20–30 figure is in no approved document. | The on-page disclosure, in eight languages, reads: "Plan 60–90 minutes in total; the 20–30 minutes in the video assume every prerequisite is already in place." **Founder decision**: accept that framing, or ask for "Plan 60–90 minutes in total" in the next cut. |
| Three connections vs four connection references | Both correct. 4 references, 3 connectors: Dataverse ×2 (the second belongs to the agent), SharePoint, Teams. The video says "both Dataverse references to the same connection … all four references". | No change needed |
| Seven cloud flows; Daily recompute testing state | 7 flows confirmed in the managed solution; "keep Daily recompute off during testing" matches INSTALL §5. The video does **not** say INSTALL's "when you go live, Daily recompute must be On". | The on-page disclosure adds "When you go live, turn Daily recompute on (INSTALL.pdf, section 5)". Recommend the line in the next cut. |
| Product extraction claims; SharePoint slide character | §2.2 | Held; corrections listed |
| Corporate duplicate-invoice scenario | Labelled illustrative in the video; not a released agent | Disclosure: illustrative; every agent Coming soon |
| CC coverage, corrective releases, proprietary status, Coming soon | §2.4 | Ready, subject to the counsel item on "ISO standards" |

## 4. Placement matrix
One feature player per page: a poster only, until the visitor presses play. Elsewhere a compact card links to the player in the visitor's language.

| Page (all 8 languages unless noted) | Feature player | Cards |
|---|---|---|
| Home | Corporate (after the hero; CTA: agent catalogue) | Product (held, hidden), Continuous Certification (beside the CC block) |
| Agent catalogue (`/agents`) | — | Corporate, Product (held) |
| Pricing | — | Product (held), Continuous Certification (beside the comparison) |
| Partner programme | Installation guide (implementation-partner resources; CTA: apply to partner) | Corporate, Product (held), Continuous Certification |
| Trust Center | — | Continuous Certification |
| Usage (token cost) | — | Installation guide |
| Continuous Certification page | Continuous Certification (top of the programme block) | — |
| Flagship factsheet (English only; the factsheet exists in English only) | Product (top; held), Installation guide ("Microsoft prerequisites and running costs"; CTA: book a demo) | Continuous Certification ("Availability and certification status") |
| Post-purchase onboarding (order page) | Deferred | `api/success.js` is changed by the open release stack (#590–#593); add a link after it merges |

Card links: corporate → home; certification → /certified; installation → factsheet (English) or the partner page (other languages); product → factsheet.

## 5. Component
- **Facade player** (`scripts/lib/videos.cjs`, `public/cai-video.js`):
  - The page carries only a poster button; the `<video>` element sits in an inert `<template>`.
  - On the click, the video is created and plays with sound: a visitor action, never autoplay.
  - No video or caption bytes are fetched before the click (verified in the browser).
- **Controls:** a play button named by its own text; native video controls for volume, seeking and pause; a subtitle language select; a full-screen button that covers the picture and the caption bar; a transcript.
- **Subtitles are drawn below the picture**, in a caption bar, set with `textContent`:
  - Three masters have English burned in, so a translation laid over them would overlap.
  - The English track is off by default on those three when the page is English; elsewhere the page language is the default.
  - For native full screen (iPhone), translated tracks are positioned at the top (`line:6%`).
- **One plays at a time.** No cookies, no storage, no network beyond the chosen video and caption file.
- **Design:** the site palette (graphite, terra, cream), pill controls, rounded frame, `prefers-reduced-motion` respected.

## 6. Languages
- **English:** captions and transcripts are built from the verified narration, with burned captions authoritative where speech recognition differed.
- **Translations:** cs, de, fr, es, it, pl and pt are written for captions, titles, descriptions, disclosures, calls to action and player strings, in the register each locale page already uses (cs/es/it/pt formal, pl "Twój").
  - Programme vocabulary reuses `certified-content.json`.
  - Microsoft UI labels stay in English, as in INSTALL.pdf.
- **Native review: required, not done.** The translations are engineering drafts. Each needs a native-language review before or shortly after publication, recorded in `docs/continuous-certification/translation-review.md` style. Priorities, because they carry limits:
  - every disclosure;
  - the installation steps;
  - the certification objectives.
- **Reading speed** (characters per second, including spaces; max / mean per track). Method:
  - Cues start 0.25 s early and may hold up to 1.5 s into a pause.
  - About 70 translated captions were condensed to the spoken meaning; no safety instruction was removed.
  - Lines are balanced at ≤ 42 characters, ≤ 2 lines per cue.
  - `tests/videos.test.mjs` fails any translated cue above 20 cps and any English cue above 23.

  | Video | en | cs | de | fr | es | it | pl | pt |
  |---|---|---|---|---|---|---|---|---|
  | Corporate | 22.7 / 16.5 | 18.8 / 15.8 | 19.6 / 17.8 | 19.6 / 17.4 | 19.3 / 17.1 | 19.6 / 17.5 | 19.3 / 16.9 | 19.6 / 16.9 |
  | Installation | 21.7 / 16.4 | 19.7 / 16.3 | 20.0 / 17.8 | 19.6 / 17.6 | 19.7 / 17.2 | 19.8 / 17.4 | 19.4 / 16.5 | 19.9 / 16.9 |
  | Certification | 17.7 / 13.5 | 18.9 / 13.9 | 19.8 / 15.7 | 19.9 / 16.9 | 19.5 / 16.4 | 20.0 / 16.2 | 19.2 / 14.4 | 19.6 / 15.5 |

  English follows the narrator's own pace and burned captions, so it was not condensed. Previously the busiest translated cues ran at 20–35 cps. The full transcript sits beside every player.
- **Clean masters:** for product, installation and certification, a master **without burned-in captions** would let every language, English included, be shown the same way and at full readability. Request it with the product re-edit.

## 7. Hosting, security, privacy
- **Hosting:** same-origin static files under `/media/`, not Vercel Blob.
  - The CSP (`default-src 'self'`, no `media-src`) already allows same-origin media, so there is **no CSP change**.
  - The existing Blob store is the private release-package store and stays private.
  - No new infrastructure, account or expenditure.
- **Integrity:**
  - Each served file is byte-identical to the delivered master (moov atom already first, H.264/AAC), so the SHA-256 in `config/media.json` identifies both.
  - Each file name carries the first 8 hex digits of its checksum, so a changed master gets a new URL.
- **Caching** (`vercel.json`):
  - `.mp4` and posters: `public, max-age=31536000, immutable` (content-addressed);
  - `.vtt`: 1 hour, served as `text/vtt; charset=utf-8`;
  - `/cai-video.js` is versioned by its hash.
- **Range requests:** the browser fetches the MP4 with byte ranges. Verified on the QA server and on the Vercel Preview: `206`, `video/mp4`, immutable caching; VTT served as `text/vtt`.
- **Payload:** corporate 5.29 MB, installation 12.72 MB, certification 8.27 MB (product 11.40 MB when its corrected master arrives). Posters are 45–126 KB and lazy-loaded. Repository growth is 26.3 MB.
- **Bandwidth estimate:** about 6 MB per play on average (two-thirds of an average file watched).

  | Plays per month | Transfer |
  |---|---|
  | 1,000 | ≈ 6 GB |
  | 10,000 | ≈ 60 GB |

- **Plan eligibility and cost** (Vercel dashboard and pricing pages, checked 27 Nov 2026):
  - **Account plan:** **Hobby**. Hobby is limited to non-commercial personal use. A commercial site, which colleagueai.ai is once sales open, is **not eligible** on Hobby, with or without videos.
  - **Last 30 days of usage, against Hobby limits:**

    | Usage | Used | Hobby limit |
    |---|---|---|
    | Fast Data Transfer | 206.7 MB | 100 GB |
    | Deployment storage | 4.9 GB | 10 GB |
    | Build time | 8 h | 100 h |
    | CDN requests | 53,693 | 1M |

  - **Pro:** $20 a month for 1 deploying seat, including $20 of usage credit; each extra seat is $20 a month. It includes 1 TB of Fast Data Transfer, then from $0.15 per GB.
  - **Video delivery on Pro:** ≈ 6 GB per 1,000 plays, so **$0** additional below about 160,000 plays a month. Deployment storage is not affected materially (+26 MB per deployment).
  - **Founder decision:** whether and when to move to Pro, about $20 a month. It is required before commercial launch regardless of video. **Nothing has been purchased or upgraded.**
- **Privacy:** no third-party player, embed, tracker, cookie or storage. The video is served like any page asset, so the privacy notice needs no change. Posters and videos carry an "AI-generated presenter" or "Illustrative" label where the masters do.

## 8. SEO and GEO
- **`VideoObject`** is emitted only for **approved** videos, on the page that hosts the feature player, named by that page's canonical URL. A Preview never emits it.
  - **Supported properties only.** It uses Google's documented video properties: required `name`, `thumbnailUrl` and `uploadDate`; recommended `contentUrl`, `description` and `duration`.
  - **Allowlist.** `GOOGLE_VIDEO_PROPERTIES` in `scripts/lib/videos.cjs` holds Google's full supported list, and a test fails if any other key appears.
  - **Removed:** the earlier draft (`5ed0ff2e`) also emitted `@id`, `encodingFormat`, `width`, `height`, `inLanguage`, `isFamilyFriendly`, `caption`, `transcript` and `publisher`. Those are valid schema.org properties, but Google's video structured data does not list them. The transcript stays in the HTML, where it is crawlable.
  - **`uploadDate`** is `publishedOn`, the actual publication date recorded at release. It is not the approval date.
  - **Format:** ISO 8601 (`2026-12-01` or with a time and offset). `duration` is ISO 8601 (`PT1M9S`).
- **Transcripts** are in the HTML (a `<details>` element) in the page language, so they are crawlable without JavaScript.
- **One player per page and one canonical page per video and language**, so there is no duplicate `VideoObject` per page.
- **No availability claims:** titles and descriptions say "planned", "Coming soon" and "illustrative" where they apply.

## 9. Test evidence
| Check | Result |
|---|---|
| `tests/videos.test.mjs` (17 tests): checksums and fast start; the held product cannot render; approval gate (nothing approved, nothing in Production, Preview-only review, `publishedOn` not in the future); **asset gate** (nothing unapproved is copied to `dist/media`); **checksum tamper** (a replaced master on a copy of `media/` turns the approval off and fails `publish-media`); eight-language captions with parity and current files; valid WebVTT and two-line cues; **reading speed** (translations ≤ 20 cps, English ≤ 23); **installation safety lines in all 8 languages** (do not publish, block if Available, Draft or Blocked, Daily recompute off, alerts do not stop spending, checksum, one System Administrator account, inner ZIP unopened, section 9a); blocked vocabulary; no media outside the template and no autoplay; cards; `VideoObject` keys limited to Google's list, `uploadDate` = `publishedOn`; no storage or third parties in the client; caching and CSP | 17/17 |
| Installation narration vs INSTALL.pdf / START-HERE.pdf (`scripts/qa/install-narration-check.mjs`) | 58/58 anchors documented (55 INSTALL.pdf, 3 START-HERE.pdf only); 1 expected discrepancy (20–30 min), covered by the disclosure |
| **Combined release candidate** (local `verify/rc-video-combined`: `origin/fix/aud-r2-content-claims` ⊃ #590–#593, + `origin/main` `36b723f8`, + this branch `182dbb99`) | **Production-mode build:** 0 media published, 0 video blocks, 33/33 media URLs 404, 0 video traces in 371 files. **Unit:** 817/817 node tests, 37/37 vitest, eslint clean. **E2E** (Playwright, Google Chrome, desktop + tablet + mobile): **753/753**. **Lighthouse:** all thresholds passed. **Preview-mode build** (videos shown): browser video QA **57/57**, Lighthouse identical to the Production-mode build |
| Browser QA, real Google Chrome 1440×900, 820×1180 and 390×844 (static server with the production CSP and byte ranges) | **57/57**: all 8 languages × home, partners and /certified (right player, transcript language, default subtitles, **no video or caption request before the click**, 0 CSP violations, 0 console errors); keyboard Enter plays with sound and focuses the video; subtitles below the picture (cs, de, fr); MP4 fetched with byte ranges; full screen holds picture and caption bar; no horizontal overflow; every card link reaches its player; keyboard order play → subtitles → full screen → transcript; axe on the video sections of home, /cs/partneri, /certified and /agents: 0 violations |
| Lighthouse (repository thresholds) on /, /agents, /pricing, /certified, with videos vs the same build without | Identical: 100/100/100/100 everywhere except /agents best practices 96, which predates this change (same in the baseline) |
| Firefox and WebKit | **Not run.** Their browser downloads are blocked in this environment. The player uses only standard `<video>`, `<track>`, `textTracks` and the Fullscreen API with WebKit prefixes. Run `npx playwright test` with the firefox and webkit projects on a machine that has them, or check manually in Safari and Firefox. |

## 10. Founder decisions
1. **Approve, per video:** corporate, installation guide, Continuous Certification. Follow §1.2 (`approvedBy`, `approvedOn`, `approvedSha256`, `publishedOn`). The conditions are listed in `config/media.json`:
   - corporate: the multi-domain narration and the illustrative finance example;
   - installation: the 20–30 minutes framing and the Daily recompute note;
   - certification: "ISO standards" as proposed coverage (counsel) and the objectives.
2. **Product video:** request the corrected master (§2.2). It stays held until then.
3. **Clean masters** without burned captions for the three captioned videos (optional, recommended).
4. **Native-language review** of the seven translations.
5. **Post-purchase onboarding link:** after the release stack merges.
6. **Vercel plan:** Hobby is non-commercial. Decide on Pro (about $20 a month) before commercial launch (§7).

## 11. Release stack and approvals (checked 27 Nov 2026, 22:10–22:30 CET)
| PR | Head → base | State | Approving review |
|---|---|---|---|
| #590 | `fix/cai-aud-remediation` → `main` | Open; head `9b7706cf` (main merged in at 22:10) | None yet; **required** (ruleset: 1 approval) |
| #591 | `fix/aud-r2-integrity` → `fix/cai-aud-remediation` | Merged 21:20 (`a99b1643`) | None (stack branch, not protected) |
| #592 | `fix/aud-r2-content-claims` → `fix/aud-r2-integrity` | Merged 22:10 (`082b8143`) | None (stack branch) |
| #593 | `fix/aud-r3-integrity` → `fix/aud-r2-content-claims` | Merged 21:20 (`23abbf4b`) | None (stack branch) |
| #585 | `docs/cc-operations` → `main` | Merged 21:21 (`36b723f8`) | **None**: merged into protected `main` with the owner bypass |
| #594 | verification only | Closed | n/a |
| #595 (this) | `feat/video-integration` → `main` | Open, draft | None yet; **required** |
| #572 | Dependabot | Open | Not part of this release |

- **Production** runs `main` `36b723f8` (`dpl_H78Yz5Gywi4a4n33W1NGcAxQaHvX`). Rollback candidate: the #589 deployment.
- **Gap:** #591 merged `fix/aud-r2-integrity` into #590's branch **before** #592 landed on it. The 30 commits of rounds 2 and 3 (`082b8143`; 374 files changed) are therefore **not in #590**, and no open PR carries them to `main`. This includes buyer-facing claims, partner terms, disputes, commission base, reconciliation, and the 27 Nov operational-acceptance record. Merging #590 as it stands would ship round 1 without them.
  - **Fix:** a PR from `fix/aud-r2-integrity` into `fix/cai-aud-remediation`, or retarget so that `082b8143` reaches #590, before #590 is reviewed.
- **Tested combination:**
  - `origin/fix/cai-aud-remediation` (`9b7706cf`) + `origin/fix/aud-r2-integrity` (`082b8143`) + this branch has a tree **identical** to the tested RC `8ffd8d62`. The only conflict is the `package.json` postbuild line: keep `optimize-render-path` last, insert `publish-media` / `inject-videos` after `inject-cc-pillar`.
  - The §9 evidence therefore applies to that combination.
- **Merge order once reviewed:** close the gap above → #590 → #595 (rebase onto `main`, resolving the postbuild line) → approvals per video (§1.2).
- **Rule:** no admin bypass for any of these.
