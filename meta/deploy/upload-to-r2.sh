#!/usr/bin/env bash
set -euo pipefail

# Upload generated assets to Cloudflare R2
# Requires: wrangler CLI logged in, or aws CLI configured with R2 S3-compatible endpoint
#
# Usage:
  #  export R2_ENDPOINT=https://c943b6113b3e46ba2ca3e73a69e976ac.r2.cloudflarestorage.com
  #  export R2_ACCESS_KEY_ID=a599e7624c46b7b1e1b0ca184007f377
  #  export R2_SECRET_ACCESS_KEY=aaf43ace15a0b83fc429b6b2c3b2c208a3d4e74bbd91f8a6b798abab69c56a13
  #  export R2_BUCKET=metaverse
  #  bash deploy/upload-to-r2.sh

: "${R2_ENDPOINT:?Must set R2_ENDPOINT}"
: "${R2_ACCESS_KEY_ID:?Must set R2_ACCESS_KEY_ID}"
: "${R2_SECRET_ACCESS_KEY:?Must set R2_SECRET_ACCESS_KEY}"
: "${R2_BUCKET:?Must set R2_BUCKET}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
META_DIR="$(dirname "$SCRIPT_DIR")"
FRONTEND_PUBLIC="$META_DIR/apps/frontend/public"
UPLOADS="$META_DIR/apps/http/uploads/defaults"

echo "=== Generating tiles ==="
node "$META_DIR/scripts/generate-tiles.mjs"

echo "=== Generating avatars ==="
node "$META_DIR/scripts/generate-avatars.mjs"

echo "=== Syncing tiles to R2 ==="
aws s3 sync "$FRONTEND_PUBLIC/tiles/" "s3://$R2_BUCKET/tiles/" \
  --endpoint-url "$R2_ENDPOINT" \
  --region auto \
  --acl public-read

echo "=== Syncing items to R2 ==="
aws s3 sync "$FRONTEND_PUBLIC/items/" "s3://$R2_BUCKET/items/" \
  --endpoint-url "$R2_ENDPOINT" \
  --region auto \
  --acl public-read

echo "=== Syncing uploads (avatars) to R2 ==="
aws s3 sync "$UPLOADS/" "s3://$R2_BUCKET/uploads/defaults/" \
  --endpoint-url "$R2_ENDPOINT" \
  --region auto \
  --acl public-read

echo "=== Done ==="
echo "Set VITE_ASSETS_URL to your R2 public bucket URL for frontend builds."
echo "Example: https://pub-xxxxxxxxxxxxxxxxxxxxx.r2.dev"
