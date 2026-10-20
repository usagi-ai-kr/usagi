# AGENTS.md

<!-- Copy to the target repository root. Replace the <...> values. Keep under 100 lines. -->

이 파일은 에이전트용 안내 파일입니다. 상세 규칙은 링크된 기준 문서에 있습니다.

## 0. 문서 역할

- `README.md`와 Wiki: 사람용. 운영 규칙을 넣지 않습니다.
- `AGENTS.md`: 에이전트용 안내 파일(이 파일).
- `CONTRIBUTING.md`: 상세 기여 체크리스트·복붙 프롬프트.
- `docs/`: 프로젝트 지식과 제안 문서.

## 1. 먼저 읽을 것

- [CONTRIBUTING.md](CONTRIBUTING.md)
- [README.md](README.md)
- `<ARCHITECTURE_DOC>`
- `<DOMAIN_DOC>`

## 2. 꼭 지킬 규칙

- `main` 직접 push·force push·삭제 금지. PR + CI + 최신 `main` + squash merge.
- 이슈/PR 레이블은 `type:*` 1개 + `status:*` 1개.
- 비밀값·토큰·개인정보를 커밋하지 않습니다.
- 검증 없이 병합하지 않습니다.

## 3. 명령

```bash
<TEST_COMMAND>
<LINT_COMMAND>
<TYPECHECK_COMMAND>
```

## 4. 기준 문서

| 주제 | 원본 |
| --- | --- |
| 기여·PR | `CONTRIBUTING.md` |
| 레이블 | `.github/labels.json` |
| 브랜치 보호 | `.github/branch-protection.json` |
| CI | `.github/workflows/ci.yml` |
| 아키텍처 | `<ARCHITECTURE_DOC>` |

## 5. 금지

- `main` 직접 push 또는 force push
- 검증 없이 PR 병합
- 소유 범위 밖 파일 수정
