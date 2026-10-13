#!/bin/bash
# 文案自查。口味:2026-09-25 起「短,只说事实」;2026-10-13 起按 COPY.md / round2 定稿「每一节先说你得到什么,
# 操作交给演示,条件放到你要做决定的那一步」(audits/2026-10-13/site-copy/)。
#
# 查的是**用户看得见的字**:HTML 正文、<title>、meta description、placeholder /
# aria-label / title / alt 属性、SVG <text>,以及内联脚本里会被塞进页面的字符串。
# ⛔ 不查注释(HTML 与 JS 的注释都跳过),也不查法律页(privacy.html / tos.html)。
# ⛔ 不查口语样本:data-ex 属性、#src 输入框的 placeholder —— 它们故意是啰嗦的口语,
#    是「整理之前」的那一半,不是我们说的话。
#
# 规矩(中文页):
#   ① 「——」出现次数 = 0          ② 「就是这个页面」「代码画的」零命中
#   ③ 最长一句 ≤ 50 字            (字数 = 汉字个数 + 英文 / 数字词个数,标点不算)
#   ⑤ 首页(中英)与隐私 / 条款页:不点服务商名字;首页另不讲「本机 / 云端」、不出现内部名「名额 / 随心问 / 口述编辑」
#      (SITE-V3,Wei 10-13:首页和隐私摘要只讲类别 + 国家;隐私页正文也按类别写。内部名只查页面正文,不查脚本:
#      共享录音条 capsule.js 里的模式名照 App 原样)
#   ④ 区块小标题(h2 / h3)≤ 10 字
# 规矩(英文页):
#   ① em-dash「—」出现次数 = 0    (最长一句只报数,不设门)
#
# 用法:tools/copy-lint.sh            在仓库根目录跑;有一条不过就退出 1。
#       tools/copy-lint.sh -v         另外列出每页最长的五句。
cd "$(dirname "$0")/.." || exit 2

# ── PII / 密钥扫描(fail-closed:命中就退 2,文案检查也不跑)──────────────────
# 白名单只有一个地址:下面 PII_ALLOW 那一个 —— 公开联系地址(首页「Intel Mac 等支持」、
# 隐私页与条款的联系 / 投诉处故意公开)。换地址只用 tools/set-contact-email.sh,它连这一行一起改。
# 做法是逐行先删掉这一个地址再匹配,同一行里别的命中照样红。⛔ 不许再加白名单项。
PII_ALLOW='support@day1aifitness.com'
# 仓库里只放**通用**模式(SITEFIX-22):邮箱地址(example.com / .org / .net 占位放过)、国际电话号码、密钥形状。
#   跟某个人有关的模式(名字、住址、本人号码段)⛔ 不进公开仓,放本机不入库的 ~/.config/murmur/pii-extra.txt:
#   一行一个 ERE,# 开头是注释;文件在就并进来一起扫,不在就跳过并打一行提示(CI / 别人的机器上只跑通用那一半)。
PII_RE='[A-Za-z0-9._%+-]+@[A-Za-z][A-Za-z0-9-]*(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}|\+[0-9]{2,3}[ -]?[0-9]{3}[ -]?[0-9]{3}[ -]?[0-9]{3}|sb_secret|service_role|sk_live_|sk_test_|rk_live_|whsec_'
PII_EXTRA_FILE="$HOME/.config/murmur/pii-extra.txt"
if [ -f "$PII_EXTRA_FILE" ]; then
  extra=$(grep -vE '^[[:space:]]*(#|$)' "$PII_EXTRA_FILE" | paste -sd'|' -)
  [ -n "$extra" ] && PII_RE="$PII_RE|$extra"
  echo "PII 本机模式:读了 $(grep -cvE '^[[:space:]]*(#|$)' "$PII_EXTRA_FILE") 条($PII_EXTRA_FILE)"
else
  echo "PII 本机模式文件不存在,跳过(只扫通用模式):$PII_EXTRA_FILE"
