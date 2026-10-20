# Changelog

All notable changes to this project are documented here. This project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Claude Code skill discovery through a `.claude/skills` symlink to `.agents/skills`, with validation.

### Changed

- Skill descriptions now include `Use when ...` triggers for client auto-invocation, enforced by validation.
- Updated the README version summary and toolchain example for v0.2.0.

## [0.2.0] - 2026-10-20

### Added

- Visualization selection policy and visualization skill for Markdown/Mermaid-first diagrams with optional specialized tools.
- PRD/SRS/ADR review-path contract, minimal templates, and document-review skill for project-scale decisions.
- E2E/visual result contract, JSON schema, and fail-closed validator for commit, viewport, budget and artifact evidence.
- Toolchain contract and non-destructive doctor for dependency and OS diagnostics.
- Architecture responsibility/dependency contract, example map, and static layer-dependency checker.
- Human-readable wiki page synthesizing model-operation observations from moi, yoroi, and the-great-dalmuti.
- Human-readable wiki concept page covering skills, rule files, DESIGN.md, TDD and layers.
- Design reference catalog, design decision template, and design-review skill for token-grounded visual work.
- Priority client configuration for opencode and Claude Code, with an integration guide and fallbacks for Antigravity CLI and Codex.

### Changed

- Reworked the model-operations wiki page with role-fit guidance; removed the workflow/starter wiki pages and added one simple start prompt.
- Wiki publishing now prunes retired pages and reports them in check mode.
- Codified worker identity names, tab/agent label matching, and stable naming rules.

## [0.1.3] - 2026-10-20

### Added

- Reader-focused writing contract, `human-doc` skill, and advisory metadata/length checker for human-facing documents.

### Changed

- Expanded the harness starter guide with a role table and a work-unit brief example.
- Clarified prompt references with absolute repository links.
- Codified worker reuse, panel-change approval, and session-loss recovery rules.
- Simplified the prompt guide into a short document index and removed the README reading-order section.

## [0.1.2] - 2026-10-20

### Added

- Harness starter guide and minimal templates for `AGENTS.md`, `CONTRIBUTING.md`, labels, branch protection, and CI.
- Copy-paste prompt library (`PROMPTS.md`) for adoption, review, triage, glossary, release, and repository audit workflows.
- External contribution policy: this is an owner-operated project; external agent contributions are not accepted.

### Changed

- README and Wiki now point readers to the starter pack and prompt library while keeping the human-friendly flow.

## [0.1.1] - 2026-10-20

### Changed

- Reduced `AGENTS.md` to a concise navigation file and moved detailed rules to `CONTRIBUTING.md`, skills, `DESIGN.md`, and `docs/rule-file-guidelines.md`.
- Added rule-file length and word limit checks and research notes in `docs/rule-file-guidelines.md`.

## [0.1.0] - 2026-10-20

### Added

- 84-term glossary in five categories, with a generated A–Z index and wiki publication.
- Human-facing wiki pages explaining harness engineering and operating workflows.
- Minimal MECE labels (`type:*` + `status:*`), branch protection, and the `validate` CI job.
- Agent rules (`AGENTS.md`), `CLAUDE.md` symlink, `glossary` Agent Skill, and `DESIGN.md`.
- Proposal documents for orchestration, delegation/evidence, and triage/evidence assurance.
- Reader-oriented README, AI contribution guide, release workflow, and version tracking.
