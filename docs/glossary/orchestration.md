# Glossary — Orchestration (오케스트레이션)

[← Index](../glossary.md)

에이전트 역할, 작업 분배, 콜백, 소유권, 리뷰 체인처럼 누가 무엇을 하는가에 관한 용어.

<a id="agent-backend"></a>
## agent backend

**에이전트 백엔드**

opencode·Claude·agy처럼 에이전트를 구동하는 도구와 모델의 조합. 백엔드마다 컨텍스트 리셋 명령과 idle 판정이 다릅니다.

참고: [Issue #1](https://github.com/usagi-ai-kr/usagi/issues/1) 주의 2

<a id="brief"></a>
## brief

**브리프**

워커에게 보내는 압축형 작업 지시서. 목표·계약·금지·소유 파일·Red→Green 테스트·검증 명령·보고 경로를 담습니다.

참고: [Issue #1](https://github.com/usagi-ai-kr/usagi/issues/1) §3

<a id="callback"></a>
## callback

**콜백**

워커가 `done`·`blocked`·`failed` 상태를 오케스트레이터에 알리는 이벤트. 폴링을 대체합니다.

참고: [Issue #1](https://github.com/usagi-ai-kr/usagi/issues/1) §2, [PR #2](https://github.com/usagi-ai-kr/usagi/pull/2) §3

<a id="cross-review"></a>
## cross-review

**교차 리뷰**

작성자와 다른 모델이나 사람이 리뷰해 동일 모델의 맹점을 줄이는 방식.

참고: [Issue #1](https://github.com/usagi-ai-kr/usagi/issues/1) §1

<a id="delegation"></a>
## delegation

**위임**

오케스트레이터가 저장소 산출물 변경을 워커에게 맡기는 것. 읽기 전용 점검은 직접 할 수 있지만 코드·테스트·문서·설정 변경은 위임해야 합니다.

참고: [PR #5](https://github.com/usagi-ai-kr/usagi/pull/5) §1

<a id="dispatch"></a>
## dispatch

**디스패치**

작업 단위를 워커에게 배정하고 브리프를 전달하는 행위.

참고: [Issue #1](https://github.com/usagi-ai-kr/usagi/issues/1) §1

<a id="escalation"></a>
## escalation

**에스컬레이션**

재작업 한도 초과·차단·자원 충돌 시 상위 판단자에게 넘기는 절차.

참고: [PR #2](https://github.com/usagi-ai-kr/usagi/pull/2) §5

<a id="handoff"></a>
## handoff

**인계**

한 작업 단위의 결과와 다음 단위의 브리프를 다음 담당자에게 넘기는 절차. 후속 패킷 초안은 워커가 쓰고 오케스트레이터는 AC·소유·금지를 고정합니다.

참고: [Issue #3](https://github.com/usagi-ai-kr/usagi/issues/3) 확인됨

<a id="harness"></a>
## harness

**하네스**

여러 에이전트의 역할·지시·콜백·검증·병합을 묶어 운용하는 실행 환경과 규약. Herdr는 그중 하나입니다.

참고: [Issue #1](https://github.com/usagi-ai-kr/usagi/issues/1)

<a id="herdr"></a>
## Herdr

**터미널 멀티플렉서**

코딩 에이전트용 터미널 멀티플렉서. 패널·에이전트 프롬프트·콜백 전달에 사용합니다.

참고: [Issue #1](https://github.com/usagi-ai-kr/usagi/issues/1)

<a id="model-family"></a>
## model family

**모델 패밀리**

같은 계열의 모델 묶음. 리뷰는 가능하면 다른 패밀리로 교차하는 것이 권장됩니다.

참고: [Issue #1](https://github.com/usagi-ai-kr/usagi/issues/1) §1

<a id="orchestrator"></a>
## orchestrator

**오케스트레이터, o**

계획·분배·수락 판정·CI/병합을 담당하는 역할. 직접 구현하거나 워커 소유 파일을 고치지 않습니다.

참고: [PR #2](https://github.com/usagi-ai-kr/usagi/pull/2) §1

<a id="ownership"></a>
## ownership

**소유권**

작업 단위가 수정할 수 있는 파일·경로의 범위. 충돌을 막기 위해 브리프에 명시합니다.

참고: [PR #2](https://github.com/usagi-ai-kr/usagi/pull/2) §1–2

<a id="packet"></a>
## packet

**작업 패킷**

워커에게 전달하는 작업 묶음. task·파일·제약·완료 조건·보고 형식을 담으며, 비대해지지 않도록 작게 유지합니다.

참고: [Issue #3](https://github.com/usagi-ai-kr/usagi/issues/3) 구조화 I/O

<a id="panel"></a>
## panel

**패널**

Herdr에서 에이전트 세션이 보이는 창(pane). pane id는 특정 도구에 종속된 값이라 보편 규칙으로 복사하지 않습니다. 다른 워크스페이스의 메시지가 입력으로 도착할 수 있습니다.

참고: [Issue #1](https://github.com/usagi-ai-kr/usagi/issues/1) 주의 10, [Issue #3](https://github.com/usagi-ai-kr/usagi/issues/3) 주의

<a id="polling"></a>
## polling

**폴링**

상태를 주기적으로 물어보는 방식. 이 하네스는 콜백으로 대체하고 폴백 타이머만 둡니다.

참고: [Issue #1](https://github.com/usagi-ai-kr/usagi/issues/1) §2

<a id="port-collision"></a>
## port collision

**포트 충돌**

여러 워커가 같은 포트를 쓰려다 실패하는 상황. 포트를 단위별로 나누고 충돌 시 fail closed 합니다.

참고: [Issue #1](https://github.com/usagi-ai-kr/usagi/issues/1) 주의 7

<a id="review-chain"></a>
## review chain

**리뷰 체인**

리뷰 판정의 소유권과 순서를 정한 체인. 구현자와 다른 담당이 리뷰하고, 최종 판정 권한을 명시해 리뷰가 형식적으로 흐르지 않게 합니다.

참고: [Issue #3](https://github.com/usagi-ai-kr/usagi/issues/3) 확인됨

<a id="reviewer"></a>
## reviewer

**리뷰어, r**

구현을 수정하지 않고 독립적으로 검토해 `approve` 또는 `request-changes` 판정을 내리는 역할.

참고: [PR #2](https://github.com/usagi-ai-kr/usagi/pull/2) §1

<a id="rework"></a>
## rework

**재작업**

리뷰 차단 사항을 작성자에게 돌려보내 고치는 라운드. 기본 2회 후 에스컬레이션합니다.

참고: [Issue #1](https://github.com/usagi-ai-kr/usagi/issues/1) §4

<a id="session-reset-context-reset"></a>
## session reset / context reset

**세션·컨텍스트 리셋**

에이전트 컨텍스트를 비우는 명령. opencode는 `/new`, agy·Claude는 `/clear`를 쓰고, 리셋 후 idle을 확인합니다. 백엔드마다 리셋·리뷰 체인 동작이 다를 수 있습니다.

참고: [Issue #1](https://github.com/usagi-ai-kr/usagi/issues/1) 주의 2, [Issue #3](https://github.com/usagi-ai-kr/usagi/issues/3) 제안

<a id="structured-i-o"></a>
## structured I/O

**구조화 입출력**

에이전트 메시지의 필드를 고정하는 방식. 요청은 task·파일·제약·완료·보고, 회신은 상태·증거·결과·다음으로 제한합니다.

참고: [Issue #3](https://github.com/usagi-ai-kr/usagi/issues/3) 확인됨

<a id="subagent"></a>
## subagent

**서브에이전트**

다른 에이전트가 작업을 위임하기 위해 띄우는 하위 에이전트. 컨텍스트와 소유권이 분리되므로, 이 저장소의 규칙에서는 기본적으로 사용하지 않습니다.

참고: [Issue #3](https://github.com/usagi-ai-kr/usagi/issues/3) 문서화됨

<a id="unit-work-unit"></a>
## unit / work unit

**작업 단위**

독립적으로 검증 가능한 최소 작업 묶음. 10~15분은 초기 휴리스틱일 뿐 상한이 아닙니다.

참고: [PR #2](https://github.com/usagi-ai-kr/usagi/pull/2) §2
