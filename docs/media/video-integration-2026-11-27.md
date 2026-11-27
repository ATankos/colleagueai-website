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

Nothing is published by this branch:

- **Production:** the `approvedBy` and `approvedOn` fields in `config/media.json` are empty, so a Production build places videos on **0 pages**, as a build without the preview switch confirmed.
- **Review Preview:** `CAI_VIDEO_PREVIEW=1`, scoped to Preview for this branch only, renders the three ready videos behind a "pending approval" banner.

**To publish one video:** record `approvedBy` and `approvedOn` (ISO date) for it in `config/media.json` in a reviewed PR. `approvedOn` becomes the `uploadDate` in the structured data.

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

At 147 s, speech recognition heard "publish the agent during installation". The burned caption and the on-screen card both say "**Do not** publish the agent during installation", and the captions follow the card.

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
- **Reading speed:** the busiest cue per language runs at 20–35 characters per second (translations are longer than the spoken slots). Every player has the full transcript beside it.
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
- **Range requests:** the browser fetches the MP4 with byte ranges (206). Verified on the QA server; check one on the Vercel Preview.
- **Payload:** corporate 5.29 MB, installation 12.72 MB, certification 8.27 MB (product 11.40 MB when its corrected master arrives). Posters are 45–126 KB and lazy-loaded. Repository growth is 26.3 MB.
- **Bandwidth estimate:** about 6 MB per play on average (two-thirds of an average file watched).

  | Plays per month | Transfer |
  |---|---|
  | 1,000 | ≈ 6 GB |
  | 10,000 | ≈ 60 GB |

  Vercel Hobby includes 100 GB of Fast Data Transfer a month and Pro includes 1 TB, so the cost is **0** at any realistic B2B volume. The Hobby plan's non-commercial restriction is a separate, open founder decision (operational acceptance of 27 Nov).
- **Privacy:** no third-party player, embed, tracker, cookie or storage. The video is served like any page asset, so the privacy notice needs no change. Posters and videos carry an "AI-generated presenter" or "Illustrative" label where the masters do.

## 8. SEO and GEO
- **`VideoObject`** is emitted only for **approved** videos, on the page that hosts the feature player, named by that page's canonical URL. It carries:
  - name, description, thumbnail and same-origin `contentUrl`;
  - `duration` and `uploadDate` (the approval date);
  - the eight caption tracks, the transcript in the page language, and the publisher.

  A Preview never emits it.
- **Transcripts** are in the HTML (a `<details>` element) in the page language, so they are crawlable without JavaScript.
- **One player per page and one canonical page per video and language**, so there is no duplicate `VideoObject` per page.
- **No availability claims:** titles and descriptions say "planned", "Coming soon" and "illustrative" where they apply.

## 9. Test evidence
| Check | Result |
|---|---|
| `tests/videos.test.mjs` (13 tests): checksums and fast start; the held product cannot render; approval gate (nothing approved, nothing in Production, Preview-only review); eight-language captions with parity and current files; valid WebVTT and two-line cues; safety lines (do not publish, Daily recompute, Improve audit readiness); blocked vocabulary; no media outside the template and no autoplay; cards; complete `VideoObject` once approved; no storage or third parties in the client; caching and CSP | 13/13 |
| Full suite on the branch | 725/725 node tests, 35/35 vitest, eslint clean |
| Browser QA, real Google Chrome 1440×900, 820×1180 and 390×844 (static server with the production CSP and byte ranges) | **57/57**: all 8 languages × home, partners and /certified (right player, transcript language, default subtitles, **no video or caption request before the click**, 0 CSP violations, 0 console errors); keyboard Enter plays with sound and focuses the video; subtitles below the picture (cs, de, fr); MP4 fetched with byte ranges; full screen holds picture and caption bar; no horizontal overflow; every card link reaches its player; keyboard order play → subtitles → full screen → transcript; axe on the video sections of home, /cs/partneri, /certified and /agents: 0 violations |
| Lighthouse (repository thresholds) on /, /agents, /pricing, /certified, with videos vs the same build without | Identical: 100/100/100/100 everywhere except /agents best practices 96, which predates this change (same in the baseline) |
| Firefox and WebKit | **Not run.** Their browser downloads are blocked in this environment. The player uses only standard `<video>`, `<track>`, `textTracks` and the Fullscreen API with WebKit prefixes. Run `npx playwright test` with the firefox and webkit projects on a machine that has them, or check manually in Safari and Firefox. |

## 10. Founder decisions
1. **Approve, per video:** corporate, installation guide, Continuous Certification. Record `approvedBy` and `approvedOn` in `config/media.json`. The conditions are listed in that file:
   - corporate: the multi-domain narration and the illustrative finance example;
   - installation: the 20–30 minutes framing and the Daily recompute note;
   - certification: "ISO standards" as proposed coverage (counsel) and the objectives.
2. **Product video:** request the corrected master (§2.2). It stays held until then.
3. **Clean masters** without burned captions for the three captioned videos (optional, recommended).
4. **Native-language review** of the seven translations.
5. **Post-purchase onboarding link:** after the release stack merges.
