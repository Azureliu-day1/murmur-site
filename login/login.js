import { TURNSTILE_SITEKEY } from "../turnstile-key.js";
// ── 登录页 ────────────────────────────────────────────────────────────────
// 一张卡三态:①填邮箱 → ②填 6 位码 → ③已经登录了。
//
// 四条纪律:
//  ① 页面上零处「注册」。OPEN-LOGIN(10-29,公测「填邮箱直接登录」):第一次来的邮箱发码时 GoTrue 回
//     「没有这个身份」,页面**自动**用同一个邮箱走申请(服务端那一步建身份 + 发码),直接进填码 ——
//     用户看到的始终是「填邮箱 → 收码 → 进来」。下面那张申请表只留给拿不到人机验证票的人兜底。
//  ② 一个失败对应一句人话,⛔ 不把状态码或者英文错误串摆给用户看。
//     需要认的机器码只有 NO_IDENTITY_CODES 那三个 —— 意思是「这个邮箱还没有身份」(按 code 判,⛔ 不匹配英文 message),
//     ⛔ 不许照字面说成「没有账号」(那是在告诉任何人「这个邮箱不是用户」)。
//  ③ 页面上只有 publishable key,⛔ 没有别的密钥。
//  ④ next 只接受站内的相对路径 —— 见 safeNext()。
// SEC-FIX-A L3:防嵌套(点击劫持)。meta CSP 里的 frame-ancestors 浏览器不认,GitHub Pages 又发不了响应头,只能在脚本里拦:
//   被嵌进 iframe 时先把整页藏起来(iframe 带 sandbox、不许跳顶层时也看不见、点不到),再试着把顶层换成本页。
if (window.top !== window.self) {
  document.documentElement.style.visibility = "hidden";
  try { window.top.location = window.self.location.href; } catch (e) { /* sandbox 不许跳:整页保持隐藏 */ }
}
const SUPA_URL = "https://syebvkwemxwxkonvsyjd.supabase.co";
const SUPA_KEY = "sb_publishable_bBmuodbgO72q8CK_kacrSw_0o3cCsOd";  // 公开 key,不是密钥
const FN       = SUPA_URL + "/functions/v1/murmur-web";
const SDK      = "../vendor/supabase-js-2.116.0.mjs"; // SEC-L5:自托管,版本写死(来源与 sha256 见 vendor/SOURCES.txt);相对本文件解析
const LANG     = "zh";
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
// ⬇️ Wei 在 Cloudflare 后台给「申请名额」建好 widget 之后,把 site key 填进 turnstile-key.js,
//    并把服务端的 WEB_ACCESS_TURNSTILE 打开。两边都开才生效 ——
//    ⛔ 只开服务端那一侧会让每一次申请都 403(页面根本没有回执可发)。
// TURNSTILE(10-21):site key 收到全站一处 —— turnstile-key.js(import 在文件顶上)。
// 本页 CSP 的 script-src / frame-src 已放行 https://challenges.cloudflare.com(Cloudflare 文档要求的就这两项;connect-src 只有 pre-clearance 才要)。
const TURNSTILE_ACTION  = "web-access";
// OPEN-LOGIN:发码回这三个 code = 「这个邮箱还没有身份」→ 自动走申请。⛔ 只按 code 判,不匹配英文 message。
const NO_IDENTITY_CODES = ["signup_disabled", "otp_disabled", "user_not_found"];
// 自动申请等人机验证票最多这么久;等不到就停在申请区,按钮可点,提示「点一下验证再提交」。
const AUTO_WAIT_MS = 15000;

const L = {
  needEmail:   "先把邮箱填上。",
  badEmail:    "这个邮箱格式不对,检查一下拼写。",
  sending:     "正在发码…",
  sent:        "码发出去了,去邮箱看看。",
  needCode:    "把邮箱里那 6 位数字填进来。",
  verifying:   "正在登录…",
  badCode:     "这个码不对或已过期。点「重新发送」再要一个。",
  rate:        "操作太频繁,等一分钟再试。",
  mailDown:    "邮件服务没回应,过一会儿再试。",
  offline:     "网络好像断了,连上后再试。",
  generic:     "这一步没成功,稍后再试。",
  autoApplying: "第一次用这个邮箱,正在帮你开通…",
  codeSentTo:  (e) => `已给 ${e} 发了 6 位码,去邮箱看看。`,
  resendIn:    (n) => `${n} 秒后可重发`,
  resendNow:   "重新发送",
  reqSending:  "正在提交…",
  reqNoMail:   "申请已收到,但码没发出去。点上面的「重新发送」再试。",
  reqTooMany:  "这个网络今天申请次数太多,过一小时再试。",
  loggedOut:   "已经退出了。",
  needCaptcha: "先过一下人机验证。",
  captchaWait:    "人机验证通过后就能提交。",
  captchaExpired: "验证过期了,再点一下验证框。",
  captchaFailed:  "验证没加载出来,刷新一下。",
  captchaNudge:   "点一下验证再提交。",
  // 申请状态(/access/status):日期拿不到就不写括号,⛔ 不写「(Invalid Date)」
  reqStatusNew:      (d) => d ? `申请已收到(${d}),名额开了会发信到这个邮箱。` : "申请已收到,名额开了会发信到这个邮箱。",
  reqStatusDeclined: "这次没开名额。",
};

