# CONTRIBUTING.md — agent checklist

이 파일은 에이전트용 기여 체크리스트입니다. 전체 규칙의 원본은 [`AGENTS.md`](AGENTS.md)입니다. 사람이 읽는 문서는 `README.md`와 GitHub Wiki에 있습니다.

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

## 3. 검증

```bash
node scripts/validate.mjs
node scripts/build-glossary-index.mjs --check
npx --yes skills-ref@0.1.5 validate .agents/skills/glossary
npx --yes @google/design.md@0.4.0 lint DESIGN.md
for script in scripts/*.sh; do bash -n "$script"; done
```

- `validate` CI가 통과해야 합니다.
- 검증한 커밋과 병합할 커밋이 같은지 head SHA로 확인합니다.

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

## 6. 금지

- `main` 직접 push 또는 force push
- 위키 직접 편집
- `docs/glossary.md` 수동 편집
- 한 이슈/PR에 `type:*` 2개 또는 `status:*` 2개
- 검증 없이 PR 병합
