# Contributing

이 저장소는 **사람이 읽는 문서**(README, Wiki)와 **에이전트용 규칙·데이터**(AGENTS.md, docs/, .agents/skills/)를 나눠 관리합니다.

## 제안과 변경

- 문제·제안은 이슈로 기록합니다.
- 변경은 `main` 대상 PR로 제출합니다. 한 PR에는 하나의 목적만 담습니다.
- 제목은 `docs:`, `feat:`, `fix:`, `chore:` 같은 Conventional Commits를 권장합니다.
- 아직 준비되지 않은 제안은 Draft PR로 열고, 준비되면 ready로 전환합니다.
- PR 본문에는 `Summary`, `Scope`, `Validation`, `Related issue`를 적습니다.

## 문서를 찾을 때

- 사람: [README](README.md) → [Wiki](https://github.com/usagi-ai-kr/usagi/wiki)
- 에이전트: [AGENTS.md](AGENTS.md) → `docs/` → `.agents/skills/`

## 용어 추가

정의는 `docs/glossary/<category>.md`에 추가하고, `docs/glossary.md` 인덱스는 자동 생성합니다.

```bash
node scripts/build-glossary-index.mjs
node scripts/validate.mjs
./scripts/sync-wiki.sh
```

위키의 `Glossary` 페이지는 저장소 문서에서 생성되므로 직접 편집하지 않습니다.

## 레이블·CI·브랜치 보호

에이전트 운영 규칙과 동일한 내용을 [AGENTS.md](AGENTS.md)에 정리했습니다. 요약하면 다음과 같습니다.

- 모든 이슈/PR: `type:*` 1개 + `status:*` 1개
- PR 필수, CI `validate` 통과 필수, squash merge
- `main` 직접 push·force push·삭제 금지

## 보안

공개 이슈/PR/위키에 비밀값, 인증 토큰, 개인정보, 원본 DB export를 남기지 않습니다.