const $ = (id) => document.getElementById(id);
const elEmail = $("email"), elSend = $("send"), elState = $("state");
const elCode = $("code"), elVerify = $("verify"), elState2 = $("state2");
const elSentTo = $("sentTo"), elResend = $("resend"), elBack = $("back");
const cardEmail = $("card-email"), cardCode = $("card-code"), cardIn = $("card-in"), cardOut = $("card-out");
const elReq = $("req"), elReqEmail = $("reqEmail"), elReqNote = $("reqNote");
const elReqSend = $("reqSend"), elReqState = $("reqState"), elTs = $("turnstile");

let sb = null;          // supabase 客户端(SDK 拉下来之后才有)
let pending = "";       // 正在等码的那个邮箱
let busy = false;
let tsToken = "";       // Turnstile 回执,一次一用
let reqBusy = false;    // 申请那一发在飞(和登录那几步的 busy 分开:按钮可不可点只看这两样)
let reqNudge = false;   // OPEN-LOGIN:自动申请等票超时 → 按钮放开可点(点了没票只提示「点一下验证再提交」)
let autoApplying = false;   // 自动申请在等票 / 在飞:同一时刻只走一趟
let tsWaiters = [];     // 等票的人(waitForToken);票到了逐个叫醒

// TURNSTILE(10-21):有 site key 时,没拿到票提交按钮就不可点 —— ⛔ 不靠「点了再说先过验证」兜,
//   也 ⛔ 不在验证没加载出来时静默放行(服务端开关开着时,不带票的申请一律 400)。
function syncReqSend() { elReqSend.disabled = reqBusy || (!!TURNSTILE_SITEKEY && !tsToken && !reqNudge); }
const TS_HINTS = () => [L.captchaWait, L.captchaExpired, L.captchaFailed, L.captchaNudge];

