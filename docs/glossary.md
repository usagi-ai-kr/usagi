# Glossary (용어집)

이 문서는 [Issue #1](https://github.com/usagi-ai-kr/usagi/issues/1)과 [PR #2](https://github.com/usagi-ai-kr/usagi/pull/2)를 읽을 때 낯설 수 있는 용어를 빠르게 찾기 위한 사전입니다. 특정 도구나 모델에 종속되지 않는 공통 의미를 먼저 적고, 이 저장소에서 실제로 쓰인 맥락을 덧붙였습니다.

- 저장소 원본: [`docs/glossary.md`](https://github.com/usagi-ai-kr/usagi/blob/main/docs/glossary.md)
- 위키 게시본: [Glossary](https://github.com/usagi-ai-kr/usagi/wiki/Glossary)
- 읽는 순서: [Issue #1](https://github.com/usagi-ai-kr/usagi/issues/1) → [PR #2](https://github.com/usagi-ai-kr/usagi/pull/2) → 이 용어집

## 읽는 법

- **용어**: 영어 원어와 한국어 표기를 함께 적었습니다.
- **분류**: 오케스트레이션 / 신뢰성 / Git·CI / 테스트·품질 / 문서·운영.
- **이슈/PR에서**: 실제로 등장한 위치를 가리킵니다. 링크는 GitHub 절대 URL이라 저장소와 위키 어디서든 동작합니다.

## A–Z

| 용어 | 분류 | 뜻 | 이슈/PR에서 |
| --- | --- | --- | --- |
| **acceptance gate** (수락 게이트) | 신뢰성 | 작업을 `accepted`로 확정하기 전에 통과해야 하는 검증 묶음. 보고서·증거·CI·독립 리뷰가 모두 현재 head SHA를 기준으로 확인되어야 합니다. | [PR #2](https://github.com/usagi-ai-kr/usagi/pull/2) §5 |
| **ack** (확인 응답) | 신뢰성 | 이벤트를 수신했다는 명시적 응답. `event_id`를 식별자로 포함하며, 원장에 기록되기 전에는 ack하지 않습니다. | [PR #2](https://github.com/usagi-ai-kr/usagi/pull/2) §4 |
| **ADR** (Architecture Decision Record) | 문서·운영 | 중요한 설계 결정의 배경·대안·결과를 남기는 짧은 기록. Issue #1에 언급된 moi ADR-0042가 예시입니다. | [Issue #1](https://github.com/usagi-ai-kr/usagi/issues/1) 제안 |
| **agent backend** (에이전트 백엔드) | 오케스트레이션 | opencode·Claude·agy처럼 에이전트를 구동하는 도구와 모델의 조합. 백엔드마다 컨텍스트 리셋 명령과 idle 판정이 다릅니다. | [Issue #1](https://github.com/usagi-ai-kr/usagi/issues/1) 주의 2 |
| **atomic write** (원자적 쓰기) | 신뢰성 | 파일이 완전히 기록되거나 전혀 기록되지 않도록 하는 쓰기 방식. 콜백 이벤트를 outbox에 먼저 남길 때 사용합니다. | [PR #2](https://github.com/usagi-ai-kr/usagi/pull/2) §4 |
| **BDD** (Behavior-Driven Development) | 테스트·품질 | 사용자 행동 시나리오를 자연어에 가깝게 기술하고 자동화하는 테스트 방식. | [PR #2](https://github.com/usagi-ai-kr/usagi/pull/2) §5 |
| **bisect** (이분 탐색) | 테스트·품질 | 문제를 일으킨 커밋을 이진 탐색으로 좁히는 git 기법. Lighthouse 회귀 원인 추적에 사용했습니다. | [Issue #1](https://github.com/usagi-ai-kr/usagi/issues/1) §6 |
| **branch protection** (브랜치 보호) | Git·CI | `main` 직접 push·force push·삭제를 막고 PR·CI·리뷰 조건을 강제하는 GitHub 설정. | [`CONTRIBUTING.md`](https://github.com/usagi-ai-kr/usagi/blob/main/CONTRIBUTING.md) |
| **brief** (브리프) | 오케스트레이션 | 워커에게 보내는 압축형 작업 지시서. 목표·계약·금지·소유 파일·Red→Green 테스트·검증 명령·보고 경로를 담습니다. | [Issue #1](https://github.com/usagi-ai-kr/usagi/issues/1) §3 |
| **callback** (콜백) | 오케스트레이션 | 워커가 `done`·`blocked`·`failed` 상태를 오케스트레이터에 알리는 이벤트. 폴링을 대체합니다. | [Issue #1](https://github.com/usagi-ai-kr/usagi/issues/1) §2, [PR #2](https://github.com/usagi-ai-kr/usagi/pull/2) §3 |
| **CI** (Continuous Integration) | Git·CI | push/PR마다 빌드·테스트·검사를 자동 실행하는 파이프라인. 이 저장소는 `validate` job 하나로 문서·용어집·레이블을 검사합니다. | [`.github/workflows/ci.yml`](https://github.com/usagi-ai-kr/usagi/blob/main/.github/workflows/ci.yml) |
| **cross-review** (교차 리뷰) | 오케스트레이션 | 작성자와 다른 모델이나 사람이 리뷰해 동일 모델의 맹점을 줄이는 방식. | [Issue #1](https://github.com/usagi-ai-kr/usagi/issues/1) §1 |
| **dispatch** (디스패치) | 오케스트레이션 | 작업 단위를 워커에게 배정하고 브리프를 전달하는 행위. | [Issue #1](https://github.com/usagi-ai-kr/usagi/issues/1) §1 |
| **draft PR** | Git·CI | 병합 준비가 끝나지 않은 PR. GitHub에서 draft로 표시해 리뷰·병합을 보류합니다. | [PR #2](https://github.com/usagi-ai-kr/usagi/pull/2) |
| **escalation** (에스컬레이션) | 오케스트레이션 | 재작업 한도 초과·차단·자원 충돌 시 상위 판단자에게 넘기는 절차. | [PR #2](https://github.com/usagi-ai-kr/usagi/pull/2) §5 |
| **event envelope** (이벤트 봉투) | 신뢰성 | 콜백 이벤트의 공통 메타데이터. `schema_version`·`event_id`·`run_id`·`unit_id`·`attempt_id`·`status` 등을 담습니다. | [PR #2](https://github.com/usagi-ai-kr/usagi/pull/2) §3 |
| **failure injection** (장애 주입) | 신뢰성 | 중복·지연·순서 뒤바뀜·유실·오래된 콜백을 일부러 만들어 복구 동작을 검증하는 기법. | [PR #2](https://github.com/usagi-ai-kr/usagi/pull/2) §2 |
| **flake / flaky test** (플레이크) | 테스트·품질 | 같은 코드에서도 간헐적으로 실패하는 테스트. `waitFor`로 숨기지 말고 원인을 고칩니다. | [Issue #1](https://github.com/usagi-ai-kr/usagi/issues/1) 주의 5 |
| **gate** (게이트) | 신뢰성 | 다음 단계로 넘어가기 전에 통과해야 하는 검사. 수락 게이트·CI 게이트 등이 있습니다. | [PR #2](https://github.com/usagi-ai-kr/usagi/pull/2) §5 |
| **glossary** (용어집) | 문서·운영 | 이 문서. 이슈/PR에서 낯선 용어를 빠르게 찾기 위한 사전입니다. | [`docs/glossary.md`](https://github.com/usagi-ai-kr/usagi/blob/main/docs/glossary.md) |
| **harness** (하네스) | 오케스트레이션 | 여러 에이전트의 역할·지시·콜백·검증·병합을 묶어 운용하는 실행 환경과 규약. Herdr는 그중 하나입니다. | [Issue #1](https://github.com/usagi-ai-kr/usagi/issues/1) |
| **head SHA** | Git·CI | PR 브랜치의 현재 최신 커밋 해시. 리뷰·CI가 검증한 코드와 병합 대상이 같은지 확인하는 기준입니다. | [PR #2](https://github.com/usagi-ai-kr/usagi/pull/2) §5 |
| **Herdr** | 오케스트레이션 | 코딩 에이전트용 터미널 멀티플렉서. 패널·에이전트 프롬프트·콜백 전달에 사용합니다. | [Issue #1](https://github.com/usagi-ai-kr/usagi/issues/1) |
| **idempotency** (멱등성) | 신뢰성 | 같은 이벤트를 여러 번 처리해도 상태가 한 번만 바뀌는 성질. 중복 콜백 재전송의 안전 근거입니다. | [PR #2](https://github.com/usagi-ai-kr/usagi/pull/2) §3–4 |
| **label** (레이블) | 문서·운영 | 이슈/PR에 붙이는 분류 태그. 이 저장소는 `type:*` 1개와 `status:*` 1개를 정확히 하나씩 붙입니다. | [`CONTRIBUTING.md`](https://github.com/usagi-ai-kr/usagi/blob/main/CONTRIBUTING.md) |
| **ledger** (원장) | 신뢰성 | 작업 단위의 상태·시도·이벤트를 append-only로 기록한 durable 저장소. 채팅 컨텍스트 밖에 둡니다. | [PR #2](https://github.com/usagi-ai-kr/usagi/pull/2) §3 |
| **Lighthouse** | 테스트·품질 | 웹 성능·접근성·SEO 점수를 측정하는 도구. 회귀 비교에 사용합니다. | [Issue #1](https://github.com/usagi-ai-kr/usagi/issues/1) §6 |
| **lint** | 테스트·품질 | 코드 스타일과 잠재 오류를 자동 검사하는 단계. | [PR #2](https://github.com/usagi-ai-kr/usagi/pull/2) §5 |
| **match-head-commit** | Git·CI | `gh pr merge`에서 병합 직전에 PR head SHA가 지정값과 같은지 확인하는 옵션. 승인 후 커밋 변경을 막습니다. | [PR #2](https://github.com/usagi-ai-kr/usagi/pull/2) §5 |
| **MECE** | 문서·운영 | Mutually Exclusive, Collectively Exhaustive. 분류가 서로 겹치지 않고 전체를 빠짐없이 덮는 원칙. 이 저장소의 레이블 체계에 적용했습니다. | [`CONTRIBUTING.md`](https://github.com/usagi-ai-kr/usagi/blob/main/CONTRIBUTING.md) |
| **merge commit** | Git·CI | 두 브랜치의 이력을 합치는 커밋. 이 저장소는 선형 기록을 위해 squash merge를 기본으로 합니다. | [`CONTRIBUTING.md`](https://github.com/usagi-ai-kr/usagi/blob/main/CONTRIBUTING.md) |
| **model family** (모델 패밀리) | 오케스트레이션 | 같은 계열의 모델 묶음. 리뷰는 가능하면 다른 패밀리로 교차하는 것이 권장됩니다. | [Issue #1](https://github.com/usagi-ai-kr/usagi/issues/1) §1 |
| **orchestrator** (오케스트레이터, o) | 오케스트레이션 | 계획·분배·수락 판정·CI/병합을 담당하는 역할. 직접 구현하거나 워커 소유 파일을 고치지 않습니다. | [PR #2](https://github.com/usagi-ai-kr/usagi/pull/2) §1 |
| **orphan** (고아 작업) | 신뢰성 | 재시작 등으로 추적이 끊긴 워커나 시도. 원장과 실제 세션을 대조해 찾아냅니다. | [PR #2](https://github.com/usagi-ai-kr/usagi/pull/2) §4 |
| **outbox** (아웃박스) | 신뢰성 | 전송 전 이벤트를 먼저 저장하는 로컬 큐. 전송 실패 시 pending으로 남겨 재전송합니다. | [PR #2](https://github.com/usagi-ai-kr/usagi/pull/2) §4 |
| **ownership** (소유권) | 오케스트레이션 | 작업 단위가 수정할 수 있는 파일·경로의 범위. 충돌을 막기 위해 브리프에 명시합니다. | [PR #2](https://github.com/usagi-ai-kr/usagi/pull/2) §1–2 |
| **P0/P1/P2** | 문서·운영 | 우선순위 등급. P0는 프로토콜 신뢰성의 필수 선행 조건, P1은 도입 전 권장, P2는 후속 도구입니다. | [PR #2](https://github.com/usagi-ai-kr/usagi/pull/2) 체크리스트 |
| **panel** (패널) | 오케스트레이션 | Herdr에서 에이전트 세션이 보이는 창. 다른 워크스페이스의 메시지가 입력으로 도착할 수 있습니다. | [Issue #1](https://github.com/usagi-ai-kr/usagi/issues/1) 주의 10 |
| **polling** (폴링) | 오케스트레이션 | 상태를 주기적으로 물어보는 방식. 이 하네스는 콜백으로 대체하고 폴백 타이머만 둡니다. | [Issue #1](https://github.com/usagi-ai-kr/usagi/issues/1) §2 |
| **port collision** (포트 충돌) | 오케스트레이션 | 여러 워커가 같은 포트를 쓰려다 실패하는 상황. 포트를 단위별로 나누고 충돌 시 fail closed 합니다. | [Issue #1](https://github.com/usagi-ai-kr/usagi/issues/1) 주의 7 |
| **PR** (Pull Request) | Git·CI | 변경 사항을 `main`에 합치기 전에 리뷰와 CI를 거치는 제안. | [`CONTRIBUTING.md`](https://github.com/usagi-ai-kr/usagi/blob/main/CONTRIBUTING.md) |
| **rebase** | Git·CI | 커밋을 새 base 위로 다시 쌓는 git 작업. 스택 PR에서 하위 PR 병합 후 상위 PR을 옮길 때 사용합니다. | [Issue #1](https://github.com/usagi-ai-kr/usagi/issues/1) 주의 6 |
| **reconciliation** (재조정) | 신뢰성 | 재시작 후 원장·아웃박스·실제 세션을 대조해 상태를 맞추는 절차. | [PR #2](https://github.com/usagi-ai-kr/usagi/pull/2) §4 |
| **Red→Green** | 테스트·품질 | 수정 전에는 실패(Red), 수정 후에는 통과(Green)하는 테스트 증거. 새 테스트가 수정 전에도 통과하면 의미가 없습니다. | [Issue #1](https://github.com/usagi-ai-kr/usagi/issues/1) 주의 4 |
| **regression** (회귀) | 테스트·품질 | 기존에 동작하던 기능이 변경으로 다시 깨지는 것. | [PR #2](https://github.com/usagi-ai-kr/usagi/pull/2) 체크리스트 |
| **replay** (재생) | 신뢰성 | 저장된 이벤트를 다시 처리해 상태를 복구하는 것. 멱등성 덕분에 안전합니다. | [PR #2](https://github.com/usagi-ai-kr/usagi/pull/2) §4 |
| **reviewer** (리뷰어, r) | 오케스트레이션 | 구현을 수정하지 않고 독립적으로 검토해 `approve` 또는 `request-changes` 판정을 내리는 역할. | [PR #2](https://github.com/usagi-ai-kr/usagi/pull/2) §1 |
| **rework** (재작업) | 오케스트레이션 | 리뷰 차단 사항을 작성자에게 돌려보내 고치는 라운드. 기본 2회 후 에스컬레이션합니다. | [Issue #1](https://github.com/usagi-ai-kr/usagi/issues/1) §4 |
| **runbook** | 문서·운영 | 배포·장애 대응 절차를 순서대로 적은 문서. 백업→마이그레이션→배포→스모크→롤백 순으로 구성합니다. | [Issue #1](https://github.com/usagi-ai-kr/usagi/issues/1) §6 |
| **session reset** (세션 리셋) | 오케스트레이션 | 에이전트 컨텍스트를 비우는 명령. opencode는 `/new`, agy·Claude는 `/clear`를 쓰고, 리셋 후 idle을 확인합니다. | [Issue #1](https://github.com/usagi-ai-kr/usagi/issues/1) 주의 2 |
| **SHA** | Git·CI | Git 커밋을 가리키는 해시. CI·리뷰·병합이 같은 코드를 보게 하는 식별자입니다. | [PR #2](https://github.com/usagi-ai-kr/usagi/pull/2) §5 |
| **smoke test** (스모크 테스트) | 테스트·품질 | 배포 직후 핵심 경로가 살아 있는지 빠르게 확인하는 최소 테스트. | [Issue #1](https://github.com/usagi-ai-kr/usagi/issues/1) §6 |
| **squash merge** | Git·CI | PR의 여러 커밋을 하나로 합쳐 `main`에 병합하는 방식. 이 저장소의 기본 병합 방식입니다. | [`CONTRIBUTING.md`](https://github.com/usagi-ai-kr/usagi/blob/main/CONTRIBUTING.md) |
| **stacked PR** (스택 PR) | Git·CI | 하위 PR 위에 상위 PR을 쌓는 방식. 하위가 squash되면 상위를 `git rebase --onto`로 옮깁니다. | [Issue #1](https://github.com/usagi-ai-kr/usagi/issues/1) 주의 6 |
| **token** (토큰) | 문서·운영 | 모델이 처리하는 텍스트 단위. 컨텍스트 크기와 비용을 재는 지표이며, 인증 토큰과 다릅니다. | [Issue #1](https://github.com/usagi-ai-kr/usagi/issues/1) §3 |
| **typecheck** | 테스트·품질 | 타입 오류를 실행 전에 검사하는 단계. | [PR #2](https://github.com/usagi-ai-kr/usagi/pull/2) §5 |
| **unit / work unit** (작업 단위) | 오케스트레이션 | 독립적으로 검증 가능한 최소 작업 묶음. 10~15분은 초기 휴리스틱일 뿐 상한이 아닙니다. | [PR #2](https://github.com/usagi-ai-kr/usagi/pull/2) §2 |
| **viewport** | 테스트·품질 | 브라우저 화면 크기. 반응형 회귀를 확인하려 여러 viewport에서 스크린샷을 찍습니다. | [Issue #1](https://github.com/usagi-ai-kr/usagi/issues/1) §6 |
| **watchdog** | 신뢰성 | 콜백이 없는 작업을 일정 시간 후 감지해 triage하는 감시 장치. 15분 타이머는 기본값입니다. | [PR #2](https://github.com/usagi-ai-kr/usagi/pull/2) §4 |
| **wiki** | 문서·운영 | GitHub 저장소와 별도 git 저장소로 관리되는 문서 공간. 이 저장소는 용어집을 게시합니다. | [`docs/wiki/Home.md`](https://github.com/usagi-ai-kr/usagi/blob/main/docs/wiki/Home.md) |
| **worktree** | Git·CI | 같은 저장소를 여러 디렉터리에서 동시에 체크아웃하는 git 기능. 병렬 워커의 작업 공간입니다. | [Issue #1](https://github.com/usagi-ai-kr/usagi/issues/1) 주의 7 |

## 용어 추가하기

1. `docs/glossary.md`의 표에 알파벳 순서로 한 줄을 추가합니다.
2. `node scripts/validate.mjs`로 표 형식·중복·정렬을 검사합니다.
3. `./scripts/sync-wiki.sh`로 위키의 `Glossary` 페이지를 갱신합니다.

위키의 `Glossary` 페이지는 이 파일에서 생성됩니다. 위키에서 직접 고치면 다음 동기화 때 덮어써지므로, 반드시 이 파일을 수정하세요.