fi
# vendor/ 是逐字节自托管的第三方库(SEC-L5):supabase-js 里有「新版密钥前缀」判断这种字面量,会撞上下面的 PII 模式,但不是我们的密钥。
#   它不进 PII 扫描,换成下面的「vendor 完整性」门:每个文件反做一遍改写后必须等于 jsDelivr 原文的 sha256 —— 一个字节都改不了,
#   也就塞不进任何 PII。⛔ 只排除 vendor/ 这一个目录,别的照扫。
# 逐行先删掉白名单地址和 example.com/.org/.net 占位地址,再匹配一遍;同一行里别的命中照样红。
pii=$(grep -rnE "$PII_RE" --exclude-dir=.git --exclude-dir=vendor . | awk -v a="$PII_ALLOW" '{ l=$0; while ((i=index(l,a))>0) l=substr(l,1,i-1) substr(l,i+length(a)); print l }' | sed -E 's/[A-Za-z0-9._%+-]+@example\.(com|org|net)//g' | grep -E "$PII_RE" | grep -vE '^\./tools/copy-lint\.sh:[0-9]+:PII_RE=')   # 只放过本脚本定义模式的那一行
if [ -n "$pii" ]; then
  echo "PII 扫描命中(fail-closed,停):"; echo "$pii" | cut -c1-200
  exit 2
fi
echo "PII 扫描:0 命中(白名单:$PII_ALLOW)"

# ── vendor 完整性(SEC-L5,fail-closed:不过就退 2)────────────────────────────────
# vendor/SOURCES.txt 每行:文件 / 来源 URL / 原始 sha256 / 落盘 sha256。校验:①落盘 sha256 对得上;②去掉文件头注释、
# 把同目录相对引用(./xxx.mjs)换回 jsDelivr 的 /npm/…/+esm 之后,sha256 = 原始 sha256;③目录里没有清单外的文件。
if [ -d vendor ]; then
  vend=$(python3 - <<'PY'
import hashlib, os, re
rows = [l.rstrip("\n").split("\t") for l in open("vendor/SOURCES.txt", encoding="utf-8") if l.strip() and not l.startswith("#")]
back = {r[0]: r[1].replace("https://cdn.jsdelivr.net", "") for r in rows}
errs = []
for name, url, orig, final in rows:
    b = open("vendor/" + name, "rb").read()
    if hashlib.sha256(b).hexdigest() != final: errs.append(f"{name}: 落盘 sha256 对不上")
    s = b.decode("utf-8")
    i = s.find(" */\n")
    if not s.startswith("/* SEC-L5") or i < 0: errs.append(f"{name}: 没有 SEC-L5 文件头"); continue
    body = re.sub(r'"\./([^"/]+\.mjs)"', lambda m: '"' + back.get(m.group(1), "??" + m.group(1)) + '"', s[i + 4:])
    if hashlib.sha256(body.encode("utf-8")).hexdigest() != orig: errs.append(f"{name}: 反做改写后 ≠ jsDelivr 原文 sha256")
extra = sorted(set(os.listdir("vendor")) - set(back) - {"SOURCES.txt"})
if extra: errs.append("清单外的文件:" + ", ".join(extra))
print("\n".join(errs))
PY
)
  if [ -n "$vend" ]; then echo "vendor 完整性不过(fail-closed,停):"; echo "$vend"; exit 2; fi
  echo "vendor 完整性:$(grep -vc '^#' vendor/SOURCES.txt) 个文件与 jsDelivr 原文一致"
fi

# ── 隐私承诺禁句(2026-10-02 FIX2-D):代码已经证伪的绝对说法,**含法律页**全站拦 ──
# 事实(以 App 代码为准):登录后没填自己的 Key 时,整理 / 翻译 / 随心问 / 口述编辑的
# 文字经我们的服务器转给大模型;服务器还管额度、用量上报、识别通行证;本机识别时
# 只是**音频**不出电脑;换档在主窗口「模型」页,菜单里没有。
# 只看用户看得见的字:先剥掉 HTML 注释(下架的定价段整段在注释里)再匹配。
banned_claims=$(python3 - <<'PY'
import glob, re
PATS = [
    r"只管账号", r"只处理账号", r"只处理「你是谁」", r"只认识「你是谁」",
    r"永远不知道.{0,3}你说了什么", r"什么都不出(这台)?电脑", r"不经手你的音频和文字",
    r"一个字都不会上传", r"只连你(配置|选)的服务商", r"任何第三方统计脚本",
    r"在菜单里(点一下就能)?换(一)?档",
    r"only handles? accounts", r"accounts and billing only", r"never know what you said",
    r"nothing leaves (the|this) computer", r"connects only to the providers",
    r"no third-party analytics script", r"(one click|another one) in the menu",
    r"Pro has no limit on length",
]
hits = []
for p in sorted(glob.glob("**/*.html", recursive=True)):
    raw = re.sub(r"<!--.*?-->", "", open(p, encoding="utf-8").read(), flags=re.S)
    for n, line in enumerate(raw.splitlines(), 1):
        for pat in PATS:
            if re.search(pat, line, re.I):
                hits.append(f"{p}: 「{re.search(pat, line, re.I).group(0)}」 {line.strip()[:120]}")
print("\n".join(hits))
PY
)
if [ -n "$banned_claims" ]; then
  echo "隐私承诺禁句命中(代码已证伪的说法):"; echo "$banned_claims"
  exit 1
