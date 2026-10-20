---
doc_type: reference
audience: usagi를 운용하는 에이전트
---
# 클라이언트 통합 가이드

이 문서는 이 저장소를 어떤 AI 클라이언트로 쓸지 정리합니다. 각 클라이언트가 무엇을 읽고 무엇을 대신할 수 있는지도 봅니다. 규칙의 원본은 `AGENTS.md`, `.agents/skills/`, `scripts/`입니다. 이 문서와 설정 파일은 그 원본에 얇게 붙는 안내입니다.

## 1. 우선 지원 대상

| 클라이언트 | 현재 usagi 상태 | 확인할 확장점 | 확장점이 없을 때 fallback |
| --- | --- | --- | --- |
| opencode | 레포지터리 설정 `opencode.jsonc`로 스킬 경로 등록 | plugin·hook 지원 여부 — 확인 필요 | `AGENTS.md` + `.agents/skills/` + `scripts/` |
| Claude Code | PreToolUse hook(`scripts/hooks/validate.mjs`)이 게시 명령을 검사 | hooks·commands·agents 추가 지원 여부 — 확인 필요 | `AGENTS.md` + `.agents/skills/` |
| Antigravity CLI (`agy`) | 레포지터리 설정 없음 | config·hook 지원 여부 — 확인 필요 | `AGENTS.md` + `.agents/skills/` + `scripts/` |
| Codex | `AGENTS.md`만 사용 | 레포지터리 단위 config·hook 지원 여부 — 확인 필요 | `AGENTS.md` + `.agents/skills/` + `scripts/` |
| Gemini CLI, Cursor, Copilot 등 | 레포지터리 설정 없음 | 각 도구의 레포지터리 단위 설정 — 확인 필요 | 위와 동일 |

우선이라는 말은 다른 클라이언트를 배제하지 않는다는 뜻입니다. 문서·설정·검증을 먼저 제공한다는 뜻입니다.

## 2. 원칙

- 원본은 하나뿐입니다. `AGENTS.md`가 안내, `.agents/skills/`가 절차, `scripts/`가 실행입니다.
- 설정과 hook은 얇은 어댑터입니다. 규칙을 클라이언트별로 복제하지 않습니다.
- 자동 설치를 하지 않습니다. 패키지를 늘리지 않고 전역 설정도 바꾸지 않습니다.
- 비밀값·개인 설정·전역 설정은 저장소에 넣지 않습니다.
- 정적 검증을 먼저 씁니다. hook의 실행 동작은 따로 확인해야 합니다.
- 설정 파일이 있다는 사실은 hook이 실행되었다는 증거가 아닙니다.

## 3. 현재 범위

- opencode와 Claude Code에는 최소 레포지터리 설정만 있습니다.
- Claude Code는 `.claude/skills/`에서만 프로젝트 스킬을 찾습니다. `.claude/skills`는 `../.agents/skills`를 가리키는 심볼릭 링크라서 원본이 하나로 유지됩니다. `CLAUDE.md` → `AGENTS.md`와 같은 방식입니다.
- Claude Code는 `description`을 보고 스킬 자동 호출 여부를 정합니다. 모든 스킬 `description`에 `Use when ...` 조건을 넣습니다.
- Antigravity CLI와 Codex는 문서로만 지원합니다. fallback을 씁니다.
- plugin 패키징은 아직 없습니다. hook 실행은 Claude Code PreToolUse 어댑터뿐입니다. 검증 전 코드를 먼저 돌리지 않습니다.

## 4. 보안

hook과 plugin은 코드를 실행할 수 있어 리뷰 대상입니다.

- 적용 전에 리뷰하고 버전을 고정합니다.
- 필요한 권한만 허용하고 기본적으로 네트워크를 쓰지 않습니다.
- 명시적으로 켠 경우에만 실행합니다.
- 끄거나 우회하는 경로와 사유를 기록합니다.
- 설정 파일의 존재를 hook 실행 증거로 보지 않습니다.

## 5. 검증

`node scripts/validate.mjs`가 두 설정 파일과 스킬 링크를 확인하고 우선 지원 대상 이름을 확인합니다.

