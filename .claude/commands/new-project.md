---
description: 새 프로젝트 문서 세트를 추가합니다 (project-a 템플릿 복제 + 탭/사이드바/홈 등록)
argument-hint: <slug> <표시 이름>   예) billing 결제 시스템
---

새 프로젝트를 추가합니다. 인자: `$ARGUMENTS`

1. 첫 단어를 slug, 나머지를 표시 이름으로 해석합니다.
   - slug는 영문 소문자, 숫자, 하이픈만 허용합니다.
   - 인자가 비었거나 형식이 틀리면 작업하지 말고 올바른 사용법을 안내합니다.
   - `docs/<slug>`가 이미 있거나 `.vitepress/projects.mjs`에 같은 slug가 있으면 중단하고 알립니다.
2. `docs/project-a`를 `docs/<slug>`로 복사합니다.
   - 복사본 안의 `/project-a/` 링크를 모두 `/<slug>/`로 바꿉니다.
   - `docs/<slug>/index.md`의 첫 줄 제목을 `# <표시 이름> 인수인계 요약`으로 바꿉니다.
   - 복사본은 project-a의 **채워진 내용까지** 가져오므로 다음과 같이 정리합니다.
     - project-a가 아직 템플릿 상태면 그대로 둡니다.
     - 내용이 채워져 있으면 사용자에게 "빈 템플릿으로 시작할지, 내용을 복사할지" 묻고 그에 따릅니다.
3. `.vitepress/projects.mjs` 배열 끝에 `{ slug: '<slug>', name: '<표시 이름>' }`를 추가합니다.
4. `docs/index.md`에 카드를 추가합니다.
   - hero `actions`에 `theme: alt` 항목을 추가합니다.
   - `features`에 `details: 프로젝트 한 줄 설명을 입력하세요.` 항목을 추가합니다.
5. `npm run docs:build`로 검증합니다. dead link 오류가 나면 고칩니다.
6. 추가한 파일과 수정한 파일을 요약해 보고합니다. 커밋은 하지 않습니다.
