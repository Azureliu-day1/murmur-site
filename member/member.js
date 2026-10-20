// ── 会员订阅页的前端(/member/ 与 /en/member/ 共用这一份;语言看 <html lang>)────────────
// 三种状态,一份渲染:
//   没登录     → 顶上一张「登录后开通」卡 + 两档卡片 + 常见问题
//   已登录·免费 → 顶上状态卡「你现在用的是免费档」:本周听写、长录音试用、离线识别
//   已登录·付费 → 顶上状态卡「你是 Pro / Max 会员」:到期日、下次扣费、本月长录音、管理 / 升级
//   已登录·开发者 / 认不出的档位 → 「已有权益」卡,两档按钮都是「已含在账号里」(SEC-FIX-A M1)
//   已登录·/me 还没问到 → 有缓存先画缓存;两档的「开通」按钮一律点不了(正在确认)
//   已登录·/me 没问到(超时、断网、5xx、401)→ 「暂时读不到你的会员状态」卡,「开通」按钮点不了
//     ⛔ 不当免费档:已付费的人在网络不稳时看到「开通 Pro」,点下去就是第二个订阅、扣两份钱。
// 数据从哪来:
//   · 价格与付款链接:本站 /pricing.json(结构 = 订阅契约里的 pricing 节)。⛔ 页面上不写价格数字。
//       价格是 null → 「即将推出」;有价格、没付款链接 → 价格照常显示、按钮「即将开放」点不了。
//   · 档位与用量:/me(经 v2-nav.js 的 MurmurMember.refresh,同一份口径写进顶栏胶囊的缓存)。
//       服务端回了 /me 但没有 plan 字段时按免费档显示;⛔ /me 根本没问到时不按免费档(见上)。
// 纪律:用户数据和配置里的字一律 textContent / setAttribute,⛔ 零 innerHTML;
//       链接只接受 https:,别的协议(javascript: 之类)一律当没配。
// 本地演示:在 127.0.0.1 上加 ?demo=free|pro|max|pro-year|out(v2-nav.js 写缓存),这一页照缓存渲染、不问 /me。
// 两个日期别混:me.period_end = 到期 / 下次扣费日;me.lec_resets = 长录音额度下次重置日(年付也按月切片)。
const SUPA_URL = "https://syebvkwemxwxkonvsyjd.supabase.co";
const SUPA_KEY = "sb_publishable_bBmuodbgO72q8CK_kacrSw_0o3cCsOd";  // 公开 key,不是密钥
const SDK = new URL("../vendor/supabase-js-2.116.0.mjs", import.meta.url).href;  // SEC-L5:自托管,相对本文件
const PRICING_URL = new URL("../pricing.json", import.meta.url).href;            // 本站静态文件
const SUPPORT = "support@day1aifitness.com";

