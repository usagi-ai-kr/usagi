# 실행 증거 envelope (execution evidence)

Source: [Issue #63](https://github.com/usagi-ai-kr/usagi/issues/63).
관련: #26, #22, #23, #42.

명령 실행 결과의 공통 증거 형식 v1이다.

## 1. envelope v1

```json
{
  "schema_version": 1,
  "run_id": "uuid",
  "command": ["node", "-e", "..."],
  "cwd": "/abs/path",
  "env_fingerprint": { "os": "darwin", "arch": "arm64", "node": "v24.x" },
  "started_at": "ISO",
  "duration_ms": 123,
  "exit_code": 0,
  "signal": null,
  "timed_out": false,
  "stdout_ref": "/abs/out/id.stdout.log",
  "stderr_ref": "/abs/out/id.stderr.log",
  "artifacts": [],
  "completeness": "complete|partial|unavailable",
  "redactions": ["env:ENV_NAME", "literal:1"]
}
```

- `run_id`는 `randomUUID()`로 만든다.
- `env_fingerprint`는 OS·아키텍처·Node 버전만 기록한다. 전체 환경변수를 직렬화하지 않는다.
- `artifacts`는 추가 산출물 경로 목록이다. Phase 1 기본은 빈 배열이다.
- `error` 필드는 runner 오류일 때만 있다.

## 2. 명령 실패와 runner 오류

| 구분 | 의미 | 종료 코드 | envelope |
| --- | --- | --- | --- |
| 명령 실패 | 프로세스가 실행됐으나 `exit_code != 0` | 1 | `exit_code` 기록, `completeness: complete` |
| runner 오류 | spawn 실패(ENOENT/EACCES), 잘못된 인자, 출력 디렉터리 실패 | 2 | `error` 기록, `completeness: unavailable` |
| timeout | 제한 시간 초과 후 kill | 124 | `timed_out: true`, `completeness: partial` |
| 성공 | `exit_code: 0` | 0 | `completeness: complete` |
| signal 종료 | exit code 없이 signal로 죽음 | 1 | `signal` 기록, partial |

## 3. timeout과 process-tree 정리

- 별도 process group에 spawn해 자식·손자까지 함께 죽인다. 그룹 이탈(`setsid` 등)은 보장하지 않는다.
- timeout 시 POSIX 그룹 kill, Windows `taskkill /T /F`로 정리한다. taskkill 실패 시 직접 kill로 fallback한다.
- `--timeout-ms`는 1–2147483647 정수다. 범위 밖은 usage 오류(exit 2)로 거절한다.
- kill 후 exit를 기다려 `timed_out`·`signal`·`duration_ms`를 확정한다.

## 4. stdout/stderr refs와 redaction

- stdout/stderr는 `out-dir`에 `<run_id>.stdout.log` 등으로 쓰고 ref는 절대 경로다.
- 비밀값은 파일·보고 텍스트에서 `[REDACTED]`로 바꾼다. `command`·오류 메시지에도 적용한다.
- `/TOKEN|SECRET|PASSWORD|KEY|CREDENTIAL/i` 환경변수 값과 `--redact` 리터럴을 redact한다. `redactions`에는 `env:<이름>`·`literal:<번호>` 식별자만 남긴다.
- 전체 환경은 직렬화하지 않는다.

## 5. completeness

- `complete`: exit code를 알 때. signal 종료(exit code 없음)는 partial이다.
- `partial`: timeout·kill 때.
- `unavailable`: 실행 자체가 안 될 때.

## 6. 실행 규칙

- shell 없이 인자 배열을 실행한다.
- 암묵적 설치 없음. 없는 명령은 runner 오류다.
- `out-dir` 밖에는 쓰지 않는다.
- 구현은 [run-command.mjs](../scripts/run-command.mjs)를 본다.
