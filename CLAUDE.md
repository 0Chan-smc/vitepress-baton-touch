# 인수인계 문서 사이트 (VitePress)

프로젝트별 인수인계 문서를 VitePress로 작성하고 S3 + CloudFront(Basic Auth)로 배포하는 repo.
문서 본문은 한국어로 쓴다.

## 구조

- `.vitepress/projects.mjs`: 프로젝트 목록의 **단일 출처**. 탭, 사이드바, 챗봇이 모두 이 파일을 읽는다.
- `.vitepress/config.mts`: 사이트 설정. 사이드바 구성은 `projectSidebar()`에 있다.
- `.vitepress/theme/`: 커스텀 테마. `ChatWidget.vue`(문서 Q&A), `CopyPageButtons.vue`(페이지 복사).
- `docs/index.md`: 프로젝트 선택 홈(카드).
- `docs/<slug>/`: 프로젝트 문서. 모든 프로젝트가 같은 구성이다.
  - `index.md`(인수인계 요약), `overview/`, `setup/`, `operations/`, `tasks/`, `contacts.md`, `faq.md`
- `docs/guide/`: 문서 사이트 자체의 사용, 배포 방법(공통).
- `infra/`: Terraform. 사이트 리소스는 `main.tf`, 챗봇 리소스는 `chat.tf`, CloudFront Function은 `cloudfront-function.js.tftpl`.
- `infra/lambda/src/`: 챗봇 Lambda.
  - 제공사 공통 로직은 `chat.ts`, LLM 제공사 어댑터는 `providers/openai.ts`(기본, GPT Luna)와 `providers/anthropic.ts`, 런타임 진입점은 `index.ts`.
  - 제공사는 Terraform 변수 `chat_provider`로 고른다.

## 문서 작성 규칙

- **비밀 값 금지**: 비밀번호, 토큰, API 키, 개인 휴대전화 번호는 문서에 쓰지 않는다. "보관 위치"(예: 사내 비밀번호 관리자 항목명)만 적는다.
- **근거 없는 내용 금지**: 사용자가 준 자료에 없는 사실(버전, URL, 담당자, 절차)을 지어내지 않는다. 모르는 칸은 비워 두고 TODO로 남긴다.
- **TODO 표기**
  - 페이지 상단의 `::: warning TODO` 블록은 그 페이지의 필수 항목이 다 채워졌을 때만 지운다.
  - 개별 빈칸은 `<!-- 설명 -->` 주석으로 남긴다.
- **링크**: 같은 프로젝트 안의 문서는 상대 경로(`./accounts`)나 프로젝트 절대 경로(`/project-a/contacts`)로 건다. `.md` 확장자는 붙이지 않는다(cleanUrls).
- **형식**: 목록성 정보는 표로, 절차는 번호 목록으로 쓴다. 명령어는 언어를 지정한 코드 블록에 넣는다.
- **문체**: "~합니다"체를 쓰고 짧은 문장으로 쓴다. 영어 용어는 처음 나올 때만 괄호로 병기한다.
- 새 페이지를 추가하면 `.vitepress/config.mts`의 `projectSidebar()`에도 등록한다.

## 프로젝트 추가

`/new-project <slug> <표시 이름>` 명령을 쓰거나, 다음을 수동으로 한다.
1. `docs/project-a`를 `docs/<slug>`로 복사하고, 문서 안의 `/project-a/` 링크를 `/<slug>/`로 바꾼다.
2. `docs/<slug>/index.md`의 제목을 바꾼다.
3. `.vitepress/projects.mjs`에 `{ slug, name }`를 추가한다.
4. `docs/index.md`의 hero actions와 features에 카드를 추가한다.

## 검증 명령

```bash
npm run docs:build   # 빌드 + dead link 검사 (실패하면 링크부터 확인)
npm test             # CloudFront Function, 챗봇 핸들러(mock), Lambda 타입체크
npm run build:lambda # 챗봇 Lambda 번들
terraform -chdir=infra validate
```

- 셸에 `NODE_OPTIONS`가 존재하지 않는 preload 파일을 가리키면 npm 명령이 실패한다. 그럴 때는 `NODE_OPTIONS=` 로 비우고 실행한다.
- `terraform apply`, `npm run deploy`, 실제 LLM API 호출은 AWS 비용과 외부 영향이 있으므로 사용자가 요청할 때만 실행한다.