const EN = /^en/i.test(document.documentElement.lang || "");
const NAMES = { pro: "Pro", max: "Max" };
const LEC_HOURS = { pro: 20, max: 60 };
const L = EN ? {
  titleOut: "Pro and Max, billed monthly or yearly",
  ledeOut: "Start on the free plan. When you dictate more, pick the plan that matches your usage.",
  titleFree: "You are on the free plan",
  ledeFree: "Upgrade to stop counting words.",
  titlePaid: (p) => `You are a ${p} member`,
  ledePaid: "Your plan renews automatically at the end of each period.",
  outText: "Sign in to see your plan, renewal date and usage.",
  outBtn: "Sign in to subscribe",
  outNoAcct: "No account yet?",
  outApply: "Request one",
  tagFree: "Free",
  month: "Monthly", year: "Yearly",
  leftWeek: (n) => `${n} words of dictation left this week`,
  freeBig: "Free plan",
  freeNote: "Pro and Max have no word limit on cloud dictation.",
  dictWeek: "Dictation this week",
  words: "words",
  resets: (d) => `Resets ${d}.`,
  weekly: "Resets every week.",
  trial: "Long recording trial",
  trialFresh: (m) => `Not used · up to ${m} min`,
  trialUsed: "Used",
  trialUnknown: (m) => `One try · up to ${m} min`,
  offline: "Offline recognition",
  unlimitedUse: "Unlimited",
  untilBig: (d) => `Until ${d}`,
  memberBig: (p) => `${p} member`,
  nextCharge: "Next charge",
  noRenew: "Ends, no renewal",
  cloud: "Cloud dictation",
  noWordLimit: "No word limit",
  lecPeriod: "Long recording this month",
  hours: "hours",
  manage: "Manage subscription",
  manageNote: "Opens your Stripe account page to change card, view invoices or cancel.",
  toMax: "Upgrade to Max",
  plansOut: "Choose a plan",
  plansFree: "Upgrade",
  plansPaid: "Plans",
  soon: "Coming soon",
  opening: "Opening soon",
  per: { month: "/ month", year: "/ year" },
  yearAlt: (y, m) => `${y} a year, about ${m} a month`,
  yearPer: (m) => `About ${m} a month`,
  buy: (n) => `Get ${n}`,
  current: "Current plan",
  toPro: "Switch to Pro",
  mine: "Your plan",
  noteOut: "Pay with the same email address you use to sign in to the app. Payments are handled by Stripe.",
  noteIn: "You are signed in, so the payment will be linked to this account. Payments are handled by Stripe.",
  changeMail: "Change plan",
  dev: "Developer account",
  otherPlan: "Active plan",
  titleDev: "This is a developer account",
  titleOther: "Your account already has a plan",
  ledeSpecial: "No need to subscribe here. Email us if you want to change it.",
  included: "Included",
  titleChecking: "Checking your plan",
  ledeChecking: "This takes a few seconds.",
  checkingText: "Loading your membership…",
  checking: "Checking your plan…",
  titleErr: "We couldn't load your plan",
  ledeErr: "Payment buttons stay off until we can confirm your plan.",
  errText: "We couldn't load your membership right now. Please refresh in a moment.",
  refresh: "Refresh",
  retryLater: "Refresh to continue",
} : {
  titleOut: "Pro 和 Max,按月或按年付",
  ledeOut: "免费档先用着。说得多了,再按用量选一档。",
  titleFree: "你现在用的是免费档",
  ledeFree: "说得多了,开通一档就不用数字数。",
  titlePaid: (p) => `你是 ${p} 会员`,
  ledePaid: "每期到期时自动续费。",
  outText: "登录后,这一页会显示你的档位、到期日和用量。",
  outBtn: "登录后开通",
  outNoAcct: "还没有账号?",
  outApply: "申请一个",
  tagFree: "免费",
  month: "月付", year: "年付",
  leftWeek: (n) => `本周还能听写 ${n} 字`,
  freeBig: "免费档",
  freeNote: "开通 Pro 或 Max,云端听写不限字数。",
  dictWeek: "本周听写",
  words: "字",
  resets: (d) => `${d}重置。`,
  weekly: "每周重置。",
  trial: "长录音试用",
  trialFresh: (m) => `还没用 · 最长 ${m} 分钟`,
  trialUsed: "已用完",
  trialUnknown: (m) => `试一次 · 最长 ${m} 分钟`,
  offline: "离线识别",
  unlimitedUse: "不限量",
  untilBig: (d) => `到 ${d}`,
  memberBig: (p) => `${p} 会员`,
  nextCharge: "下次扣费",
  noRenew: "到期后不再续费",
  cloud: "云端听写",
  noWordLimit: "不限字数",
  lecPeriod: "本月长录音",
  hours: "小时",
  manage: "管理订阅",
  manageNote: "管理订阅会打开 Stripe 账户页,可以换卡、看账单、取消。",
  toMax: "升级到 Max",
  plansOut: "选一档",
  plansFree: "开通一档",
  plansPaid: "方案",
  soon: "即将推出",
  opening: "即将开放",
  per: { month: "/ 月", year: "/ 年" },
  yearAlt: (y, m) => `年付 ${y},折合每月 ${m}`,
  yearPer: (m) => `折合每月 ${m}`,
  buy: (n) => `开通 ${n}`,
  current: "当前方案",
  toPro: "换到 Pro",
  mine: "你在用",
  noteOut: "付款邮箱请用你登录 App 的那个。付款由 Stripe 处理。",
  noteIn: "你已登录,付款会记到这个账号。付款由 Stripe 处理。",
  changeMail: "换档",
  dev: "开发者账号",
  otherPlan: "已有权益",
  titleDev: "这是开发者账号",
  titleOther: "你的账号已有权益",
  ledeSpecial: "不需要在这里开通。要调整,写信给我们。",
  included: "已含在账号里",
  titleChecking: "正在确认你的档位",
  ledeChecking: "几秒就好。",
  checkingText: "正在读取你的会员状态…",
  checking: "正在确认档位…",
  titleErr: "暂时读不到你的档位",
  ledeErr: "确认档位之前,付款按钮先不开放。",
  errText: "暂时读不到你的会员状态,稍后刷新。",
  refresh: "刷新",
  retryLater: "稍后刷新再开通",
};
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MM = window.MurmurMember || null;   // v2-nav.js 先于本模块执行(普通脚本在前,模块延后)

