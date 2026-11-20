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
