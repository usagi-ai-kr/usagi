---
doc_type: reference
audience: usagi를 운용하는 에이전트
---
# 요구사항 추적성 검사

Source: [Issue #59](https://github.com/usagi-ai-kr/usagi/issues/59).
관련: [#46](https://github.com/usagi-ai-kr/usagi/issues/46), [#22](https://github.com/usagi-ai-kr/usagi/issues/22), [#23](https://github.com/usagi-ai-kr/usagi/issues/23).

이 문서는 PRD, SRS, ADR 문서의 추적성 검사를 정의합니다. 요구사항 ID와 테스트 증거, 결정 기록이 실제로 이어졌는지 기계적으로 확인합니다. 문서 깊이와 경로는 [document-review-paths.md](document-review-paths.md)를 따릅니다.

## 1. 요구사항 ID

- 형식은 `REQ-<종류>-<일련번호>`입니다.
- 종류는 문서에서 정합니다. 기능은 `F`, 비기능은 `N`을 씁니다.
- 같은 ID를 두 번 선언하지 않습니다. 선언은 한 군데만 둡니다.

```markdown
- REQ-F-001: 로그인 실패 시 오류 메시지를 표시한다.
- REQ-N-001: 응답 지연을 200ms 이하로 유지한다.
```

## 2. 선언·매핑·참조

검사기는 ID가 나타나는 자리를 세 종류로 나눕니다.

- **선언**: 줄의 첫 토큰이 ID인 경우. 제목 기호, 목록 기호, 강조를 걷어낸 뒤 판단합니다.
- **매핑 행**: 표 행의 첫 칸에 ID가 있고 둘째 칸이 비어 있지 않은 경우.
- **참조**: 그 밖의 모든 언급.

ID 뒤에 한국어 조사가 붙으면 선언이 아니라 본문 언급으로 봅니다. 둘째 칸이 구분선이나 자리표시자(TBD 등)면 매핑 행이 아닙니다.

```markdown
- REQ-F-001: 로그인 실패 시 오류 메시지를 표시한다.
| REQ-F-001 | tests/auth.test.ts | ADR-001 |
본문에서 REQ-F-001을 다시 언급한다.
```

위 세 줄은 각각 선언, 매핑 행, 참조입니다.

코드펜스 안의 내용은 검사에서 제외합니다. 예시로 쓰는 ID는 코드펜스 안에 두면 요구사항으로 세지지 않습니다. 참고 문서와 템플릿을 검사 대상에서 완전히 분리하는 일은 [#59의 남은 범위](https://github.com/usagi-ai-kr/usagi/issues/59#issuecomment-6287086018)에 남아 있습니다.

## 3. ADR 레지스트리

ADR 번호는 두 가지 경우에 선언된 것으로 봅니다.

- 파일명에 `ADR-<번호>`가 들어간 문서가 있는 경우.
- 줄의 첫 토큰이 `ADR-<번호>`인 선언 줄이 있는 경우.

그 밖의 `ADR-<번호>` 언급은 참조입니다. light 모드에서는 경고, full 모드에서는 오류로 보고합니다. ADR 참조는 같은 줄에 있는 요구사항에만 연결됩니다. 결정 기록을 다른 줄에 적으면 full 모드에서 연결이 없습니다.

## 4. 모드

- `light`: 요구사항 ID가 없어도 통과합니다. ID가 있으면 중복 선언, 모르는 참조, 선언 없는 매핑 행을 오류로 보고합니다.
- `full`: light 검사에 더해, 선언된 모든 ID에 매핑 행과 ADR 참조가 있어야 합니다.

매핑 행만 있고 선언이 없는 ID는 두 모드에서 모두 오류입니다. 매핑 행은 모르는 ID를 가리키는 참조이기 때문입니다.

## 5. 사용법

```bash
node scripts/check-requirement-trace.mjs --docs docs --mode light
node scripts/check-requirement-trace.mjs --docs docs --mode full --json
```

종료 코드는 세 가지입니다. `0`은 유효(경고 허용), `1`은 추적성 오류, `2`는 사용법·읽기 오류입니다.

`--docs`는 필수입니다. `.git`, `node_modules`, `tmp` 디렉터리는 건너뜁니다. 읽을 수 없는 디렉터리나 문서가 있으면 조용히 넘어가지 않고 `2`로 끝냅니다. 검사기는 파일을 읽기만 하고 쓰거나 설치하지 않습니다.

### 기대 결과

| 명령 | 종료 코드 | 출력 요지 |
| --- | --- | --- |
| `node scripts/check-requirement-trace.mjs --docs docs --mode light` | `0` | 오류 없음. 경고 2건(용어집이 참조한 `ADR-0042`, 요구사항 ID가 없다는 안내)과 요약 줄만 낸다 |
| `node scripts/check-requirement-trace.mjs --docs docs --mode full` | `1` | 오류는 용어집이 참조한 `ADR-0042`(선언 없음) 1건. 저장소 문서에는 요구사항 ID가 없어 매핑 누락 오류는 없다 |

성공 예는 저장소 문서 트리, 실패 예는 같은 트리의 전체 모드입니다. 프로젝트 문서는 `full` 모드로 검사하고 참고 문서·템플릿은 검사 대상에서 빼는 구성을 권합니다.

## 6. JSON 리포트

`schema_version`, `mode`, `docs`, `requirements[]`, `errors[]`, `warnings[]`, `summary`를 냅니다.

`requirements[]` 항목은 `id`, `files[]`, `declared`, `mapped`, `adr_refs[]`로 이루어집니다. `summary`는 파일 수, 요구사항 수, 매핑 수, ADR 연결 수, 오류 수, 경고 수, 상태를 담습니다.

## 7. 검사하지 않는 것

- 요구사항 내용이 타당한지, 시나리오가 충분한지 판단하지 않습니다.
- 그 테스트가 실제로 요구사항을 증명하는지 확인하지 않습니다.
- 매핑 행 둘째 칸에 적힌 파일이 실제로 있는지 보지 않습니다.
- 표 머리글을 읽지 않습니다. 둘째 칸을 테스트 칸으로 가정합니다.

내용 판단은 [document-review 스킬](../.agents/skills/document-review/SKILL.md)과 리뷰어 몫입니다. 기계 검사는 통과 근거가 아니라 확인의 출발점입니다.

## 8. 미룬 범위

[#59의 남은 범위 체크리스트](https://github.com/usagi-ai-kr/usagi/issues/59#issuecomment-6287086018)가 다음 항목을 추적합니다.

- 문서 템플릿 연결: `docs/document-templates.md`의 템플릿 ID와 검사 대상 문서를 분리해 연결
- 금지된 추측 표시(speculation marker) 검사
- ADR 대체(superseded) 관계와 링크 누락 검사

미룬 이유는 이 이슈가 최소 동작을 먼저 고정하는 범위였기 때문입니다. ID 추출·매핑·light/full 경로 검사가 그 범위입니다. 완료 조건은 각 항목에 정상·실패 fixture 테스트가 있고 이 문서에 사용법과 한계가 적히는 것입니다.

## 9. 관련

- [#59](https://github.com/usagi-ai-kr/usagi/issues/59) — PRD/SRS/ADR 요구사항 추적성 검사기
- [#46](https://github.com/usagi-ai-kr/usagi/issues/46) — 프로젝트 규모별 문서 검토 경로 제안
- [#22](https://github.com/usagi-ai-kr/usagi/issues/22) — 구조·테스트 계약
- [#23](https://github.com/usagi-ai-kr/usagi/issues/23) — E2E 브라우저·시각 검증 실행 계약
