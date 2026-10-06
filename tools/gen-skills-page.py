#!/usr/bin/env python3
"""提示词技能页的技能卡 · 从技能 JSON 生成(⛔ 不手抄,免得和 App 漂移)。

读:--src 指向一份技能资源目录,里面要有 extract-prompt.md 与每个技能的 <id>.json:
    · murmur-ime 仓的 Resources/prompt-skills/,或
    · murmur-all 仓的 server/supabase/functions/_shared/prompt-skills/(服务端 /skill 用的那份副本,
      带 SOURCE.json,会把来源 commit 写进生成块的注释)。
写:skills/index.html 与 en/skills/index.html 里 `<!-- gen-skills:begin` 与 `<!-- gen-skills:end -->`
    之间的那一段(两行标记本身保留)。

技能的名单、顺序、分组(编程 / 聊天)取自提取提示词的场景行;名字取 JSON 的 name;
三条做法取 JSON 的 method_steps 第 3–5 条(App 方案 C 附的就是这三条)。
只有「什么时候用」那一句在本文件里(WHEN):它是提示词判定句改写成用户视角的话,JSON 里没有。
新技能进了 JSON 而 WHEN 没有它 → 直接失败,不生成半张表。

用法:
  python3 tools/gen-skills-page.py --src <技能资源目录>           生成并写回两页
  python3 tools/gen-skills-page.py --src <技能资源目录> --check   只比对,两页已是最新才退 0
"""
import argparse, html, json, os, re, sys

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
PAGES = {"zh": "skills/index.html", "en": "en/skills/index.html"}
BEGIN = re.compile(r"(<!-- gen-skills:begin[^\n]*-->\n)(.*?)([ \t]*<!-- gen-skills:end -->)", re.S)
GROUP_LABEL = {"zh": {"code": "编程", "chat": "聊天"}, "en": {"code": "CODING", "chat": "CHAT"}}

# 「什么时候用」:extract-prompt.md 第一步里的判定句,改写成用户视角(zh / en)。
WHEN = {
    "fix_bug":     ("有东西坏了、报错或结果不对,要它修好。",
                    "Something is broken, throws an error or gives the wrong result, and you want it fixed."),
    "new_feature": ("要加一个原来没有的功能、页面、接口或参数。",
                    "You want something that does not exist yet: a feature, a page, an endpoint or an option."),
    "refactor":    ("功能不变,要改写法、改名、拆分、搬家或清理。",
                    "Behaviour stays the same and you want the code rewritten, renamed, split, moved or cleaned up."),
    "explain":     ("想弄懂一段代码、一个报错或一个机制,先不改代码。",
                    "You want to understand some code, an error or a mechanism, without changing anything yet."),
    "review":      ("让它审一段代码或一次改动,挑出问题,不动手改。",
                    "You want a piece of code or a change reviewed for problems, not edited."),
    "plan":        ("还没开始做,先要一份计划和拆好的步骤。",
                    "Nothing is started yet and you want a plan broken into steps first."),
    "tests":       ("给已经写好的代码补测试。",
                    "You want tests added for code that already exists."),
    "research":    ("让它查清楚、调研、比较或总结一个问题。",
                    "You want a question looked into, compared or summed up."),
    "write":       ("让它起草或改写一段文字:邮件、文案、帖子、总结。",
                    "You want a piece of writing drafted or reworked: an email, copy, a post, a summary."),
    "decide":      ("在几个选项里拿不定主意,要它列利弊、给建议。",
                    "You are torn between options and want the pros, the cons and a recommendation."),
    "summarize":   ("把会议记录、聊天记录或一段材料压成要点。",
                    "You want meeting notes, a chat log or other material boiled down to key points."),
    "reply":       ("别人发来一条消息,要它替你写回复。",
                    "Someone sent you a message and you want a reply written for you."),
}


