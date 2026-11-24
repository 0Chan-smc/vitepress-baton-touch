# 문서 사이트 운영

이 페이지는 인수인계 문서 사이트 자체(모든 프로젝트 공통)의 수정·배포 방법을 다룹니다.

## 문서 수정

- 각 프로젝트 문서는 `docs/project-*/` 아래에 있습니다.
- `npm run docs:dev`로 로컬에서 확인한 뒤 배포합니다.
- 새 프로젝트 추가: 기존 프로젝트 폴더를 복사하고 `.vitepress/config.mts`의 `projects` 배열에 한 줄 추가합니다.

## 배포

이 인수인계 문서는 VitePress로 빌드해 **S3**에 올리고, **CloudFront**로 서비스합니다.
CloudFront Functions(viewer-request)가 Basic Auth를 검사하고, `/path` 형태의 URL을 `/path.html`로 바꿉니다.

```
[브라우저] → CloudFront ─(viewer-request: Basic Auth + URI 재작성)─→ S3 (비공개, OAC)
```

### 최초 1회: 인프라 구성

```bash
cd infra
cp terraform.tfvars.example terraform.tfvars   # 버킷명, Basic Auth 계정 입력
terraform init
terraform apply
```

출력값 `bucket_name`, `distribution_id`, `distribution_domain_name`을 확인합니다.

### 문서 배포

```bash
npm run deploy
```

`scripts/deploy.sh`가 아래 순서로 실행합니다.

1. `npm run docs:build`로 `.vitepress/dist`를 생성합니다.
2. `assets/`(해시 파일명)는 `max-age=1년, immutable`로 업로드합니다.
3. HTML 등 나머지는 `no-cache`로 업로드하고, S3에만 남은 파일은 삭제합니다.
4. CloudFront `/*` 캐시를 무효화합니다.

버킷과 배포 ID는 `terraform output`에서 읽습니다. 다른 값을 쓰려면 환경변수로 지정합니다.

```bash
S3_BUCKET=my-bucket CF_DISTRIBUTION_ID=E123ABC npm run deploy
```

### Basic Auth 계정 변경

`infra/terraform.tfvars`에서 `basic_auth_user`와 `basic_auth_password`를 바꾼 뒤 `terraform apply`를 실행합니다.
함수는 즉시 다시 배포되며, 브라우저에 저장된 기존 인증은 창을 닫아야 초기화됩니다.

::: warning
비밀번호는 `terraform.tfstate`에 평문으로 남습니다. state 파일은 공유하지 말고, 여럿이 관리한다면 암호화된 원격 backend(`infra/versions.tf` 주석 참고)를 사용하세요.
:::


## AI 기능 사용법

### 문서 Q&A 챗봇

프로젝트 페이지 우측 하단의 **AI에게 묻기** 버튼을 누르면 해당 프로젝트 문서에 대해 질문할 수 있습니다.

- 지금 보고 있는 프로젝트의 문서만 근거로 답하고, 근거 문서 링크를 함께 보여 줍니다.
- 문서에 없거나 아직 작성되지 않은 내용은 "없음", "작성되지 않음"이라고 답합니다.
- 대화는 브라우저 탭을 닫으면 사라집니다. **새 대화** 버튼으로 초기화할 수 있습니다.

::: warning
AI 답변은 틀릴 수 있습니다. 배포나 장애 대응처럼 중요한 작업은 반드시 원문 문서를 확인하세요.
:::

### 페이지 복사 / llms.txt

- 각 문서 제목 아래의 **페이지 복사** 버튼을 누르면 그 페이지를 마크다운으로 복사합니다. Claude나 ChatGPT에 붙여넣어 질문할 수 있습니다.
- 전체 문서가 필요하면 [`/llms-full.txt`](/llms-full.txt)를 열어 내용을 복사합니다.

### 문서 작성 (Claude Code)

repo를 Claude Code로 열고 다음 명령을 사용합니다.

| 명령 | 용도 |
| --- | --- |
| `/fill-todo <문서 경로> [자료 파일]` | 메모, 회의록으로 TODO 채우기 |
| `/audit-docs [프로젝트]` | 남은 TODO, 비밀 값 의심, 깨진 링크 점검 |
| `/new-project <slug> <이름>` | 새 프로젝트 추가 |

챗봇 설정, 비용, API 키 등록은 저장소 README의 "AI 기능"을 참고하세요.
