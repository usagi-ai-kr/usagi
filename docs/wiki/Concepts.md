# 개념: 스킬·규칙·설계·테스트·레이어

이 페이지는 저장소를 처음 만나는 사람이 핵심 개념을 잡도록 돕습니다. 읽는 순서를 정하지 않습니다. 관심 있는 항목부터 읽고, 정확한 규칙은 각 항목의 원본 문서에서 확인하세요.

## 스킬

Agent Skill은 한 종류의 작업을 위한 재사용 절차와 참고 자료입니다. 필요할 때 불러와 쓰고, 평소에는 꺼내지 않습니다.

구조는 `.agents/skills/<이름>/SKILL.md`입니다. 앞부분에는 `name`·`description`·선택 `compatibility`를 적고, `name`은 디렉터리 이름과 같아야 합니다. 이 저장소의 예시는 `glossary`, `human-doc`, `architecture-review`입니다.

일회성 프롬프트와 스킬은 다릅니다. 스킬은 버전을 갖고 리뷰를 거쳐 CI에서 검증됩니다. 검증받지 않은 지시를 숨기는 장소가 아닙니다. 자세한 형식은 [Agent Skills specification](https://agentskills.io/specification)을 참고하세요. 목록은 [저장소의 skills 디렉터리](https://github.com/usagi-ai-kr/usagi/tree/main/.agents/skills)에서 확인하세요.

## 규칙 파일

| 파일 | 역할 |
| --- | --- |
| `AGENTS.md` | 에이전트용 짧은 안내. 상세 규칙을 들고 있지 않고 연결만 합니다. |
| `CONTRIBUTING.md` | 기여·검증·PR·릴리스 절차의 원본. |
| `docs/rule-file-guidelines.md` | 길이·단어 제한과 그 근거. |

`README.md`와 위키는 사람이 읽는 문서입니다. 에이전트 내부 운영 규칙을 넣지 않습니다. 주제마다 원본을 하나만 두고, 나머지는 복사 대신 링크합니다.

## DESIGN.md

시각 요소의 단일 원본입니다. 색, 서체, 간격, 모서리, 컴포넌트와 그 근거를 담습니다. [design.md specification](https://github.com/google-labs-code/design.md)을 따르고 전용 linter로 검사합니다.

새 색·서체·컴포넌트를 들이기 전에 기존 토큰을 먼저 씁니다. 새 토큰이 필요하면 이유를 기록합니다. 원본은 [DESIGN.md](https://github.com/usagi-ai-kr/usagi/blob/main/DESIGN.md)입니다.

## TDD와 테스트 수준

TDD는 실패하는 테스트를 먼저 쓰고, 통과하는 가장 작은 변경을 한 뒤 정리합니다. 테스트 수준은 목적이 다릅니다.

| 수준 | 확인하는 것 |
| --- | --- |
| Unit | 규칙·로직을 결정적으로. 시간·네트워크·DB는 통제합니다. |
| Slice | 하나의 유스케이스를 경계까지 관통. 실제로 실행한 부분과 대신한 부분을 밝힙니다. |
| Integration | 실제 DB·브로커·어댑터·설정·마이그레이션의 호환성. |
| Regression | 결함을 실패 테스트로 재현하고, 고친 뒤 다시 실행. 전체 게이트도 통과합니다. |

BDD의 Given/When/Then은 수락 기준을 적는 데 유용하지만, 모든 테스트에 강제하지 않습니다. 검증 증거는 명령·결과를 커밋 SHA에 묶습니다. 자세한 증거 규칙은 [위임·증거 문서](https://github.com/usagi-ai-kr/usagi/blob/main/docs/delegation-handoff-evidence.md)를 참고하세요.

## E2E와 실행 증거

E2E 결과는 대상 commit SHA, 고정 viewport/DPR, artifact hash에 묶습니다. Reference runner는 fixture 서버를 직접 소유하고, 브라우저가 없으면 `passed`를 만들지 않습니다. 실패하면 trace·screenshot·log를 보존하고, 재실행 성공으로 실패를 덮지 않습니다. 자세한 계약은 [E2E 결과 계약](https://github.com/usagi-ai-kr/usagi/blob/main/docs/e2e-contract.md)을 참고하세요.

## 레이어와 의존 방향

네 가지 논리 책임으로 나눕니다. UI(화면), App(유스케이스·조정), Domain(업무 규칙·불변식), Infra(영속성·외부 어댑터)입니다.

의존은 `ui → app → domain`으로 흐릅니다. `infra → domain`도 허용됩니다. `infra → app`은 App 포트·계약 모듈에만 허용됩니다. 포트는 안쪽에 두고 Infra가 구현하며, 조합 루트가 구현체를 연결합니다.

물리 폴더 네 개는 필수가 아닙니다. 매핑 설정에 경로·허용 의존·예외를 선언합니다. 계약은 [architecture-contract](https://github.com/usagi-ai-kr/usagi/blob/main/docs/architecture-contract.md), 예시는 [example map](https://github.com/usagi-ai-kr/usagi/blob/main/docs/architecture-map.example.json)을 참고하세요.

## 모델 운용

[모델별 운용 기록](Model-Operations)은 세 저장소의 하루 운영에서 모은 정성 관찰입니다. 벤치마크나 순위가 아닙니다.

## 용어집

[Glossary](Glossary)는 용어의 원본입니다. 카테고리 문서에서 생성되며, 낯선 말은 여기서 정의와 출처를 확인합니다.
