---
name: document-review
description: Choose between the light ADR-centric path and the full PRD→SRS→ADR path, review the resulting documents and traceability, and keep document approval separate from implementation, deploy and test approval. Use when writing or reviewing a PRD, SRS or ADR, or deciding how much design documentation a project needs.
---

# Document review

Contract: [document-review-paths.md](../../../docs/document-review-paths.md). Templates: [document-templates.md](../../../docs/document-templates.md).

1. Inspect project scale, stakeholders, external consumers, dependencies, exposed interfaces, change impact, and regulatory/operational risk before choosing a path.
2. Decide light vs full path and record the reason plus the unknowns in the report. Depth follows scale and risk, never code size.
3. Light path: check the issue/ADR has a goal, scope, verifiable done criteria, and test evidence linked to those criteria.
4. Full path: check PRD → SRS → ADR exists, SRS requirement IDs resolve to test evidence, external contracts are written down, and PRD/SRS/ADR do not contradict each other.
5. Keep document approval, implementation approval, deploy approval and test pass separate. Do not let one imply the others.
6. Do not invent missing requirements or fill open questions with guesses. Mark them unknown and request the answer from the owner.
7. Use the templates as a starting point; rename or trim sections for the reader instead of forcing acronym headings into reader-facing documents.
