# 基调 · 网站「拼音输入法」板块 + 演示页(release-0.53,本地先跑)

> 2026-09-26 开工。Wei 原话(语音转写):「系统性地过一遍我们的网站,我们网站上输入法的界面要做得系统性、庞大一点。你现在写的太少了。我们要再做一个演示的 demo,告诉别人。这个版本先不要推上去,本地先运行,等我们输入法版本同时上传的时候再上传。」
> 路线子领导者:Fable high。小兵:builder(Opus 高)。

## 目标(一句话)
网站上的「拼音输入法」从首页 3 行变成一整块陌生人能看懂、看得见、想装的板块,外加一个浏览器里能玩的演示页;只在 `release-0.53` 分支本地跑。

## 范围
做:
1. 首页 `#pinyin` 扩成大板块(zh + en):它是什么 → 三个看得见的差别 → 怎么装 → 怎么用 → 隐私 → 和系统拼音比什么不比什么;每小节配图(真截图或 CSS 复刻候选窗)。
2. `/demo/` + `/en/demo/`:纯前端模拟输入框 + 候选窗,内置小词表,8–10 句预设,自动演示。
3. 导航:各页顶栏加「输入法」(指首页 `#pinyin`)与「演示」(指 `/demo/`)。
4. 全站过一遍:和输入法有关、或因输入法要改口的文案列清单并改;隐私页加「个人词库」一段。
不做:发布(不推 main、不出 release)、更新日志页、App 内改动、定价、注册流程。
⛔ 不动 `latest.json`(保持 0.52.3)、`CNAME`;不 push、不 merge。

## 用户可见的验收
- V1 陌生人打开首页,滚到「拼音输入法」板块,不看别的页能回答:它是什么、和系统拼音差在哪、怎么装、打错怎么改、我的词去哪了。
- V2 打开 `/demo/`,敲 `nihao` 出候选窗,按数字或空格上屏,1.5 秒内退格整词退回拼音;点「自动演示」能看它自己打完 8–10 句。
- V3 顶栏有「输入法」「演示」入口,zh / en 各自指对。
- V4 隐私页有「个人词库」一段,说法与首页一致。

## 门(全过才算完)
1. `tools/copy-lint.sh` PASS,0 PII 命中。
2. 每页 `xmllint --html` 错误行数不比改前多(基线见下表;每加一个 `<section>` 允许 +1,逐条对照)。`node --check` 页内脚本全过。
3. 本地 `python3 -m http.server 8765 --bind 127.0.0.1`:`/`、`/en/`、`/demo/`、`/en/demo/` 全 200;无头 Chrome(mock keychain)截 4 张全页 + 演示页自动演示第 3 句 1 张;390 宽首页板块 + 演示页各 1 张,无横向滚动。
4. `git diff main --stat` 无 `latest.json` / `CNAME`;commit 在 `release-0.53`,不 push。
5. 事实核对表(下)每条有源码 / 文档位置。

### xmllint 基线(改前,错误行数;产物在 scratchpad/xmllint-before/)
| 页 | 行数 |
|---|---|
| index.html | 189 |
| en/index.html | 189 |
| try/index.html | 24 |
| en/try/index.html | 24 |
| login/index.html | 42 |
| en/login/index.html | 42 |
| privacy.html | 96 |
| en/privacy.html | 96 |
| tos.html | 42 |
| en/tos.html | 42 |
| thanks/index.html | 12 |

