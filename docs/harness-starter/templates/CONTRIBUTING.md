# CONTRIBUTING.md — AI contribution guide

<!-- Copy to the target repository root. Replace the <...> values. -->

> 이 문서는 AI 에이전트용 기여 가이드입니다. 사람이 읽는 문서는 `README.md`와 Wiki에 있습니다.
> 이 저장소는 운영자 전용이며, 외부 에이전트의 이슈/PR 기여는 받지 않습니다.

## 0. 시작 프롬프트

```text
<TARGET_REPO_URL>

이 저장소의 README.md, AGENTS.md, CONTRIBUTING.md를 읽고, 필요한 최소 하네스만 제안해줘. 파일을 만들기 전에 계획을 보여줘.
```

## 1. 시작 전

- `AGENTS.md`와 기준 문서를 읽습니다.
- `main` 직접 push가 금지되어 있음을 확인합니다.
- 브랜치 이름은 `docs/<slug>`, `feat/<slug>`, `fix/<slug>`, `chore/<slug>` 중 하나를 사용합니다.
- 이슈/PR 레이블은 `type:*` 1개 + `status:*` 1개입니다.

## 2. 변경

- 한 PR에는 하나의 목적만 담습니다.
- 소유 범위 밖 파일을 수정하지 않습니다.
- 비밀값·토큰·개인정보·원본 DB export를 커밋하지 않습니다.

## 3. 검증

```bash
<TEST_COMMAND>
<LINT_COMMAND>
<TYPECHECK_COMMAND>
```

- CI가 통과해야 합니다.
- 검증한 커밋과 병합할 커밋이 같은지 head SHA로 확인합니다.

## 4. PR

- base는 `main`, 제목은 `docs:`, `feat:`, `fix:`, `chore:` 중 하나로 시작합니다.
- 본문에 `Summary`, `Scope`, `Validation`, `Related issue`를 넣습니다.
- 최신 `main`과 동기화한 뒤 squash merge합니다.
- 자기 PR은 GitHub에서 승인할 수 없습니다. 승인이 필요하면 다른 리뷰어를 지정합니다.

## 5. 금지

- `main` 직접 push 또는 force push
- 검증 없이 PR 병합
- 한 이슈/PR에 `type:*` 2개 또는 `status:*` 2개
