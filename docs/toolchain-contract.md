# Toolchain contract (Phase 1)

Source: [Issue #26](https://github.com/usagi-ai-kr/usagi/issues/26).
관련: #22, #23, #14, #35.

## 1. 목적과 범위

이 문서는 이 저장소가 요구하는 최소 실행 계약을 정의한다. Phase 1 범위는 **정책 문서 + 현재 저장소 인벤토리 + 비파괴 `doctor`** 뿐이다. 자동 설치, OS 매트릭스, command runner, 프로젝트 어댑터는 후속 단계이며 이 문서가 보증하지 않는다.

검증 상태: macOS(darwin arm64)에서 로컬 검증 1회. Linux는 CI(Ubuntu) 실행만 확인했고 그 외 배포판은 미검증. Windows는 미검증이다. 단일 OS 검증으로 cross-platform 지원을 주장하지 않는다.

## 2. 의존성 수준

| 수준 | 의미 | 이 저장소의 예시 |
| --- | --- | --- |
| Core | 저장소가 요구하는 최소 실행 계약. 없으면 검증 불가 | Node.js 22+, git, `node scripts/validate.mjs`에 필요한 저장소 파일 |
| Stack-selected | 해당 프로젝트가 채택한 매니저를 lockfile·버전으로 고정 | 현재 없음 (`package.json`/lockfile 없음). 채택 시 버전과 lockfile을 명시하고 동일 역할 도구를 혼용하지 않음 |
| Optional | 없으면 해당 기능만 unavailable로 보고하고 대안 사용 | `gh`, `jq`, `bash`, `npx`. 부재 시 보고만 하고 암묵적 설치 금지 |
| CI-only | 자동 검증 실행 환경에만 필요한 도구 | GitHub Actions `ubuntu-latest`, `skills-ref@0.1.5`, `@google/design.md@0.4.0` (`npx --yes`로 내려받는 핀 고정 도구) |
| Prohibited implicit | 요청 없이 하지 않는 환경 변형 | `sudo`, 글로벌 설치, 요청 없는 패키지 다운로드, 사용자/글로벌 설정 변경 |

pnpm·uv·sh를 usagi 전체 공통 필수 의존성으로 강제하지 않는다. 도구가 없으면 설치 명령을 제안하거나 `blocked`/`unavailable`로 보고하고, 몰래 설치하지 않는다.

## 3. 현재 저장소 인벤토리

| 도구 | 역할 | 수준 | 비고 |
| --- | --- | --- | --- |
| node 22+ | `validate.mjs`, `doctor.mjs`, glossary/human-doc 검사 실행 | Core | CI는 Node.js 22. 로컬은 22 이상이면 동등 |
| git | 저장소 루트 판별, SHA 바인딩 | Core | `doctor`가 `git rev-parse --show-toplevel`로 루트 확인 |
| bash | `scripts/*.sh` 실행 (`sync-wiki.sh` 등은 process substitution 사용) | Optional | POSIX sh 대체 불가. Windows에서는 Git Bash/WSL 또는 향후 Node 대체 필요 |
| jq | `sync-wiki.sh`, `sync-labels.sh`, `apply-repo-policy.sh`에서 JSON 파싱 | Optional | 없으면 해당 스크립트만 실행 불가 |
| gh | `sync-labels.sh`, `apply-repo-policy.sh`에서 GitHub API 호출 | Optional | 인증·네트워크 필요. 없으면 해당 스크립트만 실행 불가 |
| npx | CI-only 도구(`skills-ref`, `design.md` linter) 내려받기 | CI-only | `--yes`로 핀 버전 고정. 로컬 실행 시 네트워크 다운로드 발생 |

패키지 매니저 lockfile 없음. `npx --yes` 다운로드는 CI-only 도구에 한정되며, 그 외 패키지 설치는 `Prohibited implicit`이다.

## 4. OS 정책

- **macOS**: darwin arm64에서 로컬 검증. `/bin/sh`는 bash 4+와 다르므로 bash 전용 문법을 가정하지 않는다. BSD 유틸리티와 GNU 전용 옵션 차이에 주의한다.
- **Linux**: CI는 Ubuntu에서만 실행한다. Alpine/musl, cgroup 제한, 배포판별 도구 차이는 미검증이며 지원 상태로 표시하지 않는다.
- **Windows**: 미검증. 기본 셸은 PowerShell 5.1이며 PS7은 Optional이다(PS7이 없다고 설치를 유도하지 않는다). `scripts/*.sh`는 Git Bash/WSL 없이는 실행 불가이며, 공통 로직의 Node 대체는 후속 단계다. 공백/한글 경로, CRLF, 긴 경로, 예약 이름(`CON`, `NUL` 등), symlink 권한, 프로세스 트리 정리를 검사 항목으로 둔다.
- 단일 OS 검증으로 cross-platform 보증을 주장하지 않는다. 매트릭스와 실패 시나리오가 통과한 환경만 지원 상태로 표시한다.

## 5. doctor 계약

`doctor`는 현재 환경을 보고만 하는 비파괴 진단이다. 쓰기·설치·환경 변경을 하지 않는다.

```bash
node scripts/doctor.mjs [--json] [--help]
```

검사 항목: `node`(required, major >= 22), `git`(required), `gh`/`jq`/`bash`/`npx`(optional), 플랫폼·경로 플래그, 저장소 루트 파일(`AGENTS.md`, `VERSION`, `CHANGELOG.md`).

종료 코드: `0` required 충족 (optional 부재는 `degraded`), `1` required 부재 또는 node 미지원, `2` 사용 오류.

JSON 스키마 버전 1의 필드: `schema_version`, `generated_at`, `platform`(`os`, `arch`, `node`, `cwd`, `path_has_spaces`, `path_has_non_ascii`), `tools`(`name`, `required`, `status`, `version` 배열), `repo`(`root`, `version`, `agents`, `changelog`), `summary`(`required_missing`, `optional_missing`, `status`), `completeness`(`complete|partial|unavailable`).

JSON 예시:

```json
{
  "schema_version": 1,
  "generated_at": "2026-10-20T00:00:00.000Z",
  "platform": { "os": "darwin", "arch": "arm64", "node": "v24.13.1", "cwd": "/tmp/usagi", "path_has_spaces": false, "path_has_non_ascii": false },
  "tools": [{ "name": "node", "required": true, "status": "ok", "version": "v24.13.1" }],
  "repo": { "root": "/tmp/usagi", "version": "0.2.0", "agents": true, "changelog": true },
  "summary": { "required_missing": 0, "optional_missing": 1, "status": "degraded" },
  "completeness": "partial"
}
```

사람 출력 예시 (도구별 한 줄 + 플랫폼/저장소 줄 + 요약 줄):

```text
node: ok (v24.13.1)
git: ok (git version 2.50.1 (Apple Git-155))
gh: missing
platform: darwin/arm64, node v24.13.1, cwd=/tmp/usagi (spaces=false, non_ascii=false)
repo: root=/tmp/usagi, version=0.2.0, agents=true, changelog=true
doctor: degraded (required_missing=0, optional_missing=1: gh)
```

## 6. 후속 단계

- command runner와 표준 JSON 실행 증거: 이 문서의 `doctor` 보고 형식을 확장한다. 증거 바인딩(커밋 SHA, 환경 fingerprint) 규칙은 [multi-agent-orchestration-contract.md](multi-agent-orchestration-contract.md)와 [delegation-handoff-evidence.md](delegation-handoff-evidence.md)를 따른다.
- OS 매트릭스: Windows 네이티브, macOS, Linux에서 동일 스모크 시나리오 실행. 통과한 환경만 지원 상태로 표시한다.
- 프로젝트 어댑터: Stack-selected 매니저 채택 시 버전/lockfile 고정과 도구 선택 규칙을 선언적 매핑으로 둔다.

## 7. 관련

- #26 (본 계약), #22 (레이어/TDD·BDD 검증의 실행 전제), #23 (E2E 실행기의 브라우저 런타임·프로세스 관리), #14 (문서 진단 스크립트 적용), #35 (워커 재사용·세션 복구 규칙).