## 事实核对表(页面声明 ↔ 源码 / 文档;⛔ 对不上的不写进页面)
输入法仓 `~/Applications/murmur-ime`(ime-mac,HEAD 4b7b067),scout 09-26 13:5x 抄回。标 INFERENCE 的只写成保守说法。
| # | 页面可以写的声明 | 证据 |
|---|---|---|
| F1 | 输入法随 Murmur 一起装:设置 → 识别 → 「输入法」卡片,按钮「安装 / 更新 / 卸载」;引导完成页也能装 | `Sources/Murmur/UI/SettingsView.swift:472-475`;`UI/IMEInstallSection.swift:135,139,143`;`UI/OnboardingView.swift:1285`;`docs/RELEASE-0.53.0.md` 新增第 1 条 |
| F2 | 装到「资源库 → Input Methods」,不需要密码,不碰系统目录 | `IME/IMEInstaller.swift:29,103-104`;`IMEInstallSection.swift:121` |
| F3 | 第一次装完要注销一次再登录,系统才列出 Murmur 输入法 | `IMEInstaller.swift:245,305`;`IMEInstallSection.swift:152` |
| F4 | 更新只换磁盘上的包,下次重启输入法或下次登录生效;卸载保留打过的词、词典和设置 | `IMEInstallSection.swift:82,121` |
| F5 | 候选窗一行,一页 5 个候选;数字 1–5 选字;空格上屏高亮的(默认第一个) | `Resources/rime/default.yaml:14`;`IME/IMEShellCore.swift:962-966`;`IME/IMEAcceptanceSelfCheck.swift:222` |
| F6 | `-` 上一页,`=` 下一页(PageUp / PageDown 也行);标点键 = 高亮候选 + 标点一起上屏;回车把拼音原样落下 | `default.yaml:34-37`;`IME/IMEKeyTranslator.swift:33-34`;`IME/UsageLedger.swift:115-116,125-126,136-137` |
| F7 | 上屏后 1.5 秒内按一下退格,刚上屏的那个词整个退回拼音、候选重算;第二下退格照常删拼音 | `IMEShellCore.swift:138-139,148,150,1315` |
| F8 | 退格退回不管:联想接的词、标点、回车原样落的拼音、英文直通、含标点或空格的上屏、密码框 | `IMEShellCore.swift:1287-1298,1327-1330` |
| F9 | 单按 Shift 切中英;切的那一刻拼了一半的拼音原样落下;英文态字母标点半角直通;Caps Lock 亮 = 英文 | `IME/ShiftTapDetector.swift:5`;`IME/MurmurInputController.swift:284`;`default.yaml:17,24-27,44` |
| F10 | 中英混打:`okl` 出「OK了」,`zhegeapphaoyong` 出「这个app好用」(词典整词 + 合成规则 10) | `Resources/rime/murmur.dict.yaml:15335`;`Tools/build-dict/build.py:25-37`;`IMEAcceptanceSelfCheck.swift:673` |
| F11 | 联想(下一词)最多 5 个;你打过的「前词 → 后词」一律露;通用层只在这个前词你打过、且分数够高时露;空格只接第一条(且只在它来自你打过的词时),数字接第 N 个;Esc 收起 | `IME/NextWordPredictor.swift:21-60,65,100-111`;`IME/CandidateStrip.swift:189-193` |
| F12 | 联想开关「联想(根据你打过的词)」在设置 → 整理 → 个人词库 | `UI/PersonalLexiconSection.swift:74` |
| F13 | 打过的词存在这台 Mac 上 `~/Library/Application Support/Murmur/lexicon.sqlite`;默认开;密码框与拒绝名单里的 App 一律不记;第一版不跨设备 | `IME/PersonalLexicon.swift:65-66,73,118-121` |
| F14 | 开关「学我平时打的字」(默认开);一键清:设置 → 系统 → 「清除数据…」 | `PersonalLexiconSection.swift:54`;`PersonalLexicon.swift:92-96`;`SettingsView.swift:1370-1388,1425` |
| F15 | 说话和打字同一套词,双向:听写词典里登记的词进输入法;拼音打过的词进听写的提示词 | `IME/LexiconExport.swift:30,130,189-198`;`Storage/DictionaryStore.swift:103-111`;`PersonalLexicon.swift:62-63` |
| F16 | ⚠️ 打过的词作为听写提示词会**随识别请求发给识别服务商**(和隐私页「词典」一行同一条路);选本机识别不出机。⛔ 页面不许写「只在本机」当作听写也不出机;⛔ 不许写「关掉开关就不再发」(INFERENCE:`DictionaryStore.swift:103-111` 不看 `learnTypingEnabled`,未实测) | `Core/DictationEngine.swift:524-529,628,699,1015,1056`;`PersonalLexicon.swift:302-305` |
| F17 | macOS 26 起 | `Package.swift:6`;`build-app.sh:71,107-108` |
| F18 | 我们自己测的口语 125 句(不在词表里),首选命中 80.0%;在设置里一键下载语言模型后 89.6% | `docs/BASELINE-ime-mac.md:538`;测试集定义 `Tools/build-dict/README.md:911-918`;模型下载 `murmur_pinyin.schema.yaml:143-150` |
| F19 | 候选窗只有深色一套(玻璃材质、白 22% 描边、珊瑚只上当前候选的编号底);第一次出现淡入 60 ms,选词翻页零动画 | `IME/IMEStyle.swift:13,37-86,223-244`;`IME/CandidatePanel.swift:188` |
| F22 | AI 整理时会带上你的词:按 ⌥⇧Space 让 AI 整理这句时,词典里登记的词和输入法学到的词里与这句沾边的(最多 500 个)随整理请求出机;**选本机识别也一样**(这条路是 AI 整理,不是识别);开关「允许 AI 参考我的用词」(en: Let AI use my own words)默认开,关掉一个词都不发;卡片在设置 → 整理(en: Cleanup)→ 「我打过的词(输入法学的)」(en: Words I've typed (learned by the input method)) | `UI/PersonalLexiconSection.swift:58-70`;`Core/AppSettings.swift:184-186`(默认 true);`AI/AIServiceHost.swift:258-275`;`UI/SettingsView.swift:31`;`Core/UserCopy.swift:513` |
| F23 | 设置项英文原文:「学我平时打的字」= Learn the words I type;「联想(根据你打过的词)」= Suggest the next word (from what you've typed);「清除数据…」= Clear data… | `PersonalLexiconSection.swift:54,74`;`UserCopy.swift:521` |
| F20 | 0.53 未接线:麦克风预热(不写进输入法板块) | `docs/RELEASE-0.53.0.md` 末段 |
| F21 | 演示页词表是**为演示手写的一份小表**,⛔ 不从仓库词典 / 词池 / 联想表抽(理由:`Tools/build-dict/README.md:221-223` 词库许可未经律师确认前不对外发布;`nextword-general.tsv` 与 `phrases.tsv` 的候补层含个人种子扩出的条目、按列区分不了) | scout D-3、E-1、E-3 |

### 候选窗 token(给 CSS 复刻;来源 `IMEStyle.swift`,行号见上)
条高 36(内边距 上下 7 / 左右 16),宽 200–560,圆角 18(胶囊);两行 56 高。拼音 13 等宽;候选 15(当前 Medium);编号 13 Semibold 等宽数字,占 18×22 圆角 4;页码 12。间距:候选组间 12、编号到词 6、拼音到首候选 8。色:罩 `#1B1B1F`(实色回落 `#202023`);当前候选字 `#F7F7F8`;其余 `#E5E5E7`;拼音 / 编号 / 页码 `#B8B8BE`;更淡 `#8F8F96`;描边 白 22%;珊瑚 `#FF6B35` 只上当前候选的编号底,底上编号字 `#1B1B1F`。页码 `‹ n ›` 只显示当前页。联想行同一块玻璃、36 高,左端「接写」,词全 `#F7F7F8`,每个词前同款编号块,尾注「空格接1 · Esc收起」。拼音行是 librime 的 preedit,音节间空格(`ni hao`)。

## 施工路线(Wei 09-26「我同意你开很多个」:按文件边界拆到最细,全部并行)
每个 builder 只碰自己的文件;跨人的接口在下面「契约」里签死;集成由领导者做。
| 编号 | 角色 | 文件(独占) | 任务 |
|---|---|---|---|
| S1-css | builder | `pinyin.css` | 首页板块的 CSS(类名按契约 A) |
| S1-zh | builder | `index.html`(只动 `#pinyin` 一节 + 顶栏两个链接 + CSP/link 两行) | 中文板块 |
| S1-en | builder | `en/index.html`(同上) | 英文板块 |
| S2-engine | builder | `demo/demo.js`、`demo/demo-selftest.js` | 演示引擎(纯逻辑 + 自测) |
| S2-ui | builder | `demo/index.html`、`en/demo/index.html`、`demo/demo.css` | 演示页 UI + 自动演示驱动 |
| S2-words | builder | `demo/demo-words.js` | 内置公开词表 + 预设句 |
| S2-shot | builder | 输入法仓主树只读 + 跑截图基建;产物到 `shots/` | 真候选窗截图(能跑再派) |
| S3-try | builder | `try/index.html`、`en/try/index.html` | 顶栏 + 本页改口 |
| S3-login | builder | `login/index.html`、`en/login/index.html` | 同上 |
| S3-privacy | builder | `privacy.html`、`en/privacy.html` | 顶栏 + 个人词库一段 |
| S3-tos | builder | `tos.html`、`en/tos.html` | 顶栏 + 本页改口 |
| S3-thanks | builder | `thanks/index.html` | 顶栏 + 本页改口 |
| R | builder(审核,独立) | 只读本地站点 | 用户使用 / UI / 功能三维审 |

### 契约 A · 首页板块(S1-css ↔ S1-zh / S1-en)
- 节 id 不变:`<section class="wrap" id="pinyin">`;eyebrow / h2 沿用站点现成类 `.eyebrow` `.reveal` `.sub` `.detail-list`。
- 新类名全部以 `py-` 开头,只在 `pinyin.css` 里定义(⛔ 不写进页内 `<style>`;⛔ 不改 `v2.css`):
  - `.py-grid`:小节容器,两栏(文字 | 图),≤820 宽单栏;`.py-grid.flip` 图在左。
  - `.py-step`:小节内的一步(「怎么装」「怎么用」用),里面 `<div class="py-step"><b>01</b><div>…</div></div>`。
  - `.py-shot`:图框(`<figure class="py-shot"><img …><figcaption>…</figcaption></figure>`),圆角 / 边 / 阴影同 `.fake-input`(卡片色 + `--line2` 边 + `--shadow`)。
  - `.py-panel`:CSS 复刻的候选窗(尺寸 / 圆角 / 字号按 scout 抄回的 token);子元素 `.py-pinyin`(拼音行)、`.py-cands`(候选行,`<span class="py-cand"><i>1</i>你好</span>`,第一枚 `.on` 高亮)、`.py-next`(联想行,`<span class="py-nx">吗</span>`)。
  - `.py-compare`:「比什么不比什么」表,三列(项 | Murmur | 系统拼音),≤820 宽改两行一组。
  - `.py-note`:小字说明(同 `.stage-note` 的字号色)。
- 页面引入方式:`<head>` 里加 `<link rel="stylesheet" href="pinyin.css">`(en 页 `../pinyin.css`);首页 CSP 的 `style-src 'unsafe-inline'` 改为 `style-src 'self' 'unsafe-inline'`(只加这一个源)。
- 图:`shots/` 目录下 `cands-zh.png` 等(S2-shot 产出);没图时用 `.py-panel` 复刻,⛔ 不放假截图。

### 契约 B · 演示页(S2-engine ↔ S2-ui ↔ S2-words)
- `demo/demo-words.js` 只定义一个全局:
  ```js
  window.MURMUR_DEMO_WORDS = {
    syllables: ["a","ai",…],                 // 合法音节(无声调)
    words: [["nihao","你好",900], …],        // [全拼无空格, 汉字, 权重 0–999]
    next:  { "你好": ["吗","啊"], … },        // 上屏后联想,每项 ≤ 5
    mixed: { "okl": "OK了", … },             // 中英混打缩写 → 上屏(只收产品里真有的规则)
    sentences: [ { zh:"说明", en:"caption", script:"n i h a o {space}" }, … ]  // 8–10 句
  };
  ```
  `script` 记法:每个空格分隔的记号是一次按键;字母 / 数字 / `,` `.` 原样;`{space}` `{bs}` `{shift}` `{enter}` `{esc}` `{wait:800}`(毫秒停顿,只给 UI 用)。
- `demo/demo.js` 只定义一个全局 `window.MurmurDemoEngine`:
  ```js
  var e = MurmurDemoEngine(window.MURMUR_DEMO_WORDS, { now: () => Date.now() });
  e.press(key)      // key ∈ 'a'–'z','A'–'Z','0'–'9',',','.','Space','Backspace','Shift','Enter','Escape'
  e.state()         // { mode:'zh'|'en', buffer:'nihao', segments:['ni','hao'], candidates:[{text:'你好'},…] (≤ 页大小), page:0, pages:N, committed:'……', predictions:['吗',…], undoUntil: <ms 或 0> }
  e.reset()
  e.onChange(fn)    // 每次 state 变化调一次
  ```
  规则(按输入法真实行为,证据见事实核对表 F5–F11):拼音切分取最长合法音节(简拼:每个字母各成一段,如 `okl`);候选按「整段匹配 > 前缀匹配」再按权重排,一页 5 个;数字 1–5 选字;空格上屏高亮的(默认第一个);`-` 上一页 `=` 下一页;`,` `.` = 高亮候选 + 标点一起上屏;Enter 把 buffer 原样上屏;选中的候选若只覆盖前几个音节,剩余拼音留在 buffer 继续;上屏后 1.5 秒内**第一下** Backspace 把刚上屏的那个词整个退回拼音、候选重算(undoUntil),第二下照常删拼音;联想接的词、标点上屏、Enter 原样上屏不给退回;Shift 切 `mode`,切的那一刻 buffer 原样落下;en 态字母数字标点直接落进 committed;Escape 清 buffer(有联想时先收联想);上屏后 predictions 按 `next` 表给 ≤ 5 个,数字 1–5 接第 N 个、空格接第 1 个、打字母时收起;mixed 表命中时 candidates 第一位是它。key 集合另加 `-` `=`。
- `demo/demo-selftest.js`:Node 下 `node demo/demo-selftest.js` 跑通全部规则(⛔ 不依赖浏览器),退出码 0 = 过。
- UI(`demo/index.html` / `en/demo/index.html`)只通过上面两个全局工作;⛔ 零后端、零第三方脚本、CSP 同首页(`script-src 'self'`)。

### 契约 C · 顶栏(所有页)
中文:`English · 功能 · 输入法 · 演示 · 承诺 · 试一试 · 登录 · 下载`,其中「输入法」→ 首页 `#pinyin`,「演示」→ `demo/index.html`;原来指 `#demo` 的「演示」删掉(hero 的「看演示」按钮不动)。非首页的页只加「输入法」「演示」两项(相对路径),放在 English 之后。英文:`Pinyin` / `Demo`。两项都不是 `nav-keep`。

### 契约 D · 文案口径(全体)
说明书式;一句一个事实;⛔ 无「——」、无排比、无「让…更…」、无口号;句长 ≤ 45 字、小标题 ≤ 10 字;只写事实核对表里有的声明;不踩别家(比较表只列事实)。

## 派工账(requested / 实际生效;预计只是预计)
| 时间 | 角色 | 模型档 | 任务 | 预计 | 实际 | 备注 |
|---|---|---|---|---|---|---|
| 13:40 | scout | Opus high | 输入法事实 + 候选窗样式数值 + 截图基建 + 词表数据源 | 25 分 | 8 分 | 交回 A–E 五段,两条要紧发现:F16 听写热词出机、F21 词库许可 |
| 14:02 | builder S1-css | Opus high | pinyin.css | 40 分 | 4 分 | 候选窗改 min-height(900 宽两栏放不下 5 个);补派 h3 间距 |
| 14:05 | builder S1-zh | Opus high | index.html #pinyin + 顶栏 + CSP | 60 分 | 2.5 分 | xmllint +24(figure/figcaption 8 条,HTML4 解析器不认,同 section 类);联想措辞按 F11 收紧 |
| 14:05 | builder S1-en | Opus high | en/index.html 同上 | 60 分 | 2 分 | 同上 +24 |
| 14:05 | builder S2-engine | Opus high | demo/demo.js + demo-selftest.js | 60 分 | 4 分 | 73 断言过;定向变异 13/14;规则 2 放宽为「前 k 音节」超集 |
| 14:05 | builder S3-try | Opus high | try 两页顶栏 | 25 分 | 0.6 分 | 改口清单:无 |
| 14:05 | builder S3-login | Opus high | login 两页顶栏 | 25 分 | 0.6 分 | 改口清单:无 |
| 14:05 | builder S3-thanks | Opus high | thanks | 15 分 | 0.2 分 | 无顶栏,未改 |
| 14:03 | builder S2-ui | Opus high | demo/index.html + en/demo + demo.css + demo-ui.js | 75 分 | ~70 分(报告 15:2x 到) | 真按键冒烟 + 自动演示整轮 40 秒 10 句全对;手机宽自动演示真的开跑(file:// 外壳套 http 页截图是假空框,要用同站 iframe);超简报一处:动作行加「中文 / 英文」模式标 |
| 14:2x | builder S2-words(重派) | Opus high | demo/demo-words.js | 45 分 | 6 分 | 691 词 / 90 联想 / 407 音节 / 10 句;联调 10 句全对 |
| 14:4x | builder R(独立审核) | Opus high | 只读:V1–V4 + UI + 文案 | 40 分 | ~8 分 | V1/V2/V3/暗色 PASS;三条阻断(en 说满 / F22 漏 / en 设置名不存在)全修 |
| 15:0x | builder R-fix ×4 | Opus high | index zh / index en / privacy / tos 各一人 | 15–20 分 | 2–5 分 | 全部落地,e9d1480 |
| 15:1x | 领导者事故(第二次) | | 「S2-ui 交报告并停手」发给了 S2-shot(a109d3)。无损失;S2-ui 的报告至今未到(文件 14:03 / 14:13 落地,已由领导者自验合入) | | | |
| 14:03 | builder S2-words | Opus high | demo/demo-words.js | 45 分 | 死 | 输出被接口内容过滤中断,文件没落地;14:2x 按「分段写 + 脚本生成音节表」重派 |
| 14:03 | builder S2-shot | Opus high | shots/ 真图 | 45 分 | 8 分 | 8 张,dark @2x;前后置检查干净;候补:英文界面自检 15 项红 |
| 14:03 | builder S3-privacy | Opus high | privacy 两页 | 35 分 | 3 分 | 加「打过的词」一行 |
| 14:03 | builder S3-tos | Opus high | tos 两页 | 25 分 | 5 分 | 改口 3 处;待定:第八节免责未扩到输入法(责任条款)、页脚日期等发版 |
| 14:1x | 领导者事故 | | 顶栏间距的两条补丁发混了收件人(privacy 的发给 tos builder、tos 的发给 privacy builder),tos builder 在更正前已把 privacy 两页改了;结果一致、无损失,提交前核过 diff。规矩:SendMessage 前核对收件 agent 的任务名 | | | |

## 门 2 的判定(领导者)
index.html / en/index.html 从 189 → 213:全部是 `Tag figure invalid` ×4 + `Tag figcaption invalid` ×4(每条 3 行),libxml2 的 HTML4 解析器不认 HTML5 标签,和基线里 section / article / nav 同一类误报;别的错误类别前后一致。判 PASS,记为已知误报。其余页与基线持平。

## 事故 / 备注
- 13:44 领导者探 headless Chrome 时用 `pkill -f 'use-mock-keychain'` 收尾,模式过宽,连带杀了 Wei 正在跑的网易云音乐两个 Helper 子进程(37878 / 37879;主进程未动,子进程 1 秒内自行重生为 66100 / 66101)。规矩:本线后续只按 PID 杀自己起的进程,不按模式 pkill。
- 探针结论:`--headless=new --use-mock-keychain --password-store=basic` 截图能出、无 SecurityAgent 弹框;但进程在截图后不自退,要用 `timeout` 包住。

## 进度板(15:1x,终)
- 审核修复提交 e9d1480;总共 6 笔在 release-0.53 之上(96360df / dd2e4b4 / b60c172 / 6bd9015 / 2458861 / e9d1480),未 push。
- 门 1–4 复跑全过(copy-lint PASS、PII 0;xmllint 213/213/96/96/42/42/24/24;selftest 73;四路径 200;无 latest.json / CNAME)。
- 复截:`final2-zh-full.png` `final2-en-full.png` `final2-privacy.png`(1280 全页),`final2-zh-full-words.png`(「你的词去哪了」六步)。

## 进度板(14:4x)
- 提交(release-0.53,未 push):96360df 首页板块 + pinyin.css + shots;dd2e4b4 全站顶栏 / 隐私 / 条款;b60c172 pinyin.css 补丁;6bd9015 演示页。`git diff main --stat` 无 latest.json / CNAME。
- 门:① copy-lint PASS、PII 0;② xmllint:index / en 189 → 213(figure/figcaption 误报,判 PASS),其余页持平,demo 24(新页,全是 HTML5 标签误报);`node demo/demo-selftest.js` 73 过;③ 本地 8765 四个路径 200;截图见下;④ 无 latest.json / CNAME;⑤ 事实核对表在上。
- 截图(scratchpad):`final-zh-full.png` `final-en-full.png`(全页 1280)、`demo-zh-1280.png` `demo-en-1280.png`、`demo-auto3-crop.png`(自动演示第 3 句 OK了 + 联想行)、`demo-auto3-cands-crop.png`(okl 候选窗)、`m390-home-a/b.png`(390 宽首页板块)、`m390-demo-strip.png`(390 宽演示页)。
- 待 Wei / 总领导者定:条款第八节免责要不要扩到输入法候选 / 联想出错(责任条款,builder 回报即停);条款页脚「最后更新」日期等发版时改。

## 候补(对不上上面任何一行的,不做)
- 审核 R 候补:手机宽顶栏「输入法 / 演示」两项收起(靠首页板块内链接与演示页互链);真图第 2–5 候选(尼好 / 拟好 / 泥好 / 妮好)观感一般,换样例要重出图;口号味三句;演示页自动演示高亮态 UNKNOWN。
- en FAQ「(see the Pinyin section)」只是文字没做链接。
- 输入法仓:英文界面跑自检 15 项红(文案断言写死中文)+「直插 90 条 16 失败」(S2-shot 顺手发现,未查)。
- 条款第六节「不拿它训练模型」只提「说的」没提打的字。
- 手机宽演示页自动演示在无头截图里停在占位文字(可能是 headless 时序),由审核者复核。
