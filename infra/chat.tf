# ---------------------------------------------------------------------------
# 문서 Q&A 챗봇: CloudFront /api/* → Lambda Function URL(스트리밍) → LLM API
#   chat_provider = "openai"    → OpenAI Responses API (기본 모델 gpt-6-luna)
#   chat_provider = "anthropic" → Claude Messages API  (기본 모델 claude-opus-5-5)
#
# 사전 준비: npm run build:lambda  (infra/lambda/.build 생성)
# 최초 apply 후: 선택한 제공사의 API 키를 Secrets Manager 에 등록 (README 참고)
# ---------------------------------------------------------------------------
locals {
  chat_count = var.chat_enabled ? 1 : 0
  # https://xxxx.lambda-url.ap-northeast-2.on.aws/ → xxxx.lambda-url.ap-northeast-2.on.aws
  chat_model         = coalesce(var.chat_model, var.chat_provider == "openai" ? "gpt-6-luna" : "claude-opus-5-5")
  chat_origin_domain = var.chat_enabled ? trimsuffix(trimprefix(aws_lambda_function_url.chat[0].function_url, "https://"), "/") : null
}

# 값은 Terraform 밖에서 등록한다 (tfstate 에 API 키가 남지 않도록)
resource "aws_secretsmanager_secret" "llm_api_key" {
  count                   = local.chat_count
  name                    = "${var.project_name}/chat-llm-api-key"
  description             = "LLM API key (${var.chat_provider}) for ${var.project_name} docs chatbot (set value manually)"
  recovery_window_in_days = 7
}

# CloudFront → Lambda 요청에만 붙는 비밀 헤더 값 (Function URL 직접 호출 차단용)
resource "random_password" "origin_secret" {
  count   = local.chat_count
  length  = 48
  special = false
}

data "archive_file" "chat" {
  count       = local.chat_count
  type        = "zip"
  source_dir  = "${path.module}/lambda/.build"
  output_path = "${path.module}/lambda/chat.zip"
}

resource "aws_iam_role" "chat" {
  count = local.chat_count
  name  = "${var.project_name}-chat"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "chat" {
  count = local.chat_count
  name  = "chat"
  role  = aws_iam_role.chat[0].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "${aws_cloudwatch_log_group.chat[0].arn}:*"
      },
      {
        Effect   = "Allow"
        Action   = "secretsmanager:GetSecretValue"
        Resource = aws_secretsmanager_secret.llm_api_key[0].arn
      }
    ]
  })
}

resource "aws_cloudwatch_log_group" "chat" {
  count             = local.chat_count
  name              = "/aws/lambda/${var.project_name}-chat"
  retention_in_days = 14
}

resource "aws_lambda_function" "chat" {
  count            = local.chat_count
  function_name    = "${var.project_name}-chat"
  role             = aws_iam_role.chat[0].arn
  runtime          = "nodejs22.x"
  architectures    = ["arm64"]
  handler          = "index.handler"
  filename         = data.archive_file.chat[0].output_path
  source_code_hash = data.archive_file.chat[0].output_base64sha256
  memory_size      = 512
  timeout          = 120

  environment {
    variables = {
      CHAT_PROVIDER  = var.chat_provider
      CHAT_MODEL     = local.chat_model
      CHAT_EFFORT    = var.chat_effort
      CHAT_SECRET_ID = aws_secretsmanager_secret.llm_api_key[0].arn
      ORIGIN_SECRET  = random_password.origin_secret[0].result
    }
  }

  depends_on = [aws_cloudwatch_log_group.chat, aws_iam_role_policy.chat]
}

resource "aws_lambda_function_url" "chat" {
  count              = local.chat_count
  function_name      = aws_lambda_function.chat[0].function_name
  authorization_type = "NONE" # 접근 제어는 CloudFront Basic Auth + origin secret 헤더
  invoke_mode        = "RESPONSE_STREAM"
}

# 공개 Function URL 에 필요한 두 권한 (InvokeFunction 은 Function URL 경유 호출로만 제한)
resource "aws_lambda_permission" "chat_url" {
  count                  = local.chat_count
  statement_id           = "AllowFunctionUrl"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.chat[0].function_name
  principal              = "*"
  function_url_auth_type = "NONE"
}

resource "aws_lambda_permission" "chat_invoke" {
  count                    = local.chat_count
  statement_id             = "AllowInvokeViaFunctionUrl"
  action                   = "lambda:InvokeFunction"
  function_name            = aws_lambda_function.chat[0].function_name
  principal                = "*"
  invoked_via_function_url = true
}

data "aws_cloudfront_cache_policy" "caching_disabled" {
  name = "Managed-CachingDisabled"
}

data "aws_cloudfront_origin_request_policy" "all_viewer_except_host" {
  name = "Managed-AllViewerExceptHostHeader"
}
