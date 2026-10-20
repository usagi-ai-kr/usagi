# E2E 결과 계약 (E2E result contract)

Source: [Issue #23](https://github.com/usagi-ai-kr/usagi/issues/23) 1단계(계약/스키마).
관련: [#22](https://github.com/usagi-ai-kr/usagi/issues/22), [#26](https://github.com/usagi-ai-kr/usagi/issues/26), [#17](https://github.com/usagi-ai-kr/usagi/issues/17), [#14](https://github.com/usagi-ai-kr/usagi/issues/14), [#35](https://github.com/usagi-ai-kr/usagi/issues/35), [#64](https://github.com/usagi-ai-kr/usagi/issues/64).

## 1. 목적과 범위

이 문서는 특정 모델·IDE·pane·herdr 명령에 종속되지 않는 E2E·시각 검증 **결과 계약**이다. 실행기(runner)는 어떤 도구여도 되고, 모델은 실행 프로세스가 아니라 이 계약을 호출하고 결과를 검토하는 주체다.

1단계 범위는 [e2e-result.schema.json](e2e-result.schema.json)(JSON Schema draft 2020-12)과 [validate-e2e-result.mjs](../scripts/validate-e2e-result.mjs)(의존성 없는 fail-closed 검증기)뿐이다. 브라우저 실행, Playwright 도입, 시각 비교는 포함하지 않는다. 2단계 reference runner는 §9를 본다.

계약의 관찰 가능한 핵심은 다음 네 가지다. 결과는 **대상 commit에 묶이고**, **viewport/DPR 환경이 고정되며**, **아티팩트 증거를 가지고**, **status가 assertion·exit_code·completeness와 일치할 때만** 유효하다. 하나라도 빠지거나 어긋나면 검증기가 거부한다.

## 2. 실행 원칙

이 절은 runner가 따르는 실행 프로토콜이다. [e2e-runner.mjs](../scripts/e2e-runner.mjs)가 구현한다.

- 브라우저 인스턴스는 기본 1개, worker concurrency는 기본 1로 시작한다. 병렬화는 계측한 뒤 명시적으로 확대한다.
- 세션은 테스트마다 context 격리를 우선하고, 브라우저 재사용 시 쿠키·스토리지·권한·캐시 상태를 분리한다.
- 고정 `sleep`과 고빈도 폴링 대신 상태 기반 대기를 사용한다. SPA의 영구 네트워크 연결에서는 `networkidle` 단독 의존을 피한다.
- 테스트 서버와 포트는 실행기가 소유하고, 정상·예외 종료 모두에서 process tree를 정리한다. 잔여 프로세스를 감지하고, 포트 충돌 시에는 fail-closed로 중단한다. 다른 프로세스가 띄운 외부 서버 화면을 성공 증거로 기록하지 않는다.
- 결과는 대상 서버·빌드의 `commit_sha`, URL, 기동 명령(`start_command`)과 프로세스 identity에 묶인다. SHA가 다르면 비교 결과를 유효하다고 표시하지 않는다.
- 시각 수집은 `viewport`, `dpr`, `locale`, `timezone`, `theme`, `font_ready` 조건을 고정한 상태에서 수행한다. 폰트 미로딩·DPR 불일치 상태의 시각 결과를 유효하지 않다고 표시한다.
- 스크린샷·트레이스·비디오에는 개인정보·인증 토큰이 포함될 수 있다. 마스킹(`masking.applied`, `masking.fields`)과 보존 기간을 기록하고, 마스킹되지 않은 아티팩트를 공개 PR에 업로드하지 않는다.
- 자원 예산(`budgets`)을 설정하고 측정한다. OS별 제한 기능은 탐지 후 지원할 때만 적용한다.

## 3. 결과 계약

결과는 [e2e-result.schema.json](e2e-result.schema.json)을 따르는 단일 JSON 문서다. 최상위 필드는 모두 필수이고, schema는 `additionalProperties: false`로 정의되지 않은 필드를 금지한다.

| 필드 | 설명 |
| --- | --- |
| `schema_version` | `1` 고정. |
| `run_id` | 실행 식별자. 로그·아티팩트를 묶는다. |
| `target` | `url`(필수), `commit_sha`(필수, 40 또는 64 hex), `start_command`(선택). |
| `environment` | `os`, `arch`, `browser`, `browser_version`, `viewport{width,height}`, `dpr`, `locale`, `timezone`, `theme`, `font_ready` 모두 필수. |
| `scenario` | `id`와 `kind`. |
| `budgets` | `wall_time_ms`, `peak_rss_mb`, `max_processes`. 1단계는 `wall_time_ms`를 검사하고 나머지는 기록용이다. |
| `result` | `status`, `exit_code`, `assertions[]`(`id`, `status`, 선택적 `message`). |
| `artifacts[]` | `type`, `path`(상대 경로), `sha256`, `size_bytes` 모두 필수. 빈 배열 허용. |
| `evidence` | `console_errors`, `network_failures`(필수), `stdout_ref`, `stderr_ref`(선택). |
| `masking` | `applied`와 `fields`. |
| `started_at` | ISO 8601 date-time. |
| `duration_ms` | 0 이상 정수. |
| `completeness` | 수집 완결성. |

enum 값:

- `scenario.kind`: `behavior` | `visual` | `mixed`
- `result.status`: `passed` | `failed` | `blocked` | `unavailable`
- `result.assertions[].status`: `passed` | `failed` | `blocked`
- `artifacts[].type`: `screenshot` | `trace` | `video` | `log` | `json`
- `completeness`: `complete` | `partial` | `unavailable`

일치 규칙: `result.status: passed`는 `exit_code: 0`, 실패한 assertion이 없음, `completeness: complete`와 함께여야 하고, `duration_ms`가 `budgets.wall_time_ms`를 넘을 수 없다. `status: failed`는 `exit_code != 0`이어야 한다. `behavior`가 아닌 시나리오가 passed면 `font_ready: true`와 screenshot 아티팩트가 필요하다.

## 4. 검증기 계약

[validate-e2e-result.mjs](../scripts/validate-e2e-result.mjs)는 `node:` 내장 모듈만 쓰는 의존성 없는 검증기다. 파일을 쓰지 않고, 패키지를 설치하지 않는다.

```text
node scripts/validate-e2e-result.mjs --result <file> [options]

--result <file>            검사할 결과 JSON 문서 (필수)
--expected-sha <sha>       target.commit_sha 일치 요구 (대소문자 무시)
--expected-viewport <WxH>  environment.viewport 일치 요구 (예: 1280x720)
--expected-dpr <number>    environment.dpr 일치 요구
--artifact-root <dir>      artifacts를 이 루트에서 찾아 존재·크기·SHA-256 검사
--json                     기계 판독 가능한 보고서만 stdout에 출력
--help                     도움말 출력
```

종료 코드:

- `0` — 유효(warning은 허용).
- `1` — 결과가 계약 위반(hard error 존재).
- `2` — 사용법·읽기·설정 오류(플래그 값 오류, 파일 없음·JSON 파싱 실패, `--artifact-root`가 디렉터리가 아님).

hard error(결과 무효): 필수 필드 누락·타입 오류·enum 위반, 정의되지 않은 필드, `target.commit_sha`가 40/64 hex가 아니거나 `--expected-sha`와 불일치, `--expected-viewport`/`--expected-dpr` 불일치, passed인데 `exit_code != 0`, passed인데 실패 assertion 존재, passed인데 `completeness != complete`, failed인데 `exit_code == 0`, passed인데 `duration_ms > budgets.wall_time_ms`, visual/mixed가 passed인데 `font_ready != true` 또는 screenshot 아티팩트 없음, 아티팩트 경로가 절대 경로이거나 `..` 세그먼트 포함, `started_at`이 ISO 8601이 아니거나 duration·assertion·budget 값이 음수.

`--artifact-root`를 주면 아티팩트마다 존재 여부, 루트 안 포함 여부, `size_bytes` 일치, SHA-256 일치를 검사해 hard error로 처리한다. 경로 포함 검사는 사전순으로 먼저 하고, 루트와 각 파일을 `realpath`로 해석해 symlink 탈출도 같은 hard error로 거부한다. 루트 자체가 해석되지 않으면 `artifact_root_unresolved` hard error로 끝나고 어떤 아티팩트도 통과하지 않는다. 검사와 사용 사이 경로 교체(TOCTOU)는 보증하지 않으며, 격리 실행 검증은 #64 범위다. 아티팩트 SHA가 서버·빌드·결과 파일 중 어디에서 왔는지 연결하는 요구는 후속으로 남긴다.

warning(무효 아님, 검토 대상): 아티팩트가 있는데 `--artifact-root`가 없어 해시를 검증하지 못함, screenshot이 있는데 `masking.applied`가 false, passed인데 `console_errors > 0` 또는 `network_failures > 0`, passed인데 아티팩트가 전혀 없음(behavior-only).

`--json` 출력은 `schema_version`, `result`(검사한 파일 경로), `valid`, `errors[]`/`warnings[]`(`code`, `path`, `message`), `summary` 개수만 포함하고 stdout에는 JSON만 인쇄한다. 사람용 출력은 error/warning마다 한 줄과 요약 한 줄을 인쇄한다.

## 5. 실패 주입

계약이 관찰 가능하다는 것은 다음 주입 시나리오에서 거부 동작이 보인다는 뜻이다. 아래 두 항목은 runner 수준(2단계) 검증이고, 나머지는 1단계 검증기가 종료 코드 1로 거부한다.

| 주입 | 기대 동작 |
| --- | --- |
| 포트 충돌 | runner가 fail-closed로 중단하고 결과는 `unavailable`/`blocked` + `exit_code != 0`. 외부 서버 증거 금지. |
| 잔여(stale) 프로세스 | process tree 정리 후 잔존을 감지해 기록하고 성공으로 덮지 않음. |
| commit SHA 불일치 | `--expected-sha`와 다르면 `sha_mismatch`. |
| viewport/DPR 불일치 | `viewport_mismatch`, `dpr_mismatch`. |
| 폰트 미로딩 | visual/mixed passed에서 `font_ready: false`면 `font_not_ready`. |
| 아티팩트 누락 | `--artifact-root`에서 파일이 없으면 `artifact_missing`. |
| 해시·크기 불일치 | `artifact_hash_mismatch`, `artifact_size_mismatch`. |
| 예산 초과 | passed인데 `duration_ms > wall_time_ms`면 `budget_exceeded`. |
| 실패 assertion이 있는 passed | `passed_failed_assertion`. |
| partial completeness로 passed | `passed_incomplete`. |

재실행 성공으로 실패를 덮지 않는다. flake는 반복 실행 결과로 별도 기록한다.

## 6. CI 분리

PR마다 도는 스모크 세트와 장시간 시각·교차 브라우저 체크포인트는 분리한다. 스모크는 짧은 behavior 시나리오만, 시각·교차 브라우저·자원 계측은 별도 체크포인트에서 실행하고 실패 결과와 수집 비용을 함께 기록한다.

1단계가 CI에 추가하는 것은 검증기 자체 테스트(`node --test scripts/validate-e2e-result.test.mjs`, [ci.yml](../.github/workflows/ci.yml)의 `Test E2E result validator` 스텝)뿐이다. 브라우저 실행 잡은 추가하지 않는다. 2단계는 브라우저 없는 runner 테스트(`Test E2E reference runner (browser-free)`)만 CI에 둔다. 브라우저 실행은 로컬·수동 단계로 표시한다.

## 7. 비목표

- 스크린샷만으로 디자인 품질을 판정하는 것. 픽셀 차이는 디자인의 좋고 나쁨이 아니다.
- 교차 브라우저 렌더러 동일성 보증.
- 자동 마스킹 구현. 마스킹은 runner 책임이고 검증기는 `masking` 선언만 확인한다.
- 네이티브 모바일 UI 검증. 플랫폼 테스트 러너를 같은 결과 계약에 연결하는 것은 별도 과제다.

## 8. 검토 절차

자동 판정과 검토자 판단은 분리해 보고한다. 절차는 [e2e-evidence 스킬](../.agents/skills/e2e-evidence/SKILL.md)을 따른다. 검증기 통과는 필요조건이지 시각 품질 승인이 아니며, 검증되지 않은 항목(artifact-root 미지정, 기대값 플래그 생략)은 보고에 명시한다.

## 9. Reference runner (2단계)

[e2e-runner.mjs](../scripts/e2e-runner.mjs)는 정적 fixture 서버를 소유·기동하고 단일 브라우저·worker로 behavior 시나리오를 실행한다. 결과 JSON은 §3 계약을 따르고 Phase 1 검증기로 검사한다. 엄격한 결과 JSON에 없는 프로세스·자원 정보는 별도 `<runId>.run-manifest.json`에 둔다.

- 어댑터: Playwright는 선택 의존이며 설치하지 않는다. 없으면 브라우저 실행을 `unavailable`로 보고하고 성공으로 표시하지 않는다. 명시 요청(`--adapter playwright`)인데 없으면 exit 2다.
- 소유·결속: 서버는 runner가 직접 bind한 자식 프로세스다. 사전 점검 후 접속하지 않는다. 시작 토큰·PID·주소와 응답 identity(`commit_sha` 포함)를 대조한다. 포트 충돌은 외부 서버에 붙지 않고 `blocked`로 중단한다.
- 정리: 성공·예외·timeout·신호 중단에 process tree를 정리하고 잔존을 기록한다. 부모 사망에는 서버의 자가 종료(POSIX)에 의존한다. 확실히 살리는 감시자가 없으면 부모 사망 보장을 주장하지 않는다. Windows 정리는 미검증이다.
- 관측·증거: SHA·viewport/DPR·locale/timezone/theme·font readiness를 기록한다. 요청 조건과 기대 조건이 다르면 실행 전에 exit 2로 거부한다. 실패 시 screenshot·trace·log를 보존하고 재실행 성공으로 덮지 않는다.
- 자원: wall time·CPU 시간·peak RSS·잔존 프로세스를 잰다. 잴 수 없는 값은 0이 아니라 null/`unavailable`로 기록한다. Windows·Alpine은 미검증으로 표시한다.
- 종료 코드: 검증 통과 + passed면 `0`, 실행됐으나 통과가 아니면 `1`, 실행 전 설정·기동 오류면 `2`, 신호 중단은 `128+n`이다.
- 브라우저 테스트는 별도 로컬·수동 단계다. core CI에는 브라우저 없는 테스트만 둔다.