- `opencode.jsonc`는 JSON으로 읽히고 `skills.paths`에 `.agents/skills`가 있어야 합니다.
- `.claude/settings.json`은 JSON으로 읽히고 `permissions`가 객체여야 합니다.
- `.claude/settings.json`의 `hooks.PreToolUse`에 `scripts/hooks/validate.mjs`를 실행하는 명령이 있어야 합니다.
- `.claude/skills`는 `../.agents/skills`를 가리키는 심볼릭 링크여야 합니다.
- 모든 `SKILL.md`의 `description`에 `Use when ...` 조건이 있어야 합니다.
- `docs/client-integration.md`에 우선 지원 대상 이름이 있어야 합니다.

CI는 정적 검증만 수행합니다. hook과 plugin의 실제 동작은 클라이언트별로 선택해 확인하고 결과를 기록합니다.

## 6. 후속 단계

- Antigravity CLI와 Codex의 확장점 조사.
- 필요할 때 plugin 패키징.
- 클라이언트별 동작 확인 테스트.

## 7. Hook 계약 (`scripts/hooks/validate.mjs`)

Claude Code `.claude/settings.json`의 `PreToolUse`가 `Bash` 명령을 가로채 이 entrypoint에 `hook_event_name`, `tool_name`, `tool_input.command`를 stdin JSON으로 넘깁니다. 테스트용으로 `--command <텍스트>`와 `--repo-root <디렉터리>`도 받습니다.

- 검사 대상은 게시·영속 명령뿐입니다: `git commit`, `git push`, `gh pr create`, `gh pr merge`. 나머지는 exit 0입니다.
- 검사 순서: staged 변경의 secret-guard → `node scripts/validate.mjs`. `push`/PR에는 `origin/main...HEAD` 범위도 봅니다(없으면 staged만).
- 종료 코드: `0` 허용, `2` 차단. 실패 사유는 짧은 stderr 한 줄이며 비밀값이 없습니다.
- Secret-guard는 추가된 줄만 봅니다. staged `.env`/`.env.*`(단 `.env.example` 제외), `*.pem`, `*.key`, `id_rsa`, `id_ed25519`, `credentials`/`secrets` 파일을 막습니다. private-key 헤더, `ghp_`·`github_pat_`·`sk-`·`AKIA`·`xox[baprs]-`·`AIza`, `TOKEN|SECRET|PASSWORD|API_KEY=` 대입도 막습니다. 경로·패턴명·줄 번호만 보고합니다.
- 증거는 `<repo-root>/tmp/hook-events.jsonl`에 호출마다 JSON 한 줄입니다: `schema_version`, `timestamp`, `event`, `decision`(`allow|block|bypass`), `reason`, 비밀값 없는 명령, `duration_ms`, 검사 결과. 증거를 못 쓰면 fail-closed로 차단합니다.
- 우회: `USAGI_HOOK_BYPASS=1`과 비어 있지 않은 `USAGI_HOOK_BYPASS_REASON`이 함께 있어야 검사를 건너뛰고 `bypass`로 기록합니다. 사유가 없으면 차단합니다.
- 한계: 사용자 명령을 실행하지 않고 셸에 넣지 않으며 네트워크를 쓰지 않습니다. opencode/agy/Codex는 hook 확인 전까지 fallback을 씁니다. 문서·스킬·스크립트를 직접 실행합니다. 설정 파일 존재는 실행 증거가 아닙니다.

## 8. 관련

- [#42](https://github.com/usagi-ai-kr/usagi/issues/42) — 우선 지원 에이전트와 레포지터리 단위 플러그인·훅 설정 제안
- [#26](https://github.com/usagi-ai-kr/usagi/issues/26) — 최소 외부 의존성과 공통 실행 계약
- [#35](https://github.com/usagi-ai-kr/usagi/issues/35) — 워커 재사용과 세션 복구 규칙
- [#46](https://github.com/usagi-ai-kr/usagi/issues/46) — 프로젝트 규모에 따른 문서 검토 경로
- [#47](https://github.com/usagi-ai-kr/usagi/issues/47) — 시각화와 대체 다이어그램 도구 선택 기준
