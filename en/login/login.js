// ── 登录页 ────────────────────────────────────────────────────────────────
// 一张卡三态:①填邮箱 → ②填 6 位码 → ③已经登录了。
//
// 四条纪律:
//  ① 页面上零处「注册」。这站是邀请制的;对没名额的人,正确的下一步是
//     「申请一个」,而服务端会在那一步给他建身份 —— 用户看到的始终是
//     「申请 → 收码 → 进来」,不是「注册」。
//  ② 一个失败对应一句人话,⛔ 不把状态码或者英文错误串摆给用户看。
//     唯一需要认的机器码是 otp_disabled —— 它的意思是「这个邮箱还没有身份」,
//     ⛔ 不许照字面说成「没有账号」(那是在告诉任何人「这个邮箱不是用户」)。
//  ③ 页面上只有 publishable key,⛔ 没有别的密钥。
//  ④ next 只接受站内的相对路径 —— 见 safeNext()。
const SUPA_URL = "https://syebvkwemxwxkonvsyjd.supabase.co";
const SUPA_KEY = "sb_publishable_bBmuodbgO72q8CK_kacrSw_0o3cCsOd";  // 公开 key,不是密钥
const FN       = SUPA_URL + "/functions/v1/murmur-web";
const SDK      = "../../vendor/supabase-js-2.116.0.mjs"; // SEC-L5:自托管,版本写死(来源与 sha256 见 vendor/SOURCES.txt);相对本文件解析
const LANG     = "en";
// 登录后默认去首页的「下载」:Mac App 才是产品,下载免费、不登录也能听写。
// 网页试整理仍在顶栏「试一试」和登录态卡片里。
// 例外:刚在这一页提交申请的人还没有名额,申请说明答应过他「可以先登录,在网页上
// 试整理」—— 他验完码去 APPLY_NEXT(见 afterLogin())。
const DEFAULT_NEXT = "../index.html#download";
const APPLY_NEXT   = "../try/index.html";
// ⚠️ 60 = 线上 Auth 的 smtp_max_frequency(同一地址两封信至少隔 60 秒)。
//    以前写 45:等到能点的时候服务端还在冷却里,点下去被 429 顶回来,页面
//    对一个什么都没做错的人说「太频繁了」。Mac App 那边的冷却本来就是 60。
//    ⛔ 改这个数之前先去后台核一眼 smtp_max_frequency,别让两边各写一个数。
const RESEND_SECONDS = 60;
// ⬇️ Wei 在 Cloudflare 后台给「申请名额」建好 widget 之后,把 site key 填这里,
//    并把服务端的 WEB_ACCESS_TURNSTILE 打开。两边都开才生效 ——
//    ⛔ 只开服务端那一侧会让每一次申请都 403(页面根本没有回执可发)。
const TURNSTILE_SITEKEY = "";
const TURNSTILE_ACTION  = "web-access";

const L = {
  needEmail:   "Enter your email first.",
  badEmail:    "That address does not look right. Check the spelling.",
  sending:     "Sending the code…",
  sent:        "Code sent. Check your inbox.",
  needCode:    "Type the 6 digits from the email.",
  verifying:   "Signing in…",
  badCode:     "That code is wrong or expired. Press \u201cSend it again\u201d for a new one.",
  rate:        "Too many attempts. Wait a minute and try again.",
  mailDown:    "The email service didn't respond. Try again in a moment.",
  offline:     "The network seems to be down. Reconnect and try again.",
  generic:     "That did not work. Try again shortly.",
  noIdentity:  "This address can't sign in yet. Request a seat below and you will get a code right away.",
  resendIn:    (n) => `Send again in ${n}s`,
  resendNow:   "Send it again",
  reqSending:  "Sending…",
  reqNoMail:   "Request received, but the code wasn't sent. Press \u201cSend it again\u201d above.",
  reqTooMany:  "Too many requests from this network today. Try again in an hour.",
  loggedOut:   "Signed out.",
  needCaptcha: "Complete the verification check first.",
  // 申请状态(/access/status):日期拿不到就不写括号,⛔ 不写「(Invalid Date)」
  reqStatusNew:      (d) => d ? `Request received (${d}). We will email this address when your seat opens.` : "Request received. We will email this address when your seat opens.",
  reqStatusDeclined: "No seat this time.",
};

