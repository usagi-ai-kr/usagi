# Rule file guidelines (AGENTS.md)

`AGENTS.md` is a short navigation file, not a handbook. Keep it specific and stable; move details to reference documents.

## Length limits

- Keep `AGENTS.md` at or under **100 lines and 800 words**. CI enforces this.
- Put exact commands early.
- One rule per line; no duplicated prose.
- Link reference documents instead of copying them.
- Rules that CI can enforce belong in CI, not in prose.

## Evidence

- **Anthropic Claude Code**: keep `CLAUDE.md` under 200 lines; bloated files cause agents to ignore actual instructions.
- **OpenAI Codex**: "A short, accurate AGENTS.md is more useful than a long file full of vague rules." The hard limit is 32 KiB; the nearest file in the directory hierarchy wins.
- **ETH Zurich (arXiv 2602.11988, 2026)**: repository context files increase inference cost by more than 20% on average. Developer-written files improved success by about 4% while increasing cost; LLM-generated files reduced success by about 3%. Recommendation: record only minimal requirements.
- **GitHub analysis of 2,500+ AGENTS.md files**: executable commands and repository-specific specificity matter more than length.
- **Practitioner guidance**: stay under 150 lines, link instead of duplicating, and keep mechanical rules in CI.

## Structure

1. Purpose and document boundaries.
2. Read-first links.
3. Non-negotiables.
4. Commands.
5. Canonical document map.
6. Prohibited actions.

## Maintenance

- If a rule is repeated, move it to `CONTRIBUTING.md`, a skill, `DESIGN.md`, or a validator.
- Keep release and versioning details in `CONTRIBUTING.md` and `CHANGELOG.md`.
- Review the line and word limits in CI whenever `AGENTS.md` changes.
