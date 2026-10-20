# Glossary — Testing & Quality (테스트·품질)

[← Index](../glossary.md)

Red→Green, 회귀, 플레이크, BDD, Lighthouse처럼 품질을 확인하는 용어.

<a id="bdd"></a>
## BDD

**행동 주도 개발**

사용자 행동 시나리오를 자연어에 가깝게 기술하고 자동화하는 테스트 방식.

참고: [PR #2](https://github.com/usagi-ai-kr/usagi/pull/2) §5

<a id="bisect"></a>
## bisect

**이분 탐색**

문제를 일으킨 커밋을 이진 탐색으로 좁히는 git 기법. Lighthouse 회귀 원인 추적에 사용했습니다.

참고: [Issue #1](https://github.com/usagi-ai-kr/usagi/issues/1) §6

<a id="flake-flaky-test"></a>
## flake / flaky test

**플레이크**

같은 코드에서도 간헐적으로 실패하는 테스트. `waitFor`로 숨기지 말고 원인을 고칩니다.

참고: [Issue #1](https://github.com/usagi-ai-kr/usagi/issues/1) 주의 5

<a id="lighthouse"></a>
## Lighthouse

**웹 품질 측정**

웹 성능·접근성·SEO 점수를 측정하는 도구. 회귀 비교에 사용합니다.

참고: [Issue #1](https://github.com/usagi-ai-kr/usagi/issues/1) §6

<a id="lint"></a>
## lint

**정적 검사**

코드 스타일과 잠재 오류를 자동 검사하는 단계.

참고: [PR #2](https://github.com/usagi-ai-kr/usagi/pull/2) §5

<a id="red-green"></a>
## Red→Green

**레드→그린**

수정 전에는 실패(Red), 수정 후에는 통과(Green)하는 테스트 증거. 새 테스트가 수정 전에도 통과하면 의미가 없습니다.

참고: [Issue #1](https://github.com/usagi-ai-kr/usagi/issues/1) 주의 4

<a id="regression"></a>
## regression

**회귀**

기존에 동작하던 기능이 변경으로 다시 깨지는 것.

참고: [PR #2](https://github.com/usagi-ai-kr/usagi/pull/2) 체크리스트

<a id="smoke-test"></a>
## smoke test

**스모크 테스트**

배포 직후 핵심 경로가 살아 있는지 빠르게 확인하는 최소 테스트.

참고: [Issue #1](https://github.com/usagi-ai-kr/usagi/issues/1) §6

<a id="typecheck"></a>
## typecheck

**타입 검사**

타입 오류를 실행 전에 검사하는 단계.

참고: [PR #2](https://github.com/usagi-ai-kr/usagi/pull/2) §5

<a id="viewport"></a>
## viewport

**뷰포트**

브라우저 화면 크기. 반응형 회귀를 확인하려 여러 viewport에서 스크린샷을 찍습니다.

참고: [Issue #1](https://github.com/usagi-ai-kr/usagi/issues/1) §6