const $ = (id) => document.getElementById(id);
const elEmail = $("email"), elSend = $("send"), elState = $("state");
const elCode = $("code"), elVerify = $("verify"), elState2 = $("state2");
const elSentTo = $("sentTo"), elResend = $("resend"), elBack = $("back");
const cardEmail = $("card-email"), cardCode = $("card-code"), cardIn = $("card-in");
const elReq = $("req"), elReqEmail = $("reqEmail"), elReqNote = $("reqNote");
const elReqSend = $("reqSend"), elReqState = $("reqState"), elTs = $("turnstile");

let sb = null;          // supabase 客户端(SDK 拉下来之后才有)
let pending = "";       // 正在等码的那个邮箱
let busy = false;
let tsToken = "";       // Turnstile 回执,一次一用

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;   // 和服务端同一个口径

function say(el, msg, kind) {
  el.textContent = msg || "";
  el.className = "state" + (kind ? " " + kind : "");
}

/// ⛔ 开放重定向的那道闸:next 只能是**站内的相对路径**。
///    放行 "//evil.com" 或 "https://…" 就等于把我们的登录页变成别人的跳板
///    (钓鱼链接看起来是从 maobenbeginner.com 点进去的)。
function safeNext() {
  const raw = new URLSearchParams(location.search).get("next") || "";
  if (!raw) return DEFAULT_NEXT;
  // ⚠️ 不靠「以 / 开头」「不含 :」这类字符串判断 —— 那种写法挡不住 `/\evil.com`:
  //    URL 解析器对 http(s) 会把反斜杠当斜杠,于是它等同于 //evil.com,跳出站外。
  //    交给 URL 解析器判,只认解析完仍然落在本站的那些。
  try {
    const u = new URL(raw, location.href);
    if (u.origin !== location.origin) return DEFAULT_NEXT;
    return u.pathname + u.search + u.hash;
  } catch (e) {
    return DEFAULT_NEXT;
  }
}

/// 验码成功后去哪:带了 next 就照 next(仍过 safeNext 那道闸);
/// 没带、而且是刚在这一页申请的人 → 试整理;其余 → 下载。
let justApplied = false;
function afterLogin() {
  const hasNext = !!new URLSearchParams(location.search).get("next");
  return (justApplied && !hasNext) ? APPLY_NEXT : safeNext();
}

function show(which) {
  cardEmail.hidden = which !== "email";
  cardCode.hidden  = which !== "code";
  cardIn.hidden    = which !== "in";
}

// ── ① 发码 ────────────────────────────────────────────────────────────────
async function sendCode(email, fromResend) {
  if (busy || !sb) return;
  busy = true; elSend.disabled = true; elResend.disabled = true;
  const target = fromResend ? elState2 : elState;
  say(target, L.sending, "busy");
  let error = null;
  try {
    // shouldCreateUser:false —— ⛔ 登录这条路永远不建账号。
    // 建身份只有一个出口:下面那张申请表(服务端的 /access/request)。
    const r = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
    error = r.error;
  } catch (e) {
    busy = false; elSend.disabled = false; elResend.disabled = false;
    say(target, L.offline, "err");
    return;
  }
  busy = false; elSend.disabled = false;
  if (error) {
    // otp_disabled = GoTrue 说「这个邮箱不在 Auth 里,而全局注册是关着的」。
    // ⛔ 不照字面翻译成「没有这个账号」—— 那句话会把「谁是用户」告诉任何人。
    //    这里把它当成产品里的一个正常岔路:引到申请表,邮箱带过去。
    const code = error.code || error.error_code || "";
    if (code === "otp_disabled" || code === "signup_disabled" || /signups? not allowed/i.test(error.message || "")) {
      say(target, L.noIdentity, "err");
      openRequest(email);
      return;
    }
    if (error.status === 429 || /rate/i.test(error.message || "")) { say(target, L.rate, "err"); startCooldown(); return; }
    // 500 / 502:GoTrue 把 SMTP 的问题原样抛出来,对用户没有任何意义
    say(target, L.mailDown, "err");
    return;
  }
  pending = email;
  if (!fromResend) justApplied = false;    // 从第一步正常要码 = 老用户那条路,去下载
  elSentTo.textContent = email;            // ⛔ textContent,不是 innerHTML
  show("code");
  say(elState2, L.sent, "");
  startCooldown();
  elCode.value = "";
  elCode.focus();
}

