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

코드펜스 안의 내용은 검사에서 제외합니다. 예시로 쓰는 ID는 코드펜스 안에 두면 요구사항으로 세지지 않습니다. 참고 템플릿도 코드펜스 안에 두면 됩니다.

## 3. 템플릿 연결

살아 있는 문서는 frontmatter에 `template:`을 적어 사용한 템플릿을 밝힙니다.

```yaml
---
template: SRS
---
```

- 레지스트리는 `--docs` 기준 `<docs>/document-templates.md`에서 찾습니다.
- 레지스트리는 머리글 줄에 `ID`와 `template`가 있는 표입니다. 첫 열이 등록된 ID입니다.
- 선언한 ID가 레지스트리에 없으면 `unknown_template` 오류입니다.
- 레지스트리 파일이 없거나 레지스트리 표가 비어 있으면 `template_registry_unavailable` 경고입니다. 조용히 통과하지도 실패하지도 않습니다.
- `template:`을 적지 않은 문서는 light 경로에서 그대로 통과합니다.
- `template:` 키는 대소문자를 구분합니다. `Template:`처럼 쓰면 검사에서 무시됩니다.
- ID는 대소문자를 구분합니다. `PRD`, `SRS`, `ADR`처럼 대문자로 적습니다.

## 4. 추측 표시 검사

자리표시자를 남긴 요구사항은 추적할 수 없습니다. 표시 목록은 고정입니다.

- `TBD`, `TODO`, `FIXME`
- `가정:`, `추정:`, `미정`, `추후 결정`, `확인 필요`

표시는 살아 있는 요구사항 선언 줄, 매핑 행, ADR 선언 줄, frontmatter에서만 봅니다. 코드펜스 예시와 일반 본문은 보지 않습니다. 발견하면 `speculation_marker` 오류이며 light·full 두 모드에서 같습니다.

한글 표시는 경계를 봅니다. `미정`·`미정이다`·`미정 상태`·`일정은 미정`은 잡고 `미정렬`·`미정리`는 지나갑니다. `추후 결정`은 잡고 `추후 결정된 사항`은 지나갑니다. `재확인 필요`처럼 다시 확인할 일은 보류 표시로 보고 잡습니다.

## 5. ADR 레지스트리와 대체 관계

ADR 번호는 세 가지 경우에 선언된 것으로 봅니다.

- 파일명에 `ADR-<번호>`가 들어간 문서가 있는 경우.
- 줄의 첫 토큰이 `ADR-<번호>`인 선언 줄이 있는 경우.
- frontmatter에 `adr: ADR-<번호>`가 적힌 경우.

그 밖의 `ADR-<번호>` 언급은 참조입니다. light 모드에서는 경고, full 모드에서는 오류로 보고합니다. ADR 참조는 같은 줄에 있는 요구사항에만 연결됩니다. 결정 기록을 다른 줄에 적으면 full 모드에서 연결이 없습니다.

ADR 문서는 frontmatter로 대체(superseded) 관계를 적습니다.

```yaml
---
adr: ADR-002
status: superseded
superseded_by: ADR-003
supersedes: [ADR-001]
---
```

- `status: superseded`는 `superseded_by`를 요구합니다. 없으면 `adr_supersede_missing_link`입니다.
- `superseded_by`만 있고 `status: superseded`가 없으면 `adr_supersede_inconsistent`입니다.
- 가리키는 대상 ADR이 없으면 `adr_supersede_missing_link`입니다.
- 양쪽이 서로를 가리켜야 합니다. 되돌리는 링크가 없으면 `adr_supersede_missing_link`입니다.
- 가리키는 대상에 `adr:` frontmatter가 없으면 그 대상은 되돌리는 링크를 가질 수 없으므로 `adr_supersede_missing_link`입니다.
- 자기 자신을 가리키면 `adr_supersede_self`입니다.
- 대체 사슬이 순환하면 `adr_supersede_cycle`입니다.
- 두 문서가 같은 `adr:`를 선언하면 `duplicate_adr` 오류입니다. 한 결정에 한 문서를 둡니다.

