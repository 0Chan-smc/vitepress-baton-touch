# vitepress-baton-touch

VitePress로 인수인계 문서를 만드는 템플릿입니다. S3와 CloudFront로 배포하며, CloudFront Functions에서 Basic Auth를 처리합니다.

AI 기능은 세 가지입니다.

- **문서 Q&A 챗봇**: 보고 있는 프로젝트의 문서만 근거로 답합니다. 기본은 OpenAI GPT Luna이고, 설정으로 Claude도 쓸 수 있습니다.
- **llms.txt**: AI 도구에 붙여넣기 좋은 형태로 문서를 출력합니다.
- **Claude Code 작성 보조**: `CLAUDE.md`와 슬래시 명령으로 문서 작성을 돕습니다.

## 빠른 시작

```bash
npm install
npm run docs:dev        # http://localhost:5173
```

| 명령 | 설명 |
| --- | --- |
| `npm run docs:dev` | 로컬 개발 서버 |
| `npm run docs:build` | `.vitepress/dist`로 정적 빌드(`llms.txt` 포함) |
| `npm run docs:preview` | 빌드 결과 미리보기 |
| `npm test` | CloudFront Function, 챗봇 핸들러(mock) 테스트, Lambda 타입체크 |
| `npm run build:lambda` | 챗봇 Lambda 번들 + 프로젝트별 문서 컨텍스트 생성 |
| `npm run infra:apply` | Lambda 빌드 → `terraform apply` |
| `npm run deploy` | 빌드 → S3 업로드 → CloudFront 무효화 → 챗봇 문서 컨텍스트 갱신 |

## 구조

```
.vitepress/
  projects.mjs          프로젝트 목록 (탭·사이드바·챗봇의 단일 출처)
  config.mts            사이트 설정 (nav, sidebar, 검색, llms.txt, 한국어 라벨)
  theme/                커스텀 테마: ChatWidget(문서 Q&A), CopyPageButtons(페이지 복사)
docs/                   문서 원본 (srcDir)
  index.md              프로젝트 선택 홈
  project-a/            A 프로젝트 문서 (index, overview/, setup/, operations/, tasks/, contacts, faq)
  project-b/ project-c/ 같은 구성
  guide/                문서 사이트 사용·배포 방법 (공통)
infra/                  Terraform
  main.tf               S3, OAC, CloudFront, CloudFront Function
  chat.tf               챗봇: Lambda, Function URL, Secrets Manager (제공사 선택)
  lambda/src/           챗봇 Lambda 소스 (chat.ts = 공통 로직, providers/ = OpenAI·Claude 어댑터, index.ts = 진입점)
scripts/                배포, 빌드, 테스트 스크립트
CLAUDE.md               Claude Code용 작성 규칙
.claude/commands/       Claude Code 슬래시 명령
```

## 문서 작성 규칙

- 채워야 할 곳은 `::: warning TODO` 블록과 `<!-- -->` 주석으로 표시되어 있습니다. 내용을 채운 뒤 TODO 블록을 지우세요.
- 비밀번호, 토큰 같은 비밀 값은 문서에 쓰지 말고 보관 위치만 적으세요. 챗봇을 켜면 문서 내용이 선택한 LLM API(OpenAI 또는 Anthropic)로 전송됩니다.
- 상단 탭은 프로젝트별로 나뉘고, 탭을 바꾸면 좌측 사이드바가 그 프로젝트 것으로 바뀝니다(`/project-a/...` 경로 기준).
- 새 프로젝트 추가: Claude Code에서 `/new-project <slug> <이름>`을 실행하거나, 수동으로 다음을 합니다.
  1. `docs/project-a`를 복사하고 `/project-a/` 링크를 치환합니다.
  2. `.vitepress/projects.mjs`에 한 줄 추가합니다.
  3. 홈(`docs/index.md`)에 카드를 추가합니다.
- 새 페이지를 추가하면 `.vitepress/config.mts`의 `projectSidebar()`에도 등록하세요.
- 이미지는 `docs/public/`에 넣고 `/파일명.png`로 참조합니다.
- 본문 이미지는 클릭하면 확대 모달로 열립니다(viewer.js, `.vitepress/theme/image-viewer.ts`). 휠로 확대·축소, 드래그로 이동합니다. 링크로 감싼 이미지(`[![..](..)](..)`)는 모달 대신 링크로 동작합니다.

