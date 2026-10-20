# Glossary — Documentation & Operations (문서·운영)

[← Index](../glossary.md)

용어집, 레이블, ADR, runbook, 위키처럼 문서와 운영을 지탱하는 용어.

<a id="adr"></a>
## ADR

**아키텍처 결정 기록**

중요한 설계 결정의 배경·대안·결과를 남기는 짧은 기록. Issue #1에 언급된 moi ADR-0042가 예시입니다.

참고: [Issue #1](https://github.com/usagi-ai-kr/usagi/issues/1) 제안

<a id="glossary"></a>
## glossary

**용어집**

용어집. 정의는 카테고리 문서에, 전체 목록은 `docs/glossary.md` 인덱스에 있습니다.

참고: [`docs/glossary.md`](https://github.com/usagi-ai-kr/usagi/blob/main/docs/glossary.md)

<a id="label"></a>
## label

**레이블**

이슈/PR에 붙이는 분류 태그. 이 저장소는 `type:*` 1개와 `status:*` 1개를 정확히 하나씩 붙입니다.

참고: [`AGENTS.md`](https://github.com/usagi-ai-kr/usagi/blob/main/AGENTS.md)

<a id="mece"></a>
## MECE

**상호 배타·전체 포괄**

Mutually Exclusive, Collectively Exhaustive. 분류가 서로 겹치지 않고 전체를 빠짐없이 덮는 원칙. 이 저장소의 레이블 체계에 적용했습니다.

참고: [`AGENTS.md`](https://github.com/usagi-ai-kr/usagi/blob/main/AGENTS.md)

<a id="p0-p1-p2"></a>
## P0/P1/P2

**우선순위 등급**

우선순위 등급. P0는 프로토콜 신뢰성의 필수 선행 조건, P1은 도입 전 권장, P2는 후속 도구입니다.

참고: [PR #2](https://github.com/usagi-ai-kr/usagi/pull/2) 체크리스트

<a id="runbook"></a>
## runbook

**운영 절차서**

배포·장애 대응 절차를 순서대로 적은 문서. 백업→마이그레이션→배포→스모크→롤백 순으로 구성합니다.

참고: [Issue #1](https://github.com/usagi-ai-kr/usagi/issues/1) §6

<a id="token"></a>
## token

**토큰**

모델이 처리하는 텍스트 단위. 컨텍스트 크기와 비용을 재는 지표이며, 인증 토큰과 다릅니다.

참고: [Issue #1](https://github.com/usagi-ai-kr/usagi/issues/1) §3

<a id="wiki"></a>
## wiki

**위키**

GitHub 저장소와 별도 git 저장소로 관리되는 문서 공간. 이 저장소는 용어집을 게시합니다.

참고: [`docs/wiki/Home.md`](https://github.com/usagi-ai-kr/usagi/blob/main/docs/wiki/Home.md)
