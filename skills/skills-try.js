import { TURNSTILE_SITEKEY } from "../turnstile-key.js";
// 技能页「试一句」(SEC-FIX-A L3:原来是页内内联 <script type="module">,搬出来是为了 CSP 去掉 script-src 'unsafe-inline')。
// 本文件和页面在同一目录,里面的相对路径(SDK)解析结果和内联时一样。
// ── 提示词技能页「试一句」的前端 ──────────────────────────────────────────────
// 额度小标、人机验证、错误态整段取自 try/index.html(同一个后端、同一套口径);
// 不同的只有:打的是 POST /skill,回包多了 skill / approach / attached / reason / text。
// 纪律同 try 页:① 模型输出一律 textContent,⛔ 不碰 innerHTML;② 页面上只有公开 key;
//              ③ 一个失败一句人话,⛔ 不把状态码摆给用户。
// SITE-SKILLS(10-18):页面只渲染「整理后的需求 + 技能标签 + 做法的一行概括」。
//   回包的 text ⛔ 不上屏;approach 只用条数 + 一行开头(新服务端回 { skill, steps, lead },旧服务端回数组,两种都认)。
// ⚠️ 这一整段和 en/skills/index.html 里那段逐行相同,只有 L 与 LANG 不一样。改逻辑两边一起改。
const SUPA_URL = "https://syebvkwemxwxkonvsyjd.supabase.co";
const SUPA_KEY = "sb_publishable_bBmuodbgO72q8CK_kacrSw_0o3cCsOd";  // 公开 key,不是密钥
const FN       = SUPA_URL + "/functions/v1/murmur-web";
const SDK      = "../vendor/supabase-js-2.116.0.mjs"; // SITEFIX-3:同 try 页自托管,版本写死(来源与 sha256 见 vendor/SOURCES.txt);相对本页解析
const LANG     = "zh";
const MAXLEN   = 600;
// ⬇️ 同 try 页:人机验证的 site key(turnstile-key.js)填好之前,匿名那条路在页面上也是关的。
// TURNSTILE(10-21):site key 收到全站一处 —— turnstile-key.js(import 在文件顶上)。
// 本页 CSP 的 script-src / frame-src 已放行 https://challenges.cloudflare.com(Cloudflare 文档要求的就这两项;connect-src 只有 pre-clearance 才要)。

const L = {
  quotaLoading: "正在查额度…",
  quotaAuth:    (micro) => (Number.isFinite(micro) && micro <= 0) ? L.byStatus[402] : "免费额度 · 本月还够用",
  noSeatHead: {
    default:  "登录了 · 名额还没开",
    none:     "登录了 · 还没申请名额",
    new:      "申请已收到 · 名额还没开",
    declined: "登录了 · 这次没开名额",
  },
  quotaNoSeat:  (head, n) => `${head} · 今天还能整理 ${n} 次`,
  quotaNoSeatOut: (head) => `${head} · 今天的次数用完了,明天再来`,
  noSeatNote: {
    default:  "名额一个一个开。开了会发信到你这个邮箱。",
    none:     ["还没申请名额。", "去登录页申请一个", "。"],
    new:      (d) => d ? `申请已收到(${d}),名额开了会发信到这个邮箱。` : "申请已收到,名额开了会发信到这个邮箱。",
    declined: "这次没开名额。",
  },
  quotaBlocked: "这个账号暂停使用 · 回复我们任意一封邮件",
  quotaUnknown: "额度暂时查不到 · 整理仍然能用",
  // SITE-SKILLS:/trial/state 的 enabled 是开关(不是按天),登录后没名额也有每天几次,所以不写「今天没开」「登录后不限」。
  quotaTrial:   (n) => `匿名试用 · 今天还能整理 ${n} 次`,
  quotaTrialOut:"今天的匿名试用用完了 · 登录后可以继续",
  quotaTrialOff:"匿名试用没开 · 登录后可用",
  // SITEFIX-1:匿名试用关着时,页头那句换成这句 + 申请入口(三段:前半 / 链接上的字 / 后半)。
  trialLineOff: ["登录后可以试。还没有账号也没关系,", "填邮箱就能登录", "。"],
  busy:         "整理中,顺带判断是哪种需求…",
  outBusy:      "整理中…",
  outEmpty:     "整理后的需求会出现在这里。",
  needText:     "先写一句话再点整理。",
  tooLong:      (n) => `这段有 ${n} 个字,一次最多 ${MAXLEN} 个。删短一点再试。`,
  needCaptcha:  "先过一下人机验证再点整理。",
  trialOff:     ["匿名试用现在关着。", "登录", "之后可以用。"],
  offline:      "网络好像断了,连上后再试。",
  byStatus: {
    401: "登录已过期,刷新页面再试。",
    402: "这个月的免费额度用完了。下个月会重置,也可以回信找我们。",
    500: "我们的服务器出错了。这次没扣额度,稍后再试。",
    502: "模型没有返回结果。这次没扣额度,稍后再试。",
    503: "现在请求太多,过一会儿再试。",
    504: "模型超时了。这次没扣额度,稍后再试。",
  },
  apLine:       (n, gist) => (n > 0 && gist) ? `附了 ${n} 条做法,第一条:${gist}` : "附了做法",
  apNote:       "在 App 里,做法会完整附在这段末尾。",
  notAttached:  "这句太短,或你已说明了做法,App 只落整理后的需求。",
  judgeMissed:  "这次没判断出来,App 只落整理后的需求。",
  done: (sec) => `${sec}s`,
};