let pricing = {};          // pricing 节;读不到就是空对象 → 全部「即将推出」
let who = null;            // { id, email } 已登录才有(本地演示时 id 为空)
let me = null;             // 会员摘要(v2-nav.js 的 fromMe 形状);null = 没登录,或登录了但还没问到 / 没问到
// 这一次 /me 的状态:out(没登录)/ loading(问着)/ ok(问到了)/ error(没问到)/ demo(本机演示)
let state = "out";
let cycle = "month";

// ── 小工具 ──────────────────────────────────────────────────────────────
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;    // ⛔ textContent,不是 innerHTML
  return n;
}
function a(cls, text, href) { const n = el("a", cls, text); n.setAttribute("href", href); return n; }
const isPaid = (p) => p === "pro" || p === "max";
const isSpecial = (p) => p === "developer" || p === "other";      // 已有权益、但不是可买的档
function planName(p) { return NAMES[p] || (p === "developer" ? L.dev : L.otherPlan); }
/// 登录了、但这一次 /me 还没确认档位:⛔ 不放行付款链接
function unconfirmed() { return !!who && state !== "ok" && state !== "demo"; }
function finite(v) { return typeof v === "number" && Number.isFinite(v) ? v : null; }
function num(n) {
  const r = Math.round(n * 10) / 10;
  const [i, f] = String(r).split(".");
  return i.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (f ? "." + f : "");
}
function toDate(iso) { if (!iso) return null; const d = new Date(iso); return Number.isNaN(d.getTime()) ? null : d; }
function dLong(iso) {
  const d = toDate(iso); if (!d) return "";
  if (EN) return new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long", day: "numeric" }).format(d);
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}
function dShort(iso) {
  const d = toDate(iso); if (!d) return "";
  if (EN) return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric" }).format(d);
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}
function httpsUrl(v) {
  if (typeof v !== "string" || !v) return null;
  try { const u = new URL(v); return u.protocol === "https:" ? u : null; } catch { return null; }
}
function slot(plan, c) {
  const e = pricing && pricing[plan] && pricing[plan][c];
  return e && typeof e === "object" ? e : null;
}
function priceOf(plan, c) {
  const e = slot(plan, c);
  return e && typeof e.price_display === "string" && e.price_display.trim() ? e.price_display.trim() : null;
}
/// 「$130」→「$10.8」、「$276」→「$23」:年付折合每月,四舍五入到一位小数。认不出数字就不写(⛔ 不猜)。
function perMonth(yearPrice) {
  const m = /^(\D*)(\d+(?:\.\d+)?)(\D*)$/.exec(yearPrice || "");
  if (!m) return null;
  const v = Number(m[2]) / 12;
  const s = String(Math.round(v * 10) / 10);
  return m[1] + s + m[3];
}
function payHref(u) {
  const url = new URL(u.href);
  if (who && who.id) {
    url.searchParams.set("client_reference_id", who.id);
    if (who.email) url.searchParams.set("prefilled_email", who.email);
  }
  return url.href;
}
function portal() { return httpsUrl(pricing && pricing.portal_url); }
/// 登录页和本页同一层(/login/ ↔ /member/,/en/login/ ↔ /en/member/)。登录完回到这一页。
function loginHref(hash) {
  return "../login/index.html" + (hash ? hash : "?next=" + encodeURIComponent(location.pathname));
}
function mailHref(subject) {
  return `mailto:${SUPPORT}?subject=${encodeURIComponent(subject)}`;
}
function meter(label, used, limit, unit, note) {
  const box = el("div", "m-meter");
  const top = el("div", "m-meter-top");
  top.appendChild(el("span", "k", label));
  top.appendChild(el("span", "v mono", `${num(used)} / ${num(limit)} ${unit}`));
  const bar = el("div", "m-bar"), fill = el("i");
  fill.style.width = Math.max(0, Math.min(100, Math.round(used / limit * 100))) + "%";
  bar.appendChild(fill);
  box.appendChild(top); box.appendChild(bar);
  if (note) box.appendChild(el("p", "m-note", note));
  return box;
}
function kv(k, v) {
  const r = el("div", "m-kv");
  r.appendChild(el("span", "k", k));
  r.appendChild(el("span", "v", v));
  return r;
}

