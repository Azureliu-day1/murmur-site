#!/bin/bash
# 文案自查(Wei 2026-09-25 定的口味:说明书型,短,只说事实)。
#
# 查的是**用户看得见的字**:HTML 正文、<title>、meta description、placeholder /
# aria-label / title / alt 属性、SVG <text>,以及内联脚本里会被塞进页面的字符串。
# ⛔ 不查注释(HTML 与 JS 的注释都跳过),也不查法律页(privacy.html / tos.html)。
# ⛔ 不查口语样本:data-ex 属性、#src 输入框的 placeholder —— 它们故意是啰嗦的口语,
#    是「整理之前」的那一半,不是我们说的话。
#
# 规矩(中文页):
#   ① 「——」出现次数 = 0          ② 「就是这个页面」「代码画的」零命中
#   ③ 最长一句 ≤ 45 字            (字数 = 汉字个数 + 英文 / 数字词个数,标点不算)
#   ④ 区块小标题(h2 / h3)≤ 10 字
# 规矩(英文页):
#   ① em-dash「—」出现次数 = 0    (最长一句只报数,不设门)
#
# 用法:tools/copy-lint.sh            在仓库根目录跑;有一条不过就退出 1。
#       tools/copy-lint.sh -v         另外列出每页最长的五句。
cd "$(dirname "$0")/.." || exit 2

# ── PII / 密钥扫描(fail-closed:命中就退 2,文案检查也不跑)──────────────────
# 白名单只有一个地址:foraiandfocus+murmur@gmail.com —— 公开联系地址,Wei 定
# (首页「Intel Mac 等支持」「要云端名额」两处故意公开,基线就有、线上就在)。
# 做法是逐行先删掉这一个地址再匹配,同一行里别的命中照样红。⛔ 不许再加白名单项。
PII_ALLOW='foraiandfocus+murmur@gmail.com'
PII_RE='azureliu|@gmail|\+61|Horizon Way|sb_secret|service_role'
pii=$(grep -rnE "$PII_RE" --exclude-dir=.git . | awk -v a="$PII_ALLOW" '{ l=$0; while ((i=index(l,a))>0) l=substr(l,1,i-1) substr(l,i+length(a)); print l }' | grep -E "$PII_RE" | grep -vE '^\./tools/copy-lint\.sh:[0-9]+:PII_RE=')   # 只放过本脚本定义模式的那一行
if [ -n "$pii" ]; then
  echo "PII 扫描命中(fail-closed,停):"; echo "$pii" | cut -c1-200
  exit 2
fi
echo "PII 扫描:0 命中(白名单:$PII_ALLOW)"

exec python3 - "$@" <<'PY'
import sys, re, glob, html.parser

VERBOSE = "-v" in sys.argv[1:]
LEGAL = {"privacy.html", "tos.html"}
MAX_ZH = 45
MAX_HEAD = 10
BANNED = ["就是这个页面", "代码画的"]
INLINE = {"a", "b", "strong", "em", "i", "s", "span", "kbd", "code", "small", "label", "br", "u", "sup", "sub", "abbr", "mark", "q", "time"}
ATTRS = {"placeholder", "aria-label", "title", "alt"}
CJK = re.compile(r"[㐀-鿿豈-﫿]")
WORD = re.compile(r"[A-Za-z0-9][A-Za-z0-9'’.\-]*")

def count(s, zh):
    if zh:
        return len(CJK.findall(s)) + len(WORD.findall(CJK.sub(" ", s)))
    return len(WORD.findall(s))

def js_strings(src):
    """内联脚本里的字符串字面量(跳过注释)。模板字符串里的 ${…} 换成一个空格。"""
    out, i, n = [], 0, len(src)
    while i < n:
        c = src[i]
        if src.startswith("//", i):
            j = src.find("\n", i); i = n if j < 0 else j; continue
        if src.startswith("/*", i):
            j = src.find("*/", i + 2); i = n if j < 0 else j + 2; continue
        if c in "\"'`":
            q, j, buf = c, i + 1, []
            while j < n and src[j] != q:
                if src[j] == "\\": buf.append(src[j:j+2]); j += 2; continue
                if q == "`" and src.startswith("${", j):
                    depth, j = 1, j + 2
                    while j < n and depth:
                        depth += {"{": 1, "}": -1}.get(src[j], 0); j += 1
                    buf.append(" "); continue
                buf.append(src[j]); j += 1
            out.append("".join(buf)); i = j + 1; continue
        i += 1
    return out

