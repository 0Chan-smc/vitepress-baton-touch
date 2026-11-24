locals {
  use_custom_domain = length(var.domain_aliases) > 0
}

# ---------------------------------------------------------------------------
# S3 (비공개, CloudFront OAC 로만 접근)
# ---------------------------------------------------------------------------
resource "aws_s3_bucket" "docs" {
  bucket = var.bucket_name
}

resource "aws_s3_bucket_ownership_controls" "docs" {
  bucket = aws_s3_bucket.docs.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_public_access_block" "docs" {
  bucket                  = aws_s3_bucket.docs.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

data "aws_iam_policy_document" "docs" {
  statement {
    sid       = "AllowCloudFrontOAC"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.docs.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.docs.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "docs" {
  bucket     = aws_s3_bucket.docs.id
  policy     = data.aws_iam_policy_document.docs.json
  depends_on = [aws_s3_bucket_public_access_block.docs]
}

# ---------------------------------------------------------------------------
# CloudFront Function: Basic Auth + cleanUrls URI 재작성
# ---------------------------------------------------------------------------
resource "aws_cloudfront_function" "auth" {
  name    = "${var.project_name}-basic-auth"
  runtime = "cloudfront-js-2.0"
  comment = "Basic Auth + VitePress cleanUrls rewrite"
  publish = true
  code = templatefile("${path.module}/cloudfront-function.js.tftpl", {
    basic_auth = base64encode("${var.basic_auth_user}:${var.basic_auth_password}")
  })
}

# ---------------------------------------------------------------------------
# CloudFront Distribution
# ---------------------------------------------------------------------------
resource "aws_cloudfront_origin_access_control" "docs" {
  name                              = "${var.project_name}-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

data "aws_cloudfront_cache_policy" "caching_optimized" {
  name = "Managed-CachingOptimized"
}

resource "aws_cloudfront_distribution" "docs" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "${var.project_name} handover docs"
  default_root_object = "index.html"
  price_class         = var.price_class
  aliases             = var.domain_aliases

  origin {
    origin_id                = "s3-docs"
    domain_name              = aws_s3_bucket.docs.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.docs.id
  }

  # 문서 Q&A 챗봇 API (chat.tf)
  dynamic "origin" {
    for_each = var.chat_enabled ? [1] : []
    content {
      origin_id   = "lambda-chat"
      domain_name = local.chat_origin_domain

      custom_origin_config {
        http_port              = 80
        https_port             = 443
        origin_protocol_policy = "https-only"
        origin_ssl_protocols   = ["TLSv1.2"]
        origin_read_timeout    = 60
      }

      custom_header {
        name  = "x-origin-secret"
        value = random_password.origin_secret[0].result
      }
    }
  }

  dynamic "ordered_cache_behavior" {
    for_each = var.chat_enabled ? [1] : []
    content {
      path_pattern             = "/api/*"
      target_origin_id         = "lambda-chat"
      viewer_protocol_policy   = "redirect-to-https"
      allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
      cached_methods           = ["GET", "HEAD"]
      compress                 = false # 스트리밍 응답을 버퍼링 없이 전달
      cache_policy_id          = data.aws_cloudfront_cache_policy.caching_disabled.id
      origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer_except_host.id

      # 같은 함수로 Basic Auth 검사 (/api/ 경로는 URI 재작성 안 함)
      function_association {
        event_type   = "viewer-request"
        function_arn = aws_cloudfront_function.auth.arn
      }
    }
  }

  default_cache_behavior {
    target_origin_id       = "s3-docs"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    cache_policy_id        = data.aws_cloudfront_cache_policy.caching_optimized.id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.auth.arn
    }
  }

  # OAC 환경에서 S3 는 없는 객체에 403 을 반환하므로 403/404 모두 404 페이지로 매핑
  custom_error_response {
    error_code            = 403
    response_code         = 404
    response_page_path    = "/404.html"
    error_caching_min_ttl = 10
  }

  custom_error_response {
    error_code            = 404
    response_code         = 404
    response_page_path    = "/404.html"
    error_caching_min_ttl = 10
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = !local.use_custom_domain
    acm_certificate_arn            = local.use_custom_domain ? var.acm_certificate_arn : null
    ssl_support_method             = local.use_custom_domain ? "sni-only" : null
    minimum_protocol_version       = local.use_custom_domain ? "TLSv1.2_2021" : "TLSv1"
  }

  lifecycle {
    precondition {
      condition     = !local.use_custom_domain || var.acm_certificate_arn != null
      error_message = "domain_aliases 를 지정하면 acm_certificate_arn(us-east-1) 도 지정해야 합니다."
    }
  }
}