## 배포

### 1. 인프라 구성 (최초 1회)

필요한 것: Terraform 1.5 이상, Node.js 18 이상, AWS CLI, 그리고 S3·CloudFront·Lambda·Secrets Manager 권한이 있는 AWS 자격증명.

```bash
cp infra/terraform.tfvars.example infra/terraform.tfvars   # 버킷명, Basic Auth 계정 등 입력
terraform -chdir=infra init
npm run infra:apply       # Lambda 빌드 후 terraform apply
```

- Basic Auth 계정은 `templatefile()`로 CloudFront Function 코드에 직접 들어갑니다. repo에는 placeholder만 있습니다.
- `terraform.tfvars`와 `*.tfstate`는 `.gitignore`에 포함되어 있습니다. **state에 Basic Auth 비밀번호가 평문으로 남으므로** 여럿이 관리한다면 `infra/versions.tf`의 주석을 참고해 암호화된 S3 backend를 사용하세요.
- 커스텀 도메인을 쓰려면 `domain_aliases`와 `acm_certificate_arn`(us-east-1에서 발급)을 지정하고 DNS CNAME을 CloudFront 도메인으로 연결합니다.

### 2. 챗봇 API 키 등록 (최초 1회)

Terraform은 빈 시크릿만 만듭니다. `chat_provider`에 맞는 키(OpenAI `sk-...` 또는 Anthropic `sk-ant-...`)를 직접 넣습니다. 이렇게 하면 tfstate에 키가 남지 않습니다.

```bash
aws secretsmanager put-secret-value \
  --secret-id "$(terraform -chdir=infra output -raw chat_secret_name)" \
  --secret-string 'sk-...'
```

키를 바꿀 때도 같은 명령을 씁니다. 실행 중인 Lambda는 콜드 스타트 때 키를 읽으므로, 바로 반영하려면 Lambda 콘솔에서 환경을 재시작하거나 `npm run deploy`를 한 번 실행합니다.

### 3. 문서 배포

**자동 배포 (GitHub Actions)**: `main`에 push하면 `.github/workflows/deploy-docs.yml`이 실행됩니다.

- 동작 순서: 테스트 → 빌드 → S3 업로드 → CloudFront 무효화 → 챗봇 Lambda 문서 갱신
- 실행 조건: `docs/`, `.vitepress/`, `scripts/`, `infra/lambda/src/`, `package*.json`이 바뀐 push. Actions 탭에서 수동 실행도 됩니다.
- AWS 인증: 키 없이 GitHub OIDC로 배포 전용 role을 씁니다. 권한은 이 사이트의 S3, CloudFront, 챗봇 Lambda로만 한정됩니다.
- 인프라 변경(`infra/*.tf`, `terraform.tfvars`)은 자동 배포하지 않습니다. 로컬에서 `npm run infra:apply`로 반영합니다.

자동 배포 최초 설정 (1회):

```bash
# 1. infra/terraform.tfvars 에 저장소 지정 후 apply → 배포 role 생성
#    github_repository = "my-org/my-handover-docs"
#    (계정에 GitHub OIDC provider 가 없으면 create_github_oidc_provider = true)
npm run infra:apply

# 2. GitHub Actions 변수 등록
cd infra
gh variable set DOCS_DEPLOY_ROLE_ARN --body "$(terraform output -raw github_deploy_role_arn)"
gh variable set S3_BUCKET            --body "$(terraform output -raw bucket_name)"
gh variable set CF_DISTRIBUTION_ID   --body "$(terraform output -raw distribution_id)"
gh variable set CHAT_LAMBDA_NAME     --body "$(terraform output -raw chat_lambda_name)"
```

`DOCS_DEPLOY_ROLE_ARN` 변수가 없으면 워크플로는 실패하지 않고 건너뜁니다.

- 배포 단계에서 `Not authorized to perform sts:AssumeRoleWithWebIdentity`가 나면, 저장소가 GitHub immutable subject(소유자·저장소 ID 포함)를 쓰는 경우입니다. 아래 값을 `github_oidc_subject_prefix`에 넣고 다시 apply합니다.
  `gh api repos/<owner>/<repo>/actions/oidc/customization/sub --jq .sub_claim_prefix`
