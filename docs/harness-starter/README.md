# Harness starter

이 저장소를 참고해 다른 프로젝트에 **최소 하네스**를 적용하는 가이드입니다. 목표는 에이전트가 안정적으로 일할 수 있을 만큼만 구조를 만들고, 나머지는 프로젝트에 맞게 확장하는 것입니다.

## 5분 경로

1. [하네스 엔지니어링이란?](https://github.com/usagi-ai-kr/usagi/wiki/What-is-Harness-Engineering)와 [개념](https://github.com/usagi-ai-kr/usagi/wiki/Concepts)을 읽습니다.
2. [`templates/AGENTS.md`](templates/AGENTS.md)를 대상 저장소 루트에 복사하고 빈칸을 채웁니다.
3. [`templates/CONTRIBUTING.md`](templates/CONTRIBUTING.md)를 복사해 에이전트 기여 체크리스트를 만듭니다.
4. [`templates/labels.json`](templates/labels.json)과 [`templates/branch-protection.json`](templates/branch-protection.json)을 `.github/`에 맞게 적용합니다.
5. [`templates/ci.yml`](templates/ci.yml)을 대상 저장소의 검증 명령에 맞게 수정합니다.
6. [`PROMPTS.md`](https://github.com/usagi-ai-kr/usagi/blob/main/PROMPTS.md)에서 참고할 문서를 확인합니다.

## 최소 구성

| 구성 | 역할 | 이 저장소 예시 |
| --- | --- | --- |
| `AGENTS.md` | 에이전트용 안내 파일. 100줄 이하 | [`AGENTS.md`](https://github.com/usagi-ai-kr/usagi/blob/main/AGENTS.md) |
| `CONTRIBUTING.md` | 상세 기여 체크리스트·시작 프롬프트 | [`CONTRIBUTING.md`](https://github.com/usagi-ai-kr/usagi/blob/main/CONTRIBUTING.md) |
| `README.md` / Wiki | 사람이 읽는 진입점 | [`README.md`](https://github.com/usagi-ai-kr/usagi/blob/main/README.md) |
| `.github/labels.json` | 최소 MECE 레이블 | [`labels.json`](https://github.com/usagi-ai-kr/usagi/blob/main/.github/labels.json) |
| `.github/branch-protection.json` | `main` 보호 설정 | [`branch-protection.json`](https://github.com/usagi-ai-kr/usagi/blob/main/.github/branch-protection.json) |
| CI `validate` | 링크·규칙·문서 검증 | [`ci.yml`](https://github.com/usagi-ai-kr/usagi/blob/main/.github/workflows/ci.yml) |
| `docs/` | 에이전트용 지식·제안 문서 | [`docs/`](https://github.com/usagi-ai-kr/usagi/tree/main/docs) |
| `.agents/skills/` | 재사용 가능한 절차 | [`glossary` skill](https://github.com/usagi-ai-kr/usagi/blob/main/.agents/skills/glossary/SKILL.md) |

## 역할

| 역할 | 책임 | 하지 않는 것 |
| --- | --- | --- |
| 오케스트레이터 | 계획, 작업 분배, 수락 판정, CI·병합 조율 | 직접 구현, 워커 파일 수정 |
| 구현 워커 | 소유 파일 구현, 검증, 증거 보고 | 소유 밖 파일 수정, 임의 병합 |
| 리뷰어 | 독립 리뷰, 차단 사항과 판정 | 구현 수정, 판정 없는 통과 |

## 작업 단위 예시

```yaml
unit_id: "auth-login-error"
attempt_id: 1
worktree_root: "/abs/path/project"  # 절대 경로. 워커가 스스로 이동한다.
goal: "로그인 실패 시 오류 메시지를 표시한다"
done_when: "실패 케이스 테스트가 통과하고 UI에 메시지가 보인다"
contract: ["로그인 실패 경로만 변경", "오류 메시지 1건", "수용: 실패 케이스 테스트 통과"]
owned_paths: ["src/auth/", "tests/auth/"]
forbidden: ["결제 모듈 수정", "새 의존성 추가", "소유 밖 파일 수정"]
red_test: "수정 전 실패 케이스 테스트를 먼저 남긴다"
verification: ["npm test -- auth → 통과", "npm run lint → 통과"]  # 명령과 기대 결과
report: "reports/auth-error.md"
timeout_seconds: 900
dependencies: []
```

워커의 `done`은 완료 보고일 뿐 수락이 아닙니다. 순서는 **워커 보고 → 독립 리뷰 → 오케스트레이터 수락**입니다.

반례: `owned_paths` 밖 파일을 수정하면 그 단위는 `blocked`로 전환됩니다. 증거를 보존한 채 오케스트레이터에게 돌아가며, 조용히 수락되지 않습니다.

## 적용 순서

1. **사람용 문서와 에이전트용 문서를 나눕니다.** README/Wiki와 AGENTS/docs의 역할을 구분합니다.
2. **안내 파일을 만듭니다.** AGENTS.md에는 목적, 먼저 읽을 문서, 꼭 지킬 규칙, 명령, 금지 사항만 둡니다.
3. **역할을 정합니다.** 계획·분배를 맡는 오케스트레이터, 구현 워커, 독립 리뷰어를 구분합니다.
4. **작업 단위를 정의합니다.** 단위 ID와 시도 번호, 목표·완료 기준·소유 파일·검증 명령·보고 경로를 담은 브리프를 사용합니다.
5. **게이트를 만듭니다.** CI, 리뷰, 증거 확인을 통과해야 병합되도록 합니다.
6. **자동화합니다.** 레이블, 브랜치 보호, CI를 문서 규칙과 일치시킵니다.
7. **버전을 관리합니다.** SemVer, `VERSION`, `CHANGELOG.md`, 마일스톤, 태그를 사용합니다.
8. **참고 문서로 실행합니다.** [`PROMPTS.md`](https://github.com/usagi-ai-kr/usagi/blob/main/PROMPTS.md)에서 참고할 문서를 확인합니다.

## 최소 체크리스트

- [ ] `AGENTS.md`가 100줄 이하이고 기준 문서를 링크한다.
- [ ] README/Wiki에 운영 규칙을 넣지 않았다.
- [ ] 모든 이슈/PR에 `type:*` 1개와 `status:*` 1개가 붙는다.
- [ ] `main` 직접 push가 차단되고 PR + CI가 필수다.
- [ ] 작업 단위마다 소유 파일과 검증 명령이 명시된다.
- [ ] 리뷰와 CI가 같은 head SHA를 검증한다.
- [ ] `VERSION`과 `CHANGELOG.md`가 릴리스와 일치한다.

## 안티패턴

- AGENTS.md에 모든 규칙을 넣어 200줄을 넘기는 것
- Wiki에 내부 운영 규칙을 넣어 사람의 탐색을 방해하는 것
- CI로 강제할 수 있는 규칙을 문서에만 두는 것
- 워커의 `done` 보고를 수락으로 간주하는 것
- 소유 파일 없이 여러 워커를 동시에 투입하는 것

## 더 읽기

- [규칙 파일 길이 기준과 근거](https://github.com/usagi-ai-kr/usagi/blob/main/docs/rule-file-guidelines.md)
- [용어집](https://github.com/usagi-ai-kr/usagi/wiki/Glossary)
- [하네스 운영 규칙 제안](https://github.com/usagi-ai-kr/usagi/blob/main/docs/multi-agent-orchestration-contract.md)