class Page(html.parser.HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.blocks, self.cur, self.skip, self.scripts, self.lang = [], [], None, [], ""
    def flush(self):
        t = re.sub(r"\s+", " ", "".join(self.cur)).strip()
        if t: self.blocks.append(t)
        self.cur = []
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "html": self.lang = a.get("lang", "")
        if tag in ("script", "style"):
            self.flush(); self.skip = tag; self._script = [] ; return
        if tag not in INLINE: self.flush()
        for k in ATTRS:
            if a.get(k) and not (k == "placeholder" and a.get("id") == "src"):
                self.blocks.append(a[k].strip())
        if tag == "meta" and a.get("name") == "description" and a.get("content"):
            self.blocks.append(a["content"].strip())
    handle_startendtag = handle_starttag
    def handle_endtag(self, tag):
        if tag == self.skip:
            if tag == "script": self.scripts.append("".join(self._script))
            self.skip = None; return
        if tag not in INLINE: self.flush()
    def handle_data(self, d):
        if self.skip == "script": self._script.append(d)
        elif self.skip is None: self.cur.append(d)

pages = sorted(set(p for p in glob.glob("*.html") + glob.glob("*/index.html") + glob.glob("en/*.html") + glob.glob("en/*/index.html")
               if p.split("/")[-1] not in LEGAL))
bad = 0
print(f"{'页面':<22}{'语言':<5}{'字数':>6}{'最长一句':>8}{'小标题':>6}  ——/—  禁句")
for p in pages:
    raw = open(p, encoding="utf-8").read()
    pg = Page(); pg.feed(raw); pg.flush()
    body = re.sub(r"<!--.*?-->", "", raw, flags=re.S)
    heads = [re.sub(r"<[^>]+>", "", h).strip() for h in re.findall(r"<h[23][^>]*>(.*?)</h[23]>", body, re.S)]
    zh = pg.lang.lower().startswith("zh")
    segs = list(pg.blocks)
    for src in pg.scripts:
        for s in js_strings(src):
            if (CJK.search(s) if zh else re.search(r"[A-Za-z]{2,}.*\s.*[A-Za-z]", s) and not re.search(r"[{};=<>]|https?:", s)):
                segs.append(s.strip())
    text = "\n".join(segs)
    dash = text.count("——") if zh else text.count("—")
    banned = [b for b in BANNED if b in text]
    sents = []
    for s in segs:
        for piece in re.split(r"(?<=[。!?;!?;])|(?<=[.!?])\s+(?=[A-Z])" if not zh else r"(?<=[。!?;!?;])", s):
            piece = piece.strip()
            if piece: sents.append((count(piece, zh), piece))
    sents.sort(key=lambda x: -x[0])
    total = count(text, zh)
    longest = sents[0] if sents else (0, "")
    longhead = max(heads, key=lambda h: count(h, zh), default="")
    fail = dash > 0 or banned or (zh and longest[0] > MAX_ZH) or (zh and count(longhead, zh) > MAX_HEAD)
    bad |= bool(fail)
    print(f"{p:<22}{'zh' if zh else 'en':<5}{total:>6}{longest[0]:>8}{count(longhead, zh):>6}  {dash:>5}  {','.join(banned) or '-'}  {'FAIL' if fail else 'ok'}")
    print(f"    最长: {longest[1][:90]}")
    if longhead: print(f"    最长小标题: {longhead}")
    if VERBOSE:
        for c, s in sents[1:5]: print(f"    {c:>3}: {s[:90]}")
    if dash:
        for s in segs:
            if ("——" if zh else "—") in s: print(f"    带破折号: {s[:90]}")
print("copy-lint:", "FAIL" if bad else "PASS")
sys.exit(1 if bad else 0)
PY
