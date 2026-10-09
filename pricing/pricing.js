// ── 价格页的前端(/pricing/ 与 /en/pricing/ 共用这一份;语言看 <html lang>)──────────────
// 只做三件事:
//  ① 读本站 /pricing.json(结构 = 订阅契约里的 pricing 节;将来换成 /config/public 的 pricing 节,
//     只改 PRICING_URL,读法 `data.pricing || data` 两种都认),把价格和付款链接填进 Pro / Max 两列。
//     ⛔ 页面上不写任何价格数字:某一格是 null(或读不到文件)就显示「即将推出」、按钮点不了。
//  ② 已登录(本机有 supabase 会话)时,付款链接拼上 client_reference_id=<uid>&prefilled_email=<邮箱>,
//     Stripe 那边就能把这笔钱认到这个人头上;未登录只给链接本身,并提示用登录 App 的邮箱付款。
//  ③ 后台配了 portal_url 时,「怎么取消」那条换成 Stripe 账户页的链接;没配就保留「写信给我们」。
// 纪律:用户数据和配置里的字一律 textContent / setAttribute,⛔ 零 innerHTML;
//       链接只接受 https:,别的协议(javascript: 之类)一律当没配。
const SUPA_URL = "https://syebvkwemxwxkonvsyjd.supabase.co";
const SUPA_KEY = "sb_publishable_bBmuodbgO72q8CK_kacrSw_0o3cCsOd";  // 公开 key,不是密钥
const SDK = new URL("../vendor/supabase-js-2.116.0.mjs", import.meta.url).href;  // SEC-L5:自托管,相对本文件
const PRICING_URL = new URL("../pricing.json", import.meta.url).href;            // 本站静态文件

const EN = /^en/i.test(document.documentElement.lang || "");
const L = EN ? {
  soon: "Coming soon",
  per: { month: "/ month", year: "/ year" },
  buy: (name) => `Get ${name}`,
  noteOut: "Pay with the email you use to sign in to the app.",
  noteIn: "You are signed in. The payment goes to this account.",
} : {
  soon: "即将推出",
  per: { month: "/ 月", year: "/ 年" },
  buy: (name) => `订阅 ${name}`,
  noteOut: "付款邮箱请用你登录 App 的那个。",
  noteIn: "你已登录,付款会记到这个账号。",
};
const NAMES = { pro: "Pro", max: "Max" };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let pricing = {};          // pricing 节;读不到就是空对象 → 全部「即将推出」
let who = null;            // { id, email } 已登录才有
let cycle = "month";

function httpsUrl(v) {
  if (typeof v !== "string" || !v) return null;
  try { const u = new URL(v); return u.protocol === "https:" ? u : null; } catch { return null; }
}
function slot(plan, c) {
  const e = pricing && pricing[plan] && pricing[plan][c];
  return e && typeof e === "object" ? e : null;
}
function payHref(u) {
  const url = new URL(u.href);
  if (who) {
    url.searchParams.set("client_reference_id", who.id);
    if (who.email) url.searchParams.set("prefilled_email", who.email);
  }
  return url.href;
}

function render() {
  for (const plan of ["pro", "max"]) {
    const card = document.querySelector(`.plan[data-plan="${plan}"]`);
    if (!card) continue;
    const amount = card.querySelector(".amount"), per = card.querySelector(".per"), btn = card.querySelector(".buy");
    const e = slot(plan, cycle);
    const price = e && typeof e.price_display === "string" && e.price_display.trim() ? e.price_display.trim() : null;
    const link = e ? httpsUrl(e.payment_link_url) : null;
    // 价格和链接要两样都有才算「能买」:只有价格没链接 = 按钮点不了,只有链接没价格 = 不让人盲付。
    if (price && link) {
      amount.textContent = price;
      amount.classList.remove("soon");
      const cur = typeof e.currency === "string" && e.currency ? e.currency.toUpperCase() + " " : "";
      const iv = e.interval === "year" || e.interval === "month" ? e.interval : cycle;
      per.textContent = cur + L.per[iv];
      btn.textContent = L.buy(NAMES[plan]);
      btn.setAttribute("href", payHref(link));
      btn.removeAttribute("aria-disabled");
    } else {
      amount.textContent = L.soon;
      amount.classList.add("soon");
      per.textContent = "";
      btn.textContent = L.soon;
      btn.removeAttribute("href");                 // 没有 href 的 <a> 点了什么都不发生
      btn.setAttribute("aria-disabled", "true");
    }
  }
  const note = document.getElementById("paynote");
  if (note) note.textContent = who ? L.noteIn : L.noteOut;
}

function renderPortal() {
  const u = httpsUrl(pricing && pricing.portal_url);
  if (!u) return;
  const link = document.getElementById("portalLink");
  link.setAttribute("href", u.href);
  document.getElementById("cancelPortal").hidden = false;
  document.getElementById("cancelMail").hidden = true;
}

function mountCycle() {
  const box = document.getElementById("cycle");
  if (!box) return;
  const btns = box.querySelectorAll("button[data-cycle]");
  btns.forEach((b) => b.addEventListener("click", () => {
    cycle = b.dataset.cycle === "year" ? "year" : "month";
    btns.forEach((x) => x.setAttribute("aria-pressed", x === b ? "true" : "false"));
    render();
  }));
  box.hidden = false;
}

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

async function loadSession() {
  try {
    const { createClient } = await import(SDK);
    const sb = createClient(SUPA_URL, SUPA_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
    window.__murmurSb = sb;      // 顶栏的「退出」用它做真退出(v2-nav.js)
    const { data } = await sb.auth.getSession();
    const u = data && data.session && data.session.user;
    if (u && UUID_RE.test(u.id || "")) who = { id: u.id, email: u.email || "" };
  } catch {
    who = null;     // SDK 拉不下来就当没登录:链接照样能用,只是不预填
  }
}

mountCycle();
render();
loadPricing().then(() => { render(); renderPortal(); });
loadSession().then(render);
