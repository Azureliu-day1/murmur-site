/* ══════════════════════════════════════════════════════════════════════════
   v2-nav.js —— 顶栏的「账户」入口(S1,2026-09-14)
   ══════════════════════════════════════════════════════════════════════════
   页面里的顶栏**静态写着「登录」**;这个脚本只做一件事:发现本机有会话时,
   把那一项换成一枚固定宽度的「账户」。没有 JS、脚本没加载、解析失败 ——
   页面仍然是一个能点进登录页的正常顶栏。⛔ 不许把顶栏交给 JS 生成。

   三条纪律:
   ① ⛔ 零 innerHTML。邮箱是用户自己的字符串,一律 textContent 落进节点。
   ② ⛔ 首页零网络。这里只读 localStorage,不发一个请求 —— 首页的 CSP 是
      `connect-src 'none'`,「官网也不追踪你」那句话是字面成立的,别为了一个
      顶栏把它破了。要「有没有名额」这种服务端才知道的事,去 /try/ 那种
      本来就要连后端的页面上问 /me/lite。
   ③ 固定宽度、不显示完整邮箱(GPT-6 对抗后第 7 条):顶栏不许因为登录/退出
      而跳变,也不许把邮箱摆在所有人都看得见的地方(截图、投屏、录屏)。
      邮箱在点开之后的小面板里。

   页面要提供的东西只有一个:顶栏里那枚 `<a class="nav-signin" href="…登录页…">`。
   退出走的是那个 href —— 页面在两层深(/try/)还是根目录,路径各不相同,
   让脚本去猜是错的,直接读它。
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  // supabase-js v2 把会话存在这个键里(项目 ref 写死,和页面上的 SUPA_URL 同一个)。
  var STORE_KEY = "sb-syebvkwemxwxkonvsyjd-auth-token";

  var T = {
    zh: {
      account: "账户",
      signedIn: "已登录",
      signOut: "退出",
      close: "收起",
    },
    en: {
      account: "Account",
      signedIn: "Signed in",
      signOut: "Sign out",
      close: "Close",
    },
  };
  var L = /^en/i.test(document.documentElement.lang || "") ? T.en : T.zh;

  /* 会话从哪来:
     · 页面自己建过 supabase 客户端(/try/、/login/)→ 它把自己挂在 window.__murmurSb,
       用它最准(它知道 token 过没过期、能真退出);
     · 首页没有 SDK(也不该有)→ 直接读 localStorage 里那个 JSON。
     ⛔ 两条路都不解 JWT、不信里面的任何一个字段来放权限 —— 顶栏显示什么
        不是权限,真正的门在服务端。读它只为了决定画「登录」还是「账户」。 */
  function readStoredSession() {
    var raw;
    try { raw = localStorage.getItem(STORE_KEY); } catch (e) { return null; }   // 无痕窗口会直接抛
    if (!raw) return null;
    try {
      // 新版 supabase-js 有时会把值写成 base64- 前缀的形式。两种都认,
      // 认不出就当没登录(顶栏退回「登录」,比画一个点不动的「账户」好)。
      if (raw.slice(0, 7) === "base64-") {
        var bin = atob(raw.slice(7));
        var bytes = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        raw = new TextDecoder().decode(bytes);
      }
      var s = JSON.parse(raw);
      if (!s || !s.access_token) return null;
      // 过期的会话不算登录:显示「账户」而点什么都没反应是最差的一种。
      // expires_at 是秒。缺这个字段就按「还有效」处理,服务端那一关会说实话。
      if (s.expires_at && Number(s.expires_at) * 1000 < Date.now()) return null;
      return { email: (s.user && s.user.email) || "" };
    } catch (e) {
      return null;
    }
  }

  function css() {
    return [
      ".nav-acct{position:relative;display:inline-flex;align-items:center}",
      ".nav-account{display:inline-flex;align-items:center;justify-content:center;",
      "width:82px;height:30px;padding:0 12px;border:1px solid var(--line2);border-radius:999px;",
      "background:var(--capsule);color:var(--second);font:inherit;font-size:13px;line-height:1;",
      "cursor:pointer;white-space:nowrap;transition:color .12s ease,border-color .12s ease}",
      ".nav-account:hover{color:var(--ink);border-color:var(--line2)}",
      ".nav-account[aria-expanded=\"true\"]{color:var(--ink);border-color:var(--coral)}",
      ".nav-account:focus-visible{outline:2px solid var(--coral);outline-offset:2px}",
      ".nav-pop{position:absolute;top:calc(100% + 10px);right:0;min-width:216px;max-width:280px;",
      "background:var(--card);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow);",
      "padding:14px 16px;z-index:20;text-align:left}",
      ".nav-pop .who{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint);margin-bottom:5px}",
      ".nav-pop .mail{font-family:\"IBM Plex Mono\",ui-monospace,monospace;font-size:12.5px;color:var(--ink);",
      "line-height:1.5;overflow-wrap:anywhere;margin-bottom:12px}",
      ".nav-pop .out{display:block;width:100%;font:inherit;font-size:13px;color:var(--second);",
      "background:transparent;border:1px solid var(--line2);border-radius:999px;padding:7px 0;cursor:pointer;",
      "text-align:center;transition:color .12s ease,border-color .12s ease}",
      ".nav-pop .out:hover{color:var(--ink);border-color:var(--coral);text-decoration:none}",
      ".nav-pop .out:focus-visible{outline:2px solid var(--coral);outline-offset:2px}",
      // 窄屏上顶栏本来就把链接收起来了(各页 @media 里的 .navlinks a:not(.nav-cta)),
      // 账户这一枚是 <button>,收不到那条规则 —— 在这里自己收。
      "@media (max-width:820px){.nav-acct{display:none}}",
    ].join("");
  }

  function mount(link, session) {
    var loginHref = link.getAttribute("href") || "login/index.html";

    var style = document.createElement("style");
    style.textContent = css();           // 常量字符串,⛔ 不是用户数据
    document.head.appendChild(style);

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "nav-account";
    btn.textContent = L.account;         // ⛔ textContent,不是 innerHTML
    btn.setAttribute("aria-expanded", "false");
    btn.setAttribute("aria-haspopup", "true");

    var pop = document.createElement("div");
    pop.className = "nav-pop";
    pop.hidden = true;

    var who = document.createElement("p");
    who.className = "who";
    who.textContent = L.signedIn;

    var mail = document.createElement("p");
    mail.className = "mail";
    mail.textContent = session.email || "—";   // ⭐ 用户数据,只走 textContent

    var out = document.createElement("button");
    out.type = "button";
    out.className = "out";
    out.textContent = L.signOut;

    pop.appendChild(who); pop.appendChild(mail); pop.appendChild(out);

    // ⚠️ 面板是按钮的**兄弟**,不是孩子:<button> 里再套一个 <button> 是非法
    //    HTML,点里面那枚会顺着冒泡把外面那枚也点一遍(Safari 上还会更怪)。
    var wrap = document.createElement("span");
    wrap.className = "nav-acct";
    wrap.appendChild(btn); wrap.appendChild(pop);
    link.parentNode.replaceChild(wrap, link);

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

    out.addEventListener("click", function () {
      var sb = window.__murmurSb;
      if (sb && sb.auth && typeof sb.auth.signOut === "function") {
        // 页面上有 SDK:真退出(顺带把服务端那张 refresh token 作废),再刷新。
        sb.auth.signOut().catch(function () {}).then(function () { location.reload(); });
        return;
      }
      // 首页没有 SDK,也不该为了一个退出键去拉一个 SDK 回来。
      // 交给登录页做真退出 —— 那页本来就有 SDK,而且退完人就站在能重新登录的地方。
      location.href = loginHref + (loginHref.indexOf("?") >= 0 ? "&" : "?") + "logout=1";
    });
  }

  function run() {
    var link = document.querySelector(".nav-signin");
    if (!link) return;                       // 这一页没有登录入口,不关我的事
    var session = readStoredSession();
    if (!session) return;                    // 没登录:顶栏保持静态的「登录」
    mount(link, session);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
  else run();
})();
