# murmur-site

Murmur 的公开站点(GitHub Pages)。

- `index.html` — 介绍 + 定价 + 订阅入口
- `thanks/` — Stripe 付款成功后的落地页,把人送回 App(`murmur://upgraded`)

源在主仓库 `docs/site/`,这里是发布副本。

**收款链接只有一处**:`index.html` 底部的 `PAY_LINK`。
现在指向 Stripe 沙盒(链接含 `/test_`),页面会自己挂「沙盒测试中」标记。
换成正式链接时改那一行,并删掉 `<meta name="robots" content="noindex">`。
