#!/bin/bash
# 重出分享图 og.png / og-en.png(1200×630):字取自 tools/hero-title.json,和首屏标题同一个常量。
# 无头 Chrome 带 --use-mock-keychain --password-store=basic、临时 profile;跑前跑后各查一次 SecurityAgent。
# 用法:tools/og/render.sh        在仓库任意目录跑都行;只改工作区,不 add / commit。
set -euo pipefail
cd "$(dirname "$0")/../.."
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
echo "SecurityAgent before: $(pgrep -x SecurityAgent || echo none)"
python3 - "$TMP" "$PWD" <<'PY'
import html, json, re, sys
tmp, root = sys.argv[1], sys.argv[2]
C = json.load(open('tools/hero-title.json', encoding='utf-8'))
tpl = open('tools/og/og.tpl.html', encoding='utf-8').read()
for lang in ('zh', 'en'):
    def plain(s):
        return re.sub(r'(.)\|(.)', lambda m: m.group(1) + (' ' if lang == 'en' or m.group(1).isascii() or m.group(2).isascii() else '') + m.group(2), s)
    page = (tpl.replace('{{LANG}}', 'zh-CN' if lang == 'zh' else 'en')
               .replace('{{FONTS}}', 'file://' + root + '/fonts')
               .replace('{{TITLE}}', html.escape(plain(C[lang]['title']).rstrip('。.')))
               .replace('{{LEDE}}', html.escape(plain(C[lang]['lede']))))
    open(f'{tmp}/{lang}.html', 'w', encoding='utf-8').write(page)
PY
for L in zh en; do
  OUT="og.png"; [ "$L" = en ] && OUT="og-en.png"
  PROFILE="$TMP/profile-$L"
  "$CHROME" --headless=new --use-mock-keychain --password-store=basic --user-data-dir="$PROFILE" \
    --no-first-run --no-default-browser-check --disable-background-networking --disable-sync \
    --disable-component-update --hide-scrollbars --allow-file-access-from-files \
    --window-size=1200,630 --virtual-time-budget=1500 --screenshot="$PWD/$OUT" "file://$TMP/$L.html" </dev/null >/dev/null 2>&1
  echo "  $OUT"
done
echo "SecurityAgent after: $(pgrep -x SecurityAgent || echo none)"
