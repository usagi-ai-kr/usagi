# Herdr proposal: adoption and validation checklist

Source: [Issue #1](https://github.com/usagi-ai-kr/usagi/issues/1)  
Disposition: **conditional adoption**. The issue reports approximately 17 PRs created, 12 squash merges and one deployment in one day. These are self-reported operating observations, **not** a controlled productivity or reliability comparison.

## Priorities

| Priority | Required outcome | Example acceptance test |
| --- | --- | --- |
| P0 | Durable callback protocol with explicit `run_id/unit_id/attempt_id/event_id` and idempotency | Deliver same event twice; state changes once |
| P0 | Orchestrator crash/restart reconciliation | Kill orchestrator mid-run; restore ledger and detect orphan work |
| P0 | Authoritative acceptance separate from worker `done` | Worker sends done with missing report; acceptance is refused |
| P1 | Ownership and permission boundaries | Attempt unauthorized path edit or push; reject or flag it |
| P1 | Gate semantics across CI/rebase/review | Change HEAD after approval; prior validation no longer suffices |
| P1 | Bounded rework/escalation and workspace resource isolation | Exhaust rework / collide on port; deterministic escalation |
| P1 | Comparative measurement and reproducibility | Repeat same task set with baseline under matched criteria |
| P2 | Reusable `notify`, `dispatch`, `health` tooling | Contract tests pass on all supported agent backends |

## Proposed phased delivery

1. **Contract:** agree on lifecycle, brief, event envelope, outbox and acceptance invariants.
2. **Reliability prototype:** failure-injection tests for duplicate, delayed, reordered, lost and stale callback; crash recovery and orphan detection.
3. **Dispatch and resource isolation:** agent-specific reset / idle semantics, worktree and port ownership, verification of report artifacts.
4. **Acceptance and CI integration:** independent review, Red→Green evidence, SHA-bound gates, squash workflow.
5. **Multi-repo trial:** collect normalized task counts, time, token spend, rework, reviewer detection and post-merge regressions.

## Questions for Issue #1 author

1. Is there an existing `callbacks.log` schema, deduplication rule and acknowledgement design?
2. Where is state kept when orchestrator session/context is lost?
3. Are worker restrictions (commit/push, owned paths) technically enforced or prompt-only?
4. What constitutes a binding independent review verdict and a re-review trigger?
5. Do reference scripts exist today, or are all three newly proposed work?
6. Can anonymized task-level token, time, rework and post-merge regression data be shared?

## Decision gate

Do **not** label this protocol production-ready or auto-merge an implementation until P0 crash/replay tests pass, authorization boundaries are reviewed, and a second repository reproduces core behavior. This checklist does not assert that those tests have run.
