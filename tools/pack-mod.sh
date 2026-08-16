#!/usr/bin/env bash
# 把模组目录打包成 .pcmod（store/defalte ZIP），供游戏「模组管理」安装。
# 用法: tools/pack-mod.sh <模组目录> [输出.pcmod]
set -euo pipefail
SRC="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
OUT="${2:-${SRC%/}.pcmod}"
if [ ! -f "$SRC/mod.json" ]; then
  echo "错误: $SRC 下没有 mod.json" >&2
  exit 1
fi
OUT="$(cd "$(dirname "$OUT")" && pwd)/$(basename "$OUT")"
python3 - "$SRC" "$OUT" <<'PY'
import os, sys, zipfile
src, out = sys.argv[1], sys.argv[2]
picked = []
for root, dirs, files in os.walk(src):
    dirs[:] = [d for d in dirs if d not in ('.git', '.DS_Store')]
    for f in files:
        p = os.path.join(root, f)
        rel = os.path.relpath(p, src).replace(os.sep, '/')
        if rel in ('mod.json','main.js') or rel.startswith('textures/') or rel.lower().endswith(('readme.md','icon.png')):
            picked.append((rel, p))
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for rel, p in picked:
        z.write(p, rel)
print('已打包:', out, f'({len(picked)} 个文件)')
PY
