# vitepress-baton-touch

VitePress로 인수인계 문서를 만드는 템플릿입니다. S3와 CloudFront로 배포하며, CloudFront Functions에서 Basic Auth를 처리합니다.

## 빠른 시작

```bash
npm install
npm run docs:dev        # http://localhost:5173
```

| 명령 | 설명 |
| --- | --- |
| `npm run docs:dev` | 로컬 개발 서버 |
| `npm run docs:build` | `.vitepress/dist` 로 정적 빌드 |
| `npm run docs:preview` | 빌드 결과 미리보기 |
| `npm run test:cf` | CloudFront Function(Basic Auth, URI 재작성) 로컬 테스트 |
| `npm run deploy` | 빌드 → S3 업로드 → CloudFront 무효화 |

## 구조

```
.vitepress/config.mts   사이트 설정 (nav, sidebar, 검색, 한국어 라벨)
docs/                   문서 원본 (srcDir)
  index.md              프로젝트 선택 홈
  project-a/            A 프로젝트 문서 (index, overview/, setup/, operations/, tasks/, contacts, faq)
  project-b/ project-c/ 같은 구성
  guide/                문서 사이트 수정·배포 방법 (공통)
infra/                  Terraform: S3, OAC, CloudFront, CloudFront Function
scripts/deploy.sh       배포 스크립트
scripts/test-cf-function.mjs
```

## 문서 작성 규칙

- 채워야 할 곳은 `::: warning TODO` 블록과 `<!-- -->` 주석으로 표시되어 있습니다. 내용을 채운 뒤 TODO 블록을 지우세요.
- 비밀번호, 토큰 같은 비밀 값은 문서에 쓰지 말고 보관 위치만 적으세요.
- 상단 탭은 프로젝트별로 나뉘고, 탭을 바꾸면 좌측 사이드바가 그 프로젝트 것으로 바뀝니다(`/project-a/...` 경로 기준).
- 새 프로젝트 추가: `docs/project-a`를 복사해 이름을 바꾸고(문서 안의 `/project-a/` 링크도 함께 치환), `.vitepress/config.mts`의 `projects` 배열에 한 줄 추가합니다. 홈(`docs/index.md`)의 카드도 추가하세요.
- 새 페이지를 추가하면 `.vitepress/config.mts`의 `projectSidebar()`에도 등록하세요.
- 이미지는 `docs/public/`에 넣고 `/파일명.png`로 참조합니다.

## 배포

### 1. 인프라 구성 (최초 1회)

필요한 것: Terraform 1.5 이상, AWS CLI, 그리고 S3·CloudFront 권한이 있는 AWS 자격증명.

```bash
cd infra
cp terraform.tfvars.example terraform.tfvars   # 버킷명, Basic Auth 계정 등 입력
terraform init
terraform apply
```

- Basic Auth 계정은 `templatefile()`로 CloudFront Function 코드에 직접 들어갑니다. repo에는 placeholder만 있습니다.
- `terraform.tfvars`와 `*.tfstate`는 `.gitignore`에 포함되어 있습니다. **state에 비밀번호가 평문으로 남으므로** 여럿이 관리한다면 `infra/versions.tf`의 주석을 참고해 암호화된 S3 backend를 사용하세요.
- 커스텀 도메인을 쓰려면 `domain_aliases`와 `acm_certificate_arn`(us-east-1에서 발급)을 지정하고 DNS CNAME을 CloudFront 도메인으로 연결합니다.

### 2. 문서 배포

```bash
npm run deploy
```

버킷명과 배포 ID는 `terraform output`에서 자동으로 읽습니다. 다른 값을 쓰려면 `S3_BUCKET`, `CF_DISTRIBUTION_ID` 환경변수로 지정합니다.

### 동작 방식

- S3 버킷은 비공개이고, CloudFront OAC를 통해서만 읽을 수 있습니다.
- viewer-request 단계의 CloudFront Function이 다음 두 가지를 처리합니다.
  1. `Authorization` 헤더를 검사하고, 맞지 않으면 401과 `WWW-Authenticate`를 반환합니다.
  2. VitePress `cleanUrls`에 맞춰 `/a/` → `/a/index.html`, `/a/b` → `/a/b.html`로 URI를 바꿉니다.
- 없는 경로는 S3가 403을 반환합니다. CloudFront가 이를 `/404.html`(응답 코드 404)로 바꿉니다.
- `assets/`는 1년 immutable로 캐시하고, HTML은 `no-cache`로 둔 뒤 배포할 때마다 `/*`를 무효화합니다.
