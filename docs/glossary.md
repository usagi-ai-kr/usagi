# Glossary Index (용어 인덱스)

이 문서는 용어집의 **인덱스**입니다. 정의는 카테고리별 문서에 있고, 이 페이지는 전체 용어를 알파벳순으로 나열합니다.

- 저장소 원본: [docs/glossary/](https://github.com/usagi-ai-kr/usagi/tree/main/docs/glossary)
- 위키 게시본: [Glossary](https://github.com/usagi-ai-kr/usagi/wiki/Glossary)
- 사람이 읽는 안내: [하네스 엔지니어링이란?](https://github.com/usagi-ai-kr/usagi/wiki/What-is-Harness-Engineering) · [운영 플로우](https://github.com/usagi-ai-kr/usagi/wiki/Workflows)

## 카테고리

| 카테고리 | 문서 | 용어 수 |
| --- | --- | --- |
| 오케스트레이션 | [Orchestration](glossary/orchestration.md) | 27 |
| 신뢰성 | [Reliability](glossary/reliability.md) | 22 |
| Git·CI | [Git & CI](glossary/git-ci.md) | 16 |
| 테스트·품질 | [Testing & Quality](glossary/testing-quality.md) | 10 |
| 문서·운영 | [Documentation & Operations](glossary/operations.md) | 9 |

- **오케스트레이션** — 에이전트 역할, 작업 분배, 콜백, 소유권, 리뷰 체인처럼 누가 무엇을 하는가에 관한 용어.
- **신뢰성** — 원장, 아웃박스, 멱등성, 재조정처럼 중단·중복·유실에도 상태를 지키는 용어.
- **Git·CI** — 브랜치, SHA, 병합, CI, 브랜치 보호처럼 변경을 전달하는 경로의 용어.
- **테스트·품질** — Red→Green, 회귀, 플레이크, BDD, Lighthouse처럼 품질을 확인하는 용어.
- **문서·운영** — 용어집, 레이블, ADR, runbook, 위키처럼 문서와 운영을 지탱하는 용어.

## 전체 용어 A–Z

### A

- [acceptance criteria](glossary/reliability.md#acceptance-criteria) — 신뢰성
- [acceptance gate](glossary/reliability.md#acceptance-gate) — 신뢰성
- [ack](glossary/reliability.md#ack) — 신뢰성
- [ADR](glossary/operations.md#adr) — 문서·운영
- [agent backend](glossary/orchestration.md#agent-backend) — 오케스트레이션
- [atomic write](glossary/reliability.md#atomic-write) — 신뢰성

### B

- [BDD](glossary/testing-quality.md#bdd) — 테스트·품질
- [bisect](glossary/testing-quality.md#bisect) — 테스트·품질
- [branch protection](glossary/git-ci.md#branch-protection) — Git·CI
- [brief](glossary/orchestration.md#brief) — 오케스트레이션

### C

- [callback](glossary/orchestration.md#callback) — 오케스트레이션
- [check](glossary/git-ci.md#check) — Git·CI
- [checkpoint](glossary/reliability.md#checkpoint) — 신뢰성
- [CI](glossary/git-ci.md#ci) — Git·CI
- [CI loop](glossary/git-ci.md#ci-loop) — Git·CI
- [commit bundle](glossary/git-ci.md#commit-bundle) — Git·CI
- [cross-review](glossary/orchestration.md#cross-review) — 오케스트레이션

### D

- [delegation](glossary/orchestration.md#delegation) — 오케스트레이션
- [dispatch](glossary/orchestration.md#dispatch) — 오케스트레이션
- [draft PR](glossary/git-ci.md#draft-pr) — Git·CI

### E

- [environment fingerprint](glossary/reliability.md#environment-fingerprint) — 신뢰성
- [escalation](glossary/orchestration.md#escalation) — 오케스트레이션
- [event envelope](glossary/reliability.md#event-envelope) — 신뢰성
- [evidence provenance](glossary/reliability.md#evidence-provenance) — 신뢰성

### F

- [failure injection](glossary/reliability.md#failure-injection) — 신뢰성
- [fallback timer](glossary/reliability.md#fallback-timer) — 신뢰성
- [flake / flaky test](glossary/testing-quality.md#flake-flaky-test) — 테스트·품질

### G

- [gate](glossary/reliability.md#gate) — 신뢰성
- [gate sequence](glossary/reliability.md#gate-sequence) — 신뢰성
- [glossary](glossary/operations.md#glossary) — 문서·운영

### H

- [handoff](glossary/orchestration.md#handoff) — 오케스트레이션
- [harness](glossary/orchestration.md#harness) — 오케스트레이션
- [head SHA](glossary/git-ci.md#head-sha) — Git·CI
- [health check](glossary/reliability.md#health-check) — 신뢰성
- [Herdr](glossary/orchestration.md#herdr) — 오케스트레이션

### I

- [idempotency](glossary/reliability.md#idempotency) — 신뢰성

### L

- [label](glossary/operations.md#label) — 문서·운영
- [ledger](glossary/reliability.md#ledger) — 신뢰성
- [Lighthouse](glossary/testing-quality.md#lighthouse) — 테스트·품질
- [lint](glossary/testing-quality.md#lint) — 테스트·품질

### M

- [manifest](glossary/reliability.md#manifest) — 신뢰성
- [match-head-commit](glossary/git-ci.md#match-head-commit) — Git·CI
- [MECE](glossary/operations.md#mece) — 문서·운영
- [merge commit](glossary/git-ci.md#merge-commit) — Git·CI
- [model family](glossary/orchestration.md#model-family) — 오케스트레이션
- [model tier](glossary/orchestration.md#model-tier) — 오케스트레이션

### O

- [orchestrator](glossary/orchestration.md#orchestrator) — 오케스트레이션
- [orphan](glossary/reliability.md#orphan) — 신뢰성
- [outbox](glossary/reliability.md#outbox) — 신뢰성
- [ownership](glossary/orchestration.md#ownership) — 오케스트레이션

### P

- [P0/P1/P2](glossary/operations.md#p0-p1-p2) — 문서·운영
- [packet](glossary/orchestration.md#packet) — 오케스트레이션
- [panel](glossary/orchestration.md#panel) — 오케스트레이션
- [permalink](glossary/operations.md#permalink) — 문서·운영
- [polling](glossary/orchestration.md#polling) — 오케스트레이션
- [port collision](glossary/orchestration.md#port-collision) — 오케스트레이션
- [PR](glossary/git-ci.md#pr) — Git·CI

### R

- [rebase](glossary/git-ci.md#rebase) — Git·CI
- [reconciliation](glossary/reliability.md#reconciliation) — 신뢰성
- [Red→Green](glossary/testing-quality.md#red-green) — 테스트·품질
- [regression](glossary/testing-quality.md#regression) — 테스트·품질
- [replay](glossary/reliability.md#replay) — 신뢰성
- [review chain](glossary/orchestration.md#review-chain) — 오케스트레이션
- [reviewer](glossary/orchestration.md#reviewer) — 오케스트레이션
- [rework](glossary/orchestration.md#rework) — 오케스트레이션
- [runbook](glossary/operations.md#runbook) — 문서·운영

### S

- [scope freeze](glossary/orchestration.md#scope-freeze) — 오케스트레이션
- [session reset / context reset](glossary/orchestration.md#session-reset-context-reset) — 오케스트레이션
- [SHA](glossary/git-ci.md#sha) — Git·CI
- [smoke test](glossary/testing-quality.md#smoke-test) — 테스트·품질
- [snapshot](glossary/reliability.md#snapshot) — 신뢰성
- [squash merge](glossary/git-ci.md#squash-merge) — Git·CI
- [stacked PR](glossary/git-ci.md#stacked-pr) — Git·CI
- [staged tree](glossary/git-ci.md#staged-tree) — Git·CI
- [structured I/O](glossary/orchestration.md#structured-i-o) — 오케스트레이션
- [subagent](glossary/orchestration.md#subagent) — 오케스트레이션

### T

- [token](glossary/operations.md#token) — 문서·운영
- [triage](glossary/orchestration.md#triage) — 오케스트레이션
- [typecheck](glossary/testing-quality.md#typecheck) — 테스트·품질

### U

- [unit / work unit](glossary/orchestration.md#unit-work-unit) — 오케스트레이션

### V

- [viewport](glossary/testing-quality.md#viewport) — 테스트·품질

### W

- [watchdog](glossary/reliability.md#watchdog) — 신뢰성
- [wiki](glossary/operations.md#wiki) — 문서·운영
- [worktree](glossary/git-ci.md#worktree) — Git·CI

## 용어 추가하기

1. `docs/glossary/`의 해당 카테고리 문서에 `<a id="term"></a>` + `## term` 형식으로 추가합니다.
2. `node scripts/build-glossary-index.mjs`로 이 인덱스를 다시 생성합니다.
3. `node scripts/validate.mjs`와 `./scripts/sync-wiki.sh`를 실행합니다.

이 파일은 `scripts/build-glossary-index.mjs`가 생성합니다. 직접 편집하지 마세요.
