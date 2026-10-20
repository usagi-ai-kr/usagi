# 운영 플로우

이 페이지는 이 저장소의 체계를 사용하는 대표 흐름을 정리합니다. 세부 규칙과 명령은 저장소의 `AGENTS.md`에 있습니다.

## 1. 제안에서 문서까지

1. 아이디어를 이슈로 기록합니다.
2. 제안 문서를 Draft PR로 올립니다.
3. 리뷰에서 범위·용어·검증 기준을 맞춥니다.
4. CI `validate`가 통과하면 squash merge합니다.

## 2. 작업 단위 실행

1. 오케스트레이터가 작업을 검증 가능한 단위로 쪼갭니다.
2. 목표·완료 기준·금지·소유 파일·검증 명령·보고 경로를 담은 브리프를 워커에게 보냅니다.
3. 워커는 소유한 파일만 수정하고, 완료·차단·실패를 콜백으로 알립니다.
4. 오케스트레이터는 보고서·증거·게이트를 확인한 뒤 수락합니다.
5. 실패·차단·타임아웃은 재시도하거나 에스컬레이션합니다.

## 3. 변경에서 병합까지

1. `main`에서 브랜치를 만듭니다.
2. 작은 단위로 커밋합니다.
3. PR을 열고 `validate` CI를 통과시킵니다.
4. 리뷰 대화를 resolve합니다.
5. 최신 `main`과 동기화한 뒤 squash merge합니다.

## 4. 용어집 사용

1. [Glossary Index](Glossary)에서 용어를 찾습니다.
2. 카테고리 페이지에서 정의와 출처를 확인합니다.
3. 없는 용어는 `docs/glossary/<category>.md`에 추가합니다.
4. 인덱스를 다시 만들고 검증한 뒤 위키에 게시합니다.

```bash
node scripts/build-glossary-index.mjs
node scripts/validate.mjs
./scripts/sync-wiki.sh
```

## 5. 릴리스

1. `VERSION`을 올리고 `CHANGELOG.md`의 `[Unreleased]`를 새 버전 섹션으로 옮깁니다.
2. PR을 열고 `validate` CI를 통과시킨 뒤 squash merge합니다.
3. `main`에서 `vX.Y.Z` 태그를 만들고 push합니다.
4. `Release` workflow가 Changelog에서 릴리스 노트를 추출해 GitHub Release를 만듭니다.

개념 설명은 [개념](Concepts) 페이지를 참고합니다.
