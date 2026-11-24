variable "project_name" {
  description = "리소스 이름/태그에 쓰는 프로젝트 식별자 (영문 소문자, 숫자, 하이픈)"
  type        = string
  default     = "handover-docs"
}

variable "aws_region" {
  description = "S3 버킷 리전"
  type        = string
  default     = "ap-northeast-2"
}

variable "bucket_name" {
  description = "문서를 올릴 S3 버킷 이름 (전역 고유)"
  type        = string
}

variable "basic_auth_user" {
  description = "Basic Auth 사용자명"
  type        = string
}

variable "basic_auth_password" {
  description = "Basic Auth 비밀번호"
  type        = string
  sensitive   = true
}

variable "domain_aliases" {
  description = "커스텀 도메인 목록. 비워두면 *.cloudfront.net 도메인 사용"
  type        = list(string)
  default     = []
}

variable "acm_certificate_arn" {
  description = "커스텀 도메인용 ACM 인증서 ARN (반드시 us-east-1). domain_aliases 사용 시 필수"
  type        = string
  default     = null
}

variable "price_class" {
  description = "CloudFront 가격 등급 (PriceClass_100 | PriceClass_200 | PriceClass_All)"
  type        = string
  default     = "PriceClass_200"
}

# ---------------------------------------------------------------------------
# 문서 Q&A 챗봇
# ---------------------------------------------------------------------------
variable "chat_enabled" {
  description = "문서 Q&A 챗봇(Lambda + /api/*) 배포 여부"
  type        = bool
  default     = true
}

variable "chat_provider" {
  description = "챗봇 LLM 제공사 (openai | anthropic)"
  type        = string
  default     = "openai"

  validation {
    condition     = contains(["openai", "anthropic"], var.chat_provider)
    error_message = "chat_provider 는 openai 또는 anthropic 이어야 합니다."
  }
}

variable "chat_model" {
  description = "모델 ID. 비워두면 제공사 기본값 (openai: gpt-6-luna, anthropic: claude-opus-5-5)"
  type        = string
  default     = null
}

variable "chat_effort" {
  description = "추론 effort 수준 (low | medium | high | xhigh | max). 문서 Q&A 는 low 로 충분"
  type        = string
  default     = "low"

  validation {
    condition     = contains(["low", "medium", "high", "xhigh", "max"], var.chat_effort)
    error_message = "chat_effort 는 low, medium, high, xhigh, max 중 하나여야 합니다."
  }
}

# ---------------------------------------------------------------------------
# GitHub Actions 문서 배포 (github-actions.tf)
# ---------------------------------------------------------------------------
variable "github_repository" {
  description = "자동 배포할 GitHub 저장소 (owner/repo). 비워두면 배포 role 을 만들지 않음"
  type        = string
  default     = ""
}

variable "github_deploy_branch" {
  description = "배포를 허용할 브랜치"
  type        = string
  default     = "main"
}

variable "github_oidc_subject_prefix" {
  description = <<-EOT
    GitHub OIDC 토큰 sub 접두사. 비워두면 "repo:<github_repository>".
    저장소가 immutable subject 를 쓰면 ID 가 포함된 값이 필요하다. 확인 방법:
      gh api repos/<owner>/<repo>/actions/oidc/customization/sub --jq .sub_claim_prefix
  EOT
  type        = string
  default     = ""
}

variable "create_github_oidc_provider" {
  description = "계정에 GitHub OIDC provider 가 없을 때만 true (계정당 1개, 이미 있으면 false 로 두고 참조)"
  type        = bool
  default     = false
}
