# Glossary — Git & CI (Git·CI)

[← Index](../glossary.md)

브랜치, SHA, 병합, CI, 브랜치 보호처럼 변경을 전달하는 경로의 용어.

<a id="branch-protection"></a>
## branch protection

**브랜치 보호**

`main` 직접 push·force push·삭제를 막고 PR·CI·리뷰 조건을 강제하는 GitHub 설정.

참고: [`AGENTS.md`](https://github.com/usagi-ai-kr/usagi/blob/main/AGENTS.md)

<a id="check"></a>
## check

**CI 검사**

CI가 보고하는 개별 검사 결과. `validate`처럼 job 이름이 check 이름이 되며, 브랜치 보호의 required status check로 지정할 수 있습니다.

참고: [`.github/workflows/ci.yml`](https://github.com/usagi-ai-kr/usagi/blob/main/.github/workflows/ci.yml)

<a id="ci"></a>
## CI

**지속적 통합**

push/PR마다 빌드·테스트·검사를 자동 실행하는 파이프라인. 이 저장소는 `validate` job 하나로 문서·용어집·레이블을 검사합니다.

참고: [`.github/workflows/ci.yml`](https://github.com/usagi-ai-kr/usagi/blob/main/.github/workflows/ci.yml)

<a id="ci-loop"></a>
## CI loop

**문서 CI 루프**

문서를 고치고 커밋한 뒤 CI 결과를 확인하는 반복 흐름. 중간 상태를 커밋해 CI가 구버전을 검사하지 않도록, 게이트를 묶어 확인하고 커밋합니다.

참고: [Issue #3](https://github.com/usagi-ai-kr/usagi/issues/3) 제안

<a id="commit-bundle"></a>
## commit bundle

**묶음 커밋**

서로 검증 가능한 변경을 한 단위로 묶어 커밋하는 방식. 단위 묶음당 한 번 커밋하고 단일 추적 이슈를 두는 yoroi 관측이 예시입니다.

참고: [Issue #3](https://github.com/usagi-ai-kr/usagi/issues/3) 제안

<a id="draft-pr"></a>
## draft PR

**초안 PR**

병합 준비가 끝나지 않은 PR. GitHub에서 draft로 표시해 리뷰·병합을 보류합니다.

참고: [PR #2](https://github.com/usagi-ai-kr/usagi/pull/2)

<a id="head-sha"></a>
## head SHA

**현재 head 커밋**

PR 브랜치의 현재 최신 커밋 해시. 리뷰·CI가 검증한 코드와 병합 대상이 같은지 확인하는 기준입니다.

참고: [PR #2](https://github.com/usagi-ai-kr/usagi/pull/2) §5

<a id="match-head-commit"></a>
## match-head-commit

**head 커밋 일치 확인**

`gh pr merge`에서 병합 직전에 PR head SHA가 지정값과 같은지 확인하는 옵션. 승인 후 커밋 변경을 막습니다.

참고: [PR #2](https://github.com/usagi-ai-kr/usagi/pull/2) §5

<a id="merge-commit"></a>
## merge commit

**병합 커밋**

두 브랜치의 이력을 합치는 커밋. 이 저장소는 선형 기록을 위해 squash merge를 기본으로 합니다.

참고: [`AGENTS.md`](https://github.com/usagi-ai-kr/usagi/blob/main/AGENTS.md)

<a id="pr"></a>
## PR

**풀 리퀘스트**

변경 사항을 `main`에 합치기 전에 리뷰와 CI를 거치는 제안.

참고: [`AGENTS.md`](https://github.com/usagi-ai-kr/usagi/blob/main/AGENTS.md)

<a id="rebase"></a>
## rebase

**리베이스**

커밋을 새 base 위로 다시 쌓는 git 작업. 스택 PR에서 하위 PR 병합 후 상위 PR을 옮길 때 사용합니다.

참고: [Issue #1](https://github.com/usagi-ai-kr/usagi/issues/1) 주의 6

<a id="sha"></a>
## SHA

**커밋 해시**

Git 커밋을 가리키는 해시. CI·리뷰·병합이 같은 코드를 보게 하는 식별자입니다.

참고: [PR #2](https://github.com/usagi-ai-kr/usagi/pull/2) §5

<a id="squash-merge"></a>
## squash merge

**스쿼시 병합**

PR의 여러 커밋을 하나로 합쳐 `main`에 병합하는 방식. 이 저장소의 기본 병합 방식입니다.

참고: [`AGENTS.md`](https://github.com/usagi-ai-kr/usagi/blob/main/AGENTS.md)

<a id="stacked-pr"></a>
## stacked PR

**스택 PR**

하위 PR 위에 상위 PR을 쌓는 방식. 하위가 squash되면 상위를 `git rebase --onto`로 옮깁니다.

참고: [Issue #1](https://github.com/usagi-ai-kr/usagi/issues/1) 주의 6

<a id="worktree"></a>
## worktree

**워크트리**

같은 저장소를 여러 디렉터리에서 동시에 체크아웃하는 git 기능. 병렬 워커의 작업 공간입니다.

참고: [Issue #1](https://github.com/usagi-ai-kr/usagi/issues/1) 주의 7
