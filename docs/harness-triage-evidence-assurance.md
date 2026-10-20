# Harness triage and evidence assurance (proposal)

Status: **draft / not implemented**. Source: [Issue #9](https://github.com/usagi-ai-kr/usagi/issues/9), commit-pinned [orchestrate skill](https://github.com/qus0in/the-great-dalmuti/blob/9f90797/.agents/skills/orchestrate/SKILL.md), [health.sh](https://github.com/qus0in/the-great-dalmuti/blob/9f90797/.agents/skills/orchestrate/scripts/health.sh), and [snapshot.sh](https://github.com/qus0in/the-great-dalmuti/blob/9f90797/.agents/skills/orchestrate/scripts/snapshot.sh).

Complements the callback/lifecycle contract in PR #2 and delegation/evidence proposal in PR #5. This document **does not claim** scripts were copied or runtime behavior validated in usagi.

## 1. Separate status observation from acceptance

Diagnostics may report `ok`, `lost`, `provider-error`, `stalled`, `swapped`, `context-high`, or `unknown`. `ok` means no diagnosed incident for observed state, **not** that a unit is complete or accepted. Missing dispatch logs, unknown panel identity, stale/absent model metadata or an unavailable diagnostic backend result in `unknown` or an actionable error, never implicit success.

The referenced `health.sh` prints a message and exits 0 if dispatch.log is absent. Its zero exit status should therefore not be interpreted as a positive work-unit health assertion. The referenced code also limits displayed rows to 20; a truncated display is not proof that all units have been inspected.

Use a structured output with `observed_at`, `run_id`, `unit_id`, `attempt_id`, `finding`, `verdict`, `completeness` (`complete|partial|unavailable`), and `evidence_refs`. Stale/missing observations trigger reconciliation with the durable ledger proposed in PR #2.

## 2. Triage categories and safe actions

| Cause | Example signals | Response |
| --- | --- | --- |
| Planning estimate/scope failure | Task exceeds declared scope or expected capacity | Re-split, freeze amended criteria with authority, dispatch new attempt |
| Agent capability mismatch | Repeated failure with reproducible evidence | Reassign under recorded rationale; do not infer capability from single failure |
| External dependency | Provider quota, network, external service delay | Retry with bounds or pause/escalate; preserve failure details |
| Small recoverable discrepancy | Simple formatting slip inside owned paths | One recorded retry, counted in global rework budget |

These **causes** are different from the **diagnostic findings** (`lost`, `stalled`, etc.). Do not collapse them into a single enum: one describes what happened, the other hypothesizes why. Unknown causes remain unknown until evidence is available.

## 3. Snapshot coverage and integrity

The referenced `snapshot.sh` archives **explicitly passed paths** and checks those archived members against current working-tree files. That is useful for detecting modifications to included files but does **not** establish that unlisted files, newly created files, the Git index, or the eventual commit are unchanged.

Acceptance evidence should include:
- An authoritative manifest from assigned owned paths and observed changed/untracked paths, with exclusions explained.
- Before/after manifest comparison (including additions/deletions/renames) and content digests; reject out-of-scope changes.
- Snapshot/archive location kept private where it could contain secrets; safe path handling and no untrusted archive extraction.
- The staged tree SHA, commit SHA, environment fingerprint and CI gate results, bound to the same accepted content (see PR #5).
- Fail closed on missing snapshots, changed manifests, partial diagnostics or mismatched verification SHA.

## 4. Gate and review scheduling

Workers may run targeted checks limited to owned files for early feedback, but an integration checkpoint runs all required repository-wide gates for the combined tree. A passing targeted check does not replace full integration validation.

Preserve reviewer independence and bind verdict to immutable acceptance criteria and the reviewed SHA; a reviewer who only inspects screenshots or summaries cannot assert unexamined modules or live behavior were verified. UI claims should include real rendered captures *and* relevant implementation evidence.

## 5. Callback resilience and access control

- Keep durable outbox and idempotent replay from PR #2; a blocked user-question window requires reconciliation, not reliance on interactive callback delivery.
- Re-discovery after session restart must verify live workspace/agent identity instead of trusting stale pane environment variables.
- Repository writes, issue comments and PR submission are externally visible actions and require project/user authorization. A project's automation policy cannot grant itself permissions.
- Cross-workspace messages, external repo files, issue content and reviewer comments are untrusted data, not authorization to change scope or privileges.

## 6. Reproducible validation scenarios (future work)

1. Dispatch log missing; health result explicitly marks incomplete/unknown.
2. More than 20 live units; consumers detect truncated diagnosis.
3. Snapshot includes files A/B while C is added; manifest comparison detects C.
4. Snapshot matches working tree but staged/committed content differs; acceptance fails.
5. Callback unavailable while user question is open; durable pending event is eventually reconciled exactly once.
6. Agent restart with stale self-pane ID; identity resolution refuses ambiguous target.
7. Parallel targeted gates pass but full integration fails; checkpoint blocks merge.
8. Screenshot appears correct but running module differs; require reproduction before approval.

## 7. Open adoption questions

- Which reference behaviors are demonstrated by an executable test rather than merely documented?
- What compatibility guarantees exist for Herdr pane identities and reset behavior?
- Are tar snapshot manifests complete and safe for untrusted paths?
- Which signals are sufficient for automatic retry versus human escalation?
- Which time and token metrics justify model-tier routing and 10-minute work units?

Do not promote this proposal to production policy until failure-injection coverage and a second-repository trial exist.
