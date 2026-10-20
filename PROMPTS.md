# 바로 쓰는 프롬프트

이 목록은 이 저장소를 참고해 다른 프로젝트에 하네스 엔지니어링을 적용할 때 쓰는 프롬프트입니다. 아래 블록을 그대로 복사해 에이전트에게 붙여넣고, `내 저장소`를 실제 대상으로 바꾸세요.

## 0. 한 줄로 시작

```text
https://github.com/usagi-ai-kr/usagi 를 참고해 내 저장소에 최소 하네스 구조를 적용해줘. 먼저 현재 구조를 읽고 계획만 보여줘.
```

## 1. 최소 하네스 적용

```text
https://github.com/usagi-ai-kr/usagi 의 docs/harness-starter/README.md와 templates/를 참고해 내 저장소에 최소 하네스를 적용해줘.

- 먼저 내 저장소의 README, AGENTS.md, CI, 이슈/PR 템플릿을 읽어라.
- AGENTS.md, CONTRIBUTING.md, labels, branch protection, CI 중 필요한 것만 골라 계획을 보여라.
- 아직 파일을 만들지 말고, 바꿀 파일과 이유를 먼저 제안해라.
- 내가 승인하면 작은 단위로 적용하고, 각 단계의 검증 명령과 결과를 보고해라.
```

## 2. AGENTS.md 정리

```text
https://github.com/usagi-ai-kr/usagi/blob/main/AGENTS.md 와 docs/rule-file-guidelines.md를 참고해 내 저장소의 AGENTS.md를 짧은 안내 파일로 정리해줘.

- 100줄/800단어 이하로 유지해라.
- 목적, 먼저 읽을 문서, 꼭 지킬 규칙, 명령, 금지 사항만 남겨라.
- 상세 내용은 CONTRIBUTING.md나 docs/로 옮기고 링크해라.
- 바꾸기 전후의 줄 수와 단어 수를 보여줘.
```

## 3. 역할과 작업 분배

```text
https://github.com/usagi-ai-kr/usagi/blob/main/docs/multi-agent-orchestration-contract.md 와 docs/delegation-handoff-evidence.md를 참고해 내 저장소의 에이전트 역할을 정리해줘.

- 오케스트레이터, 구현 워커, 리뷰어의 책임과 하지 말아야 할 일을 표로 만들어라.
- 작업 단위 브리프 템플릿(목표, 완료 기준, 소유 파일, 금지, 검증 명령, 보고 경로)을 만들어라.
- 콜백과 수락 절차를 한 페이지로 요약해라.
- 실제 파일을 만들기 전에 초안만 보여줘.
```

## 4. PR 리뷰와 수락

```text
https://github.com/usagi-ai-kr/usagi/blob/main/docs/multi-agent-orchestration-contract.md 의 검증·리뷰 기준을 참고해 이 PR을 리뷰해줘.

- 먼저 PR의 변경 범위와 CI 상태를 확인해라.
- 첫 줄에 `판정: approve` 또는 `판정: request-changes`를 적어라.
- 차단 사항은 파일·줄·이유·수정 방향으로 나눠라.
- 비차단 제안은 따로 모아라.
- 검증한 head SHA와 확인한 명령을 적어라.
```

## 5. 막힌 작업 정리

```text
https://github.com/usagi-ai-kr/usagi/blob/main/docs/harness-triage-evidence-assurance.md 의 triage 기준을 참고해 이 작업의 상태를 정리해줘.

- 관찰된 사실과 추정을 분리해라.
- 원인을 계획 실패, 역량 불일치, 외부 의존성, 단순 실수 중 하나로 분류해라.
- 다음 행동(재시도, 재분배, 에스컬레이션, 중단)을 하나 고르고 이유를 적어라.
- 필요한 증거와 확인 명령을 적어라.
```

## 6. 용어집 만들기

```text
https://github.com/usagi-ai-kr/usagi/blob/main/docs/glossary.md 와 docs/glossary/의 카테고리 문서를 참고해 내 저장소의 용어집을 만들어줘.

- 먼저 내 저장소 문서에서 낯선 용어를 20개 골라라.
- 5개 이하의 카테고리로 나누고, 각 용어에 짧은 뜻과 출처를 적어라.
- 기존 문서에 이미 있는 설명은 중복하지 말고 링크해라.
- 초안을 보여준 뒤 승인을 받아라.
```

## 7. 릴리스와 버전 관리

```text
https://github.com/usagi-ai-kr/usagi/blob/main/CONTRIBUTING.md 의 버전·릴리스 절차를 참고해 내 저장소에 SemVer 관리를 적용해줘.

- VERSION, CHANGELOG.md, 마일스톤, 태그 흐름을 제안해라.
- 현재 버전을 0.1.0으로 시작하고, 다음 변경을 [Unreleased]에 기록해라.
- 태그는 main에서 만들고, 태그를 옮기거나 삭제하지 않는다.
- 릴리스 노트는 CHANGELOG에서 해당 버전 섹션만 추출해라.
```

## 8. 저장소 점검

```text
https://github.com/usagi-ai-kr/usagi/blob/main/docs/rule-file-guidelines.md 와 docs/harness-starter/README.md를 기준으로 내 저장소를 점검해줘.

- AGENTS.md가 너무 길거나 중복된 규칙이 있는지 확인해라.
- README/Wiki에 에이전트 운영 규칙이 섞여 있는지 확인해라.
- CI로 강제할 수 있는데 문서에만 있는 규칙을 찾아라.
- 우선순위가 높은 5개만 골라 수정 계획을 보여줘.
```

## 9. 사람이 읽는 문서 다듬기

```text
https://github.com/usagi-ai-kr/usagi/blob/main/README.md 와 docs/wiki/를 참고해 내 저장소의 README를 사람이 읽기 쉽게 다듬어줘.

- 목적, 무엇이 있는지, 처음 읽는 순서, 현재 버전만 남겨라.
- 운영 규칙과 내부 구조 설명은 AGENTS.md나 CONTRIBUTING.md로 옮겨라.
- 문장은 짧게, 번역투 표현은 일반적인 말로 바꿔라.
- 바꾸기 전후를 비교해 보여줘.
```

## 10. 이 저장소 설명

```text
https://github.com/usagi-ai-kr/usagi 를 읽고, 이 저장소가 무엇을 제공하는지, 어떤 순서로 읽으면 되는지, 지금 바로 쓸 수 있는 프롬프트가 무엇인지 10줄 이내로 설명해줘.
```