let cooldown = 0, cooldownTimer = null;
function startCooldown() {
  cooldown = RESEND_SECONDS;
  elResend.disabled = true;
  elResend.textContent = L.resendIn(cooldown);
  clearInterval(cooldownTimer);
  cooldownTimer = setInterval(() => {
    cooldown -= 1;
    if (cooldown <= 0) {
      clearInterval(cooldownTimer);
      elResend.disabled = false;
      elResend.textContent = L.resendNow;
    } else {
      elResend.textContent = L.resendIn(cooldown);
    }
  }, 1000);
}

// ── ② 验码 ────────────────────────────────────────────────────────────────
async function verify() {
  if (busy || !sb) return;
  const token = elCode.value.replace(/\D/g, "");     // 粘进来的空格 / 短横线都清掉
  if (token.length < 6) { say(elState2, L.needCode, "err"); elCode.focus(); return; }
  busy = true; elVerify.disabled = true;
  say(elState2, L.verifying, "busy");
  let error = null, session = null;
  try {
    const r = await sb.auth.verifyOtp({ email: pending, token, type: "email" });
    error = r.error;
    session = (r.data && r.data.session) || null;
  } catch (e) {
    busy = false; elVerify.disabled = false;
    say(elState2, L.offline, "err");
    return;
  }
  busy = false; elVerify.disabled = false;
  if (error) {
    say(elState2, error.status === 429 ? L.rate : L.badCode, "err");
    elCode.select();
    return;
  }
  // MEMBER-BUILD:跳走之前问一次 /me,把会员摘要写进顶栏胶囊的缓存,落地的首页就能显示档位。
  //   最多等 1.5 秒,问不到照跳(胶囊退回「账户」,下次在会员页 / 试一试页补上)。
  if (session && window.MurmurMember) {
    await Promise.race([
      window.MurmurMember.refresh(session.access_token, (session.user && session.user.email) || pending),
      new Promise((r) => setTimeout(r, 1500)),
    ]);
  }
  location.href = afterLogin();
}

// ── ③ 申请名额 ────────────────────────────────────────────────────────────
function openRequest(prefill) {
  elReq.open = true;
  if (prefill) elReqEmail.value = prefill;
  elReq.scrollIntoView({ behavior: "smooth", block: "center" });
  (prefill ? elReqNote : elReqEmail).focus({ preventScroll: true });
}

async function submitRequest() {
  if (busy) return;
  const email = elReqEmail.value.trim();
  if (!email) { say(elReqState, L.needEmail, "err"); elReqEmail.focus(); return; }
  if (!EMAIL_RE.test(email)) { say(elReqState, L.badEmail, "err"); elReqEmail.focus(); return; }
  if (TURNSTILE_SITEKEY && !tsToken) { say(elReqState, L.needCaptcha, "err"); return; }

  busy = true; elReqSend.disabled = true;
  say(elReqState, L.reqSending, "busy");
  let r, j;
  try {
    const body = { email, note: elReqNote.value.trim(), lang: LANG };
    if (tsToken) body.turnstile = tsToken;
    r = await fetch(FN + "/access/request", {
      method: "POST",
      headers: { "content-type": "application/json", apikey: SUPA_KEY },
      body: JSON.stringify(body),
    });
    j = await r.json().catch(() => null);
  } catch (e) {
    busy = false; elReqSend.disabled = false;
    say(elReqState, L.offline, "err");
    return;
  }
  if (window.turnstile) { try { window.turnstile.reset(); } catch (e) { /* 没渲染过 */ } tsToken = ""; }
  busy = false; elReqSend.disabled = false;

  if (!r.ok || !j || !j.ok) {
    // 服务端的文案本来就是人话,优先用它
    const msg = (j && j.error && j.error.message) || (r.status === 429 ? L.reqTooMany : L.generic);
    say(elReqState, msg, "err");
    return;
  }
  // ⭐ 成功:服务端已经建好身份、发出了码。直接把人推到「填码」那一态,
  //    ⛔ 不让他回到第一步再点一次「发送 6 位码」(那会白等一封重复的信)。
  pending = email;
  justApplied = true;          // 验完码去试整理,不去下载(见 afterLogin)
  elSentTo.textContent = email;
  show("code");
  elReq.open = false;
  say(elReqState, "");
  say(elState2, j.mailed === false ? L.reqNoMail : (j.message || L.sent), j.mailed === false ? "err" : "");
  startCooldown();
  elCode.focus();
  cardCode.scrollIntoView({ behavior: "smooth", block: "center" });
}

