# 候选窗真图
- 来源:murmur-ime 仓 `c91c4242`(2026-09-26 13:54 +1000),`.build/debug/Murmur` 离屏 ImageRenderer 出图,取 `build/ime-shots/<样例>-dark-simulated-bg@2x.png`(long-candidates 由 1204 px `sips -Z 1200` 缩到 1200 px)。
- 命令:`HOME=$(mktemp -d) MURMUR_STORE=memory MURMUR_SELFTEST=1 MURMUR_IME_SHOT=1 ./.build/debug/Murmur -AppleLanguages '(zh-Hans)'`(en 目录换 `'(en)'`),工作目录 = 仓库根。
- 日期:2026-09-26;语言:`zh/` 中文界面,`en/` 英文界面(两种语言逐字节相同)。原先的 nextwords-personal 已于 2026-10-18 删掉:它画的是方案 A 之前的联想行(1 号高亮、「空格接1」),指南里换成 HTML/CSS 画的示意。

# 首页真截图(录音条 + 新手引导两张)

- 来源:murmur-ime 主树离屏出图(`build/Murmur.app`,2026-09-26 00:05 构建;三线审视 B 的截图集 `hud-short-*`、`onboarding-welcome-*`、`onboarding-done-*`)。录音条裁到胶囊区域 716×230;引导两张从 1800 宽缩到 900 宽。全部去掉元数据块(只剩 IHDR/IDAT/IEND)。
- 文字内容是自检样例与引导文案,不含邮箱、账号、密钥、个人信息(逐张看过)。暗色两张引导右上角是「已登录」,浅色是「登录」:出图时的状态不同,不是个人信息。
- 引导两张只有 0.53 才有,所以只在 release-0.53 分支上;main(0.52.3)只放录音条。

| 文件 | alt(中) | alt(英,给 en 页) |
|---|---|---|
| `zh/hud-{light,dark}.png` | Murmur 录音条截图。底部胶囊有取消键、波形、计时 0:08 和打勾键,上方是正在出的字:好,我看一下。 | Murmur recording bar. A capsule at the bottom of the screen with a cancel button, a waveform, a 0:08 timer and a check button; above it, the words appearing as you speak. |
| `zh/welcome-{light,dark}.png` | Murmur 新手引导第一页截图。标题:对着电脑说话,出来的是整理好的文字。下面列出听写、翻译、口述编辑三个键,和识别语言。 | Murmur onboarding, first page: "Talk to your computer. What comes out is clean text." Lists the three keys (dictate, translate, voice edit) and the recognition language. |
| `zh/done-{light,dark}.png` | Murmur 新手引导最后一页截图。标题:可以开工了。下面是快捷键速查:右 ⌘ 听写,右 ⌥ 翻译,右 ⌃ 口述编辑,Esc 取消。 | Murmur onboarding, last page: "Ready to work." Key cheat sheet: Right ⌘ dictate, Right ⌥ translate, Right ⌃ voice edit, Esc cancel. |

# 0.53 新手引导与设置页真截图(2026-10-01 换)

- 来源:murmur-ime worktree `ob-int`(builder INT,2026-10-01)离屏出图,原图在审计目录 `onboarding-site/INT/site-shots/`。
- 处理:引导两张从 1800 宽缩到 900 宽;设置卡按卡片边界自动裁(脚本在审计目录 `W2/`),缩到 900 宽;全部重存为只含 IHDR/IDAT/IEND 的 PNG,单张 ≤ 300 KB。
- 文字是出图样例,不含邮箱、账号、密钥、个人信息(逐张看过;场景卡的前台 App「Mail」是出图样例)。
- 系统选择框(拼音方式、候选字号、强调色、候选排列)离屏出图画不出,所以模糊音只截下半栏、候选窗外观只截预览。
- 英文只有浅色:en 页的这几张不带深色 source。ime-look 预览里没有界面字,en 页直接用 zh 的浅深两张。

| 文件 | 用在 |
|---|---|
| `zh/welcome-{light,dark}.png` `zh/done-{light,dark}.png` | 首页收尾(换成 0.53 的新版引导:第一页先学右 ⌘,最后一页多了「功能一览」) |
| `en/welcome-light.png` `en/done-light.png` | 英文首页收尾 |
| `zh/settings-ime-fuzzy-*` `en/settings-ime-fuzzy-light` | 指南 #fuzzy |
| `zh/settings-ime-smart-*` `en/settings-ime-smart-light` | 指南 #smart |
| `zh/ime-look-{light,dark}.png` | 指南 #look(中英两页共用) |
| `zh/settings-scene-on-*` `en/settings-scene-on-light` | 指南 #scene |
