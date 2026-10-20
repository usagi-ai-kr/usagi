# Glossary — Reliability (신뢰성)

[← Index](../glossary.md)

원장, 아웃박스, 멱등성, 재조정처럼 중단·중복·유실에도 상태를 지키는 용어.

<a id="acceptance-criteria"></a>
## acceptance criteria

**AC · 수용 기준**

작업이 완료로 인정받기 위해 충족해야 하는 조건. 수락 게이트는 이 조건을 검사하는 절차이고, AC는 그 기준 자체를 뜻합니다.

참고: [Issue #3](https://github.com/usagi-ai-kr/usagi/issues/3) 제안

<a id="acceptance-gate"></a>
## acceptance gate

**수락 게이트**

작업을 `accepted`로 확정하기 전에 통과해야 하는 검증 묶음. 보고서·증거·CI·독립 리뷰가 모두 현재 head SHA를 기준으로 확인되어야 합니다.

참고: [PR #2](https://github.com/usagi-ai-kr/usagi/pull/2) §5

<a id="ack"></a>
## ack

**확인 응답**

이벤트를 수신했다는 명시적 응답. `event_id`를 식별자로 포함하며, 원장에 기록되기 전에는 ack하지 않습니다.

참고: [PR #2](https://github.com/usagi-ai-kr/usagi/pull/2) §4

<a id="atomic-write"></a>
## atomic write

**원자적 쓰기**

파일이 완전히 기록되거나 전혀 기록되지 않도록 하는 쓰기 방식. 콜백 이벤트를 outbox에 먼저 남길 때 사용합니다.

참고: [PR #2](https://github.com/usagi-ai-kr/usagi/pull/2) §4

<a id="checkpoint"></a>
## checkpoint

**체크포인트**

부분 게이트를 넘어 저장소 전체 게이트를 한 번에 실행하는 동기화 지점. 병렬 단위가 서로의 검사를 막지 않도록, 통합 시점에 전체 검증을 수행합니다.

참고: [PR #12](https://github.com/usagi-ai-kr/usagi/pull/12) §4

<a id="environment-fingerprint"></a>
## environment fingerprint

**환경 지문**

툴체인·lockfile·서비스/설정 버전 등 검증 환경을 식별하는 정보. 환경이 바뀌면 통합 테스트를 다시 실행해야 합니다.

참고: [PR #5](https://github.com/usagi-ai-kr/usagi/pull/5) §4

<a id="event-envelope"></a>
## event envelope

**이벤트 봉투**

콜백 이벤트의 공통 메타데이터. `schema_version`·`event_id`·`run_id`·`unit_id`·`attempt_id`·`status` 등을 담습니다.

참고: [PR #2](https://github.com/usagi-ai-kr/usagi/pull/2) §3

<a id="evidence-provenance"></a>
## evidence provenance

**증거 출처**

검증 증거가 어느 source/staged/committed SHA와 환경에서 나왔는지 기록한 것. 커밋·리베이스·의존성 변경 시 증거를 무효화합니다.

참고: [PR #5](https://github.com/usagi-ai-kr/usagi/pull/5) §4

<a id="failure-injection"></a>
## failure injection

**장애 주입**

중복·지연·순서 뒤바뀜·유실·오래된 콜백을 일부러 만들어 복구 동작을 검증하는 기법.

참고: [PR #2](https://github.com/usagi-ai-kr/usagi/pull/2) §2

<a id="fallback-timer"></a>
## fallback timer

**폴백 타이머**

콜백이 기대 시간 안에 오지 않을 때 오케스트레이터가 상태를 다시 확인하는 타이머. 15분은 초기 기본값이며, 콜백을 대체하는 주 감시 수단이 아닙니다.

참고: [Issue #1](https://github.com/usagi-ai-kr/usagi/issues/1) §2, [Issue #3](https://github.com/usagi-ai-kr/usagi/issues/3) 제안

<a id="gate"></a>
## gate

**게이트**

다음 단계로 넘어가기 전에 통과해야 하는 검사. 수락 게이트·CI 게이트 등이 있습니다.

참고: [PR #2](https://github.com/usagi-ai-kr/usagi/pull/2) §5

<a id="gate-sequence"></a>
## gate sequence

**게이트 순서**

변경 목록 확인 → 스테이징 검사 → 검증 → 커밋 → CI/리뷰 → 병합 순서. 순서를 건너뛰면 검증한 내용과 병합 내용이 달라질 수 있습니다.

참고: [PR #5](https://github.com/usagi-ai-kr/usagi/pull/5) §4

<a id="health-check"></a>
## health check

**상태 판정**

에이전트·패널·작업 단위의 상태를 진단하는 검사. `ok`는 진단된 사고가 없다는 뜻이지 작업이 수락되었다는 뜻은 아닙니다.

참고: [Issue #9](https://github.com/usagi-ai-kr/usagi/issues/9) 운영 노하우, [PR #12](https://github.com/usagi-ai-kr/usagi/pull/12) §1

<a id="idempotency"></a>
## idempotency

**멱등성**

같은 이벤트를 여러 번 처리해도 상태가 한 번만 바뀌는 성질. 중복 콜백 재전송의 안전 근거입니다.

참고: [PR #2](https://github.com/usagi-ai-kr/usagi/pull/2) §3–4

<a id="ledger"></a>
## ledger

**원장**

작업 단위의 상태·시도·이벤트를 append-only로 기록한 durable 저장소. 채팅 컨텍스트 밖에 둡니다.

참고: [PR #2](https://github.com/usagi-ai-kr/usagi/pull/2) §3

<a id="manifest"></a>
## manifest

**매니페스트**

스냅샷에 포함된 파일 목록과 해시. 누락·추가·변경을 대조해 스냅샷이 전체 변경을 덮는지 확인합니다.

참고: [PR #12](https://github.com/usagi-ai-kr/usagi/pull/12) §3

<a id="orphan"></a>
## orphan

**고아 작업**

재시작 등으로 추적이 끊긴 워커나 시도. 원장과 실제 세션을 대조해 찾아냅니다.

참고: [PR #2](https://github.com/usagi-ai-kr/usagi/pull/2) §4

<a id="outbox"></a>
## outbox

**아웃박스**

전송 전 이벤트를 먼저 저장하는 로컬 큐. 전송 실패 시 pending으로 남겨 재전송합니다.

참고: [PR #2](https://github.com/usagi-ai-kr/usagi/pull/2) §4

<a id="reconciliation"></a>
## reconciliation

**재조정**

재시작 후 원장·아웃박스·실제 세션을 대조해 상태를 맞추는 절차.

참고: [PR #2](https://github.com/usagi-ai-kr/usagi/pull/2) §4

<a id="replay"></a>
## replay

**재생**

저장된 이벤트를 다시 처리해 상태를 복구하는 것. 멱등성 덕분에 안전합니다.

참고: [PR #2](https://github.com/usagi-ai-kr/usagi/pull/2) §4

<a id="snapshot"></a>
## snapshot

**스냅샷**

리뷰 전 산출물을 압축해 보관한 것. 작업 트리와 대조해 리뷰 중 변경 여부를 잡지만, 명시된 경로만 포함하면 전체 변경을 보장하지 않습니다.

참고: [Issue #9](https://github.com/usagi-ai-kr/usagi/issues/9) 운영 노하우, [PR #12](https://github.com/usagi-ai-kr/usagi/pull/12) §3

<a id="watchdog"></a>
## watchdog

**감시 장치**

콜백이 없는 작업을 일정 시간 후 감지해 triage하는 감시 장치. 15분 타이머는 기본값입니다.

참고: [PR #2](https://github.com/usagi-ai-kr/usagi/pull/2) §4
