# usagi

Unsupervised Space for Agent Guidelines & Infrastructure.

[![CI](https://github.com/usagi-ai-kr/usagi/actions/workflows/ci.yml/badge.svg)](https://github.com/usagi-ai-kr/usagi/actions/workflows/ci.yml)

## Start here

- [Glossary (용어집)](docs/glossary.md) — Issue #1 / PR #2에 나오는 낯선 용어를 찾는 사전. 위키에도 게시됩니다.
- [Contributing](CONTRIBUTING.md) — 레이블, 브랜치 보호, CI, 위키 동기화 규칙.
- [Issue #1 — Herdr 멀티 에이전트 하네스](https://github.com/usagi-ai-kr/usagi/issues/1)
- [PR #2 — Multi-agent orchestration contract](https://github.com/usagi-ai-kr/usagi/pull/2)

## Repository layout

```text
docs/
  glossary.md                 # 용어집 원본
  wiki/                       # 위키에 게시할 Home / Sidebar 원본
.github/
  labels.json                 # MECE 레이블 정의 (as code)
  branch-protection.json      # main 브랜치 보호 설정
  workflows/ci.yml            # 문서·용어집·레이블 검증
scripts/
  validate.mjs                # 링크·용어집·레이블 검사
  sync-labels.sh              # labels.json -> GitHub labels
  sync-wiki.sh                # docs -> GitHub wiki
  apply-repo-policy.sh        # 병합 설정 + main 브랜치 보호 적용
```
