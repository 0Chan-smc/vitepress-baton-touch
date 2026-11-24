# ---------------------------------------------------------------------------
# GitHub Actions 문서 배포 role (OIDC, 키 없음)
#   - github_repository 가 비어 있으면 아무것도 만들지 않는다 (템플릿 기본값)
#   - 권한: 이 사이트 S3 버킷 / CloudFront 무효화 / 챗봇 Lambda 코드 갱신만
#   - 인프라 변경(terraform apply)은 이 role 로 하지 않는다 (수동)
# ---------------------------------------------------------------------------
locals {
  gh_deploy_enabled = var.github_repository != ""
  gh_oidc_host      = "token.actions.githubusercontent.com"
  gh_subject_prefix = var.github_oidc_subject_prefix != "" ? var.github_oidc_subject_prefix : "repo:${var.github_repository}"
  gh_oidc_provider_arn = local.gh_deploy_enabled ? (
    var.create_github_oidc_provider
    ? aws_iam_openid_connect_provider.github[0].arn
    : data.aws_iam_openid_connect_provider.github[0].arn
  ) : null
}

# 계정에 이미 있는 GitHub OIDC provider 참조 (계정당 1개)
data "aws_iam_openid_connect_provider" "github" {
  count = local.gh_deploy_enabled && !var.create_github_oidc_provider ? 1 : 0
  url   = "https://${local.gh_oidc_host}"
}

# provider 가 없는 계정에서만 생성 (create_github_oidc_provider = true)
resource "aws_iam_openid_connect_provider" "github" {
  count          = local.gh_deploy_enabled && var.create_github_oidc_provider ? 1 : 0
  url            = "https://${local.gh_oidc_host}"
  client_id_list = ["sts.amazonaws.com"]
}

data "aws_iam_policy_document" "github_deploy_trust" {
  count = local.gh_deploy_enabled ? 1 : 0

  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [local.gh_oidc_provider_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "${local.gh_oidc_host}:aud"
      values   = ["sts.amazonaws.com"]
    }

    # 지정한 저장소의 배포 브랜치에서 실행된 워크플로만 허용
    # GitHub 가 immutable subject(소유자·저장소 ID 포함)를 쓰면 github_oidc_subject_prefix 로 지정
    condition {
      test     = "StringEquals"
      variable = "${local.gh_oidc_host}:sub"
      values   = ["${local.gh_subject_prefix}:ref:refs/heads/${var.github_deploy_branch}"]
    }
  }
}

resource "aws_iam_role" "github_deploy" {
  count              = local.gh_deploy_enabled ? 1 : 0
  name               = "${var.project_name}-github-deploy"
  description        = "GitHub Actions docs deploy (${var.github_repository}@${var.github_deploy_branch})"
  assume_role_policy = data.aws_iam_policy_document.github_deploy_trust[0].json
}

data "aws_iam_policy_document" "github_deploy" {
  count = local.gh_deploy_enabled ? 1 : 0

  statement {
    sid       = "ListBucket"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.docs.arn]
  }

  statement {
    sid       = "SyncObjects"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.docs.arn}/*"]
  }

  statement {
    sid       = "InvalidateCache"
    actions   = ["cloudfront:CreateInvalidation", "cloudfront:GetInvalidation"]
    resources = [aws_cloudfront_distribution.docs.arn]
  }

  dynamic "statement" {
    for_each = var.chat_enabled ? [1] : []
    content {
      sid       = "UpdateChatLambdaCode"
      actions   = ["lambda:UpdateFunctionCode", "lambda:GetFunction"]
      resources = [aws_lambda_function.chat[0].arn]
    }
  }
}

resource "aws_iam_role_policy" "github_deploy" {
  count  = local.gh_deploy_enabled ? 1 : 0
  name   = "deploy-docs"
  role   = aws_iam_role.github_deploy[0].id
  policy = data.aws_iam_policy_document.github_deploy[0].json
}