// ── 上半:状态卡 ────────────────────────────────────────────────────────
function cardOut() {
  const c = el("div", "m-out");
  c.appendChild(el("p", "", L.outText));
  const acts = el("div", "m-out-acts");
  acts.appendChild(a("btn btn-primary", L.outBtn, loginHref()));
  const p = el("p", "m-note");
  p.appendChild(document.createTextNode(L.outNoAcct + " "));
  p.appendChild(a("", L.outApply, loginHref("#apply")));
  acts.appendChild(p);
  c.appendChild(acts);
  return c;
}

function cardFree() {
  const c = el("div", "m-status");
  const l = el("div", "m-status-main");
  const h = el("div", "m-status-head");
  h.appendChild(el("span", "mm-tag", L.tagFree));
  l.appendChild(h);
  const d = me.dict || {};
  const known = finite(d.used) != null && finite(d.limit) != null;
  l.appendChild(el("p", "m-status-big", known ? L.leftWeek(num(Math.max(0, d.limit - d.used))) : L.freeBig));
  l.appendChild(el("p", "m-status-mail mono", me.email || (who && who.email) || ""));
  l.appendChild(el("p", "m-note", L.freeNote));
  const r = el("div", "m-status-side");
  const resetNote = dShort(d.resets) ? L.resets(dShort(d.resets)) : L.weekly;
  if (known) r.appendChild(meter(L.dictWeek, d.used, d.limit, L.words, resetNote));
  else {
    r.appendChild(kv(L.dictWeek, `${num(finite(d.limit) != null ? d.limit : 2000)} ${L.words}`));
    r.appendChild(el("p", "m-note", L.weekly));
  }
  const t = me.trial || { used: null, minutes: 3 };
  r.appendChild(kv(L.trial, t.used === true ? L.trialUsed : t.used === false ? L.trialFresh(t.minutes) : L.trialUnknown(t.minutes)));
  r.appendChild(kv(L.offline, L.unlimitedUse));
  c.appendChild(l); c.appendChild(r);
  return c;
}

function nextAmount() {
  return me && me.interval ? priceOf(me.plan, me.interval) : null;
}

function cardPaid() {
  const name = planName(me.plan);
  const c = el("div", "m-status on");
  const l = el("div", "m-status-main");
  const h = el("div", "m-status-head");
  h.appendChild(el("span", "mm-tag on", name));
  if (me.interval) h.appendChild(el("span", "mm-cycle", me.interval === "year" ? L.year : L.month));
  l.appendChild(h);
  l.appendChild(el("p", "m-status-big", dLong(me.period_end) ? L.untilBig(dLong(me.period_end)) : isSpecial(me.plan) ? name : L.memberBig(name)));
  l.appendChild(el("p", "m-status-mail mono", me.email || (who && who.email) || ""));
  const acts = el("div", "m-acts");
  const pu = isPaid(me.plan) ? portal() : null;     // 开发者 / 认不出的档位没有 Stripe 订阅可管
  if (pu) { const m = a("btn btn-quiet", L.manage, pu.href); m.rel = "noopener"; acts.appendChild(m); }
  if (me.plan === "pro") acts.appendChild(a("btn btn-primary", L.toMax, "#plans"));
  if (acts.childNodes.length) l.appendChild(acts);
  if (pu) l.appendChild(el("p", "m-note", L.manageNote));

  const r = el("div", "m-status-side");
  const amt = nextAmount();
  if (dShort(me.period_end)) r.appendChild(kv(L.nextCharge, me.cancel ? L.noRenew : dLong(me.period_end) + (amt ? " · " + amt : "")));
  if (me.plan === "other") {          // 认不出的档位:不替它说额度
    r.appendChild(kv(L.offline, L.unlimitedUse));
    c.appendChild(l); c.appendChild(r);
    return c;
  }
  r.appendChild(kv(L.cloud, L.noWordLimit));
  const lec = me.lec || {};
  const lim = finite(lec.limit_h) != null ? lec.limit_h : (lec.limit_h === null ? null : LEC_HOURS[me.plan]);
  // 旧缓存没有 lec_resets:月付时两个日期是同一天,照用到期日;年付不猜,不写重置日
  const lecEnd = me.lec_resets || (me.interval === "year" ? null : me.period_end);
  const note = dShort(lecEnd) ? L.resets(dShort(lecEnd)) : "";
  if (finite(lec.used_h) != null && lim) r.appendChild(meter(L.lecPeriod, lec.used_h, lim, L.hours, note));
  else r.appendChild(kv(L.lecPeriod, lim ? `${num(lim)} ${L.hours}` : L.unlimitedUse));
  r.appendChild(kv(L.offline, L.unlimitedUse));
  c.appendChild(l); c.appendChild(r);
  return c;
}

