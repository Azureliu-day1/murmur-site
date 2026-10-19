/* ══════════════════════════════════════════════════════════════════════════
   member-nav.js —— 样稿:顶栏的「会员订阅」入口与状态(MEMBER-MOCK,上线前删)
   ══════════════════════════════════════════════════════════════════════════
   改的是现网静态顶栏(和 v2-nav.js 同一个起点),两个方向:
   · A「专区页」:「价格」换成一枚与「下载」并列的描边按钮「会员订阅」;
                  已登录时「登录」换成现有的「账户」胶囊,面板里多一行当前方案。
                  开通了的人,这枚按钮的字换成「Pro 会员」,首页一眼能看到。
   · B「状态条」:已登录时「登录」换成状态胶囊「Pro · 到 11 月 18 日」/「免费 · 开通会员」,
                  点开一个小面板:方案、到期、下次扣费、本期用量、管理、升级。
   纪律照 v2-nav.js:⛔ 零 innerHTML(邮箱、日期都走 textContent);顶栏静态可用,
   没 JS 时就是现网那条顶栏。
   ⚠️ 上线要接的事(样稿不做):首页 CSP 是 connect-src 'none',首页不能问 /me。
      方向 B 的胶囊在首页只能读「上次在会员页 / 试一试页问到的 /me 摘要」(本机缓存),
      缓存过期或没有就退回 A 的样子(只显示「账户」)。
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  var M = window.MemberMock;
  if (!M) return;

  // 会员页地址:相对本脚本解析,首页注入和会员页自己用都对。
  var SELF = (document.currentScript && document.currentScript.src) || location.href;
  var MEMBER_HREF = new URL("index.html", SELF).href;
  var ON_MEMBER = location.pathname.indexOf("/mock/member/") >= 0;
  var keep = (window.__memberMock && window.__memberMock.open) || new URLSearchParams(location.search).get("open") === "1";

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;     // ⛔ textContent,不是 innerHTML
    return n;
  }
  function parts(iso) { var p = iso.split("-"); return { y: +p[0], m: +p[1], d: +p[2] }; }
  function dateLong(iso) { var p = parts(iso); return p.y + " 年 " + p.m + " 月 " + p.d + " 日"; }
  function dateShort(iso) { var p = parts(iso); return p.m + " 月 " + p.d + " 日"; }
  function dateTiny(iso) { var p = parts(iso); return p.m + "/" + p.d; }
  function num(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }

  function meter(label, used, limit, unit) {
    var box = el("div", "mm-meter");
    var top = el("div", "mm-meter-top");
    top.appendChild(el("span", "k", label));
    var v = el("span", "v mono");
    v.textContent = num(used) + " / " + num(limit) + " " + unit;
    top.appendChild(v);
    var bar = el("div", "mm-bar");
    var fill = el("i");
    fill.style.width = Math.min(100, Math.round(used / limit * 100)) + "%";
    bar.appendChild(fill);
    box.appendChild(top); box.appendChild(bar);
    return box;
  }
  function row(k, v) {
    var r = el("div", "mm-row");
    r.appendChild(el("span", "k", k));
    r.appendChild(el("span", "v", v));
    return r;
  }

  function popable(trigger, pop, wrap) {
    function setOpen(open) {
      pop.hidden = !open;
      trigger.setAttribute("aria-expanded", open ? "true" : "false");
    }
    trigger.addEventListener("click", function () { setOpen(pop.hidden); });
    document.addEventListener("click", function (e) { if (!wrap.contains(e.target)) setOpen(false); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !pop.hidden) { setOpen(false); trigger.focus(); }
    });
    if (keep) setOpen(true);
  }

  var links = document.querySelector(".navlinks");
  if (!links) return;
  var cta = links.querySelector(".nav-cta");
  var signin = links.querySelector(".nav-signin");
  var price = links.querySelector(".nav-price") || links.querySelector('a[href$="pricing/index.html"]');
  var me = M.me;

  // ① 「价格」→「会员订阅」:换位置、换样子。放在「下载」左边,描边胶囊。
  if (price) price.parentNode.removeChild(price);
  var member = el("a", "nav-member");
  member.href = MEMBER_HREF;
  if (ON_MEMBER) member.setAttribute("aria-current", "page");
  if (M.dir === "a" && me && me.plan === "pro") {
    member.classList.add("is-on");
    member.appendChild(el("span", "dot"));
    member.appendChild(document.createTextNode("Pro 会员"));
  } else {
    member.textContent = "会员订阅";
  }
  // 手机上:没登录两个方向都留着它;B 已登录时胶囊就是入口,收起这一枚省位置。
  if (!(M.dir === "b" && me)) member.classList.add("nav-keep");
  links.insertBefore(member, cta);

  if (!me || !signin) return;           // 没登录:「登录」保持原样

  var loginHref = signin.getAttribute("href") || "login/index.html";

  // ② 方向 A:现有的「账户」胶囊,面板里多一行方案
  if (M.dir === "a") {
    links.classList.add("mm-signed-a");   // 手机上收起「试一试」腾位置(已登录的人不是来试的)
    var wrap = el("span", "nav-acct");
    var btn = el("button", "nav-account", "账户");
    btn.type = "button";
    btn.setAttribute("aria-haspopup", "true");
    btn.setAttribute("aria-expanded", "false");
    var pop = el("div", "nav-pop");
    pop.hidden = true;
    pop.appendChild(el("p", "who", "已登录"));
    pop.appendChild(el("p", "mail", me.email));
    var plan = el("a", "mm-planline nav-keep");
    plan.href = MEMBER_HREF;
    if (me.plan === "pro") {
      plan.appendChild(el("span", "dot"));
      plan.appendChild(el("span", "", "Pro · 到 " + dateLong(me.period_end)));
    } else {
      plan.appendChild(el("span", "dot off"));
      plan.appendChild(el("span", "", "免费 · 开通会员"));
    }
    pop.appendChild(plan);
    var out = el("button", "out", "退出");
    out.type = "button";
    pop.appendChild(out);
    wrap.appendChild(btn); wrap.appendChild(pop);
    signin.parentNode.replaceChild(wrap, signin);
    popable(btn, pop, wrap);
    return;
  }

  // ③ 方向 B:状态胶囊 + 小面板
  var w = el("span", "nav-acct mm-status-wrap");
  var cap = el("button", "mm-status nav-keep");
  cap.type = "button";
  cap.setAttribute("aria-haspopup", "true");
  cap.setAttribute("aria-expanded", "false");
  var lg = el("span", "lg"), sm = el("span", "sm");
  if (me.plan === "pro") {
    cap.classList.add("is-on");
    cap.appendChild(el("span", "dot"));
    lg.textContent = "Pro · 到 " + dateShort(me.period_end);
    sm.textContent = "Pro · " + dateTiny(me.period_end);
  } else {
    cap.appendChild(el("span", "dot off"));
    lg.textContent = "免费 · 开通会员";
    sm.textContent = "免费";
  }
  cap.appendChild(lg); cap.appendChild(sm);
  cap.setAttribute("aria-label", lg.textContent + ",打开会员面板");

  var p = el("div", "nav-pop mm-panel");
  p.hidden = true;
  if (me.plan === "pro") {
    var head = el("div", "mm-head");
    head.appendChild(el("span", "mm-tag on", "Pro"));
    head.appendChild(el("span", "mm-cycle", me.interval === "year" ? "年付" : "月付"));
    p.appendChild(head);
    p.appendChild(el("p", "mm-big", "到 " + dateLong(me.period_end)));
    p.appendChild(row("下次扣费", dateShort(me.next_charge.date) + " · " + me.next_charge.amount));
    p.appendChild(row("云端听写", "不限字数"));
    p.appendChild(meter("本期长录音", me.lecture.used, me.lecture.limit, "小时"));
    var acts = el("div", "mm-acts");
    var up = el("a", "mm-btn primary nav-keep", "升级到 Max");
    up.href = MEMBER_HREF + "#plansWrap";
    var mg = el("a", "mm-btn nav-keep", "管理订阅");
    mg.href = M.portalUrl;
    acts.appendChild(up); acts.appendChild(mg);
    p.appendChild(acts);
  } else {
    var h2 = el("div", "mm-head");
    h2.appendChild(el("span", "mm-tag", "免费"));
    p.appendChild(h2);
    var left = me.dictation.limit - me.dictation.used;
    p.appendChild(el("p", "mm-big", "本周还能听写 " + num(left) + " 字"));
    p.appendChild(meter("本周听写", me.dictation.used, me.dictation.limit, "字"));
    p.appendChild(row("长录音试用", me.lecture.used ? "已用过" : "还没用 · 最长 3 分钟"));
    var a2 = el("div", "mm-acts");
    var go = el("a", "mm-btn primary wide nav-keep", "开通会员");
    go.href = MEMBER_HREF + "#plansWrap";
    a2.appendChild(go);
    p.appendChild(a2);
  }
  var foot = el("div", "mm-foot");
  foot.appendChild(el("span", "mail", me.email));
  var o = el("a", "mm-out nav-keep", "退出");
  o.href = loginHref + "?logout=1";
  foot.appendChild(o);
  p.appendChild(foot);

  w.appendChild(cap); w.appendChild(p);
  signin.parentNode.replaceChild(w, signin);
  popable(cap, p, w);
})();