const $ = (id) => document.getElementById(id);
const elSrc = $("src"), elGo = $("go"), elState = $("state"), elCount = $("count");
const elQuota = $("quota"), elOut = $("out"), elMeta = $("meta"), elTs = $("turnstile");
const elResult = $("result"), elChip = $("skillChip"), elApLine = $("apLine"), elVerdict = $("verdict");

let token = null;
let trial = { enabled: false, remaining: 0 };
let tsToken = "";
let busy = false;
let access = null;

const codepoints = (s) => Array.from(s).length;
function say(msg, kind) {
  elState.textContent = msg || "";
  elState.className = "state" + (kind ? " " + kind : "");
}
function sayLinked(parts, href, kind) {
  elState.textContent = "";
  elState.className = "state" + (kind ? " " + kind : "");
  elState.appendChild(document.createTextNode(parts[0]));
  const a = document.createElement("a");
  a.href = href;
  a.textContent = parts[1];
  elState.appendChild(a);
  elState.appendChild(document.createTextNode(parts[2]));
}
function setText(el, text, isPlaceholder) {
  el.textContent = text;        // ⛔ 永远不是 innerHTML
  el.classList.toggle("placeholder", !!isPlaceholder);
}
// 回包里的 skill 是技能 id;名字从页面上的技能小标签读(只有名字)
function skillName(id) {
  const tag = id ? document.querySelector(`.sk-tags [data-skill="${CSS.escape(id)}"]`) : null;
  return tag ? tag.textContent : "";
}
// 做法的一行概括:只取第一条到第一个停顿处(最多 16 个字 / 8 个词),后面用省略号。⛔ 不显示其余各条。
function gistOf(step) {
  if (typeof step !== "string" || !step.trim()) return "";
  const s = step.trim();
  const cut = s.search(/[,,;;::。(]|\.\s/);
  const head = cut > 0 ? s.slice(0, cut) : s;
  const short = /[\u3400-\u9fff]/.test(head)
    ? Array.from(head).slice(0, 16).join("")
    : head.split(/\s+/).slice(0, 8).join(" ");
  return short + " …";
}
function clearResult(placeholder) {
  setText(elOut, placeholder, true);
  elResult.hidden = true; elChip.textContent = ""; elChip.hidden = false; elApLine.textContent = "";
  elVerdict.textContent = ""; elMeta.textContent = "";
}

// ── 额度小标(同 try 页)──────────────────────────────────────────────────
async function loadQuota() {
  try {
    const r = await fetch(FN + "/me/lite", { headers: { authorization: "Bearer " + token, apikey: SUPA_KEY } });
    if (!r.ok) { elQuota.textContent = L.quotaUnknown; return; }
    const j = await r.json();
    if (j.seat) { elQuota.textContent = L.quotaAuth(Number(j.remaining_micro_usd)); return; }
    if (j.status) { elQuota.textContent = L.quotaBlocked; return; }
    access = await loadAccess();
    paintNoSeat(Number(j.noseat_remaining || 0));
  } catch { elQuota.textContent = L.quotaUnknown; }
}
function paintNoSeat(n) {
  const st = access && access.status;
  const key = (st === "none" || st === "new" || st === "declined") ? st : "default";
  const head = L.noSeatHead[key];
  elQuota.textContent = n > 0 ? L.quotaNoSeat(head, n) : L.quotaNoSeatOut(head);
  const note = $("noseatNote");
  if (!note) return;
  note.textContent = "";
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
async function loadAccess() {
  try {
    const r = await fetch(FN + "/access/status", { headers: { authorization: "Bearer " + token, apikey: SUPA_KEY } });
    if (!r.ok) return null;
    const j = await r.json();
    return (j && typeof j.status === "string") ? j : null;
  } catch { return null; }
}
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

// ── 人机验证(同 try 页;action 也是 web-trial,服务端 /skill 的匿名那条路认的就是它)──
function mountTurnstile() {
  if (!TURNSTILE_SITEKEY || token || !trial.enabled) return;   // TURNSTILE(10-21):试整理关着就不挂验证框(开着那天自己出来)
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

// ── 整理 + 判定 ───────────────────────────────────────────────────────────
async function run() {
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
  clearResult(L.outBusy);
  say(L.busy, "busy");
  const t0 = performance.now();

  const headers = { "content-type": "application/json", apikey: SUPA_KEY };
  if (token) headers.authorization = "Bearer " + token;
  const body = { text, lang: LANG };
  if (!token) body.turnstile = tsToken;

  let r, j;
  try {
    r = await fetch(FN + "/skill", { method: "POST", headers, body: JSON.stringify(body) });
    j = await r.json().catch(() => null);
  } catch {
    busy = false; elGo.disabled = false;
    clearResult(L.outEmpty);
    say(L.offline, "err");
    return;
  }
  if (window.turnstile) { try { window.turnstile.reset(); } catch { /* 没渲染过 */ } tsToken = ""; }

  busy = false; elGo.disabled = false;
  if (!r.ok || !j || !j.polished) {
    clearResult(L.outEmpty);
    say((j && j.error && j.error.message) || L.byStatus[r.status] || L.byStatus[500], "err");
    if (!token) await loadTrial();
    return;
  }
  // 只上屏整理稿;做法只给技能名 + 条数 + 第一条的开头(回包的 text 含做法全文,⛔ 不用它)
  setText(elOut, j.polished, false);
  // approach 两种形状都认(10-18):新服务端回摘要对象 { skill, steps, lead },lead 已截好、截断时自带「…」,
  // 原样用、⛔ 不再补省略号;旧服务端回做法数组(网站可能比服务端先上线),照旧取条数 + 第一条开头。
  const ap = j.approach;
  let apCount = 0, apLead = "", apSkill = "";
  if (Array.isArray(ap)) {
    apCount = ap.length;
    apLead = gistOf(ap[0]);
  } else if (ap && typeof ap === "object") {
    apCount = Array.isArray(ap.steps) ? ap.steps.length : (Number(ap.steps) || 0);
    apLead = typeof ap.lead === "string" ? ap.lead.trim() : "";
    apSkill = typeof ap.skill === "string" ? ap.skill : "";
  }
  if (j.attached) {
    const sk = j.skill || apSkill;
    elChip.textContent = skillName(sk) || String(sk || "");
    elChip.hidden = !elChip.textContent;
    elApLine.textContent = L.apLine(apCount, apLead);
    elResult.hidden = false;
    elVerdict.textContent = L.apNote;
  } else {
    elVerdict.textContent = (j.reason === "judge_timeout" || j.reason === "judge_failed") ? L.judgeMissed : L.notAttached;
  }
  elMeta.textContent = L.done(((performance.now() - t0) / 1000).toFixed(1));
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
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); run(); }
});
document.querySelectorAll(".chip[data-ex]").forEach((b) => {
  b.addEventListener("click", () => {
    elSrc.value = b.dataset.ex;
    elSrc.dispatchEvent(new Event("input"));
    elSrc.focus();
    say("");
  });
});
elGo.addEventListener("click", run);

(async function init() {
  elQuota.textContent = L.quotaLoading;
  clearResult(L.outEmpty);
  try {
    const { createClient } = await import(SDK);
    const sb = createClient(SUPA_URL, SUPA_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
    const { data } = await sb.auth.getSession();
    token = (data && data.session && data.session.access_token) || null;
  } catch {
    token = null;
  }
  if (token) await loadQuota(); else await loadTrial();
  mountTurnstile();
})();