function cardNote(text, withRefresh) {
  const c = el("div", "m-out");
  c.appendChild(el("p", "", text));
  const acts = el("div", "m-out-acts");
  if (withRefresh) {
    const b = el("button", "btn btn-primary", L.refresh);
    b.type = "button";
    b.addEventListener("click", () => location.reload());
    acts.appendChild(b);
  }
  if (who && who.email) acts.appendChild(el("p", "m-note mono", who.email));
  if (acts.childNodes.length) c.appendChild(acts);
  return c;
}

function renderTop() {
  const title = document.getElementById("title"), lede = document.getElementById("lede");
  const top = document.getElementById("top");
  top.textContent = "";
  const pt = document.getElementById("plansTitle");
  if (!who || (!me && state !== "error" && state !== "loading")) {
    title.textContent = L.titleOut; lede.textContent = L.ledeOut;
    top.appendChild(cardOut()); pt.textContent = L.plansOut;
    return;
  }
  if (state === "error" || !me) {
    // 没问到 / 问着且没有缓存:⛔ 不画免费档
    const err = state === "error";
    title.textContent = err ? L.titleErr : L.titleChecking;
    lede.textContent = err ? L.ledeErr : L.ledeChecking;
    top.appendChild(cardNote(err ? L.errText : L.checkingText, err));
    pt.textContent = L.plansOut;
    return;
  }
  const paid = isPaid(me.plan), special = isSpecial(me.plan);
  title.textContent = paid ? L.titlePaid(NAMES[me.plan]) : special ? (me.plan === "developer" ? L.titleDev : L.titleOther) : L.titleFree;
  lede.textContent = paid ? L.ledePaid : special ? L.ledeSpecial : L.ledeFree;
  top.appendChild(paid || special ? cardPaid() : cardFree());
  pt.textContent = paid || special ? L.plansPaid : L.plansFree;
}

// ── 下半:两档卡片 ──────────────────────────────────────────────────────
function disable(btn, text) {
  btn.textContent = text;
  btn.removeAttribute("href");            // 没有 href 的 <a> 点了什么都不发生
  btn.setAttribute("aria-disabled", "true");
}
function renderPlans() {
  for (const k of ["pro", "max"]) {
    const card = document.querySelector(`.m-plan[data-plan="${k}"]`);
    if (!card) continue;
    const amount = card.querySelector(".amount"), per = card.querySelector(".per");
    const alt = card.querySelector(".alt"), btn = card.querySelector(".buy"), mine = card.querySelector(".m-mine");
    const e = slot(k, cycle);
    const price = priceOf(k, cycle);
    const link = e ? httpsUrl(e.payment_link_url) : null;
    if (price) {
      amount.textContent = price;
      amount.classList.remove("soon");
      const cur = typeof e.currency === "string" && e.currency ? e.currency.toUpperCase() + " " : "";
      per.textContent = cur + L.per[cycle];
      const yp = priceOf(k, "year"), pm = perMonth(yp);
      alt.textContent = !pm ? "" : cycle === "year" ? L.yearPer(pm) : L.yearAlt(yp, pm);
    } else {
      amount.textContent = L.soon;
      amount.classList.add("soon");
      per.textContent = "";
      alt.textContent = "";
    }
    btn.className = "btn btn-primary btn-block buy";
    btn.removeAttribute("aria-disabled");
    btn.removeAttribute("rel");
    mine.hidden = true;
    card.classList.remove("is-mine");
    const plan = me ? me.plan : null;
    if (plan === k) {
      mine.hidden = false; card.classList.add("is-mine");
      btn.className = "btn btn-quiet btn-block buy";
      disable(btn, L.current);
    } else if (isSpecial(plan)) {
      // 开发者 / 认不出的档位:已有权益,⛔ 不出付款链接(M1)
      btn.className = "btn btn-quiet btn-block buy";
      disable(btn, L.included);
    } else if (!price) {
      disable(btn, L.soon);
    } else if ((plan === "pro" || plan === "max") && (portal() || link)) {
      // ⚠️ 已经在付费的人换档:⛔ 不走付款链接(那会开第二个订阅、扣两份钱)。
      //    有 Stripe 账户页就去那里换;没配(但付款已开放)就写信给我们。两样都没有 = 下面「即将开放」。
      const pu = portal();
      btn.textContent = k === "max" ? L.toMax : L.toPro;
      if (pu) { btn.setAttribute("href", pu.href); btn.rel = "noopener"; }
      else btn.setAttribute("href", mailHref(`Murmur ${L.changeMail}: ${NAMES[plan]} → ${NAMES[k]}`));
    } else if (link && unconfirmed()) {
      // M1:登录了但档位还没确认(问着 / 没问到)→ ⛔ 不放行付款链接
      disable(btn, state === "error" ? L.retryLater : L.checking);
    } else if (!link || plan === "pro" || plan === "max") {
      disable(btn, L.opening);
    } else {
      btn.textContent = L.buy(NAMES[k]);
      btn.setAttribute("href", payHref(link));
    }
  }
  const note = document.getElementById("paynote");
  if (note) note.textContent = who ? L.noteIn : L.noteOut;
}