## 6. 모드

- `light`: 요구사항 ID가 없어도 통과합니다. ID가 있으면 중복 선언, 모르는 참조, 선언 없는 매핑 행을 오류로 보고합니다.
- `full`: light 검사에 더해, 선언된 모든 ID에 매핑 행과 ADR 참조가 있어야 합니다.

매핑 행만 있고 선언이 없는 ID는 두 모드에서 모두 오류입니다. 매핑 행은 모르는 ID를 가리키는 참조이기 때문입니다. 템플릿·표시·대체 관계 검사도 두 모드에서 같습니다.

## 7. 사용법

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

## 8. JSON 리포트

`schema_version`, `mode`, `docs`, `requirements[]`, `errors[]`, `warnings[]`, `summary`를 냅니다.

`requirements[]` 항목은 `id`, `files[]`, `declared`, `mapped`, `adr_refs[]`로 이루어집니다. `summary`는 파일 수, 요구사항 수, 매핑 수, ADR 연결 수를 담습니다. 템플릿 선언 수와 표시 검출 수, 대체 관계 수도 담습니다. 마지막으로 오류 수, 경고 수, 상태를 담습니다.

## 9. 검사하지 않는 것

- 요구사항 내용이 타당한지, 시나리오가 충분한지 판단하지 않습니다.
- 그 테스트가 실제로 요구사항을 증명하는지 확인하지 않습니다.
- 매핑 행 둘째 칸에 적힌 파일이 실제로 있는지 보지 않습니다.
- 표 머리글을 읽지 않습니다. 둘째 칸을 테스트 칸으로 가정합니다.
- 표시 목록에 없는 표현은 검사하지 않습니다.
- frontmatter의 관계 키(`related:` 등)에 적힌 ID는 참조로 세지 않습니다.
- 대체 관계는 frontmatter에 `adr:`가 있는 문서에서만 읽습니다.
- 레지스트리 ID가 실제로 그 템플릿 문서를 가리키는지는 보지 않습니다.

내용 판단은 [document-review 스킬](../.agents/skills/document-review/SKILL.md)과 리뷰어 몫입니다. 기계 검사는 통과 근거가 아니라 확인의 출발점입니다.

## 10. 구현된 범위와 남은 한계

[#59의 남은 범위 체크리스트](https://github.com/usagi-ai-kr/usagi/issues/59#issuecomment-6287086018)의 세 항목은 이 문서에 구현했다. §3은 템플릿 연결, §4는 추측 표시, §5는 대체 관계다. 각 항목에 정상·실패 fixture 테스트가 있다.

남은 한계는 다음과 같다.

- 참고 문서와 템플릿을 검사 대상에서 완전히 분리하는 것은 아직 아니다. 코드펜스 안의 예시만 제외된다.
- 레지스트리 ID와 템플릿 문서의 대응은 사람이 확인해야 한다.
- 대체 관계는 `adr:` frontmatter가 있는 문서에서만 읽는다. 파일명만으로 정한 ADR에는 대체 관계를 쓸 수 없다.
- 표시 목록은 고정이라 새 표현을 넣으려면 목록과 검사를 함께 고쳐야 한다.

## 11. 관련

- [#59](https://github.com/usagi-ai-kr/usagi/issues/59) — PRD/SRS/ADR 요구사항 추적성 검사기
- [#46](https://github.com/usagi-ai-kr/usagi/issues/46) — 프로젝트 규모별 문서 검토 경로 제안
- [#22](https://github.com/usagi-ai-kr/usagi/issues/22) — 구조·테스트 계약
- [#23](https://github.com/usagi-ai-kr/usagi/issues/23) — E2E 브라우저·시각 검증 실행 계약
