---
doc_type: reference
audience: usagi를 유지하는 에이전트
---
# 디자인 레퍼런스 카탈로그

Source: [Issue #17](https://github.com/usagi-ai-kr/usagi/issues/17).
관련: [#23](https://github.com/usagi-ai-kr/usagi/issues/23), [#26](https://github.com/usagi-ai-kr/usagi/issues/26), [#14](https://github.com/usagi-ai-kr/usagi/issues/14), [#35](https://github.com/usagi-ai-kr/usagi/issues/35).
`checked_at: 2026-10-20`

이 카탈로그는 디자인 판단에 필요한 참고 자료를 모은 것이다. 색·서체·간격·컴포넌트 토큰의 원본은 [DESIGN.md](../DESIGN.md)다. 여기 있는 링크는 영감과 근거이지 설치나 복제의 승인이 아니다.

## 1. 레퍼런스의 지위

- 레퍼런스는 탐색의 근거다. 라이브러리 설치, 자산 복제, 의존성 추가를 자동 승인하지 않는다.
- 색·서체·컴포넌트 라이선스를 확인하지 않은 채 복제하지 않는다.
- 확인하지 못한 버전과 라이선스는 `확인 필요`로 적는다. 추정하지 않는다.
- 토큰을 먼저 재사용한다. 새 토큰은 근거와 함께 결정 기록에 남긴다.

## 2. 판단 영역별 참고 자료

| 판단 영역 | 참고 자료 | 적용할 판단 | 확인 시점·주의 |
| --- | --- | --- | --- |
| 팔레트 탐색 | [2colors](https://2colors.colorion.co/), [Color Hunt](https://colorhunt.co/), [Coolors](https://coolors.co/), [Mobile Palette](https://mobilepalette.colorion.co/) | 색상 조합 후보, 대비, 상태색 의미, 모바일 가독성 | 조합과 대비만 참고한다. 토큰과 상태색 규칙은 `DESIGN.md`가 우선이다. |
| 설계 기준과 플랫폼 | [KRDS](https://www.krds.go.kr/html/site/index.html), [Material Design 3](https://m3.material.io/), [Flutter widgets](https://docs.flutter.dev/ui/widgets) | 접근성, 일관성, 입력·상태·내비게이션 패턴, 플랫폼 제약 | 가이드 개정 주기가 다르다. 적용 시점과 버전은 확인 필요다. |
| 웹 UI 구현 선택지 | [shadcn/ui](https://ui.shadcn.com/), [daisyUI](https://daisyui.com/), [Component Gallery](https://component.gallery/), [Bootstrap 6 문서](https://getbootstrap.com/docs/6.0/getting-started/install/) | 기존 스택에 맞는 컴포넌트, 구현 복잡도, 라이선스, 의존성·버전 안정성 | 이슈 #17은 확인 시점에 Bootstrap 6 문서가 Alpha 표기였다고 기록한다. 현재 상태와 라이선스는 확인 필요다. |
| 한글·다국어 서체 | [눈누](https://noonnu.cc/), [Google Fonts](https://fonts.google.com/) | 한글 글리프 지원, 폴백, 가독성, 폰트 로딩 성능, 임베딩 라이선스 | 임베딩 허용 범위와 라이선스는 확인 필요다. `Pretendard` 토큰을 먼저 검토한다. |
| 공유·아이콘 자산 | [RealFaviconGenerator](https://realfavicongenerator.net/), [OpenGraph.xyz](https://www.opengraph.xyz/) | 아이콘 사이즈, manifest, OG 이미지·메타데이터, 카카오톡·X 공유 시 표시 | 미리보기는 플랫폼 캐시와 외부 환경의 영향을 받는다. 자동 검증으로 확정할 수 없다. |
| 품질 측정 | [Chrome Lighthouse](https://developer.chrome.com/docs/lighthouse/overview?hl=ko) | 성능, 접근성, 권장사항, 검색 최적화의 측정과 회귀 확인 | 측정 환경과 도구 버전을 함께 적는다. 이 저장소에는 자동 실행 경로가 없다. |

## 3. 결정 흐름

1. 맥락을 적는다. 대상 화면, 사용자, 플랫폼, 화면 크기, 제약을 기록한다.
2. 판단 영역을 고른다. 위 표에서 필요한 영역만 고른다.
3. 대안을 남긴다. 고른 이유와 버린 대안, 장단점을 적는다.
4. 토큰을 재사용한다. `DESIGN.md`의 색·서체·간격·라운드를 먼저 쓴다.
5. 새 토큰은 근거와 함께 추가한다. 결정 기록에 근거와 영향, 검증을 남긴다.
6. 화면을 검증한다. 반응형, 키보드·포커스, 명암비, 폰트 로딩, 공유 미리보기를 본다.
7. 측정한다. 가능하면 Lighthouse 기준선을 남긴다. 못 하면 미검증으로 표시한다.

## 4. 확인 시점과 기록 규칙

- 기준 시점은 `checked_at: 2026-10-20`이다. 쓰기 전에 버전과 라이선스를 다시 본다.
- 확인하지 못한 항목은 `확인 필요`로 적는다.
- 인터넷을 쓸 수 없으면 이 문서의 요약만 근거로 삼는다. 못 본 항목은 `unavailable`로 적는다.
- 결정 기록은 [design-decision-template.md](design-decision-template.md) 형식을 따른다.

## 5. 한계

- 외부 링크는 바뀐다. 사라진 링크와 바뀐 화면은 확인 필요로 처리한다.
- 공유 미리보기는 플랫폼 캐시와 외부 환경의 영향을 받는다. 확정 근거로 쓰지 않는다.
- 이 저장소에는 화면 샘플 앱이 없다.
- Phase 1에는 Lighthouse 자동 실행과 브라우저 점검 CI가 없다.

## 6. 관련

- [#17](https://github.com/usagi-ai-kr/usagi/issues/17) — 디자인 레퍼런스 기반 스킬·검증 워크플 도입 제안
- [#23](https://github.com/usagi-ai-kr/usagi/issues/23) — 저자원 E2E 브라우저·시각 검증 실행 계약
- [#26](https://github.com/usagi-ai-kr/usagi/issues/26) — 최소 외부 의존성 실행 계약
- [#14](https://github.com/usagi-ai-kr/usagi/issues/14) — 사람 중심 문서 서술·검증 계약
- [#35](https://github.com/usagi-ai-kr/usagi/issues/35) — 워커 재사용과 세션 복구 규칙
- [DESIGN.md](../DESIGN.md) — 시각 토큰의 단일 원본
