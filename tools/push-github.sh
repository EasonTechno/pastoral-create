#!/usr/bin/env bash
# 一键推送 master 到 GitHub（token 从环境变量 GITHUB_TOKEN 读取，通过 Authorization 头传输，不落盘、不进历史）
set -euo pipefail
TOKEN="${GITHUB_TOKEN:-}"
if [ -z "$TOKEN" ]; then
  echo "请先设置环境变量 GITHUB_TOKEN（不要在命令行里直接写 token）" >&2
  exit 1
fi
AUTH=$(printf 'x-access-token:%s' "$TOKEN" | base64 | tr -d '\n')
exec git -c http.extraheader="Authorization: Basic $AUTH" push -u origin master
