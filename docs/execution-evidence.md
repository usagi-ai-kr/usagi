# 실행 증거 envelope (execution evidence)

Source: [Issue #63](https://github.com/usagi-ai-kr/usagi/issues/63).
관련: #26, #22, #23, #42.

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
  "stdout_truncated": false,
  "stderr_truncated": false,
  "stdout_ref": "/abs/out/id.stdout.log",
  "stderr_ref": "/abs/out/id.stderr.log",
  "artifacts": [],
  "completeness": "complete|partial|unavailable",
  "redactions": ["env:ENV_NAME", "literal:1"]
}
```

- `run_id`는 `randomUUID()`로 만든다.
- `env_fingerprint`는 OS·arch·Node만 기록한다.
- `artifacts`는 기본 빈 배열이다.
- `error` 필드는 runner 오류일 때만 있다.

## 2. 명령 실패와 runner 오류

| 구분 | 의미 | 종료 코드 | envelope |
| --- | --- | --- | --- |
| 명령 실패 | exit 0 아님 | 1 | exit 기록, complete |
| runner 오류 | spawn·인자·출력 실패 | 2 | error 기록, unavailable |
| timeout | 시간 초과 kill | 124 | timed_out true, partial |
| 출력 초과 | 상한 초과로 잘림 | 0/1 | truncated true, partial |
| 성공 | exit 0 | 0 | complete |
| signal 종료 | signal로 종료(exit 없음) | 1 | signal 기록, partial |

## 3. timeout과 process-tree 정리

- POSIX 실측: 별도 group으로 자식·손자를 함께 죽인다. 이탈은 보장하지 않는다.
- timeout 시 POSIX 그룹 kill, Windows taskkill(미검증)로 정리한다. 실패 시 직접 kill한다.
- `--timeout-ms`는 1–2147483647 정수, 범위 밖은 exit 2다.
- kill 후 exit를 기다려 필드를 확정한다.

## 4. stdout/stderr refs와 redaction

- `out-dir`에 `<run_id>.*.log`로 쓴다.
- `--max-output-bytes`(기본 1048576)까지만 저장한다. 파이프는 계속 비운다.
- 잘리면 truncated true·partial이다. 바이트 절단이라 multibyte가 깨질 수 있다.
- 비밀값은 파일·보고·명령·오류에서 `[REDACTED]`로 바꾼다.
- `/TOKEN|…/i` 값과 `--redact`를 redact하고 식별자만 남긴다.
- 전체 환경은 직렬화하지 않는다.

## 5. completeness

- `complete`: exit code를 알 때.
- `partial`: timeout·kill 때.
- `unavailable`: 실행 자체가 안 될 때.

## 6. 실행 규칙

- shell 없이 인자 배열을 실행한다.
- 암묵적 설치 없음. 없는 명령은 runner 오류다.
- `out-dir` 밖에는 쓰지 않는다.
- 구현은 [run-command.mjs](../scripts/run-command.mjs)를 본다.

## 7. 후속

- allowlist·입출력은 [#70](https://github.com/usagi-ai-kr/usagi/issues/70) 우선 보완이다.
