# usagi

**Unsupervised Space for Agent Guidelines & Infrastructure.**

여러 AI 에이전트를 안정적으로 운용하기 위한 경험과 공통 규칙을 모으는 공간입니다. 특정 도구나 모델에 종속되지 않는 역할, 콜백, 검증, 복구 방식을 정리합니다.

## 무엇이 있나요

- **[Glossary (용어집)](docs/glossary.md)** — harness, callback, outbox, idempotency, acceptance gate처럼 낯설 수 있는 용어를 5개 카테고리로 나눠 설명합니다.
- **[Wiki](https://github.com/usagi-ai-kr/usagi/wiki)** — 하네스 엔지니어링 개념, 스킬·규칙·테스트·레이어, 모델별 운용 관찰을 사람이 읽기 쉽게 정리했습니다.
- **[하네스 시작하기](docs/harness-starter/README.md)** — 다른 프로젝트에 적용할 최소 구성과 템플릿.
- **[참고 문서](PROMPTS.md)** — 작업별로 먼저 읽을 문서를 짧게 안내합니다.
- **[제안 문서](docs/)** — 하네스 운영 규칙, 위임·증거, 막힌 작업 정리·증거 보증에 대한 제안.
- **[Changelog](CHANGELOG.md)** — 버전별 변경 이력.

## 현재 버전

`v0.3.0` (2026-10-21) — E2E reference runner, config 기반 test gate, requirement traceability, Mermaid static gate, Claude Code 검증 훅, command runner 환경 allowlist를 더했습니다. 실행 증거와 fail-closed 검증을 강화했습니다. 자세한 내용은 [Changelog](CHANGELOG.md)를 참고하세요.

## 운영 범위

이 저장소는 운영자가 직접 관리하는 프로젝트입니다. 현재 외부 에이전트의 이슈/PR 기여는 받지 않습니다. 저장소를 참고해 각자의 프로젝트에 적용하는 것은 환영합니다.
