// ── 试一试页的前端 ────────────────────────────────────────────────────────
// 三条纪律:
//  ① 模型输出一律 textContent,⛔ 不碰 innerHTML —— 那段字是模型生成的,
//     而生成什么由用户写的话决定,等于把用户输入当 HTML 执行。
//  ② 页面上只有 publishable key(它本来就是公开的,门是服务端的 RLS 与鉴权),
//     ⛔ 没有别的密钥;提示词、模型、输出上限全在服务端,这里一个都看不到。
//  ③ 一个失败对应一句人话,⛔ 不把 HTTP 状态码摆给用户看。
//
// ⚠️ 这一整段和 try/index.html 里那段**逐行相同**,只有 L 与 LANG 不一样。
//    改逻辑时两边一起改(diff 一下就知道有没有漏)。本文件是 en 版。
const SUPA_URL = "https://syebvkwemxwxkonvsyjd.supabase.co";
const SUPA_KEY = "sb_publishable_bBmuodbgO72q8CK_kacrSw_0o3cCsOd";  // 公开 key,不是密钥
const FN       = SUPA_URL + "/functions/v1/murmur-web";
const SDK      = "../../vendor/supabase-js-2.116.0.mjs"; // SEC-L5:自托管,版本写死(来源与 sha256 见 vendor/SOURCES.txt);相对本文件解析
const LANG     = "en";
const MAXLEN   = 600;
// ⬇️ Wei 在 Cloudflare 后台建好 Turnstile widget 之后,把 site key 填这里。
//    空着 = 匿名那条路在页面上也是关的(服务端另有一道开关,两道都要开)。
const TURNSTILE_SITEKEY = "";

const L = {
  quotaLoading: "Checking your quota…",
  // ⛔ 有名额的人看到的不再是美元。站点别处对用户承诺的口径是「每周 2000 字」,
  //    顶上却冒出一句「还剩 $0.50」是第二套口径,而且把我们的成本摆到了他脸上。
  //    ① 还有额度 → 只说够不够用;② 真用完了 → 沿用 402 那句已经写好的人话;
  //    ③ 字段根本没回来(NaN)→ 按「还够用」说,服务端那一关会说实话。
  quotaAuth:    (micro) => (Number.isFinite(micro) && micro <= 0)
                             ? L.byStatus[402]
                             : "Free quota · plenty left this month",
  // 没名额的登录用户:小标的前半句读 /access/status(和登录页同一个状态);
  // 查不到时用 default,也就是这次改动之前的那句话。
  noSeatHead: {
    default:  "Signed in · seat not open yet",
    none:     "Signed in · no seat request yet",
    new:      "Request received · seat not open yet",
    declined: "Signed in · no seat this time",
  },
  quotaNoSeat:  (head, n) => `${head} · ${n} cleanups left today`,
  quotaNoSeatOut: (head) => `${head} · today's cleanups are used up`,
  // 下面那一行(#noseatNote)。none 是三段:前半 / 链接上的字 / 后半。
  noSeatNote: {
    default:  "Seats open one at a time. We email this address when yours opens.",
    none:     ["You have not asked for a seat yet. ", "Ask on the sign-in page", "."],
    new:      (d) => d ? `Request received (${d}). We will email this address when your seat opens.` : "Request received. We will email this address when your seat opens.",
    declined: "No seat this time.",
  },
  quotaBlocked: "This account is on hold · reply to any of our emails",
  quotaUnknown: "Cannot read your quota right now · cleanup still works",
  quotaTrial:   (n) => `Anonymous trial · ${n} left today · unlimited once you sign in`,
  quotaTrialOut:"Today's anonymous trial is used up · come back tomorrow, or sign in",
  quotaTrialOff:"Anonymous trial is off today · available once you sign in",
  // SITEFIX-1:匿名试用关着时,页头那句「不用下载,也不用注册」换成这句 + 申请入口(三段:前半 / 链接上的字 / 后半)。
  trialLineOff: ["Sign in to try it. No account yet? ", "Ask for a seat", "."],
  busy:         "Cleaning up…",
  cleanBusy:    "Cleaning up…",
  rawEmpty:     "Type a sentence above, or pick one of the samples.",
  cleanEmpty:   "The cleaned-up version will show up here.",
  needText:     "Type a sentence first.",
  tooLong:      (n) => `That is ${n} characters. The limit is ${MAXLEN} at a time, so try a shorter passage.`,
  needCaptcha:  "Clear the human check first.",
  // ⭐ 三段:前半 / 链接上的字 / 后半 —— 「sign in」是这句话里唯一的下一步。
  trialOff:     ["The anonymous trial is off right now. ", "Sign in", " to use it."],
  offline:      "The network seems to be down. Reconnect and try again.",
  byStatus: {
    401: "Your sign-in has expired. Refresh the page and try again.",
    402: "This month's free quota is used up. It resets next month, or you can write to us.",
    500: "Our server hit an error. Nothing was charged; try again shortly.",
    502: "The model did not return a result. Nothing was charged; try again shortly.",
    503: "Too many requests right now. Try again in a moment.",
    504: "The model timed out. Nothing was charged; try again shortly.",
  },
  done: (sec) => `${sec}s`,
};

