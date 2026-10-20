# Delegation, handoff and verification evidence (proposal)

Status: **draft specification, not enforced**. Source: [Issue #3](https://github.com/usagi-ai-kr/usagi/issues/3) (yoroi). Complements [PR #2](https://github.com/usagi-ai-kr/usagi/pull/2); does not reproduce its callback protocol or lifecycle.

## 1. Orchestrator delegation boundary

The orchestrator (`o`) may inspect status, inspect logs, plan, assign, accept or reject work, and perform authorized merge operations. It must delegate repository artifact changes (code, tests, documentation, configuration) to an assigned worker (`w`). A "quick fix" is not an exception. Reviewer (`r`) supplies independent verification; a blocking verdict cannot be silently overridden by `o`. Escalation or reviewer replacement must be recorded with rationale and a fresh review.

This distinguishes **read-only inspection** from **artifact modification**, rather than relying on duration or number of commands.

## 2. Worker-authored handoff packet

Workers may **propose** follow-up tasks, but cannot dispatch or approve their own proposals. Suggested machine-readable envelope:

```yaml
proposal_id: "<unique ID>"
parent_unit_id: "<source task>"
proposed_by: "w1"
objective: "<measurable goal>"
acceptance_criteria: ["<specific observable result>"]
owned_paths: ["<candidate exclusive paths>"]
forbidden_actions: ["<out of scope>"]
dependencies: ["<units/decisions>"]
evidence: ["<report/test references>"]
status: proposed
```

The orchestrator reviews scope, acceptance criteria, path ownership and priorities; records `approved`/`rejected` or `needs_changes` with attribution; and only then creates a dispatchable work unit with a separate `unit_id`. These states describe **proposal approval**, not the execution lifecycle defined by PR #2.

## 3. File ownership and conflict resolution

- Exactly one active **write owner per repository path and conflicting shared resource**; other workers may read, not write.
- The orchestrator records path ownership by unit/attempt, including ownership transfer reason and time.
- For a shared config or interface file, serialize edits or designate an integration worker; no overlapping concurrent writes.
- Enforce via isolated worktrees and path-diff checks. Prompt-only restrictions are advisory, not a security boundary.
- Escalate ownership violations; never silently include unauthorized files in the acceptance diff.

## 4. Evidence validity and commit binding

The reported yoroi #188 full-suite regression after focused tests and #180 omitted files during explicit `git add` indicate separate gaps: **coverage** and **commit content provenance**. Grouping commits alone does not prevent either.

A verification record should capture:

```yaml
source_commit: "<SHA or null before first commit>"
staged_tree_sha: "<git write-tree output>"
committed_sha: "<commit SHA verified for integration>"
commands: ["<exact validation commands>"]
environment_fingerprint: "<toolchain, lockfile and relevant service/config versions>"
results: ["<exit status and immutable artifact reference>"]
review_verdict: "approve|request-changes"
reviewed_commit_sha: "<SHA>"
```

### Gate sequence

1. Worker finishes changes and lists all intended paths; check for untracked and unstaged additions, especially when using path-specific `git add`.
2. Stage the intended content, inspect `git diff --cached --name-status` and `git diff --cached --check`, and record the staged tree SHA.
3. Run focused and required full validation against the content intended for commit. When a command reads the working tree instead of the index, require a clean, isolated tree matching staged content; otherwise **do not claim the staged tree was tested**.
4. Commit the approved staged tree; verify the commit tree equals recorded staged tree, and that the required paths were included.
5. Run CI on the **actual commit SHA** (not merely a previous local working tree). Bind independent review to that SHA. A new commit, rebase, relevant dependency change or environment change invalidates affected evidence and triggers new checks/re-review.
6. Merge only at the checked and approved head SHA, honoring branch protection and blocking review.

For external mutable services, SHA equality alone is insufficient: document the environmental assumptions, and re-run affected integration tests if those assumptions change.

## 5. Trial rules and measurable evaluation

- The reported "five-minute packet" and "one grouped commit per unit batch" are hypotheses, **not universal limits**. Record exceptions explicitly.
- Compare equivalent tasks under single-agent and delegated workflows using: completed acceptance criteria, elapsed time, token/tool cost, full-suite failure rate, omitted-file incidents, review defects found and post-merge regressions.
- Record task definition, repository/toolchain, concurrency, and model family to make comparisons interpretable.
- Distinguish in reporting: `observed_in_yoroi`, `documented_policy`, and `proposed_unvalidated`. Do not promote a documented rule to a verified runtime behavior.

## 6. Open questions before implementation

1. Can the author provide sanitized reproduction details for yoroi #188 and #180, including what was tested and committed?
2. Where is exclusive path ownership recorded and how is a transfer acknowledged?
3. What review escalation process applies to conflicting or unavailable reviewers?
4. How are working-tree and index consistency validated in current tooling?
5. What are the actual preconditions for reusing verification evidence?
6. Which agent backends are supported without copying workspace-specific model, session or pane identifiers?

This document adds the distinctive delegation and evidence-provenance requirements from Issue #3. Runtime enforcement and CI integration remain separate implementation work.
