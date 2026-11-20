#!/usr/bin/env bash
# VitePress 빌드 결과를 S3에 업로드하고 CloudFront 캐시를 무효화한다.
# 사용: npm run deploy
#   S3_BUCKET, CF_DISTRIBUTION_ID 환경변수가 없으면 terraform output에서 읽는다.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

command -v aws >/dev/null 2>&1 || { echo "aws CLI가 필요합니다." >&2; exit 1; }

tf_output() {
  command -v terraform >/dev/null 2>&1 || return 1
  terraform -chdir=infra output -raw "$1" 2>/dev/null
}

S3_BUCKET="${S3_BUCKET:-$(tf_output bucket_name || true)}"
CF_DISTRIBUTION_ID="${CF_DISTRIBUTION_ID:-$(tf_output distribution_id || true)}"

if [[ -z "$S3_BUCKET" || -z "$CF_DISTRIBUTION_ID" ]]; then
  echo "S3_BUCKET / CF_DISTRIBUTION_ID 를 확인할 수 없습니다." >&2
  echo "환경변수로 지정하거나 infra/ 에서 terraform apply 를 먼저 실행하세요." >&2
  exit 1
fi

DIST_DIR=".vitepress/dist"

echo "▶ 빌드"
npm run docs:build

echo "▶ 정적 에셋 업로드 (해시 파일명, 장기 캐시)"
aws s3 sync "$DIST_DIR/assets" "s3://$S3_BUCKET/assets" \
  --cache-control "public,max-age=31536000,immutable"

echo "▶ HTML 등 나머지 업로드 (no-cache, 삭제 동기화)"
aws s3 sync "$DIST_DIR" "s3://$S3_BUCKET" \
  --delete \
  --exclude "assets/*" \
  --cache-control "no-cache"

echo "▶ CloudFront 캐시 무효화"
aws cloudfront create-invalidation \
  --distribution-id "$CF_DISTRIBUTION_ID" \
  --paths "/*" \
  --query 'Invalidation.Id' --output text

echo "✔ 배포 완료: s3://$S3_BUCKET"