const $ = (id) => document.getElementById(id);
const elSrc = $("src"), elGo = $("go"), elState = $("state"), elCount = $("count");
const elQuota = $("quota"), elRaw = $("out-raw"), elClean = $("out-clean");
const elMetaRaw = $("meta-raw"), elMetaClean = $("meta-clean"), elTs = $("turnstile");

let token = null;               // 登录态的 access token(没有就是匿名)
let trial = { enabled: false, remaining: 0 };
let tsToken = "";               // Turnstile 回执,一次一用
let busy = false;
let access = null;              // /access/status 的回答;null = 没查过或没查到(→ default 文案)

const codepoints = (s) => Array.from(s).length;
function say(msg, kind) {       // 状态行:一次只出一个
  elState.textContent = msg || "";
  elState.className = "state" + (kind ? " " + kind : "");
}
/// 同一行状态,但中间那一段是一个真能点的链接(现在只有「登录」用它)。
/// ⛔ 仍然零 innerHTML(本页第①条纪律):三段自己建节点拼起来。
/// parts = [前半, 链接上的字, 后半]
function sayLinked(parts, href, kind) {
  elState.textContent = "";      // 先清空(连上一次留下的节点一起清掉)
  elState.className = "state" + (kind ? " " + kind : "");
  elState.appendChild(document.createTextNode(parts[0]));
  const a = document.createElement("a");
  a.href = href;
  a.textContent = parts[1];      // ⛔ textContent,不是 innerHTML
  elState.appendChild(a);
  elState.appendChild(document.createTextNode(parts[2]));
}
function setText(el, text, isPlaceholder) {
  el.textContent = text;        // ⛔ 永远不是 innerHTML
  el.classList.toggle("placeholder", !!isPlaceholder);
}

// ── 额度小标 ──────────────────────────────────────────────────────────────
// 读的是 murmur-web 自己的 /me/lite,⛔ 不是 murmur 那个函数的 /me:
// /me 挡在 authed() 后面,而 authed() 对**没名额的人**直接 403 —— 这一页恰好
// 要服务的就是那批刚申请完身份的人,从那条路上拿不到他们的任何信息。
async function loadQuota() {
  try {
    const r = await fetch(FN + "/me/lite", {
      headers: { authorization: "Bearer " + token, apikey: SUPA_KEY },
    });
    // ⛔ 登录态查不到就说「查不到」,不许回落到匿名那句「登录后可用」——
    //    对一个已经登录的人说这句话,是页面在撒谎(S1 冒烟时实拍到)。
    if (!r.ok) { elQuota.textContent = L.quotaUnknown; return; }
    const j = await r.json();
    if (j.seat) {
      elQuota.textContent = L.quotaAuth(Number(j.remaining_micro_usd));
      return;
    }
    if (j.status) {            // 有会员行但不是 active = 被停用,和「还没开名额」不是一回事
      elQuota.textContent = L.quotaBlocked;
      return;
    }
    access = await loadAccess();
    paintNoSeat(Number(j.noseat_remaining || 0));
  } catch { elQuota.textContent = L.quotaUnknown; }
}

