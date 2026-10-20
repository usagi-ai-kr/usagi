---
doc_type: reference
audience: usagi를 운용하는 에이전트
---
# 테스트 게이트 실행기 계약

Source: [Issue #62](https://github.com/usagi-ai-kr/usagi/issues/62).
관련: [#22](https://github.com/usagi-ai-kr/usagi/issues/22), [#63](https://github.com/usagi-ai-kr/usagi/issues/63).

이 문서는 설정 파일로 테스트 게이트를 순서대로 실행하는 실행기의 계약을 정의합니다. 증거는 커밋과 staged tree에 묶어 남깁니다. 실행기는 의존성 없이 동작하며 shell·네트워크·설치를 쓰지 않습니다. 테스트 수준 정의는 [architecture-contract.md](architecture-contract.md) §6을 따릅니다.

## 1. 사용법

```bash
node scripts/run-test-gates.mjs --config <file> [--evidence-dir <dir>] [--only <level|id>] [--expected-sha <sha>] [--json]
```

- `--config`은 필수입니다. JSON 설정 파일 경로입니다.
- `--evidence-dir`를 주면 게이트별 stdout/stderr 로그와 리포트를 그 디렉터리에 씁니다.
- `--only`는 반복 가능합니다. 수준(`unit`)이나 게이트 id로 걸러 냅니다. 걸러진 게이트는 `skipped`로 기록되고, **필수 게이트를 걸러 내면 그 실행은 `incomplete`·exit 2**입니다. CI의 fast 경로처럼 선택 실행을 하려면 제외되는 게이트가 선택 게이트여야 합니다.
- `--expected-sha`는 실행 전 HEAD와 대조합니다. 다르면 게이트를 하나도 실행하지 않고 exit 2입니다.
- `--json`은 리포트만 stdout에 씁니다.

종료 코드는 세 가지입니다. `0`은 필수 게이트가 모두 통과한 경우입니다(선택 게이트 실패는 기록만 합니다). `1`은 필수 게이트 실패·타임아웃, `2`는 사용법·설정·SHA·증거 결속 오류와 **필수 게이트가 실행되지 않은 경우**입니다. `2`는 테스트 실패가 아니라 선택·설정 문제라는 뜻입니다.

## 2. 설정 스키마

```json
{
  "schema_version": 1,
  "gates": [
    {
      "id": "unit",
      "level": "unit",
      "command": ["node", "--test", "test/fixtures/test-gates/unit.test.mjs"],
      "required": true,
      "timeout_ms": 60000,
      "when": "always"
    }
  ]
}
```

- `schema_version`은 `1`입니다.
- `gates[]`는 비어 있지 않은 배열입니다. 게이트 id는 중복될 수 없습니다.
- `id`: 게이트 이름입니다. 결과와 리포트에 그대로 남습니다.
- `level`: `unit`, `slice`, `integration`, `regression` 중 하나입니다.
- `command`: argv 배열입니다. shell을 쓰지 않습니다. 빈 배열과 빈 문자열은 설정 오류입니다.
- `required`: 필수 게이트가 실패하면 실행 전체가 실패합니다. 선택 게이트 실패는 기록만 합니다.
- `timeout_ms`: 1–2147483647의 정수입니다. 범위를 벗어나면 설정 오류입니다. 초과하면 프로세스 트리를 죽이고 `timeout`으로 기록합니다.
- `when`: `always`, `skip`, `env:NAME` 중 하나입니다. `skip`은 `reason`이 필요합니다.
- `reason`: `skip`일 때 남는 사유입니다.

설정 오류(중복 id·모르는 수준·모르는 `when`·필수 필드 누락·깨진 JSON)는 exit 2입니다.

## 3. 게이트 상태

| 상태 | 뜻 | 종료 코드 영향 |
| --- | --- | --- |
| `pass` | 명령이 exit 0 | 없음 |
| `fail` | 명령이 0 아닌 exit | 필수 게이트면 exit 1 |
| `timeout` | `timeout_ms` 초과 | 필수 게이트면 exit 1 |
| `skipped` | `when: skip` 또는 `--only`로 제외 | 선택 게이트면 없음, **필수 게이트면 exit 2** |
| `not_applicable` | `when: env:NAME`인데 NAME이 없음 | 선택 게이트면 없음, **필수 게이트면 exit 2** |

`skipped`와 `not_applicable`은 서로 다른 상태입니다. `skipped`는 사람이 정한 제외고, `not_applicable`은 환경 조건이 맞지 않아 실행하지 않은 경우입니다.

필수 게이트가 실행되지 않으면 그 실행은 통과가 아닙니다. 리포트 `status`와 `summary.status`가 `incomplete`가 되고 exit 2입니다. 수용 실행은 필수 게이트를 제외하면 안 됩니다. `required: true`인 게이트는 의도적으로 미완성으로 둘 것이 아니라 `when: always`로 씁니다.

## 4. SHA 결속

- 실행 전 `git rev-parse HEAD`로 `source_commit`을, `git write-tree`로 `staged_tree_sha`를 잡습니다.
- 리포트에는 설정 파일의 `config_sha256`도 함께 남깁니다.
- 실행 중 HEAD나 staged tree가 바뀌면 리포트는 `incomplete`가 되고 exit 2입니다. 이전 증거를 유효한 것으로 보이지 않습니다.
- git 저장소가 아니거나 커밋이 없으면 결속 오류로 exit 2입니다.
- `git write-tree`는 staged tree 해시를 만들려고 `.git` 오브젝트 저장소에 트리 객체를 씁니다. 워킹 트리와 인덱스는 건드리지 않습니다.

## 5. 리포트

`schema_version`, `run_id`, `config`, `config_sha256`, `source_commit`, `staged_tree_sha`, `environment`(os/arch/node), `started_at`, `duration_ms`, `gates[]`, `summary`, `status`를 냅니다.

게이트 결과는 `id`, `level`, `required`, `status`, `exit_code`, `duration_ms`, `command`, `stdout_ref`, `stderr_ref`, `stdout_bytes`, `stderr_bytes`, `stdout_truncated`, `stderr_truncated`, `reason`을 담습니다. `stdout_ref`와 `stderr_ref`는 `--evidence-dir`를 주었을 때만 채워집니다. 스트림당 1,048,576바이트까지만 저장하고, 잘리면 `stdout_truncated`·`stderr_truncated`가 참이 됩니다.

`summary`는 `total`, `passed`, `failed`, `timed_out`, `skipped`, `not_applicable`, `required_failed`, `optional_failed`, `required_not_run`, `status`를 담습니다. `status`는 `ok`, `failed`, `incomplete` 중 하나입니다. `required_not_run`은 실행되지 않은 필수 게이트 수입니다. 리포트 최상위 `status`는 `complete`·`incomplete` 중 하나이며, 결속이 깨졌거나 필수 게이트가 실행되지 않으면 `incomplete`입니다.

## 6. Red→Green 증거 형식

- Red: 실패하는 게이트를 실행해 `fail`을 관찰합니다.
- Green: 수정 뒤 같은 게이트를 다시 실행해 `pass`를 관찰합니다.
- 실패한 실행 기록은 나중 성공 기록으로 덮어쓰지 않습니다. 실행마다 `run_id`가 다르고 증거 파일도 분리됩니다.
- 실행기 자체 테스트가 이 순서를 고정합니다. 실패를 관찰하지 못한 채 성공만 기록하지 않습니다.

## 7. BDD 범위

- BDD를 모든 테스트에 강제하지 않습니다.
- BDD는 Given/When/Then 단계가 보이는 연결된 시나리오 한 개면 충분합니다.
- 예시 스택은 `test/fixtures/test-gates/`에 있습니다. `unit.test.mjs`는 빠른 결정적 단위 테스트이고 `regression.test.mjs`는 BDD 시나리오 한 개입니다.
- BDD 형식이 아니어도 게이트는 실행됩니다. 형식이 다른 테스트를 같은 게이트에 묶을 수 있습니다.

## 8. 어댑터 계약

- 실행기는 테스트 프레임워크 이름을 알지 못합니다. `command`가 전부입니다.
- 새 스택은 설정에 `command`를 추가하는 것으로 붙습니다. 실행기 코드 수정이 필요 없습니다.
- 명령은 실행기를 실행한 디렉터리 기준입니다. 경로는 그 디렉터리 기준 상대 경로를 씁니다.
- 게이트는 설정 순서대로 순차 실행합니다. 병렬 실행과 게이트 간 의존 순서는 지원하지 않습니다.

## 9. 한계와 비목표

- 격리 실행·브라우저·네트워크·설치를 하지 않습니다. 외부 자원에 의존하는 게이트는 이 실행기로 돌리지 않습니다.
- TDD/BDD 실행을 강제하지 않습니다. 어떤 수준을 적용했는지는 설정과 보고서에 적습니다.
- 성공만으로 완료를 추론하지 않습니다. 증거는 커밋과 staged tree에 묶입니다.
- 보고된 성공은 그 커밋과 staged tree에 대해서만 유효합니다. 이후 커밋에는 그대로 옮기지 않습니다.
- Windows 네이티브 동작은 미실측입니다.
- 게이트 실패의 원인을 해석하지 않습니다. 무엇이 왜 실패했는지는 사람이 봅니다.
