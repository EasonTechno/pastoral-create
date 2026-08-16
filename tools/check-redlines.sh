#!/usr/bin/env bash
# 推送前红线预检：违反任何一条就非零退出，阻止推送。
# 红线依据：MAINTENANCE.md
set -u
FAIL=0
fail(){ echo "  ✗ RED-LINE: $1" >&2; FAIL=1; }

echo "== 红线预检 =="

if git ls-files 'assets/textures/**' | grep -qiE '\.(png|jpg|jpeg|gif)$'; then
  fail "assets/textures/ 下存在第三方贴图（不应上传）"
fi

if git ls-files | grep -qiE '\.ttf$'; then
  fail "存在 .ttf 完整字体（不应上传，仅保留 woff2 子集）"
fi

if git ls-files | grep -qE '^(node_modules|tool-output|\.rollback|\.agents|\.dsh-vision-toolkit)/'; then
  fail "存在本地工具/依赖/产物目录被跟踪"
fi

if git ls-files 'server/data/*' | grep -qvE '(^|/)\.gitkeep$'; then
  fail "server/data/ 不应提交真实云存档数据"
fi

if git grep -n -E 'ghp_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{20,}|BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY' -- . ':!server/data' 2>/dev/null | grep -qv 'tools/'; then
  fail "跟踪文件中疑似包含 token/密钥"
fi

if [ "$FAIL" -ne 0 ]; then
  echo "== 红线预检失败，已阻止推送。请先清理（见 MAINTENANCE.md）==" >&2
  exit 1
fi
echo "== 红线预检通过 =="
