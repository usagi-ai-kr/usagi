# Architecture contract (Phase 1)

Source: [Issue #22](https://github.com/usagi-ai-kr/usagi/issues/22).
관련: #26, #23, #14, #35.

## 1. 목적과 범위

이 문서는 저장소 구조를 판단하는 공통 계약이다. 네 가지 **논리적 책임**(UI/App/Domain/Infra)을 구분하고, 경로→책임 매핑과 허용 의존을 선언 파일로 고정한다. 물리적 디렉터리 4개를 강제하지 않는다.

Phase 1 범위는 **계약 문서 + 매핑 예시 + JS/TS 정적 검사기 + 리뷰 스킬**뿐이다. TDD/BDD 실행기, 다언어 어댑터, 이 저장소 자체에 대한 CI 아키텍처 게이트, 측정 대시보드는 후속 단계이며 이 문서가 보증하지 않는다. 검사기는 스택 독립 계약의 JS/TS 참조 어댑터다.

## 2. 레이어 책임

| 레이어 | 책임 | 금지 |
| --- | --- | --- |
| UI | 입출력·프레젠테이션·뷰 상태 | 업무 규칙·영속성 직접 호출 |
| App | 유스케이스·조정·트랜잭션·포트 정의 | 프레임워크 종속 UI·SQL 직접 실행 |
| Domain | 업무 규칙·불변식·값 객체 | 프레임워크·IO 참조 |
| Infra | 영속성·외부 시스템·어댑터(포트 구현) | 업무 규칙 소유 |

UI와 Infra는 외곽 어댑터다. App과 Domain은 포트를 정의하고, 조합 루트(composition root)가 Infra 구현을 연결한다.

## 3. 의존 방향

허용: `ui → app → domain`, `infra → domain`(포트 구현), `infra → app`(App 포트·계약 모듈에 한함), `ui → domain`(읽기 전용 값 객체 참조에 한함). 금지: `domain → infra/app/ui`, `app → ui`, `ui → infra` 직접 호출, Infra의 App 유스케이스 수입. 순환 의존과 경계 우회는 예외 승인 대상이며, 근거·소유자·만료를 기록하지 않은 우회는 허용하지 않는다.

## 4. 매핑 설정

매핑 파일은 `layers`(레이어별 경로 glob), `allowed`(레이어별 허용 대상), `exceptions`(승인된 우회), `ignore`(검사 제외)를 선언한다. 전체 예시는 [architecture-map.example.json](architecture-map.example.json)을 본다.

```json
{
  "root": ".",
  "layers": { "domain": ["src/domain/**"], "app": ["src/app/**"] },
  "allowed": { "domain": [], "app": ["domain"] },
  "exceptions": [],
  "ignore": ["**/*.test.*"]
}
```

`layers`에 없는 파일은 검사하지 않는다. `allowed`에 없는 레이어는 기본 거부다. `allowed`·`exceptions`가 모르는 레이어 이름을 참조하면 설정 오류다. `infra → app` 허용은 포트·계약 모듈용이므로, App 유스케이스를 수입하는 Infra 파일은 포트 모듈로 분리하거나 예외로 기록한다.

## 5. 예외와 마이그레이션

예외는 `from`/`to`/`file`/`reason`을 필수로 적고, `owner`와 `expires`를 권장한다. 조용한 우회 없이, 한 번에 하나의 슬라이스씩 마이그레이션한다. 물리 폴더 4개가 없어도 논리 매핑이 성립하면 허용한다. 이유·소유자 없는 예외를 새로 추가하지 않는다.

## 6. 테스트 수준

- Unit: Domain 규칙·App 로직의 결정적 테스트. 시간·네트워크·DB는 제어한다.
- Slice: 단일 유스케이스의 입구부터 필요한 경계를 관통한다. 어디까지 실제로 실행했는지 표시하고, 통합 테스트와 정의를 혼동하지 않는다.
- Integration: DB·브로커·외부 어댑터와 실제 설정·마이그레이션의 계약 호환성을 확인한다.
- Regression: 재현된 결함마다 실패→수정→재실행 증거를 남기고 전체 게이트도 통과한다.

증거 바인딩(커밋 SHA, 환경 fingerprint)과 게이트 적용 여부 기록은 [delegation-handoff-evidence.md](delegation-handoff-evidence.md)와 [multi-agent-orchestration-contract.md](multi-agent-orchestration-contract.md)를 따른다. BDD 형식을 모든 테스트에 강제하지 않는다. 어떤 수준을 적용했는지(또는 생략했는지와 이유)를 보고서에 기록한다. Phase 1에는 실행기가 없으므로, 수준 정의와 기록 규칙만 계약한다.

## 7. 검사기 계약

```bash
node scripts/check-layer-deps.mjs --config <file> [--root <dir>] [--json] [--help]
```

`--config` 필수(상대 경로는 cwd 기준), `root`는 설정 파일 기준·`--root`가 우선한다. 종료 코드: `0` 위반 없음, `1` 위반 있음, `2` 사용 오류·설정 오류·스캔 오류. JSON(`schema_version: 1`) 필드: `root`, `config`, `files_scanned`, `imports_checked`, `violations`(각 `{file, line, specifier, from_layer, to_layer, kind}`), `exceptions_applied`, `summary`(`status: ok|violations|error` + 개수). 사람 출력은 위반 한 줄씩 + 요약 줄이다.

위반 예시:

```text
src/domain/order.ts:3: ../../infra/db (domain -> infra) [violation]
check-layer-deps: violations (1 violation, 0 exceptions applied)
```

알려진 한계: 상대 지정자(`.` 시작)만 검사하고 패키지·별칭은 무시한다. 대상이 어떤 레이어에도 속하지 않으면 건너뛴다(트리 전체를 매핑하거나 `ignore`에 둔다). 주석·문자열 속 import 형태 텍스트는 오탐할 수 있다.

## 8. 후속 단계

TDD/BDD 실행기, 언어별 어댑터(Python·Go 등, 동일 검사 계약), 이 저장소 자체의 CI 아키텍처 게이트, 위반 검출률·누락률 측정. 공통 실행 증거 봉투는 #26이 소유하고 이 계약은 확장만 한다.

## 9. 관련

- #22 (본 계약), #26 (실행 증거 봉투·doctor), #23 (E2E 실행기의 브라우저 런타임), #14 (문서 진단), #35 (워커 재사용·세션 복구).
