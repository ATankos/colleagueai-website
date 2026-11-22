# Legal, tax and release evidence: how it is kept

**The rule:** originals live in private storage; this repository holds only a redacted index.

- The index is `config/evidence-manifest.json`. It records what each document is, who owns the record, its status, its
  SHA-256 and a `private:` reference.
- `scripts/release/validate-product.mjs` reads the index:
  - a product's `ip.status: "executed"` is refused without a `verified` `ip_instrument` record carrying the same
    SHA-256;
  - an index entry with personal-data fields, or a verified private record without a fingerprint, fails CI
    (`tests/legal-evidence.test.mjs`).

## Never in this repository

Never commit any of the following to this repository:
- signed PDFs;
- signatures, or scans of identity documents;
- dates of birth or private addresses;
- registration decisions or correspondence with the tax office;
- accountant letters;
- supplier invoices or bank statements.

Any of these that already exists only in a private place stays there.

## Record fields

| Field | Meaning |
|---|---|
| `id` | stable name, e.g. `ip-instrument-a` |
| `type` | `ip_instrument`, `ip_schedule`, `ip_declaration`, `rights_chain`, `corporate_extract`, `corporate_record`, `tax_registration`, `accountant_advice`, `third_party_review`, `release_record`, `package_fingerprint`, `customer_licence_version` |
| `subject` | product slug or `company` |
| `owner` | who keeps the original (normally Colleague AI s.r.o.) |
| `date` | date of the document (signing, decision or extract date) |
| `status` | `pending` (expected), `received` (stored, not yet checked), `verified` (checked against its source; fingerprint recorded), `superseded` |
| `sha256` | fingerprint of the exact stored file |
| `storageRef` | `private:<path in the company's private store>` or `repo:<path>` for public records |
| `approvalReference` | who approved and where (e.g. accountant's letter reference, PR number). Not the document itself. |
| `gate` | the release gate it closes (`config/release-gates.json`) |

## Signing and recording IP Instrument A (A6)

1. **Before signing**, complete `docs/legal/ip/corporate-authority-checklist.md`:
   - take the Commercial Register extract of the day;
   - choose the remuneration option (clause 9) with the accountant's note;
   - regenerate Schedule A part 2 at the signing-day commit (`node scripts/legal/schedule-a-inventory.mjs <commit>`);
   - have counsel approve the controlling-language clause (20.2) and the signature form (21.2).
2. **Prepare the signing copies** from the Czech text (and the English reference if the parties sign both). Fill in the
   identity data **only on the signing copies**.
3. **Sign.** Write the date beside each signature.
   - (a) **By hand:** two counterparts, initials on every page and on each Schedule A line the Author confirms. Scan
     the fully signed counterpart to PDF.
   - (b) **Electronically:** a qualified electronic signature of each signatory (or the level counsel approves). Keep
     the provider's audit trail.
4. **Store** the signed PDF in private storage. Compute its fingerprint: `shasum -a 256 <file>`
   (Windows: `certutil -hashfile <file> SHA256`).
5. **Record (PR 1, evidence only).** Set the `ip-instrument-a` entry to `received`, then to `verified` once someone other
   than the signatories has checked it. The check covers: both signatures and dates; the schedule attached and
   initialled; the remuneration option chosen; identity data present on the private copy only.
   - Fill in `date`, `sha256` and `approvalReference` (counsel's approval reference).
   - Do the same for the extract, the checklist, the remuneration note and Marek's declaration.
6. **Product record (PR 2, the only product change).** In `config/agents/contract-intelligence-and-register.json`, set
   `ip.status: "executed"` and `ip.evidenceSha256` to the instrument's fingerprint. Nothing else changes in this PR. CI
   proves the fingerprint matches a verified evidence record.
7. **Gate L-IP:** the founder closes it in writing. It is never passed by an engineering change
   (`tests/release-gates.test.mjs`).

## Verifying later

Anyone with access to the private file can recompute its SHA-256 and compare it with the index. A mismatch means the
stored file is not the one recorded. Treat that as an incident and do not overwrite the record.
