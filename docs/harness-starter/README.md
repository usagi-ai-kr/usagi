# Harness starter

이 저장소를 참고해 다른 프로젝트에 **최소 하네스**를 적용하는 가이드입니다. 목표는 에이전트가 안정적으로 일할 수 있을 만큼만 구조를 만들고, 나머지는 프로젝트에 맞게 확장하는 것입니다.

## 5분 경로

1. [하네스 엔지니어링이란?](https://github.com/usagi-ai-kr/usagi/wiki/What-is-Harness-Engineering)와 [운영 플로우](https://github.com/usagi-ai-kr/usagi/wiki/Workflows)를 읽습니다.
2. [`templates/AGENTS.md`](templates/AGENTS.md)를 대상 저장소 루트에 복사하고 빈칸을 채웁니다.
3. [`templates/CONTRIBUTING.md`](templates/CONTRIBUTING.md)를 복사해 에이전트 기여 체크리스트를 만듭니다.
4. [`templates/labels.json`](templates/labels.json)과 [`templates/branch-protection.json`](templates/branch-protection.json)을 `.github/`에 맞게 적용합니다.
5. [`templates/ci.yml`](templates/ci.yml)을 대상 저장소의 검증 명령에 맞게 수정합니다.
6. [`PROMPTS.md`](https://github.com/usagi-ai-kr/usagi/blob/main/PROMPTS.md)의 프롬프트로 나머지 설정을 에이전트에게 맡깁니다.

## 최소 구성

| 구성 | 역할 | 이 저장소 예시 |
| --- | --- | --- |
| `AGENTS.md` | 에이전트용 안내 파일. 100줄 이하 | [`AGENTS.md`](https://github.com/usagi-ai-kr/usagi/blob/main/AGENTS.md) |
| `CONTRIBUTING.md` | 상세 기여 체크리스트·복붙 프롬프트 | [`CONTRIBUTING.md`](https://github.com/usagi-ai-kr/usagi/blob/main/CONTRIBUTING.md) |
| `README.md` / Wiki | 사람이 읽는 진입점 | [`README.md`](https://github.com/usagi-ai-kr/usagi/blob/main/README.md) |
| `.github/labels.json` | 최소 MECE 레이블 | [`labels.json`](https://github.com/usagi-ai-kr/usagi/blob/main/.github/labels.json) |
| `.github/branch-protection.json` | `main` 보호 설정 | [`branch-protection.json`](https://github.com/usagi-ai-kr/usagi/blob/main/.github/branch-protection.json) |
| CI `validate` | 링크·규칙·문서 검증 | [`ci.yml`](https://github.com/usagi-ai-kr/usagi/blob/main/.github/workflows/ci.yml) |
| `docs/` | 에이전트용 지식·제안 문서 | [`docs/`](https://github.com/usagi-ai-kr/usagi/tree/main/docs) |
| `.agents/skills/` | 재사용 가능한 절차 | [`glossary` skill](https://github.com/usagi-ai-kr/usagi/blob/main/.agents/skills/glossary/SKILL.md) |

## 적용 순서

1. **사람용 문서와 에이전트용 문서를 나눕니다.** README/Wiki와 AGENTS/docs의 역할을 구분합니다.
2. **안내 파일을 만듭니다.** AGENTS.md에는 목적, 먼저 읽을 문서, 꼭 지킬 규칙, 명령, 금지 사항만 둡니다.
3. **역할을 정합니다.** 계획·분배를 맡는 오케스트레이터, 구현 워커, 독립 리뷰어를 구분합니다.
4. **작업 단위를 정의합니다.** 목표·완료 기준·소유 파일·검증 명령·보고 경로를 담은 브리프를 사용합니다.
5. **게이트를 만듭니다.** CI, 리뷰, 증거 확인을 통과해야 병합되도록 합니다.
6. **자동화합니다.** 레이블, 브랜치 보호, CI를 문서 규칙과 일치시킵니다.
7. **버전을 관리합니다.** SemVer, `VERSION`, `CHANGELOG.md`, 마일스톤, 태그를 사용합니다.
8. **프롬프트로 실행합니다.** [`PROMPTS.md`](https://github.com/usagi-ai-kr/usagi/blob/main/PROMPTS.md)에서 상황에 맞는 프롬프트를 복사합니다.

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
