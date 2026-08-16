#!/usr/bin/env bash
# 同步到本地线上目录 /opt/pastoral-create（agents.md 部署义务）。
# 先跑红线预检；只同步仓库内合规内容，绝不覆盖 server/data 真实云存档。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROD="${PROD_DIR:-/opt/pastoral-create}"

"$ROOT/tools/check-redlines.sh"          # 红线不通过则不部署

if [ ! -d "$PROD" ]; then
  echo "线上目录不存在: $PROD" >&2
  exit 1
fi

rsync -a --delete \
  --exclude '/.git/' --exclude '/.agents/' --exclude '/.dsh-vision-toolkit/' \
  --exclude '/node_modules/' --exclude '/tool-output/' --exclude '/.rollback/' \
  --exclude '/server/data/' \
  "$ROOT/" "$PROD/" 
echo "已同步到 $PROD（server/data 未触碰）"
