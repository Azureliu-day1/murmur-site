/* ── 样稿的假数据(MEMBER-MOCK)。⛔ 不接后端,⛔ 上线前删。──────────────────────
   形状照订阅契约里的 /me(plan / usage / upgrade)+ pricing 节 portal_url,
   上线时这一份换成真 /me 的回包,渲染代码不用改结构。
   方向与状态从 URL 读(?dir=a|b&state=out|free|pro);首页截图时由注入脚本先设
   window.__memberMock = { dir, state },URL 参数不在首页上。

   ⚠️ 两处和 CONTRACT.md(2026-10-09)对不上,样稿按简报的事实写,已在报告里列出:
   ① 免费档:简报 = 每周 2000 字 + 长录音终身试一次 3 分钟;契约 = 一次性 1200 秒、听写与长录音共用。
   ② /me.usage 只有一组秒数;简报的 Pro 是「听写不限 + 长录音 20 小时」,要两组计量或一个 kind 字段。 */
(function () {
  "use strict";
  var q = new URLSearchParams(location.search);
  var pre = window.__memberMock || {};
  var dir = (pre.dir || q.get("dir") || "a").toLowerCase() === "b" ? "b" : "a";
  var st = (pre.state || q.get("state") || "out").toLowerCase();
  if (st !== "free" && st !== "pro") st = "out";

  // 价格占位(待定)。真值从 /pricing.json 的 price_display 读。
  var PRICE = {
    pro: { month: "$12.5", year: "$120", yearPerMonth: "$10" },
    max: { month: "$29", year: "$276", yearPerMonth: "$23" },
  };

  var ME = {
    out: null,
    free: {
      email: "user@example.com",
      plan: "free",
      // 听写:每周 2000 字(字数,按周)
      dictation: { unit: "chars", used: 1240, limit: 2000, period: "week" },
      // 长录音:终身试一次,最长 3 分钟
      lecture: { unit: "trial", used: false, maxMinutes: 3 },
    },
    pro: {
      email: "user@example.com",
      plan: "pro",
      interval: "month",
      period_end: "2026-11-18",          // = /me.usage.period_end
      next_charge: { date: "2026-11-18", amount: PRICE.pro.month },
      dictation: { unit: "chars", used: null, limit: null },     // 不限
      lecture: { unit: "hours", used: 6.5, limit: 20 },
    },
  };

  window.MemberMock = {
    dir: dir,
    state: st,
    me: ME[st],
    price: PRICE,
    portalUrl: "#portal",   // = pricing.portal_url(Stripe Customer Portal);样稿里不跳
  };
})();
