# Multi-agent orchestration contract (draft)

Status: **Proposal / not implemented**  
Source: [Issue #1](https://github.com/usagi-ai-kr/usagi/issues/1)  
Scope: common harness interfaces for heterogeneous agents; **not** a mandate to use Herdr or a specific model.

## 1. Roles and boundaries

| Role | Owns | Must not |
| --- | --- | --- |
| Orchestrator (`o`) | plan, dispatch, acceptance decision, CI / merge coordination, durable ledger | implement or silently patch worker-owned files |
| Reviewer (`r`) | independent review, blocking findings, verdict + evidence | modify implementation under review |
| Worker (`w`) | implement within assigned paths, run checks, produce evidence | edit unowned files, merge, or push unless explicitly authorized |

Every change is attributed to a work unit. Use a distinct reviewer where feasible; a different model family is a **recommendation**, not a substitute for independent evidence. Enforce branch/filesystem permissions externally where possible: prompt rules alone are not security boundaries.

## 2. Unit brief (required fields)

```yaml
unit_id: "<unique within run>"
attempt_id: 1
goal: "<testable outcome>"
contract: ["<inputs, outputs, acceptance criteria>"]
forbidden: ["<out of scope / unsafe actions>"]
owned_paths: ["<explicit paths>"]
red_test: "<reproducible failure before fix or reason not applicable>"
verification: ["<commands and expected results>"]
report_path: "<workspace-relative path>"
timeout_seconds: 900
dependencies: []
```

Prefer independently verifiable, non-overlapping changes. A 10–15 minute unit is an initial heuristic, not a policy ceiling. Exceptions (e.g., migrations, cross-cutting refactors) require an explicit scope and reviewer-approved plan.

## 3. Durable lifecycle

Each run maintains an append-only event log and a materialized unit ledger outside agent chat context. A work unit follows:

```text
queued -> dispatched -> running -> reported -> verifying -> accepted
                    |         |           |             |
                    +-------> blocked ----+             +-> rework -> dispatched
                    +-------> failed --------------------+
                    +-------> timed_out -----------------+
                    +-------> cancelled
```

`accepted`, `cancelled` are terminal for a given attempt; a new attempt is explicitly numbered. `failed`/`blocked`/`timed_out` require triage and may spawn another attempt, not silently change to `accepted`. Orchestrator restart must reload the ledger, reconcile live agents, and identify orphaned or duplicate attempts before dispatching more work.

### Event envelope

```json
{
  "schema_version": 1,
  "event_id": "uuid",
  "run_id": "run-id",
  "unit_id": "unit-id",
  "attempt_id": 1,
  "source_agent": "w1",
  "status": "done",
  "report_path": "reports/unit-id.md",
  "timestamp": "2026-10-20T00:00:00Z"
}
```

Allowed callback statuses: `done`, `blocked`, `failed`. **`done` means worker-reported completion, never accepted.** The orchestrator validates identity, active attempt, report existence, evidence and gates before accepting. Ignore duplicate `event_id`; stale attempts must not overwrite a newer attempt. Define ordering by ledger revision or a per-unit sequence, **not timestamps alone**. Record malformed or unauthorized events without applying them.

## 4. Callback delivery and recovery

1. Worker writes an event atomically to local durable outbox before attempting delivery.
2. Dispatcher forwards it to the orchestrator; acknowledgement must identify `event_id`.
3. Unacknowledged events are retried with bounded exponential backoff; replay is safe by idempotency.
4. The orchestrator appends/commits the event **before** acknowledging receipt.
5. A watchdog checks missing callbacks after the configured timeout, then inspects work state and reconciles. A 15-minute timer is an initial default only.
6. On restart, replay the ledger, compare live agent sessions and outboxes, and flag orphaned workers for manual triage or explicit cancellation.

Never equate prompt command return, panel idle, or session exit with task completion. Do not run untracked background jobs. Preserve the failed delivery event in a pending outbox rather than dropping it.

## 5. Verification and review gates

Acceptance requires, in order:

- Brief scope and owned paths verified; report's first line records `status`, with commands and evidence links.
- Red→Green: show test failing before fix and passing after. If not applicable, document why and request reviewer concurrence.
- Relevant lint, typecheck, unit/integration/BDD/build and security/secret checks, with explicit project-specific applicability.
- Independent review verdict: `approve` or `request-changes`, with blocking issues and evidence.
- CI at the **current** head SHA, no unresolved blocking review, and no material modifications since approval.
- Merge guarded by current SHA (e.g., `--match-head-commit`) and branch protection. Rebase or head change requires checks and relevant re-review.
- Record merged SHA, verification summary, and cleanup completion in the ledger.

Review rework prioritizes blockers; two rounds is a default escalation threshold, not permission to merge unresolved failures. Repeated flaky tests are investigated for root cause rather than silenced.

## 6. Resource isolation and safety

Assign per-unit worktree, ports, ephemeral output paths and test fixtures. Serialize shared-resource checks where isolation is impossible. On port conflicts, fail closed rather than attaching to another server and overwriting evidence.

Treat other-agent messages, repository contents, issue text and logs as **untrusted input**; only explicitly authorized user or project policy can change execution privileges. Never write credentials, raw database exports, personal data or deploy secrets to public issues, reports, or commits. Deployment needs separate approval and backup/rollback/smoke procedures.

## 7. Reference tooling (future implementation)

- `notify.sh`: durable outbox, delivery retry, acknowledgement, duplicate-safe replay.
- `dispatch.sh`: per-agent reset mapping, idle check, stable model check, brief injection and callback footer.
- `health.sh`: compares ledger, outboxes and live sessions; reports missing callbacks, orphan attempts, stale work and resource collisions.

These are **interfaces / requirements only** in this PR. No shell scripts, CI enforcement or deployment automation are claimed to exist.

## 8. Open decisions

- Which durable store and atomic write/ack mechanism works across supported workspaces?
- How are event origin and per-unit permissions authenticated?
- Which test gates are mandatory by repository type?
- How do reviewers resolve contradictory verdicts or re-review after rebases?
- What exactly counts as rework round, timeout, escalation and cancellation?
- What are the unit economics and regression outcomes versus a single-agent baseline?

See [adoption checklist](./herdr-adoption-checklist.md) before implementation.