// ── ④ 已经有名额的人不该再看见「还没有名额?申请一个」────────────────────
// 读的是 /me/lite(和 /try/ 同一个口径:它对没名额的人也回话,不像 /me 直接 403)。
// ⛔ 拿不到答案就照旧显示:少一次多余的申请,比让一个真的没名额的人找不到
//    入口便宜得多 —— 这个开关只许往「藏」的方向走一次,不许猜。
async function hideRequestIfSeated(token) {
  if (!token) return;
  try {
    const r = await fetch(FN + "/me/lite", {
      headers: { authorization: "Bearer " + token, apikey: SUPA_KEY },
    });
    if (!r.ok) return;
    const j = await r.json();
    if (j && j.seat) $("reqSection").hidden = true;
  } catch (e) { /* 查不到就照旧显示 */ }
}

// ── ⑤ 申请过的人看到的是申请的状态,不是又一张空表 ─────────────────────────
// GET /access/status → { status: "none" | "new" | "approved" | "declined", requested_at, handled_at }
//   new      → 表单收起,换成一行「申请已收到(日期)…」
//   declined → 表单收起,换成一行「这次没开名额」
//   approved → 整段藏起(和 seat:true 同一处理)
//   none     → 什么都不动,表单照旧
// ⛔ 请求失败 / 非 200 / 不认识的 status:什么都不改,表单照旧,也不报错。
//    和 ④ 同一条纪律:这里的每一步只许往「藏」的方向走,两个请求谁先回来都一样。
async function showRequestStatus(token) {
  if (!token) return;
  let j = null;
  try {
    const r = await fetch(FN + "/access/status", {
      headers: { authorization: "Bearer " + token, apikey: SUPA_KEY },
    });
    if (!r.ok) return;
    j = await r.json();
  } catch (e) { return; /* 查不到就照旧显示 */ }
  const st = j && j.status;
  if (st === "approved") { $("reqSection").hidden = true; return; }
  if (st !== "new" && st !== "declined") return;
  const el = $("reqStatus");
  el.textContent = st === "new" ? L.reqStatusNew(fmtDay(j.requested_at)) : L.reqStatusDeclined;   // ⛔ textContent
  el.hidden = false;
  elReq.open = false;
  elReq.hidden = true;
}

/// 「9月25日」/「September 25」。解析不了就回空串,调用方据此不写括号。
function fmtDay(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(LANG === "zh" ? "zh-CN" : "en", { month: "long", day: "numeric" }).format(d);
  } catch (e) { return ""; }
}

// ── ⑥ 从「申请名额」链接进来(#apply)→ 直接展开申请表(SITEFIX-6)──────────
// 站内所有申请入口都链 login/index.html#apply。已登录且有名额的人整段是藏着的,不去碰它;
// 同一页里再点一次带 #apply 的链接也要生效,所以同时听 hashchange。
const wantsApply = () => location.hash === "#apply";
function openRequestIfAsked() {
  if (!wantsApply() || $("reqSection").hidden || elReq.hidden) return;
  openRequest();
}
window.addEventListener("hashchange", openRequestIfAsked);