function renderFaq() {
  const pu = portal();
  if (!pu) return;
  document.getElementById("portalLink").setAttribute("href", pu.href);
  document.getElementById("cancelPortal").hidden = false;
  document.getElementById("cancelMail").hidden = true;
}

function renderAll() { renderTop(); renderPlans(); renderFaq(); }

function mountCycle() {
  const box = document.getElementById("cycle");
  if (!box) return;
  const btns = box.querySelectorAll("button[data-cycle]");
  btns.forEach((b) => b.addEventListener("click", () => {
    cycle = b.dataset.cycle === "year" ? "year" : "month";
    btns.forEach((x) => x.setAttribute("aria-pressed", x === b ? "true" : "false"));
    renderPlans();
  }));
  box.hidden = false;
}

// ── 数据 ────────────────────────────────────────────────────────────────
async function loadPricing() {
  try {
    const r = await fetch(PRICING_URL, { cache: "no-cache" });
    if (!r.ok) return;
    const data = await r.json();
    pricing = (data && typeof data.pricing === "object" && data.pricing) || data || {};
  } catch {
    pricing = {};   // 读不到:全部「即将推出」,⛔ 不猜一个价格
  }
}

/// 下次扣费金额与管理链接写回顶栏缓存:首页那枚胶囊读不到 /pricing.json(CSP connect-src 'none')。
function syncCache() {
  if (!MM || !me) return;
  const c = MM.read();
  if (!c) return;
  const amt = nextAmount(), pu = portal();
  const want = { amount: amt || null, portal: pu ? pu.href : null };
  if (c.amount === want.amount && c.portal === want.portal) return;
  c.amount = want.amount; c.portal = want.portal;
  MM.write(c);
}

async function loadSession() {
  try {
    const { createClient } = await import(SDK);
    const sb = createClient(SUPA_URL, SUPA_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
    window.__murmurSb = sb;      // 顶栏的「退出」用它做真退出(v2-nav.js)
    const { data } = await sb.auth.getSession();
    const s = data && data.session;
    const u = s && s.user;
    if (u && UUID_RE.test(u.id || "")) return { id: u.id, email: u.email || "", token: s.access_token };
  } catch { /* SDK 拉不下来就当没登录:链接照样能用,只是不预填 */ }
  return null;
}

async function init() {
  mountCycle();
  renderAll();
  const cached = MM ? MM.read() : null;
  if (MM && MM.local && cached && cached.demo) {
    // 本地演示:照缓存渲染,不问 /me
    who = { id: "", email: cached.email || "" };
    me = cached; state = "demo";
    await loadPricing();
    renderAll(); syncCache();
    return;
  }
  const [, s] = await Promise.all([loadPricing(), loadSession()]);
  if (!s) {
    if (MM) MM.clear();
    state = "out";
    renderAll();
    return;
  }
  who = { id: s.id, email: s.email };
  // 先画上一次问到的(同一个邮箱;没有就画「正在确认」),再问一次 /me。
  // ⛔ 问不到不按免费档(SEC-FIX-A M1):状态卡说「暂时读不到」,「开通」按钮点不了。
  me = cached && cached.email && cached.email.toLowerCase() === s.email.toLowerCase() ? cached : null;
  state = "loading";
  renderAll();
  const fresh = MM ? await MM.refresh(s.token, s.email) : null;
  if (fresh) { me = fresh; state = "ok"; } else { me = null; state = "error"; }
  renderAll(); syncCache();
}

init();
