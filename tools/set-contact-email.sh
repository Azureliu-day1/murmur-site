#!/bin/bash
# 一键换全站公开联系邮箱(LEGALFIX,2026-10-08)。
#
# 用法:tools/set-contact-email.sh 新邮箱      在仓库根目录或任意目录跑都行。
#
# 现在的地址以 tools/copy-lint.sh 里的 PII_ALLOW 为准(全站唯一出处);脚本把它在
# 全部 .html 里原样换掉 —— 正文、mailto: 链接、带 ?subject= 参数的 mailto 都是同一串字面量,
# 一并换到;URL 编码过的写法(%2B / %40)也换。然后把 PII_ALLOW 改成新地址,
# 最后跑一遍 copy-lint(PII 扫描 fail-closed)。新旧地址相同、或格式不像邮箱,直接退出不动。
# ⛔ 只改工作区,不 add / commit / push。
set -euo pipefail
cd "$(dirname "$0")/.."

NEW="${1:-}"
if ! printf '%s' "$NEW" | grep -Eq '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'; then
  echo "用法:tools/set-contact-email.sh 新邮箱(格式不对:'$NEW')" >&2; exit 2
fi
OLD=$(sed -n "s/^PII_ALLOW='\(.*\)'$/\1/p" tools/copy-lint.sh)
if [ -z "$OLD" ]; then echo "读不到 tools/copy-lint.sh 里的 PII_ALLOW" >&2; exit 2; fi
if [ "$OLD" = "$NEW" ]; then echo "已经是 $NEW,没动"; exit 0; fi

python3 - "$OLD" "$NEW" <<'PY'
import sys, glob, urllib.parse
old, new = sys.argv[1], sys.argv[2]
enc = lambda a: urllib.parse.quote(a, safe="")
pairs = [(old, new), (enc(old), enc(new))]
total = 0
for p in sorted(glob.glob("**/*.html", recursive=True)):
    s = open(p, encoding="utf-8").read()
    n = sum(s.count(o) for o, _ in pairs)
    if not n:
        continue
    for o, w in pairs:
        s = s.replace(o, w)
    open(p, "w", encoding="utf-8").write(s)
    total += n
    print(f"  {p}: {n} 处")
print(f"合计 {total} 处:{old} → {new}")
PY

# 白名单跟着换(字面量,不走正则)
python3 - "$OLD" "$NEW" <<'PY'
import sys
old, new = sys.argv[1], sys.argv[2]
p = "tools/copy-lint.sh"
s = open(p, encoding="utf-8").read()
line_old, line_new = f"PII_ALLOW='{old}'", f"PII_ALLOW='{new}'"
assert s.count(line_old) == 1, "PII_ALLOW 行不唯一"
open(p, "w", encoding="utf-8").write(s.replace(line_old, line_new))
PY

left=$(grep -rnF --exclude-dir=.git "$OLD" . | grep -v '^\./tools/set-contact-email\.sh:' || true)
if [ -n "$left" ]; then echo "还有旧地址没换掉:"; echo "$left"; exit 1; fi
bash tools/copy-lint.sh >/dev/null && echo "copy-lint: PASS"