def scene_lines(prompt):
    """和 App 的 PromptSkillLibrary.sceneLines 同一取法:「## 场景行」一节里 `- 编程 / - 聊天 / - 两组` 开头那行的反引号内容。"""
    out, in_sec = {}, False
    for raw in prompt.split("\n"):
        line = raw.strip()
        if line.startswith("## "):
            in_sec = line == "## 场景行"
            continue
        if not in_sec or not line.startswith("- "):
            continue
        parts = line.split("`")
        if len(parts) < 3:
            continue
        for prefix, key in (("- 编程", "code"), ("- 聊天", "chat"), ("- 两组", "both")):
            if line.startswith(prefix):
                out[key] = parts[1]
    return out


def ids_of(line):
    m = re.search(r"[((]([^))]*)[))]", line)
    return re.findall(r"[a-z][a-z_]*", m.group(1)) if m else []


def load(src):
    prompt = open(os.path.join(src, "extract-prompt.md"), encoding="utf-8").read()
    sl = scene_lines(prompt)
    if not all(k in sl for k in ("code", "chat", "both")):
        sys.exit("✖ extract-prompt.md 的场景行不全")
    code, chat, both = ids_of(sl["code"]), ids_of(sl["chat"]), ids_of(sl["both"])
    if sorted(both) != sorted(code + chat):
        sys.exit(f"✖ 场景行对不上:两组 {both} ≠ 编程 {code} + 聊天 {chat}")
    missing = [i for i in both if i not in WHEN]
    if missing:
        sys.exit(f"✖ 这些技能没有「什么时候用」那一句,先补进 WHEN:{missing}")
    order = code + chat
    skills = []
    for sid in order:
        d = json.load(open(os.path.join(src, sid + ".json"), encoding="utf-8"))
        if d.get("id") != sid or len(d.get("method_steps", [])) < 3:
            sys.exit(f"✖ {sid}.json 形状不对")
        skills.append({"id": sid, "group": "code" if sid in code else "chat", "name": d["name"],
                       "steps": d["method_steps"][2:5]})
    commit = ""
    sp = os.path.join(src, "SOURCE.json")
    if os.path.exists(sp):
        commit = json.load(open(sp, encoding="utf-8")).get("commit", "")[:10]
    m = re.search(r"^# version:\s*(\d+)", prompt, re.M)
    return skills, commit, (m.group(1) if m else "?")


def render(skills, lang, commit, version):
    li = 0 if lang == "zh" else 1
    e = lambda s: html.escape(s, quote=True)
    out = [f"  <!-- {len(skills)} 个技能 · 提取提示词 v{version}" + (f" · murmur-ime {commit}" if commit else "") + " -->",
           '  <div class="skills">']
    for s in skills:
        g = s["group"]
        out += [
            f'    <article class="skill" data-skill="{e(s["id"])}">',
            f'      <div class="sk-head"><h3>{e(s["name"][lang])}</h3><span class="sk-group {g}">{GROUP_LABEL[lang][g]}</span></div>',
            f'      <p class="sk-when">{e(WHEN[s["id"]][li])}</p>',
            "      <ol>" + "".join(f"<li>{e(st[lang])}</li>" for st in s["steps"]) + "</ol>",
            "    </article>",
        ]
    out.append("  </div>")
    return "\n".join(out) + "\n"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True)
    ap.add_argument("--check", action="store_true")
    a = ap.parse_args()
    skills, commit, version = load(a.src)
    stale = []
    for lang, rel in PAGES.items():
        p = os.path.join(ROOT, rel)
        page = open(p, encoding="utf-8").read()
        m = BEGIN.search(page)
        if not m:
            sys.exit(f"✖ {rel} 里找不到 gen-skills 标记")
        new = page[:m.start(2)] + render(skills, lang, commit, version) + page[m.end(2):]
        if new != page:
            stale.append(rel)
            if not a.check:
                open(p, "w", encoding="utf-8").write(new)
    if a.check:
        print("✖ 过期:" + ", ".join(stale) if stale else f"✔ 两页已是最新({len(skills)} 个技能)")
        sys.exit(1 if stale else 0)
    print(f"写了 {stale or '无变化'}({len(skills)} 个技能,v{version}{' · ' + commit if commit else ''})")


if __name__ == "__main__":
    main()
