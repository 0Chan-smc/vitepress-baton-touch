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