/// 没名额的登录用户:小标 + 下面那一句「创始人会尽快」。
/// ⛔ 不把他推回匿名试用 —— 他已经登录了,匿名那条路对他只会更窄(而且现在关着)。
function paintNoSeat(n) {
  const st = access && access.status;
  const key = (st === "none" || st === "new" || st === "declined") ? st : "default";
  const head = L.noSeatHead[key];
  elQuota.textContent = n > 0 ? L.quotaNoSeat(head, n) : L.quotaNoSeatOut(head);
  const note = document.getElementById("noseatNote");
  if (!note) return;
  note.textContent = "";                                   // ⛔ 零 innerHTML:自己建节点
  if (key === "none") {
    const p = L.noSeatNote.none;
    note.appendChild(document.createTextNode(p[0]));
    const a = document.createElement("a");
    a.href = "../login/index.html#apply";   // SITEFIX-6:申请入口一律带 #apply,登录页据此直接展开申请表
    a.textContent = p[1];
    note.appendChild(a);
    note.appendChild(document.createTextNode(p[2]));
  } else if (key === "new") {
    note.textContent = L.noSeatNote.new(fmtDay(access.requested_at));
  } else {
    note.textContent = L.noSeatNote[key];
  }
  note.hidden = false;
}

/// 申请状态:和登录页读的是同一个 /access/status。
/// ⛔ 失败 / 非 200 / 不认识的 status → null,调用方回落到原来那句话,不报错。
async function loadAccess() {
  try {
    const r = await fetch(FN + "/access/status", {
      headers: { authorization: "Bearer " + token, apikey: SUPA_KEY },
    });
    if (!r.ok) return null;
    const j = await r.json();
    return (j && typeof j.status === "string") ? j : null;
  } catch { return null; }
}

/// 「9月25日」/「September 25」。解析不了就回空串,文案据此不写括号。
function fmtDay(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(LANG === "zh" ? "zh-CN" : "en", { month: "long", day: "numeric" }).format(d);
  } catch { return ""; }
}
async function loadTrial() {
  try {
    const r = await fetch(FN + "/trial/state", { headers: { apikey: SUPA_KEY } });
    const j = await r.json();
    trial = { enabled: !!j.enabled, remaining: Number(j.remaining_today || 0) };
  } catch { trial = { enabled: false, remaining: 0 }; }
  paintTrial();
}
// SITEFIX-1:匿名试用关着 → 页头那句(#trialLine)换成「登录后可以试」+ 申请入口;开着就不动(照旧)。
//   只在匿名那条路上调(paintTrial),登录了的人看到的还是原句。⛔ 不用 innerHTML。
function paintTrialLine() {
  const el = document.getElementById("trialLine");
  if (!el || trial.enabled) return;
  const p = L.trialLineOff;
  el.textContent = "";
  el.appendChild(document.createTextNode(p[0]));
  const a = document.createElement("a");
  a.href = "../login/index.html#apply";
  a.textContent = p[1];
  el.appendChild(a);
  el.appendChild(document.createTextNode(p[2]));
}
function paintTrial() {
  paintTrialLine();
  if (!trial.enabled) { elQuota.textContent = L.quotaTrialOff; return; }
  elQuota.textContent = trial.remaining > 0 ? L.quotaTrial(trial.remaining) : L.quotaTrialOut;
}

// ── Turnstile(有 site key 才加载)────────────────────────────────────────
function mountTurnstile() {
  if (!TURNSTILE_SITEKEY || token) return;     // 登录态不需要人机验证
  elTs.hidden = false;
  window.onMurmurTurnstile = () => {
    window.turnstile.render(elTs, {
      sitekey: TURNSTILE_SITEKEY, action: "web-trial",
      callback: (t) => { tsToken = t; },
      "expired-callback": () => { tsToken = ""; },
    });
  };
  const s = document.createElement("script");
  s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onMurmurTurnstile&render=explicit";
  s.async = true; s.defer = true;
  document.head.appendChild(s);
}

