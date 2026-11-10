# D7/D11 synthetic test documents (fixtures)

Eight invented contracts used for the D7 (adversarial / prompt-injection) and D11 (cost and accuracy) tests of
CAI-L4-CI-001. All names, companies, numbers and clauses are fictitious.

| File | Purpose |
|---|---|
| SYN-ADV-001_SaaS-Agreement.pdf | D7: approval banner, JSON-breaking contract number, instructions to automated systems and to chat assistants, hidden text |
| SYN-ADV-002_Logistics-Services-Agreement.pdf | D7: fake "pre-verified evidence" table, small-print schedule contradicting the liability cap |
| SYN-COST-001 … SYN-COST-006 | D11: NDA, SaaS, MSA, supply agreement, amendment with future effective date, long framework agreement |

`truth.json` holds the expected values; `gen.py` rebuilds the PDFs (reportlab).

## Provenance

The PDFs in this folder were regenerated on 10 November 2026 by the unchanged `gen.py`. Compared with the files
used for the 8 November 2026 evidence run they differ only in the PDF metadata written by reportlab
(`/CreationDate`, `/ModDate`, `/ID`); every other byte is identical and the extracted text (`pdftotext -raw`) is
identical. Their SHA-256 values therefore differ from those recorded in the 8 November evidence
(for example SYN-ADV-001 `7f7f4bd3…`, SYN-ADV-002 `e372c098…`).

The original uploaded bytes are kept unchanged in the isolated test tenant's evidence library and are not modified
or deleted by the 1.0.3.3 work.