- 실제 문서를 배포하는 저장소는 **private**으로 둡니다. public 저장소는 Actions 로그를 누구나 볼 수 있어, 계정 ID·버킷명·문서 파일 경로가 노출됩니다.

**수동 배포**: 로컬에서 바로 올릴 때 씁니다.

```bash
npm run deploy
```

버킷명, 배포 ID, Lambda 이름은 `terraform output`에서 자동으로 읽습니다. 다른 값을 쓰려면 `S3_BUCKET`, `CF_DISTRIBUTION_ID`, `CHAT_LAMBDA_NAME` 환경변수로 지정합니다.

### 동작 방식

- S3 버킷은 비공개이고, CloudFront OAC를 통해서만 읽을 수 있습니다.
- viewer-request 단계의 CloudFront Function이 다음 두 가지를 처리합니다.
  1. `Authorization` 헤더를 검사하고, 맞지 않으면 401과 `WWW-Authenticate`를 반환합니다. `/api/*` 포함 모든 경로에 적용됩니다.
  2. VitePress `cleanUrls`에 맞춰 `/a/` → `/a/index.html`, `/a/b` → `/a/b.html`로 URI를 바꿉니다. `/api/*`는 바꾸지 않습니다.
- 없는 경로는 S3가 403을 반환합니다. CloudFront가 이를 `/404.html`(응답 코드 404)로 바꿉니다.
- `assets/`는 1년 immutable로 캐시하고, HTML은 `no-cache`로 둔 뒤 배포할 때마다 `/*`를 무효화합니다.


### 보안 응답 헤더

CloudFront 응답 헤더 정책(`infra/main.tf`의 `aws_cloudfront_response_headers_policy.security`)이 모든 응답(401 포함)에 아래 헤더를 붙입니다.

- `Strict-Transport-Security` (2년, 하위 도메인 포함)
- `X-Frame-Options: DENY`, CSP `frame-ancestors 'none'`: 다른 사이트에 iframe으로 넣지 못하게 막습니다.
- `Content-Security-Policy`: 같은 출처의 스크립트, 스타일, 이미지만 허용합니다. VitePress 인라인 스크립트 때문에 `'unsafe-inline'`은 허용합니다. 외부 스크립트나 이미지를 문서에 넣으려면 CSP를 함께 고쳐야 합니다.
- `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`(카메라·마이크·위치 차단)

## AI 기능

### 문서 Q&A 챗봇

```
브라우저 ─(Basic Auth)→ CloudFront ┬ /*      → S3
                                    └ /api/*  → Lambda Function URL (스트리밍) → OpenAI 또는 Anthropic API
```

- **표시 위치**: 프로젝트 페이지 우측 하단의 "AI에게 묻기" 버튼입니다. 질문은 그 프로젝트의 문서만 근거로 답하고, 근거 문서 링크를 함께 보여 줍니다.
- **문서 전달 방식**: 빌드할 때 `docs/<slug>/**/*.md`를 프로젝트별로 묶어 Lambda에 포함합니다(`scripts/build-lambda.mjs`). 질문할 때마다 해당 프로젝트 문서 전체를 system 프롬프트로 보내고, prompt caching으로 반복 비용을 줄입니다. 검색 인덱스나 벡터 DB는 없습니다.
- **제공사와 모델 설정** (`infra/terraform.tfvars`)

  | 변수 | 기본값 | 설명 |
  | --- | --- | --- |
  | `chat_provider` | `openai` | `openai`(Responses API) 또는 `anthropic`(Messages API) |
  | `chat_model` | 제공사별 기본값 | `openai`는 `gpt-6-luna`, `anthropic`은 `claude-opus-5-5` |
  | `chat_effort` | `low` | 추론 강도. `low`, `medium`, `high`, `xhigh`, `max` |

  - OpenAI API에는 "최신 Luna" 별칭이 없습니다. 기본값은 SDK가 아는 최신 Luna인 `gpt-6-luna`로 고정했고, 새 Luna가 나오면 `chat_model`만 바꾸면 됩니다.
  - **OpenAI**: 지시문과 문서를 고정 prefix로 보내 자동 prompt caching을 받고, `store: false`로 응답을 OpenAI에 저장하지 않습니다.
  - **Claude**: 문서 블록에 `cache_control`을 걸고, 안전 분류기 거절에 대비해 server-side fallback(`fallbacks: "default"`)을 켭니다.
  - 제공사를 바꾸면 시크릿에 그 제공사의 키를 다시 넣어야 합니다(아래 2번).