// ── 整理 ──────────────────────────────────────────────────────────────────
async function polish() {
  if (busy) return;
  const text = elSrc.value.trim();
  if (!text) { say(L.needText, "err"); elSrc.focus(); return; }
  const n = codepoints(text);
  if (n > MAXLEN) { say(L.tooLong(n), "err"); return; }
  if (!token) {
    if (!trial.enabled) { sayLinked(L.trialOff, "../login/index.html", "err"); return; }
    if (TURNSTILE_SITEKEY && !tsToken) { say(L.needCaptcha, "err"); return; }
  }

  busy = true; elGo.disabled = true;
  setText(elRaw, text, false);
  elMetaRaw.textContent = n + " chars";
  setText(elClean, L.cleanBusy, true);
  elMetaClean.textContent = "";
  say(L.busy, "busy");
  const t0 = performance.now();

  const url = token ? FN + "/polish" : FN + "/polish/trial";
  const headers = { "content-type": "application/json", apikey: SUPA_KEY };
  if (token) headers.authorization = "Bearer " + token;
  const body = { text, lang: LANG };
  if (!token) body.turnstile = tsToken;

  let r, j;
  try {
    r = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    j = await r.json().catch(() => null);
  } catch {
    busy = false; elGo.disabled = false;
    setText(elClean, L.cleanEmpty, true);
    say(L.offline, "err");
    return;
  }
  // Turnstile 的回执一次一用 —— 无论成败都换一张
  if (window.turnstile) { try { window.turnstile.reset(); } catch { /* 没渲染过 */ } tsToken = ""; }

  busy = false; elGo.disabled = false;
  if (!r.ok || !j || !j.polished) {
    setText(elClean, L.cleanEmpty, true);
    // 服务端的文案本来就是人话,优先用它;没有再回落到按状态码的那张表
    say((j && j.error && j.error.message) || L.byStatus[r.status] || L.byStatus[500], "err");
    if (!token) await loadTrial();
    return;
  }
  setText(elClean, j.polished, false);
  elMetaClean.textContent = L.done(((performance.now() - t0) / 1000).toFixed(1));
  say("");
  if (token) {
    if (typeof j.remaining === "number") elQuota.textContent = L.quotaAuth(j.remaining);
    else if (j.seat === false) paintNoSeat(Number(j.noseat_remaining || 0));
  } else {
    trial.remaining = Number(j.remaining_today || 0);
    paintTrial();
  }
}

// ── 接线 ──────────────────────────────────────────────────────────────────
elSrc.addEventListener("input", () => {
  const n = codepoints(elSrc.value);
  elCount.textContent = n + " / " + MAXLEN;
  elCount.classList.toggle("over", n > MAXLEN);
});
elSrc.addEventListener("keydown", (e) => {
  // ⌘/Ctrl + Enter 提交 —— 光标在多行框里时 Enter 本来就该换行
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); polish(); }
});
document.querySelectorAll(".chip[data-ex]").forEach((b) => {
  b.addEventListener("click", () => {
    elSrc.value = b.dataset.ex;
    elSrc.dispatchEvent(new Event("input"));
    elSrc.focus();
    say("");
  });
});
elGo.addEventListener("click", polish);

(async function init() {
  elQuota.textContent = L.quotaLoading;
  setText(elRaw, L.rawEmpty, true);
  setText(elClean, L.cleanEmpty, true);
  try {
    const { createClient } = await import(SDK);
    const sb = createClient(SUPA_URL, SUPA_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
    const { data } = await sb.auth.getSession();
    token = (data && data.session && data.session.access_token) || null;
  } catch {
    token = null;   // CDN 拉不下来就当没登录:页面照样能用匿名那条路
  }
  if (token) await loadQuota(); else await loadTrial();
  mountTurnstile();
})();
