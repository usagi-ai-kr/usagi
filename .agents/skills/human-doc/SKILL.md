---
name: human-doc
description: Draft or review human-facing proposals, retrospectives, examples, learning resources and job-search documents with clear narrative, metadata and concise length.
compatibility: Node.js 22 recommended for optional length and metadata checks.
---

# Human-readable writing

When preparing or reviewing human-facing material:

1. Read [the writing contract](../../../docs/human-writing-contract.md).
2. Decide who reads the text, why it exists, and what next action it enables.
3. Declare frontmatter metadata: `doc_type`, `audience`, and the type-specific field (`evaluation` for proposals, `evidence` for retrospectives, `competency` for learning/job-search).
4. Apply the appropriate reasoning checklist internally; do not use framework acronyms as forced reader headings.
5. Run `node scripts/check-human-doc.mjs --require-metadata <path>` for documents that declare metadata. Use `--json` for automation. Treat length warnings as revision prompts, not automatic rejection.
6. Check the rendered GitHub Markdown for Korean emphasis with particles, literal tildes and task-list behavior.
7. Record any justified exception in the review.

The checker validates length and metadata presence/enums only. It is not a semantic MECE/SWOT/STAR/ASK validator.