- **접근 제어**
  - CloudFront의 Basic Auth를 거쳐야 합니다.
  - CloudFront만 아는 `x-origin-secret` 헤더가 없으면 Lambda가 403을 반환하므로, Function URL을 직접 호출할 수 없습니다.
- **제한**: 질문은 2,000자 이하, 대화는 최근 20개 메시지까지 보냅니다.
- **끄기**: `chat_enabled = false`로 두고 apply합니다. 위젯은 남지만 API가 없으므로 연결 오류를 표시합니다.
- **비용 상한**
  - **동시 처리 제한**: 챗봇 Lambda는 동시에 최대 `chat_max_concurrency`(기본 3)개 질문만 처리합니다. 초과 요청은 거절되고 위젯에 오류로 표시됩니다.
  - **월 예산 (직접 설정)**: OpenAI 대시보드 → 해당 프로젝트 → Limits에서 월 예산(budget)과 알림 기준을 정합니다. Anthropic을 쓰면 Console의 Limits에서 설정합니다. 예산을 넘으면 API가 거절하므로 비용이 더 늘지 않습니다.
  - **사용량 확인**: CloudWatch 로그 `/aws/lambda/<project>-chat`의 `chat.done` 항목에 요청별 토큰 사용량이 남습니다.
- **로컬 개발**: 배포된 API를 프록시로 연결해 씁니다.

  ```bash
  CHAT_API_URL=https://xxxx.cloudfront.net CHAT_BASIC_AUTH='user:pass' npm run docs:dev
  ```

> [!WARNING]
> **데이터와 비용**
> - 질문할 때마다 해당 프로젝트 문서 전체가 선택한 LLM API(OpenAI 또는 Anthropic)로 전송됩니다. 회사 정책상 외부 AI API 사용이 허용되는지 먼저 확인하세요.
> - 비용은 질문 수와 문서 양에 비례합니다. CloudWatch 로그(`/aws/lambda/<project>-chat`)의 `chat.done` 항목에서 요청별 토큰 사용량을 볼 수 있습니다.
> - 문서가 짧으면(약 1,000토큰 미만) prompt caching이 적용되지 않을 수 있습니다.

### llms.txt

`vitepress-plugin-llms`가 빌드할 때 다음 파일을 만듭니다.

| 경로 | 내용 |
| --- | --- |
| `/llms.txt` | 문서 목차 |
| `/llms-full.txt` | 전체 문서를 하나로 합친 텍스트 |
| `/<페이지>.md` | 페이지별 마크다운 원본 (예: `/project-a/setup/accounts.md`) |

각 페이지 제목 아래에는 **페이지 복사**와 **마크다운 보기** 버튼이 있습니다. 복사한 내용을 Claude나 ChatGPT에 붙여넣어 질문하면 됩니다.

플러그인 기본 버튼의 "Open in ChatGPT/Claude"는 외부 서비스가 URL을 직접 읽는 방식입니다. Basic Auth 뒤에 있는 이 사이트에서는 동작하지 않으므로 뺐습니다.

### Claude Code 작성 보조

repo를 Claude Code로 열면 `CLAUDE.md`의 작성 규칙(비밀 값 금지, 근거 없는 내용 금지, TODO 표기 등)이 자동으로 적용됩니다.

| 명령 | 설명 |
| --- | --- |
| `/new-project <slug> <이름>` | 새 프로젝트 문서 세트 추가 (복제 + 탭, 사이드바, 홈 등록 + 빌드 검증) |
| `/fill-todo <문서 또는 slug> [자료 파일]` | 메모나 회의록 같은 자료로 TODO 채우기. 근거 없는 칸은 확인 필요로 남김 |
| `/audit-docs [slug]` | 남은 TODO, 비밀 값 의심, 깨진 링크, 사이드바 누락 점검 보고 |
