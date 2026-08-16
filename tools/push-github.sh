#!/usr/bin/env bash
# 一键推送 master → GitHub main（走镜像 remote；token 仅从环境变量读取）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
"$ROOT/tools/check-redlines.sh"          # 红线不通过则不推送
TOKEN="${GITHUB_TOKEN:-}"
if [ -z "$TOKEN" ]; then
  echo "请先设置环境变量 GITHUB_TOKEN" >&2
  exit 1
fi
AUTH=$(printf 'x-access-token:%s' "$TOKEN" | base64 | tr -d '\n')
REMOTE="${PUSH_REMOTE:-mirror}"
exec git -c http.extraheader="Authorization: Basic $AUTH" push --force "$REMOTE" master:main