// ── Turnstile(有 site key 才加载)────────────────────────────────────────
function mountTurnstile() {
  if (!TURNSTILE_SITEKEY) return;
  elTs.hidden = false;
  window.onMurmurTurnstile = () => {
    window.turnstile.render(elTs, {
      sitekey: TURNSTILE_SITEKEY, action: TURNSTILE_ACTION,
      callback: (t) => { tsToken = t; },
      "expired-callback": () => { tsToken = ""; },
    });
  };
  const s = document.createElement("script");
  s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onMurmurTurnstile&render=explicit";
  s.async = true; s.defer = true;
  document.head.appendChild(s);
}

// ── 接线 ──────────────────────────────────────────────────────────────────
elSend.addEventListener("click", () => {
  const email = elEmail.value.trim();
  if (!email) { say(elState, L.needEmail, "err"); elEmail.focus(); return; }
  if (!EMAIL_RE.test(email)) { say(elState, L.badEmail, "err"); elEmail.focus(); return; }
  sendCode(email, false);
});
elEmail.addEventListener("keydown", (e) => { if (e.key === "Enter") elSend.click(); });
elVerify.addEventListener("click", verify);
elCode.addEventListener("keydown", (e) => { if (e.key === "Enter") verify(); });
elCode.addEventListener("input", () => {
  const digits = elCode.value.replace(/\D/g, "").slice(0, 6);
  if (digits !== elCode.value) elCode.value = digits;    // 粘贴进来的空格/短横线当场清掉
  if (digits.length === 6) verify();                     // 填满就自己进,少按一下
});
elResend.addEventListener("click", () => { if (pending) sendCode(pending, true); });
elBack.addEventListener("click", () => {
  show("email");
  elEmail.value = pending;
  say(elState, "");
  elEmail.focus();
});
elReqSend.addEventListener("click", submitRequest);
elReqEmail.addEventListener("keydown", (e) => { if (e.key === "Enter") submitRequest(); });
$("signout").addEventListener("click", async () => {
  if (window.MurmurMember) window.MurmurMember.clear();
  if (sb) { try { await sb.auth.signOut(); } catch (e) { /* 本机清掉就行 */ } }
  location.href = "index.html";
});

(async function init() {
  mountTurnstile();
  try {
    const { createClient } = await import(SDK);
    sb = createClient(SUPA_URL, SUPA_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
    window.__murmurSb = sb;      // 顶栏的「退出」用它做真退出(v2-nav.js)
  } catch (e) {
    // CDN 拉不下来:登录这条路真的走不了,老实说一句,别让人对着一个死按钮点。
    say(elState, L.generic, "err");
    elSend.disabled = true;
    openRequestIfAsked();        // 申请表不靠 SDK(直接 fetch),登录走不了也照样能申请
    return;
  }
  const wantsLogout = new URLSearchParams(location.search).get("logout") === "1";
  if (wantsLogout) {
    if (window.MurmurMember) window.MurmurMember.clear();     // 会员摘要缓存跟着会话一起清
    try { await sb.auth.signOut(); } catch (e) { /* 本机清掉就行 */ }
    say(elState, L.loggedOut, "");
    show("email");
    elEmail.focus();
    return;
  }
  const { data } = await sb.auth.getSession();
  if (data && data.session) {
    $("meMail").textContent = data.session.user.email || "";   // ⛔ textContent
    $("goNext").setAttribute("href", safeNext());
    show("in");
    hideRequestIfSeated(data.session.access_token);            // 不 await:慢一拍也不挡这一页
    if (window.MurmurMember) window.MurmurMember.refresh(data.session.access_token, data.session.user.email || "");   // 同上:会员摘要进顶栏缓存
    showRequestStatus(data.session.access_token);              // 同上;两个都只会往「藏」走
    openRequestIfAsked();
    return;
  }
  show("email");
  if (wantsApply()) openRequestIfAsked(); else elEmail.focus();
})();
