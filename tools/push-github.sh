#!/usr/bin/env bash
# 一键推送 master → GitHub main（走镜像 remote，token 从 GITHUB_TOKEN 环境变量读取，
# 经 Authorization 头传输，不落盘、不进历史）
set -euo pipefail
TOKEN="${GITHUB_TOKEN:-}"
if [ -z "$TOKEN" ]; then
  echo "请先设置环境变量 GITHUB_TOKEN（不要在命令行里直接写 token）" >&2
  exit 1
fi
AUTH=$(printf 'x-access-token:%s' "$TOKEN" | base64 | tr -d '\n')
REMOTE="${PUSH_REMOTE:-mirror}"
# 本地保留 master 分支，推送到 GitHub 的 main（默认分支）以符合 GitHub 习惯
exec git -c http.extraheader="Authorization: Basic $AUTH" push --force "$REMOTE" master:main
