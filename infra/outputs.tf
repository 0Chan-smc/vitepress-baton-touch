output "bucket_name" {
  description = "문서 업로드 대상 S3 버킷"
  value       = aws_s3_bucket.docs.bucket
}

output "distribution_id" {
  description = "CloudFront 배포 ID (캐시 무효화용)"
  value       = aws_cloudfront_distribution.docs.id
}

output "distribution_domain_name" {
  description = "CloudFront 기본 도메인"
  value       = aws_cloudfront_distribution.docs.domain_name
}

output "chat_secret_name" {
  description = "LLM API 키(chat_provider 에 맞는 키)를 등록할 Secrets Manager 시크릿 이름"
  value       = var.chat_enabled ? aws_secretsmanager_secret.llm_api_key[0].name : null
}

output "chat_lambda_name" {
  description = "챗봇 Lambda 함수 이름 (문서 배포 시 컨텍스트 갱신에 사용)"
  value       = var.chat_enabled ? aws_lambda_function.chat[0].function_name : null
}