fi
echo "隐私承诺禁句:0 命中"

exec python3 - "$@" <<'PY'
import sys, re, glob, os, html.parser

VERBOSE = "-v" in sys.argv[1:]
LEGAL = {"privacy.html", "tos.html"}
MAX_ZH = 50     # SITE-V3:45 → 50。round2 定稿「数据在哪」一节「登录后,把你说的话转成文字…处理完回到你这里。」48 字,Wei 10-13 认可
MAX_HEAD = 16   # SITE-V3:10 → 16。round2 定稿标题「录音和历史,存在你自己的设备上。」15 字
VENDORS = re.compile(r"Soniox|DeepSeek|AssemblyAI|Supabase|OpenRouter|Resend|Cloudflare|Turnstile|阿里云|Alibaba|Qwen|通义", re.I)
HOME_BANNED = {True: ["本机", "云端", "名额", "随心问", "口述编辑"], False: ["on-device", "cloud", "seat"]}
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
    def __init__(self, base=""):
        super().__init__(convert_charrefs=True)
        self.blocks, self.cur, self.skip, self.scripts, self.lang = [], [], None, [], ""
        self.base, self.srcs = base, []
    def flush(self):
        t = re.sub(r"\s+", " ", "".join(self.cur)).strip()
        if t: self.blocks.append(t)
        self.cur = []
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "html": self.lang = a.get("lang", "")
        if tag in ("script", "style"):
            # SEC-L5:页面脚本搬成了外链文件(CSP 不放 unsafe-inline)。本站的 <script src> 一起读进来查,
            # 否则搬出去的文案会悄悄不再被查。外站(http / //)不读。
            src = a.get("src") if tag == "script" else None
            if src and not re.match(r"^(https?:)?//", src):
                path = os.path.normpath(os.path.join(self.base, src))
                self.scripts.append(open(path, encoding="utf-8").read()); self.srcs.append(path)
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
    pg = Page(os.path.dirname(p)); pg.feed(raw); pg.flush()
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
    banned += sorted(set(m.group(0) for m in VENDORS.finditer(text)))
    if p in ("index.html", "en/index.html"):
        page_text = "\n".join(pg.blocks)          # 只查页面正文,不查外链脚本(capsule.js 的模式名照 App)
        banned += [b for b in HOME_BANNED[zh] if re.search(re.escape(b), page_text, re.I)]
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
    if pg.srcs: print(f"    外链脚本也查了: {', '.join(pg.srcs)}")
    if longhead: print(f"    最长小标题: {longhead}")
    if VERBOSE:
        for c, s in sents[1:5]: print(f"    {c:>3}: {s[:90]}")
    if dash:
        for s in segs:
            if ("——" if zh else "—") in s: print(f"    带破折号: {s[:90]}")
for p in ("privacy.html", "tos.html", "en/privacy.html", "en/tos.html"):
    raw = re.sub(r"<!--.*?-->", "", open(p, encoding="utf-8").read(), flags=re.S)
    hit = sorted(set(m.group(0) for m in VENDORS.finditer(re.sub(r"<[^>]+>", " ", raw))))
    print(f"{p:<22}服务商名字:{','.join(hit) or '0'}  {'FAIL' if hit else 'ok'}")
    bad |= bool(hit)
print("copy-lint:", "FAIL" if bad else "PASS")
sys.exit(1 if bad else 0)
PY