/// 等一张人机验证票,最多 ms 毫秒。没有 site key(本站没开验证)= 不用等。回 true = 拿到了。
function waitForToken(ms) {
  if (!TURNSTILE_SITEKEY || tsToken) return Promise.resolve(true);
  return new Promise((resolve) => {
    const done = (v) => { clearTimeout(timer); tsWaiters = tsWaiters.filter((f) => f !== done); resolve(v); };
    const timer = setTimeout(() => done(false), ms);
    tsWaiters.push(done);
  });
}
function gotToken(t) {
  tsToken = t;
  syncReqSend();
  tsWaiters.slice().forEach((f) => f(true));
}

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
  cardOut.hidden   = which !== "out";
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
    if (NO_IDENTITY_CODES.includes(code)) {
      // OPEN-LOGIN:第一次来的邮箱 → 自动用同一个邮箱申请(申请那一步服务端已经发码,⛔ 这里不再发)
      autoApply(email, target);
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

/// OPEN-LOGIN:发码回「没有身份」之后自动走申请。展开申请区、邮箱预填、等票(最多 AUTO_WAIT_MS);
/// 拿到票就自动提交,拿不到就停在申请区:按钮放开、提示「点一下验证再提交」。
async function autoApply(email, target) {
  if (autoApplying) return;
  autoApplying = true;
  say(target, L.autoApplying, "busy");
  openRequest(email);
  const got = await waitForToken(AUTO_WAIT_MS);
  say(target, "");
  if (!got) {
    autoApplying = false;
    reqNudge = true; syncReqSend();
    say(elReqState, L.captchaNudge, "err");
    return;
  }
  await submitRequest(true);
  autoApplying = false;
}

async function submitRequest(auto) {
  if (busy) return;
  const email = elReqEmail.value.trim();
  if (!email) { say(elReqState, L.needEmail, "err"); elReqEmail.focus(); return; }
  if (!EMAIL_RE.test(email)) { say(elReqState, L.badEmail, "err"); elReqEmail.focus(); return; }
  if (TURNSTILE_SITEKEY && !tsToken) { say(elReqState, reqNudge ? L.captchaNudge : L.needCaptcha, "err"); return; }

  busy = true; reqBusy = true; syncReqSend();
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
    busy = false; reqBusy = false; syncReqSend();
    say(elReqState, L.offline, "err");
    return;
  }
  if (window.turnstile) { try { window.turnstile.reset(); } catch (e) { /* 没渲染过 */ } tsToken = ""; }
  busy = false; reqBusy = false; syncReqSend();   // 票一次一用:reset 之后等新票,按钮先灰着

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
  // OPEN-LOGIN:自动申请那一趟说「已给 xx 发了 6 位码」(申请那一步已经发过码,⛔ 不再重复发)
  say(elState2, j.mailed === false ? L.reqNoMail : (auto === true ? L.codeSentTo(email) : (j.message || L.sent)), j.mailed === false ? "err" : "");
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
  syncReqSend();
  say(elReqState, L.captchaWait);
  let rendered = false;
  // 加载失败 / 渲染出错 / 15 秒还没渲染出来:说一句人话,按钮保持灰着(⛔ 不静默放行)
  const failed = () => { tsToken = ""; syncReqSend(); say(elReqState, L.captchaFailed, "err"); };
  const clearHint = () => { if (TS_HINTS().includes(elReqState.textContent)) say(elReqState, ""); };
  window.onMurmurTurnstile = () => {
    rendered = true;
    try {
      window.turnstile.render(elTs, {
        sitekey: TURNSTILE_SITEKEY, action: TURNSTILE_ACTION,
        callback: (t) => { gotToken(t); clearHint(); },
        "expired-callback": () => { tsToken = ""; syncReqSend(); say(elReqState, L.captchaExpired, "err"); },
        "timeout-callback": () => { tsToken = ""; syncReqSend(); say(elReqState, L.captchaExpired, "err"); },
        "error-callback": () => { failed(); },
      });
    } catch (e) { failed(); }
  };
  const s = document.createElement("script");
  s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onMurmurTurnstile&render=explicit";
  s.async = true; s.defer = true;
  s.onerror = failed;
  document.head.appendChild(s);
  setTimeout(() => { if (!rendered) failed(); }, 15000);
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
elReqSend.addEventListener("click", () => submitRequest(false));
elReqEmail.addEventListener("keydown", (e) => { if (e.key === "Enter") submitRequest(false); });
// SEC-FIX-A L2:退出一律只退这个浏览器(scope "local")。默认的 global 会把这个人所有设备的
//   refresh token 一起作废,Mac App 也得重新收码。
async function signOutHere() {
  if (window.MurmurMember) window.MurmurMember.clear();
  if (sb) { try { await sb.auth.signOut({ scope: "local" }); } catch (e) { /* 本机清掉就行 */ } }
}
$("signout").addEventListener("click", async () => {
  await signOutHere();
  location.href = "index.html";
});
// ?logout=1 只出确认卡,点了「确认退出」才退:这个链接谁都能发给别人(登出型 CSRF)。
$("confirmOut").addEventListener("click", async () => {
  await signOutHere();
  try { history.replaceState(null, "", location.pathname); } catch (e) { /* 老浏览器 */ }
  say(elState, L.loggedOut, "");
  show("email");
  elEmail.focus();
});
$("cancelOut").addEventListener("click", async () => {
  try { history.replaceState(null, "", location.pathname); } catch (e) { /* 老浏览器 */ }
  const { data } = sb ? await sb.auth.getSession() : { data: null };
  if (data && data.session) showSignedIn(data.session); else show("email");
});

function showSignedIn(session) {
  $("meMail").textContent = session.user.email || "";   // ⛔ textContent
  $("goNext").setAttribute("href", safeNext());
  show("in");
  hideRequestIfSeated(session.access_token);            // 不 await:慢一拍也不挡这一页
  if (window.MurmurMember) window.MurmurMember.refresh(session.access_token, session.user.email || "");   // 同上:会员摘要进顶栏缓存
  showRequestStatus(session.access_token);              // 同上;两个都只会往「藏」走
  openRequestIfAsked();
}

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
  const { data } = await sb.auth.getSession();
  if (wantsLogout) {
    // SEC-FIX-A L2:⛔ 不直接退。有会话 → 出确认卡;没会话 → 本来就是退出态,清掉摘要缓存就行
    if (data && data.session) {
      $("outMail").textContent = data.session.user.email || "";   // ⛔ textContent
      show("out");
      $("confirmOut").focus();
      return;
    }
    if (window.MurmurMember) window.MurmurMember.clear();
    say(elState, L.loggedOut, "");
    show("email");
    elEmail.focus();
    return;
  }
  if (data && data.session) {
    showSignedIn(data.session);
    return;
  }
  show("email");
  if (wantsApply()) openRequestIfAsked(); else elEmail.focus();
})();
