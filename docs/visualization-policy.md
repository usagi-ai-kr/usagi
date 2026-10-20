# 시각화 정책 (Markdown/Mermaid 우선)

Source: [Issue #47](https://github.com/usagi-ai-kr/usagi/issues/47).

## 1. 기본 원칙

- 텍스트와 표가 기본이다. 다이어그램은 이해를 명확히 줄일 때만 추가한다.
- Markdown이 원본이고 생성 이미지는 부산물이다. 원본을 지우지 않는다.

## 2. 선택 기준

| 상황 | 도구 |
| --- | --- |
| 단순 흐름·시퀀스·상태·구조 | GitHub Markdown + Mermaid fenced block |
| 정적 내보내기(SVG/PDF/이미지) | 렌더러는 선택. Mermaid 원본은 보존 |
| 대형 의존성 그래프 | Graphviz/D2 |
| UML | PlantUML |
| 데이터 차트 | Vega-Lite |
| 자유 설계·편집 가능 아키텍처/흐름 | diagrams.net/draw.io 원본 보존 |
| 여러 문법의 HTTP 렌더링 | Kroki — 명시적 동의·셀프호스트일 때만 |
| 실제 DB·ER 구조 | IDE/DB 도구로 조회. 마이그레이션/DDL이 원본 |

비공개 설계·데이터를 외부에 업로드해야 하는 도구는 기본으로 쓰지 않는다.

## 3. 불변 조건

- 기본 경로(GitHub Markdown/Mermaid)는 외부 도구 없이 동작한다.
- 전역 설치 금지. npm 기반 선택 의존성은 버전을 고정한다.
- 승인 없이 외부 서비스로 올리지 않는다.
- 원본·아티팩트에 도구와 버전을 기록한다.

## 4. 렌더링·접근성

GitHub 실제 렌더링을 확인한다. 긴 라벨, 한글 폰트, 다크 모드, 좁은 화면, 확대를 점검한다. 다이어그램 옆에 텍스트 설명을 함께 둔다.

## 5. 보안

생성된 SVG에 외부 URL·스크립트가 섞일 수 있다. Mermaid/HTML 입력은 untrusted로 다룬다. 비공개 데이터·토큰을 공개 렌더 API에 보내지 않는다. MCP 읽기/쓰기 권한은 분리해서 승인한다.

## 6. 실패 사례

- 미지원 다이어그램 형식
- 문법 오류
- 한글 폰트 누락
- 다크 모드 대비 부족
- 외부 링크·악성 입력
- 렌더러 버전 불일치

## 7. 정적 gate

Mermaid 원본과 산출물의 기계적 일관성은 `check-diagrams.mjs`로 검사한다.

```bash
node scripts/check-diagrams.mjs --docs docs
node scripts/check-diagrams.mjs --docs docs --artifact-root artifacts --require-svg --json
```

- info 첫 토큰이 `mermaid`인 fenced block을 순서대로 검사한다. 열 0~3칸·목록 안·인용(`> `) 안 fence를 인식하고, 4칸 이상 들여쓰기는 코드로 보고 건너뛴다. 빈 블록은 `empty_diagram`, 모르는 형식은 `unknown_diagram_type` 오류다.
- 지원하는 형식만 통과한다. 기본은 `flowchart`, `graph`, `sequenceDiagram`, `classDiagram`, `stateDiagram-v2`, `erDiagram`, `gantt`, `pie`, `mindmap`, `timeline`, `journey`, `quadrantChart`, `xychart-beta`, `gitGraph`다. 확장·베타는 `C4Context`, `C4Container`, `C4Component`, `C4Dynamic`, `C4Deployment`, `requirementDiagram`, `block-beta`, `architecture-beta`, `packet-beta`, `sankey-beta`, `radar-beta`, `treemap-beta`, `kanban`, `zenuml`이다. 목록 밖 형식은 오류다.
- 괄호 균형만 본다. 큰따옴표·백틱 안은 세지 않고, `%%` 주석은 줄 시작과 인라인을 모두 제외한다. 작은따옴표는 일반 문자다. subgraph/end pairing과 전체 문법은 보지 않는다.
- 원본 해시는 블록 본문을 `\n`으로 잇고 마지막에 개행 하나를 붙인 바이트의 SHA-256이다.
- 산출물 목록은 `<artifact-root>/diagram-artifacts.json`에 둔다. 형태는 `{schema_version: 1, artifacts: [{source, block, source_sha256, artifact, artifact_sha256, renderer}]}`다. `source`는 docs 루트 기준 상대 경로, `block`은 파일 안 Mermaid 순서다. 같은 키가 두 번 나오면 `duplicate_manifest_entry` 오류고 첫 항목만 검사한다.
- 산출물 경로는 루트 기준 상대 경로만 받는다. 절대 경로는 `absolute_artifact_path` 오류다. 루트 밖 이탈·symlink 탈출은 hard error다.
- 산출물이 없으면 `unavailable` 경고다. `--require-svg`를 주면 항목 누락·비SVG가 오류다. 요약의 `manifest_status`는 `verified`·`unavailable`·`errors` 중 하나로 JSON 소비자가 검증 여부를 구분한다.
- SVG 안의 외부 URL·스크립트는 경고만 하고 지우지 않는다. `xmlns` 선언과 w3.org 주소는 경고하지 않는다. 경고는 엄격 모드가 생기기 전까지 gate를 실패시키지 않는다.
- core CI는 정적 검사만 하고 렌더러·네트워크를 호출하지 않는다. GitHub 렌더링은 수동 확인이다.

## 8. 범위/후속

렌더러 어댑터와 CI 시각 게이트는 후속이다. 도구 비교 연구 전문은 이슈 #47에 있다.

## 9. 관련

관련: #61, #47, #46, #17, #23, #42, #26.
