#!/usr/bin/env python3
"""首屏标题常量(SITE-V3,2026-10-13)。

标题和副标题只在 tools/hero-title.json 里写一次;这个脚本把它铺到全站的每个落点:
  中英首页:<h1 data-hero-title>、<p data-hero-lede>、<title>、meta description、og:title、og:description
  全站各页:og:image:alt(描述分享图,分享图上印的就是这句标题)
分享图本身(og.png / og-en.png)由 tools/og/render.sh 按同一份 JSON 重出。

用法:python3 tools/set-hero-title.py           改写全部落点(只改工作区,不 add / commit)
      python3 tools/set-hero-title.py --check   只核对;有一处和常量不一致就列出来并退 1(copy-lint 调它)
"""
import glob, html, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
C = json.load(open('tools/hero-title.json', encoding='utf-8'))
check = '--check' in sys.argv

def parts(lang):
    t, l = C[lang]['title'], C[lang]['lede']
    sep = '' if lang == 'zh' else ' '
    # 「|」两边有拉丁字母或数字时(如「符合你的|AI」),连成一行要补一个空格;两边都是中文就直接接上
    # 页面里换成「(空格)<br>」:窄屏把 <br> 藏起来时,英文词之间也不会粘在一起
    def join(s, br=''):
        def rep(m):
            a, b = m.group(1), m.group(2)
            return a + (' ' if lang == 'en' or a.isascii() or b.isascii() else '') + br + b
        return re.sub(r'(.)\|(.)', rep, s)
    plain_t, plain_l = join(t), join(l)
    return {
        'h1': join(t, '<br>'),
        'lede': join(l, '<br>'),
        'title': 'Murmur · ' + plain_t.rstrip('。.'),
        'desc': plain_t + sep + plain_l,
    }

# (正则, 换成什么) —— 每条在页面里必须恰好命中一次
def page_rules(p):
    e = lambda s: html.escape(s, quote=True)
    return [
        (r'(<h1 class="reveal" data-hero-title>).*?(</h1>)', r'\g<1>' + p['h1'] + r'\g<2>'),
        (r'(<p class="lede reveal" data-hero-lede>).*?(</p>)', r'\g<1>' + p['lede'] + r'\g<2>'),
        (r'(<title>).*?(</title>)', r'\g<1>' + e(p['title']) + r'\g<2>'),
        (r'(<meta name="description" content=")[^"]*(">)', r'\g<1>' + e(p['desc']) + r'\g<2>'),
        (r'(<meta property="og:title" content=")[^"]*(">)', r'\g<1>' + e(p['title']) + r'\g<2>'),
        (r'(<meta property="og:description" content=")[^"]*(">)', r'\g<1>' + e(p['desc']) + r'\g<2>'),
    ]

bad, changed = [], []   # changed 去重见末尾
def apply(path, rules):
    s = open(path, encoding='utf-8').read()
    new = s
    for pat, rep in rules:
        new, n = re.subn(pat, lambda m, rep=rep: m.expand(rep), new, count=0, flags=re.S)
        if n != 1:
            bad.append(f'{path}: 「{pat[:40]}」命中 {n} 次(应为 1)')
    if new != s:
        if path not in changed: changed.append(path)
        if not check:
            open(path, 'w', encoding='utf-8').write(new)

for lang, home in (('zh', 'index.html'), ('en', 'en/index.html')):
    apply(home, page_rules(parts(lang)))

alt = {lang: parts(lang)['title'] for lang in ('zh', 'en')}
for path in sorted(glob.glob('**/*.html', recursive=True)):
    if path.startswith(('vendor/', 'tools/', 'docs/')):
        continue
    s = open(path, encoding='utf-8').read()
    if 'og:image:alt' not in s:
        continue
    lang = 'en' if path.startswith('en/') else 'zh'
    apply(path, [(r'(<meta property="og:image:alt" content=")[^"]*(">)', r'\g<1>' + html.escape(alt[lang], quote=True) + r'\g<2>')])

if bad:
    print('首屏标题常量:落点不对'); print('\n'.join(bad)); sys.exit(2)
if check:
    if changed:
        print('首屏标题常量:这几页和 tools/hero-title.json 不一致(跑 python3 tools/set-hero-title.py):')
        print('\n'.join('  ' + c for c in changed)); sys.exit(1)
    print('首屏标题常量:全站一致(%s / %s)' % (alt['zh'], alt['en']))
else:
    print('改了 %d 个文件:' % len(changed)); print('\n'.join('  ' + c for c in changed))
    print('分享图要重出:tools/og/render.sh')
