# CONTRIBUTING.md — AI contribution guide

> **운영 범위**: 이 저장소는 운영자 전용입니다. 외부 에이전트의 이슈/PR 기여는 받지 않습니다. 이 문서는 운영자가 사용하는 내부 에이전트용입니다.

이 문서는 AI 에이전트가 이 저장소에 기여할 때 따르는 상세 가이드입니다. 사람이 읽는 문서는 `README.md`와 GitHub Wiki에 있습니다. [`AGENTS.md`](AGENTS.md)는 에이전트용 안내 파일이며, 규칙 파일 길이 기준과 근거는 [`docs/rule-file-guidelines.md`](docs/rule-file-guidelines.md)를 따릅니다.

다른 프로젝트에 적용할 때는 [`PROMPTS.md`](PROMPTS.md)와 [`docs/harness-starter/`](docs/harness-starter/)를 참고합니다.

## 0. 복붙 프롬프트

```text
https://github.com/usagi-ai-kr/usagi

이 저장소는 에이전트 운영 경험과 공통 규약을 모으는 공간이다.
저장소가 로컬에 있으면 그 경로를, 없으면 위 GitHub 링크의 README.md, AGENTS.md, CONTRIBUTING.md, docs/glossary.md를 읽어라.

앞으로 내가 쓰는 낯선 용어는 docs/glossary/<category>.md의 정의와 출처를 근거로 쉬운 말로 설명해라.
용어집에 없는 용어는 docs/glossary/categories.json에서 카테고리를 고르고, 기존 형식으로 항목 초안과 참고 출처를 제안해라.
문서를 바꾸기 전에 계획을 보여주고, 승인 후 node scripts/build-glossary-index.mjs와 node scripts/validate.mjs를 실행해라.
Wiki는 사람이 읽는 문서이므로 운영 규칙을 추가하지 말고, 게시가 필요하면 ./scripts/sync-wiki.sh를 사용해라.
디자인 변경은 DESIGN.md, 스킬 변경은 Agent Skills 스펙을 따른다.
```

## 1. 시작 전

- [`AGENTS.md`](AGENTS.md), [`docs/glossary.md`](docs/glossary.md)를 읽습니다.
- `main` 직접 push, force push, branch 삭제가 금지되어 있음을 확인합니다.
- 브랜치 이름은 `docs/<slug>`, `feat/<slug>`, `fix/<slug>`, `chore/<slug>` 중 하나를 사용합니다.
- 이슈/PR 레이블은 `type:*` 1개 + `status:*` 1개, 정확히 하나씩입니다.
- 제안 단계면 Draft PR로 엽니다.

## 2. 변경

- 한 PR에는 하나의 목적만 담습니다.
- 용어집은 `docs/glossary/<category>.md`를 수정하고 `docs/glossary.md`는 생성합니다.
- 스킬은 [Agent Skills specification](https://agentskills.io/specification)을 따릅니다. `SKILL.md`의 `name`은 디렉터리명과 같아야 합니다.
- `DESIGN.md`는 [design.md specification](https://github.com/google-labs-code/design.md)을 따릅니다.
- `docs/wiki/`는 사람이 읽는 원본입니다. 운영 규칙을 추가하지 않습니다.
- 비밀값·토큰·개인정보·원본 DB export를 커밋하지 않습니다.

### 작업 분담

- 기존 워커(w)를 먼저 확인하고 재사용합니다. 새 패널·에이전트·리뷰어는 사용자 명시 승인 없이는 만들지 않습니다.
- 기존 w에게 절대 worktree 경로, 소유 파일 목록, 보고서 경로를 브리프로 줍니다. cwd를 바꾼다는 이유로 새 워커를 만들지 않습니다.
- orchestrator는 w가 소유한 파일을 직접 수정하지 않습니다. w가 실패하면 근거를 남기고 `blocked`/`failed`로 기록한 뒤 재배정하거나 사용자에게 확인합니다.
- pane idle이나 `agent_not_found`만으로 완료로 판정하지 않습니다. 보고서의 `status`, 변경 파일, 명령, head SHA를 확인합니다.

## 3. 검증

```bash
node scripts/validate.mjs
node scripts/build-glossary-index.mjs --check
node --test scripts/check-human-doc.test.mjs
node scripts/doctor.mjs
node --test scripts/doctor.test.mjs
node scripts/check-human-doc.mjs --require-metadata docs/human-writing-contract.md
for skill in .agents/skills/*; do npx --yes skills-ref@0.1.5 validate "$skill"; done
npx --yes @google/design.md@0.4.0 lint DESIGN.md
for script in scripts/*.sh; do bash -n "$script"; done
```

- `validate` CI가 통과해야 합니다.
- 검증한 커밋과 병합할 커밋이 같은지 head SHA로 확인합니다.
- 사람이 읽는 문서는 [독자 중심 작성 계약](docs/human-writing-contract.md)과 [human-doc 스킬](.agents/skills/human-doc/SKILL.md)을 따릅니다.
- `node scripts/check-human-doc.mjs <문서.md>`는 문장 64자·문단 256자·문서 1,024자의 초과를 경고합니다. `--require-metadata`는 `doc_type`, `audience`, 문서 유형별 필수 필드를 검사합니다.
- 길이 경고는 구조 개선 신호이며, 의미적 완성도와 예외는 리뷰어가 판단합니다.

## 4. PR

- base는 `main`, 제목은 `docs:`, `feat:`, `fix:`, `chore:` 중 하나로 시작합니다.
- 본문에 `Summary`, `Scope`, `Validation`, `Related issue`를 넣습니다.
- 레이블을 `type:*` 1개 + `status:*` 1개 붙입니다.
- 리뷰 대화를 모두 resolve합니다.
- 최신 `main`과 동기화한 뒤 squash merge합니다.

```bash
gh pr merge <number> --squash --match-head-commit "$(gh pr view <number> --json headRefOid --jq .headRefOid)"
```

- 자기 PR은 GitHub에서 승인할 수 없습니다. 승인이 필요하면 다른 리뷰어를 지정합니다.

## 5. Wiki

- 위키 페이지를 직접 편집하지 않습니다.
- 원본을 수정한 뒤 `./scripts/sync-wiki.sh`로 게시합니다.
- 게시 전 차이는 `./scripts/sync-wiki.sh --check`로 확인합니다.

## 6. 버전과 릴리스

- [Semantic Versioning](https://semver.org/)을 따릅니다. `VERSION`이 현재 버전의 원본이며 `0.1.x`부터 시작합니다.
- 모든 사용자 가시 변경은 `CHANGELOG.md`의 `[Unreleased]`에 기록합니다.
- 릴리스 순서:
  1. `VERSION`을 올리고 `CHANGELOG.md`의 `[Unreleased]`를 `[x.y.z] - YYYY-MM-DD`로 옮깁니다.
  2. PR을 열고 `validate` CI를 통과시킵니다.
  3. `main`에 squash merge합니다.
  4. `main`에서 annotated tag를 만듭니다: `git tag -a vX.Y.Z -m "usagi vX.Y.Z" && git push origin vX.Y.Z`.
  5. `Release` workflow가 `CHANGELOG.md`에서 해당 버전 섹션을 추출해 GitHub Release를 만듭니다.
- 마일스톤은 `vX.Y.Z` 이름을 사용하고 릴리스 후 닫습니다.
- 태그를 옮기거나 삭제하지 않습니다.

## 7. 금지

- `main` 직접 push 또는 force push
- 위키 직접 편집
- `docs/glossary.md` 수동 편집
- 한 이슈/PR에 `type:*` 2개 또는 `status:*` 2개
- 검증 없이 PR 병합
