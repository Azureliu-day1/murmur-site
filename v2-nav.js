/* ══════════════════════════════════════════════════════════════════════════
   v2-nav.js —— 顶栏的账号入口 + 会员状态胶囊(S1 2026-09-14;MEMBER-BUILD 2026-10-19)
   ══════════════════════════════════════════════════════════════════════════
   页面里的顶栏**静态写着「登录」和「会员订阅」**;这个脚本只做一件事:发现本机
   有会话时,把「登录」那一项换成一枚状态胶囊:
     · 有会员摘要缓存(新鲜):「免费 · 开通会员」/「Pro · 到 11 月 18 日」
     · 缓存超过 24 小时:只显示档位(「Pro 会员」),不显示日期和用量
     · 没缓存:「账户」(和改版前一样)
   点开是一块小面板:档位、到期 / 下次扣费、本月用量、升级 / 管理、邮箱、退出。
   没有 JS、脚本没加载、解析失败 —— 页面仍然是一个能点进登录页的正常顶栏。
   ⛔ 不许把顶栏交给 JS 生成。

   四条纪律:
   ① ⛔ 零 innerHTML。邮箱、日期、金额一律 textContent 落进节点。
   ② ⛔ 这个文件自己不发请求。首页、指南、更新记录、演示页的 CSP 是
      `connect-src 'none'`,「官网也不追踪你」那句话是字面成立的。胶囊只读本机的
      会员摘要缓存(localStorage 的 CACHE_KEY);缓存由会员页 / 试一试页 / 登录页
      在它们本来就要连后端的时候,调 MurmurMember.refresh() 问一次 /me 后写入。
      refresh() 定义在这里(一份 /me → 摘要的口径),但只有那三页会调它。
   ③ 不在顶栏上显示完整邮箱(GPT-6 对抗后第 7 条):截图、投屏、录屏都看得见顶栏。
      邮箱在点开之后的小面板里。
   ④ 缓存不是权限。它只决定胶囊上写什么;真正的门在服务端。

   页面要提供的:顶栏里那枚 `<a class="nav-signin" href="…登录页…">`(退出走它的 href),
   和那枚 `<a class="nav-member" href="…会员页…">`(胶囊面板里的「开通 / 升级」走它的 href)。
   页面在两层深还是根目录,路径各不相同,让脚本去猜是错的,直接读它们。

   本地演示(只在 127.0.0.1 生效,上线不影响):`?demo=free|pro|max|pro-year|developer|out`
   把一份假的会员摘要写进缓存(邮箱 user@example.com),不发请求;`out` 清掉。
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  // supabase-js v2 把会话存在这个键里(项目 ref 写死,和页面上的 SUPA_URL 同一个)。
  var STORE_KEY = "sb-syebvkwemxwxkonvsyjd-auth-token";
  var CACHE_KEY = "murmur-member-v1";
  var FRESH_MS = 24 * 3600 * 1000;
  var ME_URL = "https://syebvkwemxwxkonvsyjd.supabase.co/functions/v1/murmur/me";
  var LOCAL = location.hostname === "127.0.0.1";
  // 套餐说明里的长录音小时数(会员页卡片上同一组数)。/me 回了真额度就用真额度。
  var LECTURE_HOURS = { pro: 20, max: 60 };

  var EN = /^en/i.test(document.documentElement.lang || "");
  var T = EN ? {
    account: "Account",
    signedIn: "Signed in",
    signOut: "Sign out",
    free: "Free",
    freeWide: "Free · Upgrade",
    member: function (p) { return p + " member"; },
    until: function (p, d) { return p + " · until " + d; },
    short: function (p, d) { return p + " · " + d; },
    month: "Monthly", year: "Yearly",
    freeBig: "Free plan",
    leftWeek: function (n) { return n + " words left this week"; },
    dictWeek: "Dictation this week",
    words: "words",
    trial: "Long recording trial",
    trialFresh: function (m) { return "Not used · up to " + m + " min"; },
    trialUsed: "Used",
    trialUnknown: function (m) { return "Up to " + m + " min"; },
    untilBig: function (d) { return "Until " + d; },
    nextCharge: "Next charge",
    noRenew: "Ends, no renewal",
    lecPeriod: "Long recording",
    hours: "hours",
    unlimited: "Unlimited",
    upgrade: "Upgrade",
    toMax: "Upgrade to Max",
    manage: "Manage",
    details: "Details",
    viewPlans: "Membership",
    stale: "Open the membership page for dates and usage.",
    openPanel: "open membership panel",
    dev: "Developer account",
    otherPlan: "Active plan",
    meFail: "We couldn't load your membership right now. Please refresh in a moment.",
  } : {
    account: "账户",
    signedIn: "已登录",
    signOut: "退出",
    free: "免费",
    freeWide: "免费 · 开通会员",
    member: function (p) { return p + " 会员"; },
    until: function (p, d) { return p + " · 到 " + d; },
    short: function (p, d) { return p + " · " + d; },
    month: "月付", year: "年付",
    freeBig: "免费档",
    leftWeek: function (n) { return "本周还能听写 " + n + " 字"; },
    dictWeek: "本周听写",
    words: "字",
    trial: "长录音试用",
    trialFresh: function (m) { return "还没用 · 最长 " + m + " 分钟"; },
    trialUsed: "已用完",
    trialUnknown: function (m) { return "最长 " + m + " 分钟"; },
    untilBig: function (d) { return "到 " + d; },
    nextCharge: "下次扣费",
    noRenew: "到期后不再续费",
    lecPeriod: "本月长录音",
    hours: "小时",
    unlimited: "不限",
    upgrade: "开通会员",
    toMax: "升级到 Max",
    manage: "管理订阅",
    details: "会员详情",
    viewPlans: "会员订阅",
    stale: "到期日和用量在会员页上看。",
    openPanel: "打开会员面板",
    dev: "开发者账号",
    otherPlan: "已有权益",
    meFail: "暂时读不到你的会员状态,稍后刷新。",
  };
  var PLAN_NAME = { pro: "Pro", max: "Max" };
  // SEC-FIX-A M1:档位只有这五种。developer = 服务端合法档位(已有权益);other = 服务端回了一个这里认不出的档位。
  //   ⛔ 认不出的档位不归 free:归 free 就会对一个已经有权益的人亮出「开通」,开出第二个订阅、扣两份钱。
  var PLANS = { free: 1, pro: 1, max: 1, developer: 1, other: 1 };
  // 这一页问过 /me 但没问到(超时、断网、5xx、401):面板不再按缓存说「开通会员」,只说读不到。只活在这一次页面里。
  var meFailed = false;

  // ── 日期与数字 ─────────────────────────────────────────────────────────
  function toDate(iso) {
    if (!iso) return null;
    var d = new Date(iso);
    return isNaN(d.getTime()) ? null : d;
  }
  function dShort(iso) {   // 「11 月 18 日」/ "Nov 18"
    var d = toDate(iso); if (!d) return "";
    if (EN) { try { return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(d); } catch (e) { return ""; } }
    return (d.getMonth() + 1) + " 月 " + d.getDate() + " 日";
  }
  function dLong(iso) {    // 「2026 年 11 月 18 日」/ "November 18, 2026"
    var d = toDate(iso); if (!d) return "";
    if (EN) { try { return new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long", day: "numeric" }).format(d); } catch (e) { return ""; } }
    return d.getFullYear() + " 年 " + (d.getMonth() + 1) + " 月 " + d.getDate() + " 日";
  }
  function dTiny(iso) {    // 窄屏胶囊:「11/18」/ "Nov 18"
    var d = toDate(iso); if (!d) return "";
    return EN ? dShort(iso) : (d.getMonth() + 1) + "/" + d.getDate();
  }
  function num(n) {
    var r = Math.round(n * 10) / 10;
    var s = String(r).split(".");
    return s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (s[1] ? "." + s[1] : "");
  }
  function finite(v) { return typeof v === "number" && isFinite(v) ? v : null; }

  // ── 会员摘要缓存 ───────────────────────────────────────────────────────
  // 形状:{ v:1, t, email, plan:"free"|"pro"|"max", interval:"month"|"year"|null,
  //        period_end, lec_resets, cancel, dict:{used,limit,resets}, trial:{used,minutes},
  //        lec:{used_h,limit_h}, amount, portal, demo }
  //   plan 还可以是 "developer" / "other"(SEC-FIX-A M1,见 PLANS)
  //   period_end = 订阅到期 / 下次扣费日;lec_resets = 长录音额度下次重置日(年付也按月切片,两者不是一天)
  function readCache() {
    var raw;
    try { raw = localStorage.getItem(CACHE_KEY); } catch (e) { return null; }
    if (!raw) return null;
    try {
      var c = JSON.parse(raw);
      if (!c || c.v !== 1 || typeof c.t !== "number") return null;
      if (!PLANS[c.plan]) c.plan = "other";       // 认不出 → 当「已有权益」,⛔ 不当免费档(M1)
      if (c.demo && !LOCAL) return null;          // 演示数据只在本机预览里认
      return c;
    } catch (e) { return null; }
  }
  function writeCache(c, quiet) {
    c.v = 1; c.t = c.t || Date.now();
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch (e) { /* 无痕窗口:不缓存,胶囊退回「账户」 */ }
    if (!quiet) { try { window.dispatchEvent(new CustomEvent("murmur-member")); } catch (e) { /* 老浏览器 */ } }
  }
  function clearCache() {
    try { localStorage.removeItem(CACHE_KEY); } catch (e) { /* 同上 */ }
  }
  function isFresh(c) { return !!c && Date.now() - c.t < FRESH_MS && Date.now() - c.t >= -60000; }

  /* /me → 摘要。缺字段(plan 为空)按免费档(订阅 v2 还没部署时 /me 只有 quota / lecture_trial)。
     ⛔ 但 plan 有值而认不出时不按免费档(SEC-FIX-A M1):developer 原样保留,其余记成 "other"。
     读法(先契约 v2,再现行字段):
       plan       = me.plan(v2)|| me.quota.plan(现行);空或 free = 免费;pro / max / developer 原样;其余 = other
       period_end = me.subscription.period_end || me.quota.subscription.period_end || me.usage.period_end
                    (到期日 / 下次扣费日。⛔ 不先读 usage.period_end:年付用户那是本月额度切片的末尾,
                     先读它会把「一年后到期」显示成「一个月后到期」)
       lec_resets = me.usage.lecture.period_end || me.usage.period_end(只给「本月长录音 … 重置」那一行用)
       interval   = me.usage.interval || me.subscription.interval || me.quota.subscription.interval(契约里还没有)
       本周听写    = me.quota.chars_used / chars_quota(现行,周界 chars_resets_at)
       长录音试用  = me.lecture_trial.used / total_ms(现行)
       本月长录音  = me.usage.used / limit 秒(v2)|| me.quota.lecture_minutes_used / _quota(现行) */
  function fromMe(me, email) {
    me = me && typeof me === "object" ? me : {};
    var q = me.quota && typeof me.quota === "object" ? me.quota : {};
    var raw = String(me.plan || q.plan || "").toLowerCase();
    var plan = raw === "" || raw === "free" ? "free" : PLANS[raw] && raw !== "other" ? raw : "other";
    var u = me.usage && typeof me.usage === "object" ? me.usage : null;
    var s1 = me.subscription && typeof me.subscription === "object" ? me.subscription : null;
    var s2 = q.subscription && typeof q.subscription === "object" ? q.subscription : null;
    var sub = s1 || s2;
    var ul = u && u.lecture && typeof u.lecture === "object" ? u.lecture : null;
    var iv = (u && u.interval) || (sub && sub.interval) || null;
    var c = {
      email: typeof me.email === "string" && me.email ? me.email : (email || ""),
      plan: plan,
      interval: iv === "month" || iv === "year" ? iv : null,
      period_end: null, lec_resets: null, cancel: false,
      dict: null, trial: null, lec: null,
    };
    if (plan === "free") {
      var lim = finite(q.chars_quota);
      c.dict = { used: finite(q.chars_used), limit: lim != null ? lim : 2000, resets: q.chars_resets_at || null };
      var lt = me.lecture_trial && typeof me.lecture_trial === "object" ? me.lecture_trial : null;
      var mins = lt && finite(lt.total_ms) ? Math.round(lt.total_ms / 60000) : 0;
      c.trial = { used: lt && typeof lt.used === "boolean" ? lt.used : null, minutes: mins > 0 ? mins : 3 };
    } else {
      c.period_end = (s1 && s1.period_end) || (s2 && s2.period_end) || (u && u.period_end) || null;
      c.cancel = !!(sub && (sub.cancel_at_period_end === true || sub.status === "canceled"));
      if (plan === "other") return c;             // 认不出的档位:不猜它有多少额度
      c.lec_resets = (ul && ul.period_end) || (u && u.period_end) || null;
      if (u && u.unit === "seconds" && finite(u.used) != null) {
        c.lec = { used_h: u.used / 3600, limit_h: u.limit == null ? null : (finite(u.limit) != null ? u.limit / 3600 : LECTURE_HOURS[plan]) };
      } else if (finite(q.lecture_minutes_quota) != null) {
        c.lec = { used_h: (finite(q.lecture_minutes_used) || 0) / 60, limit_h: q.lecture_minutes_quota / 60 };
      } else {
        c.lec = { used_h: null, limit_h: LECTURE_HOURS[plan] };
      }
    }
    return c;
  }

  /// 问一次 /me,写缓存,返回摘要。只有会员页 / 试一试页 / 登录页调(它们的 CSP 放行了后端)。
  /// 401 / 网络错 / 超时 / 5xx → null,缓存不动,并记下「这一页没问到」(面板改说读不到,不亮「开通会员」);
  /// 403(还没有名额)→ 按免费档写。
  /// ⚠️ 只带 Authorization:murmur 函数的 CORS 放行头里没有 apikey,带了预检就过不去。
  function refresh(token, email) {
    if (!token || typeof fetch !== "function") return Promise.resolve(null);
    var ctl = typeof AbortController === "function" ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, 6000);
    return fetch(ME_URL, { headers: { authorization: "Bearer " + token }, signal: ctl ? ctl.signal : undefined })
      .then(function (r) {
        if (r.status === 403) return {};
        if (!r.ok) return null;
        return r.json().catch(function () { return null; });
      })
      .then(function (me) {
        clearTimeout(timer);
        if (!me) return failed();
        var c = fromMe(me, email);
        // 下次扣费的金额与管理链接来自 /pricing.json(会员页读得到,别的页读不到):档位与周期没变就沿用上一份
        var old = readCache();
        if (old && !old.demo && old.plan === c.plan && old.interval === c.interval) {
          if (old.amount) c.amount = old.amount;
          if (old.portal) c.portal = old.portal;
        }
        c.t = Date.now();
        meFailed = false;
        writeCache(c);
        return c;
      })
      .catch(function () { clearTimeout(timer); return failed(); });
  }
  function failed() {
    meFailed = true;
    try { window.dispatchEvent(new CustomEvent("murmur-member")); } catch (e) { /* 老浏览器 */ }
    return null;
  }

  // ── 本地演示开关(只在 127.0.0.1)────────────────────────────────────
  function demoCache(kind) {
    var end = new Date(Date.now() + 30 * 86400000).toISOString();
    var base = { demo: true, t: Date.now(), email: "user@example.com" };
    if (kind === "free") {
      base.plan = "free";
      base.dict = { used: 1240, limit: 2000, resets: new Date(Date.now() + 4 * 86400000).toISOString() };
      base.trial = { used: false, minutes: 3 };
    } else if (kind === "developer") {
      base.plan = "developer"; base.interval = null; base.cancel = false;
      base.lec = { used_h: 3.2, limit_h: null };
    } else {
      base.plan = kind; base.interval = "month"; base.period_end = end; base.lec_resets = end; base.cancel = false;
      base.lec = kind === "max" ? { used_h: 18.5, limit_h: 60 } : { used_h: 6.5, limit_h: 20 };
    }
    return base;
  }
  // 年付 Pro:走一遍 fromMe,演示的就是真读法 —— 订阅一年后到期,长录音额度一个月后重置
  //   (usage.period_end 故意也是一个月后:那是年付用户的本月切片末尾,读错了到期日就会显示成一个月后)
  function demoYear() {
    var day = 86400000, now = Date.now();
    var yearEnd = new Date(now + 365 * day).toISOString(), monthEnd = new Date(now + 30 * day).toISOString();
    var c = fromMe({
      email: "user@example.com", plan: "pro",
      subscription: { interval: "year", period_end: yearEnd, status: "active", cancel_at_period_end: false },
      usage: { unit: "seconds", used: 6.5 * 3600, limit: 20 * 3600, period_end: monthEnd, lecture: { period_end: monthEnd } },
    });
    c.demo = true; c.t = now;
    return c;
  }
  function applyDemo() {
    if (!LOCAL) return;
    var k = new URLSearchParams(location.search).get("demo");
    if (k === "out") { clearCache(); return; }
    if (k === "free" || k === "pro" || k === "max" || k === "developer") writeCache(demoCache(k), true);
    if (k === "pro-year") writeCache(demoYear(), true);
  }

  // 演示开关在脚本一执行就落缓存:会员页的模块脚本在 DOMContentLoaded 之前就跑,要先读到它。
  applyDemo();

  window.MurmurMember = {
    read: readCache, write: writeCache, clear: clearCache, fromMe: fromMe, refresh: refresh,
    fresh: isFresh, local: LOCAL, failed: function () { return meFailed; },
  };

  // ── 会话 ───────────────────────────────────────────────────────────────
  /* 会话从哪来:直接读 localStorage 里那个 JSON(会员页 / 试一试页建的 supabase 客户端
     也写同一个键)。⛔ 不解 JWT、不信里面的字段来放权限 —— 读它只为决定画「登录」还是胶囊。 */
  function readStoredSession() {
    var raw;
    try { raw = localStorage.getItem(STORE_KEY); } catch (e) { return null; }   // 无痕窗口会直接抛
    if (!raw) return null;
    try {
      // 新版 supabase-js 有时会把值写成 base64- 前缀的形式。两种都认,认不出就当没登录。
      if (raw.slice(0, 7) === "base64-") {
        var bin = atob(raw.slice(7));
        var bytes = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        raw = new TextDecoder().decode(bytes);
      }
      var s = JSON.parse(raw);
      if (!s || !s.access_token) return null;
      // 过期的会话不算登录(expires_at 是秒;缺这个字段按「还有效」,服务端那一关会说实话)。
      if (s.expires_at && Number(s.expires_at) * 1000 < Date.now()) return null;
      return { email: (s.user && s.user.email) || "" };
    } catch (e) {
      return null;
    }
  }

  // SITEFIX-21:胶囊与面板的样式在 v2.css(首页在页内 <style>)。⛔ 不从脚本注入 <style>:
  //   登录 / 试一试 / 技能 / 会员页的 CSP 是 style-src 'self',注入的样式会被拦。

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;      // ⛔ textContent,不是 innerHTML
    return n;
  }
  // 面板在 .navlinks 里面:各页窄屏规则 `.navlinks a:not(.nav-cta):not(.nav-keep)` 会把面板里的链接一起收走,所以都打 nav-keep
  function link(cls, text, href) { var a = el("a", cls + " nav-keep", text); a.href = href; return a; }
  function row(k, v) {
    var r = el("div", "mm-row");
    r.appendChild(el("span", "k", k)); r.appendChild(el("span", "v", v));
    return r;
  }
  function meter(label, used, limit, unit) {
    var box = el("div", "mm-meter");
    var top = el("div", "mm-meter-top");
    top.appendChild(el("span", "k", label));
    top.appendChild(el("span", "v", num(used) + " / " + num(limit) + " " + unit));
    var bar = el("div", "mm-bar"), fill = el("i");
    fill.style.width = Math.max(0, Math.min(100, Math.round(used / limit * 100))) + "%";
    bar.appendChild(fill);
    box.appendChild(top); box.appendChild(bar);
    return box;
  }
  function httpsUrl(v) {
    if (typeof v !== "string" || !v) return null;
    try { var u = new URL(v); return u.protocol === "https:" ? u.href : null; } catch (e) { return null; }
  }

  function mount(signin, session) {
    var links = signin.parentNode;
    var loginHref = signin.getAttribute("href") || "login/index.html";
    var memberA = links.querySelector(".nav-member");
    var memberHref = memberA ? memberA.getAttribute("href") : loginHref.replace(/login\/index\.html.*$/, "member/index.html");

    var btn = el("button", "nav-account");
    btn.type = "button";
    btn.setAttribute("aria-expanded", "false");
    btn.setAttribute("aria-haspopup", "true");
    var pop = el("div", "nav-pop");
    pop.hidden = true;

    // ⚠️ 面板是按钮的**兄弟**,不是孩子:<button> 里再套一个 <button> 是非法 HTML。
    var wrap = el("span", "nav-acct");
    wrap.appendChild(btn); wrap.appendChild(pop);
    links.replaceChild(wrap, signin);
    links.classList.add("is-signed");   // 窄屏:胶囊就是会员入口,收起单独那枚「会员订阅」(v2.css)

    function signOut() {
      clearCache();
      var sb = window.__murmurSb;
      if (sb && sb.auth && typeof sb.auth.signOut === "function") {
        // 页面上有 SDK:真退出(顺带把服务端那张 refresh token 作废),再刷新。
        sb.auth.signOut().catch(function () {}).then(function () { location.reload(); });
        return;
      }
      if (LOCAL && !readStoredSession()) { location.reload(); return; }   // 演示态:没有真会话,清缓存就够了
      // 首页没有 SDK,也不该为了一个退出键去拉一个 SDK 回来。交给登录页做真退出。
      location.href = loginHref + (loginHref.indexOf("?") >= 0 ? "&" : "?") + "logout=1";
    }

    function foot(email) {
      var f = el("div", "mm-foot");
      f.appendChild(el("span", "mail", email || ""));     // ⭐ 用户数据,只走 textContent
      var out = el("button", "out", T.signOut);
      out.type = "button";
      out.addEventListener("click", signOut);
      f.appendChild(out);
      return f;
    }

    function render() {
      var c = readCache();
      if (c && c.email && session.email && c.email.toLowerCase() !== session.email.toLowerCase()) { clearCache(); c = null; }
      var email = session.email || (c && c.email) || "";
      btn.textContent = "";
      pop.textContent = "";
      btn.className = "nav-account";

      if (meFailed) {
        // SEC-FIX-A M1:这一页问 /me 没问到。⛔ 不按缓存说「免费 · 开通会员」(他可能早就付过了),只说读不到
        btn.textContent = T.account;
        btn.removeAttribute("aria-label");
        pop.className = "nav-pop";
        pop.appendChild(el("p", "who", T.signedIn));
        pop.appendChild(el("p", "mail", email || "—"));
        pop.appendChild(el("p", "mm-note", T.meFail));
        var actsF = el("div", "mm-acts");
        actsF.appendChild(link("mm-btn wide", T.details, memberHref));
        pop.appendChild(actsF);
        pop.appendChild(foot(""));
        return;
      }
      if (!c) {
        // 没缓存:改版前那枚「账户」,面板多一条去会员页的路
        btn.textContent = T.account;
        btn.removeAttribute("aria-label");
        pop.className = "nav-pop";
        pop.appendChild(el("p", "who", T.signedIn));
        pop.appendChild(el("p", "mail", email || "—"));
        var acts0 = el("div", "mm-acts");
        acts0.appendChild(link("mm-btn wide", T.viewPlans, memberHref));
        pop.appendChild(acts0);
        pop.appendChild(foot(""));
        return;
      }

      var fresh = isFresh(c);
      var paid = c.plan === "pro" || c.plan === "max";
      var special = c.plan === "developer" || c.plan === "other";   // 已有权益,但不是可买的档:⛔ 不出「开通 / 升级」
      var name = paid ? PLAN_NAME[c.plan] : special ? (c.plan === "developer" ? T.dev : T.otherPlan) : T.free;
      var wide, small;
      if (special) {
        wide = name; small = name;
        btn.classList.add("is-paid");
      } else if (paid) {
        var hasEnd = fresh && dShort(c.period_end);
        wide = hasEnd ? T.until(name, dShort(c.period_end)) : T.member(name);
        small = hasEnd ? T.short(name, dTiny(c.period_end)) : name;
        btn.classList.add("is-paid");
      } else {
        wide = T.freeWide; small = T.free;
      }
      btn.classList.add("is-status");
      btn.appendChild(el("span", "dot" + (paid || special ? "" : " off")));
      btn.appendChild(el("span", "lg", wide));
      btn.appendChild(el("span", "sm", small));
      btn.setAttribute("aria-label", wide + (EN ? ", " : ",") + T.openPanel);

      pop.className = "nav-pop mm-panel";
      var head = el("div", "mm-head");
      head.appendChild(el("span", "mm-tag" + (paid || special ? " on" : ""), name));
      if (paid && c.interval) head.appendChild(el("span", "mm-cycle", c.interval === "year" ? T.year : T.month));
      pop.appendChild(head);

      var acts = el("div", "mm-acts");
      var portal = httpsUrl(c.portal);
      if (special) {
        pop.appendChild(el("p", "mm-big", name));
        acts.appendChild(link("mm-btn wide", T.details, memberHref));
      } else if (!paid) {
        var d = c.dict || {};
        var canLeft = fresh && finite(d.used) != null && finite(d.limit) != null;
        pop.appendChild(el("p", "mm-big", canLeft ? T.leftWeek(num(Math.max(0, d.limit - d.used))) : T.freeBig));
        if (fresh) {
          if (canLeft) pop.appendChild(meter(T.dictWeek, d.used, d.limit, T.words));
          else if (finite(d.limit) != null) pop.appendChild(row(T.dictWeek, num(d.limit) + " " + T.words));
          var tr = c.trial || { used: null, minutes: 3 };
          pop.appendChild(row(T.trial, tr.used === true ? T.trialUsed : tr.used === false ? T.trialFresh(tr.minutes) : T.trialUnknown(tr.minutes)));
        } else {
          pop.appendChild(el("p", "mm-note", T.stale));
        }
        acts.appendChild(link("mm-btn primary wide", T.upgrade, memberHref));
      } else {
        if (fresh && dLong(c.period_end)) {
          pop.appendChild(el("p", "mm-big", T.untilBig(dLong(c.period_end))));
          pop.appendChild(row(T.nextCharge, c.cancel ? T.noRenew : dShort(c.period_end) + (c.amount ? " · " + c.amount : "")));
        } else {
          pop.appendChild(el("p", "mm-big", T.member(name)));
        }
        if (fresh) {
          var l = c.lec || {};
          if (finite(l.used_h) != null && finite(l.limit_h) != null && l.limit_h > 0) pop.appendChild(meter(T.lecPeriod, l.used_h, l.limit_h, T.hours));
          else pop.appendChild(row(T.lecPeriod, finite(l.limit_h) != null ? num(l.limit_h) + " " + T.hours : T.unlimited));
        } else {
          pop.appendChild(el("p", "mm-note", T.stale));
        }
        if (c.plan === "pro") acts.appendChild(link("mm-btn primary", T.toMax, memberHref + "#plans"));
        acts.appendChild(portal ? link("mm-btn", T.manage, portal) : link("mm-btn", T.details, memberHref));
        if (portal) acts.lastChild.rel = "noopener";
      }
      pop.appendChild(acts);
      pop.appendChild(foot(email));
    }

    function setOpen(open) {
      pop.hidden = !open;
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    }
    btn.addEventListener("click", function () { setOpen(pop.hidden); });
    document.addEventListener("click", function (e) {
      if (!wrap.contains(e.target)) setOpen(false);
    });
    document.addEventListener("keydown", function (e) {
      // Esc 关面板,并且把焦点还给按钮 —— 键盘走位的人不该被丢在页面开头
      if (e.key === "Escape" && !pop.hidden) { setOpen(false); btn.focus(); }
    });
    window.addEventListener("murmur-member", render);
    render();
    if (LOCAL && new URLSearchParams(location.search).get("open") === "1") setOpen(true);   // 截图用
  }

  function run() {
    var signin = document.querySelector(".nav-signin");
    if (!signin) return;                     // 这一页没有登录入口,不关我的事
    var session = readStoredSession();
    var c = readCache();
    if (!session && c && c.demo) session = { email: c.email || "" };   // 本机演示:没有真会话也画胶囊
    if (!session) {
      if (c) clearCache();                   // 别处退出了:旧摘要作废
      return;                                // 没登录:顶栏保持静态的「登录」
    }
    mount(signin, session);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
  else run();
})();
